/* Kanawa Soft PWA — app shell cache. API/Auth requests are never cached. */
'use strict';

const CACHE_NAME = 'kanawa-shell-v15.3.20261102.1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './cloud.js',
  './app.js'
];
const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0';

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // Best-effort SDK cache so the app shell can still start when the device is offline.
    try {
      const response = await fetch(SUPABASE_SDK, { mode: 'cors', cache: 'no-cache' });
      if (response.ok && response.type !== 'opaque') await cache.put(SUPABASE_SDK, response);
    } catch (error) {
      // A failed optional SDK cache must not prevent installation of the PWA shell.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (key) {
      return key.startsWith('kanawa-shell-') && key !== CACHE_NAME;
    }).map(function (key) { return caches.delete(key); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSupabaseApi = url.hostname.endsWith('.supabase.co') &&
    (/\/(auth|rest|storage|realtime|functions)\/v1\//.test(url.pathname));
  if (isSupabaseApi) return;

  const isSdkScript = url.href === SUPABASE_SDK && request.destination === 'script';
  const isSameOriginAsset = url.origin === self.location.origin &&
    ['document', 'script', 'style', 'image', 'font'].includes(request.destination);
  if (!isSdkScript && !isSameOriginAsset) return;

  event.respondWith((async function () {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (request.mode === 'navigate') {
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) await cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (error) {
        return cached || cache.match('./index.html');
      }
    }
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok && fresh.type !== 'opaque') await cache.put(request, fresh.clone());
      return fresh;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
