/* Shit Go Where service worker (hand-written, no build step).
 *
 * - App shell: precached on install, navigations are network-first with the
 *   cached page (or the "/" shell) as the offline fallback.
 * - /_next/static: cache-first (content-hashed, immutable).
 * - GET /api/toilets/nearby and /api/toilets/in-bounds: stale-while-revalidate,
 *   plus the most recent response of each kept as an offline fallback for any
 *   location.
 * - Other public GET /api reads (toilet detail, venues): network-first.
 * - Never cached: non-GET requests, /api/auth, /api/me, /api/admin,
 *   /api/submissions, /api/media, cross-origin requests.
 */
const VERSION = "sgw-v2";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const API = `${VERSION}-api`;
const SHELL_URLS = ["/", "/go", "/about", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

const SWR_API = [/^\/api\/toilets\/nearby$/, /^\/api\/toilets\/in-bounds$/];
const NETWORK_FIRST_API = [/^\/api\/toilets\/[^/]+$/, /^\/api\/toilets\/[^/]+\/(reviews|status)$/, /^\/api\/venues\//, /^\/api\/badges$/, /^\/api\/leaderboard\//];
const NEVER = [/^\/api\/auth\//, /^\/api\/me(\/|$)/, /^\/api\/admin\//, /^\/api\/submissions/, /^\/api\/media\//];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.allSettled(SHELL_URLS.map((u) => c.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(res) {
  return res && res.ok && res.status === 200 && (res.type === "basic" || res.type === "default");
}

async function put(cacheName, key, res) {
  try {
    const c = await caches.open(cacheName);
    await c.put(key, res);
  } catch {
    /* quota or opaque: ignore */
  }
}

function lastKey(pathname) {
  return new Request(`/__sgw_last${pathname}`);
}

async function staleWhileRevalidate(event, req, url) {
  const cache = await caches.open(API);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (cacheable(res)) {
        event.waitUntil(Promise.all([put(API, req, res.clone()), put(API, lastKey(url.pathname), res.clone())]));
      }
      return res;
    })
    .catch(async () => cached || (await cache.match(lastKey(url.pathname))) || offlineJson());
  return cached || network;
}

async function networkFirst(req, cacheName, fallback) {
  try {
    const res = await fetch(req);
    // Not awaited: let streamed pages render while the copy is stored.
    if (cacheable(res)) void put(cacheName, req, res.clone());
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (fallback) {
      const f = await fallback();
      if (f) return f;
    }
    throw e;
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (cacheable(res)) void put(STATIC, req, res.clone());
  return res;
}

function offlineJson() {
  return new Response(JSON.stringify({ statusCode: 503, message: "You're offline. Showing nothing cached for this area yet." }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (NEVER.some((r) => r.test(path))) return;

  if (path.startsWith("/_next/static/") || path.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (SWR_API.some((r) => r.test(path))) {
    event.respondWith(staleWhileRevalidate(event, req, url));
    return;
  }

  if (path.startsWith("/api/")) {
    if (NETWORK_FIRST_API.some((r) => r.test(path))) event.respondWith(networkFirst(req, API));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      networkFirst(req, PAGES, async () => (await caches.match("/", { ignoreSearch: true })) || caches.match(new Request("/"))),
    );
    return;
  }

  // RSC payloads, manifest, other same-origin assets.
  event.respondWith(networkFirst(req, PAGES));
});
