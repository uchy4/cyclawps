import type { AgentConfig } from '@agents-manager/shared';
import { ROLE_COLORS } from '@agents-manager/shared';

interface AgentCardProps {
  agent: AgentConfig;
  onClick: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const color = ROLE_COLORS[agent.role] || '#8b949e';
  const initials = (agent.displayName || agent.name).slice(0, 2).toUpperCase();

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/5 transition-colors cursor-pointer group focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
    >
      {/* Avatar + Name */}
      <div className="flex items-start gap-4 mb-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold text-lg shrink-0"
          style={{ background: color }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-white truncate group-hover:text-violet-400 transition-colors">
            {agent.displayName || agent.name}
          </h3>
          <p className="text-xs text-slate-400">{agent.role}</p>
        </div>
        {agent.isSeeded && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 shrink-0">
            Default
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-slate-400 leading-relaxed line-clamp-2 mb-4">
        {agent.description || 'No description'}
      </p>

      {/* Meta badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/50 text-violet-400">
          {agent.model.replace('claude-', '').replace('-4-6', '').replace('-4-5', '')}
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">
          {agent.maxTurns} turns
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">
          {agent.tools.length} tools
        </span>
      </div>
    </button>
  );
}
