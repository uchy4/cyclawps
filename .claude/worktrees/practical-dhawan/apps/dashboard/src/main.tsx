import './dashboard.css';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

// PWA service worker handled by vite-plugin-pwa (auto-registered in production)
// In dev mode: unregister any stale SW and clear caches
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) reg.unregister();
  });
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
