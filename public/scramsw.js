// Scramjet's service worker. Kept apart from /sw.js (Ultraviolet) so both
// engines can be registered at once and switched between without a reload.
importScripts("/scramjet/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

// Take over any already-open Blackwaves tab the moment this worker installs,
// otherwise the first proxied page would still be handled by the old copy.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Only intercept requests inside the Scramjet prefix. Everything else (our own
// pages, covers, fonts, the Wisp websocket) is left completely alone, so this
// worker costs nothing while you are not using the proxy.
function ours(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin && url.pathname.startsWith("/scramjet/");
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  if (!ours(event.request)) return;
  event.respondWith(
    (async () => {
      await scramjet.loadConfig();
      if (scramjet.route(event)) return scramjet.fetch(event);
      return fetch(event.request);
    })()
  );
});
