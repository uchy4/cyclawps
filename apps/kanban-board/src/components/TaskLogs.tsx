import { useState, useEffect, useRef } from 'react';
import type { TaskLog, LogStatus } from '@app/shared';
import { useTaskLogs } from '../hooks/useTaskLogs.js';
import { AgentBadge } from './AgentBadge.js';

const STATUS_COLORS: Record<LogStatus, string> = {
  info: 'bg-zinc-400',
  success: 'bg-green-400',
  error: 'bg-red-400',
  warning: 'bg-yellow-400',
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = Date.now();
  const diff = now - ts;

  // Less than 1 minute ago
  if (diff < 60_000) return 'Just now';
  // Less than 1 hour ago
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  // Less than 24 hours ago
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface TaskLogsProps {
  taskGuid: string;
}

export function TaskLogs({ taskGuid }: TaskLogsProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timerRef.current);
  }, [search]);

  const { logs, loading } = useTaskLogs(taskGuid, debouncedSearch);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search logs..."
          className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-white placeholder-zinc-400 text-sm focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none transition-colors"
        />
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {loading && (
          <div className="text-zinc-400 text-sm animate-pulse py-4 text-center">
            Loading logs...
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div className="text-zinc-500 text-sm py-8 text-center">
            {debouncedSearch ? 'No logs match your search.' : 'No logs for this task yet.'}
          </div>
        )}

        {logs.map((log: TaskLog) => (
          <LogEntry key={log.id} log={log} />
        ))}
      </div>
    </div>
  );
}

/**
 * Renders markdown-style code formatting:
 * - Fenced code blocks (triple backticks) as <pre><code> blocks
 * - Inline code (single backticks) as <code> spans
 */
function FormattedText({ text, className }: { text: string; className?: string }) {
  // Split on fenced code blocks first: ```lang\n...\n```
  const fencedParts = text.split(/(```[\s\S]*?```)/g);

  return (
    <span className={className}>
      {fencedParts.map((segment, i) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          // Extract optional language and code content
          const inner = segment.slice(3, -3);
          const newlineIdx = inner.indexOf('\n');
          const lang = newlineIdx > 0 ? inner.slice(0, newlineIdx).trim() : '';
          const code = newlineIdx > 0 ? inner.slice(newlineIdx + 1) : inner;

          return (
            <pre
              key={i}
              className="my-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 overflow-x-auto text-xs font-mono text-zinc-300 whitespace-pre-wrap break-words"
            >
              {lang && (
                <span className="block text-[10px] text-zinc-500 mb-1 select-none">{lang}</span>
              )}
              <code>{code.replace(/^\n|\n$/g, '')}</code>
            </pre>
          );
        }

        // Within non-fenced text, handle inline backticks
        return <InlineSegment key={i} text={segment} />;
      })}
    </span>
  );
}

function InlineSegment({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code key={i} className="px-1 py-0.5 rounded bg-zinc-700 text-orange-300 text-xs font-mono">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function LogEntry({ log }: { log: TaskLog }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50">
      <div className="flex items-center gap-2 mb-1">
        {/* Status dot */}
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[log.status]}`}
          title={log.status}
        />

        {/* Action */}
        <span className="text-sm font-medium text-white flex-1 truncate">
          <FormattedText text={log.action} />
        </span>

        {/* Timestamp */}
        <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums">
          {formatTimestamp(log.createdAt)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Agent badge */}
        {log.agentRole && (
          <AgentBadge role={log.agentRole} />
        )}
      </div>

      {/* Details */}
      {log.details && (
        <div className="mt-1.5 text-xs text-zinc-400">
          <FormattedText text={log.details} />
        </div>
      )}
    </div>
  );
}
