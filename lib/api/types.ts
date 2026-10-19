/**
 * Hand-written from backend/API_CONTRACT.md (v1).
 *
 * When the backend publishes openapi.json, run `pnpm gen:api` to produce
 * lib/api/schema.d.ts and re-export the generated component schemas from
 * here instead (keep these names so the rest of the app does not change).
 */

export const FEATURES = [
  "TOILET_PAPER",
  "HAND_TOWEL",
  "HAND_DRYER",
  "HAND_SOAP",
  "SEAT_LINER",
  "BIDET",
  "AUTO_FLUSH",
  "AUTO_TAP",
  "AUTO_SOAP",
  "COAT_HOOK",
  "FEEDBACK_DEVICE",
  "SIGNAGE",
  "POSTERS",
  "AMBULANT",
  "ACCESSIBLE",
  "CHILD",
  "BABY_CHANGE",
  "NURSING_ROOM",
  "SHOWER",
  "SITTING",
  "SQUAT",
  "MALE",
  "FEMALE",
  "UNISEX",
  "FREE",
  "SANITARY_BIN",
  "PERIOD_PRODUCTS",
  "MIRROR",
  "WATER_REFILL",
  "ABLUTION",
] as const;
export type Feature = (typeof FEATURES)[number];

/** Why someone is going; soft ranking preferences in /routing/recommend. */
export const PURPOSES = ["PEE", "POO", "BABY", "SHOWER", "FRESHEN_UP", "PERIOD"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const VENUE_TYPES = [
  "MRT_STATION",
  "BUS_INTERCHANGE",
  "MALL",
  "HAWKER_CENTRE",
  "COFFEESHOP",
  "COMMUNITY_CLUB",
  "PARK",
  "LIBRARY",
  "HOSPITAL",
  "SPORTS_CENTRE",
  "OTHER",
] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export type VenueToiletStatus = "HAS_TOILETS" | "NONE" | "UNKNOWN" | "USES_NEARBY";
export type ToiletTier = "VERIFIED" | "COMMUNITY" | "IMPORTED";
export type ToiletStatus = "ACTIVE" | "CLOSED" | "RENOVATION" | "PENDING" | "REJECTED";

export const AREA_TYPES = ["PAID_AREA", "UNPAID_AREA", "NOT_APPLICABLE", "UNKNOWN"] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const STATUS_KINDS = [
  "ALL_GOOD",
  "NO_PAPER",
  "NO_SOAP",
  "LONG_QUEUE",
  "BEING_CLEANED",
  "BROKEN",
  "CLOSED_NOW",
] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export type Role = "USER" | "TRUSTED" | "MODERATOR" | "ADMIN";

export type OpeningHours =
  | { type: "always" }
  | {
      type: "weekly";
      periods: { days: number[]; open: string; close: string }[];
      inferred?: boolean;
    }
  | { type: "osm"; value: string };

export interface PhotoRef {
  id: string;
  url: string;
  thumbUrl: string | null;
}

export interface VenueLite {
  id: string;
  name: string;
  type: VenueType;
  lines: string[];
  lat: number;
  lng: number;
  toiletStatus: VenueToiletStatus;
  note: string | null;
}

export interface ActiveStatus {
  kind: StatusKind;
  count: number;
  latestAt: string;
}

export interface ToiletSummary {
  id: string;
  label: string | null;
  venue: VenueLite;
  lat: number;
  lng: number;
  level: string | null;
  areaType: AreaType;
  tier: ToiletTier;
  status: ToiletStatus;
  features: Feature[];
  scoreCleanliness: number | null;
  surveyTotal: number | null;
  rasStars: number | null;
  reviewCount: number;
  activeStatus: ActiveStatus[];
  lastVerifiedAt: string | null;
  needsResurvey: boolean;
  openNow: boolean | null;
  photoThumb: string | null;
  distanceM?: number;
  walkSecondsEstimate?: number;
  /**
   * Distinct signed-in people who have been there: the submitter plus first check-ins within 150 m (min 1).
   * Required by the API, but a list the service worker saved before trust model v2 can lack it, so
   * readers still treat undefined as "not known".
   */
  seenBy: number;
}

export interface ToiletPin {
  id: string;
  lat: number;
  lng: number;
  tier: ToiletTier;
  status: ToiletStatus;
  scoreCleanliness: number | null;
  hasIssue: boolean;
  venueType: VenueType;
}

export interface Survey {
  id: string;
  surveyedAt: string;
  phase: string | null;
  cleanliness: number;
  scent: number;
  aesthetics: number;
  music: number;
  toiletries: number;
  facilities: number;
  total: number;
  rasStars: number | null;
  remarks: string | null;
}

export interface Review {
  id: string;
  cleanliness: number;
  comment: string | null;
  createdAt: string;
  user: { handle: string | null; avatarUrl: string | null };
  photos: PhotoRef[];
}

export interface FeatureDetail {
  feature: Feature;
  present: boolean;
  source: string;
  observedAt: string;
}

export interface ToiletDetail extends Omit<ToiletSummary, "venue"> {
  venue: VenueLite & { address: string | null; planningArea: string | null };
  accessNote: string | null;
  nearestExit: string | null;
  openingHours: OpeningHours | null;
  featureDetails: FeatureDetail[];
  latestSurvey: Survey | null;
  surveyCount: number;
  reviews: Review[];
  photos: PhotoRef[];
  myReview: Review | null;
  source: string;
  attribution: string | null;
  /** Where an unnamed place is, e.g. "120 m from Tampines MRT" (same wording as area pages). Null when it has a name of its own or nothing is close. */
  near: string | null;
  /** Pending toilets: the open submission behind it, for /review?id=. */
  openSubmissionId: string | null;
}

export interface StatusReport {
  id: string;
  kind: StatusKind;
  confirmations: number;
  createdAt: string;
  expiresAt: string;
  confirmedByMe: boolean;
  /**
   * A lone signed-out CLOSED_NOW / BROKEN report: shown, but left out of activeStatus, pins and routing
   * until a signed-in person backs it up or a second device reports it.
   */
  unconfirmed: boolean;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  awardedAt?: string;
}

export interface Me {
  id: string;
  email: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  trustScore: number;
  leaderboardOptIn: boolean;
  points: number;
  badges: Badge[];
  needsHandle: boolean;
  /** When the handle can next be changed (once per 30 days); null = now. */
  handleChangeableAt: string | null;
  /** isTrusted = role TRUSTED or above; score counts toward `threshold` (50). */
  trust: { score: number; threshold: number; isTrusted: boolean };
  /** Open submissions from the last 14 days against the cap (10); older ones don't count. */
  openSubmissions: { count: number; limit: number };
  /** Since lastSeenActivityAt (else sign-up). resolvedSubmissions counts only APPROVED and REJECTED. */
  unseen: { resolvedSubmissions: number; badges: number; points: number };
  lastSeenActivityAt: string | null;
}

export type SubmissionKind = "NEW_TOILET" | "EDIT_TOILET" | "CLOSE_TOILET";
/** EXPIRED is legacy (old rows only): expiry now escalates to ESCALATED. */
export type SubmissionState = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_INFO" | "EXPIRED" | "ESCALATED";
/** Which rule decides a new toilet (trust model v2). Edits and closures read "nearby_quorum". */
export type SubmissionPath = "auto" | "on_site_check_in" | "nearby_quorum";
export type ResolutionCode =
  | "auto_on_site_photo"
  | "confirmed_on_site"
  | "community_approved"
  | "trusted_approved"
  | "moderator_approved"
  | "moderator_rejected"
  | "moderator_needs_info"
  | "peer_needs_info"
  | "escalated_expired"
  | "escalated_flagged"
  | "expired";

export interface ReviewerNote {
  value: "APPROVE" | "REJECT";
  note: string | null;
  createdAt: string;
  /** Cast within 150 m of the toilet. */
  nearby: boolean;
  viaCheckIn: boolean;
}

export interface NewToiletPayload {
  venueId?: string;
  newVenue?: { name: string; type: VenueType };
  label?: string;
  lat: number;
  lng: number;
  level?: string;
  areaType?: AreaType;
  accessNote?: string;
  features: Partial<Record<Feature, boolean>>;
  photoIds: string[];
  /** Added later through PATCH /submissions/:id when it needs more info. */
  note?: string;
}

export interface EditToiletPayload {
  changes: {
    label?: string;
    level?: string;
    areaType?: AreaType;
    accessNote?: string;
    features?: Partial<Record<Feature, boolean>>;
  };
  photoIds?: string[];
  note?: string;
}

export interface CloseToiletPayload {
  status: "CLOSED" | "RENOVATION";
  reason: string;
  note?: string;
}

export type SubmissionPayload = NewToiletPayload | EditToiletPayload | CloseToiletPayload;

export interface SubmissionView {
  id: string;
  kind: SubmissionKind;
  state: SubmissionState;
  payload: SubmissionPayload;
  toilet: { id: string; label: string | null; venueName: string; lat: number; lng: number } | null;
  venue: VenueLite | null;
  submittedBy: { handle: string | null };
  /** The submitter stood within 150 m of the toilet. */
  onSite: boolean;
  hasPhoto: boolean;
  path: SubmissionPath;
  /** APPROVE votes cast within 150 m (check-ins count). */
  nearbyApprovals: number;
  /** Nearby confirmations still needed; 0 once decided or when only a moderator can decide. */
  needed: number;
  escalated: boolean;
  /** How far from the toilet the submitter stood (never their coordinates). */
  submitterDistanceM: number | null;
  /** Every vote, newest first, anonymised. */
  reviewerNotes: ReviewerNote[];
  /** For an open EDIT_TOILET: the toilet's values now for the changed fields (null feature = no record). */
  current: {
    label?: string | null;
    level?: string | null;
    areaType?: AreaType;
    accessNote?: string | null;
    features?: Partial<Record<Feature, boolean | null>>;
  } | null;
  approvals: number;
  rejections: number;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  resolution: ResolutionCode | null;
  /** Plain English for `resolution`. */
  resolutionText: string | null;
  /** A moderator's own words on their decision. */
  resolutionNote: string | null;
  distanceM?: number;
  myVote: "APPROVE" | "REJECT" | null;
  photos: PhotoRef[];
  canVote: boolean;
}

/** GET /admin/submissions items. */
export type ModeratorSubmission = SubmissionView & { ageDays: number };

/** PATCH /submissions/:id while it needs more info (at least one field). */
export interface UpdateSubmissionBody {
  note?: string;
  photoIds?: string[];
  level?: string;
}

/** POST /submissions/:id/resolve (moderators). `note` becomes the resolutionNote the submitter sees. */
export interface ResolveSubmissionBody {
  state: "APPROVED" | "REJECTED" | "NEEDS_INFO";
  note?: string;
}

/** POST /me/activity/seen */
export interface ActivitySeen {
  ok: true;
  seenAt: string;
}

interface CreateSubmissionBase {
  toiletId?: string;
  /** Where the submitter stands (GPS only). */
  lat?: number;
  lng?: number;
  /** Re-submit after a 409 duplicate to say "it's a different toilet". */
  force?: boolean;
}

/** Discriminated on `kind`, matching the backend. A new place is created through NEW_TOILET's `newVenue`. */
export type CreateSubmissionBody = CreateSubmissionBase &
  (
    | { kind: "NEW_TOILET"; payload: NewToiletPayload }
    | { kind: "EDIT_TOILET"; payload: EditToiletPayload }
    | { kind: "CLOSE_TOILET"; payload: CloseToiletPayload }
  );

export interface List<T> {
  items: T[];
}
export interface Page<T> extends List<T> {
  nextCursor: string | null;
}

export interface RecommendBody {
  lat: number;
  lng: number;
  urgent?: boolean;
  purpose?: Purpose;
  require?: Feature[];
  areaType?: AreaType;
  openNow?: boolean;
  radiusM?: number;
  weights?: { distance?: number; cleanliness?: number; freshness?: number };
}

export interface RecommendItem {
  toilet: ToiletSummary;
  score: number;
  walkSeconds: number;
  walkDistanceM: number;
  reasons: string[];
  route: { polyline: [number, number][]; source: "onemap" | "estimate" } | null;
  /**
   * A PENDING toilet in calm results: added by the community, not yet confirmed. Never in urgent results.
   * Always sent by the API; optional only because /go builds items on the phone from saved toilets offline.
   */
  unconfirmed?: boolean;
}

export interface SkippedVenue {
  name: string;
  toiletStatus: VenueToiletStatus;
  note: string | null;
  distanceM: number;
}

export interface RecommendResponse {
  items: RecommendItem[];
  searchedRadiusM: number;
  skippedVenues: SkippedVenue[];
}

export interface WalkRoute {
  distanceM: number;
  durationS: number;
  /** [lat, lng] pairs */
  polyline: [number, number][];
  source: string;
}

export interface GeoSearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export type NearbyVenue = VenueLite & { distanceM: number; toiletCount: number };

export interface CheckInResult {
  id: string;
  distanceM: number;
  pointsAwarded: number;
  newBadges: Badge[];
  verifyPrompt: Feature[];
  /** Signed in at a new toilet someone else added: counted as a confirmation. */
  confirmedPending: boolean;
  /** …and that confirmation put a pending toilet live. */
  wentLive: boolean;
  /** Signed out: points this phone has saved up, paid on sign-in. 0 when signed in. */
  bankedPoints: number;
}

export interface Passport {
  stamped: number;
  total: number;
  stations: { venueId: string; name: string; lines: string[]; stampedAt: string | null }[];
}

export interface UserLeaderboard {
  items: { rank: number; handle: string; avatarUrl: string | null; points: number }[];
  me: { rank: number | null; points: number } | null;
}

export interface ToiletLeaderboard {
  items: { rank: number; toilet: ToiletSummary; score: number }[];
  areas: string[];
}

export type Region = "CENTRAL" | "EAST" | "NORTH" | "NORTH_EAST" | "WEST";

export interface AreaSummary {
  slug: string;
  name: string;
  region: Region | null;
  /** ACTIVE toilets only. */
  toiletCount: number;
  verifiedCount: number;
  venueCount: number;
  /** False for thin areas: the page renders but stays out of search engines. */
  indexable: boolean;
}

export interface AreaVenue extends VenueLite {
  address: string | null;
  /** Set only when the place has no address: the closest named place in the area. */
  near: { name: string; type: VenueType; distanceM: number } | null;
  toilets: ToiletSummary[];
}

export interface AreaDetail extends AreaSummary {
  pendingCount: number;
  center: { lat: number; lng: number } | null;
  venues: AreaVenue[];
  noToiletVenues: VenueLite[];
}

export interface SitemapToilet {
  id: string;
  updatedAt: string;
}

export interface PresignResponse {
  photoId: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface AdminFlag {
  id: string;
  reason: string;
  createdAt: string;
  toilet: { id: string; label: string | null; venueName: string };
  user: { handle: string | null };
}

export type PendingPhoto = PhotoRef & {
  createdAt: string;
  toiletId: string | null;
  submissionId: string | null;
  reviewId: string | null;
  approvals: number;
};

/** ASSUMPTION: ImportRun is not spelled out in the contract; mirrors the Prisma model. */
export interface ImportRun {
  id: string;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  inserted: number;
  updated: number;
  skipped: number;
  log?: unknown;
}

export interface DataQuality {
  counts: {
    toilets: number;
    venues: number;
    pending: number;
    escalated: number;
    flagsOpen: number;
    photosPending: number;
    noFeatures: number;
    stale365d: number;
    needsResurvey: number;
    unknownAreaType: number;
  };
}

export interface ActivityItem {
  id: string;
  delta: number;
  reason: string;
  refId: string | null;
  createdAt: string;
}

/** Nest default error body. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  errors?: unknown;
  [key: string]: unknown;
}
