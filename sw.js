// Service worker: solo cachea el shell propio.
//
// Dos reglas que evitan los dos bugs clásicos de una PWA:
//  1. Nada de otros orígenes. Las APIs de Google y el script de login pasan
//     de largo: un token cacheado o una respuesta vieja de Gmail sería peor
//     que no tener offline.
//  2. El HTML va network-first. Si fuera cache-first, un deploy nuevo nunca
//     llegaría y quedarías clavado en una versión vieja sin entender por qué.

const VERSION = 'pv-v1';
const SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/auth.js',
  './js/api.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
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

  if (e.request.mode === 'navigate') {
    // regla 2
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copia));
          }
          return resp;
        })
    )
  );
});
