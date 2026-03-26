import { useLocation } from 'react-router-dom';
import { formatRoleName, useSocket } from '@agents-manager/shared';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

function usePageTitle(): string {
  const location = useLocation();
  const path = location.pathname;

  if (path.startsWith('/chat/')) {
    const role = path.split('/chat/')[1];
    return role ? formatRoleName(role) : 'Team Chat';
  }
  if (path.startsWith('/chat')) return 'Team Chat';
  if (path.startsWith('/kanban')) return 'Tasks';
  if (path.startsWith('/configurator')) return 'Agents';
  return '';
}

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Header({ collapsed, onToggle }: HeaderProps) {
  const title = usePageTitle();
  const { connected } = useSocket();
  const location = useLocation();
  const showStatus = location.pathname.startsWith('/kanban');

  return (
    <header className="flex items-center bg-slate-800 border-b-2 border-orange-400 shrink-0">
      <div className={`${collapsed ? 'w-14' : 'w-20 lg:w-60'} px-4 flex items-center gap-4 shrink-0 border-r border-slate-700 transition-all duration-200`}>
        <img src="/claw.svg" alt="Logo" className="h-14" />
        {!collapsed && (
          <h1 className="text-2xl italic text-slate-500 font-mono tracking-wider font-semibold hidden lg:block uppercase">
            cy<span className="font-bold not-italic text-orange-400">CLAW</span>ps
          </h1>
        )}
      </div>
      <div className="flex-1 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggle}
            className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-6 h-6" /> : <ChevronLeft className="w-6 h-6" />}
          </button>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
        </div>
        {showStatus && (
          <span
            aria-live="polite"
            aria-label={connected ? 'Connected' : 'Disconnected'}
            className={`h-2.5 w-2.5 rounded-full shrink-0 ${connected ? 'bg-green-400' : 'bg-red-400'}`}
          />
        )}
      </div>
    </header>
  );
}
