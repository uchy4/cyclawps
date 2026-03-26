import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { KanbanView } from './views/KanbanView.js';
import { ChatView } from './views/ChatView.js';
import { ConfiguratorView } from './views/ConfiguratorView.js';

const queryClient = new QueryClient();

export function App() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex flex-col h-full overflow-hidden">
          <Header collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
          <div className="flex flex-1 overflow-hidden">
          <Sidebar collapsed={collapsed} />
          <main className="flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={<Navigate to="/kanban" replace />} />
              <Route path="/kanban" element={<KanbanView />} />
              <Route path="/kanban/:guid" element={<KanbanView />} />
              <Route path="/chat" element={<ChatView />} />
              <Route path="/chat/:agentRole" element={<ChatView />} />
              <Route path="/configurator" element={<ConfiguratorView />} />
            </Routes>
          </main>
          </div>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
