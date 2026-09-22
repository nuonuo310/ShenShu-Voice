import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/ShenShu-Voice/' : '/',
  build: {
    rollupOptions: {
      input: {
        gallery: resolve(import.meta.dirname, 'index.html'),
        card: resolve(import.meta.dirname, 'card.html'),
        bubble: resolve(import.meta.dirname, 'bubble.html'),
      },
    },
  },
});
