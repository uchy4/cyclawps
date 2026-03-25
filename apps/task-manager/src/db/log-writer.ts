import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { TaskLog, LogStatus, ServerToClientEvents, ClientToServerEvents } from '@agents-manager/shared';

interface WriteLogParams {
  taskGuid: string;
  agentRole?: string;
  action: string;
  details?: string;
  status?: LogStatus;
  metadata?: Record<string, unknown>;
}

function rowToTaskLog(row: Record<string, unknown>): TaskLog {
  return {
    id: row['id'] as string,
    taskGuid: row['task_guid'] as string,
    agentRole: (row['agent_role'] as string) || null,
    action: row['action'] as string,
    details: (row['details'] as string) || '',
    status: (row['status'] as LogStatus) || 'info',
    metadata: JSON.parse((row['metadata'] as string) || '{}'),
    createdAt: row['created_at'] as number,
  };
}

export { rowToTaskLog };

export function writeTaskLog(
  db: Database.Database,
  io: Server<ClientToServerEvents, ServerToClientEvents> | null | undefined,
  params: WriteLogParams
): TaskLog {
  const id = uuid();
  const now = Date.now();

  db.prepare(
    `INSERT INTO task_logs (id, task_guid, agent_role, action, details, status, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.taskGuid,
    params.agentRole || null,
    params.action,
    params.details || '',
    params.status || 'info',
    JSON.stringify(params.metadata || {}),
    now
  );

  const row = db.prepare('SELECT * FROM task_logs WHERE id = ?').get(id) as Record<string, unknown>;
  const log = rowToTaskLog(row);

  io?.emit('task:log', { log });

  return log;
}
