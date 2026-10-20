/**
 * The only module that talks to the API from the browser.
 *
 * Every call goes to same-origin `/api/...` (rewritten by next.config.ts), with
 * the session cookie included. To switch to the generated OpenAPI client later,
 * replace the body of `request()` with an `openapi-fetch` client created from
 * `lib/api/schema.d.ts` and keep the `api` object's signatures unchanged.
 */
import type {
  ActivityItem,
  ActivitySeen,
  AdminFlag,
  ApiErrorBody,
  AreaType,
  Badge,
  CheckInResult,
  CreateSubmissionBody,
  DataQuality,
  Feature,
  GeoSearchResult,
  ImportRun,
  List,
  Me,
  ModeratorSubmission,
  NearbyVenue,
  Page,
  Passport,
  PendingPhoto,
  PhotoRef,
  PresignResponse,
  RecommendBody,
  RecommendResponse,
  ResolveSubmissionBody,
  Review,
  StatusKind,
  StatusReport,
  SubmissionView,
  ToiletDetail,
  ToiletLeaderboard,
  ToiletPin,
  ToiletSummary,
  ToiletTier,
  UpdateSubmissionBody,
  UserLeaderboard,
  VenueDetail,
  VenueLite,
  WalkRoute,
  TelegramLinkToken,
} from "./types";
import { parseSavedHeader, type SavedFrom } from "../offline";
import { distinctId, firstTouchSource } from "../analytics";

export const API_BASE = "/api";

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    const msg = body?.message;
    super(Array.isArray(msg) ? msg.join(", ") : msg || fallback);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/**
 * Why a request never got a usable answer: "offline" (no network, or the service worker's
 * synthetic 503 with nothing saved), "timeout" (weak signal: no answer in time) or
 * "unreachable" (the network is up but the request failed).
 */
export type NetworkErrorKind = "offline" | "timeout" | "unreachable";

const OFFLINE_COPY = "No signal right now. Showing what we saved where we can.";
const TIMEOUT_COPY = "The connection is too slow right now.";
const SERVER_COPY = "The server is having a moment. Try again shortly.";

/** Thrown when the network is down, too slow, or the API is unreachable. Never retried for long. */
export class NetworkError extends Error {
  readonly kind: NetworkErrorKind;

  constructor(cause?: unknown, kind: NetworkErrorKind = "unreachable") {
    super(kind === "timeout" ? TIMEOUT_COPY : OFFLINE_COPY);
    this.name = "NetworkError";
    this.cause = cause;
    this.kind = kind;
  }

  get isTimeout() {
    return this.kind === "timeout";
  }
}

export function isNetworkError(e: unknown): e is NetworkError {
  return e instanceof NetworkError;
}

function browserOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown): string {
  // Underground the browser often knows before we do; say so whatever failed.
  if (browserOffline() && !(isApiError(err) && err.status < 500)) return OFFLINE_COPY;
  if (err instanceof NetworkError) return err.isTimeout ? TIMEOUT_COPY : OFFLINE_COPY;
  if (isApiError(err)) {
    // 4xx messages are written for people; 5xx bodies are Nest's raw "Internal server error".
    return err.status >= 500 ? SERVER_COPY : err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

type Query = Record<string, string | number | boolean | string[] | null | undefined>;

export function toQuery(q?: Query): string {
  if (!q) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(","));
    } else {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

type Unauthorized = (err: ApiError) => void;
let onUnauthorized: Unauthorized | null = null;
/** Registered once by the app providers; called for 401s unless a call opts out. */
export function setUnauthorizedHandler(fn: Unauthorized | null) {
  onUnauthorized = fn;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Don't trigger the global 401 handler (e.g. GET /me probes). */
  silent401?: boolean;
  /** Give up after this long (headers and body) and throw a "timeout" NetworkError. */
  timeoutMs?: number;
}

/** Long enough for a slow 4G hop, short enough that a dead MRT tunnel fails while you can act. */
export const DEFAULT_TIMEOUT_MS = 10_000;
/** Urgent mode has an offline fallback (cached toilets ranked on the phone), so fail sooner. */
export const RECOMMEND_TIMEOUT_MS = 6_000;

/**
 * One signal that aborts on the caller's signal or our timer, plus a way to tell which fired.
 * Uses AbortSignal.any where available and forwards the caller's abort by hand otherwise.
 */
function timeoutSignal(caller: AbortSignal | undefined, ms: number) {
  const timer = new AbortController();
  let timedOut = false;
  const id = setTimeout(() => {
    timedOut = true;
    timer.abort(new DOMException("The request timed out", "TimeoutError"));
  }, ms);
  let signal = timer.signal;
  let unlink = () => {};
  if (caller) {
    if (typeof AbortSignal.any === "function") {
      signal = AbortSignal.any([caller, timer.signal]);
    } else if (caller.aborted) {
      timer.abort(caller.reason);
    } else {
      const forward = () => timer.abort(caller.reason);
      caller.addEventListener("abort", forward, { once: true });
      unlink = () => caller.removeEventListener("abort", forward);
    }
  }
  return {
    signal,
    timedOut: () => timedOut && !caller?.aborted,
    done: () => {
      clearTimeout(id);
      unlink();
    },
  };
}

export interface ResponseMeta<T> {
  data: T;
  status: number;
  headers: Headers;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await requestWithMeta<T>(path, opts)).data;
}

/** `request()` plus the response status and headers (e.g. the service worker's X-SGW-Saved). */
export async function requestWithMeta<T>(path: string, opts: RequestOptions = {}): Promise<ResponseMeta<T>> {
  const { method = "GET", query, body, signal: callerSignal, silent401, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // Lets the API's own analytics events (check-ins, reports …) join this browser's funnel (lib/analytics.ts).
  const source = firstTouchSource()?.source;
  if (source) headers["x-sgw-source"] = source;
  const did = distinctId();
  if (did) headers["x-sgw-distinct-id"] = did;

  const t = timeoutSignal(callerSignal, timeoutMs);
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${API_BASE}${path}${toQuery(query)}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: t.signal,
    });
    // The timer covers the body too: on one bar the headers can arrive and the body stall.
    text = res.status === 204 ? "" : await res.text();
  } catch (e) {
    if (t.timedOut()) throw new NetworkError(e, "timeout");
    // The caller gave up (unmount, newer query): stay an abort so TanStack treats it as one.
    if (callerSignal?.aborted || (e as Error)?.name === "AbortError") throw e;
    throw new NetworkError(e, browserOffline() ? "offline" : "unreachable");
  } finally {
    t.done();
  }

  // The service worker's synthetic "nothing saved for this" answer: offline, not a server fault.
  if (res.headers.get("X-SGW-Offline") === "1") throw new NetworkError(null, "offline");

  if (res.status === 204) return { data: undefined as T, status: res.status, headers: res.headers };

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    // The Next rewrite answers 500/502/504 when the API process is down.
    const fallback =
      res.status >= 500 ? "The server is having a moment. Try again shortly." : `Request failed (${res.status})`;
    const err = new ApiError(res.status, (data as ApiErrorBody) ?? null, fallback);
    if (err.isUnauthorized && !silent401) onUnauthorized?.(err);
    throw err;
  }
  return { data: data as T, status: res.status, headers: res.headers };
}

/** A list response, marked with where and when it was saved if the service worker answered. */
export type MaybeSaved<T> = List<T> & { saved?: SavedFrom };

async function listMaybeSaved<T>(path: string, opts: RequestOptions): Promise<MaybeSaved<T>> {
  const { data, headers } = await requestWithMeta<List<T>>(path, opts);
  const saved = parseSavedHeader(headers.get("X-SGW-Saved"));
  return saved ? { ...data, saved } : data;
}

/** Upload raw bytes to a presigned URL (R2/S3) or the API's dev fallback. */
async function putUpload(url: string, blob: Blob, headers: Record<string, string>) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      body: blob,
      headers,
      // Only send cookies to our own origin (dev fallback upload route).
      credentials: url.startsWith("/") ? "include" : "omit",
    });
  } catch (e) {
    throw new NetworkError(e);
  }
  if (!res.ok) throw new ApiError(res.status, null, `Upload failed (${res.status})`);
}

// ---------------------------------------------------------------------------
// Endpoint functions. Keep everything the UI needs here.
// ---------------------------------------------------------------------------

export interface NearbyParams {
  lat: number;
  lng: number;
  radius?: number;
  features?: Feature[];
  openNow?: boolean;
  areaType?: AreaType;
  tier?: ToiletTier[];
  limit?: number;
  includePending?: boolean;
}

