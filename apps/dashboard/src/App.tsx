import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from '@app/shared';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { ChatSubSidebar } from './components/ChatSubSidebar.js';
import { KanbanView } from './views/KanbanView.js';
import { ChatView } from './views/ChatView.js';
import { ConfiguratorView } from './views/ConfiguratorView.js';

const queryClient = new QueryClient();

export function App() {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex flex-col h-full overflow-hidden">
          <Header collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
          <div className="flex flex-1 overflow-hidden">
          <Sidebar collapsed={collapsed} />
          <ChatSubSidebar />
          <main className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Navigate to="/kanban" replace />} />
                <Route path="/kanban" element={<ErrorBoundary><KanbanView /></ErrorBoundary>} />
                <Route path="/kanban/:guid" element={<ErrorBoundary><KanbanView /></ErrorBoundary>} />
                <Route path="/chat" element={<ErrorBoundary><ChatView /></ErrorBoundary>} />
                <Route path="/chat/thread/:threadId" element={<ErrorBoundary><ChatView /></ErrorBoundary>} />
                <Route path="/chat/agent/:agentRole" element={<ErrorBoundary><ChatView /></ErrorBoundary>} />
                <Route path="/configurator" element={<ErrorBoundary><ConfiguratorView /></ErrorBoundary>} />
              </Routes>
            </ErrorBoundary>
          </main>
          </div>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
