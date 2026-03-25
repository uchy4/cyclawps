import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { PipelineConfigRecord } from '@agents-manager/shared';

function rowToConfig(row: Record<string, unknown>): PipelineConfigRecord {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    configYaml: row['config_yaml'] as string,
    isActive: Boolean(row['is_active']),
    createdAt: row['created_at'] as number,
  };
}

export function registerPipelineRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;

  // Get active pipeline config
  fastify.get('/api/pipeline', async (_request, reply) => {
    const row = db.prepare('SELECT * FROM pipeline_configs WHERE is_active = 1').get();
    if (!row) return reply.code(404).send({ error: 'No active pipeline config' });
    return rowToConfig(row as Record<string, unknown>);
  });

  // Update/create pipeline config
  fastify.put('/api/pipeline', async (request) => {
    const { name, configYaml } = request.body as { name: string; configYaml: string };
    const now = Date.now();

    // Deactivate all existing
    db.prepare('UPDATE pipeline_configs SET is_active = 0').run();

    const id = uuid();
    db.prepare(
      `INSERT INTO pipeline_configs (id, name, config_yaml, is_active, created_at)
       VALUES (?, ?, ?, 1, ?)`
    ).run(id, name, configYaml, now);

    return rowToConfig(db.prepare('SELECT * FROM pipeline_configs WHERE id = ?').get(id) as Record<string, unknown>);
  });

  // Start pipeline for a task
  fastify.post('/api/pipeline/start', async (request, reply) => {
    const { taskId } = request.body as { taskId: string };
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    // TODO: Wire to pipeline engine in Phase 5
    return { message: 'Pipeline started', taskId };
  });

  // Authorize a pipeline gate
  fastify.post('/api/pipeline/authorize', async (request) => {
    const { taskId, stageId } = request.body as { taskId: string; stageId: string };
    // TODO: Wire to authorization module in Phase 5
    return { message: 'Authorization received', taskId, stageId };
  });
}
