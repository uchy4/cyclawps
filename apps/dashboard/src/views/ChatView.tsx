import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  useMessages,
  type PendingAuth,
} from '@app/chat/hooks/useMessages';
import { useReadMarker } from '@app/chat/hooks/useReadMarker';
import { MessageBubble } from '@app/chat/components/MessageBubble';
import { MessageSkeleton } from '@app/chat/components/MessageSkeleton';
import { AuthorizationBanner } from '@app/chat/components/AuthorizationBanner';
import { Mic, Send, Loader2, X, Square, Paperclip, AtSign, Hash } from 'lucide-react';
import { useWhisper } from '../hooks/useWhisper.js';
import { useAudioDevices } from '../hooks/useAudioDevices.js';
import { MicSelector } from '../components/MicSelector.js';
import type { Message, Attachment, AgentConfig, Thread } from '@app/shared';
import { ROLE_COLORS, Modal } from '@app/shared';
import { ThreadHeader } from '../components/ThreadHeader.js';
import { AgentChatHeader } from '../components/AgentChatHeader.js';
import { ChatEditor, type ChatEditorHandle } from '../components/ChatEditor.js';
import { AgentTypingIndicator } from '../components/AgentTypingIndicator.js';
import { useAgentStatus } from '../hooks/useAgentStatus.js';
import {
  useAgents,
  useTasks,
  useThread,
  useAgentArchives,
  useCreateArchive,
  useRestoreArchive,
  useDeleteArchive,
  useAddParticipant,
  useAddTaskTag,
} from '../api/index.js';

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
    loadOlder,
    hasOlder,
    loadingOlder,
  } = useMessages(threadId, agentRole);
  const { data: thread, refetch: refetchThread } = useThread(threadId);
  const { data: agents = [] } = useAgents();
  const { data: tasks = [] } = useTasks();
  const { data: archives = [] } = useAgentArchives(agentRole);

  const { lastReadMessageId, loaded: readMarkerLoaded, markAsRead } = useReadMarker(threadId, agentRole);
  const dividerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ChatEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const justSentRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveName, setArchiveName] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const { activities: agentActivities } = useAgentStatus();

  const createArchiveMutation = useCreateArchive();
  const restoreArchiveMutation = useRestoreArchive();
  const deleteArchiveMutation = useDeleteArchive();
  const addParticipantMutation = useAddParticipant();
  const addTaskTagMutation = useAddTaskTag();

  const handleArchive = useCallback(() => {
    if (!agentRole) return;
    setArchiveName(`Archive ${new Date().toLocaleDateString()}`);
    setArchiveModalOpen(true);
  }, [agentRole]);

  const confirmArchive = useCallback(() => {
    if (!agentRole || !archiveName.trim()) return;
    setArchiveModalOpen(false);
    createArchiveMutation.mutate(
      { role: agentRole, name: archiveName.trim() },
      { onSuccess: () => refreshMessages() },
    );
  }, [agentRole, archiveName, refreshMessages, createArchiveMutation]);

  const handleRestore = useCallback((archiveId: string) => {
    if (!agentRole) return;
    restoreArchiveMutation.mutate(
      { role: agentRole, archiveId },
      { onSuccess: () => refreshMessages() },
    );
  }, [agentRole, refreshMessages, restoreArchiveMutation]);

  const handleDeleteArchive = useCallback((archiveId: string) => {
    if (!agentRole) return;
    deleteArchiveMutation.mutate({ role: agentRole, archiveId });
  }, [agentRole, deleteArchiveMutation]);

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

  // --- Scroll & read-marker logic ---
  const hasScrolledToMarker = useRef(false);
  const prevMessageCount = useRef(0);

  // On initial load: scroll to bottom as soon as messages arrive (don't wait for read marker)
  const hasScrolledInitial = useRef(false);
  useEffect(() => {
    if (loading || messages.length === 0) return;
    if (hasScrolledInitial.current) return;
    hasScrolledInitial.current = true;

    // Scroll to bottom immediately so there's no flash of unscrolled content
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    });
    prevMessageCount.current = messages.length;
  }, [loading, messages.length]);

  // Once the read marker loads, adjust scroll to the divider if one appeared
  useEffect(() => {
    if (!readMarkerLoaded || loading || messages.length === 0) return;
    if (hasScrolledToMarker.current) return;
    hasScrolledToMarker.current = true;

    requestAnimationFrame(() => {
      if (dividerRef.current) {
        dividerRef.current.scrollIntoView({ behavior: 'instant', block: 'center' });
        setHasNewBelow(true);
      }
      // If no divider, we already scrolled to bottom above — nothing to do
    });
  }, [readMarkerLoaded, loading, messages.length]);

  // Continuously track scroll position + load older messages on scroll to top
  const isLoadingOlderRef = useRef(false);
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      isNearBottomRef.current = nearBottom;
      if (nearBottom && hasNewBelow) {
        setHasNewBelow(false);
      }

      // Load older messages when scrolled near the top
      if (container.scrollTop < 200 && hasOlder && !isLoadingOlderRef.current) {
        isLoadingOlderRef.current = true;
        const prevScrollHeight = container.scrollHeight;
        loadOlder().then(() => {
          // Preserve scroll position after prepending older messages
          requestAnimationFrame(() => {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop += newScrollHeight - prevScrollHeight;
            isLoadingOlderRef.current = false;
          });
        });
      }
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasNewBelow, hasOlder, loadOlder]);

  // When new messages arrive after initial load
  useEffect(() => {
    if (!hasScrolledToMarker.current) return;
    if (messages.length > prevMessageCount.current) {
      if (justSentRef.current || isNearBottomRef.current) {
        // User sent the message or was already at bottom — auto-scroll
        justSentRef.current = false;
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        });
      } else {
        setHasNewBelow(true);
      }
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  // Scroll to bottom when an agent starts thinking
  const prevActivityCount = useRef(0);
  useEffect(() => {
    const count = agentActivities.size;
    if (count > prevActivityCount.current) {
      setHasNewBelow(false);
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      });
    }
    prevActivityCount.current = count;
  }, [agentActivities]);

  // Reset scroll tracking on scope change
  useEffect(() => {
    hasScrolledInitial.current = false;
    hasScrolledToMarker.current = false;
    setHasNewBelow(false);
    justSentRef.current = false;
  }, [threadId, agentRole]);

  // Mark as read on navigate away (scope change or unmount)
  const latestMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    latestMessageIdRef.current = messages.length > 0 ? messages[messages.length - 1].id : null;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (latestMessageIdRef.current) {
        markAsRead(latestMessageIdRef.current);
      }
    };
  }, [threadId, agentRole, markAsRead]);

  // Also mark as read on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (latestMessageIdRef.current) {
        const key = threadId ? `thread:${threadId}` : agentRole ? `agent:${agentRole}` : 'global';
        navigator.sendBeacon(
          `/api/read-markers/${encodeURIComponent(key)}`,
          new Blob([JSON.stringify({ lastReadMessageId: latestMessageIdRef.current })], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [threadId, agentRole]);

  const scrollToNewMessages = useCallback(() => {
    if (dividerRef.current) {
      dividerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    setHasNewBelow(false);
  }, []);

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
    justSentRef.current = true;
    sendMessage(
      text.trim(),
      threadId,
      replyTo?.id,
      attachments.length > 0 ? attachments : undefined,
      agentRole
    );
    setReplyTo(null);
    setAttachments([]);
    setHasNewBelow(false);
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    });
  }, [sendMessage, threadId, replyTo, attachments, agentRole]);

  const handleTaskMentioned = useCallback((task: { id: string; guid: string }) => {
    if (!threadId || !thread) return;
    const alreadyTagged = (thread.taskTags || []).some((t) => t.taskId === task.id);
    if (alreadyTagged) return;
    addTaskTagMutation.mutate(
      { threadId, taskId: task.id, systemMessage: `#${task.guid} added to thread` },
      { onSuccess: () => refetchThread() },
    );
  }, [threadId, thread, addTaskTagMutation, refetchThread]);

  const handleAgentMentioned = useCallback((mentionedRole: string) => {
    if (!threadId || !thread) return;
    const alreadyAdded = (thread.participants || []).some((p) => p.agentRole === mentionedRole);
    if (alreadyAdded) return;
    const agent = agents.find((a) => a.role === mentionedRole);
    const name = agent?.displayName || agent?.name || mentionedRole;
    addParticipantMutation.mutate(
      { threadId, agentRole: mentionedRole, systemMessage: `@${name} added to thread` },
      { onSuccess: () => refetchThread() },
    );
  }, [threadId, thread, agents, addParticipantMutation, refetchThread]);

  const pendingTranscript = useRef<string | null>(null);

  const handleMicClick = async () => {
    if (whisper.isRecording) {
      const transcribed = await whisper.stopAndTranscribe();
      if (transcribed) {
        // Queue the text — editor may not be mounted yet since we just left transcribing state
        pendingTranscript.current = transcribed;
        // Wait for React to re-render (editor becomes visible), then insert
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (pendingTranscript.current) {
              editorRef.current?.insertText(pendingTranscript.current);
              pendingTranscript.current = null;
            }
            editorRef.current?.focus();
          }, 50);
        });
      }
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
        <ThreadHeader thread={thread} onThreadUpdate={() => { refetchThread(); }} />
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
      <div ref={messagesContainerRef} className="flex-1 overflow-auto px-8 py-4 relative">
      <div className="max-w-4xl mx-auto w-full">
        {loading && <MessageSkeleton count={6} />}
        {!loading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            No messages yet. Start a conversation.
          </div>
        )}
        {loadingOlder && <MessageSkeleton count={3} />}
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

          // Show "New messages" divider after the last-read message
          const showDivider =
            lastReadMessageId &&
            prev?.id === lastReadMessageId &&
            msg.id !== lastReadMessageId;

          return (
            <div key={msg.id}>
              {showDivider && (
                <div
                  ref={dividerRef}
                  className="flex items-center gap-3 py-3 px-2"
                >
                  <div className="flex-1 h-px bg-orange-500/40" />
                  <span className="text-[11px] font-medium text-orange-400/70 whitespace-nowrap uppercase tracking-wider">
                    New messages
                  </span>
                  <div className="flex-1 h-px bg-orange-500/40" />
                </div>
              )}
              <div
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
            </div>
          );
        })}
        <AgentTypingIndicator
          activities={agentActivities}
          filterRoles={agentRole ? [agentRole] : thread?.participants?.map(p => p.agentRole)}
          agentNames={Object.fromEntries(agents.map(a => [a.role, a.displayName || a.name]))}
          agentColors={Object.fromEntries(agents.filter(a => a.accentColor).map(a => [a.role, a.accentColor!]))}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Floating "New messages" button */}
      {hasNewBelow && (
        <button
          onClick={scrollToNewMessages}
          className="sticky bottom-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-orange-600 text-white text-xs font-medium shadow-lg hover:bg-orange-500 transition-colors cursor-pointer"
        >
          ↓ New messages
        </button>
      )}
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div className="px-8 pt-2">
          <div className="max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
            <Reply className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1">
              Replying to{' '}
              <span className="text-zinc-300 font-medium">
                {replyTo.senderType === 'user' ? 'Me' : replyTo.senderName}
              </span>
              : {replyTo.content}
            </span>
            <button
              onClick={() => setReplyTo(null)}
              className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
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
                className="flex items-center gap-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5"
              >
                <Paperclip className="w-3 h-3 text-zinc-400" />
                <span className="text-zinc-300">{att.name}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
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
              const agent = item as AgentConfig;
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
          className={`flex items-center gap-3 rounded-xl border bg-zinc-800 px-4 py-3 transition-colors ${
            whisper.isRecording ? 'border-orange-500/50' : 'border-zinc-700'
          }`}
        >
          {whisper.isRecording && (
            <button
              type="button"
              onClick={whisper.cancelRecording}
              className="shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/20 cursor-pointer transition-colors"
              aria-label="Cancel recording"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex-1 min-h-[40px] flex items-center w-full">
            {(whisper.isRecording || whisper.isTranscribing) ? (
              <div className="flex items-center justify-center gap-[3px] min-h-[24px] w-full">
                {whisper.isRecording
                  ? whisper.levels.map((level, i) => (
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
                    ))
                  : Array.from({ length: whisper.levels.length || 24 }).map((_, i) => (
                      <span
                        key={i}
                        className="inline-block w-[3px] rounded-full bg-orange-400"
                        style={{
                          animation: `transcribe-wave 1.2s ease-in-out ${i * 0.08}s infinite`,
                        }}
                      />
                    ))
                }
                <span className="ml-3 text-base text-orange-400">
                  {whisper.isRecording ? 'Listening...' : 'Transcribing...'}
                </span>
              </div>
            ) : (
              <div className="relative w-full">
                <ChatEditor
                  ref={editorRef}
                  onSubmit={handleEditorSubmit}
                  disabled={!connected}
                  placeholder={placeholderText}
                  agents={agents}
                  tasks={tasks}
                  mentionColors={mentionColors}
                  onTaskMentioned={handleTaskMentioned}
                  onAgentMentioned={handleAgentMentioned}
                />
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
          ) : whisper.isTranscribing ? (
            null
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
                className="shrink-0 p-1 rounded-lg text-zinc-400 hover:text-orange-400 hover:bg-orange-600/20 cursor-pointer transition-colors"
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
                  className={`shrink-0 p-1 rounded-lg cursor-pointer transition-colors ${pickerType === 'agent' ? 'text-orange-400 bg-orange-600/20' : 'text-zinc-400 hover:text-orange-400 hover:bg-orange-600/20'}`}
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
                  className={`shrink-0 p-1 rounded-lg cursor-pointer transition-colors ${pickerType === 'task' ? 'text-orange-400 bg-orange-600/20' : 'text-zinc-400 hover:text-orange-400 hover:bg-orange-600/20'}`}
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
                      ? 'text-zinc-600 cursor-default'
                      : 'text-zinc-400 hover:text-orange-400 hover:bg-orange-600/20 cursor-pointer'
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
                    : 'text-zinc-600 cursor-default'
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
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
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
        <p className="text-sm text-zinc-400 mb-3">
          This will save the current conversation and clear the chat.
        </p>
        <input
          type="text"
          value={archiveName}
          onChange={(e) => setArchiveName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirmArchive(); }}
          placeholder="Archive name..."
          autoFocus
          className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-500/50 transition-colors"
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
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
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
        <p className="text-sm text-zinc-400">
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
  agents: AgentConfig[];
  tasks: { id: string; guid: string; title: string }[];
  mentionColors: Record<string, string>;
  query: string;
  selectedIndex: number;
  onQueryChange: (q: string) => void;
  onIndexChange: (i: number) => void;
  onSelect: (item: AgentConfig | { id: string; guid: string; title: string }) => void;
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
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-zinc-700">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={type === 'agent' ? 'Search agents...' : 'Search tasks...'}
            className="w-full bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
          />
        </div>
        <div className="max-h-48 overflow-y-auto">
          {items.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-500">No results</div>
          )}
          {type === 'agent'
            ? (items as AgentConfig[]).map((agent, i) => {
                const color = agent.accentColor || mentionColors[agent.role] || '#8b949e';
                return (
                  <button
                    key={agent.role}
                    onClick={() => onSelect(agent)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer transition-colors ${
                      i === selectedIndex ? 'bg-zinc-700' : 'hover:bg-zinc-700/50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="font-mono text-xs" style={{ color }}>
                      @{(agent.displayName || agent.name).replace(/\s+/g, '_')}
                    </span>
                    <span className="text-zinc-500">{agent.role}</span>
                  </button>
                );
              })
            : (items as { id: string; guid: string; title: string }[]).map((task, i) => (
                <button
                  key={task.id}
                  onClick={() => onSelect(task)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer transition-colors ${
                    i === selectedIndex ? 'bg-zinc-700' : 'hover:bg-zinc-700/50'
                  }`}
                >
                  <span className="text-orange-400 font-mono text-xs">#{task.guid}</span>
                  <span className="text-zinc-400 truncate">{task.title}</span>
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
