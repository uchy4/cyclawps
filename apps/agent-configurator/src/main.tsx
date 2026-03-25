import { createRoot } from 'react-dom/client';
import '@agents-manager/styles/globals.css';
import { App } from './App.js';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
