// Offline cache for the installed app.
//  - page navigations: network first, cached app shell when offline
//  - /assets/*: cache first (file names are content-hashed by Vite)
//  - /data/<semester>.json?v=<dump version>: cache first; a new dump means a new URL, old copies are dropped
//  - vvzapi.ch course details: stale-while-revalidate (search responses are too large to keep)
const SHELL = 'shell-v1';
const DATA = 'data-v1';
const API = 'api-v1';
const API_ENTRIES = 400;

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    const res = await fetch('/', { cache: 'no-cache' });
    const html = await res.clone().text();
    await cache.put('/', res);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
    await cache.addAll([...new Set(assets), '/manifest.webmanifest', '/icon.svg']);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (![SHELL, DATA, API].includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request, SHELL));
    else if (url.pathname.startsWith('/data/') && url.searchParams.has('v')) event.respondWith(cacheFirst(request, DATA, true));
    else event.respondWith(staleWhileRevalidate(event, SHELL));
  } else if (url.origin === 'https://vvzapi.ch' && url.pathname.startsWith('/api/v1/')) {
    event.respondWith(staleWhileRevalidate(event, API, API_ENTRIES));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put('/', res.clone());
    return res;
  } catch {
    return (await cache.match('/')) ?? Response.error();
  }
}

async function cacheFirst(request, name, dropOldVersions = false) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Never pin an SPA-fallback page (index.html) under an asset or data URL.
  if (res.ok && !res.headers.get('content-type')?.includes('text/html')) {
    if (dropOldVersions) {
      const path = new URL(request.url).pathname;
      for (const old of await cache.keys()) {
        if (new URL(old.url).pathname === path) await cache.delete(old);
      }
    }
    await cache.put(request, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(event, name, maxEntries) {
  const cache = await caches.open(name);
  const hit = await cache.match(event.request);
  const fresh = fetch(event.request).then(async res => {
    if (res.ok) {
      await cache.put(event.request, res.clone());
      if (maxEntries) {
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - maxEntries))) await cache.delete(old);
      }
    }
    return res;
  });
  if (!hit) return fresh;
  event.waitUntil(fresh.catch(() => {}));
  return hit;
}
