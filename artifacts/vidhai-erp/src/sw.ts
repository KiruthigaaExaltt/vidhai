/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<any> };
const version = "v1";
const runtimeCaches = new Set([`vidhai-navigation-${version}`, `vidhai-public-images-${version}`, `vidhai-font-styles-${version}`, `vidhai-font-files-${version}`]);

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();
self.addEventListener("message", event => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.some(client => client.visibilityState === "visible")) return;
    let data: any = {};
    try { data = event.data?.json() ?? {}; } catch { data = { message: event.data?.text() }; }
    await self.registration.showNotification(data.title || "Vidhai ERP", {
      body: data.message || "You have a new notification.",
      icon: new URL("pwa-192x192.png", self.registration.scope).href,
      badge: new URL("pwa-192x192.png", self.registration.scope).href,
      tag: data.tag || `notification-${data.notificationId || Date.now()}`,
      data: {
        notificationId: data.notificationId,
        navigationUrl: data.navigationUrl || "/notifications",
      },
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data || {};
    if (data.notificationId) {
      try {
        await fetch(`api/notifications/${data.notificationId}/read`, {
          method: "PATCH",
          credentials: "include",
        });
      } catch {}
    }
    const destination = new URL(data.navigationUrl || "notifications", self.registration.scope).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(destination);
        return client.focus();
      }
    }
    return self.clients.openWindow(destination);
  })());
});

registerRoute(({ url }) => url.origin === self.location.origin && url.pathname.includes("/api/"), new NetworkOnly());
registerRoute(
  ({ request, url }) => request.mode === "navigate" && url.origin === self.location.origin && !url.pathname.includes("/api/"),
  new NetworkFirst({ cacheName: `vidhai-navigation-${version}`, networkTimeoutSeconds: 5, plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 604800, purgeOnQuotaError: true })] }),
);
registerRoute(
  ({ request, url }) => request.destination === "image" && url.origin === self.location.origin && !url.search && !url.pathname.includes("/api/"),
  new StaleWhileRevalidate({ cacheName: `vidhai-public-images-${version}`, plugins: [new ExpirationPlugin({ maxEntries: 110, maxAgeSeconds: 2592000, purgeOnQuotaError: true })] }),
);
registerRoute(({ url }) => url.origin === "https://fonts.googleapis.com", new StaleWhileRevalidate({ cacheName: `vidhai-font-styles-${version}`, plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 604800 })] }));
registerRoute(({ request, url }) => request.destination === "font" && url.origin === "https://fonts.gstatic.com", new CacheFirst({ cacheName: `vidhai-font-files-${version}`, plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 31536000, purgeOnQuotaError: true })] }));

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith("vidhai-") && !runtimeCaches.has(name)).map(name => caches.delete(name)))));
});
setCatchHandler(async ({ event }) => {
  if ((event as FetchEvent).request.destination === "document") return (await matchPrecache(new URL("index.html", self.registration.scope).href)) || Response.error();
  return Response.error();
});
