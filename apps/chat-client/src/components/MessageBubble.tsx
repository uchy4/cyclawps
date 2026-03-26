import { useState } from 'react';
import type { Message } from '@agents-manager/shared';
import { ROLE_COLORS, formatRoleName } from '@agents-manager/shared';
import { Paperclip, Reply, SmilePlus } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  replyTarget?: Message | null;
  onReact?: (messageId: string, emoji: string) => void;
  onReply?: (message: Message) => void;
  accentColor?: string;
}

const QUICK_EMOJIS = ['\u{1F44D}', '\u{1F44E}', '\u{2764}\u{FE0F}', '\u{1F389}', '\u{1F440}', '\u{1F525}'];

function renderContent(text: string) {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-orange-400 font-semibold">{part}</span>
    ) : (
      part
    )
  );
}

export function MessageBubble({ message, replyTarget, onReact, onReply, accentColor }: MessageBubbleProps) {
  const [showEmojis, setShowEmojis] = useState(false);
  const isUser = message.senderType === 'user';
  const isSystem = message.senderType === 'system';
  const color = accentColor || ROLE_COLORS[message.senderName] || ROLE_COLORS[message.senderType] || '#8b949e';
  const displayName = isUser ? 'Me' : formatRoleName(message.senderName);

  if (isSystem) {
    return (
      <div className="py-1 text-xs text-slate-400 text-center">
        {message.content}
      </div>
    );
  }

  // Group reactions by emoji
  const reactionGroups = new Map<string, { count: number; hasUser: boolean }>();
  for (const r of message.reactions || []) {
    const existing = reactionGroups.get(r.emoji) || { count: 0, hasUser: false };
    existing.count++;
    if (r.reactor === 'user') existing.hasUser = true;
    reactionGroups.set(r.emoji, existing);
  }

  // Accent border: orange right for user, bot color left for bot
  const borderStyle = isUser
    ? { borderRight: '3px solid #f97316' }
    : { borderLeft: `3px solid ${color}` };

  return (
    <div
      className={`group flex flex-col mb-3 ${isUser ? 'items-end' : 'items-start'}`}
    >
      {/* Sender name */}
      <div className="text-[11px] font-semibold mb-1 px-1" style={{ color }}>
        {displayName}
        {message.taskId && (
          <span className="text-slate-500 font-normal ml-1.5">
            on task {message.taskId.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Reply context */}
      {replyTarget && (
        <div className={`flex items-center gap-1.5 text-[11px] text-slate-500 mb-1 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <Reply className="w-3 h-3 rotate-180" />
          <span className="font-medium" style={{ color: ROLE_COLORS[replyTarget.senderName] || '#8b949e' }}>
            {replyTarget.senderType === 'user' ? 'Me' : formatRoleName(replyTarget.senderName)}
          </span>
          <span className="truncate max-w-[200px] opacity-70">{replyTarget.content}</span>
        </div>
      )}

      {/* Message bubble (relative for hover actions below) */}
      <div className="relative">
        <div
          className={`max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-normal whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-slate-700'
              : 'bg-slate-900 border border-slate-700'
          }`}
          style={borderStyle}
        >
          {renderContent(message.content)}

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
        </div>

        {/* Hover action buttons — positioned below the bubble, overlapping bottom edge */}
        <div className={`absolute -bottom-3 ${isUser ? 'right-2' : 'left-2'} flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10`}>
          <div className="flex items-center gap-0.5 bg-slate-800 border border-slate-700 rounded-lg px-1 py-0.5 shadow-lg">
            {onReply && (
              <button
                onClick={() => onReply(message)}
                className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 cursor-pointer"
                title="Reply"
              >
                <Reply className="w-3.5 h-3.5" />
              </button>
            )}
            {onReact && (
              <button
                onClick={() => setShowEmojis(!showEmojis)}
                className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 cursor-pointer"
                title="React"
              >
                <SmilePlus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Emoji picker (inline) */}
      {showEmojis && onReact && (
        <div className={`flex gap-1 mt-2 px-1 ${isUser ? 'justify-end' : ''}`}>
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
      )}

      {/* Reactions display */}
      {reactionGroups.size > 0 && (
        <div className={`flex gap-1 mt-2 px-1 flex-wrap ${isUser ? 'justify-end' : ''}`}>
          {Array.from(reactionGroups.entries()).map(([emoji, { count, hasUser }]) => (
            <button
              key={emoji}
              onClick={() => onReact?.(message.id, emoji)}
              className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border cursor-pointer transition-colors ${
                hasUser
                  ? 'border-orange-500/50 bg-orange-500/10 text-orange-300'
                  : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
              }`}
            >
              <span>{emoji}</span>
              {count > 1 && <span>{count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Timestamp */}
      <div className="text-[10px] text-slate-500 mt-1 px-1">
        {new Date(message.createdAt).toLocaleTimeString()}
      </div>
    </div>
  );
}
