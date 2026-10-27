const CACHE_NAME = "pyq-cloud-shell-v4";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/data/pyq-2026-practice.json",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  const isDocument = event.request.mode === "navigate";
  const isStaticAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/mascot-lottie/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/figma-assets/") || url.pathname.startsWith("/figma-assets-oct-2026/") || url.pathname.startsWith("/icons/") || url.pathname === "/data/pyq-2026-practice.json";
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && (isDocument || isStaticAsset)) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(isDocument ? "/" : event.request, copy));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(isDocument ? "/" : event.request);
    if (cached) return cached;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }));
});
