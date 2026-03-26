import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  platform: process.platform,
});

// Inject Electron-specific titlebar into the page
window.addEventListener('DOMContentLoaded', () => {
  // Titlebar element
  const bar = document.createElement('div');
  bar.id = 'electron-titlebar';
  document.body.prepend(bar);

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    #electron-titlebar {
      height: 2.5rem;
      background: #0f172a;
      -webkit-app-region: drag;
      position: relative;
      z-index: 9999;
      flex-shrink: 0;
      border-bottom: 1px solid #1e293b;
    }

    /* Make the root flex container vertical so the bar sits on top */
    body {
      display: flex;
      flex-direction: column;
      height: 100vh;
      margin: 0;
      overflow: hidden;
    }

    /* The app root fills remaining space below the bar */
    #root {
      flex: 1;
      overflow: hidden;
    }

    /* Keep interactive elements clickable */
    a, button, input, select, textarea, [role="button"], summary {
      -webkit-app-region: no-drag;
    }
  `;
  document.head.appendChild(style);
});
