"use client";

/**
 * Opening a toilet from a card: the card hands its venue name to the detail page, so the
 * page's loading state shows the real heading where the skeleton bar would be.
 */

/** A hand-off older than this is from some earlier tap. */
const FRESH_MS = 2500;

let handoff: { id: string; name: string; at: number } | null = null;

/** A card was tapped. */
export function openFromCard(id: string, venueName: string) {
  handoff = { id, name: venueName, at: Date.now() };
}

/** The toilet a card just opened, while the tap is fresh. */
export function arriving(): { id: string; name: string } | null {
  return handoff && Date.now() - handoff.at < FRESH_MS ? { id: handoff.id, name: handoff.name } : null;
}
