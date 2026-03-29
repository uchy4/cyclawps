/**
 * Module-level in-memory cache for messages, keyed by chat scope.
 * Persists across component mounts within the same SPA session.
 * Not persisted to disk — cleared on page refresh.
 */
import type { Message } from '@app/shared';

interface CacheEntry {
  messages: Message[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

export function getScopeKey(threadId?: string | null, agentRole?: string | null): string {
  if (threadId) return `thread:${threadId}`;
  if (agentRole) return `agent:${agentRole}`;
  return 'global';
}

export function getCachedMessages(scopeKey: string): Message[] | null {
  const entry = cache.get(scopeKey);
  return entry ? entry.messages : null;
}

export function setCachedMessages(scopeKey: string, messages: Message[]): void {
  cache.set(scopeKey, { messages, timestamp: Date.now() });
}

export function updateCachedMessages(
  scopeKey: string,
  updater: (messages: Message[]) => Message[]
): void {
  const entry = cache.get(scopeKey);
  if (entry) {
    entry.messages = updater(entry.messages);
    entry.timestamp = Date.now();
  }
}

export function clearCachedMessages(scopeKey: string): void {
  cache.delete(scopeKey);
}
