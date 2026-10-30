import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backendPort = process.env.BACKEND_PORT || 5000;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true
      },
      '/socket.io': {
        target: `http://localhost:${backendPort}`,
        ws: true,
        changeOrigin: true
      }
    }
  }
});
