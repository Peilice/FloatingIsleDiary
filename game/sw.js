// 網路優先、失敗時改用快取，開發時改檔不會被舊快取卡住，離線也能玩
const CACHE = 'cloudisland-v1';
const FILES = ['./', './index.html', './game.js', './words.js', './logic.js', './lib/phaser.min.js', './manifest.webmanifest', './icon.svg',
  './fonts/Huninn-subset.woff2', './fonts/Andika-Regular.woff2', './fonts/Andika-Bold.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // cache: 'no-cache'：每次都向伺服器確認有沒有新版，避免瀏覽器的 HTTP 快取直接給舊檔
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
