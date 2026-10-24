"use client";

/*
 * A building's toilets on the map. Malls and stations list toilets on several floors at (nearly) one
 * coordinate, so past clustering their pins would sit on top of each other with only the top one
 * reachable. Here they become a stack of rolls, one per floor; a tall stack folds into one roll that
 * fans out on tap, by floor when it spans several. The floor picker narrows a stack to the chosen floor
 * and dims every other pin not on it.
 */
import { useEffect, useRef } from "react";
import type { SexPreference, ToiletPin } from "@/lib/api/types";
import { sexLabel } from "@/lib/format";
import { compareLevelOrder, distinctLevels, floorGroups, floorsKey, levelShort, onFloor } from "@/lib/level";
import { sexRank } from "@/lib/sex-order";
import { PinGlyph, tierPinVariant } from "../pin";
import { cx } from "../ui";

export { floorsKey, onFloor };

/** This close together: one stack, whichever places they belong to. Matches the duplicate guard's radius. */
export const STACK_RADIUS_M = 15;
/** Rolls in a stack, in css px: the glyph, and how far each roll sits above the one below. */
const ROLL_PX = 34;
/** Every roll and its tag is one tap target at least this big each way (the app's 44 px rule). */
const TARGET_PX = 44;
const STEP_PX = TARGET_PX;
/** More rolls than this and the stack folds into one roll that fans out (four would stand 176 px tall). */
export const MAX_STACK_ROLLS = 3;
/** A fan of more than this many doesn't fit on a phone: the stack opens as a list instead. */
export const MAX_SPIDER_LEGS = 12;
/** Dimmed by the floor picker: a little fainter than the filters' stale-pins dim. */
export const OFF_FLOOR_OPACITY = 0.3;

export interface PinStack {
  key: string;
  lat: number;
  lng: number;
  /** Bottom to top: lowest level first, unknown levels last (on top). */
  pins: ToiletPin[];
  /** The place they're all at; null when the stack spans several (a block's coffee shops, a mall's interchange). */
  venueId: string | null;
}

/** Flat-earth metres, fine over a few dozen metres. */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

const toilets = (n: number) => `${n} toilet${n === 1 ? "" : "s"}`;

/**
 * Lowest floor first; on one floor, a place's toilets together, then the toilets they use first, then unisex
 * (lib/sex-order.ts). No preference: men's, women's, then unisex, the way they usually sit side by side.
 */
const byLevel = (pref: SexPreference | null) => (a: ToiletPin, b: ToiletPin) =>
  compareLevelOrder(a.levelOrder, b.levelOrder) ||
  (a.level ?? "").localeCompare(b.level ?? "") ||
  (a.venueId ?? "").localeCompare(b.venueId ?? "") ||
  sexRank(a.sex, pref) - sexRank(b.sex, pref) ||
  a.id.localeCompare(b.id);

/**
 * ACTIVE pins within 15 m of each other (chained, so three toilets 10 m apart are one stack), whichever places
 * they belong to: two coffee shops in one HDB block share a postcode and so a coordinate, and a bus interchange
 * sits inside its mall. Pins further apart stay separate pins. Pins without a venueId (saved offline before
 * levels came in) never stack.
 */
export function stacksOf(pins: ToiletPin[], pref: SexPreference | null = null): PinStack[] {
  const list = pins.filter((p) => p.status === "ACTIVE" && !!p.venueId);
  if (list.length < 2) return [];
  // A grid of cells one radius across, so each pin is only measured against its neighbours' cells.
  const latCell = STACK_RADIUS_M / 111_320;
  const lngCell = latCell / Math.cos((list[0].lat * Math.PI) / 180);
  const cellKey = (a: number, b: number) => `${a},${b}`;
  const cells = new Map<string, number[]>();
  const at = list.map((p, i) => {
    const c = [Math.floor(p.lat / latCell), Math.floor(p.lng / lngCell)] as const;
    const k = cellKey(c[0], c[1]);
    cells.set(k, [...(cells.get(k) ?? []), i]);
    return c;
  });
  // Union-find over pairs within the radius.
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  list.forEach((p, i) => {
    for (let da = -1; da <= 1; da++) {
      for (let db = -1; db <= 1; db++) {
        for (const j of cells.get(cellKey(at[i][0] + da, at[i][1] + db)) ?? []) {
          if (j > i && metres(p, list[j]) <= STACK_RADIUS_M) parent[find(i)] = find(j);
        }
      }
    }
  });
  const groups = new Map<number, ToiletPin[]>();
  list.forEach((p, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), p]);
  });
  const out: PinStack[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const sorted = [...g].sort(byLevel(pref));
    // The lowest toilet's own spot, whoever it's for, so a new preference never moves the stack.
    const anchor = pref ? [...g].sort(byLevel(null))[0] : sorted[0];
    const venues = [...new Set(g.map((p) => p.venueId))].sort();
    out.push({
      key: `${venues.join("+")}:${sorted.map((p) => p.id).sort()[0]}`,
      lat: anchor.lat,
      lng: anchor.lng,
      pins: sorted,
      venueId: venues.length === 1 ? venues[0] : null,
    });
  }
  return out;
}

