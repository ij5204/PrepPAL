import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@preppal/types': path.resolve(__dirname, '../../packages/types/src'),
      '@preppal/utils': path.resolve(__dirname, '../../packages/utils/src'),
      '@preppal/validation': path.resolve(__dirname, '../../packages/validation/src'),
    },
  },
  server: {
    port: 3000,
  },
});
