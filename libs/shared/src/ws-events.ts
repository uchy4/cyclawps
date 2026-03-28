import type { Task, Message, Reaction, Attachment, TaskLog, AgentRunStatus, PipelineRunStatus, Thread, ThreadParticipant, ThreadTaskTag } from './index.js';

// Server -> Client events
export interface ServerToClientEvents {
  'task:created': (data: { task: Task }) => void;
  'task:updated': (data: { task: Task }) => void;
  'task:deleted': (data: { taskId: string }) => void;
  'task:log': (data: { log: TaskLog }) => void;
  'message:new': (data: { message: Message }) => void;
  'message:reaction': (data: { messageId: string; reaction: Reaction; action: 'add' | 'remove' }) => void;
  'agent:status': (data: { role: string; status: AgentRunStatus; taskId?: string }) => void;
  'agent:streaming': (data: { role: string; taskId: string; chunk: string }) => void;
  'pipeline:stage': (data: { taskId: string; stageId: string; status: PipelineRunStatus }) => void;
  'pipeline:auth_required': (data: { taskId: string; stageId: string; description: string }) => void;
  'pipeline:completed': (data: { taskId: string }) => void;
  'thread:created': (data: { thread: Thread }) => void;
  'thread:updated': (data: { thread: Thread }) => void;
  'thread:deleted': (data: { threadId: string }) => void;
  'thread:participant_added': (data: { threadId: string; participant: ThreadParticipant }) => void;
  'thread:participant_removed': (data: { threadId: string; agentRole: string }) => void;
  'thread:task_tagged': (data: { threadId: string; tag: ThreadTaskTag }) => void;
  'thread:task_untagged': (data: { threadId: string; taskId: string }) => void;
  'message:edited': (data: { messageId: string; content: string }) => void;
  'message:deleted': (data: { messageId: string }) => void;
}

// Client -> Server events
export interface ClientToServerEvents {
  'message:send': (data: { content: string; taskId?: string; threadId?: string; inReplyTo?: string; attachments?: Attachment[]; agentRole?: string }) => void;
  'message:react': (data: { messageId: string; emoji: string }) => void;
  'message:edit': (data: { messageId: string; content: string }) => void;
  'message:delete': (data: { messageId: string }) => void;
  'pipeline:authorize': (data: { taskId: string; stageId: string; approved: boolean }) => void;
}
