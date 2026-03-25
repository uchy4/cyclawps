import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { Message, CreateMessageInput } from '@agents-manager/shared';

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row['id'] as string,
    senderType: row['sender_type'] as Message['senderType'],
    senderName: row['sender_name'] as string,
    content: row['content'] as string,
    taskId: (row['task_id'] as string) || null,
    inReplyTo: (row['in_reply_to'] as string) || null,
    createdAt: row['created_at'] as number,
  };
}

export function registerMessageRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;
  const io = fastify.io;

  // List messages
  fastify.get('/api/messages', async (request) => {
    const { task_id, limit = '100', offset = '0' } = request.query as Record<string, string>;
    let sql = 'SELECT * FROM messages';
    const params: unknown[] = [];

    if (task_id) {
      sql += ' WHERE task_id = ?';
      params.push(task_id);
    }

    sql += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const rows = db.prepare(sql).all(...params);
    return rows.map((r) => rowToMessage(r as Record<string, unknown>));
  });

  // Create message
  fastify.post('/api/messages', async (request) => {
    const input = request.body as CreateMessageInput;
    const now = Date.now();
    const id = uuid();

    db.prepare(
      `INSERT INTO messages (id, sender_type, sender_name, content, task_id, in_reply_to, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.senderType, input.senderName, input.content, input.taskId || null, input.inReplyTo || null, now);

    const message = rowToMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown>);
    io?.emit('message:new', { message });
    return message;
  });
}
