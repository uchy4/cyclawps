import { ChatWindow } from './components/ChatWindow.js';

export function App() {
  return (
    <div className="h-screen flex flex-col">
      <header className="px-6 py-4 border-b border-zinc-700">
        <h1 className="text-xl font-semibold">Cyclawps — Chat</h1>
      </header>
      <ChatWindow />
    </div>
  );
}
