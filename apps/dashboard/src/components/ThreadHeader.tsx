import { useState, useEffect, useRef } from 'react';
import { Plus, X, Tag } from 'lucide-react';
import type { Thread, AgentConfig } from '@app/shared';
import { ROLE_COLORS, formatRoleName } from '@app/shared';
import {
  useAgents,
  useTasks,
  useUpdateThread,
  useAddParticipant,
  useRemoveParticipant,
  useAddTaskTag,
  useRemoveTaskTag,
} from '../api/index.js';

interface ThreadHeaderProps {
  thread: Thread;
  onThreadUpdate: (thread?: Thread) => void;
}

export function ThreadHeader({ thread, onThreadUpdate }: ThreadHeaderProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(thread.name);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { data: allAgents = [] } = useAgents();
  const { data: allTasks = [] } = useTasks();
  const updateThreadMutation = useUpdateThread();
  const addParticipantMutation = useAddParticipant();
  const removeParticipantMutation = useRemoveParticipant();
  const addTaskTagMutation = useAddTaskTag();
  const removeTaskTagMutation = useRemoveTaskTag();

  // Derive agents list in the shape the parent expects
  const agents: { role: string; name: string; displayName: string | null; accentColor: string | null }[] = allAgents;

  useEffect(() => {
    setNameValue(thread.name);
  }, [thread.name]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const saveName = () => {
    setEditingName(false);
    if (nameValue.trim() && nameValue.trim() !== thread.name) {
      updateThreadMutation.mutate(
        { id: thread.id, name: nameValue.trim() },
        { onSuccess: (updated) => onThreadUpdate(updated) },
      );
    }
  };

  const addParticipant = (agentRole: string) => {
    setShowAgentPicker(false);
    const agent = agents.find((a) => a.role === agentRole);
    const name = agent?.displayName || formatRoleName(agentRole);
    addParticipantMutation.mutate(
      { threadId: thread.id, agentRole, systemMessage: `@${name} added to thread` },
      {
        onSuccess: (participant) => {
          onThreadUpdate({
            ...thread,
            participants: [...thread.participants, participant],
          });
        },
      },
    );
  };

  const removeParticipant = (agentRole: string) => {
    const agent = agents.find((a) => a.role === agentRole);
    const name = agent?.displayName || formatRoleName(agentRole);
    removeParticipantMutation.mutate(
      { threadId: thread.id, agentRole, systemMessage: `@${name} removed from thread` },
      {
        onSuccess: () => {
          onThreadUpdate({
            ...thread,
            participants: thread.participants.filter((p) => p.agentRole !== agentRole),
          });
        },
      },
    );
  };

  const addTaskTag = (taskId: string) => {
    setShowTaskPicker(false);
    const task = allTasks.find((t) => t.id === taskId);
    addTaskTagMutation.mutate(
      { threadId: thread.id, taskId, systemMessage: `#${task?.guid || 'task'} added to thread` },
      {
        onSuccess: (tag) => {
          onThreadUpdate({
            ...thread,
            taskTags: [...thread.taskTags, tag],
          });
        },
      },
    );
  };

  const removeTaskTag = (taskId: string) => {
    const tag = thread.taskTags.find((t) => t.taskId === taskId);
    removeTaskTagMutation.mutate(
      { threadId: thread.id, taskId, systemMessage: `#${tag?.taskGuid || 'task'} removed from thread` },
      {
        onSuccess: () => {
          onThreadUpdate({
            ...thread,
            taskTags: thread.taskTags.filter((t) => t.taskId !== taskId),
          });
        },
      },
    );
  };

  const participantRoles = new Set((thread.participants || []).map((p) => p.agentRole));
  const taggedTaskIds = new Set((thread.taskTags || []).map((t) => t.taskId));
  const availableAgents = allAgents.filter((a) => !participantRoles.has(a.role));
  const availableTasks = allTasks.filter((t) => !taggedTaskIds.has(t.id));

  return (
    <div className="px-8 py-3 border-b border-zinc-700 bg-zinc-800/50">
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
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider mr-1">Agents</span>
        {(thread.participants || []).map((p) => {
          const agentInfo = agents.find((a) => a.role === p.agentRole);
          const color = agentInfo?.accentColor || ROLE_COLORS[p.agentRole] || '#8b949e';
          return (
            <span
              key={p.agentRole}
              className="group inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-zinc-600"
              style={{ borderColor: color + '40', color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
              {agentInfo?.displayName || formatRoleName(p.agentRole)}
              <button
                onClick={() => removeParticipant(p.agentRole)}
                className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 transition-opacity cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <div className="relative">
          <button
            onClick={() => { setShowAgentPicker(!showAgentPicker); setShowTaskPicker(false); }}
            className="w-5 h-5 flex items-center justify-center rounded-full border border-zinc-600 text-zinc-500 hover:text-orange-400 hover:border-orange-400 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
          {showAgentPicker && (
            <div className="absolute top-7 left-0 z-10 bg-zinc-800 border border-zinc-700 rounded-lg py-1 shadow-lg min-w-[180px] max-h-48 overflow-y-auto">
              {availableAgents.length === 0 && (
                <div className="px-3 py-2 text-xs text-zinc-500">No more agents</div>
              )}
              {availableAgents.map((a) => (
                <button
                  key={a.role}
                  onClick={() => addParticipant(a.role)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-zinc-300 hover:bg-zinc-700/50 cursor-pointer transition-colors"
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
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider mr-1">Tasks</span>
        {(thread.taskTags || []).map((tag) => (
          <span
            key={tag.taskId}
            className="group inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-300"
          >
            <Tag className="w-3 h-3 text-zinc-500" />
            <span className="text-orange-400/80 font-mono">{tag.taskGuid}</span>
            <span className="truncate max-w-[120px]">{tag.taskTitle}</span>
            <button
              onClick={() => removeTaskTag(tag.taskId)}
              className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-400 transition-opacity cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="relative">
          <button
            onClick={() => { setShowTaskPicker(!showTaskPicker); setShowAgentPicker(false); }}
            className="w-5 h-5 flex items-center justify-center rounded-full border border-zinc-600 text-zinc-500 hover:text-orange-400 hover:border-orange-400 transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
          {showTaskPicker && (
            <div className="absolute top-7 left-0 z-10 bg-zinc-800 border border-zinc-700 rounded-lg py-1 shadow-lg min-w-[220px] max-h-48 overflow-y-auto">
              {availableTasks.length === 0 && (
                <div className="px-3 py-2 text-xs text-zinc-500">No more tasks</div>
              )}
              {availableTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => addTaskTag(t.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-zinc-300 hover:bg-zinc-700/50 cursor-pointer transition-colors"
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
