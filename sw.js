// sw.js
// ⚡ PWA offline para tu app de listas

const CACHE = "listas-v3";

// Resuelve rutas absolutas robustas
const INDEX_URL = new URL("./index.html", self.location).href;
const SCRIPT_URL = new URL("./script.js", self.location).href;
const STYLE_URL  = new URL("./style.css", self.location).href;
const MANIFEST_URL = new URL("./manifest.webmanifest", self.location).href;

const APP_SHELL = [
  INDEX_URL,
  SCRIPT_URL,
  STYLE_URL,
  MANIFEST_URL,
  // ICONOS (ajusta rutas si usas otras)
  new URL("./icons/icon-192.png", self.location).href,
  new URL("./icons/icon-512.png", self.location).href,
  // SDKs de Firebase necesarios en tu app
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js",
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Utilidades de estrategia
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || fetchPromise || Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Navegación de páginas → network first, con fallback a index.html (SPA)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // opcional: refrescamos index en cache
          caches.open(CACHE).then((c) => c.put(INDEX_URL, res.clone())).catch(() => {});
          return res;
        })
        .catch(() => caches.match(INDEX_URL))
    );
    return;
  }

  // Mis recursos (mismo origen) → stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // SDK Firebase / gstatic → cache-first (son estáticos por versión)
  if (/^https:\/\/www\.gstatic\.com\/firebasejs\//.test(url.href)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Fuentes y otros CDNs comunes → stale-while-revalidate
  if (/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/.test(url.host)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Por defecto, probamos SWR
  event.respondWith(staleWhileRevalidate(req));
});
