import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@agents-manager/shared': path.resolve(__dirname, '../../libs/shared/src/index.ts'),
      '@agents-manager/styles': path.resolve(__dirname, '../../libs/shared/src/styles'),
    },
  },
  server: {
    port: 4202,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
