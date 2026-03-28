interface NewAgentCardProps {
  onClick: () => void;
}

export function NewAgentCard({ onClick }: NewAgentCardProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Create new agent"
      className="w-full min-h-[200px] rounded-xl border-2 border-dashed border-zinc-700 hover:border-orange-500 text-zinc-400 hover:text-orange-400 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
    >
      <span className="text-3xl leading-none">+</span>
      <span className="text-sm font-medium">New Agent</span>
    </button>
  );
}
