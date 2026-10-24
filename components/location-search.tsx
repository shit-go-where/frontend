"use client";

import { useQuery } from "@tanstack/react-query";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";
import { api } from "@/lib/api/client";
import { tidyPlaceAddress, tidyPlaceName } from "@/lib/format";
import { useInAppBrowser } from "@/lib/in-app-browser";
import { haversineM, useFixAge, useLocation, type LatLng } from "@/lib/location";
import { useOnline } from "@/lib/offline";
import { telegramStartUrl } from "@/lib/site";
import { STATIONS, searchStations, type Station } from "@/lib/stations";
import { Button, buttonClass, cx } from "./ui";

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
                className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-surface-2 active:bg-surface-2"
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
 * The map page's own ask, before the browser's: why it wants your location, then the prompt from a tap that
 * means yes (a prompt on arrival gets declined by reflex, and Chrome then never asks again). Only for someone
 * the browser has never asked (`askFirst`), while the list is still around the fallback place.
 */
export function LocationAsk({ onLocate, className }: { onLocate: () => Promise<boolean>; className?: string }) {
  const { askFirst, status, source, placeName } = useLocation();
  const shown = !!askFirst && status === "idle" && source === "default";
  useEffect(() => {
    if (shown) track("location_ask", { step: "shown" });
  }, [shown]);
  if (!shown) return null;
  return (
    <div role="group" aria-label="Your location" className={cx("rounded-2xl bg-primary-soft px-4 py-3 text-sm", className)}>
      <p className="font-bold text-fg">See the toilets nearest you</p>
      <p className="mt-0.5 text-muted">Showing {placeName ?? "Raffles Place"} until you share where you are.</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Button
          size="sm"
          onClick={async () => {
            track("location_ask", { step: "tap" });
            const ok = await onLocate();
            track("location_ask", { step: ok ? "located" : "failed" });
          }}
        >
          <LocateFixed className="size-4" aria-hidden />
          Use my location
        </Button>
        <button
          type="button"
          onClick={() => {
            track("location_ask", { step: "search" });
            focusLocationSearch();
          }}
          className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-2"
        >
          Search instead
        </button>
      </div>
    </div>
  );
}

const noSubscribe = () => () => {};

/** Chrome 144+: a location button the browser draws itself, which can ask again even after "Never allow". */
const hasGeolocationElement = () => "HTMLGeolocationElement" in window;

type Device = "ios-safari" | "ios-other" | "android" | "desktop";

function device(): Device {
  const ua = navigator.userAgent;
  // iPads ask for the desktop site and say Macintosh; a touch screen gives them away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios-safari";
  }
  return /Android/.test(ua) ? "android" : "desktop";
}

const TURN_ON_STEPS: Record<Device, string> = {
  "ios-safari": "In Safari, tap aA in the address bar, then Website Settings › Location › Allow.",
  "ios-other": "Open your phone's Settings, tap your browser, then Location › While Using the App.",
  android: "Tap the icon at the left of the address bar, then Permissions › Location › Allow.",
  desktop: "Click the icon at the left of the address bar and allow Location.",
};

/** The browser's own location button (`<geolocation>`); its label and prompt are the browser's. */
function GeolocationButton({ className }: { className?: string }) {
  const { ingest } = useLocation();
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const box = host.current;
    if (!box) return;
    // Made by hand: React has no idea what <geolocation> is, and wouldn't wire up its `location` event.
    const el = document.createElement("geolocation") as HTMLElement & { position?: GeolocationPosition | null };
    el.setAttribute("accuracymode", "precise");
    // Chrome disables the button if it's styled to hide (low contrast, see-through), so it stays plain.
    el.className = "min-h-11 rounded-full border border-border bg-surface-2 px-4 text-sm font-extrabold text-fg";
    const onLocation = () => {
      if (el.position) ingest(el.position);
    };
    el.addEventListener("location", onLocation);
    box.append(el);
    return () => {
      el.removeEventListener("location", onLocation);
      el.remove();
    };
  }, [ingest]);
  return <span ref={host} className={cx("flex", className)} />;
}

/**
 * The way back after location was refused. Chrome 144+ shows its own location button, which can ask again;
 * elsewhere, the steps for this browser and (with `onRetry`) a Try again for a prompt that was only closed.
 * `compact` (the sheet's notice) shows only the browser's button, and nothing where there isn't one.
 */
export function TurnOnLocation({ onRetry, compact, className }: { onRetry?: () => void; compact?: boolean; className?: string }) {
  const inApp = useInAppBrowser();
  const element = useSyncExternalStore(noSubscribe, hasGeolocationElement, () => false);
  const steps = TURN_ON_STEPS[useSyncExternalStore<Device>(noSubscribe, device, () => "desktop")];
  if (element) return <GeolocationButton className={className} />;
  if (compact) return null;
  return (
    <div className={className}>
      <p className="text-muted">
        {inApp
          ? `An app's own browser often can't share your location. Open this page in ${inApp === "ios" ? "Safari" : "Chrome"} instead.`
          : steps}
      </p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          <LocateFixed className="size-4" aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Says where results are measured from whenever it isn't a fresh fix of where you are: a searched place,
 * the fallback (never presented as "you"), or a GPS fix old enough to have its age shown.
 */
/**
 * `telegram` (the home map only) adds the bot as a second way round a blocked location: it takes a
 * location shared in the chat, which needs no browser permission. Place search stays the first fix.
 */
export function LocationNotice({ className, telegram = false }: { className?: string; telegram?: boolean }) {
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
  const bot = telegram && (status === "denied" || status === "unavailable") ? telegramStartUrl("near") : null;
  return (
    <div role="status" className={cx("rounded-2xl bg-warn-soft px-4 py-2.5 text-sm font-bold text-fg", className)}>
      <p>
        {why ? `${why}. ` : ""}
        Showing toilets near <strong>{placeName ?? "Raffles Place"}</strong>. Search above to change.
      </p>
      {status === "denied" ? <TurnOnLocation compact className="mt-2" /> : null}
      {bot ? (
        <p className="mt-1 font-medium text-muted">
          Or{" "}
          {/* A 44 px target that keeps the line its own height. */}
          <a
            href={bot}
            target="_blank"
            rel="noopener noreferrer"
            className="-my-3 inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-2"
          >
            send your location to the Telegram bot
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}

/**
 * What a failed locate tap says, so it never just does nothing: why, a way round it (search for where you
 * are), and one line on turning location back on.
 */
export function LocateFailed({ onDismiss, className }: { onDismiss?: () => void; className?: string }) {
  const { status, locate } = useLocation();
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
      {status === "denied" ? (
        <TurnOnLocation onRetry={() => void locate()} className="mt-1" />
      ) : (
        <p className="mt-1 text-muted">Check that location is on in your phone&apos;s settings, or search instead.</p>
      )}
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
