import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import type { Task, TaskStatus } from '@cyclawps/shared';
import { SortableTaskCard } from './SortableTaskCard.js';

function ColumnTopDrop({ status }: { status: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `top-${status}`,
    data: { type: 'column-top', status },
  });

  return (
    <div ref={setNodeRef}>
      {isOver && (
        <div className="absolute bottom-0 left-2 right-2 h-[3px] bg-orange-500 rounded-full z-10 shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
      )}
    </div>
  );
}

interface ColumnProps {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
  onClickTask: (task: Task) => void;
  onCreateTask: (status: TaskStatus) => void;
}

export function Column({ status, label, color, tasks, onClickTask, onCreateTask }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header */}
      <div className="flex items-center justify-between mb-2 px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden="true"
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: color }}
          />
          <h2 className="text-lg font-semibold text-white">{label}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400 bg-slate-700/60 min-w-[28px] text-center py-0.5 px-2 rounded-full tabular-nums font-medium">
            {tasks.length}
          </span>
          <button
            onClick={() => onCreateTask(status)}
            aria-label={`Add new task to ${label}`}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-orange-400 hover:bg-orange-600/20 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none transition-colors cursor-pointer"
          >
            <Plus aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable card area — pr-2 pushes scrollbar toward the divider */}
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 transition-colors rounded-xl ${
          isOver ? 'bg-orange-600/5' : ''
        }`}
      >
        <div className="flex flex-col gap-4">
          <ColumnTopDrop status={status} />
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} onClick={() => onClickTask(task)} />
          ))}
          <button
            onClick={() => onCreateTask(status)}
            aria-label={`Add new task to ${label}`}
            className="w-full min-h-[56px] border-2 border-dashed border-slate-600 rounded-2xl text-slate-400 hover:border-orange-500 hover:text-orange-400 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Plus aria-hidden="true" className="w-5 h-5" />
            <span className="text-base font-medium">New</span>
          </button>
        </div>
      </div>
    </div>
  );
}
