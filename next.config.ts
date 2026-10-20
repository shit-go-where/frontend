import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

/**
 * The browser only ever calls same-origin `/api/...`. Next rewrites those
 * requests to the NestJS API (which has no `/api` prefix), so the session
 * cookie set by the API is first-party everywhere.
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");
// On Vercel a missing API_ORIGIN would quietly rewrite every /api call to localhost: fail the build instead.
if (process.env.VERCEL && !process.env.API_ORIGIN) {
  throw new Error("API_ORIGIN is not set for this Vercel environment (see README, Deployment).");
}

/** Different on every deploy, so app/sw.js/route.ts serves a new worker that re-precaches. */
const SGW_BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? Date.now().toString(36);

const isDev = process.env.NODE_ENV === "development";

/** Error reporting (lib/sentry-options.ts): which deploy an event came from, the same in browser and server. */
const SGW_ENV = process.env.VERCEL_ENV ?? "local";
const SGW_RELEASE = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
/** Source maps are generated and uploaded only when this exists (Vercel only); otherwise none are built. */
const SENTRY_UPLOAD = Boolean(process.env.SENTRY_AUTH_TOKEN);

/**
 * Content-Security-Policy, set as a static header so pages stay prerendered (a nonce would make every
 * page dynamic and rule out the Partial Prerendering shells; node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md). So scripts and styles keep 'unsafe-inline': Next's inline RSC payload
 * scripts and the theme/motion boot script in app/layout.tsx need it. Origins, from the code:
 *
 * - connect-src: same-origin /api (rewrite), /ingest (PostHog, rewrite) and /monitoring (Sentry error
 *   reports, the withSentryConfig tunnel below, so no Sentry origin is needed); OneMap raster tiles fetched
 *   by MapLibre (components/map/ToiletMap.tsx); presigned photo uploads straight to R2's S3 endpoint
 *   (<account>.r2.cloudflarestorage.com) or, without S3_ENDPOINT, AWS S3 (backend src/media/storage.ts).
 * - img-src: photos are same-origin `/api/media/photos/<id>[/thumb]` (the bucket is private). The API
 *   checks access and answers 302 to a short-lived presigned GET on R2's S3 endpoint
 *   (<account>.r2.cloudflarestorage.com, or AWS S3), and img-src is checked on every redirect hop, so
 *   that host must stay allowed; `https:` covers it, Google profile pictures and the OneMap logo.
 *   data: and blob: for photo previews, canvas pins and tiles. Broad on purpose: images cannot run
 *   script, and a missed host would mean blank photos. Photo reads are <img> loads, never fetch(), so
 *   connect-src only needs the S3 endpoint for the presigned PUT upload.
 * - worker-src: the service worker (/sw.js) and MapLibre's module worker (/maplibre/, same origin);
 *   blob: kept so MapLibre's Blob-URL fallback still works.
 * - Google sign-in is a top-level navigation to /api/auth/google and a 302 to Google, which CSP doesn't
 *   restrict (no form posts to Google, so form-action 'self' is safe).
 * - Dev only: 'unsafe-eval' for React's dev tooling.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.onemap.gov.sg https://*.r2.cloudflarestorage.com https://*.amazonaws.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Two years. No includeSubDomains/preload until every subdomain of the final domain is HTTPS-only.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Location and the camera (photo capture) for this origin only; the rest off.
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(self), microphone=(), payment=(), usb=(), serial=(), browsing-topics=()",
  },
];

/** Versions the /maplibre/<version>/ URLs the map loads MapLibre from (lib/server/maplibre-asset.ts). */
const MAPLIBRE_VERSION = (
  JSON.parse(readFileSync(join(process.cwd(), "node_modules", "maplibre-gl", "package.json"), "utf8")) as { version: string }
).version;

const nextConfig: NextConfig = {
  env: { SGW_BUILD_ID, MAPLIBRE_VERSION, SGW_ENV, SGW_RELEASE },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // PostHog's ingestion API takes trailing-slash paths (/e/, /flags/); Next would 308 each one.
  // Side effect: a typed "/about/" is served as is instead of redirecting to "/about".
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/:path*`,
      },
      // Product analytics (lib/analytics.ts) through our own origin, so ad blockers don't drop it.
      // PostHog Cloud US. The service worker never caches /ingest.
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // The service worker must always be revalidated so updates roll out.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

/**
 * Sentry (lib/sentry-options.ts, lib/sentry-client.ts, instrumentation.ts). Errors only: tracing and
 * replay are compiled out. Reports from the browser go to same-origin /monitoring, which Sentry adds
 * as a rewrite to its US ingest; proxy.ts only matches /api and the service worker never caches it.
 *
 * Source maps: only with SENTRY_AUTH_TOKEN (set in Vercel, never locally or in CI). Then the browser
 * maps are built, uploaded against the commit SHA release and deleted from the output before deploy,
 * so the public site serves none. Without the token nothing is generated or uploaded and the build
 * behaves as before.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: Boolean(process.env.CI),
  telemetry: false,
  tunnelRoute: "/monitoring",
  release: { name: SGW_RELEASE || undefined, create: SENTRY_UPLOAD, finalize: SENTRY_UPLOAD },
  sourcemaps: { disable: !SENTRY_UPLOAD, deleteSourcemapsAfterUpload: true },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
  // No tracing, so no router-transition hook in instrumentation-client.ts.
  suppressOnRouterTransitionStartWarning: true,
  // The post-compile step only uploads source maps: skip it (and its warning) without a token.
  useRunAfterProductionCompileHook: SENTRY_UPLOAD,
});
