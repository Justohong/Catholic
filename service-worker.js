const CACHE_NAME = 'schedule-pwa-cache-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './db.js',
    './master_data_logic.js',
    './master_data_ui.js',
    './manifest.json',
    './offline.html',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    './attendance_logic.js',
    './attendance_ui.js',
    './schedule_generation_logic.js',
    './schedule_generation_ui.js',
    './share_logic.js',
    './share_ui.js',
    'https://cdn.tailwindcss.com?plugins=typography',
    'https://unpkg.com/lucide@latest',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
            .catch(err => console.error('Failed to cache resources during install:', err))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(
                    (networkResponse) => {
                        if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            if (event.request.mode === 'navigate') {
                                return caches.match('offline.html');
                            }
                            return networkResponse;
                        }



                        return networkResponse;
                    }
                ).catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('offline.html');
                    }
                });
            })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
