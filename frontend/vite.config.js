import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import securityHeaders from './vite-plugins/securityHeaders.js';

export default defineConfig({
  plugins: [react(), securityHeaders()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true
      }
    }
  }
});
