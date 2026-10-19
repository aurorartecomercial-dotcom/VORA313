const CACHE_NAME = 'vora313-cache-v71-desempenho';
const APP_SHELL = [
  // A versão anterior descarregava dezenas de páginas e módulos em paralelo
  // na primeira visita. Isso congestiona dados móveis. O restante continua
  // a ser guardado automaticamente quando o utilizador o visitar.
  './','./index.html','./style.css','./logo-vora-313.png','./manifest.json'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(async cache => { await Promise.allSettled(APP_SHELL.map(u => cache.add(u).catch(()=>null))); await self.skipWaiting(); })));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  const req = event.request;
  const path = new URL(req.url).pathname.toLowerCase();
  // Admin/login must never be served from an old HTML cache.
  if (path.endsWith('/admin.html') || path.endsWith('/js/admin.js')) {
    event.respondWith(fetch(req, { cache: 'no-store' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c=>c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req)));
    return;
  }
  if (req.destination === 'script' || req.destination === 'style') {
    event.respondWith(fetch(req).then(res => { const copy=res.clone(); caches.open(CACHE_NAME).then(c=>c.put(req,copy)); return res; }).catch(()=>caches.match(req)));
    return;
  }
  event.respondWith(fetch(req).then(res => { if(res.ok) { const copy=res.clone(); caches.open(CACHE_NAME).then(c=>c.put(req,copy)); } return res; }).catch(()=>caches.match(req).then(cached=>cached || caches.match('./index.html'))));
});
