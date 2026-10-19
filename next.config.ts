import type { NextConfig } from "next";

/**
 * The browser only ever calls same-origin `/api/...`. Next rewrites those
 * requests to the NestJS API (which has no `/api` prefix), so the session
 * cookie set by the API is first-party everywhere.
 */
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");

/** Different on every deploy, so app/sw.js/route.ts serves a new worker that re-precaches. */
const SGW_BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? Date.now().toString(36);

const nextConfig: NextConfig = {
  env: { SGW_BUILD_ID },
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
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/:path*`,
      },
    ];
  },
  async headers() {
    return [
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

export default nextConfig;
