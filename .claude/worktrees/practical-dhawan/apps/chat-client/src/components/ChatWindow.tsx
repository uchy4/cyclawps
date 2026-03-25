import { useRef, useEffect } from 'react';
import { useMessages } from '../hooks/useMessages.js';
import { MessageBubble } from './MessageBubble.js';
import { MessageInput } from './MessageInput.js';
import { AuthorizationBanner } from './AuthorizationBanner.js';

interface ChatWindowProps {
  targetAgent?: string;
}

export function ChatWindow({ targetAgent }: ChatWindowProps = {}) {
  const { messages, loading, connected, pendingAuths, sendMessage, authorize } = useMessages();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) return <div className="p-5">Loading messages...</div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Authorization banners */}
      {pendingAuths.map((auth) => (
        <AuthorizationBanner
          key={`${auth.taskId}:${auth.stageId}`}
          auth={auth}
          onAuthorize={authorize}
        />
      ))}

      {/* Messages */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput onSend={sendMessage} connected={connected} targetAgent={targetAgent} />
    </div>
  );
}
