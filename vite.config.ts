import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import { offlineFiles } from './tools/pwa/plugin.ts';

/** The commit and its date ('3f2a1c9 · 2026-11-14'), or 'dev' outside git; read by src/version.ts. */
function buildStamp(): string {
  try {
    const out = execSync('git log -1 --format=%h·%cs', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain -- .', { encoding: 'utf8' }).trim() !== '';
    return out.replace('·', ' · ') + (dirty ? ' +' : '');
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: './',
  // Every file of the build listed for the service worker (offline play: src/ui/offline.ts).
  plugins: [offlineFiles()],
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  resolve: {
    // Addons import 'three'; point it at the WebGPU build so there is one copy of the core.
    alias: [{ find: /^three$/, replacement: 'three/webgpu' }],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
