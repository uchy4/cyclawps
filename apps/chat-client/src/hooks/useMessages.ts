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
      if (threadId) {
        if (message.threadId === threadId) {
          setMessages((prev) => [...prev, message]);
        }
      } else if (agentRole) {
        // Agent channel: show all messages (server already filtered by agent_role)
        setMessages((prev) => [...prev, message]);
      } else {
        // Global chat: only show messages with no thread and no agent_role
        if (!message.threadId && !(message as Record<string, unknown>)['agentRole']) {
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

    socket.on('message:new', onMessage);
    socket.on('message:reaction', onReaction);

    socket.on('pipeline:auth_required', (data) => {
      setPendingAuths((prev) => [...prev, data]);
    });

    socket.on('pipeline:completed', ({ taskId: completedId }) => {
      setPendingAuths((prev) => prev.filter((a) => a.taskId !== completedId));
    });

    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:reaction', onReaction);
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

  return { messages, loading, connected, pendingAuths, sendMessage, toggleReaction, authorize };
}
