import { forwardRef } from 'react';
import type { Task } from '@app/shared';
import { AgentBadge } from './AgentBadge.js';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
  style?: React.CSSProperties;
}

export const TaskCard = forwardRef<HTMLButtonElement, TaskCardProps & React.HTMLAttributes<HTMLButtonElement>>(
  function TaskCard({ task, onClick, isDragging, style, className, ...dragProps }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        style={style}
        className={`min-w-[150px] min-h-[150px] bg-slate-800 rounded-2xl p-5 border border-slate-700/80 hover:border-orange-500/40 shadow-sm shadow-black/20 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none transition-colors cursor-pointer flex flex-col text-left w-full ${
          isDragging ? 'opacity-50 shadow-lg shadow-orange-500/10 border-orange-500/50 z-50' : ''
        } ${className || ''}`}
        {...dragProps}
      >
        {task.guid && (
          <span className="text-[10px] font-mono text-slate-500 mb-1">{task.guid}</span>
        )}
        <div className="text-sm font-semibold text-white mb-2">{task.title}</div>
        {task.description && (
          <p className="text-xs text-slate-400 mb-4 leading-relaxed line-clamp-3 flex-1">
            {task.description}
          </p>
        )}
        {/* Footer — more padding, vertically centered */}
        <div className="flex items-center gap-2 flex-wrap mt-auto pt-3 border-t border-slate-700/40 min-h-[32px]">
          {task.assignedAgent && <AgentBadge role={task.assignedAgent} />}
          {task.priority > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 tabular-nums font-medium">
              P{task.priority}
            </span>
          )}
          {task.pipelineStageId && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-600/20 text-orange-400">
              {task.pipelineStageId}
            </span>
          )}
          {!task.assignedAgent && task.priority === 0 && !task.pipelineStageId && (
            <span className="text-[10px] text-slate-500">Unassigned</span>
          )}
        </div>
      </button>
    );
  }
);
