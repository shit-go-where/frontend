import type { ToiletSex, VenueType } from "./api/types";
import { toiletTag } from "./format";
import { levelParts, levelShort } from "./level";

/*
 * Many open-data toilets come in with no name of their own: the import calls the place "Public
 * toilet". A page full of those says nothing about where you'd be going, so they borrow the API's
 * `near` line ("120 m from Tampines MRT"). Plain module, so the server page (metadata) and the
 * client view share it.
 */

type Named = { label: string | null; sex?: ToiletSex | null; venue: { name: string; type: VenueType } };

/** The import's generic name, or an "Other" place with no label to tell its toilets apart. */
export function isUnnamed(t: Named): boolean {
  return /^public (toilets?|restrooms?)$/i.test(t.venue.name.trim()) || (t.venue.type === "OTHER" && !t.label);
}

/** "120 m from Tampines MRT" → "near Tampines MRT", for titles where the metres would date. */
export function nearPhrase(near: string): string {
  const from = /\bfrom\s+(.+)$/i.exec(near);
  if (from) return `near ${from[1]}`;
  return /^near\b/i.test(near) ? near : `near ${near}`;
}

/**
 * "Public toilet near Tampines MRT" when unnamed and `near` is known; otherwise the usual "Venue (label)",
 * with who it's for when known: "Outram Park (Women's · DTL side)".
 */
export function toiletDisplayTitle(t: Named & { near?: string | null }): string {
  const tag = toiletTag(t);
  const base = tag ? `${t.venue.name} (${tag})` : t.venue.name;
  return isUnnamed(t) && t.near ? `${base} ${nearPhrase(t.near)}` : base;
}

/**
 * The page title (before the site name): with toilets on several floors, which floor this one is
 * and the others ("Jewel: L3 (also B1, L1)"). The server page's metadata and a toilet swapped in
 * on the client both use it.
 */
export function toiletPageTitle(
  t: Named & { near?: string | null; level: string | null; siblings?: { level: string | null }[] | null },
): string {
  const name = toiletDisplayTitle(t);
  const here = levelShort(t.level);
  const others = [...new Set((t.siblings ?? []).flatMap((s) => levelParts(s.level)))].filter((l) => !levelParts(t.level).includes(l));
  if (!others.length) return name;
  return here ? `${name}: ${here} (also ${others.join(", ")})` : `${name} (toilets on ${others.join(", ")})`;
}
