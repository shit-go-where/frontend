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
} as const;

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
