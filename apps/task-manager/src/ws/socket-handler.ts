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
      const content = (data.content || '').trim();
      if (!content) return; // Ignore empty/whitespace-only messages
      const now = Date.now();
      const id = uuid();

      db.prepare(
        `INSERT INTO messages (id, sender_type, sender_name, content, task_id, thread_id, in_reply_to, attachments, agent_role, created_at)
         VALUES (?, 'user', 'user', ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, content, data.taskId || null, data.threadId || null, data.inReplyTo || null, JSON.stringify(data.attachments || []), data.agentRole || null, now);

      const attachments = data.attachments || [];

      const message = {
        id,
        senderType: 'user' as const,
        senderName: 'user',
        content,
        taskId: data.taskId || null,
        threadId: data.threadId || null,
        inReplyTo: data.inReplyTo || null,
        attachments,
        reactions: [] as Reaction[],
        createdAt: now,
      };

      io.emit('message:new', { message });
    });

    // Handle message deletes
    socket.on('message:delete', (data: { messageId: string }) => {
      if (!data.messageId) return;
      db.prepare('DELETE FROM reactions WHERE message_id = ?').run(data.messageId);
      db.prepare('DELETE FROM messages WHERE id = ? AND sender_type = ?').run(data.messageId, 'user');
      io.emit('message:deleted', { messageId: data.messageId });
    });

    // Handle message edits
    socket.on('message:edit', (data: { messageId: string; content: string }) => {
      const content = (data.content || '').trim();
      if (!content || !data.messageId) return;
      db.prepare('UPDATE messages SET content = ? WHERE id = ? AND sender_type = ?').run(content, data.messageId, 'user');
      io.emit('message:edited', { messageId: data.messageId, content });
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
