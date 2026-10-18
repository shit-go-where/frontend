import type { Feature } from "./api/types";
import type { FilterKey } from "./filters";
import { FEATURE_GROUPS } from "./format";

/**
 * The candy assortment: each feature group owns one hue, so a feature reads
 * the same colour on cards, the detail page and the map filters. Pink stays
 * selection, mint stays walk time and good news, caramel stays trust. Cost
 * (Free) takes Sparkle Gold, and gold only ever colours an icon or a star.
 * The label always carries the meaning; the hue only groups it.
 */
export type Hue = "soda" | "taro" | "papaya" | "gold" | "mint";

const GROUP_HUE: Record<string, Hue | null> = {
  "Who and how": "taro",
  Supplies: "soda",
  "Wash and change": "soda",
  "Period care": "papaya",
  Family: "papaya",
  Fittings: null,
  Cost: "gold",
};

export const FEATURE_HUE = Object.fromEntries(
  FEATURE_GROUPS.flatMap((g) => g.features.map((f) => [f, GROUP_HUE[g.title] ?? null])),
) as Record<Feature, Hue | null>;

export const FILTER_HUE: Record<FilterKey, Hue | null> = {
  BIDET: "soda",
  ACCESSIBLE: "taro",
  FREE: "gold",
  SITTING: "taro",
  BABY_CHANGE: "papaya",
  OPEN_NOW: "mint",
  UNPAID_AREA: null,
  NURSING_ROOM: "papaya",
  SHOWER: "soda",
  UNISEX: "taro",
};

/** Soft fill with hue text: chips and tags. Gold stays off fills (a fill would read as caramel tier), so it is a fudge chip with a gold icon. */
export const HUE_CHIP: Record<Hue, string> = {
  soda: "bg-soda-soft text-soda",
  taro: "bg-taro-soft text-taro",
  papaya: "bg-papaya-soft text-papaya",
  gold: "bg-surface-2 text-fg [&_svg]:text-accent",
  mint: "bg-mint-soft text-mint",
};

/** Hue text only: icons on neutral surfaces, including the icon on a toilet card's fudge feature chip. */
export const HUE_TEXT: Record<Hue, string> = {
  soda: "text-soda",
  taro: "text-taro",
  papaya: "text-papaya",
  gold: "text-accent",
  mint: "text-mint",
};
