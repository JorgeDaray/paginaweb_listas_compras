/* sw.js - FIX: no devolver index.html para scripts (evitar MIME error) */
const CACHE = "mi-cache-v4";
const RUNTIME = "runtime-cache-v1";
const MAX_RUNTIME_ENTRIES = 200;

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./favicon.ico",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

const EXTERNAL_MODULES = [
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js",
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js"
];

function isFirestoreRpc(url) {
  return url.includes("/google.firestore.v1.Firestore/Listen") ||
         url.includes("/google.firestore.v1.Firestore/Write") ||
         (url.includes("/google.firestore.v1.Firestore/") && url.includes("channel?"));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of APP_SHELL) {
      try {
        const resp = await fetch(url, { cache: "reload" });
        if (resp && resp.ok) await cache.put(url, resp.clone());
      } catch (err) { console.warn("[SW] install fail cache:", url); }
    }
    const runtime = await caches.open(RUNTIME);
    for (const url of EXTERNAL_MODULES) {
      try {
        const r = await fetch(url, { mode: "cors" });
        if (r && r.ok && r.type !== "opaque") await runtime.put(url, r.clone());
      } catch (e) { console.warn("[SW] external module not cached:", url); }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE && k !== RUNTIME) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    return limitCacheSize(cacheName, maxItems);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = req.url;

  // 1) No cachear ni interferir con Firestore RPC/long-polling channels
  if (isFirestoreRpc(url)) {
    event.respondWith((async () => {
      try { return await fetch(req); } catch (e) {
        if (req.mode === "navigate") {
          const c = await caches.open(CACHE);
          return c.match("./index.html") || new Response("offline", { status: 503 });
        }
        return new Response("offline", { status: 503 });
      }
    })());
    return;
  }

  // 2) Navegación: network-first con fallback index.html (solo para nav)
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", net.clone()).catch(()=>{});
        return net;
      } catch (err) {
        const cache = await caches.open(CACHE);
        return cache.match("./index.html") || new Response("offline", { status: 503 });
      }
    })());
    return;
  }

  // 3) Normal resources: intentar cache match con varias claves (para evitar mismatch por query)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // helper: probar varias variantes para resolver problemas con keys
    async function tryMatchVariants(request) {
      let m = await cache.match(request);
      if (m) return m;
      const urlNoSearch = request.url.split('?')[0];
      m = await cache.match(urlNoSearch);
      if (m) return m;
      try {
        const pathname = new URL(urlNoSearch).pathname;
        m = await cache.match(pathname);
        if (m) return m;
      } catch(e){}
      // también checar runtime cache
      const runtime = await caches.open(RUNTIME);
      m = await runtime.match(request) || await runtime.match(urlNoSearch);
      if (m) return m;
      return null;
    }

    const cached = await tryMatchVariants(req);
    if (cached) return cached;

    // 4) Si no hay cache: intentar fetch de red
    try {
      const netResp = await fetch(req);
      if (netResp && netResp.ok) {
        // guardar sólo si es un recurso que queremos almacenar (no RPC)
        const runtime = await caches.open(RUNTIME);
        await runtime.put(req, netResp.clone()).catch(()=>{});
        await limitCacheSize(RUNTIME, MAX_RUNTIME_ENTRIES);
      }
      return netResp;
    } catch (err) {
      // Al caer la red: no devolver index.html para scripts/estilos/fuentes
      const accept = req.headers.get('accept') || '';
      const dest = req.destination || '';
      const isScriptLike = dest === 'script' || req.url.endsWith('.js') || accept.includes('application/javascript') || accept.includes('module');
      const isStyleLike = dest === 'style' || req.url.endsWith('.css') || accept.includes('text/css');
      const isFontLike = dest === 'font' || req.url.endsWith('.woff2') || req.url.endsWith('.woff') || req.url.endsWith('.ttf');
      const isImageLike = dest === 'image' || accept.includes('image/');

      if (isScriptLike || isStyleLike || isFontLike) {
        // devolver error 503 (no HTML) para que el navegador no trate de ejecutar HTML como JS
        return new Response("offline", { status: 503, statusText: "offline" });
      }
      // para otros recursos que no sean scripts, devolver index.html fallback si existe
      const fallback = await cache.match("./index.html");
      return fallback || new Response("offline", { status: 503 });
    }
  })());
});
