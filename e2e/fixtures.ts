/** Fixtures shaped exactly like backend/API_CONTRACT.md (via lib/api/types). */
import type {
  CheckInResult,
  Me,
  NearbyVenue,
  PhotoRef,
  PresignResponse,
  RecommendResponse,
  SubmissionView,
  ToiletDetail,
  ToiletPin,
  ToiletSummary,
  VenueLite,
} from "../lib/api/types";
import { levelOrder } from "../lib/level";

export const ORIGIN = { lat: 1.2993, lng: 103.8455 };

const dhobyGhaut: VenueLite = {
  id: "venue-dhoby",
  name: "Dhoby Ghaut",
  type: "MRT_STATION",
  lines: ["NSL", "NEL", "CCL"],
  lat: 1.2988,
  lng: 103.8458,
  toiletStatus: "HAS_TOILETS",
  note: null,
};

const plazaSing: VenueLite = {
  id: "venue-plaza-sing",
  name: "Plaza Singapura",
  type: "MALL",
  lines: [],
  lat: 1.3006,
  lng: 103.8452,
  toiletStatus: "HAS_TOILETS",
  note: null,
};

const ssc: VenueLite = {
  id: "venue-ssc",
  name: "Istana Park",
  type: "PARK",
  lines: [],
  lat: 1.2976,
  lng: 103.8466,
  toiletStatus: "UNKNOWN",
  note: null,
};

function toilet(p: Partial<ToiletSummary> & Pick<ToiletSummary, "id" | "venue" | "lat" | "lng">): ToiletSummary {
  return {
    label: null,
    level: null,
    areaType: "UNKNOWN",
    tier: "VERIFIED",
    status: "ACTIVE",
    features: [],
    scoreCleanliness: null,
    surveyTotal: null,
    rasStars: null,
    reviewCount: 0,
    seenBy: 1,
    activeStatus: [],
    lastVerifiedAt: "2024-03-15T00:00:00.000Z",
    needsResurvey: false,
    openNow: true,
    photoThumb: null,
    ...p,
  };
}

export const TOILETS: ToiletSummary[] = [
  toilet({
    id: "t-dhoby-nsl",
    venue: dhobyGhaut,
    lat: 1.2989,
    lng: 103.8457,
    label: "NSL side, near Exit A",
    level: "B1",
    areaType: "UNPAID_AREA",
    features: ["TOILET_PAPER", "HAND_SOAP", "BIDET", "ACCESSIBLE", "SITTING", "FREE"],
    scoreCleanliness: 8.4,
    surveyTotal: 41,
    rasStars: 4,
    reviewCount: 3,
    distanceM: 60,
    walkSecondsEstimate: 62,
  }),
  toilet({
    id: "t-plaza-l3",
    venue: plazaSing,
    lat: 1.3007,
    lng: 103.8451,
    label: "Level 3, beside the cinema",
    level: "L3",
    tier: "COMMUNITY",
    features: ["TOILET_PAPER", "HAND_SOAP", "SITTING", "BABY_CHANGE", "FREE"],
    scoreCleanliness: 7.1,
    reviewCount: 1,
    activeStatus: [{ kind: "LONG_QUEUE", count: 2, latestAt: new Date(Date.now() - 20 * 60_000).toISOString() }],
    lastVerifiedAt: "2026-09-30T00:00:00.000Z",
    distanceM: 160,
    walkSecondsEstimate: 166,
  }),
  toilet({
    id: "t-istana",
    venue: ssc,
    lat: 1.2975,
    lng: 103.8467,
    tier: "IMPORTED",
    features: ["FREE"],
    openNow: null,
    lastVerifiedAt: null,
    distanceM: 240,
    walkSecondsEstimate: 250,
  }),
];

/** TOILETS[0] as GET /toilets/:id returns it: level and fare gates known, a few features recorded. */
export const TOILET_DETAIL: ToiletDetail = {
  ...TOILETS[0],
  venue: { ...dhobyGhaut, address: "11 Orchard Road", planningArea: "Museum" },
  verifiedBy: null,
  accessNote: null,
  nearestExit: "A",
  near: null,
  openSubmissionId: null,
  openingHours: null,
  featureDetails: (["BIDET", "ACCESSIBLE", "TOILET_PAPER"] as const).map((feature) => ({
    feature,
    present: true,
    source: "COMMUNITY",
    observedAt: "2026-09-01T00:00:00.000Z",
  })),
  latestSurvey: null,
  surveyCount: 0,
  reviews: [],
  photos: [],
  myReview: null,
  source: "COMMUNITY",
  attribution: null,
  siblings: [],
};

export const CHECK_IN: CheckInResult = {
  id: "checkin-1",
  distanceM: 12,
  pointsAwarded: 5,
  newBadges: [],
  verifyPrompt: ["BIDET", "ACCESSIBLE", "TOILET_PAPER", "HAND_SOAP", "SITTING"],
  confirmedPending: false,
  wentLive: false,
  bankedPoints: 0,
};

export const PINS: ToiletPin[] = [
  ...TOILETS.map((t) => ({
    id: t.id,
    lat: t.lat,
    lng: t.lng,
    tier: t.tier,
    status: t.status,
    scoreCleanliness: t.scoreCleanliness,
    hasIssue: t.activeStatus.length > 0,
    venueType: t.venue.type,
    venueId: t.venue.id,
    level: t.level,
    levelOrder: levelOrder(t.level),
  })),
  {
    id: "t-pending",
    lat: 1.2999,
    lng: 103.8462,
    tier: "COMMUNITY",
    status: "PENDING",
    scoreCleanliness: null,
    hasIssue: false,
    venueType: "OTHER",
    venueId: "venue-pending",
    level: null,
    levelOrder: null,
  },
];

