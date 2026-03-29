import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, ChevronDown, ChevronRight, Archive, Hash, Users, Plus, Tag, RotateCcw } from 'lucide-react';
import type { AgentConfig } from '@app/shared';
import { ROLE_COLORS, formatRoleName, Modal } from '@app/shared';
import { CreateThreadDialog } from './CreateThreadDialog.js';
import { useAgents, useThreads, useAgentArchives, useCreateArchive, useRestoreArchive } from '../api/index.js';

const AVAILABILITY_DOT_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  busy: 'bg-yellow-400',
  offline: 'bg-red-500',
};

function getAgentAvailability(role: string): 'online' | 'busy' | 'offline' {
  const statuses: Array<'online' | 'busy' | 'offline'> = ['online', 'busy', 'offline'];
  let hash = 0;
  for (let i = 0; i < role.length; i++) hash += role.charCodeAt(i);
  return statuses[hash % statuses.length];
}

function AgentSidebarItem({
  agent,
  isExpanded,
  onToggleExpand,
  onArchive,
  onRestore,
}: {
  agent: AgentConfig;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onArchive: (role: string, e: React.MouseEvent) => void;
  onRestore: (role: string, archiveId: string) => void;
}) {
  const { data: archives = [] } = useAgentArchives(agent.role);
  const availability = getAgentAvailability(agent.role);
  const dotColor = AVAILABILITY_DOT_COLORS[availability];
  const color = agent.accentColor || ROLE_COLORS[agent.role] || '#8b949e';

  return (
    <div>
      <div className="group relative">
        <NavLink
          to={`/chat/agent/${agent.role}`}
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 rounded-md text-base transition-colors ${
              isActive ? 'text-orange-400 font-medium bg-zinc-700/50' : 'text-zinc-300 hover:text-zinc-200 hover:bg-zinc-700/30'
            }`
          }
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="truncate" style={{ color }}>{agent.displayName || formatRoleName(agent.role)}</span>
        </NavLink>
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {archives.length > 0 && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleExpand(); }}
              className="p-1 rounded text-zinc-600 hover:text-zinc-400 cursor-pointer"
              title={`${archives.length} archived chat${archives.length !== 1 ? 's' : ''}`}
            >
              <span className="text-[9px]">{archives.length}</span>
            </button>
          )}
          <button
            onClick={(e) => onArchive(agent.role, e)}
            className="p-1 rounded text-zinc-600 hover:text-zinc-400 cursor-pointer"
            title="Archive chat"
          >
            <Archive className="w-3 h-3" />
          </button>
        </div>
      </div>
      {isExpanded && archives.length > 0 && (
        <div className="ml-5 mt-0.5 mb-1 space-y-0.5">
          {archives.map(archive => (
            <div
              key={archive.id}
              className="group/archive flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/30 transition-colors"
            >
              <Archive className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate flex-1">{archive.name}</span>
              <button
                onClick={() => onRestore(agent.role, archive.id)}
                className="p-0.5 rounded text-zinc-600 hover:text-green-400 opacity-0 group-hover/archive:opacity-100 transition-opacity cursor-pointer"
                title="Restore this chat"
              >
                <RotateCcw className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatSubSidebar() {
  const { data: threads = [] } = useThreads();
  const { data: agents = [] } = useAgents();
  const [threadsOpen, setThreadsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [archivedThreads, setArchivedThreads] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('cyclawps:archivedThreads');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedAgentArchives, setExpandedAgentArchives] = useState<Set<string>>(new Set());
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveModalRole, setArchiveModalRole] = useState('');
  const [archiveModalName, setArchiveModalName] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const createArchiveMutation = useCreateArchive();
  const restoreArchiveMutation = useRestoreArchive();

  const handleAgentArchive = useCallback((agentRole: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setArchiveModalRole(agentRole);
    setArchiveModalName(`Archive ${new Date().toLocaleDateString()}`);
    setArchiveModalOpen(true);
  }, []);

  const confirmSidebarArchive = useCallback(() => {
    if (!archiveModalRole || !archiveModalName.trim()) return;
    setArchiveModalOpen(false);
    createArchiveMutation.mutate(
      { role: archiveModalRole, name: archiveModalName.trim() },
      {
        onSuccess: () => {
          navigate('/chat', { replace: true });
          setTimeout(() => navigate(`/chat/agent/${archiveModalRole}`, { replace: true }), 100);
        },
      },
    );
  }, [archiveModalRole, archiveModalName, navigate, createArchiveMutation]);

  const handleAgentRestore = useCallback((agentRole: string, archiveId: string) => {
    restoreArchiveMutation.mutate(
      { role: agentRole, archiveId },
      {
        onSuccess: () => {
          navigate('/chat', { replace: true });
          setTimeout(() => navigate(`/chat/agent/${agentRole}`, { replace: true }), 100);
        },
      },
    );
  }, [navigate, restoreArchiveMutation]);

  // Persist archived threads
  useEffect(() => {
    localStorage.setItem('cyclawps:archivedThreads', JSON.stringify([...archivedThreads]));
  }, [archivedThreads]);

  if (!location.pathname.startsWith('/chat')) return null;

  const toggleArchive = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setArchivedThreads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeThreadList = threads.filter(t => !archivedThreads.has(t.id));
  const archivedList = threads.filter(t => archivedThreads.has(t.id));

  return (
    <>
      <div className="w-56 bg-zinc-800 border-r border-zinc-700 flex flex-col shrink-0">
        {/* Header */}
        <div className="p-3 border-b border-zinc-700">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Chat</span>
        </div>

        <div className="flex flex-col gap-0.5 p-2 flex-1 overflow-y-auto">
          {/* Global Chat */}
          <NavLink
            to="/chat"
            end
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md text-base transition-colors ${
                isActive ? 'text-orange-400 font-medium bg-zinc-700/50' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/30'
              }`
            }
          >
            <Hash className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
            Global
          </NavLink>

          {/* Agents Section */}
          <button
            onClick={() => setAgentsOpen(!agentsOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 mt-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-400 cursor-pointer"
          >
            {agentsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Users className="w-4 h-4" />
            Agents
          </button>
          {agentsOpen && agents.map(agent => (
            <AgentSidebarItem
              key={agent.role}
              agent={agent}
              isExpanded={expandedAgentArchives.has(agent.role)}
              onToggleExpand={() => setExpandedAgentArchives(prev => { const next = new Set(prev); if (next.has(agent.role)) next.delete(agent.role); else next.add(agent.role); return next; })}
              onArchive={handleAgentArchive}
              onRestore={handleAgentRestore}
            />
          ))}

          {/* Threads Section */}
          <div className="flex items-center mt-2">
            <button
              onClick={() => setThreadsOpen(!threadsOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-400 cursor-pointer flex-1"
            >
              {threadsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <MessageSquare className="w-4 h-4" />
              Threads
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="p-1 rounded text-zinc-500 hover:text-orange-400 transition-colors cursor-pointer mr-2"
              title="New thread"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {threadsOpen && activeThreadList.map(thread => {
            const participantColors = thread.participants
              .map(p => {
                const a = agents.find(ag => ag.role === p.agentRole);
                return a?.accentColor || ROLE_COLORS[p.agentRole] || '#8b949e';
              })
              .slice(0, 4);

            return (
              <div key={thread.id} className="group relative">
                <NavLink
                  to={`/chat/thread/${thread.id}`}
                  className={({ isActive }) =>
                    `flex flex-col gap-0.5 px-3 py-1.5 rounded-md text-base transition-colors ${
                      isActive ? 'text-orange-400 font-medium bg-zinc-700/50' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700/30'
                    }`
                  }
                >
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-0.5">
                      {participantColors.map((color, i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      {participantColors.length === 0 && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-zinc-500" />
                      )}
                    </div>
                    <span className="truncate">{thread.name}</span>
                  </div>
                  {thread.taskTags.length > 0 && (
                    <div className="flex items-center gap-1 pl-3.5">
                      <Tag className="w-2.5 h-2.5 text-zinc-600" />
                      {thread.taskTags.slice(0, 2).map(tag => (
                        <span key={tag.taskId} className="text-[9px] text-zinc-500 font-mono">
                          {tag.taskGuid}
                        </span>
                      ))}
                      {thread.taskTags.length > 2 && (
                        <span className="text-[9px] text-zinc-600">+{thread.taskTags.length - 2}</span>
                      )}
                    </div>
                  )}
                </NavLink>
                <button
                  onClick={(e) => toggleArchive(thread.id, e)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Archive thread"
                >
                  <Archive className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* Archived Section */}
          {archivedList.length > 0 && (
            <>
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="flex items-center gap-1.5 px-3 py-1.5 mt-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider hover:text-zinc-400 cursor-pointer"
              >
                {showArchived ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <Archive className="w-3 h-3" />
                Archived ({archivedList.length})
              </button>
              {showArchived && archivedList.map(thread => (
                <div key={thread.id} className="group relative">
                  <NavLink
                    to={`/chat/thread/${thread.id}`}
                    className={({ isActive }) =>
                      `flex flex-col gap-0.5 px-3 py-1.5 rounded-md text-base transition-colors opacity-50 ${
                        isActive ? 'text-orange-400 font-medium bg-zinc-700/50' : 'text-zinc-500 hover:text-zinc-400 hover:bg-zinc-700/30'
                      }`
                    }
                  >
                    <span className="truncate">{thread.name}</span>
                  </NavLink>
                  <button
                    onClick={(e) => toggleArchive(thread.id, e)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-600 hover:text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Unarchive thread"
                  >
                    <Archive className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <CreateThreadDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />

      {/* Archive modal */}
      <Modal
        open={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        title="Archive Chat"
        footer={
          <>
            <button
              onClick={() => setArchiveModalOpen(false)}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={confirmSidebarArchive}
              className="px-3 py-1.5 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors cursor-pointer"
            >
              Archive
            </button>
          </>
        }
      >
        <p className="text-sm text-zinc-400 mb-3">
          This will save the current conversation and clear the chat.
        </p>
        <input
          type="text"
          value={archiveModalName}
          onChange={(e) => setArchiveModalName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirmSidebarArchive(); }}
          placeholder="Archive name..."
          autoFocus
          className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-500/50 transition-colors"
        />
      </Modal>
    </>
  );
}
