/**
 * Skeleton placeholder that mimics the shape of a MessageBubble.
 * Used during initial load and while fetching older message chunks.
 */

// Deterministic pseudo-random widths so skeletons feel varied but don't shift between renders
const PATTERNS = [
  { align: 'left', nameW: 'w-16', lines: ['w-3/4', 'w-1/2'] },
  { align: 'right', nameW: 'w-10', lines: ['w-2/3'] },
  { align: 'left', nameW: 'w-20', lines: ['w-5/6', 'w-2/5'] },
  { align: 'left', nameW: 'w-14', lines: ['w-1/2'] },
  { align: 'right', nameW: 'w-10', lines: ['w-3/5', 'w-1/3'] },
  { align: 'left', nameW: 'w-18', lines: ['w-4/5'] },
];

function SingleSkeleton({ index }: { index: number }) {
  const pattern = PATTERNS[index % PATTERNS.length];
  const isUser = pattern.align === 'right';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Sender name bar */}
        <div
          className={`h-3 rounded bg-zinc-700/40 animate-pulse mb-2 ${pattern.nameW}`}
        />
        {/* Message bubble */}
        <div
          className={`rounded-xl px-3.5 py-3 space-y-2 ${
            isUser ? 'bg-zinc-700/30' : 'bg-zinc-800/40'
          } border-l-[3px] ${isUser ? 'border-zinc-600/30' : 'border-zinc-600/20'}`}
          style={{ minWidth: '180px' }}
        >
          {pattern.lines.map((w, i) => (
            <div
              key={i}
              className={`h-3.5 rounded bg-zinc-600/30 animate-pulse ${w}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface MessageSkeletonProps {
  count?: number;
}

export function MessageSkeleton({ count = 4 }: MessageSkeletonProps) {
  return (
    <div className="space-y-1 py-2">
      {Array.from({ length: count }, (_, i) => (
        <SingleSkeleton key={i} index={i} />
      ))}
    </div>
  );
}
