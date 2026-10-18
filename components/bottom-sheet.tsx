"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DUR, EASE_SHEET, reducedMotion } from "@/lib/motion";
import { cx } from "./ui";

const SNAPS = [0.36, 0.58, 0.88] as const;
/** The peek must show the header and one whole card above the raised I-need-to-go button. */
const PEEK_MIN_PX = 330;
/** Breathing room between the sheet's top edge and whatever it must stay below. */
const TOP_GAP_PX = 8;
/** The settle: a quick start that glides to rest, like a native sheet. The map pans on the same curve. */
export const SHEET_SETTLE_MS = DUR.sheet;
/** How far ahead (ms) a flick's speed is projected when picking where to settle. */
const FLICK_PROJECT_MS = 240;
const DRAG_SLOP_PX = 6;

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

interface Drag {
  y0: number;
  h0: number;
  h: number;
  maxH: number;
  lastY: number;
  lastT: number;
  /** px per ms, positive = upward */
  v: number;
  active: boolean;
  id: number;
  onHandle: boolean;
}

/**
 * Draggable bottom sheet on phones; a fixed side panel from `md` up.
 * At rest its height comes from React; while dragging or settling it is held
 * at full height and moved with a transform only, so no frame restyles or
 * re-lays out the list inside it. Snap state is exposed so the page can pad the map.
 */
