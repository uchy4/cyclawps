import { useState, useEffect, useCallback } from 'react';
import type { AgentConfig, CreateAgentConfigInput, UpdateAgentConfigInput } from '@agents-manager/shared';

export function useAgents() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);

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

  const createAgent = useCallback(async (input: CreateAgentConfigInput) => {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await res.text());
    await fetchAgents();
    return res.json();
  }, [fetchAgents]);

  const updateAgent = useCallback(async (role: string, input: UpdateAgentConfigInput) => {
    const res = await fetch(`/api/agents/${role}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await res.text());
    await fetchAgents();
    return res.json();
  }, [fetchAgents]);

  const deleteAgent = useCallback(async (role: string) => {
    const res = await fetch(`/api/agents/${role}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    await fetchAgents();
  }, [fetchAgents]);

  const getAgent = useCallback(async (role: string): Promise<AgentConfig | null> => {
    const res = await fetch(`/api/agents/${role}`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  return { agents, loading, createAgent, updateAgent, deleteAgent, getAgent, refresh: fetchAgents };
}
