import type { AreaType, Feature, StatusKind, ToiletTier, VenueToiletStatus, VenueType } from "./api/types";

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
};

export const FEATURE_GROUPS: { title: string; features: Feature[] }[] = [
  { title: "Who and how", features: ["MALE", "FEMALE", "UNISEX", "ACCESSIBLE", "AMBULANT", "CHILD", "SITTING", "SQUAT"] },
  { title: "Supplies", features: ["TOILET_PAPER", "HAND_SOAP", "HAND_TOWEL", "HAND_DRYER", "SEAT_LINER", "BIDET"] },
  { title: "Family", features: ["BABY_CHANGE", "NURSING_ROOM", "SHOWER"] },
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

export const BAD_STATUS: StatusKind[] = ["NO_PAPER", "NO_SOAP", "BROKEN", "CLOSED_NOW", "LONG_QUEUE"];

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

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

export function toiletTitle(t: { label: string | null; venue: { name: string } }): string {
  return t.label ? `${t.venue.name} · ${t.label}` : t.venue.name;
}

export function cleanlinessText(score: number | null | undefined): string {
  if (score === null || score === undefined) return "No score yet";
  return `Clean ${score.toFixed(1).replace(/\.0$/, "")}/10`;
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

export function googleMapsWalkingUrl(from: { lat: number; lng: number } | null, to: { lat: number; lng: number }) {
  const p = new URLSearchParams({ api: "1", destination: `${to.lat},${to.lng}`, travelmode: "walking" });
  if (from) p.set("origin", `${from.lat},${from.lng}`);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/** Only allow same-site relative redirects (`/path`, never `//host`). */
export function safeRedirect(path: string | null | undefined, fallback = "/"): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  return path;
}
