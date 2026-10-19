/**
 * Server-side reads (Server Components only). These call API_ORIGIN directly
 * instead of going through the /api rewrite.
 */
import { cacheLife } from "next/cache";
import { cache } from "react";
import type { AreaDetail, AreaSummary, LineRow, List, SitemapToilet, StationDetail, StationSummary, ToiletDetail } from "./types";

const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");

export type ServerResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

async function serverGet<T>(path: string): Promise<ServerResult<T>> {
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, {
      headers: { Accept: "application/json" },
      // Fail fast so a dead API turns into a friendly error state, not a hung page.
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 404) return { kind: "not-found" };
    if (!res.ok) return { kind: "error", message: `The API answered ${res.status}.` };
    return { kind: "ok", data: (await res.json()) as T };
  } catch {
    return { kind: "error", message: "The API is unreachable right now." };
  }
}

/**
 * Read for pages that change slowly (areas, sitemap). Successes are cached for hours. A 404 or an
 * outage (a stale or restarting API) lives for seconds only, which also keeps it out of build
 * prerenders: the page renders it at request time instead of baking it in.
 */
async function cachedGet<T>(path: string): Promise<ServerResult<T>> {
  "use cache";
  const r = await serverGet<T>(path);
  if (r.kind === "ok") cacheLife("hours");
  else cacheLife("seconds");
  return r;
}

/** Deduped per request between generateMetadata and the page. */
export const getToiletServer = cache((id: string) =>
  serverGet<ToiletDetail>(`/toilets/${encodeURIComponent(id)}`),
);

export const getAreasServer = cache(() => cachedGet<List<AreaSummary>>("/areas"));

export const getAreaServer = cache((slug: string) => cachedGet<AreaDetail>(`/areas/${encodeURIComponent(slug)}`));

/** Every MRT and LRT station A to Z, for /stations and the sitemap. */
export const getStationsServer = cache(() => cachedGet<List<StationSummary>>("/stations"));

export const getStationServer = cache((slug: string) =>
  cachedGet<StationDetail>(`/stations/${encodeURIComponent(slug)}`),
);

export const getLineBoardServer = cache(() => cachedGet<List<LineRow>>("/leaderboard/lines"));

export const getSitemapToiletsServer = () => cachedGet<List<SitemapToilet>>("/toilets/sitemap");
