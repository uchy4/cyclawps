import { useState, useEffect, useCallback, useRef } from 'react';
import type { Message, Reaction, Attachment } from '@app/shared';
import { useSocket } from '@app/shared';
import {
  getScopeKey,
  getCachedMessages,
  setCachedMessages,
  updateCachedMessages,
  clearCachedMessages,
} from './messageCache.js';

export interface PendingAuth {
  taskId: string;
  stageId: string;
  description: string;
}

const INITIAL_LOAD = 12;
const OLDER_CHUNK = 30;

function buildParams(threadId?: string, agentRole?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (threadId) params.set('thread_id', threadId);
  if (agentRole) params.set('agent_role', agentRole);
  return params;
}

export function useMessages(threadId?: string, agentRole?: string) {
  const scopeKey = getScopeKey(threadId, agentRole);
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;

  // Seed from cache if available — skip loading state entirely
  const cached = getCachedMessages(scopeKey);
  const [messages, setMessages] = useState<Message[]>(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [hasOlder, setHasOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pendingAuths, setPendingAuths] = useState<PendingAuth[]>([]);
  const { socket, connected } = useSocket();
  const threadEnvelopeRef = useRef<Record<string, unknown> | null>(null);

  // Helper: update both state and cache
  const setMessagesAndCache = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      setMessages((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        setCachedMessages(scopeKeyRef.current, next);
        return next;
      });
    },
    []
  );

  // Fetch latest messages — on scope change
  useEffect(() => {
    const key = getScopeKey(threadId, agentRole);
    const cachedMsgs = getCachedMessages(key);

    if (cachedMsgs) {
      // Show cache instantly, no loading
      setMessages(cachedMsgs);
      setLoading(false);
    } else {
      // Only set empty if not already empty to avoid a redundant render flash
      setMessages((prev) => (prev.length === 0 ? prev : []));
      setLoading(true);
    }
    setHasOlder(true);
    threadEnvelopeRef.current = null;

    const params = buildParams(threadId, agentRole);
    params.set('limit', String(INITIAL_LOAD));

    fetch(`/api/messages?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (scopeKeyRef.current !== key) return; // scope changed while fetching
        let msgs: Message[];
        if (Array.isArray(data)) {
          msgs = data;
        } else {
          msgs = data.messages;
          threadEnvelopeRef.current = data.thread || null;
        }
        setMessages(msgs);
        setCachedMessages(key, msgs);
        if (msgs.length < INITIAL_LOAD) setHasOlder(false);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch messages:', err);
        setLoading(false);
      });
  }, [threadId, agentRole]);

  // Load older messages (prepend)
  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (!hasOlder || loadingOlder) return false;

    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      if (!oldest) { setLoadingOlder(false); return false; }

      const params = buildParams(threadId, agentRole);
      params.set('limit', String(OLDER_CHUNK));
      params.set('before', oldest.id);

      const res = await fetch(`/api/messages?${params}`);
      const data = await res.json();
      const olderMsgs: Message[] = Array.isArray(data) ? data : data.messages;

      if (olderMsgs.length < OLDER_CHUNK) setHasOlder(false);

      if (olderMsgs.length > 0) {
        setMessagesAndCache((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const unique = olderMsgs.filter((m) => !existingIds.has(m.id));
          return [...unique, ...prev];
        });
      }

      return olderMsgs.length > 0;
    } catch (err) {
      console.error('Failed to load older messages:', err);
      return false;
    } finally {
      setLoadingOlder(false);
    }
  }, [hasOlder, loadingOlder, messages, threadId, agentRole, setMessagesAndCache]);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return;

    const onMessage = ({ message }: { message: Message }) => {
      const msgExtra = message as Record<string, unknown>;
      const msgThreadId = msgExtra['threadId'] as string | null | undefined;
      const msgAgentRole = msgExtra['agentRole'] as string | null | undefined;

      let belongs = false;
      if (threadId) {
        belongs = msgThreadId === threadId;
      } else if (agentRole) {
        belongs = msgAgentRole === agentRole || message.senderName === agentRole;
      } else {
        belongs = !msgThreadId && !msgAgentRole;
      }

      if (belongs) {
        setMessagesAndCache((prev) => [...prev, message]);
      }
    };

    const onReaction = ({ messageId, reaction, action }: { messageId: string; reaction: Reaction; action: 'add' | 'remove' }) => {
      setMessagesAndCache((prev) =>
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
      setMessagesAndCache((prev) =>
        prev.map((msg) => msg.id === messageId ? { ...msg, content } : msg)
      );
    };

    const onDeleted = ({ messageId }: { messageId: string }) => {
      setMessagesAndCache((prev) => prev.filter((msg) => msg.id !== messageId));
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
  }, [socket, threadId, agentRole, setMessagesAndCache]);

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
    const key = getScopeKey(threadId, agentRole);
    clearCachedMessages(key);
    setLoading(true);
    setMessages([]);
    setHasOlder(true);
    const params = buildParams(threadId, agentRole);
    params.set('limit', String(INITIAL_LOAD));
    fetch(`/api/messages?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const msgs = Array.isArray(data) ? data : data.messages;
        setMessages(msgs);
        setCachedMessages(key, msgs);
        if (msgs.length < INITIAL_LOAD) setHasOlder(false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [threadId, agentRole]);

  return {
    messages,
    loading,
    connected,
    pendingAuths,
    hasOlder,
    loadingOlder,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    authorize,
    refreshMessages,
    loadOlder,
  };
}