/** How many places a stack's toilets belong to. */
export function placesIn(stack: Pick<PinStack, "pins">): number {
  return new Set(stack.pins.map((p) => p.venueId)).size;
}

/** Whether a stack is drawn folded (one roll with a count) rather than as its rolls. */
export function folds(stack: PinStack): boolean {
  return stack.pins.length > MAX_STACK_ROLLS;
}

/** The distinct floors of some pins, top floor first, for the picker. */
export function floorsOf(pins: ToiletPin[]): { level: string; order: number }[] {
  return distinctLevels(pins).reverse();
}

/** A leg of a fanned-out stack: one toilet, or every toilet on one floor. */
export interface FanLeg {
  key: string;
  /** The floor ("B1"); for a one-toilet leg, that toilet's level; null when not known. */
  level: string | null;
  pins: ToiletPin[];
}

export interface Fan {
  /** The legs are floors (the stack spans two or more), not toilets. */
  byFloor: boolean;
  legs: FanLeg[];
}

/**
 * How a folded stack fans out. Spanning two floors or more (and no floor picked), one leg per floor, top
 * floor first, those with no floor last: a 13-toilet mall is six legs, not a list. On one floor (or
 * narrowed to one by the picker), one leg per toilet in the stack's order: the toilets they use first.
 */
export function fanOf(stack: PinStack, floor: string | null): Fan {
  if (!floor && floorsOf(stack.pins).length >= 2) {
    // Several places: each place's floors, place by place, so a leg never mixes two places' toilets.
    const places = new Map<string, ToiletPin[]>();
    for (const p of stack.pins) places.set(p.venueId, [...(places.get(p.venueId) ?? []), p]);
    return {
      byFloor: true,
      legs: [...places].flatMap(([venueId, pins]) =>
        floorGroups(pins, true).map((g) => ({
          key: `${stack.venueId ? "" : `${venueId}:`}floor:${g.level ?? "?"}`,
          level: g.level,
          pins: g.items,
        })),
      ),
    };
  }
  return { byFloor: false, legs: stack.pins.map((p) => ({ key: p.id, level: p.level, pins: [p] })) };
}

/** How far from its spot a fan of `legs` reaches, in css px: the ring plus a leg's roll and tag. */
export function spiderReach(legs: number): number {
  return spiderRadius(legs) + TARGET_PX / 2 + 12;
}

function spiderRadius(n: number): number {
  /*
   * Each leg is a 44 px square target. Neighbours a chord of 44√2 apart can't overlap at any angle round
   * the ring, and 68 px keeps the top leg clear of the folded roll it fans out of.
   */
  return Math.max(68, (TARGET_PX * Math.SQRT2) / (2 * Math.sin(Math.PI / n)));
}

/**
 * What a roll says out loud, naming its floor and who it's for ("Women's toilet on L3"), and in a stack of
 * several places, which place ("Men's toilet at Kopi Corner, Blk 101").
 */
export function rollLabel(p: Pick<ToiletPin, "level" | "sex">, place?: string | null): string {
  const short = levelShort(p.level);
  const who = sexLabel(p.sex);
  const noun = who ? `${who} toilet` : "Toilet";
  if (place) return short ? `${noun} on ${short} at ${place}` : `${noun} at ${place}`;
  return short ? `${noun} on ${short}` : `${noun}, level unknown`;
}

/** In a stack of several places, the place of a toilet: its name once loaded, else what kind of place it is. */
export type PlaceOf = (p: ToiletPin) => string;

function IssueDot({ className }: { className?: string }) {
  return (
    <span
      className={cx("absolute size-2.5 rounded-full border-2 border-surface bg-danger", className)}
      aria-hidden
    />
  );
}

/**
 * A roll's tag: its floor, and who it's for when known ("Men's · L3"), since a men's and a unisex toilet on
 * one floor would otherwise read the same. A floor's leg says how many it holds instead ("B1 · 4").
 */
