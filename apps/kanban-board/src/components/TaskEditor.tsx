import { useState, useEffect } from 'react';
import type { Task, TaskStatus, CreateTaskInput } from '@agents-manager/shared';

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder-slate-400 text-sm focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none transition-colors';
const labelClass = 'block text-sm font-medium text-slate-300 mb-1.5';

interface TaskEditorProps {
  task: Task | null; // null = creating new task
  defaultStatus?: TaskStatus;
  onSave: (id: string | null, data: CreateTaskInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}

export function TaskEditor({ task, defaultStatus, onSave, onDelete, onClose }: TaskEditorProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CreateTaskInput>({
    title: '',
    description: '',
    status: defaultStatus || 'todo',
    assignedAgent: '',
    priority: 0,
    sortOrder: 0,
  });
  const [agents, setAgents] = useState<Array<{ role: string; name: string; displayName: string | null }>>([]);

  // Load agents for the dropdown
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then(setAgents)
      .catch(() => {});
  }, []);

  // Populate form when editing existing task
  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description || '',
        status: task.status,
        assignedAgent: task.assignedAgent || '',
        priority: task.priority,
        sortOrder: task.sortOrder ?? 0,
      });
    }
  }, [task]);

  const updateField = (field: keyof CreateTaskInput, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.title?.trim()) return;
    setSaving(true);
    try {
      await onSave(task?.id || null, {
        ...formData,
        assignedAgent: formData.assignedAgent || undefined,
      });
      onClose();
    } catch (err) {
      alert(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !onDelete) return;
    if (!confirm(`Delete task "${task.title}"?`)) return;
    await onDelete(task.id);
    onClose();
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <label htmlFor="task-title" className={labelClass}>Title *</label>
        <input
          id="task-title"
          name="title"
          type="text"
          value={formData.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Task title…"
          className={inputClass}
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="task-description" className={labelClass}>Description</label>
        <textarea
          id="task-description"
          name="description"
          value={formData.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Describe what needs to be done…"
          rows={5}
          className={`${inputClass} resize-y`}
        />
      </div>

      {/* Status + Priority + Order row */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="task-status" className={labelClass}>Status</label>
          <select
            id="task-status"
            name="status"
            value={formData.status}
            onChange={(e) => updateField('status', e.target.value)}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="task-priority" className={labelClass}>Priority</label>
          <input
            id="task-priority"
            name="priority"
            type="number"
            min={0}
            max={10}
            value={formData.priority || 0}
            onChange={(e) => updateField('priority', parseInt(e.target.value, 10) || 0)}
            className={inputClass}
          />
          <p className="text-xs text-slate-500 mt-1">0–10, higher = more urgent</p>
        </div>
        <div>
          <label htmlFor="task-order" className={labelClass}>Order</label>
          <input
            id="task-order"
            name="sortOrder"
            type="number"
            min={0}
            value={formData.sortOrder ?? 0}
            onChange={(e) => updateField('sortOrder', parseInt(e.target.value, 10) || 0)}
            className={inputClass}
          />
          <p className="text-xs text-slate-500 mt-1">Position in column</p>
        </div>
      </div>

      {/* Assigned Agent */}
      <div>
        <label htmlFor="task-agent" className={labelClass}>Assigned Agent</label>
        <select
          id="task-agent"
          name="assignedAgent"
          value={formData.assignedAgent || ''}
          onChange={(e) => updateField('assignedAgent', e.target.value)}
          className={inputClass}
        >
          <option value="">Unassigned</option>
          {agents.map((a) => (
            <option key={a.role} value={a.role}>{a.displayName || a.name} ({a.role})</option>
          ))}
        </select>
      </div>

      {/* Metadata (read-only for now if task exists) */}
      {task && (
        <div className="text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-700">
          <p>Created: {new Date(task.createdAt).toLocaleString()}</p>
          <p>Updated: {new Date(task.updatedAt).toLocaleString()}</p>
          {task.pipelineStageId && <p>Pipeline stage: {task.pipelineStageId}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-slate-700">
        <button
          onClick={handleSave}
          disabled={saving || !formData.title?.trim()}
          className="px-6 py-2.5 rounded-lg bg-violet-600 text-white font-medium text-sm hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none transition-colors disabled:opacity-50 disabled:cursor-default cursor-pointer"
        >
          {saving ? 'Saving…' : task ? 'Update Task' : 'Create Task'}
        </button>
        {task && onDelete && (
          <button
            onClick={handleDelete}
            className="px-4 py-2.5 rounded-lg border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none transition-colors cursor-pointer"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
