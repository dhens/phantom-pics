const CACHE_NAME = 'snapclone-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    'https://code.jquery.com/jquery-3.6.0.min.js'
];
let badgeCount = 0;

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
self.addEventListener('push', async (event) => {
    console.log('[Service Worker] Push Received.');
    console.log(`[Service Worker] Push had this data: "${event.data.text()}"`);

    let pushData;
    try {
        pushData = await event.data.json()
    } catch (e) {
        console.error('Error parsing push data:', e);
        pushData = {
            from: 'Unknown',
            imageUrl: 'default-image-url'
        };
    }

    const timestamp = new Date().toLocaleTimeString();
    const title = `New Pic from ${pushData.from} at ${timestamp}`;
    const options = {
        body: `You received a new photo! (Test notification ${timestamp})`,
        icon: '/icon.png',
        badge: '/badge.png',
        image: pushData.imageUrl,
        data: pushData,
        tag: 'test-notification',
        renotify: true
    };

    badgeCount++;

    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => {
                console.log('Notification successfully shown with title:', title);
            })
            .catch((error) => {
                console.error('Error showing notification:', error);
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


self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click received.');

    event.notification.close();

    const photoUrl = event.notification.data.imageUrl;

    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url === '/' && 'focus' in client) {
                        client.focus();
                        client.postMessage({
                            type: 'LOAD_PHOTO',
                            photoUrl: photoUrl
                        });
                        return;
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('/?photo=' + encodeURIComponent(photoUrl));
                }
            })
            .then(() => {
                badgeCount = Math.max(0, badgeCount - 1);
                return updateBadge();
            })
    );
});

function updateBadge() {
    if ('setAppBadge' in navigator) {
        if (badgeCount > 0) {
            return navigator.setAppBadge(badgeCount);
        } else {
            return navigator.clearAppBadge();
        }
    }
    return Promise.resolve();
}