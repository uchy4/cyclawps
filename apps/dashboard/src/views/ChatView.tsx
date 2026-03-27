import { useRef, useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  useMessages,
  type PendingAuth,
} from '@cyclawps/chat/hooks/useMessages.js';
import { MessageBubble } from '@cyclawps/chat/components/MessageBubble.js';
import { AuthorizationBanner } from '@cyclawps/chat/components/AuthorizationBanner.js';
import { Mic, Send, Loader2, X, Square, Paperclip } from 'lucide-react';
import { useWhisper } from '../hooks/useWhisper.js';
import { useAudioDevices } from '../hooks/useAudioDevices.js';
import { MicSelector } from '../components/MicSelector.js';
import type { Message, Attachment } from '@cyclawps/shared';

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
  const { taskId, agentRole } = useParams<{
    taskId?: string;
    agentRole?: string;
  }>();
  const {
    messages,
    loading,
    connected,
    pendingAuths,
    sendMessage,
    toggleReaction,
    authorize,
  } = useMessages(taskId, agentRole);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const {
    devices: audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useAudioDevices();
  const whisper = useWhisper(selectedDeviceId);

  // Fetch agents for @mention popup
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data) => setAgents(data))
      .catch(() => {});
  }, []);

  // Filtered agents based on mention query
  const filteredAgents =
    mentionQuery !== null
      ? agents.filter(
          (a) =>
            (a.displayName || a.name)
              .toLowerCase()
              .includes(mentionQuery.toLowerCase()) ||
            a.role.toLowerCase().includes(mentionQuery.toLowerCase())
        )
      : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text]);

  // Clear reply when switching threads/agents
  useEffect(() => {
    setReplyTo(null);
    setAttachments([]);
  }, [taskId, agentRole]);

  // Derive chat title
  const chatAgent = agentRole ? agents.find((a) => a.role === agentRole) : null;
  const chatTitle = agentRole
    ? chatAgent?.displayName ||
      agentRole.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    : taskId
    ? `Thread`
    : 'Global Chat';

  const handleSubmit = () => {
    if (!text.trim() && attachments.length === 0) return;
    sendMessage(
      text.trim(),
      taskId,
      replyTo?.id,
      attachments.length > 0 ? attachments : undefined,
      agentRole
    );
    setText('');
    setReplyTo(null);
    setAttachments([]);
    setMentionQuery(null);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Detect @mention
    const cursor = e.target.selectionStart || 0;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (agent: AgentInfo) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart || 0;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const prefix = before.replace(/@\w*$/, '');
    const mentionName = (agent.displayName || agent.name).replace(/\s+/g, '_');
    const newText = `${prefix}@${mentionName} ${after}`;
    setText(newText);
    setMentionQuery(null);
    ta.focus();
    // Set cursor after the inserted mention
    const newCursor = prefix.length + mentionName.length + 2;
    requestAnimationFrame(() => {
      ta.selectionStart = newCursor;
      ta.selectionEnd = newCursor;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle mention popup navigation
    if (mentionQuery !== null && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) =>
          Math.min(prev + 1, filteredAgents.length - 1)
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredAgents[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleMicClick = async () => {
    if (whisper.isRecording) {
      const transcribed = await whisper.stopAndTranscribe();
      if (transcribed) {
        setText((prev) => (prev ? `${prev} ${transcribed}` : transcribed));
      }
    } else {
      await whisper.startRecording();
    }
  };

  const handleReply = useCallback((message: Message) => {
    setReplyTo(message);
    textareaRef.current?.focus();
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
    // TODO: wire to API when edit endpoint exists
    console.log('Edit message:', updated.id, updated.content);
  }, []);

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

  const placeholder = connected
    ? whisper.isTranscribing
      ? 'Transcribing' + '.'.repeat(dots)
      : 'Type a message...'
    : 'Disconnected...';

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

      {/* Messages */}
      <div className="flex-1 overflow-auto px-8 py-4">
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
              />
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div className="px-8 pt-2">
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
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-8 pt-2">
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
      )}

      {/* @mention popup */}
      {mentionQuery !== null && filteredAgents.length > 0 && (
        <div className="px-8">
          <div className="bg-slate-800 border border-slate-700 rounded-lg py-1 shadow-lg max-h-48 overflow-y-auto">
            {filteredAgents.map((agent, i) => (
              <button
                key={agent.role}
                onClick={() => insertMention(agent)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer transition-colors ${
                  i === mentionIndex
                    ? 'bg-slate-700 text-orange-400'
                    : 'text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                <span className="text-orange-400 font-mono text-xs">
                  @{(agent.displayName || agent.name).replace(/\s+/g, '_')}
                </span>
                <span className="text-slate-400">{agent.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="px-8 pb-8 pt-2">
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

          <div className="flex-1 min-h-[40px] flex items-center">
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
                <span className="ml-3 text-base text-orange-400/70">
                  Listening...
                </span>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={!connected || whisper.isTranscribing}
                rows={1}
                className={`w-full bg-transparent text-white text-base leading-6 resize-none outline-none min-h-[24px] max-h-[100px] overflow-y-auto ${
                  whisper.isTranscribing
                    ? 'placeholder-orange-400/70'
                    : 'placeholder-slate-400'
                }`}
              />
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
                onClick={handleSubmit}
                disabled={
                  !connected || (!text.trim() && attachments.length === 0)
                }
                className={`shrink-0 p-1 rounded-lg transition-colors ${
                  connected && (text.trim() || attachments.length > 0)
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
  );
}

// Re-export Reply icon for the reply banner (used above in JSX)
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
