import { cx } from "./styles";

/**
 * A progress bar as unrolling toilet paper: a cream strip of perforated sheets pulled from a roll at
 * the start, along a dotted floor. The perforations double as a scale, and the roll turns as more
 * paper comes off (a transition, never a loop). The roll's core carries the bar's colour (an MRT
 * line on the passport, Candy Pink on the leaderboard), so the paper itself stays paper.
 *
 * Purely visual: give it role="progressbar" and its aria values, or aria-hidden next to a text count.
 */
export function TpBar({
  value,
  max,
  core = "var(--primary)",
  size = "md",
  className,
  ...rest
}: {
  value: number;
  max: number;
  /** CSS colour for the roll's core. */
  core?: string;
  size?: "sm" | "md";
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const k = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const s = size === "sm" ? { roll: 16, strip: 8, sheet: 10 } : { roll: 24, strip: 12, sheet: 14 };
  const r = s.roll / 2;
  return (
    <span
      // Holds its own height (the roll's); pass flex-1 where it should stretch along a row.
      className={cx("relative block min-w-0 shrink-0", className)}
      style={{ height: s.roll, "--sheet": `${s.sheet}px` } as React.CSSProperties}
      {...rest}
    >
      {/* The floor the paper unrolls along. */}
      <span
        aria-hidden
        className="absolute right-0 top-1/2 -translate-y-1/2 border-t-2 border-dotted border-border-strong/70"
        style={{ left: r }}
      />
      {/* The paper: starts under the roll's middle and runs out to the value. */}
      <span
        aria-hidden
        className="tp-sheets absolute top-1/2 -translate-y-1/2 rounded-r-[3px] transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ left: r, height: s.strip, width: `calc((100% - ${r}px) * ${k})` }}
      />
      {/* The roll, with a seam so its turn shows. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 flex items-center justify-center rounded-full bg-rim shadow-gloss ring-2 ring-border-strong transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ width: s.roll, height: s.roll, transform: `rotate(${Math.round(k * 540)}deg)` }}
      >
        <span className="absolute left-1/2 top-0.5 h-[calc(50%-2px)] w-[1.5px] -translate-x-1/2 rounded-full bg-border-strong/80" />
        <span className="relative rounded-full ring-1 ring-poo-ink/40" style={{ width: s.roll * 0.42, height: s.roll * 0.42, background: core }} />
      </span>
    </span>
  );
}
