import { ROLE_COLORS, formatRoleName } from '@app/shared';
import type { AgentActivity } from '../hooks/useAgentStatus.js';

interface AgentTypingIndicatorProps {
  activities: Map<string, AgentActivity>;
  /** Only show agents relevant to this context */
  filterRoles?: string[];
  /** Agent display name lookup */
  agentNames?: Record<string, string>;
  /** Custom agent colors (from DB accentColor) */
  agentColors?: Record<string, string>;
}

export function AgentTypingIndicator({
  activities,
  filterRoles,
  agentNames,
  agentColors,
}: AgentTypingIndicatorProps) {
  const runningAgents = Array.from(activities.entries())
    .filter(([, a]) => a.status === 'running')
    .filter(([role]) => !filterRoles || filterRoles.includes(role));

  if (runningAgents.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 py-2">
      {runningAgents.map(([role]) => {
        const color = agentColors?.[role] || ROLE_COLORS[role] || '#8b949e';
        const name = agentNames?.[role] || formatRoleName(role);

        return (
          <div key={role} className="flex items-center gap-2 px-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs" style={{ color }}>
              {name}
            </span>
            <span className="text-xs text-zinc-500">is thinking</span>
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-zinc-500"
                  style={{
                    animation: `typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </span>
            <style>{`
              @keyframes typing-dot {
                0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
                30% { opacity: 1; transform: translateY(-2px); }
              }
            `}</style>
          </div>
        );
      })}
    </div>
  );
}
