/**
 * One walk to one toilet, from "Take me there" to the post-route "How was it?" card (GROWTH.md 1.1).
 *
 * - `startRoute` runs when the /go route screen has a toilet: once per toilet per 30 minutes (so
 *   rerenders, refreshes and re-routes don't count twice) it fires `route_started`, POSTs
 *   /routing/started (skipped offline, errors ignored) and saves the pending route.
 * - `markArrived` runs when "Arrived? Check in" / "I'm here, check in" is tapped: `route_completed`
 *   with arrived_via "button".
 * - `completeByTimeout` (called by the card) sends `route_completed` with arrived_via "timeout" for a
 *   route 10 minutes old that nobody marked arrived.
 * - components/route-prompt.tsx reads the pending route and clears it once answered or dismissed.
 *
 * Storage can throw (private mode, quota), so every read and write is guarded and an in-memory copy
 * keeps this visit consistent.
 */
import { api } from "./api/client";
import type { Purpose, ToiletTier } from "./api/types";
import { roundDistance, track } from "./analytics";

export const PENDING_KEY = "sgw:route-pending";
export const STARTED_KEY = "sgw:route-started";
/** Fired on window whenever the pending route changes in this tab. */
export const PENDING_EVENT = "sgw:route-pending";

/** A re-route to the same toilet within this long is the same route. */
const SAME_ROUTE_MS = 30 * 60_000;
/** The card is only worth showing for a fresh visit. */
export const PROMPT_MAX_AGE_MS = 2 * 60 * 60_000;
/** Wait this long after the start (or the arrival) before asking. */
export const PROMPT_DELAY_MS = 3 * 60_000;
/** No "Arrived?" tap by then: count the route as completed anyway. */
const TIMEOUT_COMPLETE_MS = 10 * 60_000;

export interface PendingRoute {
  toiletId: string;
  /** Venue name, for "How was {name}?". */
  name: string;
  tier?: ToiletTier;
  /** Epoch ms. */
  startedAt: number;
  arrivedAt?: number;
  /** route_completed has been sent. */
  completed?: boolean;
}

let memPending: PendingRoute | null | undefined;
let memStarted: Record<string, number> = {};

function notify() {
  try {
    window.dispatchEvent(new Event(PENDING_EVENT));
  } catch {
    /* ignore */
  }
}

function parsePending(raw: string | null): PendingRoute | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingRoute> | null;
    if (!v || typeof v.toiletId !== "string" || typeof v.name !== "string" || typeof v.startedAt !== "number") return null;
    return {
      toiletId: v.toiletId,
      name: v.name,
      tier: v.tier,
      startedAt: v.startedAt,
      arrivedAt: typeof v.arrivedAt === "number" ? v.arrivedAt : undefined,
      completed: v.completed === true || undefined,
    };
  } catch {
    return null;
  }
}

/** The pending route, or null when there is none or it is older than 2 hours (then it is cleared). */
export function readPending(now = Date.now()): PendingRoute | null {
  if (typeof window === "undefined") return null;
  let p: PendingRoute | null;
  try {
    p = parsePending(localStorage.getItem(PENDING_KEY));
  } catch {
    p = memPending ?? null;
  }
  if (p && now - p.startedAt >= PROMPT_MAX_AGE_MS) {
    clearPending();
    return null;
  }
  return p;
}

function writePending(p: PendingRoute | null) {
  memPending = p;
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* memory copy only */
  }
  notify();
}

export function clearPending() {
  writePending(null);
}

function readStarted(now: number): Record<string, number> {
  let all: Record<string, number> = { ...memStarted };
  try {
    const raw = localStorage.getItem(STARTED_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (v && typeof v === "object") all = { ...all, ...(v as Record<string, number>) };
  } catch {
    /* memory copy only */
  }
  const fresh: Record<string, number> = {};
  for (const [id, at] of Object.entries(all)) if (typeof at === "number" && now - at < SAME_ROUTE_MS) fresh[id] = at;
  return fresh;
}

function writeStarted(map: Record<string, number>) {
  memStarted = map;
  try {
    localStorage.setItem(STARTED_KEY, JSON.stringify(map));
  } catch {
    /* memory copy only */
  }
}

export interface RouteStart {
  toiletId: string;
  name: string;
  tier: ToiletTier;
  urgent: boolean;
  purpose: Purpose | null;
  /** Walking (or straight-line) distance; sent rounded to 10 m. */
  distanceM: number | null;
}

/** Counts a route start once per toilet per 30 minutes. Returns whether this call counted it. */
export function startRoute(r: RouteStart): boolean {
  if (typeof window === "undefined") return false;
  const now = Date.now();
  const started = readStarted(now);
  if (started[r.toiletId] !== undefined) return false;
  started[r.toiletId] = now;
  writeStarted(started);

  writePending({ toiletId: r.toiletId, name: r.name, tier: r.tier, startedAt: now });
  track("route_started", {
    toilet_id: r.toiletId,
    toilet_tier: r.tier,
    urgent: r.urgent,
    purpose: r.purpose,
    distance_m: roundDistance(r.distanceM),
  });
  if (navigator.onLine !== false) void api.routingStarted(r.toiletId).catch(() => {});
  return true;
}

function complete(p: PendingRoute, via: "button" | "timeout"): PendingRoute {
  track("route_completed", { toilet_id: p.toiletId, toilet_tier: p.tier, arrived_via: via });
  return { ...p, completed: true };
}

/** "Arrived?" was acted on for this toilet. */
export function markArrived(toiletId: string) {
  const p = readPending();
  if (!p || p.toiletId !== toiletId) return;
  let next: PendingRoute = { ...p, arrivedAt: p.arrivedAt ?? Date.now() };
  if (!next.completed) next = complete(next, "button");
  writePending(next);
}

/** A route nobody marked arrived counts as completed 10 minutes after it started. */
export function completeByTimeout(now = Date.now()) {
  const p = readPending(now);
  if (!p || p.completed || p.arrivedAt !== undefined || now - p.startedAt < TIMEOUT_COMPLETE_MS) return;
  writePending(complete(p, "timeout"));
}

/** When the card may ask: 3 minutes after the start, or after the arrival when there was one. */
export function promptDue(p: PendingRoute, now = Date.now()): boolean {
  return now - (p.arrivedAt ?? p.startedAt) >= PROMPT_DELAY_MS && now - p.startedAt < PROMPT_MAX_AGE_MS;
}
