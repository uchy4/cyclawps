import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { Message, Reaction, Attachment } from '@cyclawps/shared';

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
  fastify.get('/api/messages', async (request) => {
    const { task_id, agent_role, limit = '100', offset = '0' } = request.query as Record<string, string>;
    let sql = 'SELECT * FROM messages';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (task_id) {
      conditions.push('task_id = ?');
      params.push(task_id);
    }

    if (agent_role) {
      conditions.push('agent_role = ?');
      params.push(agent_role);
    }

    // If neither task_id nor agent_role, show global chat (both null)
    if (!task_id && !agent_role) {
      conditions.push('task_id IS NULL');
      conditions.push('agent_role IS NULL');
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    const messageIds = rows.map(r => r['id'] as string);
    const reactionsMap = getReactionsForMessages(db, messageIds);

    return rows.map((r) => rowToMessage(r, reactionsMap.get(r['id'] as string) || []));
  });

  // Create message
  fastify.post('/api/messages', async (request) => {
    const input = request.body as { senderType: string; senderName: string; content: string; taskId?: string; inReplyTo?: string; attachments?: Attachment[] };
    const now = Date.now();
    const id = uuid();

    db.prepare(
      `INSERT INTO messages (id, sender_type, sender_name, content, task_id, in_reply_to, attachments, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.senderType, input.senderName, input.content, input.taskId || null, input.inReplyTo || null, JSON.stringify(input.attachments || []), now);

    const message = rowToMessage(
      db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown>
    );
    io?.emit('message:new', { message });
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
}
