import { useState } from 'react';

interface MessageInputProps {
  onSend: (content: string, taskId?: string) => void;
  connected: boolean;
  targetAgent?: string;
}

export function MessageInput({ onSend, connected, targetAgent }: MessageInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    let message = text.trim();
    if (targetAgent && !message.startsWith(`@${targetAgent}`)) {
      message = `@${targetAgent} ${message}`;
    }
    onSend(message);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const placeholder = connected
    ? targetAgent
      ? `Message @${targetAgent}...`
      : 'Message team... (use @name to target)'
    : 'Disconnected...';

  return (
    <div className="px-6 py-4 border-t border-zinc-700">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={!connected}
          rows={2}
          className="flex-1 px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-zinc-800 text-white text-sm resize-none font-[inherit]"
        />
        <button
          type="submit"
          disabled={!connected || !text.trim()}
          className={`px-5 py-2.5 rounded-lg border-none text-sm font-medium self-end ${
            connected && text.trim()
              ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer'
              : 'bg-zinc-700 text-zinc-500 cursor-default'
          }`}
        >
          Send
        </button>
      </form>
    </div>
  );
}
