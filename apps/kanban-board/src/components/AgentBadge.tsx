import { ROLE_COLORS, formatRoleName } from '@cyclawps/shared';

interface AgentBadgeProps {
  role: string;
}

export function AgentBadge({ role }: AgentBadgeProps) {
  const color = ROLE_COLORS[role] || '#94a3b8'; // slate-400 fallback
  const displayName = formatRoleName(role);

  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors"
      style={{
        background: `${color}15`,
        color,
        borderColor: `${color}33`,
      }}
    >
      {displayName}
    </span>
  );
}