function LevelTag({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={cx(
        // A place's name can be long ("Coffee shop, Blk 101 Yishun Ave 5"): cut short on the map, said in full aloud.
        "pointer-events-none max-w-44 truncate whitespace-nowrap rounded-full border border-border bg-surface px-1.5 text-[11px] font-extrabold leading-4 text-fg shadow-sm tabular-nums",
        className,
      )}
      aria-hidden
    >
      {text}
    </span>
  );
}

const rollTag = (p: Pick<ToiletPin, "level" | "sex">, place?: string | null) => {
  const who = sexLabel(p.sex);
  // Several places: who it's for and where ("Men's · Kopi Corner"), its floor between them when known.
  if (place) return [who, levelShort(p.level), place].filter(Boolean).join(" · ");
  return `${who ? `${who} · ` : ""}${levelShort(p.level) ?? "?"}`;
};

/**
 * A stack drawn as its rolls, lowest floor at the bottom: each roll is its own button, so the toilet
 * underneath is one tap away instead of hidden under its neighbour. Each button is a full 44 px band
 * holding the roll and its level tag, so no roll's target is a sliver under the one above. `only` is the
 * floor the picker narrowed it to (the rolls are that floor's toilets).
 */
export function StackRolls({
  stack,
  only = null,
  dim,
  floor,
  selectedId,
  onSelect,
  placeOf,
}: {
  stack: PinStack;
  only?: string | null;
  dim: boolean;
  floor: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Set for a stack of several places (stack.venueId null): each roll names its place. */
  placeOf?: PlaceOf;
}) {
  const n = stack.pins.length;
  const height = n * STEP_PX;
  const place = (p: ToiletPin) => (stack.venueId ? null : (placeOf?.(p) ?? null));
  // A picked floor can narrow a stack of several places to one place's toilets.
  const places = stack.venueId ? 1 : placesIn(stack);
  return (
    <div
      role="group"
      aria-label={
        places === 1
          ? only
            ? `${toilets(n)} on ${only}`
            : `${n} toilets stacked here, one per level`
          : `${toilets(n)}${only ? ` on ${only}` : ""} stacked here at ${places} places`
      }
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
            aria-label={rollLabel(p, place(p))}
            aria-pressed={p.id === selectedId}
            className={cx(
              "group absolute left-0 flex items-end transition-[scale,opacity] duration-200 active:scale-95",
              faded && "opacity-35",
            )}
            // The roll sits at the bottom of its band; the band's top is the gap to the roll above.
            style={{ bottom: i * STEP_PX, zIndex: i + 1, minWidth: TARGET_PX, height: STEP_PX }}
            data-testid="stack-roll"
          >
            <span className="relative flex shrink-0">
              <PinGlyph
                variant={tierPinVariant(p.tier)}
                className={cx(
                  "size-[34px] drop-shadow-[0_2px_2px_rgb(10_5_2/0.5)]",
                  p.id === selectedId && "scale-110 drop-shadow-[0_0_3px_var(--primary)]",
                )}
              />
              {/* Low on the roll's left (the tag takes the right). */}
              {p.hasIssue ? <IssueDot className="-left-1 top-[15px]" /> : null}
            </span>
            <LevelTag text={rollTag(p, place(p))} className="-ml-0.5 mb-[18px]" />
          </button>
        );
      })}
    </div>
  );
}

/** What a floor's leg says out loud: "4 toilets on B1" (in a stack of several places, "… at Bedok Mall"). */
function legLabel(leg: FanLeg, place: string | null): string {
  if (leg.pins.length === 1) return rollLabel(leg.pins[0], place);
  const short = levelShort(leg.level);
  const at = place ? ` at ${place}` : "";
  return short ? `${toilets(leg.pins.length)} on ${short}${at}` : `${toilets(leg.pins.length)}${at}, floor unknown`;
}

/**
 * A stack too tall to draw: one roll with a count. Tapping it fans out in a ring around the spot, each leg
 * joined to it by a short line: one leg per floor when it spans several (`fan`, from fanOf), else one per
 * toilet. A one-toilet leg picks that toilet; a floor's leg is handed to `onLeg`. Escape, a tap elsewhere
 * or moving the map folds it. `only` is the floor the picker narrowed it to.
 */
