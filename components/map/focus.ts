import type { ToiletTier } from "@/lib/api/types";

/**
 * The toilet the map should point out: one tapped on the map ("picked"), or one the
 * person is looking at in the list (hovered on desktop, the top card on phones).
 */
export interface MapFocus {
  id: string;
  lat: number;
  lng: number;
  tier: ToiletTier;
  pending: boolean;
  name: string;
  /** Formatted distance from the person, or "" when unknown. */
  distance: string;
  picked: boolean;
}
