/*
 * Drip service worker: lets the installed app open without a connection and
 * makes repeat visits instant. All user data lives in localStorage, so caching
 * the page and its files is enough to work fully offline.
 *
 * - The page: network first (always the latest version when online), falling
 *   back to the cached copy when offline or after 3 seconds on a bad connection.
 * - Other pages (privacy, terms): network first, with the last copy kept for
 *   offline reading. They never fall back to the app itself.
 * - /_next/static files: cache first. Their names contain a content hash, so a
 *   cached copy never goes stale.
 * - Icons and the manifest: served from cache, refreshed in the background.
 *
 * Bump VERSION to throw away every cache on the next visit.
 */
const VERSION = "v1";
const PAGE_CACHE = `drip-pages-${VERSION}`;
const ASSET_CACHE = `drip-assets-${VERSION}`;
const APP_SHELL = "/";
const PRECACHE = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const MAX_ASSETS = 200;
const PAGE_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // Cache the page and every file it references, so the app opens offline
        // even if the user never comes back online after the first visit.
        const response = await fetch(APP_SHELL, { cache: "reload" });
        if (response.ok) {
          const html = await response.clone().text();
          await (await caches.open(PAGE_CACHE)).put(APP_SHELL, response);
          const urls = new Set(PRECACHE);
          for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) urls.add(match[1]);
          for (const match of html.matchAll(/"(static\/(?:chunks|css|media)\/[^"\\]+)"/g)) urls.add(`/_next/${match[1]}`);
          const assets = await caches.open(ASSET_CACHE);
          await Promise.all([...urls].map((url) => assets.add(url).catch(() => undefined)));
        }
      } catch {
        // Offline during install: the caches fill up as the app is used instead.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGE_CACHE, ASSET_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith("drip-") && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(page(request, url));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (!url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/api/") && !request.headers.has("RSC")) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function page(request, url) {
  const cache = await caches.open(PAGE_CACHE);
  if (url.pathname !== APP_SHELL) {
    try {
      const response = await fetch(request);
      if (response.ok && !url.pathname.startsWith("/api/")) void cache.put(url.pathname, response.clone());
      return response;
    } catch (error) {
      const copy = await cache.match(url.pathname);
      if (copy) return copy;
      throw error;
    }
  }

  const cached = (await cache.match(APP_SHELL)) || null;
  const network = fetch(request).then((response) => {
    if (response.ok && url.pathname === APP_SHELL) void cache.put(APP_SHELL, response.clone());
    return response;
  });
  if (!cached) return network;

  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), PAGE_TIMEOUT_MS));
  return Promise.race([network.catch(() => cached), timeout]);
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    void trim(cache);
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached || Response.error());
  return cached || network;
}

/** Old builds leave files behind; drop the oldest once the cache gets big. */
async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key);
}

/* ------------------------------------------------------------------------ */
/* Reminder notifications (sent by /api/cron/reminders)                     */
/* ------------------------------------------------------------------------ */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Drip", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || "drip-reminder",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(self.location.origin));
      if (open) await open.focus();
      else await self.clients.openWindow(url);
    })(),
  );
});
