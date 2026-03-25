import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { LayoutGrid, MessageSquare, Bot, ChevronRight } from 'lucide-react';

interface AgentInfo {
  role: string;
  name: string;
  displayName: string | null;
}

export function Sidebar() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [chatExpanded, setChatExpanded] = useState(false);
  const location = useLocation();

  // Auto-expand chat section when on a chat route
  useEffect(() => {
    if (location.pathname.startsWith('/chat')) {
      setChatExpanded(true);
    }
  }, [location.pathname]);

  // Fetch agents for sub-nav
  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(data => setAgents(data))
      .catch(() => {});
  }, []);

  const isChatActive = location.pathname.startsWith('/chat');

  return (
    <nav className="w-16 lg:w-56 bg-slate-900 border-r border-slate-700 flex flex-col shrink-0">
      <div className="p-4 border-b border-slate-700 flex justify-between items-baseline gap-3">
        <img src="/favicon.svg" alt="Logo" className="h-12" />
        <h1 className="text-2xl font-mono tracking-wider font-semibold text-white hidden lg:block">Cy<span className="font-bold text-orange-400 text-[1.75rem]">CLAW</span>ps</h1>
        <span className="text-lg lg:hidden block text-center"><img src="/favicon.svg" alt="Logo" className="h-8" /></span>
      </div>
      <div className="flex flex-col gap-0.5 p-2 flex-1 overflow-y-auto">
        {/* Kanban */}
        <NavLink
          to="/kanban"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isActive ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`
          }
        >
          <LayoutGrid className="w-6 h-6 shrink-0" />
          <span className="hidden lg:inline">Kanban</span>
        </NavLink>

        {/* Chat section with sub-items */}
        <div>
          <button
            onClick={() => setChatExpanded(!chatExpanded)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
              isChatActive ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <MessageSquare className="w-6 h-6 shrink-0" />
            <span className="hidden lg:inline flex-1 text-left">Chat</span>
            <ChevronRight className={`hidden lg:inline w-3.5 h-3.5 transition-transform ${chatExpanded ? 'rotate-90' : ''}`} />
          </button>

          {chatExpanded && (
            <div className="hidden lg:flex flex-col gap-0.5 ml-5 mt-0.5">
              <NavLink
                to="/chat"
                end
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive ? 'text-violet-400 font-medium' : 'text-slate-500 hover:text-slate-300'
                  }`
                }
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                Team
              </NavLink>
              {agents.map(agent => (
                <NavLink
                  key={agent.role}
                  to={`/chat/${agent.role}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isActive ? 'text-violet-400 font-medium' : 'text-slate-500 hover:text-slate-300'
                    }`
                  }
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  {agent.displayName || agent.name}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {/* Agents */}
        <NavLink
          to="/configurator"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isActive ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`
          }
        >
          <Bot className="w-6 h-6 shrink-0" />
          <span className="hidden lg:inline">Agents</span>
        </NavLink>
      </div>
      <div className="p-3 border-t border-slate-700">
        <div className="text-[10px] text-slate-500 hidden lg:block">Cyclawps v0.1</div>
      </div>
    </nav>
  );
}
