import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@cyclawps/shared': path.resolve(__dirname, '../../libs/shared/src/index.ts'),
      '@cyclawps/styles': path.resolve(__dirname, '../../libs/shared/src/styles'),
    },
  },
  server: {
    port: 4200,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
