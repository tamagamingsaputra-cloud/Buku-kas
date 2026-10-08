/* ============================================================
   service-worker.js — Buku Kas
   Cache app-shell sederhana supaya aplikasi tetap bisa dibuka
   walau koneksi internet sedang tidak tersedia.
   Data tetap disimpan di IndexedDB, bukan di service worker ini.
   ============================================================ */

const CACHE_NAME = 'bukukas-cache-v5';
const APP_SHELL = [
  './index.html',
  './style.css',
  './script.js',
  './database.js',
  './firebase-config.js',
  './cloud-sync.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first: file aplikasi selalu diambil dari server dulu, jadi
  // setiap deploy baru langsung terlihat. Cache hanya dipakai saat offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
