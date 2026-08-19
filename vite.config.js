import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  server: {
    strictPort: true,
    port: 4173
  },
  build: {
    target: 'es2022'
  }
});
