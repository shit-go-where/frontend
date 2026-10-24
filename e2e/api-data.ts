/**
 * The mocked API as a pure function, shared by the page-level mock (mock-api.ts) and the stub API
 * server (stub-api.mjs, for the service worker project and the axe run, whose requests page.route
 * cannot see or which need server-rendered pages). Plain TypeScript with erasable types only, so
 * Node can load it directly.
 */
import {
  CHECK_IN,
  COFFEESHOP_TOILETS,
  EXPANDED_DETAIL,
  HAWKER_TOILETS,
  ME,
  NEARBY_VENUES,
  PHOTO,
  PINS,
  PRESIGN,
  RECOMMEND,
  TOILETS,
  TOILET_DETAIL,
  submissionView,
} from "./fixtures.ts";
import type {
  AdminFlag,
  AreaDetail,
  AreaSummary,
  DataQuality,
  ImportRun,
  LineRow,
  ModeratorSubmission,
  Passport,
  PendingPhoto,
  StationDetail,
  StationSummary,
  StatusReport,
  ToiletLeaderboard,
  UserLeaderboard,
} from "../lib/api/types";

export type Who = "anon" | "user" | "admin";
export interface Reply {
  status?: number;
  body?: unknown;
}

/** Toilets the near list doesn't hold, but which specs show and open (a hawker centre's pair, a block's coffee shops). */
const EXTRA_TOILETS = [...HAWKER_TOILETS, ...COFFEESHOP_TOILETS];

const AREAS: AreaSummary[] = [
  { slug: "museum", name: "Museum", region: "CENTRAL", toiletCount: 14, verifiedCount: 9, venueCount: 8, indexable: true },
  { slug: "orchard", name: "Orchard", region: "CENTRAL", toiletCount: 31, verifiedCount: 22, venueCount: 17, indexable: true },
  { slug: "tampines", name: "Tampines", region: "EAST", toiletCount: 19, verifiedCount: 6, venueCount: 11, indexable: true },
];

const AREA_DETAIL: AreaDetail = {
  ...AREAS[0],
  pendingCount: 1,
  center: { lat: 1.2993, lng: 103.8455 },
  venues: [
    {
      id: "venue-dhoby",
      name: "Dhoby Ghaut",
      type: "MRT_STATION",
      lines: ["NSL", "NEL", "CCL"],
      lat: 1.2988,
      lng: 103.8458,
      toiletStatus: "HAS_TOILETS",
      note: null,
      address: "11 Orchard Road",
      near: null,
      toilets: [TOILETS[0]],
    },
  ],
  noToiletVenues: [],
};

const STATIONS: StationSummary[] = [
  {
    slug: "dhoby-ghaut",
    name: "Dhoby Ghaut",
    lines: [
      { code: "NSL", name: "North-South" },
      { code: "NEL", name: "North East" },
      { code: "CCL", name: "Circle" },
    ],
    lat: 1.2988,
    lng: 103.8458,
    toiletStatus: "HAS_TOILETS",
    toiletCount: 3,
    verifiedCount: 2,
    bestScore: 8.4,
    lastVerifiedAt: "2026-09-30T00:00:00.000Z",
    indexable: true,
  },
  {
    slug: "bishan",
    name: "Bishan",
    lines: [
      { code: "NSL", name: "North-South" },
      { code: "CCL", name: "Circle" },
    ],
    lat: 1.3509,
    lng: 103.8485,
    toiletStatus: "USES_NEARBY",
    toiletCount: 0,
    verifiedCount: 0,
    bestScore: null,
    lastVerifiedAt: null,
    indexable: true,
  },
];

const STATION_DETAIL: StationDetail = {
  ...STATIONS[0],
  note: null,
  area: { slug: "museum", name: "Museum" },
  toilets: TOILETS.slice(0, 1),
  nearby: [{ toilet: TOILETS[1], distanceM: 160 }],
};

const LINES: LineRow[] = [
  { rank: 1, code: "NSL", name: "North-South", stations: 27, stationsWithToilets: 25, scoredStations: 12, avgScore: 7.8, freshPct: 64, checkInsWeek: 120 },
  { rank: 2, code: "CCL", name: "Circle", stations: 30, stationsWithToilets: 24, scoredStations: 9, avgScore: 7.1, freshPct: 41, checkInsWeek: 75 },
];

