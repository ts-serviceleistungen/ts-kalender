const CACHE='ts-kalender-v10-sync';
const SHELL=['./','./index.html','./style.css?v=10sync','./app.js?v=10sync','./config.js','./manifest.json','./icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k.startsWith('ts-kalender-') && k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin) return;

  const appFile=url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js');

  if(appFile){
    event.respondWith(
      fetch(event.request).then(response=>{
        if(response && response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(c=>c.put(event.request,copy));
        }
        return response;
      }).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html')))
    );
  }else{
    event.respondWith(caches.match(event.request).then(c=>c||fetch(event.request)));
  }
});