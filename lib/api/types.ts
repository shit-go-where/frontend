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
] as const;
export type Feature = (typeof FEATURES)[number];

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
}

export interface StatusReport {
  id: string;
  kind: StatusKind;
  confirmations: number;
  createdAt: string;
  expiresAt: string;
  confirmedByMe: boolean;
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
}

export type SubmissionKind = "NEW_TOILET" | "EDIT_TOILET" | "CLOSE_TOILET" | "NEW_VENUE";
export type SubmissionState = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_INFO" | "EXPIRED";

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
  approvals: number;
  rejections: number;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  distanceM?: number;
  myVote: "APPROVE" | "REJECT" | null;
  photos: PhotoRef[];
  canVote: boolean;
}

interface CreateSubmissionBase {
  toiletId?: string;
  /** Where the submitter stands (GPS only). */
  lat?: number;
  lng?: number;
  /** Re-submit after a 409 duplicate to say "it's a different toilet". */
  force?: boolean;
}

/** Discriminated on `kind`, matching the backend. NEW_VENUE is rejected by the API in v1. */
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
