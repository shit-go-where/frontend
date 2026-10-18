"use client";

import { MapPinOff } from "lucide-react";
import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { ToiletMapProps } from "./ToiletMap";

/** MapLibre needs WebGL + window: client only, never SSR'd or prerendered. */
const LazyMap = dynamic<ToiletMapProps>(() => import("./ToiletMap"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-surface-2 text-muted" aria-hidden>
      Loading map…
    </div>
  ),
});

/** Keeps the page usable when WebGL or the tile server fails. */
class MapErrorBoundary extends Component<{ children: ReactNode; className?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div
          className={`flex flex-col items-center justify-center gap-2 bg-surface-2 p-4 text-center text-muted ${this.props.className ?? ""}`}
          role="note"
        >
          <MapPinOff className="size-8" aria-hidden />
          <p>The map can&apos;t load on this device. The list still works.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ToiletMap(props: ToiletMapProps) {
  return (
    <MapErrorBoundary className={props.className}>
      <LazyMap {...props} />
    </MapErrorBoundary>
  );
}

export type { ToiletMapProps };
export type { MapFocus } from "./focus";
export type { Bounds, MapView } from "./ToiletMap";
