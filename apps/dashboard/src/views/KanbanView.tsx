import { useParams } from 'react-router-dom';
import { Board } from '@app/kanban/components/Board';
import { useSocket } from '@app/shared';

export function KanbanView() {
  const { connected } = useSocket();
  const { guid } = useParams<{ guid?: string }>();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden py-6 px-4">
        <Board connected={connected} initialTaskGuid={guid} />
      </div>
    </div>
  );
}
