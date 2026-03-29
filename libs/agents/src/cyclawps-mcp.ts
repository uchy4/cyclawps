/**
 * Cyclawps MCP Server — gives agents tools to interact with chat, tasks, and agent config.
 * Created fresh per agent invocation with scoped context.
 */

import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, Task, LogStatus } from '@app/shared';

// Import SDK functions — dynamic import since the SDK may not be installed
let _createSdkMcpServer: typeof import('@anthropic-ai/claude-agent-sdk').createSdkMcpServer;
let _tool: typeof import('@anthropic-ai/claude-agent-sdk').tool;
let _z: typeof import('zod');

async function ensureImports() {
  if (!_createSdkMcpServer) {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    _createSdkMcpServer = sdk.createSdkMcpServer;
    _tool = sdk.tool;
    _z = await import('zod');
  }
}

export interface CyclawpsMcpContext {
  db: Database.Database;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  agentRole: string;
  threadId?: string | null;
  agentRoleChannel?: string | null;
  onHandoff?: (targetRole: string, threadId: string | null, agentRoleChannel: string | null, depth: number) => void;
  handoffDepth?: number;
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

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true as const };
}

/**
 * Creates an in-process MCP server with Cyclawps tools.
 * Must be called after SDK is loaded (async).
 */
export async function createCyclawpsMcp(ctx: CyclawpsMcpContext) {
  await ensureImports();
  const { db, io, agentRole } = ctx;
  const z = _z;

  return _createSdkMcpServer({
    name: 'cyclawps',
    tools: [
      // ─── Chat Tools ──────────────────────────────────────

      _tool(
        'send_message',
        'Send a message to a thread or agent channel. Use this to communicate with users or other agents.',
        {
          content: z.string().describe('The message content'),
          threadId: z.string().optional().describe('Thread ID to send to (omit for current context)'),
          agentRoleChannel: z.string().optional().describe('Agent role channel to send to (e.g., "developer")'),
        },
        async (args) => {
          const msgId = uuid();
          const now = Date.now();
          const threadId = args.threadId || ctx.threadId || null;
          const channel = args.agentRoleChannel || ctx.agentRoleChannel || null;

          db.prepare(
            `INSERT INTO messages (id, sender_type, sender_name, content, thread_id, agent_role, created_at)
             VALUES (?, 'agent', ?, ?, ?, ?, ?)`
          ).run(msgId, agentRole, args.content, threadId, channel, now);

          io.emit('message:new', {
            message: {
              id: msgId,
              senderType: 'agent' as const,
              senderName: agentRole,
              content: args.content,
              taskId: null,
              threadId,
              inReplyTo: null,
              attachments: [],
              reactions: [],
              createdAt: now,
            },
          });

          return ok(`Message sent (${msgId})`);
        }
      ),

      _tool(
        'react_to_message',
        'React to a message with an emoji.',
        {
          messageId: z.string().describe('ID of the message to react to'),
          emoji: z.string().describe('Emoji to react with (e.g., "👍", "🔥", "❤️")'),
        },
        async (args) => {
          const existing = db.prepare(
            `SELECT id FROM reactions WHERE message_id = ? AND emoji = ? AND reactor = ?`
          ).get(args.messageId, args.emoji, agentRole) as { id: string } | undefined;

          if (existing) {
            return ok('Already reacted with that emoji');
          }

          const id = uuid();
          const now = Date.now();
          db.prepare(
            `INSERT INTO reactions (id, message_id, emoji, reactor, created_at) VALUES (?, ?, ?, ?, ?)`
          ).run(id, args.messageId, args.emoji, agentRole, now);

          io.emit('message:reaction', {
            messageId: args.messageId,
            reaction: { id, emoji: args.emoji, reactor: agentRole, createdAt: now },
            action: 'add',
          });

          return ok(`Reacted with ${args.emoji}`);
        }
      ),

      _tool(
        'read_messages',
        'Read recent messages from a thread, agent channel, or global chat.',
        {
          threadId: z.string().optional().describe('Thread ID to read from'),
          agentRoleChannel: z.string().optional().describe('Agent role channel (e.g., "developer")'),
          limit: z.number().optional().describe('Max messages to return (default 20)'),
        },
        async (args) => {
          const limit = args.limit || 20;
          let rows;

          if (args.threadId) {
            rows = db.prepare(
              'SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?'
            ).all(args.threadId, limit);
          } else if (args.agentRoleChannel) {
            rows = db.prepare(
              'SELECT * FROM messages WHERE agent_role = ? ORDER BY created_at DESC LIMIT ?'
            ).all(args.agentRoleChannel, limit);
          } else {
            rows = db.prepare(
              'SELECT * FROM messages WHERE thread_id IS NULL AND agent_role IS NULL ORDER BY created_at DESC LIMIT ?'
            ).all(limit);
          }

          const messages = (rows as Array<Record<string, unknown>>).reverse().map((r) => ({
            id: r['id'],
            sender: `${r['sender_type']}:${r['sender_name']}`,
            content: (r['content'] as string).substring(0, 500),
            createdAt: r['created_at'],
          }));

          return ok(JSON.stringify(messages, null, 2));
        }
      ),

      // ─── Task Board Tools ────────────────────────────────

      _tool(
        'read_tasks',
        'List tasks from the kanban board, optionally filtered by status or assigned agent.',
        {
          status: z.string().optional().describe('Filter by status: todo, in_progress, done, blocked'),
          assignedAgent: z.string().optional().describe('Filter by assigned agent role'),
        },
        async (args) => {
          let sql = 'SELECT * FROM tasks';
          const conditions: string[] = [];
          const params: unknown[] = [];

          if (args.status) { conditions.push('status = ?'); params.push(args.status); }
          if (args.assignedAgent) { conditions.push('assigned_agent = ?'); params.push(args.assignedAgent); }
          if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
          sql += ' ORDER BY priority DESC, created_at DESC LIMIT 50';

          const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
          const tasks = rows.map((r) => ({
            guid: r['guid'],
            title: r['title'],
            status: r['status'],
            assignedAgent: r['assigned_agent'] || null,
            priority: r['priority'],
            description: (r['description'] as string)?.substring(0, 200),
          }));

          return ok(JSON.stringify(tasks, null, 2));
        }
      ),

      _tool(
        'update_task',
        'Update a task on the kanban board — change status, assignment, or priority.',
        {
          taskGuid: z.string().describe('Task GUID (e.g., "TASK-005")'),
          status: z.string().optional().describe('New status: todo, in_progress, done, blocked'),
          assignedAgent: z.string().optional().describe('Agent role to assign (or empty string to unassign)'),
          priority: z.number().optional().describe('Priority (0-10, higher is more important)'),
        },
        async (args) => {
          const row = db.prepare('SELECT * FROM tasks WHERE guid = ?').get(args.taskGuid) as Record<string, unknown> | undefined;
          if (!row) return err(`Task ${args.taskGuid} not found`);

          const fields: string[] = [];
          const values: unknown[] = [];

          if (args.status) { fields.push('status = ?'); values.push(args.status); }
          if (args.assignedAgent !== undefined) {
            fields.push('assigned_agent = ?');
            values.push(args.assignedAgent || null);
          }
          if (args.priority !== undefined) { fields.push('priority = ?'); values.push(args.priority); }

          if (fields.length === 0) return err('No fields to update');

          fields.push('updated_at = ?');
          values.push(Date.now());
          values.push(row['id'] as string);

          db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);

          const updated = rowToTask(
            db.prepare('SELECT * FROM tasks WHERE id = ?').get(row['id'] as string) as Record<string, unknown>
          );
          io.emit('task:updated', { task: updated });

          return ok(`Task ${args.taskGuid} updated`);
        }
      ),

      _tool(
        'create_task',
        'Create a new task on the kanban board.',
        {
          title: z.string().describe('Task title'),
          description: z.string().optional().describe('Task description'),
          assignedAgent: z.string().optional().describe('Agent role to assign'),
          priority: z.number().optional().describe('Priority (0-10)'),
          parentTaskGuid: z.string().optional().describe('Parent task GUID for subtasks'),
        },
        async (args) => {
          const id = uuid();
          const now = Date.now();

          // Generate next GUID
          const guidRow = db.prepare(
            "UPDATE guid_counter SET next_val = next_val + 1 WHERE prefix = 'TASK' RETURNING next_val - 1 AS val"
          ).get() as { val: number } | undefined;
          const guid = `TASK-${String(guidRow?.val || 1).padStart(3, '0')}`;

          let parentTaskId: string | null = null;
          if (args.parentTaskGuid) {
            const parent = db.prepare('SELECT id FROM tasks WHERE guid = ?').get(args.parentTaskGuid) as { id: string } | undefined;
            parentTaskId = parent?.id || null;
          }

          db.prepare(
            `INSERT INTO tasks (id, guid, title, description, status, assigned_agent, parent_task_id, priority, sort_order, metadata, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, 0, '{}', ?, ?)`
          ).run(id, guid, args.title, args.description || '', args.assignedAgent || null, parentTaskId, args.priority || 0, now, now);

          const task = rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>);
          io.emit('task:created', { task });

          return ok(`Created task ${guid}: "${args.title}"`);
        }
      ),

      _tool(
        'write_task_log',
        'Write a log entry for a task. Use this to record progress, decisions, or issues.',
        {
          taskGuid: z.string().describe('Task GUID (e.g., "TASK-005")'),
          action: z.string().describe('What happened (e.g., "Started implementation", "Found bug")'),
          details: z.string().optional().describe('Additional details'),
          status: z.string().optional().describe('Log level: info, success, error, warning (default: info)'),
        },
        async (args) => {
          const id = uuid();
          const now = Date.now();

          db.prepare(
            `INSERT INTO task_logs (id, task_guid, agent_role, action, details, status, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, ?, '{}', ?)`
          ).run(id, args.taskGuid, agentRole, args.action, args.details || '', args.status || 'info', now);

          const row = db.prepare('SELECT * FROM task_logs WHERE id = ?').get(id) as Record<string, unknown>;
          io.emit('task:log', {
            log: {
              id: row['id'] as string,
              taskGuid: row['task_guid'] as string,
              agentRole: (row['agent_role'] as string) || null,
              action: row['action'] as string,
              details: (row['details'] as string) || '',
              status: ((row['status'] as string) || 'info') as LogStatus,
              metadata: JSON.parse((row['metadata'] as string) || '{}'),
              createdAt: row['created_at'] as number,
            },
          });

          return ok(`Log written for ${args.taskGuid}`);
        }
      ),

      // ─── Agent Tools ─────────────────────────────────────

      _tool(
        'handoff_to_agent',
        'Hand off the current conversation to another agent. The target agent will be invoked with the conversation context.',
        {
          targetAgent: z.string().describe('Role of the agent to hand off to (e.g., "tester", "architect")'),
          reason: z.string().describe('Why you are handing off'),
        },
        async (args) => {
          // Post system message about the handoff
          const msgId = uuid();
          const now = Date.now();
          db.prepare(
            `INSERT INTO messages (id, sender_type, sender_name, content, thread_id, agent_role, created_at)
             VALUES (?, 'system', 'system', ?, ?, ?, ?)`
          ).run(msgId, `${agentRole} handed off to ${args.targetAgent}: ${args.reason}`, ctx.threadId || null, ctx.agentRoleChannel || null, now);

          io.emit('message:new', {
            message: {
              id: msgId,
              senderType: 'system' as const,
              senderName: 'system',
              content: `${agentRole} handed off to ${args.targetAgent}: ${args.reason}`,
              taskId: null,
              threadId: ctx.threadId || null,
              inReplyTo: null,
              attachments: [],
              reactions: [],
              createdAt: now,
            },
          });

          // Trigger the handoff
          if (ctx.onHandoff) {
            ctx.onHandoff(args.targetAgent, ctx.threadId || null, ctx.agentRoleChannel || null, (ctx.handoffDepth || 0) + 1);
          }

          return ok(`Handed off to ${args.targetAgent}`);
        }
      ),

      _tool(
        'read_agents',
        'List all available agents and their roles, descriptions, and capabilities.',
        {},
        async () => {
          const rows = db.prepare('SELECT role, name, display_name, description, model, tools FROM agent_configs ORDER BY name ASC').all() as Array<Record<string, unknown>>;
          const agents = rows.map((r) => ({
            role: r['role'],
            name: r['display_name'] || r['name'],
            description: r['description'],
            model: r['model'],
            tools: JSON.parse((r['tools'] as string) || '[]'),
          }));
          return ok(JSON.stringify(agents, null, 2));
        }
      ),
    ],
  });
}
