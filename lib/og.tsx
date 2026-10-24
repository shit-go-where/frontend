/*
 * Share-card pieces for the opengraph-image routes (next/og, rendered by Satori, not the browser).
 * Satori can't read CSS variables or the app's woff2 fonts, so the brand colours are repeated
 * here as literal hex from the dark theme (DESIGN.md: the chocolate look is the brand) and the
 * text uses next/og's bundled sans. Keep in step with globals.css and components/logo.tsx.
 */

export const OG_SIZE = { width: 1200, height: 630 };

export const OG = {
  ground: "#1e120b",
  surface: "#352114",
  line: "#6e4a32",
  cream: "#fff1e0",
  toffee: "#d4b597",
  pink: "#ff8cc2",
  pinkInk: "#3b0d22",
  caramel: "#f0a85e",
  caramelInk: "#2a1508",
  gold: "#ffc46b",
  mint: "#5ee0bd",
  /** Broken Red, for closed and under renovation. */
  red: "#ff7a6b",
  /** Wet-Floor Yellow, for pending review. */
  yellow: "#ffd76b",
} as const;

/*
 * The share card's verdict word, from the 0-10 cleanliness score (the same scale the toilet page
 * shows as "8.5/10"). Framing only: the score itself is always printed beside it in plain numbers.
 * Thresholds, picked against the March 2024 pilot's scores (median about 8) and the review mapping
 * (1-5 stars become 2-10, so 4 stars = 8 and 3 stars = 6). With both 2024 surveys in (median 6.7):
 *   8 and up   "Shiok!"   (4-5 star territory; about 46% of surveyed toilets)
 *   6 to < 8   "Can lah"  (fine, nothing to write home about; about 20%)
 *   below 6    "Aiyo"     (bring your own tissue; about 34%, was under a tenth of the pilot)
 * No score, no verdict: we never guess.
 */
export function ogVerdict(score: number | null | undefined): string | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  if (score >= 8) return "Shiok!";
  if (score >= 6) return "Can lah";
  return "Aiyo";
}

const DAY_MS = 86_400_000;

/**
 * "Last verified 3 days ago", at day resolution: chat apps keep a card for days, so "5 minutes ago"
 * would soon be wrong. Same words as lastVerifiedText in components/toilet-bits.tsx, which is a client
 * module and can't be imported here.
 */
export function ogVerifiedText(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "Never verified in person";
  const days = Math.floor((now - new Date(iso).getTime()) / DAY_MS);
  if (Number.isNaN(days)) return "Never verified in person";
  const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  const when =
    days < 1
      ? "today"
      : days < 2
        ? "yesterday"
        : days < 14
          ? ago(days, "day")
          : days < 60
            ? ago(Math.floor(days / 7), "week")
            : days < 730
              ? ago(Math.floor(days / 30), "month")
              : ago(Math.floor(days / 365), "year");
  return `Last verified ${when}`;
}

/** A plain fact chip (a feature), in fudge with the chocolate line, like the app's feature chips. */
export function OgChip({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "6px 22px",
        borderRadius: 999,
        background: OG.surface,
        border: `3px solid ${OG.line}`,
        color: OG.cream,
        fontSize: 30,
      }}
    >
      {children}
    </div>
  );
}

/** The verdict as a tilted candy-pink sticker with a cream die-cut rim, like the app's medals. */
export function OgSticker({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "6px 26px 10px",
        borderRadius: 999,
        background: OG.pink,
        color: OG.pinkInk,
        border: `5px solid ${OG.cream}`,
        fontSize: 48,
        letterSpacing: -1,
        transform: "rotate(-6deg)",
        boxShadow: "0 6px 0 rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </div>
  );
}

/** The toilet-roll map pin, same paths as components/logo.tsx. */
export function OgLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <path d="M32 3C19.3 3 9 13 9 25.6 9 42 32 61 32 61s23-19 23-35.4C55 13 44.7 3 32 3Z" fill="#8a4b23" />
      <path d="M20 21v15a12 6 0 0 0 24 0V21Z" fill="#fff1e0" />
      <path d="M38 40.5h6V49l-3-2-3 2Z" fill="#fff1e0" />
      <ellipse cx="32" cy="21" rx="12" ry="6" fill="#f0d6b8" />
      <ellipse cx="32" cy="21" rx="4" ry="2.2" fill="#d9934f" />
    </svg>
  );
}

/** The card's frame: chocolate ground, a candy-pink band along the bottom edge. */
export function OgFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: OG.ground,
        color: OG.cream,
        borderBottom: `16px solid ${OG.pink}`,
        padding: "64px 72px",
      }}
    >
      {children}
    </div>
  );
}
