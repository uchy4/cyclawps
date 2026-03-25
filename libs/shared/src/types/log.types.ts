export type LogStatus = 'info' | 'success' | 'error' | 'warning';

export interface TaskLog {
  id: string;
  taskGuid: string;
  agentRole: string | null;
  action: string;
  details: string;
  status: LogStatus;
  metadata: Record<string, unknown>;
  createdAt: number;
}
