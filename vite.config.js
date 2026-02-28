// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'dist'),
  server: {
    port: 5173,
  },
});
