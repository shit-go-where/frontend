"use client";

import { createContext, useCallback, useContext, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { EASE_OUT, foldMs, reducedMotion } from "@/lib/motion";
import { cx } from "./styles";

/**
 * Whether list changes below fold (true) or apply at once (false), e.g. a filter read from the
 * URL on load, which shouldn't greet the visitor with half the page folding away.
 */
export const FoldMotion = createContext(true);

export interface PresenceEntry<T> {
  key: string;
  item: T;
  /** Added by this change: folds open on mount. */
  entering: boolean;
  /** Gone from the list: folds shut, then `exited(key)` drops it. */
  leaving: boolean;
}

/** Next items in order, with leaving ones kept where they were. Assumes a stable order, as filtering keeps. */
function merge<T>(prev: PresenceEntry<T>[], next: readonly T[], keyOf: (item: T) => string, animate: boolean) {
  const had = new Set(prev.map((e) => e.key));
  const has = new Set(next.map(keyOf));
  const out: PresenceEntry<T>[] = [];
  let i = 0;
  const take = (upTo?: string) => {
    while (i < next.length) {
      const item = next[i++];
      const key = keyOf(item);
      out.push({ key, item, entering: animate && !had.has(key), leaving: false });
      if (key === upTo) return;
    }
  };
  for (const e of prev) {
    if (has.has(e.key)) take(e.key);
    else if (animate) out.push({ ...e, entering: false, leaving: true });
  }
  take();
  return out;
}

/**
 * Keeps removed items rendered long enough to fold shut, and marks new ones to fold open.
 * `items` must keep its identity between renders when nothing changed (memoise it).
 * A leaving item that comes back mid-fold reopens from wherever it got to.
 */
export function usePresence<T>(items: readonly T[], keyOf: (item: T) => string) {
  const animate = useContext(FoldMotion);
  const [state, setState] = useState(() => ({
    items,
    entries: items.map((item) => ({ key: keyOf(item), item, entering: false, leaving: false })),
  }));
  let { entries } = state;
  if (state.items !== items) {
    // Derived during render (React's "adjust state when a prop changes"), so the fold starts in the same frame.
    entries = merge(state.entries, items, keyOf, animate);
    setState({ items, entries });
  }
  const exited = useCallback(
    (key: string) => setState((s) => ({ ...s, entries: s.entries.filter((e) => !(e.key === key && e.leaving)) })),
    [],
  );
  return { entries, exited };
}

/** Rows off screen by more than this just appear or vanish: nobody sees them move. */
const VIEW_MARGIN_PX = 80;

function onScreen(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.bottom > -VIEW_MARGIN_PX && r.top < window.innerHeight + VIEW_MARGIN_PX;
}

/**
 * One item of a presence list. Folds open from nothing when `entering`, and shut when `leaving`:
 * height and opacity together, like FoldDetails, so the rows around it close ranks instead of
 * jumping. Put margins and padding inside it; a box can't fold below its own padding.
 * Reduced motion: it fades, and the space closes at the end.
 */
export function Reveal({
  as: Tag = "div",
  entering = false,
  leaving = false,
  onExited,
  className,
  children,
  ...rest
}: {
  as?: "div" | "li" | "section" | "nav";
  entering?: boolean;
  leaving?: boolean;
  onExited?: () => void;
  className?: string;
  children: React.ReactNode;
} & Pick<React.HTMLAttributes<HTMLElement>, "id" | "aria-label" | "aria-labelledby" | "tabIndex">) {
  const ref = useRef<HTMLElement>(null);
  const anim = useRef<Animation | null>(null);
  const seen = useRef(false);

  const play = useEffectEvent((opening: boolean, first: boolean) => {
    const el = ref.current;
    if (!el) return;
    const done = () => {
      if (!opening) onExited?.();
    };
    // Where it is right now, mid-fold included, before the running fold is dropped.
    const fromHeight = first ? 0 : el.getBoundingClientRect().height;
    const fromOpacity = first ? 0 : anim.current ? Number(getComputedStyle(el).opacity) : 1;
    anim.current?.cancel();
    anim.current = null;
    el.style.overflow = "";
    if (!onScreen(el)) return done();

    if (reducedMotion()) {
      const a = el.animate([{ opacity: fromOpacity }, { opacity: opening ? 1 : 0 }], {
        duration: opening ? 150 : 120,
        easing: EASE_OUT,
        fill: opening ? "none" : "forwards",
      });
      anim.current = a;
      a.onfinish = () => {
        if (anim.current !== a) return;
        anim.current = null;
        done();
      };
      return;
    }

    const toHeight = opening ? el.offsetHeight : 0;
    const span = Math.max(fromHeight, toHeight);
    el.style.overflow = "hidden";
    const a = el.animate(
      [
        { height: `${fromHeight}px`, opacity: fromOpacity },
        { height: `${toHeight}px`, opacity: opening ? 1 : 0 },
      ],
      {
        duration: opening ? foldMs(span) : Math.round(foldMs(span) * 0.75),
        easing: EASE_OUT,
        // A shut fold stays shut until React removes it.
        fill: opening ? "none" : "forwards",
      },
    );
    anim.current = a;
    a.onfinish = () => {
      if (anim.current !== a) return;
      anim.current = null;
      el.style.overflow = "";
      done();
    };
  });

  useLayoutEffect(() => {
    const first = !seen.current;
    seen.current = true;
    if (first && !entering) return;
    play(!leaving, first && entering);
    // `entering` only matters on mount; later renders change `leaving` alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  useLayoutEffect(
    () => () => {
      anim.current?.cancel();
      // A remount (Strict Mode, Activity) is a first mount again, so an entering fold still opens.
      seen.current = false;
    },
    [],
  );

  return (
    <Tag ref={ref as never} className={className} {...rest}>
      {children}
    </Tag>
  );
}

/** A value that rises into place when it changes, once lists are folding; on load it just sits there. */
export function Tick({ value, className, children }: { value: string | number; className?: string; children: React.ReactNode }) {
  const animate = useContext(FoldMotion);
  return (
    <span key={String(value)} className={cx("inline-block", animate && "rise-in", className)}>
      {children}
    </span>
  );
}
