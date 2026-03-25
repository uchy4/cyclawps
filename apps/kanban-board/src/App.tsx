import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Board } from './components/Board.js';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-900 p-6">
        <h1 className="mb-6 text-2xl font-semibold text-white">
          Cyclawps — Kanban Board
        </h1>
        <Board />
      </div>
    </QueryClientProvider>
  );
}
