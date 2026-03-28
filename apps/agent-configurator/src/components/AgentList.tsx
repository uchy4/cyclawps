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
    return <div className="p-8"><div className="max-w-4xl mx-auto text-zinc-400 animate-pulse">Loading agents…</div></div>;
  }

  return (
    <div className="px-8 py-6">
      <div className="max-w-4xl mx-auto w-full">
      <p className="text-sm text-zinc-400 mb-8">{agents.length} agent{agents.length !== 1 ? 's' : ''} configured</p>

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
    </div>
  );
}
