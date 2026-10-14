// TCC Graphics service worker — bump VERSION whenever you change index.html to force an update.
const VERSION = 'v1';
const CACHE = 'tcc-graphics-' + VERSION;

const LOCAL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg'];
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,600;1,500&family=Inter:wght@400;500;600;700&display=swap';
const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // App shell
    await Promise.all(LOCAL.map(u => cache.add(u).catch(() => {})));
    // CDN scripts
    await Promise.all(CDN.map(u => cache.add(u).catch(() => {})));
    // Google Fonts: cache the CSS, then every font file it points to
    try {
      const res = await fetch(FONTS_CSS);
      await cache.put(FONTS_CSS, res.clone());
      const css = await res.text();
      const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
      await Promise.all(urls.map(u => cache.add(u).catch(() => {})));
    } catch (e) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('tcc-graphics-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;

  // Page loads: network first (so updates arrive), fall back to cache when offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('index.html')) || (await caches.match('./')) ||
          new Response('Offline and not cached yet.', { status: 503 });
      }
    })());
    return;
  }

  // Everything else: cache first, refresh in the background
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const refresh = fetch(req).then(async res => {
      if (res && (res.ok || res.type === 'opaque')) {
        (await caches.open(CACHE)).put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    return cached || (await refresh) || new Response('', { status: 504 });
  })());
});
