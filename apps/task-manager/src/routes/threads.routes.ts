import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { Thread, ThreadParticipant, ThreadTaskTag } from '@app/shared';

function buildThread(
  row: Record<string, unknown>,
  participants: ThreadParticipant[],
  taskTags: ThreadTaskTag[]
): Thread {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    participants,
    taskTags,
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

function getParticipantsForThreads(
  db: ReturnType<typeof import('better-sqlite3')>,
  threadIds: string[]
): Map<string, ThreadParticipant[]> {
  const map = new Map<string, ThreadParticipant[]>();
  if (threadIds.length === 0) return map;
  const placeholders = threadIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM thread_participants WHERE thread_id IN (${placeholders}) ORDER BY added_at ASC`)
    .all(...threadIds) as Record<string, unknown>[];
  for (const row of rows) {
    const tid = row['thread_id'] as string;
    if (!map.has(tid)) map.set(tid, []);
    map.get(tid)!.push({
      id: row['id'] as string,
      threadId: tid,
      agentRole: row['agent_role'] as string,
      addedAt: row['added_at'] as number,
    });
  }
  return map;
}

function getTaskTagsForThreads(
  db: ReturnType<typeof import('better-sqlite3')>,
  threadIds: string[]
): Map<string, ThreadTaskTag[]> {
  const map = new Map<string, ThreadTaskTag[]>();
  if (threadIds.length === 0) return map;
  const placeholders = threadIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT tt.*, t.guid as task_guid, t.title as task_title
       FROM thread_tasks tt JOIN tasks t ON t.id = tt.task_id
       WHERE tt.thread_id IN (${placeholders}) ORDER BY tt.tagged_at ASC`
    )
    .all(...threadIds) as Record<string, unknown>[];
  for (const row of rows) {
    const tid = row['thread_id'] as string;
    if (!map.has(tid)) map.set(tid, []);
    map.get(tid)!.push({
      id: row['id'] as string,
      threadId: tid,
      taskId: row['task_id'] as string,
      taskGuid: row['task_guid'] as string,
      taskTitle: row['task_title'] as string,
      taggedAt: row['tagged_at'] as number,
    });
  }
  return map;
}

