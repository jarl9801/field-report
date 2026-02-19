// Service Worker for Umtelkomd Field Report PWA
const CACHE_NAME = 'field-report-v3';
const RUNTIME_CACHE = 'field-report-runtime-v3';
const OFFLINE_URL = './index.html';

// Files to cache during installation
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js'
];

// Install event
self.addEventListener('install', event => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - Network First, falling back to Cache
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Network first strategy for API calls
  if (url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache first strategy for app shell
  if (shouldUseCacheFirst(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network first with cache fallback for other resources
  event.respondWith(networkFirstWithFallback(request));
});

// Cache first strategy
function cacheFirst(request) {
  return caches.match(request)
    .then(response => {
      if (response) {
        return response;
      }
      return fetch(request)
        .then(response => {
          // Clone the response before caching
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE)
            .then(cache => {
              cache.put(request, responseToCache);
            });
          return response;
        });
    })
    .catch(() => {
      // Return offline page if all else fails
      if (request.destination === 'document') {
        return caches.match(OFFLINE_URL);
      }
      return new Response('Offline - Resource not available', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({
          'Content-Type': 'text/plain'
        })
      });
    });
}

// Network first strategy
function networkFirst(request) {
  return fetch(request)
    .then(response => {
      // Clone and cache successful responses
      if (response.status === 200) {
        const responseToCache = response.clone();
        caches.open(RUNTIME_CACHE)
          .then(cache => {
            cache.put(request, responseToCache);
          });
      }
      return response;
    })
    .catch(() => {
      // Fall back to cache
      return caches.match(request)
        .then(response => {
          if (response) {
            return response;
          }
          // Return offline indicator
          return new Response(JSON.stringify({
            offline: true,
            message: 'No connection available'
          }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'application/json'
            })
          });
        });
    });
}

// Network first with fallback
function networkFirstWithFallback(request) {
  return fetch(request)
    .then(response => {
      // Cache successful responses
      if (response.status === 200) {
        const responseToCache = response.clone();
        caches.open(RUNTIME_CACHE)
          .then(cache => {
            cache.put(request, responseToCache);
          });
      }
      return response;
    })
    .catch(() => {
      // Fall back to cache
      return caches.match(request)
        .then(response => {
          return response || new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
    });
}

// Determine if resource should use cache-first strategy
function shouldUseCacheFirst(pathname) {
  const cacheFirstPatterns = [
    /\.css$/,
    /\.js$/,
    /\.woff2?$/,
    /\.ttf$/,
    /\.eot$/,
    /manifest\.json$/
  ];

  return cacheFirstPatterns.some(pattern => pattern.test(pathname));
}

// Background sync for pending submissions
self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);

  if (event.tag === 'sync-submissions') {
    event.waitUntil(syncSubmissions());
  }
});

// Sync submissions function
function syncSubmissions() {
  return new Promise((resolve, reject) => {
    // This would sync IndexedDB submissions to Google Apps Script
    // Implementation depends on your backend setup
    console.log('[SW] Syncing pending submissions...');
    resolve();
  });
}

// Push notification handler
self.addEventListener('push', event => {
  console.log('[SW] Push event:', event);

  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%2300C853" width="192" height="192"/><text x="96" y="110" font-size="120" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="white">FR</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%2300C853" width="192" height="192"/><text x="96" y="110" font-size="120" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="white">FR</text></svg>',
      tag: 'field-report-notification',
      requireInteraction: false
    };

    event.waitUntil(
      self.registration.showNotification('Field Report', options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click:', event);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Look for an existing window/tab with the target URL
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // If not found, open new window
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
  );
});

// Message handler for client communication
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(RUNTIME_CACHE)
      .then(() => {
        console.log('[SW] Cache cleared');
      });
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: CACHE_NAME
    });
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', event => {
  console.log('[SW] Periodic sync event:', event.tag);

  if (event.tag === 'sync-field-reports') {
    event.waitUntil(syncFieldReports());
  }
});

// Sync field reports function
function syncFieldReports() {
  return new Promise((resolve, reject) => {
    // Sync offline stored reports with backend
    console.log('[SW] Syncing field reports...');
    resolve();
  });
}

// Log successful activation
console.log('[SW] Service Worker loaded');
