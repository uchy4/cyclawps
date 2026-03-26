import { useParams } from 'react-router-dom';
import { Board } from '@agents-manager/kanban/components/Board.js';
import { useSocket } from '@agents-manager/shared';

export function KanbanView() {
  const { connected } = useSocket();
  const { guid } = useParams<{ guid?: string }>();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden px-8 py-6">
        <Board connected={connected} initialTaskGuid={guid} />
      </div>
    </div>
  );
}
