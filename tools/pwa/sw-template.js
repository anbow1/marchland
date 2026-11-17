// Marchland's service worker, written into dist/sw.js by the build (tools/pwa/plugin.ts), which fills in
// every file of the game and a revision of each. It keeps the whole game on the device for offline play.
// A new version installs into a cache of its own: files whose revision has not changed are copied over
// from the old cache, only the changed ones are downloaded. It takes over when every window of the old
// version is closed (the next start of the game), or at once when the page asks ('take-over').

const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'marchland-' + VERSION;
const REVISIONS = 'revisions.json';
const urlOf = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const older = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith('marchland-') || name === CACHE) continue;
        const old = await caches.open(name);
        const listed = await old.match(urlOf(REVISIONS));
        older.push({ cache: old, revisions: listed ? await listed.json() : {} });
      }
      const entries = Object.entries(FILES);
      let next = 0;
      const one = async () => {
        while (next < entries.length) {
          const [path, revision] = entries[next++];
          const url = urlOf(path);
          let response;
          for (const old of older) {
            if (old.revisions[path] !== revision) continue;
            response = await old.cache.match(url, { ignoreVary: true });
            if (response) break;
          }
          if (!response) {
            response = await fetch(url, { cache: 'reload' });
            if (!response.ok) throw new Error(`${path}: ${response.status}`);
          }
          await cache.put(url, response);
        }
      };
      // Six downloads at a time.
      await Promise.all(Array.from({ length: 6 }, one));
      await cache.put(urlOf(REVISIONS), new Response(JSON.stringify(FILES), { headers: { 'Content-Type': 'application/json' } }));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith('marchland-') && name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'take-over') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = request.mode === 'navigate' ? urlOf('index.html') : request;
      // Whatever the request's headers: a module script asks with an Origin the stored copy's Vary would refuse.
      const kept = await cache.match(key, { ignoreSearch: true, ignoreVary: true });
      return kept ?? fetch(request);
    })(),
  );
});
