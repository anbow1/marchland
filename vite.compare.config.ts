import { defineConfig } from 'vite';

// Builds only the style-comparison page (compare.html), apart from the game.
export default defineConfig({
  base: './',
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  build: { target: 'es2022', outDir: 'dist-compare', chunkSizeWarningLimit: 2500, rollupOptions: { input: 'compare.html' } },
});
