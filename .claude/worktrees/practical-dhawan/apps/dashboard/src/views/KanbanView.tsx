import { useParams } from 'react-router-dom';
import { Board } from '@agents-manager/kanban/components/Board.js';
import { useSocket } from '@agents-manager/shared';

export function KanbanView() {
  const { connected } = useSocket();
  const { guid } = useParams<{ guid?: string }>();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-8 pt-8 pb-4 shrink-0">
        <h2 className="text-xl font-semibold text-white">Kanban Board</h2>
        <span
          aria-live="polite"
          aria-label={connected ? 'Connected' : 'Disconnected'}
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${connected ? 'bg-green-400' : 'bg-red-400'}`}
        />
      </div>
      {/* Board fills remaining height */}
      <div className="flex-1 overflow-hidden px-8 pb-8">
        <Board connected={connected} initialTaskGuid={guid} />
      </div>
    </div>
  );
}
