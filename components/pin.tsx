import { cx } from "./styles";

/** The logo's map-pin outline (64 × 64 artboard). Shared with the MapLibre pin images. */
export const PIN_PATH = "M32 3C19.3 3 9 13 9 25.6 9 42 32 61 32 61s23-19 23-35.4C55 13 44.7 3 32 3Z";
/** Toilet roll inside the pin: body, tail, top face, core. */
export const ROLL_BODY = "M20 21v15a12 6 0 0 0 24 0V21Z";
export const ROLL_TAIL = "M38 40.5h6V49l-3-2-3 2Z";

export type PinVariant = "verified" | "community" | "imported" | "pending" | "destination" | "picker";

const STYLES: Record<PinVariant, { pin: string; stroke: string; strokeWidth: number; roll: string; dash?: string }> = {
  verified: { pin: "var(--tier)", stroke: "var(--bg)", strokeWidth: 3, roll: "var(--tier-fg)" },
  community: { pin: "var(--surface)", stroke: "var(--tier)", strokeWidth: 5, roll: "var(--tier)" },
  imported: { pin: "var(--pin-imported)", stroke: "var(--pin-imported-ink)", strokeWidth: 2, roll: "var(--poo)" },
  pending: { pin: "var(--surface)", stroke: "var(--warn)", strokeWidth: 4, roll: "var(--warn)", dash: "6 5" },
  destination: { pin: "var(--urgent)", stroke: "var(--bg)", strokeWidth: 3, roll: "var(--urgent-fg)" },
  picker: { pin: "var(--primary)", stroke: "var(--bg)", strokeWidth: 3, roll: "var(--primary-fg)" },
};

/** Toilet-roll map pin, the system's core mark. Fill encodes tier (DESIGN.md, The Honest Pin Rule). */
export function PinGlyph({ variant, className, title }: { variant: PinVariant; className?: string; title?: string }) {
  const s = STYLES[variant];
  return (
    <svg
      viewBox="0 0 64 64"
      className={cx("shrink-0 overflow-visible", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      focusable="false"
    >
      <path
        d={PIN_PATH}
        fill={s.pin}
        stroke={s.stroke}
        strokeWidth={s.strokeWidth}
        strokeDasharray={s.dash}
        strokeLinejoin="round"
      />
      <path d={ROLL_BODY} fill={s.roll} />
      <path d={ROLL_TAIL} fill={s.roll} />
      <ellipse cx="32" cy="21" rx="12" ry="6" fill={s.pin} stroke={s.roll} strokeWidth="2.5" />
      <ellipse cx="32" cy="21" rx="3.5" ry="1.8" fill={s.roll} />
    </svg>
  );
}

export function tierPinVariant(tier: "VERIFIED" | "COMMUNITY" | "IMPORTED", pending?: boolean): PinVariant {
  if (pending) return "pending";
  return tier === "VERIFIED" ? "verified" : tier === "COMMUNITY" ? "community" : "imported";
}
