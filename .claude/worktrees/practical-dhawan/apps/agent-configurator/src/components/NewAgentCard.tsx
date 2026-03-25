interface NewAgentCardProps {
  onClick: () => void;
}

export function NewAgentCard({ onClick }: NewAgentCardProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Create new agent"
      className="w-full min-h-[200px] rounded-xl border-2 border-dashed border-slate-700 hover:border-violet-500 text-slate-400 hover:text-violet-400 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
    >
      <span className="text-3xl leading-none">+</span>
      <span className="text-sm font-medium">New Agent</span>
    </button>
  );
}
