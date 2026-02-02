// Basic Service Worker for PWA Installation
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Pass-through fetch (can be extended for offline caching later)
    event.respondWith(fetch(event.request));
});
