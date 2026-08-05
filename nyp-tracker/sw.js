/* Service worker voor NYP Uren & Loon.
   Doel: de app start ook zonder internet. Je uren staan in Supabase (online)
   en in localStorage; hier cachen we alleen de app-bestanden zelf.

   Let op: verhoog CACHE bij elke nieuwe versie, anders blijven oude bestanden hangen. */
const CACHE = "nyp-uren-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Nooit Supabase-verzoeken cachen — die moeten altijd live zijn.
  if (req.url.includes("supabase.co")) return;

  // De pagina zelf: eerst het netwerk (nieuwe versie komt meteen door),
  // geen internet? Dan de opgeslagen versie.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  // Overige app-bestanden: eerst uit de cache (sneller), anders van het netwerk.
  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(res => {
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
    )
  );
});
