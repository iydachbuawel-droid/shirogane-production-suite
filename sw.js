const CACHE = 'shirogane-pwa-v1.8.1';
const APP_SHELL = [
  './', './index.html', './styles.css?v=1.8.1', './app.js?v=1.8.1',
  './cloud-config.js?v=1.8.1', './cloud-sync.js?v=1.8.1',
  './receipt-public.js?v=1.8.1', './receipt-tools.js?v=1.8.1',
  './public-version.json', './receipt.html', './manifest.webmanifest', './app-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || (await caches.match('./index.html')))
  );
});
