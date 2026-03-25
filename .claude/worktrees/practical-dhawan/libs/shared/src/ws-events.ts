import type { Task, Message, TaskLog, AgentRunStatus, PipelineRunStatus } from './index.js';

// Server -> Client events
export interface ServerToClientEvents {
  'task:created': (data: { task: Task }) => void;
  'task:updated': (data: { task: Task }) => void;
  'task:deleted': (data: { taskId: string }) => void;
  'task:log': (data: { log: TaskLog }) => void;
  'message:new': (data: { message: Message }) => void;
  'agent:status': (data: { role: string; status: AgentRunStatus; taskId?: string }) => void;
  'agent:streaming': (data: { role: string; taskId: string; chunk: string }) => void;
  'pipeline:stage': (data: { taskId: string; stageId: string; status: PipelineRunStatus }) => void;
  'pipeline:auth_required': (data: { taskId: string; stageId: string; description: string }) => void;
  'pipeline:completed': (data: { taskId: string }) => void;
}

// Client -> Server events
export interface ClientToServerEvents {
  'message:send': (data: { content: string; taskId?: string }) => void;
  'pipeline:authorize': (data: { taskId: string; stageId: string; approved: boolean }) => void;
}
