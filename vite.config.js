import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist', // Pastikan output folder adalah 'dist'
    assetsDir: 'assets', // Folder untuk file JS/CSS
  },
});