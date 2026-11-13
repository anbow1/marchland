import { defineConfig } from 'vite';

// Builds the pages for looking at art (compare.html, gallery.html), apart from the game.
export default defineConfig({
  base: './',
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  build: { target: 'es2022', outDir: 'dist-compare', chunkSizeWarningLimit: 2500, rollupOptions: { input: ['compare.html', 'gallery.html'] } },
});
