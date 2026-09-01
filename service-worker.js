/* ==================================================================
   INVENTARIS RUANGAN — SERVICE WORKER
   Strategi: Cache First untuk asset statis, dengan pembersihan
   cache versi lama saat aktivasi.
   ================================================================== */

const CACHE_VERSION = "inventaris-v1.0.0";
const CACHE_NAME = `inventaris-cache-${CACHE_VERSION}`;

// Daftar asset utama yang wajib di-cache agar aplikasi bisa berjalan offline
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

/* ---------------------- INSTALL ---------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ---------------------- ACTIVATE ---------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name.startsWith("inventaris-cache-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ---------------------- FETCH (Cache First) ---------------------- */
self.addEventListener("fetch", (event) => {
  // Hanya tangani permintaan GET
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          // Simpan salinan hasil fetch ke cache untuk penggunaan offline berikutnya
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback ke halaman utama saat offline dan halaman belum di-cache
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return undefined;
        });
    })
  );
});