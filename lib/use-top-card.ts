"use client";

import { useEffect, useState } from "react";

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return null;
}

/**
 * Phones have no hover, so the card the list is scrolled to stands in for it: the first
 * `[data-flip-key]` item that is at least half in view at the top of its scroll container.
 */
export function useTopCard(listRef: React.RefObject<HTMLElement | null>, keys: string[], enabled: boolean): string | null {
  const [top, setTop] = useState<string | null>(null);
  const keysKey = keys.join(",");

  useEffect(() => {
    const list = listRef.current;
    const scroller = scrollParent(list);
    if (!enabled || !list || !scroller) {
      setTop(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const edge = scroller.getBoundingClientRect().top;
      let found: string | null = null;
      for (const item of list.querySelectorAll<HTMLElement>("[data-flip-key]")) {
        const r = item.getBoundingClientRect();
        if (r.bottom - edge > r.height / 2) {
          found = item.dataset.flipKey ?? null;
          break;
        }
      }
      setTop(found);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener("scroll", schedule, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [listRef, keysKey, enabled]);

  return top;
}
