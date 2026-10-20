import type { Metadata } from "next";

/** Shared links land here with ?utm_source=, ?src= or ?deleted=1: all the same page. */
export const metadata: Metadata = { alternates: { canonical: "/" } };

/**
 * The map itself is rendered by `PersistentHome` in the root layout, so it
 * survives tab switches; this route only has to exist.
 */
export default function Home() {
  return null;
}
