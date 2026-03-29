import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AgentConfig, CreateAgentConfigInput, UpdateAgentConfigInput } from '@app/shared';

export function useAgents() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  /** Invalidate the React Query agents cache so other views (e.g. ChatView) pick up changes */
  const invalidateSharedCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['agents'] });
  }, [queryClient]);

  const createAgent = useCallback(async (input: CreateAgentConfigInput) => {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await res.text());
    await fetchAgents();
    invalidateSharedCache();
    return res.json();
  }, [fetchAgents, invalidateSharedCache]);

  const updateAgent = useCallback(async (role: string, input: UpdateAgentConfigInput) => {
    const res = await fetch(`/api/agents/${role}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await res.text());
    await fetchAgents();
    invalidateSharedCache();
    return res.json();
  }, [fetchAgents, invalidateSharedCache]);

  const deleteAgent = useCallback(async (role: string) => {
    const res = await fetch(`/api/agents/${role}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    await fetchAgents();
    invalidateSharedCache();
  }, [fetchAgents, invalidateSharedCache]);

  const getAgent = useCallback(async (role: string): Promise<AgentConfig | null> => {
    const res = await fetch(`/api/agents/${role}`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  return { agents, loading, createAgent, updateAgent, deleteAgent, getAgent, refresh: fetchAgents };
}
