"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DUR, EASE_SHEET, reducedMotion } from "@/lib/motion";
import { cx } from "./ui";

/**
 * Low to high: the count strip, the peek, the middle and the top. The strip and the peek are measured from their
 * content; the other two are shares of the viewport.
 */
const SNAPS = [0, 0, 0.58, 0.88] as const;
/** Just the grabber and the count: the map gets nearly the whole screen. Only a drag down from the peek reaches it. */
export const SHEET_STRIP = 0;
/** Where the sheet rests when the page opens: the count and the nearest (or picked) toilet. */
export const SHEET_PEEK = 1;
export const SHEET_TOP = SNAPS.length - 1;
/** Until the peek has been measured: about a one-line header and one compact card. */
const PEEK_FALLBACK_PX = 210;
/** Room under the peek's card (and the strip's count) for the tab bar's bump, which rises into the sheet's bottom edge. */
const PEEK_CLEARANCE_PX = 12;
/** Breathing room between the sheet's top edge and whatever it must stay below. */
const TOP_GAP_PX = 8;
/** The settle: a quick start that glides to rest, like a native sheet. The map pans on the same curve. */
export const SHEET_SETTLE_MS = DUR.sheet;
/** How far ahead (ms) a flick's speed is projected when picking where to settle. */
const FLICK_PROJECT_MS = 240;
const DRAG_SLOP_PX = 6;

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

/** The grabber steps up a snap at a time, and from the top wraps to the peek rather than the strip. */
const nextSnap = (i: number) => (i >= SHEET_TOP ? SHEET_PEEK : i + 1);

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
  /** Started on the list rather than the header. */
  fromList: boolean;
  /** The list was scrolled to its top when the finger went down. */
  listAtTop: boolean;
}

