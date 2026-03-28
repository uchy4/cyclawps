import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';

interface ArchiveRow {
  id: string;
  agent_role: string;
  name: string;
  messages: string;
  created_at: number;
}

export function registerArchiveRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;

  // List archives for an agent
  fastify.get<{ Params: { agentRole: string } }>('/api/agent-archives/:agentRole', async (req) => {
    const rows = db.prepare(
      'SELECT id, agent_role, name, created_at FROM agent_chat_archives WHERE agent_role = ? ORDER BY created_at DESC'
    ).all(req.params.agentRole) as ArchiveRow[];

    return rows.map((r) => ({
      id: r.id,
      agentRole: r.agent_role,
      name: r.name,
      messageCount: JSON.parse(r.messages || '[]').length,
      createdAt: r.created_at,
    }));
  });

  // Create archive — snapshot current messages, delete originals
  fastify.post<{ Params: { agentRole: string }; Body: { name?: string } }>('/api/agent-archives/:agentRole', async (req) => {
    const { agentRole } = req.params;
    const name = (req.body as { name?: string })?.name || `Archive ${new Date().toLocaleDateString()}`;
    const now = Date.now();

    // Fetch all messages for this agent channel
    const messages = db.prepare(
      `SELECT id, sender_type, sender_name, content, task_id, thread_id, in_reply_to, attachments, agent_role, created_at
       FROM messages WHERE agent_role = ? AND thread_id IS NULL ORDER BY created_at ASC`
    ).all(agentRole);

    if (messages.length === 0) {
      return { error: 'No messages to archive' };
    }

    const archiveId = uuid();
    db.prepare(
      'INSERT INTO agent_chat_archives (id, agent_role, name, messages, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(archiveId, agentRole, name, JSON.stringify(messages), now);

    // Delete original messages and their reactions
    const messageIds = (messages as Array<{ id: string }>).map((m) => m.id);
    const placeholders = messageIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM reactions WHERE message_id IN (${placeholders})`).run(...messageIds);
    db.prepare(`DELETE FROM messages WHERE agent_role = ? AND thread_id IS NULL`).run(agentRole);

    return { id: archiveId, name, messageCount: messages.length, createdAt: now };
  });

  // Restore archive — re-insert messages, delete archive
  fastify.post<{ Params: { agentRole: string; archiveId: string } }>(
    '/api/agent-archives/:agentRole/:archiveId/restore',
    async (req) => {
      const { agentRole, archiveId } = req.params;

      const archive = db.prepare(
        'SELECT * FROM agent_chat_archives WHERE id = ? AND agent_role = ?'
      ).get(archiveId, agentRole) as ArchiveRow | undefined;

      if (!archive) {
        return { error: 'Archive not found' };
      }

      const messages = JSON.parse(archive.messages) as Array<Record<string, unknown>>;

      // First archive current messages if any exist
      const currentMessages = db.prepare(
        'SELECT * FROM messages WHERE agent_role = ? AND thread_id IS NULL'
      ).all(agentRole);

      if (currentMessages.length > 0) {
        const swapId = uuid();
        const swapName = `Auto-saved ${new Date().toLocaleDateString()}`;
        db.prepare(
          'INSERT INTO agent_chat_archives (id, agent_role, name, messages, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(swapId, agentRole, swapName, JSON.stringify(currentMessages), Date.now());

        const currentIds = (currentMessages as Array<{ id: string }>).map((m) => m.id);
        const ph = currentIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM reactions WHERE message_id IN (${ph})`).run(...currentIds);
        db.prepare('DELETE FROM messages WHERE agent_role = ? AND thread_id IS NULL').run(agentRole);
      }

      // Re-insert archived messages
      const insert = db.prepare(
        `INSERT INTO messages (id, sender_type, sender_name, content, task_id, thread_id, in_reply_to, attachments, agent_role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const msg of messages) {
        insert.run(
          msg.id, msg.sender_type, msg.sender_name, msg.content,
          msg.task_id || null, msg.thread_id || null, msg.in_reply_to || null,
          msg.attachments || '[]', msg.agent_role || null, msg.created_at
        );
      }

      // Delete the restored archive
      db.prepare('DELETE FROM agent_chat_archives WHERE id = ?').run(archiveId);

      return { restored: messages.length };
    }
  );

  // Delete archive permanently
  fastify.delete<{ Params: { agentRole: string; archiveId: string } }>(
    '/api/agent-archives/:agentRole/:archiveId',
    async (req) => {
      const { agentRole, archiveId } = req.params;
      db.prepare('DELETE FROM agent_chat_archives WHERE id = ? AND agent_role = ?').run(archiveId, agentRole);
      return { deleted: true };
    }
  );
}
