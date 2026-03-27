import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Task, TaskStatus, UpdateTaskInput } from '@app/shared';
import { useSocket } from '@app/shared';

const TASKS_KEY = ['tasks'];

async function fetchTasks(): Promise<Task[]> {
  const res = await fetch('/api/tasks');
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

export function useTasks() {
  const queryClient = useQueryClient();
  const { socket, connected } = useSocket();

  const { data: tasks = [], isLoading: loading } = useQuery({
    queryKey: TASKS_KEY,
    queryFn: fetchTasks,
  });

  // Real-time WebSocket updates → invalidate query
  useEffect(() => {
    if (!socket) return;

    const invalidate = () => queryClient.invalidateQueries({ queryKey: TASKS_KEY });

    socket.on('task:created', invalidate);
    socket.on('task:updated', invalidate);
    socket.on('task:deleted', invalidate);

    return () => {
      socket.off('task:created', invalidate);
      socket.off('task:updated', invalidate);
      socket.off('task:deleted', invalidate);
    };
  }, [socket, queryClient]);

  // Create task
  const createMutation = useMutation({
    mutationFn: async (input: { title: string; description?: string; status?: TaskStatus }) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });

  // Update task with optimistic update
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateTaskInput }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      return res.json();
    },
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });

      // Snapshot previous value
      const previous = queryClient.getQueryData<Task[]>(TASKS_KEY);

      // Optimistically update the cache
      queryClient.setQueryData<Task[]>(TASKS_KEY, (old) =>
        (old || []).map((t) => (t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t))
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(TASKS_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
    },
  });

  // Delete task
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<Task[]>(TASKS_KEY);
      queryClient.setQueryData<Task[]>(TASKS_KEY, (old) =>
        (old || []).filter((t) => t.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(TASKS_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
    },
  });

  // Reorder tasks in a column — batch update sortOrder optimistically
  const reorderMutation = useMutation({
    mutationFn: async (updates: Array<{ id: string; sortOrder: number; status?: TaskStatus }>) => {
      await Promise.all(
        updates.map(({ id, ...rest }) =>
          fetch(`/api/tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rest),
          })
        )
      );
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<Task[]>(TASKS_KEY);

      queryClient.setQueryData<Task[]>(TASKS_KEY, (old) => {
        if (!old) return old;
        const updateMap = new Map(updates.map((u) => [u.id, u]));
        return old.map((t) => {
          const u = updateMap.get(t.id);
          if (!u) return t;
          return { ...t, sortOrder: u.sortOrder, status: u.status || t.status, updatedAt: Date.now() };
        });
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(TASKS_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
    },
  });

  const createTask = useCallback(
    (title: string, description?: string, status?: TaskStatus) =>
      createMutation.mutateAsync({ title, description, status }),
    [createMutation]
  );

  const updateTask = useCallback(
    (id: string, updates: UpdateTaskInput) =>
      updateMutation.mutateAsync({ id, updates }),
    [updateMutation]
  );

  const deleteTask = useCallback(
    (id: string) => deleteMutation.mutateAsync(id),
    [deleteMutation]
  );

  const reorderTasks = useCallback(
    (updates: Array<{ id: string; sortOrder: number; status?: TaskStatus }>) =>
      reorderMutation.mutateAsync(updates),
    [reorderMutation]
  );

  return { tasks, loading, connected, createTask, updateTask, deleteTask, reorderTasks };
}
