/**
 * Product analytics (GROWTH.md 0.1). The only module that talks to PostHog.
 *
 * - A complete no-op unless NEXT_PUBLIC_POSTHOG_KEY is set (local dev and e2e send nothing), and
 *   when the browser asks not to be tracked (Do Not Track or Global Privacy Control).
 * - posthog-js is imported lazily once the page is idle after load, so it never slows first paint
 *   or the urgent path. Anything tracked before then is queued.
 * - Requests go to same-origin /ingest (rewritten to PostHog Cloud US in next.config.ts).
 * - Only named events and pageviews. No autocapture, no session replay, no surveys or flags.
 * - Identity is the user id (no traits) or PostHog's random anonymous id. Never email, name or
 *   coordinates: URLs lose every query parameter except a short allowlist before they are sent,
 *   and GeoIP enrichment is turned off per event.
 *
 * The web client emits only route_started, route_completed, share and install_prompt. checkin,
 * status_report, review, submission, vote and signin are sent by the API (it gets our distinct id
 * and source as request headers, see lib/api/client.ts) so they line up with this funnel.
 */
import type { CaptureResult, PostHogInterface as PostHog, Properties } from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export type AnalyticsEvent = "route_started" | "route_completed" | "share" | "install_prompt";
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

// ---------------------------------------------------------------------------
// First-touch source (GROWTH.md 0.3)
// ---------------------------------------------------------------------------

/** First-touch source tags, stored once per browser in localStorage. */
export interface SourceTouch {
  source: string;
  medium?: string;
  campaign?: string;
  /** ISO time of the first touch. */
  at: string;
}

export const SOURCE_KEY = "sgw:src";
/** Same rule the API applies to the `x-sgw-source` header. */
const SOURCE_RE = /^[a-z0-9-]{1,40}$/;

let touch: SourceTouch | null | undefined;

/** Lowercase, anything outside [a-z0-9-] becomes "-", at most 40 characters. */
function normTag(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return SOURCE_RE.test(s) ? s : undefined;
}

function readTouch(): SourceTouch | null {
  try {
    const raw = localStorage.getItem(SOURCE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SourceTouch> | null;
    if (!v || typeof v.source !== "string" || !SOURCE_RE.test(v.source)) return null;
    return {
      source: v.source,
      medium: typeof v.medium === "string" ? normTag(v.medium) : undefined,
      campaign: typeof v.campaign === "string" ? normTag(v.campaign) : undefined,
      at: typeof v.at === "string" ? v.at : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Tags from a query string (utm_source, or `?src=`, the QR-sticker alias), saved as the first touch. */
function touchFromSearch(search: string): SourceTouch | null {
  const sp = new URLSearchParams(search);
  const source = normTag(sp.get("utm_source")) ?? normTag(sp.get("src"));
  if (!source) return null;
  const next: SourceTouch = { source, at: new Date().toISOString() };
  const medium = normTag(sp.get("utm_medium"));
  const campaign = normTag(sp.get("utm_campaign"));
  if (medium) next.medium = medium;
  if (campaign) next.campaign = campaign;
  try {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(next));
  } catch {
    /* storage can be full or blocked: keep it for this visit only */
  }
  return next;
}

/**
 * The first touch: the stored one, else the landing URL's tags (saved on the spot, so even the very
 * first API request carries them). Cached in memory, so it still works for this visit when storage throws.
 */
export function firstTouchSource(): SourceTouch | null {
  if (typeof window === "undefined") return null;
  if (touch === undefined) touch = readTouch() ?? touchFromSearch(window.location.search);
  return touch;
}

/**
 * Stores utm_source / utm_medium / utm_campaign (or `?src=`) from the current URL as the first
 * touch, unless one is already stored. Returns the first touch either way.
 */
export function captureSourceFromUrl(search?: string): SourceTouch | null {
  if (typeof window === "undefined") return null;
  const existing = firstTouchSource();
  if (existing) return existing;
  touch = touchFromSearch(search ?? window.location.search);
  if (touch && ph) registerBase(ph);
  return touch;
}

// ---------------------------------------------------------------------------
// PostHog
// ---------------------------------------------------------------------------

let ph: PostHog | null = null;
let scheduled = false;
let disabled = !KEY;

type Queued = { event: AnalyticsEvent; props: AnalyticsProps };
const queue: Queued[] = [];
const MAX_QUEUE = 50;

/** Who is signed in: a user id, null when signed out, undefined until /me has answered. */
let userId: string | null | undefined;
let forceReset = false;

/** The API's rule for `x-sgw-distinct-id`. */
const DISTINCT_RE = /^[A-Za-z0-9$:._-]{1,100}$/;

function doNotTrack(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const w = window as Window & { doNotTrack?: string };
  return nav.doNotTrack === "1" || nav.doNotTrack === "yes" || nav.msDoNotTrack === "1" || w.doNotTrack === "1" || nav.globalPrivacyControl === true;
}

/** Query parameters that are safe to keep on a URL sent to PostHog. Everything else (lat, lng, redirect …) goes. */
const KEEP_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "src",
  "urgent",
  "for",
  "need",
  "fussy",
  "to",
  "do",
  "scope",
  "tab",
]);

function cleanUrl(value: string): string {
  try {
    const u = new URL(value);
    for (const k of [...u.searchParams.keys()]) if (!KEEP_PARAMS.has(k)) u.searchParams.delete(k);
    u.hash = "";
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return value;
  }
}

function cleanProps(p: Properties | undefined) {
  if (!p) return;
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "string" && /url|referrer/i.test(k) && /^https?:\/\//i.test(v)) p[k] = cleanUrl(v);
  }
}

