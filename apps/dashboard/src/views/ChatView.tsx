import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  useMessages,
  type PendingAuth,
} from '@app/chat/hooks/useMessages';
import { MessageBubble } from '@app/chat/components/MessageBubble';
import { AuthorizationBanner } from '@app/chat/components/AuthorizationBanner';
import { Mic, Send, Loader2, X, Square, Paperclip, AtSign, Hash } from 'lucide-react';
import { useWhisper } from '../hooks/useWhisper.js';
import { useAudioDevices } from '../hooks/useAudioDevices.js';
import { MicSelector } from '../components/MicSelector.js';
import type { Message, Attachment, Thread } from '@app/shared';
import { ROLE_COLORS, Modal } from '@app/shared';
import { ThreadHeader } from '../components/ThreadHeader.js';
import { AgentChatHeader } from '../components/AgentChatHeader.js';
import { ChatEditor, type ChatEditorHandle } from '../components/ChatEditor.js';

interface AgentInfo {
  role: string;
  name: string;
  displayName: string | null;
  accentColor: string | null;
}

const MIN_BAR_H = 4;
const MAX_BAR_H = 64;
const VOLUME_CEIL = 0.7;

export function ChatView() {
  const { threadId, agentRole } = useParams<{
    threadId?: string;
    agentRole?: string;
  }>();
  const {
    messages,
    loading,
    connected,
    pendingAuths,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    authorize,
    refreshMessages,
  } = useMessages(threadId, agentRole);
  const [thread, setThread] = useState<Thread | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ChatEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [tasks, setTasks] = useState<{ id: string; guid: string; title: string }[]>([]);
  const [pickerType, setPickerType] = useState<'agent' | 'task' | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerIndex, setPickerIndex] = useState(0);
  const pickerInputRef = useRef<HTMLInputElement>(null);
  const {
    devices: audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useAudioDevices();
  const whisper = useWhisper(selectedDeviceId);
  const [archives, setArchives] = useState<{ id: string; agentRole: string; name: string; messageCount: number; createdAt: number }[]>([]);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveName, setArchiveName] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Fetch archives for agent chat
  useEffect(() => {
    if (!agentRole) { setArchives([]); return; }
    fetch(`/api/agent-archives/${agentRole}`)
      .then((r) => r.json())
      .then((data) => setArchives(data))
      .catch(() => {});
  }, [agentRole]);

  const handleArchive = useCallback(() => {
    if (!agentRole) return;
    setArchiveName(`Archive ${new Date().toLocaleDateString()}`);
    setArchiveModalOpen(true);
  }, [agentRole]);

  const confirmArchive = useCallback(() => {
    if (!agentRole || !archiveName.trim()) return;
    setArchiveModalOpen(false);
    fetch(`/api/agent-archives/${agentRole}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: archiveName.trim() }),
    })
      .then((r) => r.json())
      .then((result) => {
        if (result.id) {
          setArchives((prev) => [{ id: result.id, agentRole, name: result.name, messageCount: result.messageCount, createdAt: result.createdAt }, ...prev]);
          refreshMessages();
        }
      })
      .catch((err) => console.error('Archive failed:', err));
  }, [agentRole, archiveName, refreshMessages]);

  const handleRestore = useCallback((archiveId: string) => {
    if (!agentRole) return;
    fetch(`/api/agent-archives/${agentRole}/${archiveId}/restore`, { method: 'POST' })
      .then((r) => r.json())
      .then(() => {
        // Re-fetch archives list and messages
        fetch(`/api/agent-archives/${agentRole}`)
          .then(r => r.json())
          .then(data => setArchives(data))
          .catch(() => {});
        refreshMessages();
      })
      .catch(() => {});
  }, [agentRole, refreshMessages]);

  const handleDeleteArchive = useCallback((archiveId: string) => {
    if (!agentRole) return;
    fetch(`/api/agent-archives/${agentRole}/${archiveId}`, { method: 'DELETE' })
      .then(() => {
        setArchives((prev) => prev.filter((a) => a.id !== archiveId));
      })
      .catch(() => {});
  }, [agentRole]);

  // Fetch agents and tasks for mention popups
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data) => setAgents(data))
      .catch(() => {});
    fetch('/api/tasks')
      .then((r) => r.json())
      .then((data: { id: string; guid: string; title: string }[]) => setTasks(data))
      .catch(() => {});
  }, []);

  // Fetch thread details when threadId changes
  useEffect(() => {
    if (!threadId) {
      setThread(null);
      return;
    }
    fetch(`/api/threads/${threadId}`)
      .then((r) => r.json())
      .then((data) => setThread(data))
      .catch(() => setThread(null));
  }, [threadId]);

  // Build mention color map: role keys + display names → accent color
  const mentionColors = useMemo(() => {
    const map: Record<string, string> = { ...ROLE_COLORS };
    for (const a of agents) {
      const color = a.accentColor || ROLE_COLORS[a.role] || '#8b949e';
      map[a.role] = color;
      if (a.displayName) map[a.displayName] = color;
      if (a.displayName) map[a.displayName.replace(/\s+/g, '_')] = color;
      if (a.name) map[a.name] = color;
    }
    return map;
  }, [agents]);

  const prevMessageCount = useRef(0);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  // Clear reply when switching threads/agents
  useEffect(() => {
    setReplyTo(null);
    setAttachments([]);
  }, [threadId, agentRole]);

  // Auto-focus picker input when opened
  useEffect(() => {
    if (pickerType) {
      requestAnimationFrame(() => pickerInputRef.current?.focus());
    }
  }, [pickerType]);

  // Derive chat title
  const chatAgent = agentRole ? agents.find((a) => a.role === agentRole) : null;
  const chatTitle = agentRole
    ? chatAgent?.displayName ||
      agentRole.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    : threadId
    ? thread?.name || 'Thread'
    : 'Global Chat';

  const handleEditorSubmit = useCallback((text: string) => {
    if (!text.trim() && attachments.length === 0) return;
    sendMessage(
      text.trim(),
      threadId,
      replyTo?.id,
      attachments.length > 0 ? attachments : undefined,
      agentRole
    );
    setReplyTo(null);
    setAttachments([]);
  }, [sendMessage, threadId, replyTo, attachments, agentRole]);

  const handleTaskMentioned = useCallback(async (task: { id: string; guid: string }) => {
    if (!threadId || !thread) return;
    const alreadyTagged = (thread.taskTags || []).some((t) => t.taskId === task.id);
    if (alreadyTagged) return;
    const res = await fetch(`/api/threads/${threadId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id }),
    });
    if (res.ok) {
      const tag = await res.json();
      setThread((prev) => prev ? { ...prev, taskTags: [...prev.taskTags, tag] } : prev);
      // Post system message about the tag
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderType: 'system', senderName: 'system', content: `#${task.guid} added to thread`, threadId }),
      });
    }
  }, [threadId, thread]);

  const handleAgentMentioned = useCallback(async (mentionedRole: string) => {
    if (!threadId || !thread) return;
    const alreadyAdded = (thread.participants || []).some((p) => p.agentRole === mentionedRole);
    if (alreadyAdded) return;
    const res = await fetch(`/api/threads/${threadId}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentRole: mentionedRole }),
    });
    if (res.ok) {
      const participant = await res.json();
      setThread((prev) => prev ? { ...prev, participants: [...prev.participants, participant] } : prev);
      const agent = agents.find((a) => a.role === mentionedRole);
      const name = agent?.displayName || agent?.name || mentionedRole;
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderType: 'system', senderName: 'system', content: `@${name} added to thread`, threadId }),
      });
    }
  }, [threadId, thread, agents]);

  const handleMicClick = async () => {
    if (whisper.isRecording) {
      const transcribed = await whisper.stopAndTranscribe();
      if (transcribed) {
        editorRef.current?.insertText(transcribed);
      }
      editorRef.current?.focus();
    } else {
      await whisper.startRecording();
    }
  };

  const handleReply = useCallback((message: Message) => {
    setReplyTo(message);
    editorRef.current?.focus();
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-orange-500/10');
      setTimeout(() => el.classList.remove('bg-orange-500/10'), 1500);
    }
  }, []);

  const handleEdit = useCallback((updated: Message) => {
    editMessage(updated.id, updated.content);
  }, [editMessage]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = Array.from(files).map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      size: f.size,
      type: f.type,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Build a message lookup for reply targets
  const messageMap = new Map(messages.map((m) => [m.id, m]));

  // Animated ellipsis for transcribing state
  const [dots, setDots] = useState(0);
  useEffect(() => {
    if (!whisper.isTranscribing) {
      setDots(0);
      return;
    }
    const interval = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(interval);
  }, [whisper.isTranscribing]);

  const placeholderText = 'Type a message...';

  return (
    <div className="h-full flex flex-col">
      {/* Auth banners */}
      {pendingAuths.map((auth: PendingAuth) => (
        <AuthorizationBanner
          key={`${auth.taskId}:${auth.stageId}`}
          auth={auth}
          onAuthorize={authorize}
        />
      ))}

      {/* Thread header */}
      {threadId && thread && (
        <ThreadHeader thread={thread} agents={agents} onThreadUpdate={setThread} />
      )}

      {/* Agent chat header */}
      {agentRole && !threadId && (
        <AgentChatHeader
          agentRole={agentRole}
          agentName={chatAgent?.displayName || chatAgent?.name || agentRole}
          accentColor={chatAgent?.accentColor || undefined}
          onArchive={handleArchive}
          onRestore={handleRestore}
          onDeleteArchive={handleDeleteArchive}
          archives={archives}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto px-8 py-4">
      <div className="max-w-4xl mx-auto w-full">
        {loading && (
          <div className="text-slate-400 animate-pulse">
            Loading messages...
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            No messages yet. Start a conversation.
          </div>
        )}
        {messages.map((msg, idx) => {
          const agentData = agents.find((a) => a.role === msg.senderName);
          const prev = idx > 0 ? messages[idx - 1] : null;
          const isConsecutive =
            prev !== null &&
            prev.senderName === msg.senderName &&
            prev.senderType === msg.senderType;
          const next = idx < messages.length - 1 ? messages[idx + 1] : null;
          const nextIsConsecutive =
            next !== null &&
            next.senderName === msg.senderName &&
            next.senderType === msg.senderType;
          const replyTarget = msg.inReplyTo
            ? messageMap.get(msg.inReplyTo) || null
            : null;
          const replyAgentData = replyTarget
            ? agents.find((a) => a.role === replyTarget.senderName)
            : null;
          return (
            <div
              key={msg.id}
              data-message-id={msg.id}
              className="transition-colors duration-500 rounded-lg"
            >
              <MessageBubble
                message={msg}
                replyTarget={replyTarget}
                onReact={toggleReaction}
                onReply={handleReply}
                onEdit={handleEdit}
                onDelete={(id) => { setDeleteTargetId(id); setDeleteModalOpen(true); }}
                onScrollToMessage={scrollToMessage}
                accentColor={agentData?.accentColor || undefined}
                displayName={
                  agentData?.displayName || agentData?.name || undefined
                }
                replyDisplayName={
                  replyAgentData?.displayName ||
                  replyAgentData?.name ||
                  undefined
                }
                isConsecutive={isConsecutive}
                isLastInGroup={!nextIsConsecutive}
                mentionColors={mentionColors}
              />
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div className="px-8 pt-2">
          <div className="max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
            <Reply className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1">
              Replying to{' '}
              <span className="text-slate-300 font-medium">
                {replyTo.senderType === 'user' ? 'Me' : replyTo.senderName}
              </span>
              : {replyTo.content}
            </span>
            <button
              onClick={() => setReplyTo(null)}
              className="text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          </div>
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-8 pt-2">
          <div className="max-w-4xl mx-auto w-full">
          <div className="flex gap-2 flex-wrap">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5"
              >
                <Paperclip className="w-3 h-3 text-slate-400" />
                <span className="text-slate-300">{att.name}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* Button-triggered picker popover */}
      {pickerType && (
        <PickerPopover
          type={pickerType}
          agents={agents}
          tasks={tasks}
          mentionColors={mentionColors}
          query={pickerQuery}
          selectedIndex={pickerIndex}
          onQueryChange={(q) => { setPickerQuery(q); setPickerIndex(0); }}
          onIndexChange={setPickerIndex}
          onSelect={(item) => {
            if (pickerType === 'agent') {
              const agent = item as AgentInfo;
              editorRef.current?.insertAgentMention(agent.role, (agent.displayName || agent.name).replace(/\s+/g, '_'));
              handleAgentMentioned(agent.role);
            } else {
              const task = item as { id: string; guid: string; title: string };
              editorRef.current?.insertTaskMention(task.id, task.guid);
              handleTaskMentioned({ id: task.id, guid: task.guid });
            }
            setPickerType(null);
          }}
          onClose={() => setPickerType(null)}
          inputRef={pickerInputRef}
        />
      )}

      {/* Input bar */}
      <div className="px-8 pb-8 pt-2">
      <div className="max-w-4xl mx-auto w-full">
        <div
          className={`flex items-center gap-3 rounded-xl border bg-slate-800 px-4 py-3 transition-colors ${
            whisper.isRecording ? 'border-orange-500/50' : 'border-slate-700'
          }`}
        >
          {whisper.isRecording && (
            <button
              type="button"
              onClick={whisper.cancelRecording}
              className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/20 cursor-pointer transition-colors"
              aria-label="Cancel recording"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex-1 min-h-[40px] flex items-center w-full">
            {whisper.isRecording ? (
              <div className="flex items-center justify-center gap-[3px] min-h-[24px] w-full">
                {whisper.levels.map((level, i) => (
                  <span
                    key={i}
                    className="inline-block w-[3px] rounded-full bg-orange-400 transition-[height] duration-75"
                    style={{
                      height: `${
                        MIN_BAR_H +
                        Math.min(level / VOLUME_CEIL, 1) *
                          (MAX_BAR_H - MIN_BAR_H)
                      }px`,
                      opacity: 0.4 + Math.min(level / VOLUME_CEIL, 1) * 0.6,
                    }}
                  />
                ))}
                <span className="ml-3 text-base text-orange-400">
                  Listening...
                </span>
              </div>
            ) : (
              <div className="relative w-full">
                <ChatEditor
                  ref={editorRef}
                  onSubmit={handleEditorSubmit}
                  disabled={!connected || whisper.isTranscribing}
                  placeholder={placeholderText}
                  agents={agents}
                  tasks={tasks}
                  mentionColors={mentionColors}
                  onTaskMentioned={handleTaskMentioned}
                  onAgentMentioned={handleAgentMentioned}
                />
                {whisper.isTranscribing && (
                  <div className="absolute inset-0 flex items-center pointer-events-none">
                    <span className="text-base text-orange-400">
                      Transcribing{'.'.repeat(dots)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {whisper.isRecording ? (
            <button
              type="button"
              onClick={handleMicClick}
              className="shrink-0 p-1 rounded-lg text-orange-400 hover:bg-orange-500/20 cursor-pointer transition-colors"
              aria-label="Stop recording and transcribe"
            >
              <Square className="w-5 h-5" />
            </button>
          ) : (
            <>
              {/* Attach file */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!connected}
                className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-orange-400 hover:bg-orange-600/20 cursor-pointer transition-colors"
                aria-label="Attach file"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* @ mention trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setPickerType(pickerType === 'agent' ? null : 'agent'); setPickerQuery(''); setPickerIndex(0); }}
                  disabled={!connected}
                  className={`shrink-0 p-1 rounded-lg cursor-pointer transition-colors ${pickerType === 'agent' ? 'text-orange-400 bg-orange-600/20' : 'text-slate-400 hover:text-orange-400 hover:bg-orange-600/20'}`}
                  aria-label="Mention agent"
                >
                  <AtSign className="w-5 h-5" />
                </button>
              </div>

              {/* # task tag trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setPickerType(pickerType === 'task' ? null : 'task'); setPickerQuery(''); setPickerIndex(0); }}
                  disabled={!connected}
                  className={`shrink-0 p-1 rounded-lg cursor-pointer transition-colors ${pickerType === 'task' ? 'text-orange-400 bg-orange-600/20' : 'text-slate-400 hover:text-orange-400 hover:bg-orange-600/20'}`}
                  aria-label="Tag task"
                >
                  <Hash className="w-5 h-5" />
                </button>
              </div>

              {/* Mic button */}
              <section className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleMicClick}
                  disabled={!connected || whisper.isTranscribing}
                  className={`shrink-0 p-1 rounded-lg transition-colors ${
                    whisper.isTranscribing
                      ? 'text-slate-600 cursor-default'
                      : 'text-slate-400 hover:text-orange-400 hover:bg-orange-600/20 cursor-pointer'
                  }`}
                  aria-label="Start voice input"
                >
                  {whisper.isTranscribing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>

                {/* Mic device selector chevron */}
                <MicSelector
                  devices={audioDevices}
                  selectedDeviceId={selectedDeviceId}
                  onSelect={setSelectedDeviceId}
                  disabled={
                    !connected || whisper.isRecording || whisper.isTranscribing
                  }
                />
              </section>

              {/* Send button */}
              <button
                type="button"
                onClick={() => editorRef.current?.submit()}
                disabled={!connected}
                className={`shrink-0 p-1 rounded-lg transition-colors ${
                  connected
                    ? 'text-orange-400 hover:bg-orange-600/20 cursor-pointer'
                    : 'text-slate-600 cursor-default'
                }`}
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
      </div>

      {/* Archive modal */}
      <Modal
        open={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        title="Archive Chat"
        footer={
          <>
            <button
              onClick={() => setArchiveModalOpen(false)}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={confirmArchive}
              className="px-3 py-1.5 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors cursor-pointer"
            >
              Archive
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-400 mb-3">
          This will save the current conversation and clear the chat.
        </p>
        <input
          type="text"
          value={archiveName}
          onChange={(e) => setArchiveName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirmArchive(); }}
          placeholder="Archive name..."
          autoFocus
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-orange-500/50 transition-colors"
        />
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteTargetId(null); }}
        title="Delete Message"
        footer={
          <>
            <button
              onClick={() => { setDeleteModalOpen(false); setDeleteTargetId(null); }}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (deleteTargetId) deleteMessage(deleteTargetId);
                setDeleteModalOpen(false);
                setDeleteTargetId(null);
              }}
              className="px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors cursor-pointer"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-400">
          Are you sure you want to delete this message? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

// Reply icon for the reply banner
// ─── Picker Popover for @ and # buttons ─────────────────────

interface PickerPopoverProps {
  type: 'agent' | 'task';
  agents: AgentInfo[];
  tasks: { id: string; guid: string; title: string }[];
  mentionColors: Record<string, string>;
  query: string;
  selectedIndex: number;
  onQueryChange: (q: string) => void;
  onIndexChange: (i: number) => void;
  onSelect: (item: AgentInfo | { id: string; guid: string; title: string }) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function PickerPopover({ type, agents, tasks, mentionColors, query, selectedIndex, onQueryChange, onIndexChange, onSelect, onClose, inputRef }: PickerPopoverProps) {
  const items = type === 'agent'
    ? agents.filter(a =>
        (a.displayName || a.name).toLowerCase().includes(query.toLowerCase()) ||
        a.role.toLowerCase().includes(query.toLowerCase())
      )
    : tasks.filter(t =>
        t.guid.toLowerCase().includes(query.toLowerCase()) ||
        t.title.toLowerCase().includes(query.toLowerCase())
      );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      onIndexChange(Math.min(selectedIndex + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      onIndexChange(Math.max(selectedIndex - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (items[selectedIndex]) onSelect(items[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="px-8">
      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-700">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={type === 'agent' ? 'Search agents...' : 'Search tasks...'}
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
        </div>
        <div className="max-h-48 overflow-y-auto">
          {items.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">No results</div>
          )}
          {type === 'agent'
            ? (items as AgentInfo[]).map((agent, i) => {
                const color = agent.accentColor || mentionColors[agent.role] || '#8b949e';
                return (
                  <button
                    key={agent.role}
                    onClick={() => onSelect(agent)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer transition-colors ${
                      i === selectedIndex ? 'bg-slate-700' : 'hover:bg-slate-700/50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="font-mono text-xs" style={{ color }}>
                      @{(agent.displayName || agent.name).replace(/\s+/g, '_')}
                    </span>
                    <span className="text-slate-500">{agent.role}</span>
                  </button>
                );
              })
            : (items as { id: string; guid: string; title: string }[]).map((task, i) => (
                <button
                  key={task.id}
                  onClick={() => onSelect(task)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer transition-colors ${
                    i === selectedIndex ? 'bg-slate-700' : 'hover:bg-slate-700/50'
                  }`}
                >
                  <span className="text-orange-400 font-mono text-xs">#{task.guid}</span>
                  <span className="text-slate-400 truncate">{task.title}</span>
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}

function Reply(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}
