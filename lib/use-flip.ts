"use client";

import { useLayoutEffect, useRef } from "react";
import { DUR, EASE_OUT, reducedMotion } from "./motion";

/** Entering items cascade, but the cascade never runs longer than this many steps. */
const MAX_STAGGER = 8;
/** Only items on screen (plus this margin) animate: off-screen motion costs layers and nobody sees it. */
const VIEW_MARGIN_PX = 80;
const FLIP_ID = "flip";

/**
 * FLIP for a keyed list: when the keys change, items that stay glide from
 * their old spot to their new one and new items rise in. Children of `listRef`
 * opt in with `data-flip-key`. Transform and opacity only, on visible items only.
 * A change mid-glide starts from where the item is on screen, not where it was laid out.
 * Under reduced motion items move at once and new ones fade in without rising.
 */
export function useFlipList(listRef: React.RefObject<HTMLElement | null>, keys: readonly string[]) {
  const prev = useRef<Map<string, number> | null>(null);
  const signature = keys.join("|");

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const els = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-flip-key]"));
    // Offsets relative to the list, so content added above it doesn't read as movement.
    const now = new Map(els.map((el) => [el.dataset.flipKey!, el.offsetTop - list.offsetTop]));
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    const still = reducedMotion();

    // "Visible" means inside the nearest scrolling box (the sheet's list), not just the window.
    let box: HTMLElement | null = list.parentElement;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    const view = box?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const top = Math.max(view.top, 0) - VIEW_MARGIN_PX;
    const bottom = Math.min(view.bottom, window.innerHeight) + VIEW_MARGIN_PX;

    let entering = 0;
    for (const el of els) {
      const running = el.getAnimations().filter((a) => a.id === FLIP_ID);
      // Where a still-running glide has the item right now, before it's cancelled.
      const shift = running.length ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 : 0;
      for (const a of running) a.cancel();

      const r = el.getBoundingClientRect();
      if (r.bottom < top || r.top > bottom) continue;
      const key = el.dataset.flipKey!;
      const was = before.get(key);
      const is = now.get(key)!;
      if (was === undefined) {
        el.animate(
          still
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [{ opacity: 0, transform: "translateY(10px) scale(0.98)" }, { opacity: 1, transform: "none" }],
          {
            id: FLIP_ID,
            duration: DUR.enter,
            delay: still ? 0 : Math.min(entering++, MAX_STAGGER) * 25,
            easing: EASE_OUT,
            fill: "backwards",
          },
        );
      } else if (!still && was + shift !== is) {
        el.animate([{ transform: `translateY(${was + shift - is}px)` }, { transform: "none" }], {
          id: FLIP_ID,
          duration: DUR.move,
          easing: EASE_OUT,
        });
      }
    }
  }, [signature, listRef]);
}
