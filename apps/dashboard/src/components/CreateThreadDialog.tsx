import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Check } from 'lucide-react';
import type { AgentConfig, Task } from '@app/shared';
import { ROLE_COLORS, formatRoleName } from '@app/shared';
import { useAgents, useTasks, useCreateThread } from '../api/index.js';

interface CreateThreadDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateThreadDialog({ open, onClose }: CreateThreadDialogProps) {
  const [name, setName] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const nameRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: agents = [] } = useAgents();
  const { data: tasks = [] } = useTasks();
  const createThreadMutation = useCreateThread();

  useEffect(() => {
    if (!open) return;
    setName('');
    setSelectedAgents(new Set());
    setSelectedTasks(new Set());
    setTimeout(() => nameRef.current?.focus(), 100);
  }, [open]);

  if (!open) return null;

  const toggleAgent = (role: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const toggleTask = (id: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    if (!name.trim() || createThreadMutation.isPending) return;
    createThreadMutation.mutate(
      {
        name: name.trim(),
        participantRoles: [...selectedAgents],
        taskIds: [...selectedTasks],
      },
      {
        onSuccess: (thread) => {
          onClose();
          navigate(`/chat/thread/${thread.id}`);
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
          <h2 className="text-base font-semibold text-white">New Thread</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Thread Name</label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="e.g. Sprint Planning, Bug Triage..."
              className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-400 transition-colors"
            />
          </div>

          {/* Agents */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Agents (optional)</label>
            <div className="flex flex-wrap gap-1.5">
              {agents.map((a) => {
                const selected = selectedAgents.has(a.role);
                const color = a.accentColor || ROLE_COLORS[a.role] || '#8b949e';
                return (
                  <button
                    key={a.role}
                    onClick={() => toggleAgent(a.role)}
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                      selected
                        ? 'border-orange-400/50 bg-orange-400/10 text-orange-400'
                        : 'border-zinc-600 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    {a.displayName || formatRoleName(a.role)}
                    {selected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tasks */}
          {tasks.length > 0 && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Tag Tasks (optional)</label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {tasks.map((t) => {
                  const selected = selectedTasks.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTask(t.id)}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                        selected
                          ? 'border-orange-400/50 bg-orange-400/10 text-orange-400'
                          : 'border-zinc-600 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      <span className="font-mono text-[10px]">{t.guid}</span>
                      <span className="truncate max-w-[120px]">{t.title}</span>
                      {selected && <Check className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-zinc-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || createThreadMutation.isPending}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              name.trim() && !createThreadMutation.isPending
                ? 'bg-orange-500 text-white hover:bg-orange-600 cursor-pointer'
                : 'bg-zinc-700 text-zinc-500 cursor-default'
            }`}
          >
            {createThreadMutation.isPending ? 'Creating...' : 'Create Thread'}
          </button>
        </div>
      </div>
    </div>
  );
}
