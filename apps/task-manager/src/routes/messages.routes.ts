import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { Message, Reaction, Attachment } from '@app/shared';

function parseAttachments(raw: unknown): Attachment[] {
  if (!raw || raw === '[]') return [];
  try { return JSON.parse(raw as string); } catch { return []; }
}

function rowToMessage(row: Record<string, unknown>, reactions: Reaction[] = []): Message {
  return {
    id: row['id'] as string,
    senderType: row['sender_type'] as Message['senderType'],
    senderName: row['sender_name'] as string,
    content: row['content'] as string,
    taskId: (row['task_id'] as string) || null,
    threadId: (row['thread_id'] as string) || null,
    inReplyTo: (row['in_reply_to'] as string) || null,
    attachments: parseAttachments(row['attachments']),
    reactions,
    createdAt: row['created_at'] as number,
  };
}

function getReactionsForMessages(db: ReturnType<typeof import('better-sqlite3')>, messageIds: string[]): Map<string, Reaction[]> {
  const map = new Map<string, Reaction[]>();
  if (messageIds.length === 0) return map;

  const placeholders = messageIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM reactions WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`
  ).all(...messageIds) as Record<string, unknown>[];

  for (const row of rows) {
    const msgId = row['message_id'] as string;
    if (!map.has(msgId)) map.set(msgId, []);
    map.get(msgId)!.push({
      id: row['id'] as string,
      emoji: row['emoji'] as string,
      reactor: row['reactor'] as string,
      createdAt: row['created_at'] as number,
    });
  }
  return map;
}

export function registerMessageRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;
  const io = fastify.io;

  // List messages
  // Supports cursor-based pagination via `before` (message ID) for loading older messages.
  // Without `before`, returns the N most recent messages (newest-last).
  fastify.get('/api/messages', async (request) => {
    const { task_id, thread_id, agent_role, limit = '100', offset = '0', before } = request.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (thread_id) {
      conditions.push('thread_id = ?');
      params.push(thread_id);
    } else if (task_id) {
      conditions.push('task_id = ?');
      params.push(task_id);
    }

    if (agent_role) {
      conditions.push('agent_role = ?');
      params.push(agent_role);
    }

    // If no scoping params, show global chat (all nulls)
    if (!task_id && !thread_id && !agent_role) {
      conditions.push('task_id IS NULL');
      conditions.push('thread_id IS NULL');
      conditions.push('agent_role IS NULL');
    }

    const lim = parseInt(limit, 10);

    let rows: Record<string, unknown>[];

    if (before) {
      // Cursor pagination: get messages older than `before`, returned in ASC order
      const cursorRow = db.prepare('SELECT created_at FROM messages WHERE id = ?').get(before) as { created_at: number } | undefined;
      if (cursorRow) {
        conditions.push('created_at < ?');
        params.push(cursorRow.created_at);
      }
      const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
      // Fetch in DESC to get the N newest before the cursor, then reverse for ASC
      rows = db.prepare(
        `SELECT * FROM messages${where} ORDER BY created_at DESC LIMIT ?`
      ).all(...params, lim) as Record<string, unknown>[];
      rows.reverse();
    } else {
      // No cursor: return the most recent N messages (sub-select DESC, then flip to ASC)
      const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
      const off = parseInt(offset, 10);
      rows = db.prepare(
        `SELECT * FROM (SELECT * FROM messages${where} ORDER BY created_at DESC LIMIT ? OFFSET ?) sub ORDER BY created_at ASC`
      ).all(...params, lim, off) as Record<string, unknown>[];
    }

    const messageIds = rows.map(r => r['id'] as string);
    const reactionsMap = getReactionsForMessages(db, messageIds);

    const messages = rows.map((r) => rowToMessage(r, reactionsMap.get(r['id'] as string) || []));

    // When fetching by thread_id, return an envelope with thread context for agent consumption
    if (thread_id) {
      const threadRow = db.prepare('SELECT id, name FROM threads WHERE id = ?').get(thread_id) as { id: string; name: string } | undefined;
      const taggedTaskIds = (db.prepare(
        'SELECT task_id FROM thread_tasks WHERE thread_id = ?'
      ).all(thread_id) as { task_id: string }[]).map(r => r.task_id);
      const agentRoles = (db.prepare(
        'SELECT agent_role FROM thread_participants WHERE thread_id = ?'
      ).all(thread_id) as { agent_role: string }[]).map(r => r.agent_role);

      return {
        thread: {
          id: thread_id,
          name: threadRow?.name || null,
          taggedTaskIds,
          agentRoles,
        },
        messages,
      };
    }

    return messages;
  });

  // Create message
  fastify.post('/api/messages', async (request) => {
    const input = request.body as { senderType: string; senderName: string; content: string; taskId?: string; threadId?: string; agentRole?: string; inReplyTo?: string; attachments?: Attachment[] };
    const now = Date.now();
    const id = uuid();

    db.prepare(
      `INSERT INTO messages (id, sender_type, sender_name, content, task_id, thread_id, agent_role, in_reply_to, attachments, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.senderType, input.senderName, input.content, input.taskId || null, input.threadId || null, input.agentRole || null, input.inReplyTo || null, JSON.stringify(input.attachments || []), now);

    const message = rowToMessage(
      db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown>
    );
    io?.emit('message:new', { message });

    // Dispatch to agents if user message
    if (input.senderType === 'user' && (fastify as unknown as { dispatcher?: { onMessage: (m: unknown) => void } }).dispatcher) {
      (fastify as unknown as { dispatcher: { onMessage: (m: unknown) => void } }).dispatcher.onMessage({
        id,
        senderType: 'user',
        senderName: input.senderName,
        content: input.content,
        taskId: input.taskId || null,
        threadId: input.threadId || null,
        agentRole: input.agentRole || null,
      });
    }

    return message;
  });

  // Add reaction
  fastify.post('/api/messages/:messageId/reactions', async (request) => {
    const { messageId } = request.params as { messageId: string };
    const { emoji, reactor = 'user' } = request.body as { emoji: string; reactor?: string };
    const now = Date.now();
    const id = uuid();

    db.prepare(
      `INSERT INTO reactions (id, message_id, emoji, reactor, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(id, messageId, emoji, reactor, now);

    const reaction: Reaction = { id, emoji, reactor, createdAt: now };
    io?.emit('message:reaction', { messageId, reaction, action: 'add' });
    return reaction;
  });

  // Remove reaction
  fastify.delete('/api/messages/:messageId/reactions/:reactionId', async (request) => {
    const { messageId, reactionId } = request.params as { messageId: string; reactionId: string };
    const row = db.prepare('SELECT * FROM reactions WHERE id = ?').get(reactionId) as Record<string, unknown> | undefined;
    if (!row) return { error: 'Not found' };

    db.prepare('DELETE FROM reactions WHERE id = ?').run(reactionId);
    const reaction: Reaction = {
      id: reactionId,
      emoji: row['emoji'] as string,
      reactor: row['reactor'] as string,
      createdAt: row['created_at'] as number,
    };
    io?.emit('message:reaction', { messageId, reaction, action: 'remove' });
    return { ok: true };
  });

  // ─── Read Markers ────────────────────────────────────────

  // Get last-read marker for a scope
  fastify.get('/api/read-markers/:scopeKey', async (request) => {
    const { scopeKey } = request.params as { scopeKey: string };
    const row = db.prepare(
      'SELECT last_read_message_id, updated_at FROM read_markers WHERE scope_key = ?'
    ).get(scopeKey) as { last_read_message_id: string; updated_at: number } | undefined;

    if (!row) return { lastReadMessageId: null, updatedAt: null };
    return { lastReadMessageId: row.last_read_message_id, updatedAt: row.updated_at };
  });

  // Upsert last-read marker for a scope
  fastify.put('/api/read-markers/:scopeKey', async (request) => {
    const { scopeKey } = request.params as { scopeKey: string };
    const { lastReadMessageId } = request.body as { lastReadMessageId: string };
    const now = Date.now();

    db.prepare(
      `INSERT INTO read_markers (id, scope_key, last_read_message_id, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(scope_key) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at`
    ).run(uuid(), scopeKey, lastReadMessageId, now);

    return { lastReadMessageId, updatedAt: now };
  });
}
