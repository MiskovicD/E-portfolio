// Service worker — maakt de app installeerbaar en werkt offline voor de shell.
// De pagina zelf wordt NETWERK-EERST geladen, zodat een update meteen aankomt
// en je niet vastzit aan een oude versie in de cache. Lukt het net niet, dan
// valt hij terug op de cache. Supabase-verzoeken worden nooit gecachet.
const CACHE = 'fin-v9';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon-32.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Is dit een verzoek om de pagina zelf?
function isPage(req, url) {
  return req.mode === 'navigate' ||
         url.pathname.endsWith('/') ||
         url.pathname.endsWith('/index.html');
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Supabase (auth + data) nooit onderscheppen — altijd live ophalen.
  if (url.hostname.endsWith('supabase.co')) return;
  if (e.request.method !== 'GET') return;

  // De pagina: netwerk eerst, cache als vangnet (offline).
  if (url.origin === self.location.origin && isPage(e.request, url)) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Iconen e.d.: cache eerst, dat scheelt laadtijd.
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
