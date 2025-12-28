import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://server:5001',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://server:5001',
        ws: true,
      },
    },
  },
});