/** The lowest snaps never cover more than these shares of the screen, however large the text makes the card. */
const STRIP_MAX = 0.3;
const PEEK_MAX = 0.45;

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
  const [snap, setSnap] = useState<number>(SHEET_PEEK);
  const [vh, setVh] = useState(800);
  const [peekPx, setPeekPx] = useState(PEEK_FALLBACK_PX);
  const [stripPx, setStripPx] = useState(PEEK_FALLBACK_PX / 2);
  const ref = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
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
      if (!el || el.style.transform) return; // mid-gesture: the box is held, not at rest
      const r = el.getBoundingClientRect();
      // Zero while hidden on another tab (offsetParent can't tell: it's always null for a fixed element).
      if (r.height) setBottomEdge(Math.round(r.bottom));
    };
    update();
    window.addEventListener("resize", update);
    // Also catches the page being shown again after another tab, and the nav settling in.
    const ro = new ResizeObserver(update);
    if (ref.current) ro.observe(ref.current);
    return () => {
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, []);

  /*
   * The peek shows the header's resting rows and the content's first `[data-sheet-peek]` element (the nearest or
   * picked toilet), clear of the raised button. A `[data-sheet-reveal]` block in the header only opens above the
   * peek, so it never counts; that keeps the peek steady while the block folds in and out.
   */
  useEffect(() => {
    const head = headRef.current;
    const content = contentRef.current;
    if (!head || !content) return;
    const measure = () => {
      if (!head.offsetHeight) return; // hidden on another tab
      const reveal = head.querySelector<HTMLElement>("[data-sheet-reveal]");
      const peek = content.querySelector<HTMLElement>("[data-sheet-peek]");
      // Layout offsets, not client rects: a card still rising in (`rise-in`, the FLIP entrance) would be measured
      // where it is mid-animation, and nothing re-measures once the transform ends.
      const below = peek ? peek.offsetTop + peek.offsetHeight - content.offsetTop : 0;
      const resting = head.offsetHeight - (reveal?.offsetHeight ?? 0);
      setStripPx(Math.round(resting + PEEK_CLEARANCE_PX));
      setPeekPx(Math.round(resting + below + PEEK_CLEARANCE_PX));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(head);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const maxPx = topInset ? bottomEdge - topInset - TOP_GAP_PX : Infinity;
  const snapHeight = useCallback(
    (i: number) =>
      Math.round(
        Math.min(i === SHEET_STRIP ? Math.min(stripPx, STRIP_MAX * vh) : i === SHEET_PEEK ? Math.min(peekPx, PEEK_MAX * vh) : SNAPS[i] * vh, maxPx),
      ),
    [vh, maxPx, peekPx, stripPx],
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

  /*
   * The resting height can change under a snap that stays put: the peek re-measured (a picked card, a new nearest
   * toilet), the screen resized. Glide there like any settle, from wherever the sheet is (mid-settle included),
   * instead of jumping while the map pans to follow. Before paint, so the new height never shows first.
   */
  const shown = useRef<{ snap: number; px: number } | null>(null);
  useLayoutEffect(() => {
    const prev = shown.current;
    shown.current = { snap, px: snapPx };
    const el = ref.current;
    if (!prev || prev.snap !== snap || prev.px === snapPx || !el || drag.current?.active) return;
    if (!el.getClientRects().length) return; // hidden on another tab
    settleTo(snap, settleCleanup.current ? undefined : prev.px);
  }, [snap, snapPx, settleTo]);

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

  /*
   * Who owns a vertical swipe on the list. Below the top snap the sheet does (`touch-action: pan-x` on the list,
   * and this for browsers that still start a scroll); at the top snap the list scrolls, except a pull down from its
   * very top, which collapses the sheet. Pointer events then drive the drag, as on the header. Native listeners,
   * because React's touch listeners are passive and can't stop the scroll.
   */
  const snapRef = useRef(snap);
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let x0 = 0;
    let y0 = 0;
    let atTop = false;
    let owner: "sheet" | "list" | null = null;
    const start = (e: TouchEvent) => {
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      atTop = list.scrollTop <= 0;
      owner = null;
    };
    const move = (e: TouchEvent) => {
      if (!isPhone() || e.touches.length > 1) return;
      if (!owner) {
        const dx = e.touches[0].clientX - x0;
        const dy = e.touches[0].clientY - y0;
        if (!dy || Math.abs(dx) > Math.abs(dy)) return; // undecided, or a sideways swipe (chip rows) the browser keeps
        owner = snapRef.current < SHEET_TOP || (atTop && dy > 0) ? "sheet" : "list";
      }
      if (owner === "sheet" && e.cancelable) e.preventDefault();
    };
    list.addEventListener("touchstart", start, { passive: true });
    list.addEventListener("touchmove", move, { passive: false });
    return () => {
      list.removeEventListener("touchstart", start);
      list.removeEventListener("touchmove", move);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, fromList = false) => {
      suppressClick.current = false;
      if (!isPhone() || (e.pointerType === "mouse" && e.button !== 0)) return;
      const h = visualHeight();
      drag.current = {
        fromList,
        listAtTop: (listRef.current?.scrollTop ?? 0) <= 0,
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
        // At the top snap the list scrolls as usual; only a pull down from its very top moves the sheet.
        if (d.fromList && snap === SHEET_TOP && !(d.listAtTop && dy < 0)) {
          drag.current = null;
          return;
        }
        // Becomes a drag: catch the sheet wherever it is, even mid-settle.
        d.active = true;
        settleCleanup.current?.();
        d.h0 = visualHeight();
        d.y0 = e.clientY;
        d.maxH = Math.max(snapHeight(SHEET_TOP), d.h0);
        hold(el, d.maxH, d.h0);
        // The touch never becomes a scroll, so the card under the thumb would stay pressed in (globals.css).
        el.dataset.dragging = "";
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
    [snap, snapHeight, visualHeight],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent, cancelled: boolean) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.active) {
        // A tap on the grabber cycles up and wraps to the peek; at the strip, a tap anywhere on it brings the peek back.
        if (!cancelled && (d.onHandle || snap === SHEET_STRIP)) settleTo(nextSnap(snap));
        return;
      }
      suppressClick.current = true;
      if (ref.current) delete ref.current.dataset.dragging;
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      // A finger that stopped before lifting carries no flick.
      const v = cancelled || e.timeStamp - d.lastT > 80 ? 0 : d.v;
      settleTo(nearestSnap(d.h + v * FLICK_PROJECT_MS), d.h);
    },
    [nearestSnap, settleTo, snap],
  );

  /** The click that ends a drag lands on whatever was under the finger; it must not open it. */
  const swallowDragClick = (e: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <section
      ref={ref}
      aria-label={label}
      style={{ "--sheet-h": `${snapPx}px` } as React.CSSProperties}
      className={cx(
        "fixed inset-x-0 z-20 flex flex-col rounded-t-[28px] border-t border-border bg-bg shadow-card",
        "bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom))] h-[var(--sheet-h)]",
        // A skirt down behind the bottom nav, so no strip of map shows under the nav's rounded top.
        "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-bg md:after:hidden",
        "md:bottom-0 md:left-0 md:right-auto md:h-auto md:w-[420px] md:rounded-none md:border-r md:border-t-0 md:shadow-none",
        // The installed app on a tablet: under the status-bar band and header. A landscape phone: clear of the notch.
        "md:top-[calc(4rem+env(safe-area-inset-top))] md:pl-[env(safe-area-inset-left)]",
      )}
    >
      {floating ? (
        <div
          className={cx(
            "absolute bottom-full right-4 mb-4 transition-[opacity,visibility] duration-200 md:hidden",
            snap === SHEET_TOP && "invisible opacity-0",
          )}
        >
          {floating}
        </div>
      ) : null}
      {/* Grabber and header both drag the sheet on phones; taps on their links still work. */}
      <div
        ref={headRef}
        className="shrink-0 max-md:cursor-grab max-md:touch-none max-md:select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onClickCapture={swallowDragClick}
      >
        <div className="flex flex-col items-center pt-2 md:hidden">
          <button
            type="button"
            data-sheet-handle
            // A 44px target that still looks like a slim bar; the negative margin keeps the sheet's header where it was.
            className="-my-2.5 flex h-11 w-24 items-center justify-center"
            aria-label={snap === SHEET_TOP ? "Collapse list" : snap === SHEET_STRIP ? "Show nearest toilet" : "Expand list"}
            aria-expanded={snap > SHEET_PEEK}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                settleTo(nextSnap(snap));
              }
            }}
          >
            <span className="block h-1.5 w-12 rounded-full bg-muted/50" />
          </button>
        </div>
        <div className="px-4 pb-2 md:pt-4">{header}</div>
      </div>
      {/*
        Below the top snap a vertical drag on the list moves the sheet (sideways swipes still scroll chip rows); at the
        top snap the list scrolls and a pull down from its top collapses the sheet. A tap is a tap: only a move past
        the slop becomes a drag, and only a drag swallows the click.
      */}
      <div
        className="relative min-h-0 flex-1"
        aria-busy={busy}
        onPointerDown={(e) => onPointerDown(e, true)}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onClickCapture={swallowDragClick}
      >
        <div
          ref={listRef}
          className={cx(
            "h-full overflow-y-auto overscroll-contain px-4 pb-14 transition-opacity duration-200 md:pb-4",
            snap === SHEET_STRIP && "max-md:opacity-0",
            snap < SHEET_TOP && "max-md:touch-pan-x",
          )}
          inert={snap === SHEET_STRIP && isPhone()}
        >
          <div ref={contentRef}>{children}</div>
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
