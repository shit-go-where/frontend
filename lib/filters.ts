import type { AreaType, Feature } from "./api/types";

/** Hard filters for v1 (PLAN.md F5). */
export type FilterKey = "BIDET" | "ACCESSIBLE" | "FREE" | "SITTING" | "BABY_CHANGE" | "OPEN_NOW" | "UNPAID_AREA";

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "BIDET", label: "Bidet" },
  { key: "ACCESSIBLE", label: "Accessible" },
  { key: "FREE", label: "Free" },
  { key: "SITTING", label: "Sitting" },
  { key: "BABY_CHANGE", label: "Baby change" },
  { key: "OPEN_NOW", label: "Open now" },
  { key: "UNPAID_AREA", label: "Outside fare gates" },
];

/** Feature filters, for "is this must-have only vouched for by open data?" checks. */
export function requiredFeatures(active: ReadonlySet<FilterKey>): Feature[] {
  return FEATURE_FILTERS.filter((k) => active.has(k)) as Feature[];
}

const FEATURE_FILTERS: FilterKey[] = ["BIDET", "ACCESSIBLE", "FREE", "SITTING", "BABY_CHANGE"];

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
