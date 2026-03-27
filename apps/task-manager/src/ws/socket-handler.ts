import type { Server } from 'socket.io';
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { ServerToClientEvents, ClientToServerEvents, Reaction } from '@app/shared';

export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  db: Database.Database
): void {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Handle user messages (with reply + attachments support)
    socket.on('message:send', (data) => {
      const now = Date.now();
      const id = uuid();

      db.prepare(
        `INSERT INTO messages (id, sender_type, sender_name, content, task_id, in_reply_to, attachments, created_at)
         VALUES (?, 'user', 'user', ?, ?, ?, ?, ?)`
      ).run(id, data.content, data.taskId || null, data.inReplyTo || null, JSON.stringify(data.attachments || []), now);

      const attachments = data.attachments || [];

      const message = {
        id,
        senderType: 'user' as const,
        senderName: 'user',
        content: data.content,
        taskId: data.taskId || null,
        inReplyTo: data.inReplyTo || null,
        attachments,
        reactions: [] as Reaction[],
        createdAt: now,
      };

      io.emit('message:new', { message });
    });

    // Handle reactions
    socket.on('message:react', (data) => {
      const now = Date.now();

      // Check if user already reacted with this emoji — toggle off
      const existing = db.prepare(
        `SELECT id FROM reactions WHERE message_id = ? AND emoji = ? AND reactor = 'user'`
      ).get(data.messageId, data.emoji) as { id: string } | undefined;

      if (existing) {
        db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
        const reaction: Reaction = { id: existing.id, emoji: data.emoji, reactor: 'user', createdAt: now };
        io.emit('message:reaction', { messageId: data.messageId, reaction, action: 'remove' });
      } else {
        const id = uuid();
        db.prepare(
          `INSERT INTO reactions (id, message_id, emoji, reactor, created_at) VALUES (?, ?, ?, ?, ?)`
        ).run(id, data.messageId, data.emoji, 'user', now);
        const reaction: Reaction = { id, emoji: data.emoji, reactor: 'user', createdAt: now };
        io.emit('message:reaction', { messageId: data.messageId, reaction, action: 'add' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
