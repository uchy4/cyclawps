import type { Server } from 'socket.io';
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { ServerToClientEvents, ClientToServerEvents } from '@agents-manager/shared';

export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  db: Database.Database
): void {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Handle user messages
    socket.on('message:send', (data) => {
      const now = Date.now();
      const id = uuid();

      db.prepare(
        `INSERT INTO messages (id, sender_type, sender_name, content, task_id, in_reply_to, created_at)
         VALUES (?, 'user', 'user', ?, ?, NULL, ?)`
      ).run(id, data.content, data.taskId || null, now);

      const message = {
        id,
        senderType: 'user' as const,
        senderName: 'user',
        content: data.content,
        taskId: data.taskId || null,
        inReplyTo: null,
        createdAt: now,
      };

      io.emit('message:new', { message });
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
