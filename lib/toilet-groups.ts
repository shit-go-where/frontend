import type { Feature, SexPreference, ToiletSex, ToiletStatus } from "./api/types";
import { sexLabel, toiletTag } from "./format";
import { normalizeLevel } from "./level";
import { sexRank } from "./sex-order";

/*
 * Lists show one card per place and floor: a hawker centre's men's and accessible toilets side by side are one
 * stop, not two. The card is the toilet someone would walk into (the lead); the others ride inside it as short
 * "here too" rows. Data, the API and the toilets' own pages are unchanged: this is presentation only.
 */

/** What grouping needs of a toilet (ToiletSummary has all of it). */
export interface Groupable {
  id: string;
  status: ToiletStatus;
  level: string | null;
  sex?: ToiletSex | null;
  label: string | null;
  features: Feature[];
  venue: { id: string };
}

export interface ToiletGroup<T> {
  /** The place and floor ("venue|L1"), or the toilet's own id when it isn't grouped (not ACTIVE). */
  key: string;
  lead: T;
  /** The rest, in the order they'd be picked: their own sex first, then unisex, and so on (lib/sex-order.ts). */
  others: T[];
}

/** One key per floor as stored ("B1", "B1; L3", free text as typed); "" when not known. */
const floorKey = (level: string | null | undefined) => normalizeLevel(level) ?? "";

/** With the Accessible filter on: the unisex (accessible) toilet, then any that lists Accessible, then the rest. */
function accessRank(t: Groupable): number {
  return t.sex === "UNISEX" ? 0 : t.features.includes("ACCESSIBLE") ? 1 : 2;
}

/**
 * ACTIVE toilets grouped by place and floor, each group at its lead's place in the list, so a list in walking
 * order stays in walking order. The lead is the one they use first (`pref`; all toilets: men's, then women's),
 * or with `accessible` the accessible one. Pending, closed and renovating toilets stay cards of their own.
 */
export function groupToilets<T extends Groupable>(
  items: T[],
  pref: SexPreference | null | undefined,
  accessible = false,
): ToiletGroup<T>[] {
  const byKey = new Map<string, number[]>();
  items.forEach((t, i) => {
    const key = t.status === "ACTIVE" ? `${t.venue.id}|${floorKey(t.level)}` : `#${t.id}`;
    const list = byKey.get(key);
    if (list) list.push(i);
    else byKey.set(key, [i]);
  });
  const rank = (i: number) => [accessible ? accessRank(items[i]) : 0, sexRank(items[i].sex, pref), i];
  const cmp = (a: number, b: number) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  };
  return [...byKey]
    .map(([key, idx]) => {
      const sorted = [...idx].sort(cmp);
      return { key, at: sorted[0], lead: items[sorted[0]], others: sorted.slice(1).map((i) => items[i]) };
    })
    .sort((a, b) => a.at - b.at)
    .map(({ key, lead, others }) => ({ key, lead, others }));
}

/**
 * What a "here too" row says: "Accessible toilet here too", "Women's toilet here too", or for a twin of the
 * lead's kind its own tag ("Men's · East Wing"), since "Men's toilet here too" wouldn't tell the two apart.
 */
export function alsoHereText(t: Groupable, lead: Groupable): string {
  const sex = t.sex ?? null;
  if (sex && sex !== (lead.sex ?? null)) return sex === "UNISEX" ? "Accessible toilet here too" : `${sexLabel(sex)} toilet here too`;
  if (!sex && t.features.includes("ACCESSIBLE") && lead.sex !== "UNISEX" && !lead.features.includes("ACCESSIBLE")) {
    return "Accessible toilet here too";
  }
  return toiletTag({ label: t.label, sex }) ?? "Another toilet here too";
}

/** How many toilets some groups hold. */
export function toiletCount(groups: ToiletGroup<unknown>[]): number {
  return groups.reduce((n, g) => n + 1 + g.others.length, 0);
}
