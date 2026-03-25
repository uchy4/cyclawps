import { useState, useEffect, useCallback } from 'react';
import type { Message } from '@agents-manager/shared';
import { useSocket } from '@agents-manager/shared';

export interface PendingAuth {
  taskId: string;
  stageId: string;
  description: string;
}

export function useMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAuths, setPendingAuths] = useState<PendingAuth[]>([]);
  const { socket, connected } = useSocket();

  // Fetch initial messages
  useEffect(() => {
    fetch('/api/messages?limit=200')
      .then((r) => r.json())
      .then((data) => {
        setMessages(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch messages:', err);
        setLoading(false);
      });
  }, []);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return;

    socket.on('message:new', ({ message }) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('pipeline:auth_required', (data) => {
      setPendingAuths((prev) => [...prev, data]);
    });

    socket.on('pipeline:completed', ({ taskId }) => {
      setPendingAuths((prev) => prev.filter((a) => a.taskId !== taskId));
    });

    return () => {
      socket.off('message:new');
      socket.off('pipeline:auth_required');
      socket.off('pipeline:completed');
    };
  }, [socket]);

  const sendMessage = useCallback(
    (content: string, taskId?: string) => {
      if (!socket) return;
      socket.emit('message:send', { content, taskId });
    },
    [socket]
  );

  const authorize = useCallback(
    (taskId: string, stageId: string, approved: boolean) => {
      if (!socket) return;
      socket.emit('pipeline:authorize', { taskId, stageId, approved });
      setPendingAuths((prev) =>
        prev.filter((a) => !(a.taskId === taskId && a.stageId === stageId))
      );
    },
    [socket]
  );

  return { messages, loading, connected, pendingAuths, sendMessage, authorize };
}
