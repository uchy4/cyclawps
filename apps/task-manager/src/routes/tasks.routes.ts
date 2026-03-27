import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { Task, CreateTaskInput, UpdateTaskInput } from '@cyclawps/shared';
import { nextGuid } from '../db/guid.js';
import { writeTaskLog } from '../db/log-writer.js';

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

export function registerTaskRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;
  const io = fastify.io;

  // List tasks
  fastify.get('/api/tasks', async (request) => {
    const { status, assigned_agent } = request.query as Record<string, string>;
    let sql = 'SELECT * FROM tasks';
    const conditions: string[] = [];
    const params: string[] = [];

    if (status) { conditions.push('status = ?'); params.push(status); }
    if (assigned_agent) { conditions.push('assigned_agent = ?'); params.push(assigned_agent); }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY sort_order ASC, priority DESC, created_at DESC';

    const rows = db.prepare(sql).all(...params);
    return rows.map((r) => rowToTask(r as Record<string, unknown>));
  });

  // Get single task
  fastify.get('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!row) return reply.code(404).send({ error: 'Task not found' });
    return rowToTask(row as Record<string, unknown>);
  });

  // Get task by GUID
  fastify.get('/api/tasks/by-guid/:guid', async (request, reply) => {
    const { guid } = request.params as { guid: string };
    const row = db.prepare('SELECT * FROM tasks WHERE guid = ?').get(guid);
    if (!row) return reply.code(404).send({ error: 'Task not found' });
    return rowToTask(row as Record<string, unknown>);
  });

  // Create task
  fastify.post('/api/tasks', async (request) => {
    const input = request.body as CreateTaskInput;
    const now = Date.now();
    const id = uuid();
    const guid = nextGuid(db);

    db.prepare(
      `INSERT INTO tasks (id, guid, title, description, status, assigned_agent, parent_task_id, priority, sort_order, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      guid,
      input.title,
      input.description || '',
      input.status || 'todo',
      input.assignedAgent || null,
      input.parentTaskId || null,
      input.priority || 0,
      input.sortOrder || 0,
      JSON.stringify(input.metadata || {}),
      now,
      now
    );

    const task = rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>);
    io?.emit('task:created', { task });
    return task;
  });

  // Update task
  fastify.patch('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as UpdateTaskInput;
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Task not found' });

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title); }
    if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
    if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
    if (input.assignedAgent !== undefined) { fields.push('assigned_agent = ?'); values.push(input.assignedAgent); }
    if (input.pipelineStageId !== undefined) { fields.push('pipeline_stage_id = ?'); values.push(input.pipelineStageId); }
    if (input.priority !== undefined) { fields.push('priority = ?'); values.push(input.priority); }
    if (input.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(input.sortOrder); }
    if (input.metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(input.metadata)); }

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    // Log status changes
    const existingTask = rowToTask(existing as Record<string, unknown>);
    if (input.status !== undefined && input.status !== existingTask.status) {
      writeTaskLog(db, io, {
        taskGuid: existingTask.guid,
        action: `Status changed from \`${existingTask.status}\` to \`${input.status}\``,
        status: 'info',
      });
    }

    // Log agent assignment changes
    if (input.assignedAgent !== undefined && input.assignedAgent !== existingTask.assignedAgent) {
      writeTaskLog(db, io, {
        taskGuid: existingTask.guid,
        action: input.assignedAgent ? `Assigned to agent \`${input.assignedAgent}\`` : 'Agent unassigned',
        status: 'info',
      });
    }

    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const task = rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>);
    io?.emit('task:updated', { task });
    return task;
  });

  // Delete task
  fastify.delete('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    if (result.changes === 0) return reply.code(404).send({ error: 'Task not found' });

    io?.emit('task:deleted', { taskId: id });
    return { success: true };
  });
}
