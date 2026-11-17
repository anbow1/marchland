import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Writes dist/sw.js (tools/pwa/sw-template.js) after the build, with every file of the build and a
 * revision of each (a hash of its bytes), so the service worker downloads only what changed.
 */
export function offlineFiles(): Plugin {
  let outDir = 'dist';
  return {
    name: 'marchland-offline-files',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files: Record<string, string> = {};
      const walk = (dir: string): void => {
        for (const name of readdirSync(dir).sort()) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) walk(path);
          else {
            const rel = relative(outDir, path).split('\\').join('/');
            if (rel === 'sw.js' || rel.endsWith('.map')) continue;
            files[rel] = createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 12);
          }
        }
      };
      walk(outDir);
      const listed = JSON.stringify(files);
      const template = readFileSync(resolve(__dirname, 'sw-template.js'), 'utf8');
      // A new version when any file changes, or the worker itself.
      const version = createHash('sha1').update(listed).update(template).digest('hex').slice(0, 12);
      writeFileSync(join(outDir, 'sw.js'), template.replace('__VERSION__', version).replace('__FILES__', listed));
    },
  };
}
