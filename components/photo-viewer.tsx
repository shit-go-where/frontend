"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { PhotoRef } from "@/lib/api/types";
import { EASE_OUT, reducedMotion } from "@/lib/motion";
import { cx } from "./styles";

/** How far a finger has to travel sideways before it counts as a swipe, not a wobbly tap. */
const SWIPE_PX = 48;

/**
 * Photos open in the page instead of as a raw file in a new tab, so Back and the toilet stay
 * where they were. A native modal <dialog> (focus trap, Esc, inert page for free) on the
 * Chocolate Ground of the picked theme. Swipe, the arrow keys or the 44px side buttons move
 * between photos; each new photo slides in from the side it came from (reduced motion: it
 * only fades). Tapping the empty space around the photo closes it, like a dialog backdrop.
 */
export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  alt,
}: {
  photos: PhotoRef[];
  /** The open photo, or null when closed. */
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  alt: (i: number) => string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const shownRef = useRef<number | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const open = index !== null && index < photos.length;
  const many = photos.length > 1;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // Hidden with its route (or unmounted): never left open over another page.
  useEffect(() => () => ref.current?.close(), []);

  // A new photo slides in from the side it came from; the first one just fades up.
  useEffect(() => {
    const img = imgRef.current;
    const prev = shownRef.current;
    shownRef.current = index;
    if (!img || index === null) return;
    const dir = prev === null || prev === index ? 0 : index > prev ? 1 : -1;
    const still = reducedMotion() || dir === 0;
    img.animate(
      still
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: `translateX(${dir * 32}px)` },
            { opacity: 1, transform: "none" },
          ],
      { duration: still ? 150 : 240, easing: EASE_OUT },
    );
  }, [index]);

  const go = (step: number) => {
    if (index === null || !many) return;
    onIndex((index + step + photos.length) % photos.length);
  };

  const photo = open ? photos[index] : null;

  return (
    <dialog
      ref={ref}
      aria-label="Photo viewer"
      onClose={onClose}
      onCancel={onClose}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        else if (e.key === "ArrowLeft") go(-1);
        else return;
        e.preventDefault();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-bg p-0 text-fg backdrop:bg-[var(--overlay)]"
    >
      {photo && index !== null ? (
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-between gap-2 px-4 py-2">
            <p className="text-sm font-bold text-muted tabular-nums" aria-live="polite">
              {many ? `Photo ${index + 1} of ${photos.length}` : "Photo"}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface text-fg shadow-rest hover:brightness-110"
              aria-label="Close photo"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <div
            className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-4 pb-4 select-none"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
            onPointerDown={(e) => {
              swipe.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={(e) => {
              const s = swipe.current;
              swipe.current = null;
              if (!s) return;
              const dx = e.clientX - s.x;
              // Mostly sideways, and far enough: a swipe left shows the next photo.
              if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
            }}
            onPointerCancel={() => {
              swipe.current = null;
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              key={photo.id}
              src={photo.url}
              alt={alt(index)}
              draggable={false}
              className="max-h-full max-w-full rounded-3xl bg-surface-2 object-contain shadow-card"
            />
            {many ? (
              <>
                <NavButton side="left" onClick={() => go(-1)} />
                <NavButton side="right" onClick={() => go(1)} />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cx(
        "absolute top-1/2 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-fg shadow-card hover:brightness-110 active:scale-95",
        side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4",
      )}
    >
      <Icon className="size-6" aria-hidden />
    </button>
  );
}
