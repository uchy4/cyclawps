import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, AgentRunStatus } from '@app/shared';
import { loadAgentConfig, invokeAgent } from '@app/agents';
import { writeTaskLog } from '../db/log-writer.js';

export class AgentRunner {
  private db: Database.Database;
  private io: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    db: Database.Database,
    io: Server<ClientToServerEvents, ServerToClientEvents>
  ) {
    this.db = db;
    this.io = io;
  }

  /**
   * Run an agent for a given task.
   * Loads the agent config from DB, builds a prompt with task context,
   * invokes the agent, and records the run.
   */
  async run(agentRole: string, taskId: string): Promise<{ success: boolean; output: string }> {
    const config = loadAgentConfig(this.db, agentRole);
    if (!config) {
      return { success: false, output: `Agent config not found for role: ${agentRole}` };
    }

    // Load task details
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown>;
    if (!task) {
      return { success: false, output: `Task not found: ${taskId}` };
    }

    const taskGuid = task['guid'] as string;
    const shouldLog = config.loggingEnabled !== false;

    // Load previous agent run results for this task (context from prior stages)
    const priorRuns = this.db.prepare(
      'SELECT * FROM agent_runs WHERE task_id = ? AND status = ? ORDER BY finished_at ASC'
    ).all(taskId, 'completed') as Array<Record<string, unknown>>;

    // Build the prompt with task context
    const contextParts: string[] = [
      `## Task: ${task['title']}`,
      `**Description:** ${task['description'] || 'No description'}`,
      `**Status:** ${task['status']}`,
      `**Priority:** ${task['priority']}`,
    ];

    if (priorRuns.length > 0) {
      contextParts.push('\n## Previous Agent Outputs:');
      for (const run of priorRuns) {
        contextParts.push(`\n### ${run['agent_role']} output:`);
        contextParts.push(run['result'] as string || '(no output)');
      }
    }

    const prompt = contextParts.join('\n');

    // Create agent_run record
    const runId = uuid();
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO agent_runs (id, agent_role, task_id, status, prompt, created_at, started_at)
       VALUES (?, ?, ?, 'running', ?, ?, ?)`
    ).run(runId, agentRole, taskId, prompt, now, now);

    // Emit status
    this.io.emit('agent:status', { role: agentRole, status: 'running', taskId });

    // Log run start
    if (shouldLog) {
      writeTaskLog(this.db, this.io, {
        taskGuid,
        agentRole,
        action: 'Agent run started',
        status: 'info',
      });
    }

    // Invoke the agent
    const result = await invokeAgent({
      config,
      prompt,
      onStream: (chunk) => {
        this.io.emit('agent:streaming', { role: agentRole, taskId, chunk });
      },
      onStatusChange: (status: AgentRunStatus) => {
        this.io.emit('agent:status', { role: agentRole, status, taskId });
      },
    });

    // Update agent_run record
    const finishedAt = Date.now();
    const duration = finishedAt - now;
    this.db.prepare(
      `UPDATE agent_runs SET status = ?, result = ?, finished_at = ?, tokens_used = ? WHERE id = ?`
    ).run(
      result.success ? 'completed' : 'failed',
      result.output,
      finishedAt,
      result.tokensUsed || null,
      runId
    );

    // Log run result
    if (shouldLog) {
      writeTaskLog(this.db, this.io, {
        taskGuid,
        agentRole,
        action: result.success ? 'Agent run completed' : 'Agent run failed',
        details: result.output.substring(0, 500),
        status: result.success ? 'success' : 'error',
        metadata: { tokensUsed: result.tokensUsed || null, durationMs: duration, runId },
      });
    }

    // Insert agent's output as a message
    const messageId = uuid();
    this.db.prepare(
      `INSERT INTO messages (id, sender_type, sender_name, content, task_id, created_at)
       VALUES (?, 'agent', ?, ?, ?, ?)`
    ).run(messageId, agentRole, result.output, taskId, finishedAt);

    this.io.emit('message:new', {
      message: {
        id: messageId,
        senderType: 'agent',
        senderName: agentRole,
        content: result.output,
        taskId,
        inReplyTo: null,
        createdAt: finishedAt,
      },
    });

    return result;
  }
}
