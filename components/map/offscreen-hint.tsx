"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { cameraMotion } from "@/lib/motion";
import { PinGlyph, tierPinVariant } from "../pin";
import { cx } from "../ui";
import type { MapFocus } from "./focus";

/** Gap between the pill and the edge of the visible map. */
const EDGE_PX = 12;
/** A pin rises this far above its coordinate; the pill aims at its body. */
const PIN_PX = 40;
/** Below this much open map (the sheet near the top), there's nowhere sensible to point from. */
const MIN_OPEN_W = 160;
const MIN_OPEN_H = 96;

/**
 * When the focused toilet's pin is outside the open part of the map (under the search and
 * filters, under the sheet, or off screen), a pill rides the edge of the open area and points
 * at it. Tapping it pans there. Positioned straight from the camera on every frame, so panning
 * never re-renders React.
 */
export function OffscreenHint({ focus, inset }: { focus: MapFocus; inset?: { top?: number; bottom?: number } }) {
  const { current } = useMap();
  const pillRef = useRef<HTMLButtonElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const insetTop = inset?.top ?? 0;
  const insetBottom = inset?.bottom ?? 0;

  useEffect(() => {
    const map = current?.getMap();
    const pill = pillRef.current;
    const arrow = arrowRef.current;
    if (!map || !pill || !arrow) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      const box = map.getContainer();
      const pad = map.getPadding();
      const l = (pad.left ?? 0) + EDGE_PX;
      const r = box.clientWidth - (pad.right ?? 0) - EDGE_PX;
      const t = (pad.top ?? 0) + EDGE_PX;
      const b = box.clientHeight - (pad.bottom ?? 0) - EDGE_PX;
      // Where the pill may sit: the open map, minus room for floating controls.
      const pt = t + insetTop;
      const pb = b - insetBottom;
      const p = map.project([focus.lng, focus.lat]);
      // The tip in the open area is enough: the body reads fine even where the filters' margin overlaps it.
      const inView = p.x >= l && p.x <= r && p.y >= t && p.y <= b;
      if (inView || r - l < MIN_OPEN_W || pb - pt < MIN_OPEN_H) {
        pill.dataset.show = "false";
        return;
      }
      // From the middle of the open area towards the pin's body, stopped where the pill meets the edge.
      const w = pill.offsetWidth;
      const h = pill.offsetHeight;
      const cx0 = (l + r) / 2;
      const cy0 = (pt + pb) / 2;
      const dx = p.x - cx0;
      const dy = p.y - PIN_PX / 2 - cy0;
      const reachX = Math.max(0, (r - l - w) / 2);
      const reachY = Math.max(0, (pb - pt - h) / 2);
      const s = Math.min(dx ? reachX / Math.abs(dx) : Infinity, dy ? reachY / Math.abs(dy) : Infinity);
      const x = Math.round(cx0 + dx * s - w / 2);
      const y = Math.round(cy0 + dy * s - h / 2);
      pill.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      arrow.style.transform = `rotate(${Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90)}deg)`;
      pill.dataset.show = "true";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    // Padding eases (the sheet moving) fire move too.
    map.on("move", schedule);
    map.on("resize", schedule);
    return () => {
      map.off("move", schedule);
      map.off("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [current, focus.lat, focus.lng, focus.name, focus.distance, insetTop, insetBottom]);

  return (
    <button
      ref={pillRef}
      type="button"
      data-show="false"
      onClick={() => current?.getMap().easeTo({ center: [focus.lng, focus.lat], ...cameraMotion() })}
      aria-label={`Show ${focus.name} on the map${focus.distance ? `, ${focus.distance} away` : ""}`}
      className={cx(
        "absolute left-0 top-0 z-10 flex min-h-11 max-w-[min(17rem,calc(100%-1.5rem))] items-center gap-2 rounded-full border-2 bg-surface py-1 pl-1 pr-3.5 text-left text-sm font-extrabold text-fg shadow-card",
        "transition-[opacity,visibility] duration-150 data-[show=false]:invisible data-[show=false]:opacity-0 active:brightness-110",
        focus.picked ? "border-primary" : "border-border",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2" aria-hidden>
        <span ref={arrowRef} className="flex">
          <ArrowUp className="size-4" strokeWidth={2.75} />
        </span>
      </span>
      <PinGlyph
        variant={focus.pending ? "pending" : tierPinVariant(focus.tier)}
        className="-ml-0.5 size-6"
      />
      <span className="min-w-0 truncate">{focus.name}</span>
      {focus.distance ? <span className="shrink-0 font-medium tabular-nums text-muted">{focus.distance}</span> : null}
    </button>
  );
}
