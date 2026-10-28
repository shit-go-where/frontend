"use client";

import { MapPinOff, RotateCw } from "lucide-react";
import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";
import { MapLibreLoadError } from "./load-error";
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
class MapErrorBoundary extends Component<{ children: ReactNode; className?: string }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      // A dropped download is worth another go; Safari keeps a failed module import for the page's life, so reload.
      const dropped = this.state.error instanceof MapLibreLoadError;
      return (
        <div className={`bg-surface-2 text-center text-muted ${this.props.className ?? ""}`} role="note">
          {/* Capped so a full-screen map (home, under the list sheet) shows this above the sheet; a card map centres it. */}
          <div className="flex h-full max-h-[55svh] flex-col items-center justify-center gap-2 p-4">
            <MapPinOff className="size-8" aria-hidden />
            <p>{dropped ? "The map didn't load. The list still works." : "The map can't load on this device. The list still works."}</p>
            {dropped ? (
              <button type="button" className={buttonClass("secondary", "md")} onClick={() => window.location.reload()}>
                <RotateCw className="size-4" aria-hidden /> Try again
              </button>
            ) : null}
          </div>
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
