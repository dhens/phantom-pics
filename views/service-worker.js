const CACHE_NAME = 'snapclone-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    'https://code.jquery.com/jquery-3.6.0.min.js'
];

// Install event: cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache opened');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting()) // Ensure the new service worker becomes active immediately
    );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of all clients immediately
    );
});


// Push event: handle push notifications
self.addEventListener('push', (event) => {
    if (event.data) {
        const pushData = event.data.json();
        const options = {
            body: `New photo from ${pushData.from}`,
            icon: '/icon.png',
            badge: '/badge.png',
            image: pushData.imageUrl,
            data: pushData
        };
        event.waitUntil(
            self.registration.showNotification('New Photo Received', options)
        );
    }
});

// Notification click event: handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // Close the notification

    // This looks to see if the current is already open and focuses if it is
    event.waitUntil(
        clients.matchAll({ type: "window" })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url === '/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

// Function to convert base64 to Uint8Array (for VAPID public key)
function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
