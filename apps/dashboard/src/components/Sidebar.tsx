import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { LayoutGrid, MessageSquare, Bot, ChevronDown, ChevronRight, Archive, Hash, Users } from 'lucide-react';
import type { Task, AgentConfig } from '@app/shared';
import { ROLE_COLORS, formatRoleName } from '@app/shared';

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const showLabels = !collapsed;

  return (
    <nav className={`${collapsed ? 'w-14' : 'w-20 lg:w-60'} bg-slate-800 border-r border-slate-700 flex flex-col shrink-0 transition-all duration-200`}>
      <div className="flex flex-col gap-0.5 p-2 flex-1 overflow-y-auto">
        {/* Tasks */}
        <NavLink
          to="/kanban"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isActive ? 'bg-slate-700/50 text-orange-400 font-medium' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`
          }
        >
          <LayoutGrid className="w-4 h-4 shrink-0" />
          {showLabels && <span className="hidden lg:inline">Tasks</span>}
        </NavLink>

        {/* Chat */}
        <NavLink
          to="/chat"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isActive ? 'bg-slate-700/50 text-orange-400 font-medium' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`
          }
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          {showLabels && <span className="hidden lg:inline">Chat</span>}
        </NavLink>

        {/* Agents */}
        <NavLink
          to="/configurator"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isActive ? 'bg-slate-700/50 text-orange-400 font-medium' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`
          }
        >
          <Bot className="w-4 h-4 shrink-0" />
          {showLabels && <span className="hidden lg:inline">Agents</span>}
        </NavLink>
      </div>
      <div className="p-3 border-t border-slate-700">
        {showLabels && <div className="text-[10px] text-slate-500 hidden lg:block">Cyclawps v0.1</div>}
      </div>
    </nav>
  );
}

const STATUS_DOT_COLOR: Record<string, string> = {
  todo: 'bg-slate-400',
  in_progress: 'bg-yellow-400',
  done: 'bg-green-500',
  blocked: 'bg-red-500',
};

const AVAILABILITY_DOT_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  busy: 'bg-yellow-400',
  offline: 'bg-red-500',
};

// Simple hash to deterministically assign availability based on agent role
function getAgentAvailability(role: string): 'online' | 'busy' | 'offline' {
  const statuses: Array<'online' | 'busy' | 'offline'> = ['online', 'busy', 'offline'];
  // Simple hash: sum of char codes mod 3
  let hash = 0;
  for (let i = 0; i < role.length; i++) hash += role.charCodeAt(i);
  return statuses[hash % statuses.length];
}

export function ChatSubSidebar() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [threadsOpen, setThreadsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [archivedThreads, setArchivedThreads] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('cyclawps:archivedThreads');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [showArchived, setShowArchived] = useState(false);
  const location = useLocation();

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.json())
      .then(data => setTasks(data))
      .catch(() => { /* ignore errors */ });
    fetch('/api/agents')
      .then(r => r.json())
      .then(data => setAgents(data))
      .catch(() => { /* ignore errors */ });
  }, []);

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

  const activeThreads = tasks.filter(t => !archivedThreads.has(t.id));
  const archivedList = tasks.filter(t => archivedThreads.has(t.id));

  return (
    <div className="w-56 bg-slate-800 border-r border-slate-700 flex flex-col shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-slate-700">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chat</span>
      </div>

      <div className="flex flex-col gap-0.5 p-2 flex-1 overflow-y-auto">
        {/* Global Chat */}
        <NavLink
          to="/chat"
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-md text-base transition-colors ${
              isActive ? 'text-orange-400 font-medium bg-slate-700/50' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
            }`
          }
        >
          <Hash className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          Global
        </NavLink>

        {/* Agents Section */}
        <button
          onClick={() => setAgentsOpen(!agentsOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 mt-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-400 cursor-pointer"
        >
          {agentsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Users className="w-4 h-4" />
          Agents
        </button>
        {agentsOpen && agents.map(agent => {
          const availability = getAgentAvailability(agent.role);
          const dotColor = AVAILABILITY_DOT_COLORS[availability];
          const color = agent.accentColor || ROLE_COLORS[agent.role] || '#8b949e';
          return (
            <NavLink
              key={agent.role}
              to={`/chat/agent/${agent.role}`}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-1.5 rounded-md text-base transition-colors ${
                  isActive ? 'text-orange-400 font-medium bg-slate-700/50' : 'text-slate-300 hover:text-slate-200 hover:bg-slate-700/30'
                }`
              }
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
              <span className="truncate" style={{ color }}>{agent.displayName || formatRoleName(agent.role)}</span>
            </NavLink>
          );
        })}

        {/* Threads Section */}
        <button
          onClick={() => setThreadsOpen(!threadsOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 mt-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-400 cursor-pointer"
        >
          {threadsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <MessageSquare className="w-4 h-4" />
          Threads
        </button>
        {threadsOpen && activeThreads.map(task => {
          const dotColor = STATUS_DOT_COLOR[task.status] || 'bg-slate-400';
          return (
            <div key={task.id} className="group relative">
              <NavLink
                to={`/chat/task/${task.id}`}
                className={({ isActive }) =>
                  `flex flex-col gap-0.5 px-3 py-1.5 rounded-md text-base transition-colors ${
                    isActive ? 'text-orange-400 font-medium bg-slate-700/50' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
                  }`
                }
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                  <span className="text-[10px] text-slate-500 font-mono">{task.guid}</span>
                </div>
                <span className="truncate pl-3.5">{task.title}</span>
              </NavLink>
              <button
                onClick={(e) => toggleArchive(task.id, e)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
              className="flex items-center gap-1.5 px-3 py-1.5 mt-2 text-[10px] font-semibold text-slate-600 uppercase tracking-wider hover:text-slate-400 cursor-pointer"
            >
              {showArchived ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Archive className="w-3 h-3" />
              Archived ({archivedList.length})
            </button>
            {showArchived && archivedList.map(task => (
              <div key={task.id} className="group relative">
                <NavLink
                  to={`/chat/task/${task.id}`}
                  className={({ isActive }) =>
                    `flex flex-col gap-0.5 px-3 py-1.5 rounded-md text-base transition-colors opacity-50 ${
                      isActive ? 'text-orange-400 font-medium bg-slate-700/50' : 'text-slate-500 hover:text-slate-400 hover:bg-slate-700/30'
                    }`
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 font-mono">{task.guid}</span>
                  </div>
                  <span className="truncate pl-0">{task.title}</span>
                </NavLink>
                <button
                  onClick={(e) => toggleArchive(task.id, e)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-600 hover:text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
  );
}
