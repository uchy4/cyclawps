import type { FastifyInstance } from 'fastify';
import { rowToTaskLog, writeTaskLog } from '../db/log-writer.js';

export function registerLogRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;

  // Write a log entry for a task (used by MCP agents)
  fastify.post('/api/tasks/:guid/logs', async (request) => {
    const { guid } = request.params as { guid: string };
    const body = request.body as {
      agentRole?: string;
      action: string;
      details?: string;
      status?: string;
    };

    const log = writeTaskLog(db, fastify.io, {
      taskGuid: guid,
      agentRole: body.agentRole,
      action: body.action,
      details: body.details,
      status: (body.status as 'info' | 'success' | 'error' | 'warning') || 'info',
    });

    return log;
  });

  // Get logs for a task by GUID
  fastify.get('/api/tasks/:guid/logs', async (request) => {
    const { guid } = request.params as { guid: string };
    const { search, limit, offset } = request.query as {
      search?: string;
      limit?: string;
      offset?: string;
    };

    const limitNum = Math.min(parseInt(limit || '50', 10) || 50, 200);
    const offsetNum = parseInt(offset || '0', 10) || 0;

    let sql = 'SELECT * FROM task_logs WHERE task_guid = ?';
    const params: unknown[] = [guid];

    if (search) {
      sql += ' AND (action LIKE ? OR details LIKE ?)';
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offsetNum);

    const rows = db.prepare(sql).all(...params);
    return rows.map((r) => rowToTaskLog(r as Record<string, unknown>));
  });
}
