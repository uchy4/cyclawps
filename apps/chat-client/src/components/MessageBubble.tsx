import type { Message } from '@agents-manager/shared';
import { ROLE_COLORS, formatRoleName } from '@agents-manager/shared';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.senderType === 'user';
  const isSystem = message.senderType === 'system';
  const color = ROLE_COLORS[message.senderName] || ROLE_COLORS[message.senderType] || '#8b949e';
  const displayName = formatRoleName(message.senderName);

  if (isSystem) {
    return (
      <div className="py-1 text-xs text-slate-400 text-center">
        {message.content}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col mb-3 ${isUser ? 'items-end' : 'items-start'}`}
    >
      <div className="text-[11px] font-semibold mb-1 px-1" style={{ color }}>
        {displayName}
        {message.taskId && (
          <span className="text-slate-500 font-normal ml-1.5">
            on task {message.taskId.slice(0, 8)}
          </span>
        )}
      </div>
      <div
        className={`max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-normal whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-blue-600'
            : 'bg-slate-900 border border-slate-700'
        }`}
      >
        {message.content}
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 px-1">
        {new Date(message.createdAt).toLocaleTimeString()}
      </div>
    </div>
  );
}
