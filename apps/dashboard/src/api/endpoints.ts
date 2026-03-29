import type { AgentConfig, Task, Thread } from '@app/shared';
import { apiGet, apiPost, apiPatch, apiDelete } from './client.js';

// ─── Agents ──────────────────────────────────────────────
export const fetchAgents = () => apiGet<AgentConfig[]>('/api/agents');

// ─── Tasks ───────────────────────────────────────────────
export const fetchTasks = () => apiGet<Task[]>('/api/tasks');
export const fetchTaskById = (id: string) => apiGet<Task>(`/api/tasks/${id}`);

// ─── Threads ─────────────────────────────────────────────
export const fetchThreads = () => apiGet<Thread[]>('/api/threads');
export const fetchThread = (id: string) => apiGet<Thread>(`/api/threads/${id}`);

export interface CreateThreadInput {
  name: string;
  participantRoles: string[];
  taskIds: string[];
}
export const createThread = (data: CreateThreadInput) =>
  apiPost<Thread>('/api/threads', data);

export const updateThread = (id: string, data: { name: string }) =>
  apiPatch<Thread>(`/api/threads/${id}`, data);

// ─── Thread Participants ─────────────────────────────────
export const addParticipant = (threadId: string, agentRole: string) =>
  apiPost<{ agentRole: string }>(`/api/threads/${threadId}/participants`, { agentRole });

export const removeParticipant = (threadId: string, agentRole: string) =>
  apiDelete(`/api/threads/${threadId}/participants/${agentRole}`);

// ─── Thread Task Tags ────────────────────────────────────
export interface TaskTag {
  taskId: string;
  taskGuid: string;
  taskTitle: string;
}
export const addTaskTag = (threadId: string, taskId: string) =>
  apiPost<TaskTag>(`/api/threads/${threadId}/tasks`, { taskId });

export const removeTaskTag = (threadId: string, taskId: string) =>
  apiDelete(`/api/threads/${threadId}/tasks/${taskId}`);

// ─── Agent Archives ──────────────────────────────────────
export interface Archive {
  id: string;
  agentRole?: string;
  name: string;
  messageCount: number;
  createdAt: number;
}
export const fetchAgentArchives = (role: string) =>
  apiGet<Archive[]>(`/api/agent-archives/${role}`);

export const createAgentArchive = (role: string, name: string) =>
  apiPost<Archive>(`/api/agent-archives/${role}`, { name });

export const restoreAgentArchive = (role: string, archiveId: string) =>
  apiPost<void>(`/api/agent-archives/${role}/${archiveId}/restore`);

export const deleteAgentArchive = (role: string, archiveId: string) =>
  apiDelete(`/api/agent-archives/${role}/${archiveId}`);

// ─── Messages (system messages for thread events) ────────
export const postSystemMessage = (threadId: string, content: string) =>
  apiPost('/api/messages', { senderType: 'system', senderName: 'system', content, threadId });
