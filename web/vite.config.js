import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // 开发时把 /api 转给后端，这样后端不用配 CORS，前端也不用写完整地址
    proxy: {
      '/api': 'http://localhost:3100',
    },
  },
});
