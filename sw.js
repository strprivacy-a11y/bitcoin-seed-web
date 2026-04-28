const CACHE_NAME = "mnemonic-lab-v2";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./english.txt",
  "./manifest.webmanifest",
  "./app-icon.svg",
  "./lib/bip84.js",
  "./lib/qr-svg.js",
  "./lib/QRCode/index.js",
  "./lib/QRCode/QRBitBuffer.js",
  "./lib/QRCode/QRMath.js",
  "./lib/QRCode/QR8bitByte.js",
  "./lib/QRCode/QRRSBlock.js",
  "./lib/QRCode/QRErrorCorrectLevel.js",
  "./lib/QRCode/QRMaskPattern.js",
  "./lib/QRCode/QRMode.js",
  "./lib/QRCode/QRUtil.js",
  "./lib/QRCode/QRPolynomial.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      });
    }),
  );
});
