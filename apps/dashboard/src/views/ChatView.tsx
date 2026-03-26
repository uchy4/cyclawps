import { useRef, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMessages, type PendingAuth } from '@agents-manager/chat/hooks/useMessages.js';
import { MessageBubble } from '@agents-manager/chat/components/MessageBubble.js';
import { AuthorizationBanner } from '@agents-manager/chat/components/AuthorizationBanner.js';
import { Mic, Send, Loader2, X, Square } from 'lucide-react';
import { useWhisper } from '../hooks/useWhisper.js';

const MIN_BAR_H = 4;
const MAX_BAR_H = 64; // 4rem
const VOLUME_CEIL = 0.7; // reach max height at 70% volume

export function ChatView() {
  const { agentRole } = useParams<{ agentRole?: string }>();
  const { messages, loading, connected, pendingAuths, sendMessage, authorize } = useMessages();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const whisper = useWhisper();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea to fit content, up to 5 rows
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text]);

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
    ? whisper.isTranscribing
      ? 'Transcribing...'
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
        <div className={`flex items-center gap-3 rounded-xl border bg-slate-800 px-4 py-3 transition-colors ${
          whisper.isRecording ? 'border-orange-500/50' : 'border-slate-700'
        }`}>

          {/* Left icon: cancel (X) while recording */}
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

          {/* Centre: textarea or sound bars */}
          <div className="flex-1 min-h-[24px]">
            {whisper.isRecording ? (
              <div className="flex items-center justify-center gap-[3px] min-h-[24px]">
                {whisper.levels.map((level, i) => (
                  <span
                    key={i}
                    className="inline-block w-[3px] rounded-full bg-orange-400 transition-[height] duration-75"
                    style={{
                      height: `${MIN_BAR_H + Math.min(level / VOLUME_CEIL, 1) * (MAX_BAR_H - MIN_BAR_H)}px`,
                      opacity: 0.4 + Math.min(level / VOLUME_CEIL, 1) * 0.6,
                    }}
                  />
                ))}
                <span className="ml-3 text-sm text-slate-400">Listening...</span>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={!connected || whisper.isTranscribing}
                rows={1}
                className="w-full bg-transparent text-white text-sm leading-5 resize-none outline-none placeholder-slate-400 min-h-[24px] max-h-[100px] overflow-y-auto"
              />
            )}
          </div>

          {/* Right icons */}
          {whisper.isRecording ? (
            /* Stop (square) button while recording */
            <button
              type="button"
              onClick={handleMicClick}
              className="shrink-0 p-1.5 rounded-lg text-orange-400 hover:bg-orange-500/20 cursor-pointer transition-colors"
              aria-label="Stop recording and transcribe"
            >
              <Square className="w-5 h-5" />
            </button>
          ) : (
            <>
              {/* Mic button */}
              <button
                type="button"
                onClick={handleMicClick}
                disabled={!connected || whisper.isTranscribing}
                className={`shrink-0 p-1.5 rounded-lg transition-colors ${
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

              {/* Send button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!connected || !text.trim()}
                className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                  connected && text.trim()
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
