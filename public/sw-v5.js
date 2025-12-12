const CACHE_NAME = 'ftg-dashboard-v4';

// Only cache truly static assets - NOT versioned CSS/JS
const ASSETS_TO_CACHE = [
  '/logo.png',
  '/data/financials.json',
  '/data/account_groups.json'
];

// Install - cache only static assets and skip waiting immediately
self.addEventListener('install', (event) => {
  console.log('SW v4: Installing');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate - delete ALL old caches immediately
self.addEventListener('activate', (event) => {
  console.log('SW v4: Activating');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('SW v4: Deleting cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - NEVER cache HTML, CSS, or JS - always fetch from network
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Always fetch HTML, CSS, JS from network - never use cache
  if (url.pathname.endsWith('.html') || 
      url.pathname.endsWith('.css') || 
      url.pathname.endsWith('.js') ||
      url.pathname === '/' ||
      url.search.includes('v=')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // For other assets, try cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request))
  );
});

// Listen for messages to clear cache
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
  }
});
