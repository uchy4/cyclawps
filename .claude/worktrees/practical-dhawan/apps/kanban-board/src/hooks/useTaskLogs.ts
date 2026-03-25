import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskLog } from '@agents-manager/shared';
import { useSocket } from '@agents-manager/shared';

async function fetchTaskLogs(taskGuid: string, search?: string): Promise<TaskLog[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  params.set('limit', '200');

  const res = await fetch(`/api/tasks/${taskGuid}/logs?${params}`);
  if (!res.ok) throw new Error('Failed to fetch logs');
  return res.json();
}

export function useTaskLogs(taskGuid: string, search?: string) {
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const queryKey = ['task-logs', taskGuid, search || ''];

  const { data: logs = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchTaskLogs(taskGuid, search),
    enabled: !!taskGuid,
  });

  // Real-time updates via WebSocket
  useEffect(() => {
    if (!socket || !taskGuid) return;

    const handleLog = (data: { log: TaskLog }) => {
      if (data.log.taskGuid === taskGuid) {
        queryClient.invalidateQueries({ queryKey: ['task-logs', taskGuid] });
      }
    };

    socket.on('task:log', handleLog);
    return () => {
      socket.off('task:log', handleLog);
    };
  }, [socket, taskGuid, queryClient]);

  return { logs, loading };
}
