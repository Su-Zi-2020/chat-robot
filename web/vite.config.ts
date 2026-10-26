import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 开发时把 /api 转给后端，避免 CORS
      '/api': 'http://localhost:8787',
    },
  },
});
