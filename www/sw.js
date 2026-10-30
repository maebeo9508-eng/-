/* 서비스 워커: 앱 파일을 모두 기기에 담아 두고 인터넷 없이도 열리게 한다 (비행기 모드 포함).
   파일을 고치면 VERSION을 올려야 기기에 담긴 앱이 새것으로 바뀜 (settings.js의 APP_VERSION과 같이) */
const VERSION = '1.0.1';
const CACHE = `hjdm-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/icons.js', 'js/storage.js', 'js/geom.js', 'js/measure.js', 'js/model.js', 'js/catalog.js', 'js/joins.js',
  'js/canvas.js', 'js/draw.js', 'js/snap.js', 'js/dxf.js', 'js/dwg.js', 'js/underlay.js', 'js/rooms.js',
  'js/input.js', 'js/tools.js', 'js/ui.js', 'js/props.js', 'js/catalog-ui.js', 'js/export.js',
  'js/summary.js', 'js/edit.js', 'js/settings.js', 'js/projects.js', 'js/keys.js', 'js/main.js',
  'js/dwg-worker.js',
  'lib/libredwg/libredwg.js', 'lib/libredwg/libredwg.wasm', 'lib/libredwg/LICENSE',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

// 옛 버전 저장분 지우기
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hjdm-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 담아 둔 것을 먼저 쓰고, 없으면 받아 옴. 페이지 열기는 인터넷이 없어도 담아 둔 index.html로
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    })
  );
});
