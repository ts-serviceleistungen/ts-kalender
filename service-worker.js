const CACHE='ts-kalender-final2';

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith('ts-kalender-')).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  // Never serve old HTML/JS/CSS from cache.
  const url=new URL(event.request.url);
  if(event.request.method==='GET' &&
     url.origin===location.origin &&
     ['index.html','app.js','style.css','service-worker.js'].some(x=>url.pathname.endsWith(x))){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
  }
});
