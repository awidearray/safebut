// Service Worker for Safe Maternity PWA
const CACHE_NAME = 'safe-maternity-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.html',
  '/styles.css',
  '/globals.css',
  '/app.js',
  '/theme-switcher.js',
  '/logo.png',
  '/512.png',
  '/favicon.ico',
  '/faq.html',
  '/guide.html',
  '/medical.html',
  '/safety.html',
  '/privacy-policy.html',
  '/terms-of-service.html',
  '/login.html',
  '/upgrade.html'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('Cache installation error:', err);
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch Event - Network First, Cache Fallback Strategy
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API calls and external resources for offline cache
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.hostname !== self.location.hostname) {
    // Try network only for API calls
    event.respondWith(
      fetch(event.request).catch(() => {
        // Return a custom offline response for API calls
        if (url.pathname.startsWith('/api/')) {
          return new Response(
            JSON.stringify({ 
              error: 'You are currently offline. Please check your internet connection.' 
            }),
            { 
              headers: { 'Content-Type': 'application/json' },
              status: 503
            }
          );
        }
      })
    );
    return;
  }

  // For everything else, try network first, then cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Don't cache if not a successful response
        if (!response || response.status !== 200) {
          return response;
        }

        // Clone the response as we need to use it twice
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request)
          .then(response => {
            if (response) {
              return response;
            }
            // Return offline page if no cache match
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// Listen for messages from the client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
