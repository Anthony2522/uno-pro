// Installed once the user visits online. Do not cache private API responses.
// This file is transformed by the Vite build with a list of *all* route bundles.
const SHELL="__UNO_CACHE_VERSION__";
const PRECACHE=__UNO_PRECACHE__;
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())
      if(key.startsWith("uno-offline-")&&key!==SHELL)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin)return;
  const url=new URL(req.url);
  if(url.pathname.startsWith("/api/"))return; // never cache authentication or game API data
  if(req.mode==="navigate"){
    event.respondWith((async()=>{
      const cache=await caches.open(SHELL);
      try{
        const response=await fetch(req,{signal:AbortSignal.timeout(3200)});
        if(response.ok)await cache.put("/",response.clone());
        return response;
      }catch{
        const fallback=await cache.match("/");
        if(fallback)return fallback;
        return new Response("Conexão indisponível. Abra o UNO Pro uma vez online para instalar o modo offline.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
      }
    })());return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(SHELL);
    const cached=await cache.match(req);
    if(cached)return cached;
    const response=await fetch(req);
    if(response.ok&&response.type==="basic")event.waitUntil(cache.put(req,response.clone()));
    return response;
  })());
});
