const CACHE_NAME = 'osaka-travel-desk-v4'
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.png',
  './app-icon.png',
  './pwa-192.png',
  './pwa-512.png',
  './apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html')),
    )
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response.ok) return response
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))),
  )
})
