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

/** service-worker/sw.js `API`: the saved API answers, kept across deploys. Change both together. */
const SW_API_CACHE = "sgw-api-1";
/** The saved toilet lists (and their per-endpoint "last" copies): the same for everyone, so they stay. */
const SHARED_SAVED = /^\/(?:__sgw_last\/)?api\/toilets\/(?:nearby|in-bounds)$/;

/**
 * Drops the service worker's saved copies of answers that can carry the signed-in person's own data
 * (a toilet's `myReview`, `confirmedByMe` on status reports, earned badges, the leaderboard's `me`),
 * so after signing out or deleting the account they can't be served offline to whoever uses the phone
 * next. The saved nearby and in-bounds lists are public and stay for the offline map. Best effort.
 */
export async function forgetSignedInCopies(): Promise<void> {
  try {
    if (typeof caches === "undefined" || !(await caches.has(SW_API_CACHE))) return;
    const c = await caches.open(SW_API_CACHE);
    const keys = await c.keys();
    await Promise.all(keys.filter((k) => !SHARED_SAVED.test(new URL(k.url).pathname)).map((k) => c.delete(k)));
  } catch {
    /* storage blocked or unavailable: nothing was saved */
  }
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
