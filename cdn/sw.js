// Service Worker for ToolFinder PWA
const CACHE_NAME = 'toolfinder-v1.0.0';
const DATA_CACHE_NAME = 'toolfinder-data-v1.0.0';

// Static assets to cache
const FILES_TO_CACHE = [
  './',
  './index.html',
  '.https://cdn.jsdelivr.net/gh/mdsabbirkhan1/S@main/styles.css',
  '."https://cdn.jsdelivr.net/gh/mdsabbirkhan1/S@main/app.js',
  '.https://cdn.jsdelivr.net/gh/mdsabbirkhan1/S@main/tools-data.js',
  './cdn/js/pwa.js',
  './cdn/manifest.json',
  // External resources
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// URLs to cache dynamically
const DYNAMIC_CACHE_URLS = [
  'https://cdnjs.cloudflare.com/',
  'https://fonts.googleapis.com/',
  'https://fonts.gstatic.com/'
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Pre-caching offline page');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => {
        // Force activation of new service worker
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients
      return self.clients.claim();
    })
  );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API or data requests
  if (request.url.includes('/api/') || request.url.includes('data')) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME)
        .then((cache) => {
          return fetch(request)
            .then((response) => {
              // If the request was successful, clone the response and store it in the cache
              if (response.status === 200) {
                cache.put(request.url, response.clone());
              }
              return response;
            })
            .catch(() => {
              // Network request failed, try to get it from the cache
              return cache.match(request);
            });
        })
    );
    return;
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // If network fails, serve the cached index.html
          return caches.open(CACHE_NAME)
            .then((cache) => {
              return cache.match('./index.html');
            });
        })
    );
    return;
  }

  // Handle static asset requests
  event.respondWith(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }

            return fetch(request)
              .then((response) => {
                // Don't cache non-successful responses
                if (!response || response.status !== 200 || response.type !== 'basic') {
                  return response;
                }

                // Clone the response
                const responseToCache = response.clone();

                // Check if we should cache this URL
                const shouldCache = FILES_TO_CACHE.includes(request.url) ||
                                  DYNAMIC_CACHE_URLS.some(pattern => request.url.includes(pattern));

                if (shouldCache) {
                  cache.put(request, responseToCache);
                }

                return response;
              })
              .catch(() => {
                // If both network and cache fail, return a fallback
                if (request.destination === 'image') {
                  // Return a fallback image for failed image requests
                  return new Response(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f3f4f6"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="#9ca3af">Image</text></svg>',
                    { headers: { 'Content-Type': 'image/svg+xml' } }
                  );
                }
                
                // For other requests, return a generic offline response
                return new Response('Offline - Content not available', {
                  status: 503,
                  statusText: 'Service Unavailable'
                });
              });
          });
      })
  );
});

// Handle background sync
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync', event.tag);
  
  if (event.tag === 'tool-usage-sync') {
    event.waitUntil(syncToolUsage());
  }
});

// Handle push notifications (if needed in future)
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received', event);
  
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body || 'New tools available!',
    icon: './cdn/images/icon-192.png',
    badge: './cdn/images/icon-192.png',
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: './cdn/images/icon.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: './cdn/images/icon.png'
      }
    ],
    data: {
      url: data.url || './',
      timestamp: Date.now()
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ToolFinder', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click received');
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // Open the app
  event.waitUntil(
    clients.openWindow(event.notification.data.url || './')
  );
});

// Background sync function for tool usage data
async function syncToolUsage() {
  try {
    console.log('[ServiceWorker] Syncing tool usage data');
    
    // Here you would typically sync data with your server
    // For now, we'll just log the sync attempt
    const usage = await getStoredUsageData();
    
    if (usage && Object.keys(usage).length > 0) {
      // In a real app, you'd send this to your analytics endpoint
      console.log('[ServiceWorker] Tool usage data to sync:', usage);
      
      // Simulate API call
      // await fetch('/api/analytics/usage', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(usage)
      // });
      
      console.log('[ServiceWorker] Tool usage sync completed');
    }
  } catch (error) {
    console.error('[ServiceWorker] Sync failed:', error);
    throw error; // This will cause the sync to be retried
  }
}

// Helper function to get stored usage data
async function getStoredUsageData() {
  try {
    // Access localStorage through a client
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      // We can't directly access localStorage from service worker
      // In a real implementation, you'd use IndexedDB or message the client
      return null;
    }
  } catch (error) {
    console.error('[ServiceWorker] Error getting usage data:', error);
    return null;
  }
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
  
  if (event.data && event.data.type === 'SYNC_USAGE') {
    // Trigger background sync
    self.registration.sync.register('tool-usage-sync').catch(console.error);
  }
});

// Error handling
self.addEventListener('error', (event) => {
  console.error('[ServiceWorker] Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[ServiceWorker] Unhandled promise rejection:', event.reason);
});

// Cache size management
async function cleanupCache() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  
  // Limit cache size (remove oldest entries if needed)
  const maxCacheSize = 100;
  if (requests.length > maxCacheSize) {
    const itemsToDelete = requests.slice(0, requests.length - maxCacheSize);
    await Promise.all(
      itemsToDelete.map(request => cache.delete(request))
    );
  }
}

// Periodic cache cleanup
setInterval(cleanupCache, 24 * 60 * 60 * 1000); // Daily cleanup