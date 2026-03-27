import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Task } from '@app/shared';
import { TaskCard } from './TaskCard.js';

interface SortableTaskCardProps {
  task: Task;
  onClick: () => void;
}

export function SortableTaskCard({ task, onClick }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: task.id,
    data: { type: 'task', task },
  });

  // Disable this card's droppable when it's being dragged —
  // otherwise the pointer is always "within" its own slot
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `slot-${task.id}`,
    data: { type: 'task-slot', taskId: task.id },
    disabled: isDragging,
  });

  return (
    <div ref={setDropRef} className="relative">
      {isOver && !isDragging && (
        <div className="absolute -top-2.5 left-2 right-2 h-[3px] bg-orange-500 rounded-full z-10 shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
      )}
      <div ref={setDragRef} {...attributes} {...listeners}>
        <TaskCard
          task={task}
          onClick={onClick}
          isDragging={isDragging}
          className={isDragging ? '!opacity-30 !border-orange-500/50' : ''}
        />
      </div>
    </div>
  );
}
