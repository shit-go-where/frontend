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
  /**
   * When the GPS fix in `coords` was taken (epoch ms); null unless `source` is "gps". A fix can be old:
   * the last fix from an earlier visit (up to 30 minutes) is used at once, with source "gps" and its own
   * `fixAt`, and so is the last fix when a refresh fails underground. `useFixAge()` turns it into the
   * minutes the UI shows ("from where you were 4 min ago") while a fresh fix comes in.
   */
  fixAt: number | null;
  /**
   * True when locating would put the browser's permission prompt in front of someone who has never let us
   * locate them: the map page explains why first and waits for a tap (a prompt on arrival gets declined by
   * reflex). False once locating can't surprise anyone, or the browser can't tell us; null until it has said.
   */
  askFirst: boolean | null;
  locate: (opts?: LocateOptions) => Promise<LatLng | null>;
  setManual: (p: LatLng & { name: string }) => void;
  /** Hands a position from elsewhere (the route screen's watch) to the shared location. Use `useWatchPosition`. */
  ingest: (pos: GeolocationPosition) => LatLng;
}

export interface LocateOptions {
  /**
   * How old a cached fix the fast first answer may be. Five minutes by default; urgent mode asks for
   * 30 seconds so it measures from where the person is now, not from the last station.
   */
  maxAgeMs?: number;
}

const LocationContext = createContext<LocationState | null>(null);

/** The last searched place, for this tab only (sessionStorage). */
const STORE_KEY = "sgw:place";
/** The last GPS fix and when it was taken (localStorage), so the next visit starts from it. */
const FIX_KEY = "sgw:fix";
/** A remembered fix older than this is no longer a fair guess at where someone is. */
const FIX_KEEP_MS = 30 * 60_000;
/** Coming back to the app with a fix older than this looks again. */
export const REFRESH_AFTER_MS = 60_000;
/** A fix older than this gets its age shown next to anything measured from it. */
export const STALE_FIX_MS = 2 * 60_000;

/** The fast answer: whatever the phone already knows (cell or Wi-Fi), within a few seconds. */
const QUICK: PositionOptions = { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 3000 };
/** The refinement that follows in the background: a real GPS fix. */
const PRECISE: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };

export function getCurrentPosition(timeout = 10000, opts?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(Object.assign(new Error("unsupported"), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout,
      maximumAge: 30000,
      ...opts,
    });
  });
}

interface StoredFix extends LatLng {
  accuracy: number | null;
  at: number;
}

function readStoredFix(): StoredFix | null {
  try {
    const raw = localStorage.getItem(FIX_KEY);
    if (!raw) return null;
    const f = JSON.parse(raw) as StoredFix;
    if (![f.lat, f.lng, f.at].every(Number.isFinite)) return null;
    return Date.now() - f.at < FIX_KEEP_MS ? f : null;
  } catch {
    return null;
  }
}

/** Any fix ever saved, however old: they have let us locate them on this browser before. */
function locatedBefore(): boolean {
  try {
    return localStorage.getItem(FIX_KEY) !== null;
  } catch {
    return false;
  }
}

