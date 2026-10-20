/* Shit Go Where service worker (hand-written, no build step).
 *
 * Served at /sw.js by app/sw.js/route.ts, which swaps __SGW_BUILD__ for the deploy's build id
 * (next.config.ts `env.SGW_BUILD_ID`), so every deploy is a new worker that re-precaches the
 * shell. Scope "/", registered in app/providers.tsx with updateViaCache "none".
 *
 * Built for one bar of signal on an MRT platform:
 *
 * - Install: precaches "/", "/go", "/about", the manifest and icons, plus the /_next/static
 *   scripts and styles those pages reference, so the shell renders offline after one visit.
 * - Navigations: network-first, raced against a 2.5 s timer. If the network hasn't answered by
 *   then, the saved page is served (PAGES before SHELL, ignoring the query string) and the
 *   network carries on in the background to refresh it. If the network fails outright, /go*
 *   falls back to the /go shell (so the "/go?urgent=1" shortcut still opens urgent mode) and
 *   everything else to "/".
 * - GET /api/toilets/nearby and /api/toilets/in-bounds:
 *   - a saved copy of the exact request younger than 10 min is served at once and refreshed in
 *     the background (stale-while-revalidate);
 *   - otherwise network-first with the same 2.5 s race. When the network is slow, fails or
 *     answers 5xx, the saved copy is served: the exact request, else the nearest saved request
 *     with the same filters, else the most recent response for that endpoint from anywhere.
 *   - Saved copies are marked `X-SGW-Saved: <lat>,<lng>,<epochMs>`: where the list was fetched
 *     for (in-bounds: the centre of the box) and when. lib/api/client.ts turns that into
 *     `saved` on the result so the UI can re-measure from where the person is now.
 *   - Nothing saved and no network: a synthetic 503 with `X-SGW-Offline: 1`, which the client
 *     turns into an offline NetworkError that is not retried.
 *   - This cache is not tied to the deploy version, so a deploy doesn't wipe saved toilets.
 * - Other public GET /api reads (toilet detail, reviews, venues, badges, leaderboards):
 *   network-first with the same 2.5 s race, the saved copy as the slow or offline fallback.
 *   Some of these carry the signed-in person's own bits (myReview, confirmedByMe, earned badges,
 *   the leaderboard's `me`); lib/offline.ts forgetSignedInCopies() drops them on sign-out.
 * - /_next/static, /maplibre/<version> and /icons: cache-first (content-hashed or versioned, immutable).
 * - RSC payloads and other same-origin GETs: network-first with the same race.
 * - A 404 or 410 from the network deletes the saved copy (a toilet that was rejected or removed
 *   stops being served from the cache), for pages, RSC payloads and API reads alike.
 * - API, PAGES and DATA caches are trimmed to the 100 most recently stored entries.
 * - Never cached: non-GET requests, /api/auth, /api/me (incl. /api/me/telegram), /api/admin,
 *   /api/submissions, /api/media, /api/integrations, /ingest (analytics), /monitoring (error
 *   reports, POSTs anyway), cross-origin requests,
 *   and any /api path not listed in SAVED_API or NETWORK_FIRST_API.
 * - Photos: /api/media/photos/<id>[/thumb] answers with a redirect to a presigned R2 URL that expires
 *   within hours (the bucket is private), so the worker must never store it: /api/media is in NEVER
 *   and the R2 host is cross-origin, so both hops go straight to the network and the browser's HTTP
 *   cache, which honours the API's Cache-Control (public until the signing window ends for approved
 *   photos, no-store for unapproved ones). Saved API JSON only holds the stable /api/media/photos
 *   paths, so a saved toilet page shows its photos again as soon as there is signal.
 */
const BUILD = "__SGW_BUILD__";
const VERSION = `sgw-${BUILD}`;
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const DATA = `${VERSION}-data`;
// Saved API answers outlive deploys; bump the suffix only if their format changes.
const API = "sgw-api-1";
const CURRENT = [SHELL, STATIC, PAGES, DATA, API];

