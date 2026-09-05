/* global self, URL, caches, Response */
/* Only intercept explicitly generated game-preview paths. Editor requests pass through. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin === self.location.origin &&
    url.pathname.includes('/__protomake_preview__/')
  )
    event.respondWith(
      caches
        .open('protomake-game-preview-v1')
        .then(
          async (cache) =>
            (await cache.match(event.request)) ??
            new Response(
              'Preview expired. Build and preview again from ProtoMake.',
              { status: 404, headers: { 'Content-Type': 'text/plain' } },
            ),
        ),
    );
});
