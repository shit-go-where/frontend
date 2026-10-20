import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * MapLibre 6 ships as ES modules: `maplibre-gl.mjs` (main thread) and `maplibre-gl-worker.mjs`, which
 * both import `./maplibre-gl-shared.mjs` (~150 kB gzipped). If Turbopack bundled the main thread, the
 * worker would still need its own copy of the shared module, so a phone would download it twice on
 * its first map. Instead all three are served side by side under /maplibre/<version>/ and the map loads
 * the main module by URL (components/map/ToiletMap.tsx): the browser fetches the shared module once,
 * and MapLibre finds its worker next to itself (import.meta.url), same origin, so the CSP needs
 * `worker-src 'self'` only. The version in the path makes the files immutable, like /_next/static.
 */
export const MAPLIBRE_FILES = ["maplibre-gl.mjs", "maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"] as const;

const dist = () => join(process.cwd(), "node_modules", "maplibre-gl", "dist");

export function maplibreVersion(): string {
  return (JSON.parse(readFileSync(join(dist(), "..", "package.json"), "utf8")) as { version: string }).version;
}

export function maplibreAsset(version: string, file: string): Response {
  if (version !== maplibreVersion() || !(MAPLIBRE_FILES as readonly string[]).includes(file)) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(readFileSync(join(dist(), file), "utf8"), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
