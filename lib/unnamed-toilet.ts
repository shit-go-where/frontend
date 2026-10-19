import type { VenueType } from "./api/types";

/*
 * Many open-data toilets come in with no name of their own: the import calls the place "Public
 * toilet". A page full of those says nothing about where you'd be going, so they borrow the API's
 * `near` line ("120 m from Tampines MRT"). Plain module, so the server page (metadata) and the
 * client view share it.
 */

type Named = { label: string | null; venue: { name: string; type: VenueType } };

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

/** "Public toilet near Tampines MRT" when unnamed and `near` is known; otherwise the usual "Venue (label)". */
export function toiletDisplayTitle(t: Named & { near?: string | null }): string {
  const base = t.label ? `${t.venue.name} (${t.label})` : t.venue.name;
  return isUnnamed(t) && t.near ? `${base} ${nearPhrase(t.near)}` : base;
}