/**
 * A mall with toilets on three floors a few metres apart (one with a reported issue), a fourth across
 * the building (40 m off: its own pin), and a tower with six floors at one spot (folds and fans out).
 * Only the map sees these (in-bounds); each has its own GET /toilets/:id via mallRoutes().
 */
// Both just north of ORIGIN, so they're in view at the home map's zoom 16 and one zoom in (17), clear of the
// search above and the sheet below; 150 m apart, so they never share a cluster.
const mall: VenueLite = { ...plazaSing, id: "venue-mall", name: "Level Test Mall", lat: 1.2998, lng: 103.845 };
const tower: VenueLite = { ...plazaSing, id: "venue-tower", name: "Tall Tower", lat: 1.2998, lng: 103.8464 };
const off = (m: number) => m / 111_320;

export const MALL_TOILETS: ToiletSummary[] = [
  toilet({ id: "m-l3", venue: mall, lat: mall.lat + off(3), lng: mall.lng, level: "L3", tier: "COMMUNITY" }),
  toilet({ id: "m-b1", venue: mall, lat: mall.lat, lng: mall.lng, level: "B1" }),
  toilet({
    id: "m-l1",
    venue: mall,
    lat: mall.lat - off(4),
    lng: mall.lng + off(2),
    level: "L1",
    activeStatus: [{ kind: "NO_PAPER", count: 1, latestAt: new Date().toISOString() }],
  }),
  toilet({ id: "m-far", venue: mall, lat: mall.lat + off(40), lng: mall.lng + off(10), level: "L2", tier: "IMPORTED" }),
];

export const TOWER_TOILETS: ToiletSummary[] = ["B2", "B1", "L1", "L2", "L5", "L9"].map((level) =>
  toilet({ id: `tw-${level.toLowerCase()}`, venue: tower, lat: tower.lat, lng: tower.lng, level }),
);

export const pinOf = (t: ToiletSummary): ToiletPin => ({
  id: t.id,
  lat: t.lat,
  lng: t.lng,
  tier: t.tier,
  status: t.status,
  scoreCleanliness: t.scoreCleanliness,
  hasIssue: t.activeStatus.length > 0,
  venueType: t.venue.type,
  venueId: t.venue.id,
  level: t.level,
  levelOrder: levelOrder(t.level),
});


export const RECOMMEND: RecommendResponse = {
  searchedRadiusM: 800,
  items: TOILETS.map((t, i) => ({
    toilet: t,
    score: 0.9 - i * 0.1,
    walkSeconds: t.walkSecondsEstimate!,
    walkDistanceM: Math.round(t.distanceM! * 1.3),
    reasons: [`${Math.max(1, Math.round(t.walkSecondsEstimate! / 60))} min walk`, ...(t.features.includes("BIDET") ? ["bidet"] : [])],
    route:
      i === 0
        ? {
            source: "onemap",
            polyline: [
              [ORIGIN.lat, ORIGIN.lng],
              [1.2991, 103.8456],
              [t.lat, t.lng],
            ],
          }
        : null,
    unconfirmed: false,
  })),
  skippedVenues: [
    { name: "Bishan CCL", toiletStatus: "NONE", note: "use the NSL side", distanceM: 420 },
  ],
};

export const ME: Me = {
  id: "user-1",
  email: "ah.beng@example.com",
  handle: "ahbeng",
  displayName: "Ah Beng",
  avatarUrl: null,
  role: "USER",
  trustScore: 12,
  leaderboardOptIn: true,
  verifierCredit: true,
  points: 42,
  badges: [],
  needsHandle: false,
  handleChangeableAt: null,
  trust: { score: 12, threshold: 50, isTrusted: false },
  openSubmissions: { count: 0, limit: 10 },
  unseen: { resolvedSubmissions: 0, badges: 0, points: 0, routed: 0 },
  impact: { toilets: 0, routedWeek: 0 },
  lastSeenActivityAt: null,
  telegramLinked: false,
};

export const NEARBY_VENUES: NearbyVenue[] = [
  { ...plazaSing, distanceM: 120, toiletCount: 2 },
  { ...dhobyGhaut, distanceM: 140, toiletCount: 3 },
];

export const PRESIGN: PresignResponse = {
  photoId: "photo-1",
  uploadUrl: "/api/media/photo-1/upload",
  method: "PUT",
  headers: { "Content-Type": "image/jpeg" },
};

export const PHOTO: PhotoRef = { id: "photo-1", url: "/api/media/files/photo-1.jpg", thumbUrl: null };

export function submissionView(payload: SubmissionView["payload"]): SubmissionView {
  return {
    id: "sub-1",
    kind: "NEW_TOILET",
    state: "PENDING",
    payload,
    toilet: null,
    venue: plazaSing,
    submittedBy: { handle: "ahbeng" },
    onSite: false,
    hasPhoto: true,
    path: "nearby_quorum",
    nearbyApprovals: 0,
    needed: 2,
    escalated: false,
    submitterDistanceM: null,
    reviewerNotes: [],
    current: null,
    approvals: 0,
    rejections: 0,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 86400_000).toISOString(),
    resolvedAt: null,
    resolution: null,
    resolutionText: null,
    resolutionNote: null,
    myVote: null,
    photos: [PHOTO],
    canVote: false,
  };
}

/** 40x30 teal PNG. */
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAPElEQVRIie3VoQ0AMAwDsOFcGpj/0c7YgKXySlUan3RP5lhcp45wzTtVgURlDhLF4rBYLAaLw2KxmK9YvLW4I52BaFk4AAAAAElFTkSuQmCC",
  "base64",
);