function readStoredPlace(): (LatLng & { name: string }) | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as LatLng & { name: string }) : null;
  } catch {
    return null;
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = useState<LatLng>(RAFFLES_PLACE);
  const [source, setSource] = useState<LocationSource>("default");
  const [placeName, setPlaceName] = useState<string | null>(RAFFLES_PLACE.name);
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);
  const [fixAt, setFixAt] = useState<number | null>(null);
  const [askFirst, setAskFirst] = useState<boolean | null>(null);
  const inflight = useRef<Promise<LatLng | null> | null>(null);
  /** The fix in use, read by the async callbacks without waiting for a render. */
  const fixRef = useRef<StoredFix | null>(null);
  /** Where the position came from, for the same reason. */
  const sourceRef = useRef<LocationSource>("default");
  /** The person has let us locate them (a fix this session, or the permission is "granted"), so refreshing never prompts. */
  const allowed = useRef(false);

  /** Takes a fix unless the one in use is both more accurate and about as recent. */
  const ingest = useCallback((pos: GeolocationPosition) => {
    const at = pos.timestamp || Date.now();
    const acc = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null;
    const prev = sourceRef.current === "gps" ? fixRef.current : null;
    allowed.current = true;
    if (prev && prev.accuracy !== null && acc !== null && acc > prev.accuracy && at - prev.at < 30_000) {
      return { lat: prev.lat, lng: prev.lng };
    }
    const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    fixRef.current = { ...c, at, accuracy: acc };
    sourceRef.current = "gps";
    setCoords(c);
    setAccuracy(acc);
    setFixAt(at);
    setSource("gps");
    setPlaceName(null);
    setStatus("ok");
    setSettled(true);
    try {
      localStorage.setItem(FIX_KEY, JSON.stringify({ ...c, accuracy: acc, at } satisfies StoredFix));
    } catch {
      /* private mode: the fix still works for this visit */
    }
    return c;
  }, []);

  /**
   * Two stages: the phone's quick answer (cached or coarse, within 3 s) settles the page, then a real GPS fix
   * refines it in the background. When the quick answer fails (underground, indoors), the page settles on
   * what it has (the last fix or a place) and keeps waiting for the GPS fix, so "locating" stays honest.
   */
  const locate = useCallback(
    (opts?: LocateOptions) => {
      if (inflight.current) return inflight.current;
      // A click handler passed straight through hands us an event, not options.
      const maxAge = typeof opts?.maxAgeMs === "number" ? opts.maxAgeMs : QUICK.maximumAge;
      setStatus("locating");
      const precise = () => getCurrentPosition(PRECISE.timeout, PRECISE);
      const p = getCurrentPosition(QUICK.timeout, { ...QUICK, maximumAge: maxAge })
        .then((pos) => {
          const c = ingest(pos);
          // Refine without holding anyone up; a failure here keeps the quick fix.
          void precise()
            .then(ingest)
            .catch(() => undefined);
          return c;
        })
        .catch(async (err: GeolocationPositionError | Error) => {
          if ((err as GeolocationPositionError).code === 1) {
            setStatus("denied");
            return null;
          }
          // No quick answer: let the page show what it has while the GPS keeps trying.
          setSettled(true);
          try {
            return ingest(await precise());
          } catch (e) {
            setStatus((e as GeolocationPositionError).code === 1 ? "denied" : "unavailable");
            return null;
          }
        })
        .finally(() => {
          inflight.current = null;
          setSettled(true);
        });
      inflight.current = p;
      return p;
    },
    [ingest],
  );

  const setManual = useCallback((p: LatLng & { name: string }) => {
    sourceRef.current = "search";
    setCoords({ lat: p.lat, lng: p.lng });
    setSource("search");
    setPlaceName(p.name);
    setAccuracy(null);
    setFixAt(null);
    setSettled(true);
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(p));
    } catch {
      /* private mode */
    }
  }, []);

  /*
   * On first mount, start from what we already know: a place searched earlier in this tab (an explicit
   * choice wins), else the last GPS fix if it's under 30 minutes old. Then locate only if the permission is
   * already granted. Otherwise wait: the pages that need a location (/ and /go) ask for it themselves (the map
   * page only once `askFirst` says the prompt won't come out of nowhere), and
   * every other page settles on what it has without a prompt. A page's own locate() runs before this effect
   * (child effects first), so `inflight` tells us someone already asked.
   */
  useEffect(() => {
    let cancelled = false;
    let perm: PermissionStatus | null = null;
    const place = readStoredPlace();
    const fix = place ? null : readStoredFix();
    /* eslint-disable react-hooks/set-state-in-effect -- storage is client-only, so it loads after hydration */
    if (place) {
      sourceRef.current = "search";
      setCoords({ lat: place.lat, lng: place.lng });
      setSource("search");
      setPlaceName(place.name);
    } else if (fix && !fixRef.current) {
      sourceRef.current = "gps";
      fixRef.current = fix;
      setCoords({ lat: fix.lat, lng: fix.lng });
      setAccuracy(fix.accuracy);
      setFixAt(fix.at);
      setSource("gps");
      setPlaceName(null);
      setStatus((s) => (s === "idle" ? "ok" : s));
      setSettled(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    const settleWithoutAsking = () => {
      if (!cancelled && !inflight.current) setSettled(true);
    };
    // Safari answers "prompt" again some time after an Allow; someone who allowed before isn't surprised by it.
    const needsAsk = (state: PermissionState) => state === "prompt" && !locatedBefore();
    const onPerm = (state: PermissionState) => {
      setAskFirst(needsAsk(state));
      if (state === "granted") {
        allowed.current = true;
        if (!inflight.current) void locate();
      } else {
        if (state === "denied" && !inflight.current) setStatus("denied");
        settleWithoutAsking();
      }
    };
    const query = typeof navigator !== "undefined" ? navigator.permissions?.query : undefined;
    if (query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((s) => {
          if (cancelled) return;
          perm = s;
          onPerm(s.state);
          // Turned on in the browser's settings while the app is open: locate straight away.
          s.onchange = () => {
            if (s.state === "granted") onPerm(s.state);
            else setAskFirst(needsAsk(s.state));
          };
        })
        .catch(() => {
          if (cancelled) return;
          setAskFirst(false);
          settleWithoutAsking();
        });
    } else {
      setAskFirst(false);
      settleWithoutAsking();
    }
    return () => {
      cancelled = true;
      if (perm) perm.onchange = null;
    };
  }, [locate]);

  // Back in the app after a while: look again, but only if they've already let us (never a surprise prompt),
  // and never over a place they searched for on purpose.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !allowed.current || sourceRef.current === "search") return;
      const at = fixRef.current?.at ?? 0;
      if (Date.now() - at > REFRESH_AFTER_MS) void locate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [locate]);

  const value = useMemo<LocationState>(
    () => ({ coords, source, placeName, status, accuracy, settled, fixAt, askFirst, locate, setManual, ingest }),
    [coords, source, placeName, status, accuracy, settled, fixAt, askFirst, locate, setManual, ingest],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used inside <LocationProvider>");
  return ctx;
}

/**
 * Minutes since the GPS fix in use, once it's old enough to say so (two minutes), else null. Searched and
 * fallback places have no age. Ticks every 30 s so the label keeps up.
 */
export function useFixAge(): number | null {
  const { source, fixAt } = useLocation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  if (source !== "gps" || fixAt === null) return null;
  // A fix that arrived after the last tick is fresh.
  const age = Math.max(0, now - fixAt);
  return age >= STALE_FIX_MS ? Math.round(age / 60_000) : null;
}

/**
 * Follows the person while `active` (the route screen), feeding each fix to the shared location so the
 * dot moves. Only once they've given permission; it never prompts by itself on a page that didn't ask.
 */
export function useWatchPosition(active: boolean) {
  const { ingest, source } = useLocation();
  const gps = source === "gps";
  useEffect(() => {
    if (!active || !gps || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => void ingest(pos),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, gps, ingest]);
}

/** Round to ~11 m so tiny GPS jitter doesn't refetch everything. */
export function roundCoord(n: number, places = 4) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** The API's `walkSecondsEstimate` (backend/src/common/geo.ts): straight line plus 30% detour at 1.25 m/s. Keep in step. */
export function estimateWalkSeconds(straightLineM: number): number {
  return Math.round((straightLineM * 1.3) / 1.25);
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
