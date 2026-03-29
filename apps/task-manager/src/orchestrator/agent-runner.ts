import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, AgentRunStatus } from '@app/shared';
import { loadAgentConfig, invokeAgent } from '@app/agents';
import { writeTaskLog } from '../db/log-writer.js';
import { buildChatPrompt, buildTaskPrompt } from './prompt-builder.js';

function loadGeneralInstructions(db: Database.Database): string {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'general_agent_instructions'")
    .get() as { value: string } | undefined;
  return row?.value?.trim() || '';
}

function buildSystemPrompt(db: Database.Database, agentSystemPrompt: string): string {
  const general = loadGeneralInstructions(db);
  if (!general) return agentSystemPrompt;
  // General instructions prepended so they act as a universal baseline
  return `${general}\n\n---\n\n${agentSystemPrompt}`;
}

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

  setHandoffCallback(cb: HandoffCallback): void {
    this.onHandoff = cb;
  }

  /**
   * Run an agent for a given task.
   */
  async run(agentRole: string, taskId: string): Promise<{ success: boolean; output: string }> {
    const config = loadAgentConfig(this.db, agentRole);
    if (!config) {
      return { success: false, output: `Agent config not found for role: ${agentRole}` };
    }

    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown>;
    if (!task) {
      return { success: false, output: `Task not found: ${taskId}` };
    }

    const taskGuid = task['guid'] as string;
    const shouldLog = config.loggingEnabled !== false;

    const priorRuns = this.db.prepare(
      'SELECT * FROM agent_runs WHERE task_id = ? AND status = ? ORDER BY finished_at ASC'
    ).all(taskId, 'completed') as Array<Record<string, unknown>>;

    const prompt = buildTaskPrompt(this.db, config, task, priorRuns);

    const runId = uuid();
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO agent_runs (id, agent_role, task_id, status, prompt, created_at, started_at)
       VALUES (?, ?, ?, 'running', ?, ?, ?)`
    ).run(runId, agentRole, taskId, prompt, now, now);

    this.io.emit('agent:status', { role: agentRole, status: 'running', taskId });

    if (shouldLog) {
      writeTaskLog(this.db, this.io, {
        taskGuid, agentRole, action: 'Agent run started', status: 'info',
      });
    }

    const result = await invokeAgent({
      config: { ...config, systemPrompt: buildSystemPrompt(this.db, config.systemPrompt) },
      prompt,
      mcpContext: { agentRole },
      onStream: (chunk: string) => {
        this.io.emit('agent:streaming', { role: agentRole, taskId, chunk });
      },
      onStatusChange: (status: AgentRunStatus) => {
        this.io.emit('agent:status', { role: agentRole, status, taskId });
      },
    });

    const finishedAt = Date.now();
    const duration = finishedAt - now;
    this.db.prepare(
      `UPDATE agent_runs SET status = ?, result = ?, finished_at = ?, tokens_used = ? WHERE id = ?`
    ).run(
      result.success ? 'completed' : 'failed',
      result.output, finishedAt, result.tokensUsed || null, runId
    );

    if (shouldLog) {
      writeTaskLog(this.db, this.io, {
        taskGuid, agentRole,
        action: result.success ? 'Agent run completed' : 'Agent run failed',
        details: result.output.substring(0, 500),
        status: result.success ? 'success' : 'error',
        metadata: { tokensUsed: result.tokensUsed || null, durationMs: duration, runId },
      });
    }

    // Insert agent's output as a message — skip if agent already posted via send_message MCP tool
    const mcpPosted = (this.db.prepare(
      `SELECT COUNT(*) as count FROM messages WHERE sender_name = ? AND sender_type = 'agent' AND created_at >= ? AND created_at <= ?`
    ).get(agentRole, now, finishedAt) as { count: number }).count > 0;

    if (!mcpPosted) {
      const messageId = uuid();
      this.db.prepare(
        `INSERT INTO messages (id, sender_type, sender_name, content, task_id, created_at)
         VALUES (?, 'agent', ?, ?, ?, ?)`
      ).run(messageId, agentRole, result.output, taskId, finishedAt);

      this.io.emit('message:new', {
        message: {
          id: messageId,
          senderType: 'agent' as const,
          senderName: agentRole,
          content: result.output,
          taskId,
          threadId: null,
          inReplyTo: null,
          attachments: [],
          reactions: [],
          createdAt: finishedAt,
        },
      });
    }

    return result;
  }

  /**
   * Run an agent in response to a chat message.
   */
  async runForChat(
    agentRole: string,
    threadId: string | null,
    agentRoleChannel: string | null,
    handoffDepth = 0,
    isPrimary = true
  ): Promise<{ success: boolean; output: string }> {
    const config = loadAgentConfig(this.db, agentRole);
    if (!config) {
      return { success: false, output: `Agent config not found for role: ${agentRole}` };
    }

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

    const prompt = buildChatPrompt(this.db, config, {
      threadId, agentRole: agentRoleChannel, threadName, threadParticipants, isPrimary,
    });

    const runId = uuid();
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO agent_runs (id, agent_role, task_id, status, prompt, created_at, started_at)
       VALUES (?, ?, NULL, 'running', ?, ?, ?)`
    ).run(runId, agentRole, prompt, now, now);

    this.io.emit('agent:status', { role: agentRole, status: 'running' });

    const result = await invokeAgent({
      config: { ...config, systemPrompt: buildSystemPrompt(this.db, config.systemPrompt) },
      prompt,
      mcpContext: { agentRole, threadId, agentRoleChannel },
      onStream: (chunk: string) => {
        this.io.emit('agent:streaming', { role: agentRole, taskId: '', chunk });
      },
      onStatusChange: (status: AgentRunStatus) => {
        this.io.emit('agent:status', { role: agentRole, status });
      },
    });

    const finishedAt = Date.now();
    this.db.prepare(
      `UPDATE agent_runs SET status = ?, result = ?, finished_at = ?, tokens_used = ? WHERE id = ?`
    ).run(
      result.success ? 'completed' : 'failed',
      result.output, finishedAt, result.tokensUsed || null, runId
    );

    // Only post a message if the agent produced text output AND didn't already
    // post via the send_message MCP tool (which would cause a duplicate).
    const mcpPosted = (this.db.prepare(
      `SELECT COUNT(*) as count FROM messages WHERE sender_name = ? AND sender_type = 'agent' AND created_at >= ? AND created_at <= ?`
    ).get(agentRole, now, finishedAt) as { count: number }).count > 0;

    if (result.output.trim() && !mcpPosted) {
      const messageId = uuid();
      this.db.prepare(
        `INSERT INTO messages (id, sender_type, sender_name, content, thread_id, agent_role, created_at)
         VALUES (?, 'agent', ?, ?, ?, ?, ?)`
      ).run(messageId, agentRole, result.output, threadId || null, agentRoleChannel || null, finishedAt);

      this.io.emit('message:new', {
        message: {
          id: messageId,
          senderType: 'agent' as const,
          senderName: agentRole,
          content: result.output,
          taskId: null,
          threadId: threadId || null,
          inReplyTo: null,
          attachments: [],
          reactions: [],
          createdAt: finishedAt,
        },
      });
    }

    this.io.emit('agent:status', { role: agentRole, status: 'completed' });

    return result;
  }
}
