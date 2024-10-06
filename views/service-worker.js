const CACHE_NAME = 'snapclone-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    'https://code.jquery.com/jquery-3.6.0.min.js'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', function (event) {
    event.respondWith(
        caches.match(event.request)
            .then(function (response) {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            }
            )
    );
});

self.addEventListener('push', function (event) {
    const options = {
        body: event.data.text(),
        icon: 'icon.png',
        badge: 'badge.png'
    };

    event.waitUntil(
        self.registration.showNotification('New Message', options)
    );
});

if ('serviceWorker' in navigator && 'PushManager' in window) {
    console.log('Service Worker and Push is supported');

    navigator.serviceWorker.register('/service-worker.js')
        .then(function (registration) {
            console.log('Service Worker registered');

            // Request permission for push notifications
            return registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8Array('your_vapid_public_key')
            });
        })
        .then(function (pushSubscription) {
            console.log('Received PushSubscription: ', JSON.stringify(pushSubscription));

            // Here, pushSubscription contains all the data you need:
            // - endpoint
            // - keys.p256dh
            // - keys.auth

            // Send this pushSubscription to your server
            return fetch('/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(pushSubscription)
            });
        })
        .catch(function (err) {
            console.error('Failed to subscribe:', err);
        });
} else {
    console.warn('Push messaging is not supported');
}