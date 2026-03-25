import { useRef, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMessages, type PendingAuth } from '@agents-manager/chat/hooks/useMessages.js';
import { MessageBubble } from '@agents-manager/chat/components/MessageBubble.js';
import { AuthorizationBanner } from '@agents-manager/chat/components/AuthorizationBanner.js';
import { formatRoleName } from '@agents-manager/shared';
import { Mic, MicOff, Send, Loader2 } from 'lucide-react';
import { useWhisper } from '../hooks/useWhisper.js';

export function ChatView() {
  const { agentRole } = useParams<{ agentRole?: string }>();
  const { messages, loading, connected, pendingAuths, sendMessage, authorize } = useMessages();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const whisper = useWhisper();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = () => {
    if (!text.trim()) return;
    let message = text.trim();
    if (agentRole && !message.startsWith(`@${agentRole}`)) {
      message = `@${agentRole} ${message}`;
    }
    sendMessage(message);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  const placeholder = connected
    ? whisper.isRecording
      ? 'Listening... click mic to stop'
      : whisper.isTranscribing
        ? 'Transcribing...'
        : 'Type a message...'
    : 'Disconnected...';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <h2 className="text-xl font-semibold text-white">
          {agentRole ? formatRoleName(agentRole) : 'Team Chat'}
        </h2>
      </div>

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
        {loading && <div className="text-slate-400 animate-pulse">Loading messages...</div>}
        {!loading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            No messages yet. Start a conversation.
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="px-8 pb-8 pt-2">
        <div className={`flex items-end gap-3 rounded-xl border bg-slate-800 px-4 py-3 transition-colors ${
          whisper.isRecording ? 'border-red-500/50' : 'border-slate-700'
        }`}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={!connected || whisper.isTranscribing}
            rows={1}
            className="flex-1 bg-transparent text-white text-sm resize-none outline-none placeholder-slate-400 min-h-[24px] max-h-[120px]"
          />

          {/* Mic button */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={!connected || whisper.isTranscribing}
            className={`shrink-0 p-1.5 rounded-lg transition-colors ${
              whisper.isRecording
                ? 'text-red-400 bg-red-500/20 hover:bg-red-500/30 animate-pulse cursor-pointer'
                : whisper.isTranscribing
                  ? 'text-slate-600 cursor-default'
                  : 'text-slate-400 hover:text-violet-400 hover:bg-violet-600/20 cursor-pointer'
            }`}
            aria-label={whisper.isRecording ? 'Stop recording' : 'Start voice input'}
          >
            {whisper.isTranscribing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : whisper.isRecording ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!connected || !text.trim()}
            className={`shrink-0 p-1.5 rounded-lg transition-colors ${
              connected && text.trim()
                ? 'text-violet-400 hover:bg-violet-600/20 cursor-pointer'
                : 'text-slate-600 cursor-default'
            }`}
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
