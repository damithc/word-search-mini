// Gets the latest files whenever the network is available, so a deployed
// change shows up the next time the game is opened, and keeps copies so the
// game still works offline.

const CACHE = 'word-search';
// On a slow connection, use the saved copy rather than wait longer than this.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function fromNetwork(request) {
  // Ask the server whether each file has changed, instead of trusting the
  // browser's cache. A page request can't be copied with changed options.
  const response = request.mode === 'navigate'
    ? await fetch(request.url, { cache: 'no-cache' })
    : await fetch(request, { cache: 'no-cache' });
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request))
    // The page is saved under one link; also serve it for others (e.g. ?name=).
    ?? (request.mode === 'navigate' ? cache.match(request, { ignoreSearch: true }) : undefined);
}

async function respond(request) {
  const network = fromNetwork(request);
  network.catch(() => {}); // handled below; avoids a warning if the timeout wins
  const timeout = new Promise((resolve) => { setTimeout(resolve, NETWORK_TIMEOUT_MS); });
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
    return (await fromCache(request)) ?? await network; // too slow: saved copy, if any
  } catch {
    return (await fromCache(request)) ?? Response.error(); // offline
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Requests that must come from the network (e.g. checking for updates) skip the saved copies.
  if (request.cache === 'no-store') return;
  event.respondWith(respond(request));
});
