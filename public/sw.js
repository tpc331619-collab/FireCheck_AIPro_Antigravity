const CACHE_NAME = 'firecheck-cache-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((name) => {
                        if (name !== CACHE_NAME) {
                            return caches.delete(name);
                        }
                    })
                );
            }),
            self.clients.claim()
        ])
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip Chrome extension requests or other protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // Firebase Data (Firestore) - Let Firebase SDK handle it
    if (url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('googleapis.com')) {
        return;
    }

    // Strategy 1: Stale-While-Revalidate for JS, CSS, Images, Fonts
    if (event.request.destination === 'style' ||
        event.request.destination === 'script' ||
        event.request.destination === 'image' ||
        event.request.destination === 'font') {

        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    const fetchPromise = fetch(event.request).then((networkResponse) => {
                        // Cloning only valid responses
                        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => {
                        // Fetch failed (offline), return nothing (cachedResponse handles it)
                        return cachedResponse;
                    });

                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    // Strategy 2: Network First for HTML and others (Navigation)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(event.request);
            })
        );
        return;
    }
});
