"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds so the app opens offline and can be installed. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // A worker left over from `npm start` would serve stale files to `npm run dev`.
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      });
      if ("caches" in window) {
        void caches.keys().then((keys) => {
          for (const key of keys) if (key.startsWith("drip-")) void caches.delete(key);
        });
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }, []);

  return null;
}
