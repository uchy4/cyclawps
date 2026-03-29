import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@app/shared';
import type { AgentRunStatus } from '@app/shared';

export interface AgentActivity {
  status: AgentRunStatus;
  taskId?: string;
  lastChunk?: string;
  updatedAt: number;
}

/**
 * Listens to agent:status and agent:streaming socket events.
 * Returns a map of agent role → current activity state.
 *
 * On mount, fetches currently running agents from the API so that
 * navigating away and back doesn't lose the typing indicator.
 */
export function useAgentStatus() {
  const { socket } = useSocket();
  const [activities, setActivities] = useState<Map<string, AgentActivity>>(new Map());

  // Seed from server on mount — picks up agents that started while we were away
  useEffect(() => {
    fetch('/api/agents/running')
      .then((res) => res.json())
      .then((rows: Array<{ role: string; taskId?: string; startedAt: number }>) => {
        if (rows.length === 0) return;
        setActivities((prev) => {
          const next = new Map(prev);
          for (const r of rows) {
            // Don't overwrite if we already have a live status from WebSocket
            if (!next.has(r.role)) {
              next.set(r.role, {
                status: 'running',
                taskId: r.taskId,
                updatedAt: r.startedAt,
              });
            }
          }
          return next;
        });
      })
      .catch((err) => {
        console.error('Failed to fetch running agents:', err);
      });
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onStatus = (data: { role: string; status: AgentRunStatus; taskId?: string }) => {
      setActivities((prev) => {
        const next = new Map(prev);
        if (data.status === 'completed' || data.status === 'failed') {
          next.delete(data.role);
        } else {
          next.set(data.role, {
            status: data.status,
            taskId: data.taskId,
            updatedAt: Date.now(),
          });
        }
        return next;
      });
    };

    const onStreaming = (data: { role: string; taskId: string; chunk: string }) => {
      setActivities((prev) => {
        const existing = prev.get(data.role);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(data.role, {
          ...existing,
          lastChunk: data.chunk,
          updatedAt: Date.now(),
        });
        return next;
      });
    };

    socket.on('agent:status', onStatus);
    socket.on('agent:streaming', onStreaming);

    return () => {
      socket.off('agent:status', onStatus);
      socket.off('agent:streaming', onStreaming);
    };
  }, [socket]);

  const isAgentRunning = useCallback(
    (role: string) => {
      const activity = activities.get(role);
      return activity?.status === 'running';
    },
    [activities]
  );

  return { activities, isAgentRunning };
}
