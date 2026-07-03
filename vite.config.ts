import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Electron production loads dist/index.html via loadFile; assets must resolve relatively.
  base: './',
  plugins: [react(), tailwindcss()],
});
