"use client";

import { useSyncExternalStore } from "react";
import type { ToiletSummary } from "./api/types";
import { estimateWalkSeconds, haversineM, type LatLng } from "./location";

/**
 * Where a response came from when the service worker answered from its saved copy instead of
 * the network: the place it was fetched for and when. Read from the `X-SGW-Saved` header
 * ("lat,lng,epochMs") by the API client and attached to list responses as `saved`.
 */
export interface SavedFrom {
  lat: number;
  lng: number;
  at: number;
}

export function parseSavedHeader(v: string | null): SavedFrom | null {
  if (!v) return null;
  const [lat, lng, at] = v.split(",").map(Number);
  return [lat, lng, at].every(Number.isFinite) ? { lat, lng, at } : null;
}

/**
 * Re-measures a saved list from where the person is now: straight-line distance and the same
 * walk estimate the server uses, nearest first. With no real position, distances are dropped
 * rather than shown from somewhere else.
 */
export function remeasure(items: ToiletSummary[], from: LatLng | null): ToiletSummary[] {
  if (!from) return items.map((t) => ({ ...t, distanceM: undefined, walkSecondsEstimate: undefined }));
  return items
    .map((t) => {
      const d = haversineM(from, t);
      return { ...t, distanceM: Math.round(d), walkSecondsEstimate: estimateWalkSeconds(d) };
    })
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
}

/**
 * The offline stand-in for /routing/recommend in urgent mode: the nearest `n` toilets that are
 * open for use (not pending, closed or renovating, and not known closed right now).
 */
export function rankOffline(items: ToiletSummary[], from: LatLng, n = 3): ToiletSummary[] {
  return remeasure(
    items.filter((t) => t.status === "ACTIVE" && t.openNow !== false),
    from,
  ).slice(0, n);
}

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** False when the browser says it has no network. True on the server and during hydration. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
