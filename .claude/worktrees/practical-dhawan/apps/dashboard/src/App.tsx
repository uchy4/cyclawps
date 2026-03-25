import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar.js';
import { KanbanView } from './views/KanbanView.js';
import { ChatView } from './views/ChatView.js';
import { ConfiguratorView } from './views/ConfiguratorView.js';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
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
      </BrowserRouter>
    </QueryClientProvider>
  );
}