export function BottomSheet({
  header,
  children,
  label,
  floating,
  onSnapChange,
  snapRequest,
  topInset,
  busy = false,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  label: string;
  /** Phones: a control that floats just above the sheet and travels with it (hidden at the top snap). */
  floating?: React.ReactNode;
  onSnapChange?: (index: number, px: number) => void;
  /** Bump to ask the sheet to move to a snap index. */
  snapRequest?: { index: number; key: number } | null;
  /** Viewport y the sheet must not rise above (e.g. the bottom of floating search and filters). */
  topInset?: number;
  /** The list is about to change: veil what's visible. A small overlay, so the long list itself never re-rasters. */
  busy?: boolean;
}) {
  const [snap, setSnap] = useState(0);
  const [vh, setVh] = useState(800);
  const ref = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const raf = useRef(0);
  const settleCleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  // Where the sheet's bottom edge sits at rest (above the bottom nav and safe area), so the top snap can be capped.
  const [bottomEdge, setBottomEdge] = useState(800);

  useEffect(() => {
    const update = () => {
      setVh(window.innerHeight);
      const el = ref.current;
      // Skip while hidden on another tab (it measures as zero) or mid-gesture.
      if (el && !el.style.transform && el.offsetParent) setBottomEdge(Math.round(el.getBoundingClientRect().bottom));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const maxPx = topInset ? bottomEdge - topInset - TOP_GAP_PX : Infinity;
  const snapHeight = useCallback(
    (i: number) => Math.round(Math.min(i === 0 ? Math.max(SNAPS[0] * vh, PEEK_MIN_PX) : SNAPS[i] * vh, maxPx)),
    [vh, maxPx],
  );
  const nearestSnap = useCallback(
    (h: number) => SNAPS.reduce<number>((best, _f, i) => (Math.abs(snapHeight(i) - h) < Math.abs(snapHeight(best) - h) ? i : best), 0),
    [snapHeight],
  );

  const snapPx = snapHeight(snap);

  useEffect(() => {
    onSnapChange?.(snap, snapPx);
  }, [snap, snapPx, onSnapChange]);

  /** Height currently on screen, mid-gesture or mid-settle included. */
  const visualHeight = useCallback(() => {
    const el = ref.current;
    return el ? Math.round(bottomEdge - el.getBoundingClientRect().top) : snapPx;
  }, [bottomEdge, snapPx]);

  /** Holds the sheet at `maxH` tall, shifted down so `h` of it shows. */
  const hold = (el: HTMLElement, maxH: number, h: number) => {
    el.style.transition = "none";
    el.style.height = `${maxH}px`;
    el.style.transform = `translate3d(0, ${maxH - h}px, 0)`;
    el.style.willChange = "transform";
  };

  const settleTo = useCallback(
    (index: number, fromH?: number) => {
      const el = ref.current;
      settleCleanup.current?.();
      if (!el || !isPhone()) {
        setSnap(index);
        return;
      }
      if (reducedMotion()) {
        // No glide: drop any held drag position and let React set the new height in the same frame.
        el.style.transition = el.style.height = el.style.transform = el.style.willChange = "";
        setSnap(index);
        return;
      }
      const from = fromH ?? visualHeight();
      const to = snapHeight(index);
      const maxH = Math.max(from, to);
      hold(el, maxH, from);
      void el.offsetHeight; // commit the start position before transitioning
      el.style.transition = `transform ${SHEET_SETTLE_MS}ms ${EASE_SHEET}`;
      el.style.transform = `translate3d(0, ${maxH - to}px, 0)`;
      setSnap(index);

      // At rest, hand the height back to React (same pixels, so nothing moves).
      let timer = 0;
      const finish = () => {
        el.removeEventListener("transitionend", onEnd);
        window.clearTimeout(timer);
        settleCleanup.current = null;
        el.style.transition = "";
        el.style.height = "";
        el.style.transform = "";
        el.style.willChange = "";
      };
      const onEnd = (e: TransitionEvent) => {
        if (e.target === el && e.propertyName === "transform") finish();
      };
      el.addEventListener("transitionend", onEnd);
      timer = window.setTimeout(finish, SHEET_SETTLE_MS + 100);
      settleCleanup.current = () => {
        el.removeEventListener("transitionend", onEnd);
        window.clearTimeout(timer);
        settleCleanup.current = null;
      };
    },
    [snapHeight, visualHeight],
  );

  // The parent asks for a snap (e.g. a pin was tapped): glide there and show the top of the list.
  const lastRequest = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!snapRequest || snapRequest.key === lastRequest.current) return;
    lastRequest.current = snapRequest.key;
    settleTo(snapRequest.index);
    listRef.current?.scrollTo({ top: 0, behavior: reducedMotion() ? "instant" : "smooth" });
  }, [snapRequest, settleTo]);

  useEffect(
    () => () => {
      settleCleanup.current?.();
      cancelAnimationFrame(raf.current);
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      suppressClick.current = false;
      if (!isPhone() || (e.pointerType === "mouse" && e.button !== 0)) return;
      const h = visualHeight();
      drag.current = {
        y0: e.clientY,
        h0: h,
        h,
        maxH: h,
        lastY: e.clientY,
        lastT: e.timeStamp,
        v: 0,
        active: false,
        id: e.pointerId,
        onHandle: !!(e.target as Element).closest("[data-sheet-handle]"),
      };
    },
    [visualHeight],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      const el = ref.current;
      if (!d || !el) return;
      const dy = d.y0 - e.clientY;
      if (!d.active) {
        if (Math.abs(dy) < DRAG_SLOP_PX) return;
        // Becomes a drag: catch the sheet wherever it is, even mid-settle.
        d.active = true;
        settleCleanup.current?.();
        d.h0 = visualHeight();
        d.y0 = e.clientY;
        d.maxH = Math.max(snapHeight(2), d.h0);
        hold(el, d.maxH, d.h0);
        (e.currentTarget as HTMLElement).setPointerCapture(d.id);
      }
      const dt = e.timeStamp - d.lastT;
      if (dt > 0) d.v = 0.7 * ((d.lastY - e.clientY) / dt) + 0.3 * d.v;
      d.lastY = e.clientY;
      d.lastT = e.timeStamp;

      const min = snapHeight(0);
      let h = d.h0 + (d.y0 - e.clientY);
      if (h > d.maxH) h = d.maxH;
      // Past the peek, resist like a rubber band rather than stopping dead.
      if (h < min) h = min - (min - h) * 0.35;
      d.h = h;
      if (!raf.current) {
        raf.current = requestAnimationFrame(() => {
          raf.current = 0;
          const cur = drag.current;
          if (cur?.active) el.style.transform = `translate3d(0, ${cur.maxH - cur.h}px, 0)`;
        });
      }
    },
    [snapHeight, visualHeight],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent, cancelled: boolean) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.active) {
        // A tap on the grabber cycles up, wrapping to the smallest.
        if (!cancelled && d.onHandle) settleTo((snap + 1) % SNAPS.length);
        return;
      }
      suppressClick.current = true;
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      // A finger that stopped before lifting carries no flick.
      const v = cancelled || e.timeStamp - d.lastT > 80 ? 0 : d.v;
      settleTo(nearestSnap(d.h + v * FLICK_PROJECT_MS), d.h);
    },
    [nearestSnap, settleTo, snap],
  );

  return (
    <section
      ref={ref}
      aria-label={label}
      style={{ "--sheet-h": `${snapPx}px` } as React.CSSProperties}
      className={cx(
        "fixed inset-x-0 z-20 flex flex-col rounded-t-[28px] border-t border-border bg-bg shadow-card",
        "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] h-[var(--sheet-h)]",
        // A skirt down behind the bottom nav, so no strip of map shows under the nav's rounded top.
        "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-bg md:after:hidden",
        "md:bottom-0 md:left-0 md:right-auto md:top-16 md:h-auto md:w-[420px] md:rounded-none md:border-r md:border-t-0 md:shadow-none",
      )}
    >
      {floating ? (
        <div
          className={cx(
            "absolute bottom-full right-4 mb-4 transition-[opacity,visibility] duration-200 md:hidden",
            snap === SNAPS.length - 1 && "invisible opacity-0",
          )}
        >
          {floating}
        </div>
      ) : null}
      {/* Grabber and header both drag the sheet on phones; taps on their links still work. */}
      <div
        className="shrink-0 max-md:cursor-grab max-md:touch-none max-md:select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onClickCapture={(e) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="flex flex-col items-center pt-2 md:hidden">
          <button
            type="button"
            data-sheet-handle
            className="flex h-6 w-24 items-center justify-center"
            aria-label={snap === SNAPS.length - 1 ? "Collapse list" : "Expand list"}
            aria-expanded={snap > 0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                settleTo((snap + 1) % SNAPS.length);
              }
            }}
          >
            <span className="block h-1.5 w-12 rounded-full bg-muted/50" />
          </button>
        </div>
        <div className="px-4 pb-2 md:pt-4">{header}</div>
      </div>
      <div className="relative min-h-0 flex-1" aria-busy={busy}>
        <div ref={listRef} className="h-full overflow-y-auto overscroll-contain px-4 pb-14 md:pb-4">
          {children}
        </div>
        <div
          className={cx(
            "pointer-events-none absolute inset-0 bg-bg transition-opacity duration-200",
            busy ? "opacity-50" : "opacity-0",
          )}
          aria-hidden
        />
      </div>
    </section>
  );
}
