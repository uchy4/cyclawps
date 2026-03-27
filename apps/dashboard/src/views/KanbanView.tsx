import { useParams } from 'react-router-dom';
import { Board } from '@cyclawps/kanban/components/Board.js';
import { useSocket } from '@cyclawps/shared';

export function KanbanView() {
  const { connected } = useSocket();
  const { guid } = useParams<{ guid?: string }>();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden px-6">
        <Board connected={connected} initialTaskGuid={guid} />
      </div>
    </div>
  );
}
