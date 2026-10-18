// Motion tokens for code that animates from JS. The CSS side lives in globals.css (@theme --ease-*,
// :root --dur-*); keep the two in step.

/** Confident arrivals: cards, pins, the FLIP list, celebrations. */
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
/** The bottom sheet's settle: a quick start that glides to rest. The map pans on the same curve. */
export const EASE_SHEET = "cubic-bezier(0.32, 0.72, 0, 1)";

export const DUR = {
  enter: 260,
  move: 320,
  sheet: 380,
} as const;

/** Folds (details, filtered lists): taller ones take a little longer, so a long fold doesn't snap and a short one doesn't dawdle. Closing runs at 3/4 of this. */
export function foldMs(px: number) {
  return Math.round(Math.min(380, 220 + px / 12));
}

/** Stored choice; "system" (the default) follows the device. */
export type MotionPref = "system" | "reduce" | "full";
export const MOTION_KEY = "sgw:motion";

/**
 * Inline in <head> next to the theme script so the choice applies before first paint.
 * Only an override needs the attribute; CSS falls back to the media query.
 */
export const MOTION_BOOT_SCRIPT = `try{var m=localStorage.getItem("${MOTION_KEY}");if(m==="reduce"||m==="full")document.documentElement.dataset.motion=m}catch(e){}`;

export function getMotionPref(): MotionPref {
  try {
    const m = localStorage.getItem(MOTION_KEY);
    return m === "reduce" || m === "full" ? m : "system";
  } catch {
    return "system";
  }
}

export function setMotionPref(pref: MotionPref) {
  try {
    if (pref === "system") localStorage.removeItem(MOTION_KEY);
    else localStorage.setItem(MOTION_KEY, pref);
  } catch {
    /* ignore */
  }
  const el = document.documentElement;
  if (pref === "system") delete el.dataset.motion;
  else el.dataset.motion = pref;
}

/** The in-app choice wins; otherwise the device setting. Same rule as the CSS `motion-reduce` variant. */
export function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const m = document.documentElement.dataset.motion;
  if (m === "reduce") return true;
  if (m === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Camera options for MapLibre: it honours the device setting on its own, so only the
 * in-app override needs saying (skip the animation, or mark it essential to keep it).
 */
export function cameraMotion(): { duration?: number; essential?: boolean } {
  const m = typeof document === "undefined" ? undefined : document.documentElement.dataset.motion;
  if (m === "reduce") return { duration: 0 };
  if (m === "full") return { essential: true };
  return {};
}

/** A CSS cubic-bezier as a JS easing function, for APIs that take one (MapLibre). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bx = (s: number) => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
  const by = (s: number) => 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Bisection: x(s) is monotonic for any valid CSS curve, and 24 steps is sub-pixel.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (bx(mid) < t) lo = mid;
      else hi = mid;
    }
    return by((lo + hi) / 2);
  };
}

export const easeSheet = cubicBezier(0.32, 0.72, 0, 1);
