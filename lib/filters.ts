import type { AreaType, Feature } from "./api/types";

/** Hard filters (PLAN.md F5). The rarer ones go last so the map's chip row leads with the common ones. */
export type FilterKey =
  | "BIDET"
  | "ACCESSIBLE"
  | "FREE"
  | "SITTING"
  | "BABY_CHANGE"
  | "OPEN_NOW"
  | "UNPAID_AREA"
  | "NURSING_ROOM"
  | "SHOWER"
  | "UNISEX";

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "BIDET", label: "Bidet" },
  { key: "ACCESSIBLE", label: "Accessible" },
  { key: "FREE", label: "Free" },
  { key: "SITTING", label: "Sitting" },
  { key: "BABY_CHANGE", label: "Baby change" },
  { key: "OPEN_NOW", label: "Open now" },
  { key: "UNPAID_AREA", label: "Outside fare gates" },
  { key: "NURSING_ROOM", label: "Nursing room" },
  { key: "SHOWER", label: "Shower" },
  { key: "UNISEX", label: "Unisex" },
];

export const FILTER_LABEL = Object.fromEntries(FILTERS.map((f) => [f.key, f.label])) as Record<FilterKey, string>;

/** The ten must-haves, grouped by what they're about so the list scans. Every FILTERS key appears once. */
export const MUST_HAVE_GROUPS: { id: string; label: string; keys: FilterKey[]; note?: string }[] = [
  { id: "facilities", label: "Facilities", keys: ["BIDET", "SITTING", "SHOWER", "BABY_CHANGE", "NURSING_ROOM"] },
  { id: "access", label: "Access", keys: ["ACCESSIBLE", "FREE", "UNISEX"] },
  {
    id: "when-where",
    label: "When and where",
    keys: ["OPEN_NOW", "UNPAID_AREA"],
    note: "“Outside fare gates” skips MRT and bus interchange toilets you'd need to tap in to reach.",
  },
];

/** Feature filters, for "is this must-have only vouched for by open data?" checks. */
export function requiredFeatures(active: ReadonlySet<FilterKey>): Feature[] {
  return FEATURE_FILTERS.filter((k) => active.has(k)) as Feature[];
}

const FEATURE_FILTERS: FilterKey[] = ["BIDET", "ACCESSIBLE", "FREE", "SITTING", "BABY_CHANGE", "NURSING_ROOM", "SHOWER", "UNISEX"];

export interface FilterQuery {
  features: Feature[];
  openNow: boolean;
  areaType?: AreaType;
}

/**
 * The hard filters checked on the phone, for lists ranked offline from a saved copy (fetched with other
 * filters, or none). Mirrors the API: every feature present, open now only when known open, and anything
 * but inside the fare gates for "Outside fare gates".
 */
export function matchesFilters(
  t: { features: Feature[]; openNow: boolean | null; areaType: AreaType },
  active: ReadonlySet<FilterKey>,
): boolean {
  const q = toFilterQuery(active);
  if (q.openNow && t.openNow !== true) return false;
  if (q.areaType === "UNPAID_AREA" && t.areaType === "PAID_AREA") return false;
  return q.features.every((f) => t.features.includes(f));
}

export function toFilterQuery(active: ReadonlySet<FilterKey>): FilterQuery {
  return {
    features: FEATURE_FILTERS.filter((k) => active.has(k)) as Feature[],
    openNow: active.has("OPEN_NOW"),
    areaType: active.has("UNPAID_AREA") ? "UNPAID_AREA" : undefined,
  };
}
