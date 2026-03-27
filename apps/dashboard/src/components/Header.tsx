import { useLocation } from 'react-router-dom';
import { useSocket } from '@cyclawps/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Task } from '@cyclawps/shared';

function usePageTitle(): string {
  const location = useLocation();
  const path = location.pathname;
  const [task, setTask] = useState<Task | null>(null);

  const taskMatch = path.match(/^\/chat\/task\/(.+)$/);
  const taskId = taskMatch?.[1] || null;

  useEffect(() => {
    if (!taskId) { setTask(null); return; }
    fetch(`/api/tasks/${taskId}`)
      .then(r => r.json())
      .then(data => setTask(data))
      .catch(() => setTask(null));
  }, [taskId]);

  if (taskId && task) return `${task.guid} — ${task.title}`;
  if (taskId) return 'Thread';
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
    <header className="flex items-center bg-slate-800 border-b-2 border-orange-400 shrink-0 h-14">
      <div className={`${collapsed ? 'w-14' : 'w-20 lg:w-60'} flex justify-center items-center gap-3 shrink-0 border-r border-slate-700 transition-all duration-200`}>
        <img src="/claw.svg" alt="Logo" className={collapsed ? "w-8 h-12 m-2" : "h-12 m-2"} />
        {!collapsed && (
          <h1 className="text-2xl text-slate-500 font-mono tracking-wider font-semibold hidden lg:block">
            cy<span className="font-bold italic text-orange-400 pr-[2px]">CLAW</span>ps
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
