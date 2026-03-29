import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Derives a deterministic scope key for read-marker tracking.
 * - Global chat: "global"
 * - Thread: "thread:<id>"
 * - Agent DM: "agent:<role>"
 */
function getScopeKey(threadId?: string | null, agentRole?: string | null): string {
  if (threadId) return `thread:${threadId}`;
  if (agentRole) return `agent:${agentRole}`;
  return 'global';
}

/**
 * Tracks the last-read message for a given chat scope.
 *
 * - On mount: fetches the server-side read marker.
 * - `markAsRead(messageId)`: PUTs the marker to the server (fire-and-forget).
 * - `lastReadMessageId`: the marker value fetched on mount (stable during the session
 *   so the divider doesn't jump while the user is reading).
 */
export function useReadMarker(threadId?: string | null, agentRole?: string | null) {
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const scopeKey = getScopeKey(threadId, agentRole);
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;

  useEffect(() => {
    setLastReadMessageId(null);
    setLoaded(false);

    const key = getScopeKey(threadId, agentRole);
    fetch(`/api/read-markers/${encodeURIComponent(key)}`)
      .then((res) => res.json())
      .then((data) => {
        // Only apply if scope hasn't changed while fetching
        if (scopeKeyRef.current === key) {
          setLastReadMessageId(data.lastReadMessageId || null);
          setLoaded(true);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch read marker:', err);
        setLoaded(true);
      });
  }, [threadId, agentRole]);

  const markAsRead = useCallback(
    (messageId: string) => {
      const key = scopeKeyRef.current;
      // Fire-and-forget — don't block the UI
      fetch(`/api/read-markers/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastReadMessageId: messageId }),
      }).catch((err) => {
        console.error('Failed to update read marker:', err);
      });
    },
    []
  );

  return { lastReadMessageId, loaded, markAsRead };
}

export { getScopeKey };
