"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Raffles Place MRT, the fallback when we can't get a fix. */
export const RAFFLES_PLACE: LatLng & { name: string } = { lat: 1.28393, lng: 103.85144, name: "Raffles Place" };

export type LocationSource = "gps" | "search" | "default";
export type LocationStatus = "idle" | "locating" | "ok" | "denied" | "unavailable";

interface LocationState {
  coords: LatLng;
  /** Where `coords` came from. */
  source: LocationSource;
  /** Name shown when the location was chosen by search / default. */
  placeName: string | null;
  status: LocationStatus;
  accuracy: number | null;
  /** True once we have tried at least once (or have a stored manual place). */
  settled: boolean;
  locate: () => Promise<LatLng | null>;
  setManual: (p: LatLng & { name: string }) => void;
}

const LocationContext = createContext<LocationState | null>(null);

const STORE_KEY = "sgw:place";

export function getCurrentPosition(timeout = 10000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(Object.assign(new Error("unsupported"), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout,
      maximumAge: 30000,
    });
  });
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = useState<LatLng>(RAFFLES_PLACE);
  const [source, setSource] = useState<LocationSource>("default");
  const [placeName, setPlaceName] = useState<string | null>(RAFFLES_PLACE.name);
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);
  const inflight = useRef<Promise<LatLng | null> | null>(null);

  const locate = useCallback(() => {
    if (inflight.current) return inflight.current;
    setStatus("locating");
    const p = getCurrentPosition()
      .then((pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setAccuracy(pos.coords.accuracy ?? null);
        setSource("gps");
        setPlaceName(null);
        setStatus("ok");
        return c;
      })
      .catch((err: GeolocationPositionError | Error) => {
        const code = (err as GeolocationPositionError).code;
        setStatus(code === 1 ? "denied" : "unavailable");
        return null;
      })
      .finally(() => {
        inflight.current = null;
        setSettled(true);
      });
    inflight.current = p;
    return p;
  }, []);

  const setManual = useCallback((p: LatLng & { name: string }) => {
    setCoords({ lat: p.lat, lng: p.lng });
    setSource("search");
    setPlaceName(p.name);
    setAccuracy(null);
    setSettled(true);
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(p));
    } catch {
      /* private mode */
    }
  }, []);

  // On first mount: try GPS. If it fails, fall back to the last searched place.
  useEffect(() => {
    let cancelled = false;
    let stored: (LatLng & { name: string }) | null = null;
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = null;
    }
    void locate().then((c) => {
      if (!cancelled && !c && stored) {
        setCoords({ lat: stored.lat, lng: stored.lng });
        setSource("search");
        setPlaceName(stored.name);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [locate]);

  const value = useMemo<LocationState>(
    () => ({ coords, source, placeName, status, accuracy, settled, locate, setManual }),
    [coords, source, placeName, status, accuracy, settled, locate, setManual],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used inside <LocationProvider>");
  return ctx;
}

/** Round to ~11 m so tiny GPS jitter doesn't refetch everything. */
export function roundCoord(n: number, places = 4) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
