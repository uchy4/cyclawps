import { useState, useRef, useEffect } from 'react';
import type { Message } from '@app/shared';
import { ROLE_COLORS, formatRoleName } from '@app/shared';
import { Paperclip, Reply, SmilePlus, ChevronDown, ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer.js';

interface MessageBubbleProps {
  message: Message;
  replyTarget?: Message | null;
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  accentColor?: string;
  displayName?: string;
  replyDisplayName?: string;
  onScrollToMessage?: (messageId: string) => void;
  isConsecutive?: boolean;
  isLastInGroup?: boolean;
  mentionColors?: Record<string, string>;
}

const QUICK_EMOJIS = ['\u{1F44D}', '\u{1F44E}', '\u{2764}\u{FE0F}', '\u{1F389}', '\u{1F440}', '\u{1F525}'];

export function MessageBubble({ message, replyTarget, onReact, onReply, onEdit, onDelete, accentColor, displayName: overrideName, replyDisplayName, onScrollToMessage, isConsecutive, isLastInGroup = true, mentionColors }: MessageBubbleProps) {
  const [showEmojis, setShowEmojis] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  const [replyExpanded, setReplyExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const isUser = message.senderType === 'user';
  const isSystem = message.senderType === 'system';
  const color = accentColor || ROLE_COLORS[message.senderName] || ROLE_COLORS[message.senderType] || '#8b949e';
  const displayName = isUser ? 'Me' : (overrideName || formatRoleName(message.senderName));

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojis) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojis(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojis]);

  if (isSystem) {
    return (
      <div className="py-1 text-xs text-slate-400 text-center">
        {message.content}
      </div>
    );
  }

  // Group reactions by emoji
  const reactionGroups = new Map<string, { count: number; hasUser: boolean; reactors: string[] }>();
  for (const r of message.reactions || []) {
    const existing = reactionGroups.get(r.emoji) || { count: 0, hasUser: false, reactors: [] };
    existing.count++;
    if (r.reactor === 'user') existing.hasUser = true;
    if (!existing.reactors.includes(r.reactor)) existing.reactors.push(r.reactor);
    reactionGroups.set(r.emoji, existing);
  }

  // Accent border: orange for user, bot color for bot — always on the left
  const borderStyle = isUser
    ? { borderLeft: '3px solid #f97316' }
    : { borderLeft: `3px solid ${color}` };

  // Reply target display name
  const replyName = replyTarget
    ? replyTarget.senderType === 'user'
      ? 'Me'
      : (replyDisplayName || formatRoleName(replyTarget.senderName))
    : '';

  const handleStartEdit = () => {
    setEditText(message.content);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    if (onEdit && editText.trim() && editText !== message.content) {
      onEdit({ ...message, content: editText.trim() });
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const hasReactions = reactionGroups.size > 0;

  return (
    <div className={`group flex items-start gap-2 ${isLastInGroup ? 'mb-5' : 'mb-1'}`}>
      {/* Bubble column */}
      <div className="flex flex-col items-start max-w-[80%]">
        {/* Sender name + timestamp row — hidden for consecutive messages */}
        {!isConsecutive && (
          <div className="flex items-center gap-2 mb-1 px-1">
            <span className="text-[11px] font-semibold" style={{ color }}>
              {displayName}
            </span>
            {message.taskId && (
              <span className="text-[11px] text-slate-500">
                on task {message.taskId.slice(0, 8)}
              </span>
            )}
            <span className="text-[10px] text-slate-500">
              {new Date(message.createdAt).toLocaleTimeString()}
            </span>
          </div>
        )}

        {/* Message bubble */}
        <div className="relative">
          <div
            className={`px-3.5 py-2.5 text-base leading-normal break-words ${
              isConsecutive
                ? isUser
                  ? 'bg-slate-700/50 rounded-lg'
                  : 'bg-slate-800/50 border border-slate-700 rounded-lg'
                : isUser
                  ? 'bg-slate-700/50 rounded-xl'
                  : 'bg-slate-800/50 border border-slate-700 rounded-xl'
            }`}
            style={borderStyle}
          >
            {/* Reply context — rounded border, constrained width, expandable */}
            {replyTarget && (
              <div className="mb-2 max-w-full rounded-lg border border-slate-600 bg-slate-800/50 px-2.5 py-1.5 font-normal" style={{ width: 'fit-content', maxWidth: '100%' }}>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 min-w-0">
                  <button
                    type="button"
                    onClick={() => setReplyExpanded((v) => !v)}
                    className="flex items-center gap-1.5 cursor-pointer min-w-0 overflow-hidden"
                  >
                    <Reply className="w-3 h-3 rotate-180 shrink-0" />
                    <span className="font-medium shrink-0" style={{ color: ROLE_COLORS[replyTarget.senderName] || '#8b949e' }}>
                      {replyName}
                    </span>
                    {!replyExpanded && (
                      <span className="truncate opacity-70" style={{ maxWidth: '200px' }}>{replyTarget.content}</span>
                    )}
                    <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${replyExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {onScrollToMessage && message.inReplyTo && (
                    <button
                      type="button"
                      onClick={() => onScrollToMessage(message.inReplyTo!)}
                      className="shrink-0 p-0.5 rounded text-slate-500 hover:text-orange-400 cursor-pointer transition-colors"
                      title="Jump to original message"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {replyExpanded && (
                  <div className="mt-1.5 text-[11px] text-slate-400 whitespace-pre-wrap">
                    {replyTarget.content}
                  </div>
                )}
              </div>
            )}

            {editing ? (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 resize-none focus:outline-none focus:border-orange-500/50"
                  rows={2}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                />
                <div className="flex gap-1.5 text-[11px]">
                  <button onClick={handleSaveEdit} className="text-orange-400 hover:text-orange-300 cursor-pointer">Save</button>
                  <button onClick={handleCancelEdit} className="text-slate-500 hover:text-slate-300 cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : (
              <MarkdownRenderer content={message.content} roleColors={mentionColors || ROLE_COLORS} />
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {message.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                  >
                    <Paperclip className="w-3 h-3" />
                    {att.name}
                    <span className="text-slate-500">({(att.size / 1024).toFixed(1)}KB)</span>
                  </a>
                ))}
              </div>
            )}

            {/* Reactions — inline inside the bubble, with hover actions inline when reactions exist */}
            {hasReactions && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {Array.from(reactionGroups.entries()).map(([emoji, { count, reactors }]) => {
                  // Use the first reactor's color for the pill
                  const reactorColor = reactors[0] === 'user'
                    ? '#f97316'
                    : (ROLE_COLORS[reactors[0]] || '#8b949e');
                  return (
                    <button
                      key={emoji}
                      onClick={() => onReact?.(message.id, emoji)}
                      className="flex items-center gap-0.5 text-sm px-2 py-0.5 h-7 rounded-full border cursor-pointer transition-colors"
                      style={{
                        borderColor: `${reactorColor}60`,
                        backgroundColor: `${reactorColor}15`,
                        color: reactorColor,
                      }}
                    >
                      <span>{emoji}</span>
                      {count > 1 && <span>{count}</span>}
                    </button>
                  );
                })}
                {/* Inline hover actions next to reactions — hidden when editing */}
                {!editing && (
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-0.5 py-0.5 shadow-lg h-7">
                      {onReply && (
                        <button
                          onClick={() => onReply(message)}
                          className="px-1 py-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 cursor-pointer"
                          title="Reply"
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onReact && (
                        <button
                          onClick={() => setShowEmojis(!showEmojis)}
                          className="px-1 py-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 cursor-pointer"
                          title="React"
                        >
                          <SmilePlus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isUser && onEdit && (
                        <button
                          onClick={handleStartEdit}
                          className="px-1 py-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 cursor-pointer"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isUser && onDelete && (
                        <button
                          onClick={() => onDelete(message.id)}
                          className="px-1 py-0.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Emoji picker — below bubble, hidden when editing */}
          {showEmojis && onReact && !editing && (
            <div ref={emojiRef} className={`absolute left-4 flex items-center gap-1 z-20 ${hasReactions ? '-bottom-1' : '-bottom-3'}`}>
              <div className="flex items-center gap-0.5 bg-slate-800 border border-slate-700 rounded-lg px-1 py-0.5 shadow-lg">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { onReact(message.id, emoji); setShowEmojis(false); }}
                    className="text-sm hover:scale-125 transition-transform cursor-pointer px-0.5"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reply + React + Edit actions pill — hover only, floating when NO reactions, hidden when editing */}
          {!hasReactions && !editing && (
            <div className="absolute left-4 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity -bottom-3">
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-0.5 py-0.5 shadow-lg h-7">
                {onReply && (
                  <button
                    onClick={() => onReply(message)}
                    className="px-1 py-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 cursor-pointer"
                    title="Reply"
                  >
                    <Reply className="w-3.5 h-3.5" />
                  </button>
                )}
                {onReact && (
                  <button
                    onClick={() => setShowEmojis(!showEmojis)}
                    className="px-1 py-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 cursor-pointer"
                    title="React"
                  >
                    <SmilePlus className="w-3.5 h-3.5" />
                  </button>
                )}
                {isUser && onEdit && (
                  <button
                    onClick={handleStartEdit}
                    className="px-1 py-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 cursor-pointer"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
                {isUser && onDelete && (
                  <button
                    onClick={() => onDelete(message.id)}
                    className="px-1 py-0.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
