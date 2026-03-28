import { useState, useEffect, useRef } from 'react';
import { Archive, RotateCcw, Trash2, ChevronDown } from 'lucide-react';
import { ROLE_COLORS, formatRoleName } from '@app/shared';

interface ArchiveItem {
  id: string;
  agentRole: string;
  name: string;
  messageCount: number;
  createdAt: number;
}

interface AgentChatHeaderProps {
  agentRole: string;
  agentName: string;
  accentColor?: string;
  onArchive: () => void;
  onRestore: (archiveId: string) => void;
  onDeleteArchive: (archiveId: string) => void;
  archives: ArchiveItem[];
}

export function AgentChatHeader({
  agentRole,
  agentName,
  accentColor,
  onArchive,
  onRestore,
  onDeleteArchive,
  archives,
}: AgentChatHeaderProps) {
  const color = accentColor || ROLE_COLORS[agentRole] || '#8b949e';
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  return (
    <div className="px-8 p-3 border-b border-zinc-700 bg-zinc-800/50 flex items-center">
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between">
        {/* Agent identity */}
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
            {agentName || formatRoleName(agentRole)}
          </span>
        </div>

        {/* Right side: archive button + dropdown */}
        <div className="flex items-center gap-2">
          {/* Archive current chat button */}
          <button
            onClick={onArchive}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-orange-400 cursor-pointer px-2 py-1 rounded-lg hover:bg-zinc-700/50 transition-colors"
            title="Archive this chat"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archive</span>
          </button>

          {/* Archives dropdown */}
          {archives.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer px-2 py-1 rounded-lg hover:bg-zinc-700/50 transition-colors"
              >
                <span>Archives ({archives.length})</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-30 py-1 max-h-64 overflow-y-auto">
                  {archives.map((archive) => (
                    <div
                      key={archive.id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-zinc-700/50 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 truncate">{archive.name}</div>
                        <div className="text-[10px] text-zinc-500">
                          {archive.messageCount} messages · {new Date(archive.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); onRestore(archive.id); setDropdownOpen(false); }}
                          className="p-1 rounded text-zinc-500 hover:text-green-400 hover:bg-green-500/10 cursor-pointer transition-colors"
                          title="Restore this chat"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteArchive(archive.id); }}
                          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete archive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