export interface BoundsParams {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  features?: Feature[];
  openNow?: boolean;
  areaType?: AreaType;
  includePending?: boolean;
}

export const api = {
  // Toilets
  // `saved` is set when the service worker answered from its saved copy (weak or no signal).
  nearbyToilets: (p: NearbyParams, signal?: AbortSignal) =>
    listMaybeSaved<ToiletSummary>("/toilets/nearby", { query: { ...p, openNow: p.openNow || undefined }, signal }),
  toiletsInBounds: (p: BoundsParams, signal?: AbortSignal) =>
    listMaybeSaved<ToiletPin>("/toilets/in-bounds", { query: { ...p }, signal }),
  toilet: (id: string, signal?: AbortSignal) =>
    request<ToiletDetail>(`/toilets/${encodeURIComponent(id)}`, { signal, silent401: true }),
  reviews: (id: string, cursor?: string | null) =>
    request<Page<Review>>(`/toilets/${encodeURIComponent(id)}/reviews`, { query: { cursor } }),
  postReview: (id: string, body: { cleanliness: number; comment?: string; photoIds?: string[] }) =>
    request<Review>(`/toilets/${encodeURIComponent(id)}/reviews`, { method: "POST", body }),
  statusReports: (id: string) => request<List<StatusReport>>(`/toilets/${encodeURIComponent(id)}/status`),
  /** `afterRoute` marks a report from the post-route "How was it?" card (analytics only). */
  reportStatus: (id: string, kind: StatusKind, opts?: { afterRoute?: boolean }) =>
    request<StatusReport>(`/toilets/${encodeURIComponent(id)}/status`, {
      method: "POST",
      body: opts?.afterRoute ? { kind, afterRoute: true } : { kind },
    }),
  confirmStatus: (statusId: string) =>
    request<StatusReport>(`/status/${encodeURIComponent(statusId)}/confirm`, { method: "POST" }),
  flagToilet: (id: string, reason: string) =>
    request<{ id: string }>(`/toilets/${encodeURIComponent(id)}/flags`, { method: "POST", body: { reason } }),
  checkIn: (id: string, coords: { lat: number; lng: number }) =>
    request<CheckInResult>(`/toilets/${encodeURIComponent(id)}/check-ins`, { method: "POST", body: coords }),
  verify: (id: string, body: { lat: number; lng: number; accurate: boolean; note?: string }) =>
    request<{ ok: true }>(`/toilets/${encodeURIComponent(id)}/verify`, { method: "POST", body }),

  // Venues
  nearbyVenues: (p: { lat: number; lng: number; radius?: number }) =>
    request<List<NearbyVenue>>("/venues/nearby", { query: p }),
  searchVenues: (p: { q: string; lat?: number; lng?: number }, signal?: AbortSignal) =>
    request<List<VenueLite>>("/venues/search", { query: p, signal }),
  venue: (id: string, signal?: AbortSignal) => request<VenueDetail>(`/venues/${encodeURIComponent(id)}`, { signal }),

  // Routing & geo
  /** Someone started walking to this toilet: a per-day count, no person. Fire and forget. */
  routingStarted: (toiletId: string) =>
    request<{ ok: true }>("/routing/started", { method: "POST", body: { toiletId }, silent401: true, timeoutMs: 5_000 }),
  recommend: (body: RecommendBody, signal?: AbortSignal) =>
    request<RecommendResponse>("/routing/recommend", { method: "POST", body, signal, timeoutMs: RECOMMEND_TIMEOUT_MS }),
  walk: (p: { fromLat: number; fromLng: number; toLat: number; toLng: number }) =>
    request<WalkRoute>("/routing/walk", { query: p }),
  geoSearch: (q: string, signal?: AbortSignal) => request<List<GeoSearchResult>>("/geo/search", { query: { q }, signal }),

  // Auth & me
  me: async (): Promise<Me | null> => {
    try {
      return await request<Me>("/me", { silent401: true });
    } catch (e) {
      if (isApiError(e) && e.status === 401) return null;
      throw e;
    }
  },
  devLogin: (body: { email: string; displayName?: string }) =>
    request<Me>("/auth/dev-login", { method: "POST", body }),
  logout: () => request<void>("/auth/logout", { method: "POST", silent401: true }),
  updateMe: (body: { handle?: string; displayName?: string; leaderboardOptIn?: boolean; verifierCredit?: boolean }) =>
    request<Me>("/me", { method: "PATCH", body }),
  deleteMe: () => request<void>("/me", { method: "DELETE" }),
  activity: (cursor?: string | null) => request<Page<ActivityItem>>("/me/activity", { query: { cursor } }),
  /** Resets Me.unseen (the "Since your last visit" banner and the Me tab dot). */
  markActivitySeen: () => request<ActivitySeen>("/me/activity/seen", { method: "POST" }),
  /** One-time t.me link (10 minutes) that connects the Telegram chat opening it to this account. */
  telegramLinkToken: () => request<TelegramLinkToken>("/me/telegram/link-token", { method: "POST" }),
  unlinkTelegram: () => request<void>("/me/telegram", { method: "DELETE" }),
  passport: () => request<Passport>("/me/passport"),

  // Media
  presign: (body: { contentType: "image/jpeg" | "image/png" | "image/webp"; size: number }) =>
    request<PresignResponse>("/media/presign", { method: "POST", body }),
  confirmMedia: (photoId: string) =>
    request<PhotoRef>(`/media/${encodeURIComponent(photoId)}/confirm`, { method: "POST" }),
  /** presign → PUT → confirm. `blob` should already be resized. */
  uploadPhoto: async (blob: Blob): Promise<PhotoRef> => {
    const type = (["image/jpeg", "image/png", "image/webp"].includes(blob.type) ? blob.type : "image/jpeg") as
      | "image/jpeg"
      | "image/png"
      | "image/webp";
    const presigned = await api.presign({ contentType: type, size: blob.size });
    const headers = { "Content-Type": type, ...presigned.headers };
    await putUpload(presigned.uploadUrl, blob, headers);
    return api.confirmMedia(presigned.photoId);
  },

  // Submissions
  createSubmission: (body: CreateSubmissionBody) =>
    request<SubmissionView>("/submissions", { method: "POST", body }),
  submissionQueue: (p: { lat: number; lng: number; radius?: number }) =>
    request<List<SubmissionView>>("/submissions/queue", { query: p }),
  mySubmissions: () => request<List<SubmissionView>>("/submissions/mine"),
  submission: (id: string) => request<SubmissionView>(`/submissions/${encodeURIComponent(id)}`),
  /** Owner only, while it needs more info: sends it back to PENDING. */
  updateSubmission: (id: string, body: UpdateSubmissionBody) =>
    request<SubmissionView>(`/submissions/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  vote: (id: string, body: { value: "APPROVE" | "REJECT"; comment?: string; lat?: number; lng?: number }) =>
    request<SubmissionView>(`/submissions/${encodeURIComponent(id)}/votes`, { method: "POST", body }),
  /** Moderators. */
  resolveSubmission: (id: string, body: ResolveSubmissionBody) =>
    request<SubmissionView>(`/submissions/${encodeURIComponent(id)}/resolve`, { method: "POST", body }),

  // Gamification
  userLeaderboard: (scope: "week" | "all") =>
    request<UserLeaderboard>("/leaderboard/users", { query: { scope }, silent401: true }),
  toiletLeaderboard: (area?: string) => request<ToiletLeaderboard>("/leaderboard/toilets", { query: { area } }),
  badges: () => request<List<Badge>>("/badges"),

  // Admin
  adminFlags: () => request<List<AdminFlag>>("/admin/flags", { query: { resolved: false } }),
  resolveFlag: (id: string) => request<{ ok: true }>(`/admin/flags/${encodeURIComponent(id)}/resolve`, { method: "POST" }),
  pendingPhotos: () => request<List<PendingPhoto>>("/admin/photos/pending"),
  approvePhoto: (id: string) =>
    request<{ approved: boolean; approvals: number }>(`/admin/photos/${encodeURIComponent(id)}/approve`, {
      method: "POST",
    }),
  rejectPhoto: (id: string) => request<{ ok: true }>(`/admin/photos/${encodeURIComponent(id)}/reject`, { method: "POST" }),
  dataQuality: () => request<DataQuality>("/admin/data-quality"),
  /** Island-wide moderator queue, escalated first then oldest. */
  adminSubmissions: (state: "pending" | "escalated" | "needs_info" | "all" = "all") =>
    request<List<ModeratorSubmission>>("/admin/submissions", { query: { state } }),
  imports: () => request<List<ImportRun>>("/admin/imports"),
};

export type Api = typeof api;
