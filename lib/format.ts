import type { AreaType, Feature, Region, StatusKind, ToiletStatus, ToiletTier, VenueToiletStatus, VenueType } from "./api/types";

export const FEATURE_LABELS: Record<Feature, string> = {
  TOILET_PAPER: "Toilet paper",
  HAND_TOWEL: "Hand towel",
  HAND_DRYER: "Hand dryer",
  HAND_SOAP: "Hand soap",
  SEAT_LINER: "Seat liner",
  BIDET: "Bidet",
  AUTO_FLUSH: "Auto flush",
  AUTO_TAP: "Auto tap",
  AUTO_SOAP: "Auto soap",
  COAT_HOOK: "Coat hook",
  FEEDBACK_DEVICE: "Feedback device",
  SIGNAGE: "Signage",
  POSTERS: "Posters",
  AMBULANT: "Ambulant cubicle",
  ACCESSIBLE: "Accessible",
  CHILD: "Child toilet",
  BABY_CHANGE: "Baby change",
  NURSING_ROOM: "Nursing room",
  SHOWER: "Shower",
  SITTING: "Sitting",
  SQUAT: "Squat",
  MALE: "Male",
  FEMALE: "Female",
  UNISEX: "Unisex",
  FREE: "Free",
  SANITARY_BIN: "Sanitary bin",
  PERIOD_PRODUCTS: "Pads or tampons",
  MIRROR: "Mirror",
  WATER_REFILL: "Water refill",
  ABLUTION: "Ablution area",
};

export const FEATURE_GROUPS: { title: string; features: Feature[] }[] = [
  { title: "Who and how", features: ["MALE", "FEMALE", "UNISEX", "ACCESSIBLE", "AMBULANT", "CHILD", "SITTING", "SQUAT"] },
  { title: "Supplies", features: ["TOILET_PAPER", "HAND_SOAP", "HAND_TOWEL", "HAND_DRYER", "SEAT_LINER", "BIDET"] },
  { title: "Period care", features: ["SANITARY_BIN", "PERIOD_PRODUCTS"] },
  { title: "Family", features: ["BABY_CHANGE", "NURSING_ROOM"] },
  { title: "Wash and change", features: ["SHOWER", "MIRROR", "ABLUTION", "WATER_REFILL"] },
  { title: "Fittings", features: ["AUTO_FLUSH", "AUTO_TAP", "AUTO_SOAP", "COAT_HOOK", "FEEDBACK_DEVICE", "SIGNAGE", "POSTERS"] },
  { title: "Cost", features: ["FREE"] },
];

export const VENUE_TYPE_LABELS: Record<VenueType, string> = {
  MRT_STATION: "MRT station",
  BUS_INTERCHANGE: "Bus interchange",
  MALL: "Mall",
  HAWKER_CENTRE: "Hawker centre",
  COFFEESHOP: "Coffee shop",
  COMMUNITY_CLUB: "Community club",
  PARK: "Park",
  LIBRARY: "Library",
  HOSPITAL: "Hospital",
  SPORTS_CENTRE: "Sports centre",
  OTHER: "Other",
};

/** Section headings on area pages, in the order a visitor looks for them. */
export const VENUE_TYPE_SECTIONS: { type: VenueType; title: string }[] = [
  { type: "MRT_STATION", title: "MRT stations" },
  { type: "BUS_INTERCHANGE", title: "Bus interchanges" },
  { type: "MALL", title: "Malls" },
  { type: "HAWKER_CENTRE", title: "Hawker centres" },
  { type: "COFFEESHOP", title: "Coffee shops" },
  { type: "COMMUNITY_CLUB", title: "Community clubs" },
  { type: "LIBRARY", title: "Libraries" },
  { type: "SPORTS_CENTRE", title: "Sports centres" },
  { type: "HOSPITAL", title: "Hospitals" },
  { type: "PARK", title: "Parks" },
  { type: "OTHER", title: "Other public toilets" },
];

export const REGION_LABELS: Record<Region, string> = {
  CENTRAL: "Central",
  EAST: "East",
  NORTH: "North",
  NORTH_EAST: "North-East",
  WEST: "West",
};

/** Must match backend/src/areas/regions.ts: "Downtown Core" -> "downtown-core". */
export function areaSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Tampines" the MRT station reads as "Tampines MRT" once it's out of its own heading. */
export function placeName(v: { name: string; type: VenueType }): string {
  return v.type === "MRT_STATION" && !/\b(MRT|LRT)\b/i.test(v.name) ? `${v.name} MRT` : v.name;
}

