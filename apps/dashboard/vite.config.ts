import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false, // Disable SW in dev — prevents stale cache issues
      },
      manifest: {
        name: 'Cyclawps',
        short_name: 'Agents',
        description: 'AI Agent Orchestration Dashboard',
        start_url: '/',
        display: 'standalone',
        background_color: '#0d1117',
        theme_color: '#0d1117',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Network-first for everything — never serve stale bundles
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/localhost/,
            handler: 'NetworkFirst',
            options: { cacheName: 'app-cache' },
          },
        ],
        navigateFallback: '/index.html',
        // Don't precache Vite dev assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@agents-manager/shared': path.join(ROOT, 'libs/shared/src/index.ts'),
      '@agents-manager/styles': path.join(ROOT, 'libs/shared/src/styles'),
      '@agents-manager/kanban': path.join(ROOT, 'apps/kanban-board/src'),
      '@agents-manager/chat': path.join(ROOT, 'apps/chat-client/src'),
      '@agents-manager/configurator': path.join(ROOT, 'apps/agent-configurator/src'),
      'react': path.join(ROOT, 'node_modules/react'),
      'react-dom': path.join(ROOT, 'node_modules/react-dom'),
      'react/jsx-runtime': path.join(ROOT, 'node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': path.join(ROOT, 'node_modules/react/jsx-dev-runtime'),
      'react-router-dom': path.join(ROOT, 'node_modules/react-router-dom'),
      'socket.io-client': path.join(ROOT, 'node_modules/socket.io-client'),
      '@tanstack/react-query': path.join(ROOT, 'node_modules/@tanstack/react-query'),
      'lucide-react': path.join(ROOT, 'node_modules/lucide-react'),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom', 'socket.io-client', '@tanstack/react-query', 'lucide-react'],
  },
  cacheDir: path.join(ROOT, 'node_modules/.vite-dashboard'),
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', '@tanstack/react-query'],
    entries: [
      'src/**/*.tsx',
      '../kanban-board/src/**/*.tsx',
      '../chat-client/src/**/*.tsx',
      '../agent-configurator/src/**/*.tsx',
    ],
  },
  server: {
    host: true,
    port: 4000,
    headers: { 'Cache-Control': 'no-store' },
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  css: {
    postcss: path.join(__dirname, 'postcss.config.js'),
  },
});
