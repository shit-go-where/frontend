"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "./ui";

const SNAPS = [0.36, 0.58, 0.88] as const;
/** The peek must show the header and one whole card above the raised I-need-to-go button. */
const PEEK_MIN_PX = 330;
const snapHeight = (i: number, vh: number) => (i === 0 ? Math.max(SNAPS[0] * vh, PEEK_MIN_PX) : SNAPS[i] * vh);

/**
 * Draggable bottom sheet on phones; a fixed side panel from `md` up.
 * Snap state is exposed so the page can pad the map.
 */
export function BottomSheet({
  header,
  children,
  label,
  onSnapChange,
  snapRequest,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  label: string;
  onSnapChange?: (index: number, px: number) => void;
  /** Bump to ask the sheet to move to a snap index. */
  snapRequest?: { index: number; key: number } | null;
}) {
  const [snap, setSnap] = useState(0);
  const [vh, setVh] = useState(800);
  const [dragPx, setDragPx] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Adjust state while rendering when the parent asks for a new snap.
  const [lastRequest, setLastRequest] = useState<number | undefined>(undefined);
  if (snapRequest && snapRequest.key !== lastRequest) {
    setLastRequest(snapRequest.key);
    setSnap(snapRequest.index);
  }

  const snapPx = Math.round(snapHeight(snap, vh));
  const height = dragPx ?? snapPx;

  useEffect(() => {
    onSnapChange?.(snap, snapPx);
  }, [snap, snapPx, onSnapChange]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      start.current = { y: e.clientY, h: height };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [height],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current) return;
      const h = start.current.h + (start.current.y - e.clientY);
      setDragPx(Math.max(snapHeight(0, vh) * 0.6, Math.min(SNAPS[2] * vh, h)));
    },
    [vh],
  );
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const moved = Math.abs(s.y - e.clientY);
      if (moved < 6) {
        // Treat as a tap on the handle: cycle up, wrap to the smallest.
        setSnap((i) => (i + 1) % SNAPS.length);
      } else {
        const h = dragPx ?? s.h;
        let best = 0;
        SNAPS.forEach((_f, i) => {
          if (Math.abs(snapHeight(i, vh) - h) < Math.abs(snapHeight(best, vh) - h)) best = i;
        });
        setSnap(best);
      }
      setDragPx(null);
    },
    [dragPx, vh],
  );

  return (
    <section
      aria-label={label}
      style={{ "--sheet-h": `${height}px` } as React.CSSProperties}
      className={cx(
        "fixed inset-x-0 z-20 flex flex-col rounded-t-[28px] border-t border-border bg-bg shadow-card",
        "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] h-[var(--sheet-h)]",
        dragPx === null && "transition-[height] duration-200 ease-out",
        "md:bottom-0 md:left-0 md:right-auto md:top-16 md:h-auto md:w-[420px] md:rounded-none md:border-r md:border-t-0 md:shadow-none",
      )}
    >
      <div
        className="flex shrink-0 touch-none cursor-grab select-none flex-col items-center pt-2 md:hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          setDragPx(null);
        }}
      >
        <button
          type="button"
          className="flex h-6 w-24 items-center justify-center"
          aria-label={snap === SNAPS.length - 1 ? "Collapse list" : "Expand list"}
          aria-expanded={snap > 0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSnap((i) => (i + 1) % SNAPS.length);
            }
          }}
        >
          <span className="block h-1.5 w-12 rounded-full bg-muted/50" />
        </button>
      </div>
      <div className="shrink-0 px-4 pb-2 md:pt-4">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-14 md:pb-4">{children}</div>
    </section>
  );
}