/** Drops the trailing "Singapore 529544": every address here is in Singapore. */
export function shortAddress(address: string): string {
  return address.replace(/,?\s*Singapore\s*\d{6}\s*$/i, "").trim();
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const AREA_TYPE_LABELS: Record<AreaType, string> = {
  PAID_AREA: "Inside the fare gates",
  UNPAID_AREA: "Outside the fare gates",
  NOT_APPLICABLE: "No fare gates",
  UNKNOWN: "Not sure",
};

export const STATUS_LABELS: Record<StatusKind, string> = {
  ALL_GOOD: "All good",
  NO_PAPER: "No paper",
  NO_SOAP: "No soap",
  LONG_QUEUE: "Long queue",
  BEING_CLEANED: "Being cleaned",
  BROKEN: "Something broken",
  CLOSED_NOW: "Closed now",
};

/**
 * Known to be shut right now: outside its hours, closed or under renovation, or reported closed by someone
 * there. Such a toilet never leads a list.
 */
export function isClosedNow(t: {
  openNow: boolean | null;
  status: ToiletStatus;
  activeStatus?: { kind: StatusKind }[];
}): boolean {
  return (
    t.openNow === false ||
    t.status === "CLOSED" ||
    t.status === "RENOVATION" ||
    !!t.activeStatus?.some((s) => s.kind === "CLOSED_NOW")
  );
}

export const BAD_STATUS: StatusKind[] =["NO_PAPER", "NO_SOAP", "BROKEN", "CLOSED_NOW", "LONG_QUEUE"];

export const TIER_LABELS: Record<ToiletTier, string> = {
  VERIFIED: "Verified",
  COMMUNITY: "Community",
  IMPORTED: "Imported",
};

export const TIER_HELP: Record<ToiletTier, string> = {
  VERIFIED: "Surveyed in person by our fieldwork team",
  COMMUNITY: "Added and approved by the community",
  IMPORTED: "From open data, not yet checked by a person",
};

/** One-line legend text, used under the map and in the tier explainer. */
export const TIER_LEGEND: { tier: ToiletTier | "PENDING"; label: string; help: string }[] = [
  { tier: "VERIFIED", label: "Verified", help: "Surveyed in person on our 50-point rubric." },
  { tier: "COMMUNITY", label: "Community", help: "Added by a user and approved by people nearby." },
  { tier: "IMPORTED", label: "Imported", help: "From open data. Nobody has checked it in person yet." },
  { tier: "PENDING", label: "Pending", help: "Waiting for review. Never used for directions." },
];

export const VENUE_STATUS_LABELS: Record<VenueToiletStatus, string> = {
  HAS_TOILETS: "Has toilets",
  NONE: "No toilet",
  UNKNOWN: "Unknown",
  USES_NEARBY: "Uses a nearby toilet",
};

export const MRT_LINES: Record<string, { name: string; color: string }> = {
  NSL: { name: "North South Line", color: "#D42E12" },
  EWL: { name: "East West Line", color: "#009645" },
  NEL: { name: "North East Line", color: "#9900AA" },
  CCL: { name: "Circle Line", color: "#FA9E0D" },
  DTL: { name: "Downtown Line", color: "#005EC4" },
  TEL: { name: "Thomson-East Coast Line", color: "#9D5B25" },
};

export function lineColor(line: string): string {
  return MRT_LINES[line]?.color ?? "#748477";
}

/** Text colour that keeps a line badge at WCAG AA (4.5:1) on its line colour. */
export function lineTextColor(line: string): string {
  const hex = lineColor(line).replace("#", "");
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  // Whichever of white or black ink contrasts more (both clear 4.5:1 on every line colour).
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? "#ffffff" : "#000000";
}

export function formatDistance(m?: number | null): string {
  if (m === undefined || m === null || Number.isNaN(m)) return "";
  if (m < 1000) return `${Math.round(m / 10) * 10 || Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function formatWalk(seconds?: number | null): string {
  if (seconds === undefined || seconds === null) return "";
  const min = Math.max(1, Math.round(seconds / 60));
  return `${min} min walk`;
}

export function walkMinutes(seconds?: number | null): number | null {
  if (seconds === undefined || seconds === null) return null;
  return Math.max(1, Math.round(seconds / 60));
}

const RTF = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en-SG", { numeric: "auto" }) : null;

export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = (t - now) / 1000;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (abs >= secs) {
      const v = Math.round(diff / secs);
      return RTF ? RTF.format(v, unit) : `${Math.abs(v)} ${unit}s ago`;
    }
  }
  return "just now";
}

/** How long ago a saved (offline) copy was fetched, short: "4 min", "2 h", "3 days". */
export function savedAge(at: number, now: number = Date.now()): string {
  const min = Math.max(1, Math.round((now - at) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return plural(Math.round(h / 24), "day");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Pinned to Singapore time: the server renders in UTC, and a date near midnight would otherwise differ
  // between the server's HTML and the browser's, which breaks hydration (React #418).
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
}

export function toiletTitle(t: { label: string | null; venue: { name: string } }): string {
  return t.label ? `${t.venue.name} · ${t.label}` : t.venue.name;
}

/** A cleanliness score as a number, written the same everywhere: "9", "8.5". */
export function scoreNumber(score: number): string {
  return score.toFixed(1).replace(/\.0$/, "");
}

export function cleanlinessText(score: number | null | undefined): string {
  if (score === null || score === undefined) return "No score yet";
  return `Clean ${scoreNumber(score)}/10`;
}

/**
 * The API's reason strings repeat what the card already shows (walk time,
 * cleanliness, tier, live reports). Keep only the feature reasons.
 */
export function featureReasons(reasons: string[]): string[] {
  return reasons.filter(
    (r) =>
      !/min walk$/i.test(r) &&
      !/^clean \d/i.test(r) &&
      !/^reported:/i.test(r) &&
      !/^(surveyed|verified|community verified|from openstreetmap|imported)/i.test(r),
  );
}

/**
 * Walking directions in Google Maps. Pass `from` only for a searched place: with no origin Google Maps
 * starts from the phone's own live position (better than a fix we took a minute ago) and, with
 * `dir_action=navigate`, goes straight into turn-by-turn.
 */
export function googleMapsWalkingUrl(from: { lat: number; lng: number } | null, to: { lat: number; lng: number }) {
  const p = new URLSearchParams({ api: "1", destination: `${to.lat},${to.lng}`, travelmode: "walking" });
  if (from) p.set("origin", `${from.lat},${from.lng}`);
  else p.set("dir_action", "navigate");
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/** Only allow same-site relative redirects (`/path`, never `//host`). */
export function safeRedirect(path: string | null | undefined, fallback = "/"): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  return path;
}

/** Short forms OneMap writes in capitals that stay capitals once a name is tidied. */
const KEEP_CAPS = new Set(["MRT", "LRT", "HDB", "NTUC", "CC", "SAFRA", "YMCA", "NUS", "NTU", "SMU", "SUTD", "ITE", "JTC", "CPF", "ICA", "SGH", "KK", "UOB", "OCBC", "DBS", "POSB", "SPH", "TPY", "AMK", "BLK", "ST"]);

/** OneMap's ALL-CAPS names in plain title case ("ORCHARD MRT STATION (TE14)" → "Orchard MRT Station (TE14)"). */
export function tidyPlaceName(s: string): string {
  if (/[a-z]/.test(s)) return s;
  return s
    .toLowerCase()
    .replace(/[a-z0-9'’]+/g, (w) => {
      const up = w.toUpperCase();
      if (KEEP_CAPS.has(up) || /\d/.test(w)) return up;
      return w[0].toUpperCase() + w.slice(1);
    });
}

/**
 * OneMap addresses repeat the building name and end in "SINGAPORE 248654". Keep the street and the postcode:
 * "20 Orchard Boulevard · 248654".
 */
export function tidyPlaceAddress(address: string, name: string): string {
  let a = address;
  if (name && a.toUpperCase().includes(name.toUpperCase())) {
    const i = a.toUpperCase().indexOf(name.toUpperCase());
    a = a.slice(0, i) + a.slice(i + name.length);
  }
  const post = a.match(/SINGAPORE\s+(\d{6})\s*$/i);
  if (post) a = a.slice(0, post.index);
  a = tidyPlaceName(a.replace(/\s+/g, " ").trim());
  return [a, post?.[1]].filter(Boolean).join(" · ");
}
