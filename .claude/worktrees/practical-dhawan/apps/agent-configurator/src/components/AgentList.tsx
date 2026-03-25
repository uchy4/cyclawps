import { useAgents } from '../hooks/useAgents.js';
import { AgentCard } from './AgentCard.js';
import { NewAgentCard } from './NewAgentCard.js';

interface AgentListProps {
  onCreate: () => void;
  onEdit: (role: string) => void;
}

export function AgentList({ onCreate, onEdit }: AgentListProps) {
  const { agents, loading } = useAgents();

  if (loading) {
    return <div className="p-8 text-slate-400 animate-pulse">Loading agents…</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-semibold text-white">Agents</h2>
          <p className="text-sm text-slate-400 mt-1">{agents.length} agent{agents.length !== 1 ? 's' : ''} configured</p>
        </div>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onClick={() => onEdit(agent.role)}
          />
        ))}
        <NewAgentCard onClick={onCreate} />
      </div>
    </div>
  );
}
