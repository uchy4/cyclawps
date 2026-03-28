import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, Task } from '@app/shared';
import { writeTaskLog } from '../db/log-writer.js';
import { nextGuid } from '../db/guid.js';

export interface AgentDirectives {
  taskUpdates?: Array<{
    taskGuid: string;
    status?: 'todo' | 'in_progress' | 'done' | 'blocked';
    assignedAgent?: string | null;
  }>;
  logs?: Array<{
    taskGuid: string;
    action: string;
    details?: string;
    status?: 'info' | 'success' | 'error' | 'warning';
  }>;
  newTasks?: Array<{
    title: string;
    description?: string;
    parentTaskGuid?: string;
    assignedAgent?: string;
  }>;
  handoff?: {
    targetAgent: string;
    reason: string;
  };
}

const DIRECTIVE_PATTERN = /<!-- AGENT_DIRECTIVES\s*([\s\S]*?)-->/;

/**
 * Parses the AGENT_DIRECTIVES block from agent output.
 * Returns null if not found or invalid.
 */
export function parseDirectives(output: string): AgentDirectives | null {
  const match = DIRECTIVE_PATTERN.exec(output);
  if (!match) return null;

  try {
    const json = match[1].trim();
    const parsed = JSON.parse(json);

    // Basic shape validation
    if (typeof parsed !== 'object' || parsed === null) return null;

    return parsed as AgentDirectives;
  } catch {
    console.warn('Failed to parse agent directives:', match[1]);
    return null;
  }
}

/**
 * Strips the directive block from agent output so users see clean text.
 */
export function stripDirectives(output: string): string {
  return output.replace(DIRECTIVE_PATTERN, '').trim();
}

interface ExecuteContext {
  db: Database.Database;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  agentRole: string;
  threadId?: string | null;
  agentRoleChannel?: string | null;
  handoffDepth?: number;
  onHandoff?: (targetRole: string, threadId: string | null, agentRoleChannel: string | null, depth: number) => void;
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row['id'] as string,
    guid: row['guid'] as string,
    title: row['title'] as string,
    description: row['description'] as string,
    status: row['status'] as Task['status'],
    assignedAgent: (row['assigned_agent'] as string) || null,
    pipelineStageId: (row['pipeline_stage_id'] as string) || null,
    parentTaskId: (row['parent_task_id'] as string) || null,
    priority: row['priority'] as number,
    sortOrder: row['sort_order'] as number,
    metadata: JSON.parse((row['metadata'] as string) || '{}'),
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

/**
 * Executes parsed directives: updates tasks, writes logs, creates subtasks, triggers handoffs.
 */
export function executeDirectives(
  directives: AgentDirectives,
  ctx: ExecuteContext
): void {
  const { db, io, agentRole } = ctx;

  // Task updates
  if (directives.taskUpdates) {
    for (const update of directives.taskUpdates) {
      const task = db
        .prepare('SELECT * FROM tasks WHERE guid = ?')
        .get(update.taskGuid) as Record<string, unknown> | undefined;
      if (!task) {
        console.warn(`Directive: task ${update.taskGuid} not found, skipping`);
        continue;
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      if (update.status) {
        fields.push('status = ?');
        values.push(update.status);

        writeTaskLog(db, io, {
          taskGuid: update.taskGuid,
          agentRole,
          action: `Status changed to \`${update.status}\``,
          status: 'info',
        });
      }

      if (update.assignedAgent !== undefined) {
        fields.push('assigned_agent = ?');
        values.push(update.assignedAgent);

        writeTaskLog(db, io, {
          taskGuid: update.taskGuid,
          agentRole,
          action: update.assignedAgent
            ? `Assigned to \`${update.assignedAgent}\``
            : 'Agent unassigned',
          status: 'info',
        });
      }

      if (fields.length > 0) {
        fields.push('updated_at = ?');
        values.push(Date.now());
        values.push(task['id'] as string);

        db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(
          ...values
        );

        const updated = rowToTask(
          db
            .prepare('SELECT * FROM tasks WHERE id = ?')
            .get(task['id'] as string) as Record<string, unknown>
        );
        io.emit('task:updated', { task: updated });
      }
    }
  }

  // Logs
  if (directives.logs) {
    for (const log of directives.logs) {
      writeTaskLog(db, io, {
        taskGuid: log.taskGuid,
        agentRole,
        action: log.action,
        details: log.details,
        status: log.status || 'info',
      });
    }
  }

  // New tasks
  if (directives.newTasks) {
    for (const newTask of directives.newTasks) {
      const id = uuid();
      const guid = nextGuid(db);
      const now = Date.now();

      let parentTaskId: string | null = null;
      if (newTask.parentTaskGuid) {
        const parent = db
          .prepare('SELECT id FROM tasks WHERE guid = ?')
          .get(newTask.parentTaskGuid) as { id: string } | undefined;
        parentTaskId = parent?.id || null;
      }

      db.prepare(
        `INSERT INTO tasks (id, guid, title, description, status, assigned_agent, parent_task_id, priority, sort_order, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'todo', ?, ?, 0, 0, '{}', ?, ?)`
      ).run(
        id,
        guid,
        newTask.title,
        newTask.description || '',
        newTask.assignedAgent || null,
        parentTaskId,
        now,
        now
      );

      const task = rowToTask(
        db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>
      );
      io.emit('task:created', { task });

      writeTaskLog(db, io, {
        taskGuid: guid,
        agentRole,
        action: `Task created by ${agentRole}`,
        status: 'info',
      });
    }
  }

  // Handoff
  if (directives.handoff && ctx.onHandoff) {
    const { targetAgent, reason } = directives.handoff;
    const depth = (ctx.handoffDepth || 0) + 1;

    // Post system message about the handoff
    const messageId = uuid();
    const now = Date.now();
    db.prepare(
      `INSERT INTO messages (id, sender_type, sender_name, content, thread_id, agent_role, created_at)
       VALUES (?, 'system', 'system', ?, ?, ?, ?)`
    ).run(
      messageId,
      `${agentRole} handed off to ${targetAgent}: ${reason}`,
      ctx.threadId || null,
      ctx.agentRoleChannel || null,
      now
    );

    io.emit('message:new', {
      message: {
        id: messageId,
        senderType: 'system' as const,
        senderName: 'system',
        content: `${agentRole} handed off to ${targetAgent}: ${reason}`,
        taskId: null,
        threadId: ctx.threadId || null,
        inReplyTo: null,
        attachments: [],
        reactions: [],
        createdAt: now,
      },
    });

    ctx.onHandoff(targetAgent, ctx.threadId || null, ctx.agentRoleChannel || null, depth);
  }
}
