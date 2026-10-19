"use client";

import { useQuery } from "@tanstack/react-query";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { tidyPlaceAddress, tidyPlaceName } from "@/lib/format";
import { haversineM, useFixAge, useLocation, type LatLng } from "@/lib/location";
import { useOnline } from "@/lib/offline";
import { STATIONS, searchStations, type Station } from "@/lib/stations";
import { buttonClass, cx } from "./ui";

/** LRT lines: their stations read "… LRT", every other line "… MRT". */
const LRT_LINES = new Set(["BP", "SK", "PG", "SE", "SW", "PE", "PW"]);

function stationName(s: Station): string {
  if (!s.lines.length || /\b(MRT|LRT|Interchange)\b/i.test(s.name)) return s.name;
  return `${s.name} ${s.lines.every((l) => LRT_LINES.has(l)) ? "LRT" : "MRT"}`;
}

/** The bundled station nearest a point, if one is within `withinM`: names a place with no signal to look it up. */
export function nearestStationName(p: LatLng, withinM = 800): string | null {
  let best: { s: Station; d: number } | null = null;
  for (const s of STATIONS) {
    const d = haversineM(p, s);
    if (d <= withinM && (!best || d < best.d)) best = { s, d };
  }
  return best ? stationName(best.s) : null;
}

/**
 * Puts the cursor in the place search on screen (the "Search your MRT or mall" way out when locating
 * fails). The map page stays mounted while hidden on other tabs, so this skips search fields that aren't shown.
 */