export function registerThreadRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;
  const io = fastify.io;

  // List all threads
  fastify.get('/api/threads', async () => {
    const rows = db.prepare('SELECT * FROM threads ORDER BY updated_at DESC').all() as Record<string, unknown>[];
    const threadIds = rows.map((r) => r['id'] as string);
    const participantsMap = getParticipantsForThreads(db, threadIds);
    const taskTagsMap = getTaskTagsForThreads(db, threadIds);
    return rows.map((r) =>
      buildThread(r, participantsMap.get(r['id'] as string) || [], taskTagsMap.get(r['id'] as string) || [])
    );
  });

  // Get single thread
  fastify.get('/api/threads/:threadId', async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const row = db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId) as Record<string, unknown> | undefined;
    if (!row) return reply.code(404).send({ error: 'Thread not found' });
    const participants = getParticipantsForThreads(db, [threadId]).get(threadId) || [];
    const taskTags = getTaskTagsForThreads(db, [threadId]).get(threadId) || [];
    return buildThread(row, participants, taskTags);
  });

  // Create thread
  fastify.post('/api/threads', async (request) => {
    const { name, participantRoles, taskIds } = request.body as {
      name: string;
      participantRoles?: string[];
      taskIds?: string[];
    };
    const now = Date.now();
    const id = uuid();

    db.prepare('INSERT INTO threads (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name, now, now);

    const participants: ThreadParticipant[] = [];
    if (participantRoles?.length) {
      const insert = db.prepare('INSERT INTO thread_participants (id, thread_id, agent_role, added_at) VALUES (?, ?, ?, ?)');
      for (const role of participantRoles) {
        const pid = uuid();
        insert.run(pid, id, role, now);
        participants.push({ id: pid, threadId: id, agentRole: role, addedAt: now });
      }
    }

    const taskTags: ThreadTaskTag[] = [];
    if (taskIds?.length) {
      const insertTag = db.prepare('INSERT INTO thread_tasks (id, thread_id, task_id, tagged_at) VALUES (?, ?, ?, ?)');
      for (const taskId of taskIds) {
        const task = db.prepare('SELECT guid, title FROM tasks WHERE id = ?').get(taskId) as { guid: string; title: string } | undefined;
        if (!task) continue;
        const tid = uuid();
        insertTag.run(tid, id, taskId, now);
        taskTags.push({ id: tid, threadId: id, taskId, taskGuid: task.guid, taskTitle: task.title, taggedAt: now });
      }
    }

    const thread = buildThread({ id, name, created_at: now, updated_at: now }, participants, taskTags);
    io?.emit('thread:created', { thread });
    return thread;
  });

  // Update thread name
  fastify.patch('/api/threads/:threadId', async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const { name } = request.body as { name?: string };
    const now = Date.now();

    const existing = db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId) as Record<string, unknown> | undefined;
    if (!existing) return reply.code(404).send({ error: 'Thread not found' });

    if (name) {
      db.prepare('UPDATE threads SET name = ?, updated_at = ? WHERE id = ?').run(name, now, threadId);
    }

    const row = db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId) as Record<string, unknown>;
    const participants = getParticipantsForThreads(db, [threadId]).get(threadId) || [];
    const taskTags = getTaskTagsForThreads(db, [threadId]).get(threadId) || [];
    const thread = buildThread(row, participants, taskTags);
    io?.emit('thread:updated', { thread });
    return thread;
  });

  // Delete thread
  fastify.delete('/api/threads/:threadId', async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const existing = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);
    if (!existing) return reply.code(404).send({ error: 'Thread not found' });

    db.prepare('DELETE FROM threads WHERE id = ?').run(threadId);
    io?.emit('thread:deleted', { threadId });
    return { ok: true };
  });

  // Add participant
  fastify.post('/api/threads/:threadId/participants', async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const { agentRole } = request.body as { agentRole: string };
    const now = Date.now();

    const existing = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);
    if (!existing) return reply.code(404).send({ error: 'Thread not found' });

    const id = uuid();
    try {
      db.prepare('INSERT INTO thread_participants (id, thread_id, agent_role, added_at) VALUES (?, ?, ?, ?)').run(id, threadId, agentRole, now);
    } catch {
      return reply.code(409).send({ error: 'Participant already exists' });
    }

    db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(now, threadId);
    const participant: ThreadParticipant = { id, threadId, agentRole, addedAt: now };
    io?.emit('thread:participant_added', { threadId, participant });
    return participant;
  });

  // Remove participant
  fastify.delete('/api/threads/:threadId/participants/:agentRole', async (request, reply) => {
    const { threadId, agentRole } = request.params as { threadId: string; agentRole: string };
    const now = Date.now();

    const row = db.prepare('SELECT id FROM thread_participants WHERE thread_id = ? AND agent_role = ?').get(threadId, agentRole);
    if (!row) return reply.code(404).send({ error: 'Participant not found' });

    db.prepare('DELETE FROM thread_participants WHERE thread_id = ? AND agent_role = ?').run(threadId, agentRole);
    db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(now, threadId);
    io?.emit('thread:participant_removed', { threadId, agentRole });
    return { ok: true };
  });

  // Tag a task
  fastify.post('/api/threads/:threadId/tasks', async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const { taskId } = request.body as { taskId: string };
    const now = Date.now();

    const existing = db.prepare('SELECT id FROM threads WHERE id = ?').get(threadId);
    if (!existing) return reply.code(404).send({ error: 'Thread not found' });

    const task = db.prepare('SELECT guid, title FROM tasks WHERE id = ?').get(taskId) as { guid: string; title: string } | undefined;
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    const id = uuid();
    try {
      db.prepare('INSERT INTO thread_tasks (id, thread_id, task_id, tagged_at) VALUES (?, ?, ?, ?)').run(id, threadId, taskId, now);
    } catch {
      return reply.code(409).send({ error: 'Task already tagged' });
    }

    db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(now, threadId);
    const tag: ThreadTaskTag = { id, threadId, taskId, taskGuid: task.guid, taskTitle: task.title, taggedAt: now };
    io?.emit('thread:task_tagged', { threadId, tag });
    return tag;
  });

  // Untag a task
  fastify.delete('/api/threads/:threadId/tasks/:taskId', async (request, reply) => {
    const { threadId, taskId } = request.params as { threadId: string; taskId: string };
    const now = Date.now();

    const row = db.prepare('SELECT id FROM thread_tasks WHERE thread_id = ? AND task_id = ?').get(threadId, taskId);
    if (!row) return reply.code(404).send({ error: 'Tag not found' });

    db.prepare('DELETE FROM thread_tasks WHERE thread_id = ? AND task_id = ?').run(threadId, taskId);
    db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(now, threadId);
    io?.emit('thread:task_untagged', { threadId, taskId });
    return { ok: true };
  });
}
