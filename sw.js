/* Guarda la app en el teléfono para que funcione sin internet. */
const CACHE = 'anny-v6';
const SHELL = ['./', 'index.html', 'styles.css', 'core.js', 'merc.js', 'informe.js', 'app.js', 'vendor/jspdf.umd.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  /* cache: 'reload' = bajar siempre la copia nueva del sitio. Sin esto, el navegador podría guardar
     archivos viejos (los guarda hasta 10 minutos) bajo el nombre de la versión nueva. */
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Responde rápido desde el teléfono y, si hay internet, se actualiza por detrás. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const red = fetch(e.request).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || red;
  }));
});
