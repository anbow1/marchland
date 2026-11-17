import { T } from './strings.ts';

// Offline play: the service worker (tools/pwa/sw-template.js, filled in by the build with every file
// of the game and its revision) keeps the whole game on the device after the first visit, so an
// iPad with the game on its home screen and the desktop shell (desktop/) play it without the
// internet. A newer version is fetched in the background, only its changed files; it takes over
// when the game is next started, or at once when the player asks.
//
// Off on localhost (the measuring tools and `vite preview`) unless `?sw` asks for it, so a cached
// copy never stands in for a fresh build there.

export function startOffline(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (local && !new URLSearchParams(location.search).has('sw')) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) return;
    location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js')
    .then((registration) => {
      const offer = (worker: ServiceWorker): void => {
        // Only an update: the first install has no page to replace.
        if (!navigator.serviceWorker.controller) return;
        announce(() => {
          reloading = true;
          worker.postMessage('take-over');
        });
      };
      if (registration.waiting) offer(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') offer(worker);
        });
      });
      // A game left open for days still hears of a new version.
      setInterval(() => void registration.update().catch(() => undefined), 30 * 60 * 1000);
    })
    .catch((error: unknown) => console.warn('[offline] no service worker:', error));
}

/** A small note at the top of the screen: the new version, and a button to start it now. */
function announce(restart: () => void): void {
  if (document.getElementById('update-note')) return;
  const note = document.createElement('div');
  note.id = 'update-note';
  note.className = 'update-note';
  const text = document.createElement('span');
  text.textContent = T.updateReady;
  const now = document.createElement('button');
  now.textContent = T.updateNow;
  now.addEventListener('click', restart);
  const close = document.createElement('button');
  close.textContent = '×';
  close.className = 'close';
  close.addEventListener('click', () => note.remove());
  note.append(text, now, close);
  document.body.append(note);
}
