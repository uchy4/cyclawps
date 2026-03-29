import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAgents,
  fetchTasks,
  fetchTaskById,
  fetchThreads,
  fetchThread,
  createThread,
  updateThread,
  fetchAgentArchives,
  createAgentArchive,
  restoreAgentArchive,
  deleteAgentArchive,
  addParticipant,
  removeParticipant,
  addTaskTag,
  removeTaskTag,
  postSystemMessage,
  type CreateThreadInput,
} from './endpoints.js';

// ─── Query Keys ──────────────────────────────────────────
export const queryKeys = {
  agents: ['agents'] as const,
  tasks: ['tasks'] as const,
  task: (id: string) => ['tasks', id] as const,
  threads: ['threads'] as const,
  thread: (id: string) => ['threads', id] as const,
  agentArchives: (role: string) => ['agent-archives', role] as const,
};

// ─── Query Hooks ─────────────────────────────────────────
export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: fetchAgents,
    staleTime: 30_000,
  });
}

export function useTasks() {
  return useQuery({
    queryKey: queryKeys.tasks,
    queryFn: fetchTasks,
    staleTime: 10_000,
  });
}

export function useTask(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.task(id!),
    queryFn: () => fetchTaskById(id!),
    enabled: !!id,
  });
}

export function useThreads() {
  return useQuery({
    queryKey: queryKeys.threads,
    queryFn: fetchThreads,
  });
}

export function useThread(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.thread(id!),
    queryFn: () => fetchThread(id!),
    enabled: !!id,
  });
}

export function useAgentArchives(role: string | undefined) {
  return useQuery({
    queryKey: queryKeys.agentArchives(role!),
    queryFn: () => fetchAgentArchives(role!),
    enabled: !!role,
  });
}

// ─── Mutation Hooks ──────────────────────────────────────
export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateThreadInput) => createThread(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.threads });
    },
  });
}

export function useUpdateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateThread(id, { name }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.thread(data.id), data);
      qc.invalidateQueries({ queryKey: queryKeys.threads });
    },
  });
}

export function useCreateArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, name }: { role: string; name: string }) =>
      createAgentArchive(role, name),
    onSuccess: (_, { role }) => {
      qc.invalidateQueries({ queryKey: queryKeys.agentArchives(role) });
    },
  });
}

export function useRestoreArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, archiveId }: { role: string; archiveId: string }) =>
      restoreAgentArchive(role, archiveId),
    onSuccess: (_, { role }) => {
      qc.invalidateQueries({ queryKey: queryKeys.agentArchives(role) });
    },
  });
}

export function useDeleteArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, archiveId }: { role: string; archiveId: string }) =>
      deleteAgentArchive(role, archiveId),
    onSuccess: (_, { role }) => {
      qc.invalidateQueries({ queryKey: queryKeys.agentArchives(role) });
    },
  });
}

export function useAddParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      agentRole,
      systemMessage,
    }: {
      threadId: string;
      agentRole: string;
      systemMessage?: string;
    }) =>
      addParticipant(threadId, agentRole).then(async (participant) => {
        if (systemMessage) {
          await postSystemMessage(threadId, systemMessage);
        }
        return participant;
      }),
    onSuccess: (_, { threadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.thread(threadId) });
      qc.invalidateQueries({ queryKey: queryKeys.threads });
    },
  });
}

export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      agentRole,
      systemMessage,
    }: {
      threadId: string;
      agentRole: string;
      systemMessage?: string;
    }) =>
      removeParticipant(threadId, agentRole).then(async () => {
        if (systemMessage) {
          await postSystemMessage(threadId, systemMessage);
        }
      }),
    onSuccess: (_, { threadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.thread(threadId) });
      qc.invalidateQueries({ queryKey: queryKeys.threads });
    },
  });
}

export function useAddTaskTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      taskId,
      systemMessage,
    }: {
      threadId: string;
      taskId: string;
      systemMessage?: string;
    }) =>
      addTaskTag(threadId, taskId).then(async (tag) => {
        if (systemMessage) {
          await postSystemMessage(threadId, systemMessage);
        }
        return tag;
      }),
    onSuccess: (_, { threadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.thread(threadId) });
      qc.invalidateQueries({ queryKey: queryKeys.threads });
    },
  });
}

export function useRemoveTaskTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      threadId,
      taskId,
      systemMessage,
    }: {
      threadId: string;
      taskId: string;
      systemMessage?: string;
    }) =>
      removeTaskTag(threadId, taskId).then(async () => {
        if (systemMessage) {
          await postSystemMessage(threadId, systemMessage);
        }
      }),
    onSuccess: (_, { threadId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.thread(threadId) });
      qc.invalidateQueries({ queryKey: queryKeys.threads });
    },
  });
}
