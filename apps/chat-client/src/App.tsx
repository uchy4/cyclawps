import { ChatWindow } from './components/ChatWindow.js';

export function App() {
  return (
    <div className="h-screen flex flex-col">
      <header className="px-6 py-4 border-b border-slate-700">
        <h1 className="text-xl font-semibold">Agents Manager — Chat</h1>
      </header>
      <ChatWindow />
    </div>
  );
}
