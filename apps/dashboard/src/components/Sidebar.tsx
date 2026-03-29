import { NavLink } from 'react-router-dom';
import { LayoutGrid, MessageSquare, Bot } from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const showLabels = !collapsed;

  const linkPadX = collapsed ? 10 : 12;
  const linkClass = (isActive: boolean) =>
    `flex items-center gap-3 py-2.5 rounded-lg transition-all duration-200 ${
      isActive ? 'bg-zinc-700/50 text-orange-400 font-medium' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50'
    }`;

  return (
    <nav className={`${collapsed ? 'w-14' : 'w-14 lg:w-60'} bg-zinc-800 border-r border-zinc-700 flex flex-col shrink-0 transition-all duration-200`}>
      <div className="flex flex-col gap-0.5 p-2 flex-1 overflow-y-auto">
        <NavLink
          to="/kanban"
          className={({ isActive }) => linkClass(isActive)}
          style={{ paddingLeft: linkPadX, paddingRight: linkPadX }}
        >
          <LayoutGrid className="shrink-0 transition-all duration-200" style={{ width: collapsed ? 20 : 16, height: collapsed ? 20 : 16 }} />
          {showLabels && <span className="hidden lg:inline">Tasks</span>}
        </NavLink>

        <NavLink
          to="/chat"
          className={({ isActive }) => linkClass(isActive)}
          style={{ paddingLeft: linkPadX, paddingRight: linkPadX }}
        >
          <MessageSquare className="shrink-0 transition-all duration-200" style={{ width: collapsed ? 20 : 16, height: collapsed ? 20 : 16 }} />
          {showLabels && <span className="hidden lg:inline">Chat</span>}
        </NavLink>

        <NavLink
          to="/configurator"
          className={({ isActive }) => linkClass(isActive)}
          style={{ paddingLeft: linkPadX, paddingRight: linkPadX }}
        >
          <Bot className="shrink-0 transition-all duration-200" style={{ width: collapsed ? 20 : 16, height: collapsed ? 20 : 16 }} />
          {showLabels && <span className="hidden lg:inline">Agents</span>}
        </NavLink>
      </div>
      <div className="p-3 border-t border-zinc-700 overflow-hidden">
        <div className="text-[10px] text-zinc-500 whitespace-nowrap">
          {showLabels ? <span className="hidden lg:inline">Cyclawps </span> : null}v0.1
        </div>
      </div>
    </nav>
  );
}
