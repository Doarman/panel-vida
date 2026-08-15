// Service worker: solo cachea el shell propio.
//
// Tres reglas que evitan los bugs clásicos de una PWA:
//
//  1. Nada de otros orígenes. Las APIs de Google y el script de login pasan de
//     largo: un token cacheado o una respuesta vieja de Gmail sería peor que
//     no tener offline.
//
//  2. Todo lo propio va network-first, con el caché como respaldo. Cache-first
//     sobre los .js obliga a acordarse de subir la versión en cada deploy, y
//     el día que te olvidás quedás con el HTML nuevo llamando al código viejo.
//     Acá el caché solo entra en juego cuando no hay red, que es para lo que
//     lo queremos.
//
//  3. El caché se llena solo con lo que ya funcionó (respuestas 200), así una
//     falla de red nunca envenena lo que quedó guardado.

const VERSION = 'pv-v18';
const SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/auth.js',
  './js/api.js',
  './js/contract.js',
  './js/riegos.js',
  './js/ui.js',
  './js/cache.js',
  './js/omitidos.js',
  './js/cultivo-datos.js',
  './js/vistas/plan.js',
  './js/vistas/hoy.js',
  './js/vistas/cultivo.js',
  './js/vistas/rumbo.js',
  './js/vistas/academico.js',
  './js/vistas/laboral.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-64.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.origin !== self.location.origin) return; // regla 1
  if (e.request.method !== 'GET') return;

  // regla 2
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone(); // regla 3
          caches.open(VERSION).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(async () => {
        const hit = await caches.match(e.request, { ignoreSearch: true });
        if (hit) return hit;
        // Sin red y sin copia: si es una navegación, al menos servimos el shell.
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('sin red y sin caché');
      })
  );
});
