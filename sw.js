/* MAX Movie Radar — offline shell and latest fetched catalog snapshots. */
const VERSION='maxradar-shell-v4-streaming';
const SHELL=['./','./index.html','./styles.css','./app.js','./tv.css','./tv.js','./streaming.css','./streaming.js',
  './manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith('maxradar-')&&x!==VERSION).map(x=>caches.delete(x)))),
  self.clients.claim()
])));
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  const url=new URL(req.url);
  const match=url.pathname.match(/\/data\/(releases|tv|streaming)\.json$/);
  if(match){
    const key='./data/'+match[1]+'.json';
    e.respondWith(fetch(req).then(async response=>{
      if(response.ok){const cache=await caches.open(VERSION);await cache.put(key,response.clone())}
      return response;
    }).catch(async()=>(await caches.open(VERSION)).match(key)||Response.error()));
    return;
  }
  e.respondWith(fetch(req).then(response=>{
    if(response.ok&&SHELL.some(path=>new URL(path,self.registration.scope).pathname===url.pathname)){
      const copy=response.clone();
      e.waitUntil(caches.open(VERSION).then(c=>c.put(req,copy)));
    }
    return response;
  }).catch(()=>caches.match(req).then(hit=>hit||caches.match('./index.html'))));
});
