"use client";

/*
 * A building's toilets on the map. Malls and stations list toilets on several floors at (nearly) one
 * coordinate, so past clustering their pins would sit on top of each other with only the top one
 * reachable. Here they become a stack of rolls, one per floor; a tall stack folds into one roll that
 * fans out on tap. The floor picker dims every pin not on the chosen floor.
 */
import { useEffect, useRef } from "react";
import type { ToiletPin } from "@/lib/api/types";
import { compareLevelOrder, distinctLevels, levelOrder, levelParts, levelShort } from "@/lib/level";
import { PinGlyph, tierPinVariant } from "../pin";
import { cx } from "../ui";

/** Same venue and this close together: one stack. Matches the duplicate guard's radius. */
export const STACK_RADIUS_M = 15;
/** Rolls in a stack, in css px: the glyph, and how far each roll sits above the one below. */
const ROLL_PX = 34;
const STEP_PX = 22;
/** Taller than this, or more rolls than this, and the stack folds into one roll that fans out. */
const MAX_STACK_PX = 140;
const MAX_STACK_ROLLS = 4;
/** Dimmed by the floor picker: a little fainter than the filters' stale-pins dim. */
export const OFF_FLOOR_OPACITY = 0.3;

export interface PinStack {
  key: string;
  lat: number;
  lng: number;
  /** Bottom to top: lowest level first, unknown levels last (on top). */
  pins: ToiletPin[];
}

/** Flat-earth metres, fine over a few dozen metres. */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

const byLevel = (a: ToiletPin, b: ToiletPin) =>
  compareLevelOrder(a.levelOrder, b.levelOrder) || (a.level ?? "").localeCompare(b.level ?? "") || a.id.localeCompare(b.id);

/**
 * ACTIVE pins of one venue within 15 m of each other (chained, so three toilets 10 m apart are one
 * stack). Pins at the same venue but further apart stay separate pins. Pins without a venueId (saved
 * offline before levels came in) never stack.
 */
export function stacksOf(pins: ToiletPin[]): PinStack[] {
  const byVenue = new Map<string, ToiletPin[]>();
  for (const p of pins) {
    if (p.status !== "ACTIVE" || !p.venueId) continue;
    const list = byVenue.get(p.venueId);
    if (list) list.push(p);
    else byVenue.set(p.venueId, [p]);
  }
  const out: PinStack[] = [];
  for (const [venueId, list] of byVenue) {
    if (list.length < 2) continue;
    // Union-find over pairs within the radius; a venue holds a handful of toilets.
    const parent = list.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (metres(list[i], list[j]) <= STACK_RADIUS_M) parent[find(i)] = find(j);
      }
    }
    const groups = new Map<number, ToiletPin[]>();
    list.forEach((p, i) => {
      const root = find(i);
      groups.set(root, [...(groups.get(root) ?? []), p]);
    });
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const sorted = [...g].sort(byLevel);
      out.push({
        key: `${venueId}:${sorted.map((p) => p.id).sort()[0]}`,
        // The bottom roll's own spot, so the stack stands where the lowest toilet is.
        lat: sorted[0].lat,
        lng: sorted[0].lng,
        pins: sorted,
      });
    }
  }
  return out;
}

/** Whether a stack is drawn folded (one roll with a count) rather than as its rolls. */
export function folds(stack: PinStack): boolean {
  return stack.pins.length > MAX_STACK_ROLLS || ROLL_PX + (stack.pins.length - 1) * STEP_PX > MAX_STACK_PX;
}

/** ";B1;L3;" for "B1; L3": what the floor picker's opacity expression looks a floor up in. */
export function floorsKey(level: string | null | undefined): string {
  const parts = levelParts(level).filter((p) => levelOrder(p) !== null);
  return parts.length ? `;${parts.join(";")};` : "";
}

/** Whether a pin is on the picked floor ("B1; L3" is on both). No floor picked: every pin is. */
export function onFloor(level: string | null | undefined, floor: string | null): boolean {
  return !floor || floorsKey(level).includes(`;${floor};`);
}

/** The distinct floors of some pins, top floor first, for the picker. */
export function floorsOf(pins: ToiletPin[]): { level: string; order: number }[] {
  return distinctLevels(pins).reverse();
}

/** How far from its spot a fanned-out stack reaches, in css px: the ring plus a leg's roll and tag. */
export function spiderReach(stack: PinStack): number {
  return spiderRadius(stack.pins.length) + 34;
}

function spiderRadius(n: number): number {
  // Roomier as it fills: neighbours' rolls (34 px plus their tags) shouldn't touch.
  return Math.max(64, (n * 44) / (2 * Math.PI));
}