const USER_BOARD: UserLeaderboard = {
  items: [
    { rank: 1, handle: "toiletking", avatarUrl: null, points: 1240 },
    { rank: 2, handle: "ahbeng", avatarUrl: null, points: 980 },
    { rank: 3, handle: "kopitiam_kaki", avatarUrl: null, points: 410 },
  ],
  me: null,
};

const TOILET_BOARD: ToiletLeaderboard = {
  items: TOILETS.map((toilet, i) => ({ rank: i + 1, toilet, score: 9.1 - i })),
  areas: ["Museum", "Orchard"],
};

const PASSPORT: Passport = {
  stamped: 1,
  total: 2,
  stations: [
    { venueId: "venue-dhoby", name: "Dhoby Ghaut", lines: ["NSL", "NEL", "CCL"], stampedAt: "2026-09-30T00:00:00.000Z" },
    { venueId: "venue-bishan", name: "Bishan", lines: ["NSL", "CCL"], stampedAt: null },
  ],
};

const STATUS: StatusReport[] = [];

const FLAGS: AdminFlag[] = [
  {
    id: "flag-1",
    reason: "Closed for renovation",
    createdAt: "2026-10-01T00:00:00.000Z",
    toilet: { id: "t-plaza-l3", label: "Level 3", venueName: "Plaza Singapura" },
    user: { handle: "ahbeng" },
  },
];

const PENDING_PHOTOS: PendingPhoto[] = [
  { ...PHOTO, createdAt: "2026-10-01T00:00:00.000Z", toiletId: "t-plaza-l3", submissionId: null, reviewId: null, approvals: 0 },
];

const QUALITY: DataQuality = {
  counts: {
    toilets: 1200,
    venues: 800,
    pending: 3,
    escalated: 1,
    flagsOpen: 1,
    photosPending: 1,
    noFeatures: 40,
    stale365d: 90,
    needsResurvey: 12,
    unknownAreaType: 300,
  },
};

const IMPORTS: ImportRun[] = [
  { id: "imp-1", source: "osm", startedAt: "2026-10-01T00:00:00.000Z", finishedAt: "2026-10-01T00:05:00.000Z", inserted: 3, updated: 10, skipped: 2 },
];

function queued(): ModeratorSubmission[] {
  return [{ ...submissionView({ venueId: "venue-plaza-sing", features: {}, photoIds: ["photo-1"] } as never), ageDays: 2 }];
}

