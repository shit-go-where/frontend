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

export function toFilterQuery(active: ReadonlySet<FilterKey>): FilterQuery {
  return {
    features: FEATURE_FILTERS.filter((k) => active.has(k)) as Feature[],
    openNow: active.has("OPEN_NOW"),
    areaType: active.has("UNPAID_AREA") ? "UNPAID_AREA" : undefined,
  };
}
