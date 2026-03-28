import { useState, useEffect, useCallback } from 'react';
import type { Message, Reaction, Attachment } from '@app/shared';
import { useSocket } from '@app/shared';

export interface PendingAuth {
  taskId: string;
  stageId: string;
  description: string;
}

export function useMessages(threadId?: string, agentRole?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAuths, setPendingAuths] = useState<PendingAuth[]>([]);
  const { socket, connected } = useSocket();

  // Fetch messages, re-fetch when threadId or agentRole changes
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    const params = new URLSearchParams({ limit: '200' });
    if (threadId) params.set('thread_id', threadId);
    if (agentRole) params.set('agent_role', agentRole);

    fetch(`/api/messages?${params}`)
      .then((r) => r.json())
      .then((data) => {
        // Thread endpoint returns an envelope { thread, messages }; others return a flat array
        const msgs = Array.isArray(data) ? data : data.messages;
        setMessages(msgs);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch messages:', err);
        setLoading(false);
      });
  }, [threadId, agentRole]);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return;

    const onMessage = ({ message }: { message: Message }) => {
      const msgExtra = message as Record<string, unknown>;
      const msgThreadId = msgExtra['threadId'] as string | null | undefined;
      const msgAgentRole = msgExtra['agentRole'] as string | null | undefined;

      if (threadId) {
        // Thread view: only show messages belonging to this thread
        if (msgThreadId === threadId) {
          setMessages((prev) => [...prev, message]);
        }
      } else if (agentRole) {
        // Agent DM channel: only show messages for this agent role
        if (msgAgentRole === agentRole || message.senderName === agentRole) {
          setMessages((prev) => [...prev, message]);
        }
      } else {
        // Global chat: only show messages with no thread and no agent_role
        if (!msgThreadId && !msgAgentRole) {
          setMessages((prev) => [...prev, message]);
        }
      }
    };

    const onReaction = ({ messageId, reaction, action }: { messageId: string; reaction: Reaction; action: 'add' | 'remove' }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          if (action === 'add') {
            return { ...msg, reactions: [...msg.reactions, reaction] };
          } else {
            return { ...msg, reactions: msg.reactions.filter((r) => r.id !== reaction.id) };
          }
        })
      );
    };

    const onEdited = ({ messageId, content }: { messageId: string; content: string }) => {
      setMessages((prev) =>
        prev.map((msg) => msg.id === messageId ? { ...msg, content } : msg)
      );
    };

    const onDeleted = ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    };

    socket.on('message:new', onMessage);
    socket.on('message:reaction', onReaction);
    socket.on('message:edited', onEdited);
    socket.on('message:deleted', onDeleted);

    socket.on('pipeline:auth_required', (data) => {
      setPendingAuths((prev) => [...prev, data]);
    });

    socket.on('pipeline:completed', ({ taskId: completedId }) => {
      setPendingAuths((prev) => prev.filter((a) => a.taskId !== completedId));
    });

    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:reaction', onReaction);
      socket.off('message:edited', onEdited);
      socket.off('message:deleted', onDeleted);
      socket.off('pipeline:auth_required');
      socket.off('pipeline:completed');
    };
  }, [socket, threadId, agentRole]);

  const sendMessage = useCallback(
    (content: string, msgThreadId?: string, inReplyTo?: string, attachments?: Attachment[], msgAgentRole?: string) => {
      if (!socket) return;
      socket.emit('message:send', { content, threadId: msgThreadId, inReplyTo, attachments, agentRole: msgAgentRole });
    },
    [socket]
  );

  const editMessage = useCallback(
    (messageId: string, content: string) => {
      if (!socket) return;
      socket.emit('message:edit', { messageId, content });
    },
    [socket]
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      if (!socket) return;
      socket.emit('message:delete', { messageId });
    },
    [socket]
  );

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!socket) return;
      socket.emit('message:react', { messageId, emoji });
    },
    [socket]
  );

  const authorize = useCallback(
    (authTaskId: string, stageId: string, approved: boolean) => {
      if (!socket) return;
      socket.emit('pipeline:authorize', { taskId: authTaskId, stageId, approved });
      setPendingAuths((prev) =>
        prev.filter((a) => !(a.taskId === authTaskId && a.stageId === stageId))
      );
    },
    [socket]
  );

  const refreshMessages = useCallback(() => {
    setLoading(true);
    setMessages([]);
    const params = new URLSearchParams({ limit: '200' });
    if (threadId) params.set('thread_id', threadId);
    if (agentRole) params.set('agent_role', agentRole);
    fetch(`/api/messages?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const msgs = Array.isArray(data) ? data : data.messages;
        setMessages(msgs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [threadId, agentRole]);

  return { messages, loading, connected, pendingAuths, sendMessage, editMessage, deleteMessage, toggleReaction, authorize, refreshMessages };
}
