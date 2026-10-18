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
  NearbyVenue,
  Page,
  Passport,
  PendingPhoto,
  PhotoRef,
  PresignResponse,
  RecommendBody,
  RecommendResponse,
  Review,
  StatusKind,
  StatusReport,
  SubmissionView,
  ToiletDetail,
  ToiletLeaderboard,
  ToiletPin,
  ToiletSummary,
  ToiletTier,
  UserLeaderboard,
  VenueLite,
  WalkRoute,
} from "./types";

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

/** Thrown when the network is down or the API is unreachable. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("Can't reach Shit Go Where right now. Check your connection and try again.");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof NetworkError) return err.message;
  if (isApiError(err)) return err.message;
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
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, signal, silent401 } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${toQuery(query)}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new NetworkError(e);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
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
  return data as T;
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
  includePending?: boolean;
}

export const api = {
  // Toilets
  nearbyToilets: (p: NearbyParams, signal?: AbortSignal) =>
    request<List<ToiletSummary>>("/toilets/nearby", { query: { ...p, openNow: p.openNow || undefined }, signal }),
  toiletsInBounds: (p: BoundsParams, signal?: AbortSignal) =>
    request<List<ToiletPin>>("/toilets/in-bounds", { query: { ...p }, signal }),
  toilet: (id: string, signal?: AbortSignal) =>
    request<ToiletDetail>(`/toilets/${encodeURIComponent(id)}`, { signal, silent401: true }),
  reviews: (id: string, cursor?: string | null) =>
    request<Page<Review>>(`/toilets/${encodeURIComponent(id)}/reviews`, { query: { cursor } }),
  postReview: (id: string, body: { cleanliness: number; comment?: string; photoIds?: string[] }) =>
    request<Review>(`/toilets/${encodeURIComponent(id)}/reviews`, { method: "POST", body }),
  statusReports: (id: string) => request<List<StatusReport>>(`/toilets/${encodeURIComponent(id)}/status`),
  reportStatus: (id: string, kind: StatusKind) =>
    request<StatusReport>(`/toilets/${encodeURIComponent(id)}/status`, { method: "POST", body: { kind } }),
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

  // Routing & geo
  recommend: (body: RecommendBody, signal?: AbortSignal) =>
    request<RecommendResponse>("/routing/recommend", { method: "POST", body, signal }),
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
  updateMe: (body: { handle?: string; displayName?: string; leaderboardOptIn?: boolean }) =>
    request<Me>("/me", { method: "PATCH", body }),
  deleteMe: () => request<void>("/me", { method: "DELETE" }),
  activity: (cursor?: string | null) => request<Page<ActivityItem>>("/me/activity", { query: { cursor } }),
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
  vote: (id: string, body: { value: "APPROVE" | "REJECT"; comment?: string; lat?: number; lng?: number }) =>
    request<SubmissionView>(`/submissions/${encodeURIComponent(id)}/votes`, { method: "POST", body }),

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
  imports: () => request<List<ImportRun>>("/admin/imports"),
};

export type Api = typeof api;
