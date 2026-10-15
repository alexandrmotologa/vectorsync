import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, '../../dist/studio'),
    emptyOutDir: true,
  },
  server: {
    port: 50093,
    proxy: {
      '/api': 'http://localhost:50092',
    },
  },
});