function sanitize(cr: CaptureResult | null): CaptureResult | null {
  if (!cr) return cr;
  cleanProps(cr.properties);
  cleanProps(cr.$set);
  cleanProps(cr.$set_once);
  return cr;
}

/** Super properties on every event. Re-registered after reset(), which clears them. */
function registerBase(p: PostHog) {
  const t = firstTouchSource();
  const props: Properties = { surface: "web", $geoip_disable: true };
  if (t) {
    props.source = t.source;
    if (t.medium) props.source_medium = t.medium;
    if (t.campaign) props.source_campaign = t.campaign;
  }
  p.register(props);
}

function isIdentified(p: PostHog): boolean {
  return p.get_property("$user_state") === "identified";
}

function applyUser(p: PostHog) {
  if (userId) {
    if (p.get_distinct_id() !== userId) p.identify(userId);
  } else if (userId === null && (forceReset || isIdentified(p))) {
    p.reset();
    registerBase(p);
  }
  forceReset = false;
}

function send(p: PostHog, { event, props }: Queued) {
  const t = firstTouchSource();
  p.capture(event, {
    surface: "web",
    anonymous: !userId,
    ...(t ? { source: t.source } : {}),
    ...props,
  });
}

async function load() {
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.init(KEY!, {
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      defaults: "2026-08-30",
      // Named events and pageviews only.
      autocapture: false,
      capture_pageview: "history_change",
      capture_pageleave: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_performance: false,
      enable_heatmaps: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      advanced_disable_flags: true,
      // No extra scripts (recorder, surveys, site apps) on a weak signal.
      disable_external_dependency_loading: true,
      respect_dnt: true,
      person_profiles: "identified_only",
      // No cookie riding along on every /api request.
      persistence: "localStorage",
      before_send: sanitize,
      loaded: (p) => {
        ph = p;
        registerBase(p);
        applyUser(p);
        for (const q of queue.splice(0)) send(p, q);
      },
    });
  } catch {
    // Chunk failed to load (offline): try again next time the app starts.
    scheduled = false;
    queue.length = 0;
  }
}

/** Starts PostHog once the page is loaded and idle. Safe to call more than once. */
export function initAnalytics() {
  if (disabled || scheduled || typeof window === "undefined") return;
  if (doNotTrack()) {
    disabled = true;
    queue.length = 0;
    return;
  }
  scheduled = true;
  const start = () => void load();
  const whenIdle = () => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 4000 });
    else setTimeout(start, 1500);
  };
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}

/** Sends a named event. Queued until PostHog has loaded; dropped when analytics is off. */
export function track(event: AnalyticsEvent, props: AnalyticsProps = {}) {
  if (disabled || typeof window === "undefined") return;
  if (ph) send(ph, { event, props });
  else if (queue.length < MAX_QUEUE) queue.push({ event, props });
}

/** Signed in: the user id only, no traits. The API uses the same id for its events. */
export function identifyUser(id: string) {
  if (disabled || typeof window === "undefined") return;
  userId = id;
  if (ph) applyUser(ph);
}

/** Signed out (or the session is gone): back to a fresh anonymous id if this browser was identified. */
export function resetUser(opts?: { force?: boolean }) {
  if (disabled || typeof window === "undefined") return;
  userId = null;
  if (opts?.force) forceReset = true;
  if (ph) applyUser(ph);
}

/** PostHog's distinct id for this browser, once loaded and only if capturing. */
export function distinctId(): string | undefined {
  if (!ph) return undefined;
  try {
    if (ph.has_opted_out_capturing()) return undefined;
    const id = ph.get_distinct_id();
    return typeof id === "string" && DISTINCT_RE.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

/** Rounded to 10 m, as the contract asks. */
export function roundDistance(m: number | null | undefined): number | undefined {
  return typeof m === "number" && Number.isFinite(m) ? Math.round(m / 10) * 10 : undefined;
}