const SHELL_PAGES = ["/", "/go", "/about"];
const SHELL_URLS = [...SHELL_PAGES, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

const RACE_MS = 2500;
const SWR_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 100;

const SAVED_API = [/^\/api\/toilets\/nearby$/, /^\/api\/toilets\/in-bounds$/];
const NETWORK_FIRST_API = [/^\/api\/toilets\/[^/]+$/, /^\/api\/toilets\/[^/]+\/(reviews|status)$/, /^\/api\/venues\//, /^\/api\/badges$/, /^\/api\/leaderboard\//];
const NEVER = [
  /^\/api\/auth\//,
  /^\/api\/me(\/|$)/,
  /^\/api\/admin\//,
  /^\/api\/submissions/,
  // Photo reads redirect to presigned R2 URLs that expire; uploads and confirms are writes.
  /^\/api\/media\//,
  /^\/api\/integrations\//,
  // Analytics proxy (PostHog, next.config.ts): straight to the network, never stored.
  /^\/ingest(\/|$)/,
  // Sentry error reports (the withSentryConfig tunnel, next.config.ts): straight to the network, never stored.
  /^\/monitoring(\/|$)/,
];

/** Stored on saved API answers: "lat,lng,epochMs" of the place and time they were fetched for. */
const FETCHED = "X-SGW-Fetched";
const LAST = "/__sgw_last";

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sgw-") && !CURRENT.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function precache() {
  const shell = await caches.open(SHELL);
  await Promise.allSettled(SHELL_URLS.map((u) => shell.add(new Request(u, { cache: "reload" }))));
  // A cached page is no use offline without its scripts and styles: cache what the shell
  // pages reference now, rather than hoping they were loaded before the signal went.
  const assets = new Set();
  for (const u of SHELL_PAGES) {
    const res = await shell.match(u);
    if (!res) continue;
    const html = await res.text();
    for (const m of html.matchAll(/\/_next\/static\/[^"'\s\\)<>&]+/g)) assets.add(m[0]);
  }
  const statics = await caches.open(STATIC);
  await Promise.allSettled([...assets].slice(0, 200).map((u) => statics.add(u)));
}

function cacheable(res) {
  return res && res.ok && res.status === 200 && (res.type === "basic" || res.type === "default");
}

/** The thing is gone for good (rejected, deleted): a saved copy must not outlive it. */
function gone(res) {
  return res && (res.status === 404 || res.status === 410);
}

async function forget(cacheName, key) {
  try {
    const c = await caches.open(cacheName);
    await c.delete(key, { ignoreVary: true });
  } catch {
    /* ignore */
  }
}

async function put(cacheName, key, res, max) {
  try {
    const c = await caches.open(cacheName);
    await c.put(key, res);
    if (max) await trim(c, max);
  } catch {
    /* quota or opaque: ignore */
  }
}

/**
 * Keeps the newest `max` entries. A put replaces and re-appends its entry, so key order is the
 * order entries were last stored in, and every visit or revalidation stores again: close
 * enough to least-recently-used without bookkeeping. The per-endpoint "last" copies are kept.
 */
async function trim(cache, max) {
  const keys = (await cache.keys()).filter((k) => !new URL(k.url).pathname.startsWith(LAST));
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

/**
 * Starts the network request and keeps the worker alive until `store` has saved a copy. The
 * copy is taken in the first reaction to the response, before anyone else can read its body.
 */
function fetchAndStore(event, req, store) {
  const network = fetch(req);
  event.waitUntil(network.then((res) => store(res)).catch(() => {}));
  return network;
}

function settle(p) {
  return p.then(
    (res) => ({ res }),
    (err) => ({ err }),
  );
}

/** The network's outcome if it settles within `ms`, otherwise null. */
async function race(network, ms) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([settle(network), late]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Navigations
// ---------------------------------------------------------------------------

/** The newest saved HTML for this path, any query string: pages visited first, then the shell. */
async function savedPage(url) {
  const key = new Request(new URL(url.pathname, self.location.origin).href);
  for (const name of [PAGES, SHELL]) {
    const c = await caches.open(name);
    const hits = await c.matchAll(key, { ignoreSearch: true, ignoreVary: true });
    const html = hits.filter((r) => (r.headers.get("Content-Type") || "").includes("text/html"));
    if (html.length) return html[html.length - 1];
  }
  return null;
}

/** Offline fallback when this exact page was never saved: urgent mode for /go*, else the map. */
function shellFor(url) {
  const p = url.pathname;
  const target = p === "/go" || p.startsWith("/go/") ? "/go" : "/";
  return savedPage(new URL(target, self.location.origin));
}

async function navigate(event, req, url) {
  // Redirected responses can't answer a navigation (Safari refuses them), so never store one.
  const network = fetchAndStore(event, req, (res) =>
    cacheable(res) && !res.redirected
      ? put(PAGES, req, res.clone(), MAX_ENTRIES)
      : gone(res)
        ? forget(PAGES, req)
        : undefined,
  );
  const first = await race(network, RACE_MS);
  if (first && first.res && first.res.status < 500) return first.res;

  // Slow, failed or a server error: a saved copy of this page beats waiting.
  const saved = await savedPage(url);
  if (saved) return saved;

  // Nothing saved for this page: a slow network is still better than the wrong page.
  const outcome = first || (await settle(network));
  if (outcome.res) return outcome.res;
  return (await shellFor(url)) || Response.error();
}

// ---------------------------------------------------------------------------
// Saved toilet lists (nearby, in-bounds)
// ---------------------------------------------------------------------------

const PLACE_PARAMS = ["lat", "lng", "radius", "limit", "minLat", "maxLat", "minLng", "maxLng"];

/** Where a list request is for: its lat/lng, or the centre of its bounding box. */
function centreOf(url) {
  const p = url.searchParams;
  const n = (k) => Number.parseFloat(p.get(k) ?? "");
  const lat = p.has("lat") ? n("lat") : (n("minLat") + n("maxLat")) / 2;
  const lng = p.has("lng") ? n("lng") : (n("minLng") + n("maxLng")) / 2;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** The request minus where it's for: two requests with the same filters share this. */
function filtersOf(url) {
  const p = new URLSearchParams(url.search);
  for (const k of PLACE_PARAMS) p.delete(k);
  p.sort();
  return p.toString();
}

function distanceM(a, b) {
  const k = Math.PI / 180;
  const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k);
  const y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

function fetchedOf(res, key) {
  const v = res.headers.get(FETCHED);
  if (v) {
    const [lat, lng, at] = v.split(",").map(Number);
    if ([lat, lng, at].every(Number.isFinite)) return { lat, lng, at };
  }
  // Not stamped (shouldn't happen): fall back to the request's place and the HTTP date.
  const c = centreOf(new URL(key.url));
  const at = Date.parse(res.headers.get("Date") || "");
  return c ? { ...c, at: Number.isFinite(at) ? at : 0 } : null;
}

function storeList(url, req) {
  return (res) => {
    if (!cacheable(res)) return undefined;
    const centre = centreOf(url);
    if (!centre) return undefined;
    const copy = res.clone();
    return copy.arrayBuffer().then(async (body) => {
      const headers = new Headers(copy.headers);
      headers.set(FETCHED, `${centre.lat},${centre.lng},${Date.now()}`);
      const stamped = () => new Response(body, { status: copy.status, statusText: copy.statusText, headers });
      await put(API, req, stamped(), MAX_ENTRIES);
      await put(API, new Request(`${LAST}${url.pathname}`), stamped());
    });
  };
}

/** The saved answer to use when the network can't: exact, else nearest same filters, else last. */
async function savedList(url, req) {
  const c = await caches.open(API);
  const exact = await c.match(req);
  if (exact) return { res: exact, key: req };

  const want = centreOf(url);
  const filters = filtersOf(url);
  let best = null;
  if (want) {
    for (const key of await c.keys()) {
      const k = new URL(key.url);
      if (k.pathname !== url.pathname || filtersOf(k) !== filters) continue;
      const at = centreOf(k);
      if (!at) continue;
      const d = distanceM(want, at);
      if (!best || d < best.d) best = { key, d };
    }
  }
  if (best) {
    const res = await c.match(best.key);
    if (res) return { res, key: best.key };
  }
  const lastKey = new Request(`${LAST}${url.pathname}`);
  const last = await c.match(lastKey);
  return last ? { res: last, key: lastKey } : null;
}

/** A saved answer, labelled with where and when it was fetched so the UI can say so. */
function markSaved({ res, key }) {
  const f = fetchedOf(res, key);
  const headers = new Headers(res.headers);
  headers.delete(FETCHED);
  if (f) headers.set("X-SGW-Saved", `${f.lat},${f.lng},${f.at}`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function list(event, req, url) {
  const c = await caches.open(API);
  const cached = await c.match(req);
  const fetched = cached ? fetchedOf(cached, req) : null;
  if (cached && fetched && Date.now() - fetched.at < SWR_MAX_AGE_MS) {
    // Same request, recently: answer now and refresh behind it.
    fetchAndStore(event, req, storeList(url, req));
    return cached;
  }

  const network = fetchAndStore(event, req, storeList(url, req));
  const first = await race(network, RACE_MS);
  if (first && first.res && first.res.status < 500) return first.res;

  const saved = await savedList(url, req);
  if (saved) return markSaved(saved);

  const outcome = first || (await settle(network));
  return outcome.res || offlineJson();
}

function offlineJson() {
  return new Response(JSON.stringify({ statusCode: 503, message: "No signal, and nothing saved for this area yet." }), {
    status: 503,
    headers: { "Content-Type": "application/json", "X-SGW-Offline": "1" },
  });
}

// ---------------------------------------------------------------------------
// Everything else
// ---------------------------------------------------------------------------

/**
 * Network-first, raced like navigations: a saved copy answers when the network is slow, fails or
 * answers 5xx; with nothing saved, the network's own answer (or error) is waited for.
 */
async function networkFirst(event, req, cacheName) {
  const network = fetchAndStore(event, req, (res) =>
    cacheable(res) ? put(cacheName, req, res.clone(), MAX_ENTRIES) : gone(res) ? forget(cacheName, req) : undefined,
  );
  const first = await race(network, RACE_MS);
  if (first && first.res && first.res.status < 500) return first.res;

  const cached = await caches.match(req);
  if (cached) return cached;

  const outcome = first || (await settle(network));
  if (outcome.res) return outcome.res;
  throw outcome.err;
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (cacheable(res)) void put(STATIC, req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (NEVER.some((r) => r.test(path))) return;

  // /maplibre/<version>/ is MapLibre itself (app/maplibre), versioned and immutable like /_next/static.
  if (path.startsWith("/_next/static/") || path.startsWith("/icons/") || path.startsWith("/maplibre/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (SAVED_API.some((r) => r.test(path))) {
    event.respondWith(list(event, req, url));
    return;
  }

  if (path.startsWith("/api/")) {
    if (NETWORK_FIRST_API.some((r) => r.test(path))) event.respondWith(networkFirst(event, req, API));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(navigate(event, req, url));
    return;
  }

  // RSC payloads, manifest, other same-origin assets.
  event.respondWith(networkFirst(event, req, DATA));
});
