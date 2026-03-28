import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, AgentRunStatus } from '@app/shared';
import { loadAgentConfig, invokeAgent } from '@app/agents';
import { writeTaskLog } from '../db/log-writer.js';
import { buildChatPrompt, buildTaskPrompt } from './prompt-builder.js';
import { parseDirectives, stripDirectives, executeDirectives } from './agent-directives.js';

// Callback for triggering handoffs via the dispatcher
export type HandoffCallback = (
  targetRole: string,
  threadId: string | null,
  agentRoleChannel: string | null,
  depth: number
) => void;

export class AgentRunner {
  private db: Database.Database;
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private onHandoff: HandoffCallback | null = null;

  constructor(
    db: Database.Database,
    io: Server<ClientToServerEvents, ServerToClientEvents>
  ) {
    this.db = db;
    this.io = io;
  }

  /**
   * Set the handoff callback (called by the dispatcher to wire itself in).
   */
  setHandoffCallback(cb: HandoffCallback): void {
    this.onHandoff = cb;
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

    // Build the prompt with task context + conversation history + directives
    const prompt = buildTaskPrompt(this.db, config, task, priorRuns);

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
      onStream: (chunk: string) => {
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

    // Process directives from agent output
    const directives = result.success ? parseDirectives(result.output) : null;
    const cleanOutput = directives ? stripDirectives(result.output) : result.output;

    if (directives) {
      executeDirectives(directives, {
        db: this.db,
        io: this.io,
        agentRole,
        onHandoff: this.onHandoff || undefined,
      });
    }

    // Insert agent's output as a message (clean, without directives)
    const messageId = uuid();
    this.db.prepare(
      `INSERT INTO messages (id, sender_type, sender_name, content, task_id, created_at)
       VALUES (?, 'agent', ?, ?, ?, ?)`
    ).run(messageId, agentRole, cleanOutput, taskId, finishedAt);

    this.io.emit('message:new', {
      message: {
        id: messageId,
        senderType: 'agent',
        senderName: agentRole,
        content: cleanOutput,
        taskId,
        inReplyTo: null,
        createdAt: finishedAt,
      },
    });

    return { ...result, output: cleanOutput };
  }

  /**
   * Run an agent in response to a chat message.
   * Builds prompt from conversation history rather than a single task.
   */
  async runForChat(
    agentRole: string,
    threadId: string | null,
    agentRoleChannel: string | null,
    handoffDepth = 0
  ): Promise<{ success: boolean; output: string }> {
    const config = loadAgentConfig(this.db, agentRole);
    if (!config) {
      return { success: false, output: `Agent config not found for role: ${agentRole}` };
    }

    // Load thread metadata if applicable
    let threadName: string | null = null;
    let threadParticipants: string[] = [];
    if (threadId) {
      const thread = this.db
        .prepare('SELECT name FROM threads WHERE id = ?')
        .get(threadId) as { name: string } | undefined;
      threadName = thread?.name || null;

      const participants = this.db
        .prepare('SELECT agent_role FROM thread_participants WHERE thread_id = ?')
        .all(threadId) as Array<{ agent_role: string }>;
      threadParticipants = participants.map((p) => p.agent_role);
    }

    // Build chat-context prompt
    const prompt = buildChatPrompt(this.db, config, {
      threadId,
      agentRole: agentRoleChannel,
      threadName,
      threadParticipants,
    });

    // Create agent_run record (no task_id for pure chat)
    const runId = uuid();
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO agent_runs (id, agent_role, task_id, status, prompt, created_at, started_at)
       VALUES (?, ?, NULL, 'running', ?, ?, ?)`
    ).run(runId, agentRole, prompt, now, now);

    // Emit status (no taskId for chat invocations)
    this.io.emit('agent:status', { role: agentRole, status: 'running' });

    // Invoke the agent
    const result = await invokeAgent({
      config,
      prompt,
      onStream: (chunk: string) => {
        this.io.emit('agent:streaming', { role: agentRole, taskId: '', chunk });
      },
      onStatusChange: (status: AgentRunStatus) => {
        this.io.emit('agent:status', { role: agentRole, status });
      },
    });

    // Update agent_run record
    const finishedAt = Date.now();
    this.db.prepare(
      `UPDATE agent_runs SET status = ?, result = ?, finished_at = ?, tokens_used = ? WHERE id = ?`
    ).run(
      result.success ? 'completed' : 'failed',
      result.output,
      finishedAt,
      result.tokensUsed || null,
      runId
    );

    // Process directives
    const directives = result.success ? parseDirectives(result.output) : null;
    const cleanOutput = directives ? stripDirectives(result.output) : result.output;

    if (directives) {
      executeDirectives(directives, {
        db: this.db,
        io: this.io,
        agentRole,
        threadId,
        agentRoleChannel,
        handoffDepth,
        onHandoff: this.onHandoff || undefined,
      });
    }

    // Insert agent's response as a message in the same context
    const messageId = uuid();
    this.db.prepare(
      `INSERT INTO messages (id, sender_type, sender_name, content, thread_id, agent_role, created_at)
       VALUES (?, 'agent', ?, ?, ?, ?, ?)`
    ).run(messageId, agentRole, cleanOutput, threadId || null, agentRoleChannel || null, finishedAt);

    this.io.emit('message:new', {
      message: {
        id: messageId,
        senderType: 'agent' as const,
        senderName: agentRole,
        content: cleanOutput,
        taskId: null,
        threadId: threadId || null,
        agentRole: agentRoleChannel || null,
        inReplyTo: null,
        attachments: [],
        reactions: [],
        createdAt: finishedAt,
      } as Record<string, unknown>,
    });

    // Emit completed status
    this.io.emit('agent:status', { role: agentRole, status: 'completed' });

    return { ...result, output: cleanOutput };
  }
}
