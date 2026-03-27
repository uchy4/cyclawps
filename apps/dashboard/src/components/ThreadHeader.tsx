import { useState, useEffect, useRef } from 'react';
import { Plus, X, Tag } from 'lucide-react';
import type { Thread, AgentConfig, Task } from '@app/shared';
import { ROLE_COLORS, formatRoleName } from '@app/shared';

interface AgentInfo {
  role: string;
  name: string;
  displayName: string | null;
  accentColor: string | null;
}

interface ThreadHeaderProps {
  thread: Thread;
  agents: AgentInfo[];
  onThreadUpdate: (thread: Thread) => void;
}

export function ThreadHeader({ thread, agents, onThreadUpdate }: ThreadHeaderProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(thread.name);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [allAgents, setAllAgents] = useState<AgentConfig[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameValue(thread.name);
  }, [thread.name]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // Fetch full agent list for picker
  useEffect(() => {
    if (!showAgentPicker) return;
    fetch('/api/agents')
      .then((r) => r.json())
      .then(setAllAgents)
      .catch(() => { /* ignore */ });
  }, [showAgentPicker]);

  // Fetch tasks for picker
  useEffect(() => {
    if (!showTaskPicker) return;
    fetch('/api/tasks')
      .then((r) => r.json())
      .then(setAllTasks)
      .catch(() => { /* ignore */ });
  }, [showTaskPicker]);

  const saveName = async () => {
    setEditingName(false);
    if (nameValue.trim() && nameValue.trim() !== thread.name) {
      const res = await fetch(`/api/threads/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameValue.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        onThreadUpdate(updated);
      }
    }
  };

  const addParticipant = async (agentRole: string) => {
    setShowAgentPicker(false);
    const res = await fetch(`/api/threads/${thread.id}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentRole }),
    });
    if (res.ok) {
      const participant = await res.json();
      onThreadUpdate({
        ...thread,
        participants: [...thread.participants, participant],
      });
      const agent = agents.find((a) => a.role === agentRole);
      const name = agent?.displayName || formatRoleName(agentRole);
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderType: 'system', senderName: 'system', content: `@${name} added to thread`, threadId: thread.id }),
      });
    }
  };

  const removeParticipant = async (agentRole: string) => {
    const res = await fetch(`/api/threads/${thread.id}/participants/${agentRole}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      onThreadUpdate({
        ...thread,
        participants: thread.participants.filter((p) => p.agentRole !== agentRole),
      });
      const agent = agents.find((a) => a.role === agentRole);
      const name = agent?.displayName || formatRoleName(agentRole);
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderType: 'system', senderName: 'system', content: `@${name} removed from thread`, threadId: thread.id }),
      });
    }
  };

  const addTaskTag = async (taskId: string) => {
    setShowTaskPicker(false);
    const res = await fetch(`/api/threads/${thread.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    });
    if (res.ok) {
      const tag = await res.json();
      onThreadUpdate({
        ...thread,
        taskTags: [...thread.taskTags, tag],
      });
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderType: 'system', senderName: 'system', content: `#${tag.taskGuid} added to thread`, threadId: thread.id }),
      });
    }
  };

  const removeTaskTag = async (taskId: string) => {
    const tag = thread.taskTags.find((t) => t.taskId === taskId);
    const res = await fetch(`/api/threads/${thread.id}/tasks/${taskId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      onThreadUpdate({
        ...thread,
        taskTags: thread.taskTags.filter((t) => t.taskId !== taskId),
      });
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderType: 'system', senderName: 'system', content: `#${tag?.taskGuid || 'task'} removed from thread`, threadId: thread.id }),
      });
    }
  };

  const participantRoles = new Set((thread.participants || []).map((p) => p.agentRole));
  const taggedTaskIds = new Set((thread.taskTags || []).map((t) => t.taskId));
  const availableAgents = allAgents.filter((a) => !participantRoles.has(a.role));
  const availableTasks = allTasks.filter((t) => !taggedTaskIds.has(t.id));

  return (
    <div className="px-8 py-3 border-b border-slate-700 bg-slate-800/50">
      {/* Thread name */}
      <div className="flex items-center gap-2 mb-2">
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName();
              if (e.key === 'Escape') {
                setNameValue(thread.name);
                setEditingName(false);
              }
            }}
            className="bg-transparent text-white text-lg font-semibold outline-none border-b border-orange-400 pb-0.5"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="text-white text-lg font-semibold hover:text-orange-400 transition-colors cursor-pointer"
          >
            {thread.name}
          </button>
        )}
      </div>

      {/* Participants */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Agents</span>
        {(thread.participants || []).map((p) => {
          const agentInfo = agents.find((a) => a.role === p.agentRole);
          const color = agentInfo?.accentColor || ROLE_COLORS[p.agentRole] || '#8b949e';
          return (
            <span
              key={p.agentRole}
              className="group inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-slate-600"
              style={{ borderColor: color + '40', color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
              {agentInfo?.displayName || formatRoleName(p.agentRole)}
              <button
                onClick={() => removeParticipant(p.agentRole)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <div className="relative">
          <button
            onClick={() => { setShowAgentPicker(!showAgentPicker); setShowTaskPicker(false); }}
            className="w-5 h-5 flex items-center justify-center rounded-full border border-slate-600 text-slate-500 hover:text-orange-400 hover:border-orange-400 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
          {showAgentPicker && (
            <div className="absolute top-7 left-0 z-10 bg-slate-800 border border-slate-700 rounded-lg py-1 shadow-lg min-w-[180px] max-h-48 overflow-y-auto">
              {availableAgents.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-500">No more agents</div>
              )}
              {availableAgents.map((a) => (
                <button
                  key={a.role}
                  onClick={() => addParticipant(a.role)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-slate-300 hover:bg-slate-700/50 cursor-pointer transition-colors"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: a.accentColor || ROLE_COLORS[a.role] || '#8b949e' }}
                  />
                  {a.displayName || formatRoleName(a.role)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Tasks</span>
        {(thread.taskTags || []).map((tag) => (
          <span
            key={tag.taskId}
            className="group inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300"
          >
            <Tag className="w-3 h-3 text-slate-500" />
            <span className="text-orange-400/80 font-mono">{tag.taskGuid}</span>
            <span className="truncate max-w-[120px]">{tag.taskTitle}</span>
            <button
              onClick={() => removeTaskTag(tag.taskId)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="relative">
          <button
            onClick={() => { setShowTaskPicker(!showTaskPicker); setShowAgentPicker(false); }}
            className="w-5 h-5 flex items-center justify-center rounded-full border border-slate-600 text-slate-500 hover:text-orange-400 hover:border-orange-400 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
          {showTaskPicker && (
            <div className="absolute top-7 left-0 z-10 bg-slate-800 border border-slate-700 rounded-lg py-1 shadow-lg min-w-[220px] max-h-48 overflow-y-auto">
              {availableTasks.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-500">No more tasks</div>
              )}
              {availableTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => addTaskTag(t.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-slate-300 hover:bg-slate-700/50 cursor-pointer transition-colors"
                >
                  <span className="text-orange-400/80 font-mono text-xs">{t.guid}</span>
                  <span className="truncate">{t.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