export function FoldedStack({
  stack,
  fan,
  only = null,
  open,
  dim,
  floor,
  selectedId,
  onToggle,
  onSelect,
  onLeg,
  placeOf,
}: {
  stack: PinStack;
  fan: Fan;
  only?: string | null;
  open: boolean;
  dim: boolean;
  floor: string | null;
  selectedId: string | null;
  onToggle: (open: boolean) => void;
  onSelect: (id: string) => void;
  onLeg: (leg: FanLeg) => void;
  /** Set for a stack of several places (stack.venueId null): each leg names its place. */
  placeOf?: PlaceOf;
}) {
  const n = stack.pins.length;
  const places = stack.venueId ? 1 : placesIn(stack);
  const place = (p: ToiletPin) => (stack.venueId ? null : (placeOf?.(p) ?? null));
  const toggleRef = useRef<HTMLButtonElement>(null);
  const levels = new Set(stack.pins.map((p) => levelShort(p.level)).filter(Boolean)).size;
  const radius = spiderRadius(fan.legs.length);
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

  // Legs start at the top and go round clockwise: top floor first, or the toilets they use first.
  const legs = fan.legs.map((leg, i) => {
    const a = -Math.PI / 2 + (i / fan.legs.length) * 2 * Math.PI;
    return { leg, x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });

  return (
    <div className="relative" style={{ width: TARGET_PX, height: TARGET_PX }} data-testid="pin-stack-folded">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => onToggle(!open)}
        aria-expanded={open}
        aria-label={
          open
            ? `Hide the ${n} toilets stacked here`
            : only
              ? `${toilets(n)} on ${only} stacked here${places > 1 ? ` at ${places} places` : ""}, show them`
              : `${n} toilets stacked here${places > 1 ? ` at ${places} places` : levels > 1 ? ` on ${levels} levels` : ""}, show them`
        }
        className={cx(
          "pin-pop relative flex size-11 items-end justify-center transition-[scale,opacity] duration-200 active:scale-95",
          faded && !open && "opacity-35",
        )}
      >
        <span className="relative flex">
          <PinGlyph variant={tierPinVariant(lead.tier)} className="size-10 drop-shadow-[0_3px_3px_rgb(10_5_2/0.55)]" />
          <span className="absolute -right-2 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-tier px-1 text-[11px] font-extrabold text-tier-fg tabular-nums">
            {n}
          </span>
          {anyIssue ? <IssueDot className="-left-0.5 top-0" /> : null}
        </span>
      </button>
      {open ? (
        // The ring is centred on the spot itself: the bottom of the folded roll.
        <div
          className="absolute left-1/2 top-full"
          role="group"
          aria-label={
            only && !fan.byFloor
              ? `${toilets(n)} on ${only}`
              : places > 1
                ? `${n} toilets at this spot, at ${places} places`
                : `${n} toilets at this spot, by level`
          }
        >
          <svg
            className="pointer-events-none absolute overflow-visible"
            width="1"
            height="1"
            aria-hidden
            focusable="false"
          >
            {legs.map(({ leg, x, y }) => (
              <line key={leg.key} x1={0} y1={0} x2={x} y2={y} stroke="var(--fg)" strokeOpacity={0.55} strokeWidth={1.5} />
            ))}
            <circle r={3.5} fill="var(--fg)" />
          </svg>
          {legs.map(({ leg, x, y }) => {
            const one = leg.pins.length === 1 ? leg.pins[0] : null;
            const legLead = leg.pins.find((p) => p.tier === "VERIFIED") ?? leg.pins[0];
            const off = dim || !leg.pins.some((p) => onFloor(p.level, floor));
            return (
              <button
                key={leg.key}
                type="button"
                onClick={() => (one ? onSelect(one.id) : onLeg(leg))}
                aria-label={legLabel(leg, place(leg.pins[0]))}
                aria-pressed={one ? one.id === selectedId : undefined}
                className={cx(
                  "rise-in absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center transition-opacity duration-200 active:scale-95",
                  off && "opacity-35",
                )}
                style={{ left: x, top: y, width: TARGET_PX, height: TARGET_PX }}
                data-testid="spider-leg"
              >
                <span className="relative flex">
                  <PinGlyph variant={tierPinVariant(legLead.tier)} className="size-8 drop-shadow-[0_2px_2px_rgb(10_5_2/0.5)]" />
                  {leg.pins.some((p) => p.hasIssue) ? <IssueDot className="-right-0.5 top-0" /> : null}
                </span>
                <LevelTag
                  text={
                    one
                      ? rollTag(one, place(one))
                      : [`${levelShort(leg.level) ?? "?"} · ${leg.pins.length}`, place(leg.pins[0])].filter(Boolean).join(" · ")
                  }
                  className="-mt-1"
                />
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
 * Choosing a floor narrows a building's stacks (and the sheet's list of it) to that floor, and dims the
 * other single pins (they stay tappable). Arrow keys move between floors.
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