/** What a roll says out loud, naming its floor. */
export function rollLabel(p: Pick<ToiletPin, "level">): string {
  const short = levelShort(p.level);
  return short ? `Toilet on ${short}` : "Toilet, level unknown";
}

function IssueDot({ className }: { className?: string }) {
  return (
    <span
      className={cx("absolute size-2.5 rounded-full border-2 border-surface bg-danger", className)}
      aria-hidden
    />
  );
}

function LevelTag({ level, className }: { level: string | null; className?: string }) {
  return (
    <span
      className={cx(
        "pointer-events-none whitespace-nowrap rounded-full border border-border bg-surface px-1.5 text-[11px] font-extrabold leading-4 text-fg shadow-sm tabular-nums",
        className,
      )}
      aria-hidden
    >
      {levelShort(level) ?? "?"}
    </span>
  );
}

/**
 * A stack drawn as its rolls, lowest floor at the bottom: each roll is its own button, so the toilet
 * underneath is one tap away instead of hidden under its neighbour.
 */
export function StackRolls({
  stack,
  dim,
  floor,
  selectedId,
  onSelect,
}: {
  stack: PinStack;
  dim: boolean;
  floor: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const height = ROLL_PX + (stack.pins.length - 1) * STEP_PX;
  return (
    <div
      role="group"
      aria-label={`${stack.pins.length} toilets stacked here, one per level`}
      className="pin-pop relative"
      style={{ width: ROLL_PX, height }}
      data-testid="pin-stack"
    >
      {stack.pins.map((p, i) => {
        const faded = dim || !onFloor(p.level, floor);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            aria-label={rollLabel(p)}
            aria-pressed={p.id === selectedId}
            className={cx(
              "group absolute left-0 flex items-start transition-[opacity,transform] duration-200 active:scale-95",
              faded && "opacity-35",
            )}
            // Upper rolls sit in front, so a lower roll is tapped on the slice of it that shows.
            style={{ bottom: i * STEP_PX, zIndex: i + 1, width: ROLL_PX, height: ROLL_PX }}
          >
            <span className="relative flex">
              <PinGlyph
                variant={tierPinVariant(p.tier)}
                className={cx(
                  "size-[34px] drop-shadow-[0_2px_2px_rgb(10_5_2/0.5)]",
                  p.id === selectedId && "scale-110 drop-shadow-[0_0_3px_var(--primary)]",
                )}
              />
              {/* Low on the roll's left, where the roll above doesn't cover it (the tag takes the right). */}
              {p.hasIssue ? <IssueDot className="-left-1 top-[15px]" /> : null}
            </span>
            <LevelTag level={p.level} className="absolute left-[calc(100%-2px)] top-1.5" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * A stack too tall to draw: one roll with a count. Tapping it fans the floors out in a ring around
 * the spot, each joined to it by a short line. Escape, a tap elsewhere or moving the map folds it.
 */
export function FoldedStack({
  stack,
  open,
  dim,
  floor,
  selectedId,
  onToggle,
  onSelect,
}: {
  stack: PinStack;
  open: boolean;
  dim: boolean;
  floor: string | null;
  selectedId: string | null;
  onToggle: (open: boolean) => void;
  onSelect: (id: string) => void;
}) {
  const n = stack.pins.length;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const levels = new Set(stack.pins.map((p) => levelShort(p.level)).filter(Boolean)).size;
  const radius = spiderRadius(n);
  const lead = stack.pins.find((p) => p.tier === "VERIFIED") ?? stack.pins[0];
  const anyIssue = stack.pins.some((p) => p.hasIssue);
  const faded = dim || !stack.pins.some((p) => onFloor(p.level, floor));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onToggle(false);
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onToggle]);

  // Legs start at the top and go round clockwise, lowest floor first.
  const legs = stack.pins.map((p, i) => {
    const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    return { p, x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });

  return (
    <div className="relative" style={{ width: 40, height: 40 }} data-testid="pin-stack-folded">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => onToggle(!open)}
        aria-expanded={open}
        aria-label={
          open
            ? `Hide the ${n} toilets stacked here`
            : `${n} toilets stacked here${levels > 1 ? ` on ${levels} levels` : ""}, show them`
        }
        className={cx(
          "pin-pop relative flex transition-[opacity,transform] duration-200 active:scale-95",
          faded && !open && "opacity-35",
        )}
      >
        <PinGlyph variant={tierPinVariant(lead.tier)} className="size-10 drop-shadow-[0_3px_3px_rgb(10_5_2/0.55)]" />
        <span className="absolute -right-2 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-tier px-1 text-[11px] font-extrabold text-tier-fg tabular-nums">
          {n}
        </span>
        {anyIssue ? <IssueDot className="-left-0.5 top-0" /> : null}
      </button>
      {open ? (
        // The ring is centred on the spot itself: the bottom of the folded roll.
        <div className="absolute left-1/2 top-full" role="group" aria-label={`${n} toilets at this spot, by level`}>
          <svg
            className="pointer-events-none absolute overflow-visible"
            width="1"
            height="1"
            aria-hidden
            focusable="false"
          >
            {legs.map(({ p, x, y }) => (
              <line key={p.id} x1={0} y1={0} x2={x} y2={y} stroke="var(--fg)" strokeOpacity={0.55} strokeWidth={1.5} />
            ))}
            <circle r={3.5} fill="var(--fg)" />
          </svg>
          {legs.map(({ p, x, y }) => {
            const off = dim || !onFloor(p.level, floor);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                aria-label={rollLabel(p)}
                aria-pressed={p.id === selectedId}
                className={cx(
                  "rise-in absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-opacity duration-200 active:scale-95",
                  off && "opacity-35",
                )}
                style={{ left: x, top: y }}
              >
                <span className="relative flex">
                  <PinGlyph variant={tierPinVariant(p.tier)} className="size-8 drop-shadow-[0_2px_2px_rgb(10_5_2/0.5)]" />
                  {p.hasIssue ? <IssueDot className="-right-0.5 top-0" /> : null}
                </span>
                <LevelTag level={p.level} className="-mt-1" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Google Maps' indoor floor control: the floors of the buildings in view, top floor first, and All.
 * Choosing a floor dims the pins on the others (they stay tappable). Arrow keys move between floors.
 */
export function FloorPicker({
  floors,
  value,
  onChange,
  style,
}: {
  floors: { level: string; order: number }[];
  value: string | null;
  onChange: (level: string | null) => void;
  style?: React.CSSProperties;
}) {
  const options: (string | null)[] = [...floors.map((f) => f.level), null];
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = options.indexOf(value);
    const next = options[(i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length];
    onChange(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-floor="${next ?? "all"}"]`)?.focus();
  };
  return (
    <div
      role="group"
      aria-label="Floor"
      onKeyDown={onKeyDown}
      className="no-scrollbar rise-in absolute left-3 z-10 flex w-11 flex-col overflow-y-auto rounded-2xl border-2 border-border bg-surface shadow-card"
      style={style}
      data-testid="floor-picker"
    >
      {options.map((level) => {
        const on = value === level;
        return (
          <button
            key={level ?? "all"}
            type="button"
            data-floor={level ?? "all"}
            aria-pressed={on}
            aria-label={level ? `Show toilets on ${level}` : "Show toilets on all floors"}
            onClick={() => onChange(level)}
            className={cx(
              "flex min-h-10 shrink-0 items-center justify-center text-sm font-extrabold tabular-nums transition-colors duration-150",
              on ? "bg-primary text-primary-fg" : "text-fg hover:bg-surface-2",
              !level && "border-t border-border text-xs",
            )}
          >
            {level ?? "All"}
          </button>
        );
      })}
    </div>
  );
}

/** Level tag images for the single-pin label layer, drawn like the pins (MapLibre text needs a glyph server). */
export function drawLevelLabel(text: string, dark: boolean): { image: ImageData; width: number } | null {
  if (typeof document === "undefined") return null;
  const scale = 2;
  const font = `800 ${11 * scale}px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  const padX = 5 * scale;
  const h = 16 * scale;
  const w = Math.ceil(ctx.measureText(text).width + padX * 2);
  canvas.width = w + 2 * scale;
  canvas.height = h + 2 * scale;
  ctx.font = font;
  // Colours as the pins' (ToiletMap PIN_COLORS): surface pill, ink text, a hairline rim.
  const c = dark
    ? { pill: "#352114", ink: "#fff1e0", rim: "rgba(255, 241, 224, 0.35)" }
    : { pill: "#fff5ea", ink: "#2a160b", rim: "rgba(42, 22, 11, 0.3)" };
  const x = scale;
  const y = scale;
  const r = h / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = c.pill;
  ctx.fill();
  ctx.lineWidth = scale;
  ctx.strokeStyle = c.rim;
  ctx.stroke();
  ctx.fillStyle = c.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + scale * 0.5);
  return { image: ctx.getImageData(0, 0, canvas.width, canvas.height), width: canvas.width };
}

/** The tag text for a pin: "B1", "L3", "B1, L3"; long free text is cut short. */
export function labelText(level: string | null | undefined): string | null {
  const s = levelShort(level);
  if (!s) return null;
  return s.length > 10 ? `${s.slice(0, 9)}…` : s;
}
