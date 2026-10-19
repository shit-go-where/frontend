"use client";

import { MapPinOff } from "lucide-react";
import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import type { ToiletMapProps } from "./ToiletMap";

function MapPlaceholder() {
  return (
    <div className="flex size-full items-center justify-center bg-surface-2 text-muted" aria-hidden>
      Loading map…
    </div>
  );
}

/** MapLibre needs WebGL + window: client only, never SSR'd or prerendered. */
const LazyMap = dynamic<ToiletMapProps>(() => import("./ToiletMap"), {
  ssr: false,
  loading: MapPlaceholder,
});

/** Set once the first map has been let in, so later maps (another tab, the route screen) start at once. */
let mapLetIn = false;

/**
 * MapLibre is by far the heaviest chunk in the app. It isn't requested until the page has painted and the main
 * thread has a breath (idle, or 1.2s at most), so the list, search and I NEED TO GO arrive first on a weak signal.
 */
function useMapLetIn() {
  const [go, setGo] = useState(mapLetIn);
  useEffect(() => {
    if (go) return;
    const run = () => {
      mapLetIn = true;
      setGo(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }
    // Safari has no requestIdleCallback: wait out the first paint instead.
    const t = window.setTimeout(run, 300);
    return () => window.clearTimeout(t);
  }, [go]);
  return go;
}

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
  const go = useMapLetIn();
  return (
    <MapErrorBoundary className={props.className}>
      {go ? (
        <LazyMap {...props} />
      ) : (
        <div className={props.className}>
          <MapPlaceholder />
        </div>
      )}
    </MapErrorBoundary>
  );
}

export type { ToiletMapProps };
export type { MapFocus } from "./focus";
export type { Bounds, MapView } from "./ToiletMap";