/** The mocked API: undefined means "not mocked" (the caller answers 404). `path` has no /api prefix. */
export function fixtureReply(method: string, path: string, url: URL, who: Who, body: unknown = null): Reply | undefined {
  const key = `${method} ${path}`;
  const signedIn = who !== "anon";
  switch (key) {
    case "GET /me":
      return signedIn
        ? { body: who === "admin" ? { ...ME, role: "ADMIN" } : ME }
        : { status: 401, body: { statusCode: 401, message: "Unauthorized" } };
    case "GET /toilets/nearby":
      return { body: { items: TOILETS } };
    case "GET /toilets/in-bounds":
      return { body: { items: PINS } };
    case "POST /routing/recommend":
      return { body: RECOMMEND };
    case "GET /routing/walk":
      return { body: { distanceM: 300, durationS: 240, polyline: [], source: "estimate" } };
    case "POST /routing/started":
      return { body: { ok: true } };
    case "GET /geo/search":
      return { body: { items: [] } };
    case "GET /venues/nearby":
    case "GET /venues/search":
      return { body: { items: NEARBY_VENUES } };
    case "POST /media/presign":
      return { body: PRESIGN };
    case "PUT /media/photo-1/upload":
      return { status: 200, body: "" };
    case "POST /media/photo-1/confirm":
      return { body: PHOTO };
    case "POST /submissions":
      return { body: submissionView((body as { payload: never }).payload) };
    case "GET /badges":
      return { body: { items: [] } };
    case "GET /areas":
      return { body: { items: AREAS } };
    case "GET /stations":
      return { body: { items: STATIONS } };
    case "GET /leaderboard/lines":
      return { body: { items: LINES } };
    case "GET /leaderboard/users":
      return { body: signedIn ? { ...USER_BOARD, me: { rank: 12, points: ME.points } } : USER_BOARD };
    case "GET /leaderboard/toilets":
      return { body: TOILET_BOARD };
    case "GET /toilets/sitemap":
      return { body: { items: TOILETS.map((t) => ({ id: t.id, updatedAt: "2026-10-01T00:00:00.000Z" })) } };
    case "GET /me/activity":
      return signedIn ? { body: { items: [], nextCursor: null } } : { status: 401, body: { statusCode: 401, message: "Unauthorized" } };
    case "GET /me/passport":
      return signedIn ? { body: PASSPORT } : { status: 401, body: { statusCode: 401, message: "Unauthorized" } };
    case "POST /me/activity/seen":
      return { body: { ok: true, seenAt: new Date().toISOString() } };
    case "GET /submissions/queue":
    case "GET /submissions/mine":
      return { body: { items: [] } };
    case "GET /admin/flags":
      return who === "admin" ? { body: { items: FLAGS } } : { status: 403, body: { statusCode: 403, message: "Forbidden" } };
    case "GET /admin/photos/pending":
      return who === "admin" ? { body: { items: PENDING_PHOTOS } } : { status: 403, body: { statusCode: 403, message: "Forbidden" } };
    case "GET /admin/data-quality":
      return who === "admin" ? { body: QUALITY } : { status: 403, body: { statusCode: 403, message: "Forbidden" } };
    case "GET /admin/submissions":
      return who === "admin" ? { body: { items: queued() } } : { status: 403, body: { statusCode: 403, message: "Forbidden" } };
    case "GET /admin/imports":
      return who === "admin" ? { body: { items: IMPORTS } } : { status: 403, body: { statusCode: 403, message: "Forbidden" } };
  }
  let m: RegExpMatchArray | null;
  if (method === "GET" && (m = path.match(/^\/toilets\/([^/]+)$/))) {
    const t = [...TOILETS, ...EXTRA_TOILETS].find((x) => x.id === m![1]);
    if (m[1] === TOILET_DETAIL.id) return { body: TOILET_DETAIL };
    if (m[1] === EXPANDED_DETAIL.id) return { body: EXPANDED_DETAIL };
    return t ? { body: { ...TOILET_DETAIL, ...t, venue: TOILET_DETAIL.venue } } : { status: 404, body: { statusCode: 404, message: "Not found" } };
  }
  if (method === "POST" && /^\/toilets\/[^/]+\/check-ins$/.test(path)) return { body: CHECK_IN };
  if (method === "POST" && /^\/toilets\/[^/]+\/verify$/.test(path)) return { body: { ok: true } };
  if (method === "POST" && /^\/toilets\/[^/]+\/status$/.test(path)) {
    const kind = (body as { kind?: string } | null)?.kind ?? "ALL_GOOD";
    return { body: { id: "status-1", kind, confirmations: 1, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString(), confirmedByMe: true, unconfirmed: false } };
  }
  if (method === "GET" && /^\/toilets\/[^/]+\/status$/.test(path)) return { body: { items: STATUS } };
  if (method === "GET" && /^\/toilets\/[^/]+\/reviews$/.test(path)) return { body: { items: [], nextCursor: null } };
  if (method === "GET" && (m = path.match(/^\/venues\/([^/]+)$/))) {
    const all = [...TOILETS, ...EXTRA_TOILETS];
    const v = NEARBY_VENUES.find((x) => x.id === m![1]) ?? all.find((t) => t.venue.id === m![1])?.venue;
    if (!v) return { status: 404, body: { statusCode: 404, message: "Venue not found" } };
    const { id, name, type, lines, lat, lng, toiletStatus, note } = v;
    const toilets = all.filter((t) => t.venue.id === id);
    return { body: { id, name, type, lines, lat, lng, toiletStatus, note, address: null, planningArea: null, toilets } };
  }
  if (method === "GET" && (m = path.match(/^\/areas\/([^/]+)$/))) {
    return AREAS.some((a) => a.slug === m![1]) ? { body: { ...AREA_DETAIL, ...AREAS.find((a) => a.slug === m![1]) } } : { status: 404, body: { statusCode: 404, message: "Not found" } };
  }
  if (method === "GET" && (m = path.match(/^\/stations\/([^/]+)$/))) {
    return STATIONS.some((s) => s.slug === m![1]) ? { body: { ...STATION_DETAIL, ...STATIONS.find((s) => s.slug === m![1]) } } : { status: 404, body: { statusCode: 404, message: "Not found" } };
  }
  return undefined;
}