export function focusLocationSearch(): boolean {
  const field = [...document.querySelectorAll<HTMLInputElement>("input[data-location-search]")].find(
    (el) => el.offsetParent !== null,
  );
  if (!field) return false;
  field.focus();
  field.scrollIntoView({ block: "nearest" });
  return true;
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** OneMap-backed place search (GET /geo/search) that sets the manual location. */
export function LocationSearch({
  className,
  autoFocus,
  showLocate = true,
  trailing,
}: {
  className?: string;
  autoFocus?: boolean;
  /** False where the page has its own locate button (the home map). */
  showLocate?: boolean;
  /** A control that rides inside the pill's right end (the map's Filters button on phones). */
  trailing?: React.ReactNode;
}) {
  const { setManual, locate, status } = useLocation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q.trim(), 300);
  const listId = useId();

  const online = useOnline();
  const res = useQuery({
    queryKey: ["geo-search", dq],
    queryFn: ({ signal }) => api.geoSearch(dq, signal),
    enabled: dq.length >= 2 && online,
    staleTime: 5 * 60_000,
    // A place search that can't reach OneMap falls back to the bundled stations at once; no point retrying.
    retry: false,
  });
  // No signal (or OneMap down, or the request stuck): the bundled MRT and bus interchange list still answers.
  const offline = dq.length >= 2 && (!online || res.isError || res.fetchStatus === "paused");
  const stations = useMemo(() => (offline ? searchStations(dq, 8) : []), [offline, dq]);
  const items: { name: string; address: string; lat: number; lng: number }[] = offline
    ? stations.map((s) => ({ name: stationName(s), address: s.lines.join(" · "), lat: s.lat, lng: s.lng }))
    : (res.data?.items.slice(0, 8).map((it) => ({ ...it, name: tidyPlaceName(it.name), address: tidyPlaceAddress(it.address, it.name) })) ??
      []);

  return (
    <div className={cx("relative", className)}>
      <div
        className={cx(
          "flex items-center gap-2 rounded-full border-2 border-border-strong bg-surface pl-4 shadow-card focus-within:border-primary has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
          q || showLocate || trailing ? "pr-1" : "pr-4",
        )}
      >
        <Search className="size-5 shrink-0 text-muted" aria-hidden />
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search a place, MRT station or postal code
        </label>
        <input
          id={`${listId}-input`}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoFocus={autoFocus}
          data-location-search=""
          placeholder="MRT, mall or postal code"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open && items.length > 0}
          // The pill has its own clear button, so the browser's search-field "x" is hidden.
          className="min-h-12 w-full bg-transparent text-base text-fg placeholder:text-muted focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {q ? (
          <button type="button" className="tap flex items-center justify-center text-muted" onClick={() => setQ("")} aria-label="Clear search">
            <X className="size-5" aria-hidden />
          </button>
        ) : showLocate ? (
          <button
            type="button"
            onClick={() => void locate()}
            className="tap flex items-center justify-center text-primary"
            aria-label="Use my location"
            disabled={status === "locating"}
          >
            <LocateFixed className={cx("size-5", status === "locating" && "animate-pulse")} aria-hidden />
          </button>
        ) : null}
        {trailing}
      </div>
      {open && dq.length >= 2 ? (
        <ul
          id={listId}
          aria-label="Search results"
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-3xl border border-border bg-surface py-2 shadow-card"
        >
          {offline ? (
            <li className="px-4 pb-1 pt-2 text-xs font-extrabold text-muted" aria-hidden>
              Stations (offline)
            </li>
          ) : null}
          {!offline && res.isLoading ? <li className="px-4 py-3 text-muted">Searching…</li> : null}
          {offline && items.length === 0 ? (
            <li className="px-4 py-3 text-muted">
              {online ? "Place search isn't answering." : "No signal."} Try the name of an MRT station or bus interchange.
            </li>
          ) : null}
          {!offline && res.isSuccess && items.length === 0 ? <li className="px-4 py-3 text-muted">No places found.</li> : null}
          {items.map((it, i) => (
            <li key={`${it.lat},${it.lng},${i}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-surface-2"
                onClick={() => {
                  setManual({ lat: it.lat, lng: it.lng, name: it.name });
                  setQ("");
                  setOpen(false);
                }}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block font-semibold">
                    {it.name}
                    {offline ? <span className="sr-only">, from the offline station list</span> : null}
                  </span>
                  {it.address ? <span className="block text-sm text-muted">{it.address}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Says where results are measured from whenever it isn't a fresh fix of where you are: a searched place,
 * the fallback (never presented as "you"), or a GPS fix old enough to have its age shown.
 */
export function LocationNotice({ className }: { className?: string }) {
  const { status, source, placeName } = useLocation();
  const age = useFixAge();
  if (source === "gps") {
    if (age === null) return null;
    return (
      <p role="status" className={cx("rounded-2xl bg-warn-soft px-4 py-2.5 text-sm font-bold text-fg", className)}>
        From where you were {age} min ago.{status === "locating" ? " Updating your location…" : null}
      </p>
    );
  }
  // Nothing tried yet: the page is about to ask, so there's nothing to explain.
  if (status === "idle" && source === "default") return null;
  const why =
    status === "denied"
      ? "Location permission is off"
      : status === "unavailable"
        ? "We couldn't get your location"
        : status === "locating" && source === "default"
          ? "Still finding you"
          : null;
  return (
    <p role="status" className={cx("rounded-2xl bg-warn-soft px-4 py-2.5 text-sm font-bold text-fg", className)}>
      {why ? `${why}. ` : ""}
      Showing toilets near <strong>{placeName ?? "Raffles Place"}</strong>. Search above to change.
    </p>
  );
}

/**
 * What a failed locate tap says, so it never just does nothing: why, a way round it (search for where you
 * are), and one line on turning location back on.
 */
export function LocateFailed({ onDismiss, className }: { onDismiss?: () => void; className?: string }) {
  const { status } = useLocation();
  if (status !== "denied" && status !== "unavailable") return null;
  return (
    <div role="alert" className={cx("rounded-3xl border border-border/70 bg-surface p-3 text-sm shadow-card", className)}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 font-bold">
          {status === "denied" ? "Location is off for this site." : "Couldn't find your location. Underground or indoors, phones often can't."}
        </p>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className="tap -m-2 flex shrink-0 items-center justify-center rounded-full text-muted" aria-label="Dismiss">
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-muted">
        {status === "denied"
          ? "To turn it on, allow location for this site in your browser's settings, then reload."
          : "Check that location is on in your phone's settings, or search instead."}
      </p>
      <button
        type="button"
        onClick={() => {
          if (focusLocationSearch()) onDismiss?.();
        }}
        className={buttonClass("primary", "sm", "mt-2")}
      >
        <Search className="size-4" aria-hidden /> Search your MRT or mall
      </button>
    </div>
  );
}
