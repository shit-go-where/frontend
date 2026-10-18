"use client";

import { useQuery } from "@tanstack/react-query";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api/client";
import { useLocation } from "@/lib/location";
import { cx } from "./ui";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** OneMap-backed place search (GET /geo/search) that sets the manual location. */
export function LocationSearch({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const { setManual, locate, status } = useLocation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q.trim(), 300);
  const listId = useId();

  const res = useQuery({
    queryKey: ["geo-search", dq],
    queryFn: ({ signal }) => api.geoSearch(dq, signal),
    enabled: dq.length >= 2,
    staleTime: 5 * 60_000,
  });
  const items = res.data?.items.slice(0, 8) ?? [];

  return (
    <div className={cx("relative", className)}>
      <div className="flex items-center gap-2 rounded-full border-2 border-border bg-surface pl-4 pr-1 shadow-card focus-within:border-primary has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
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
          className="min-h-12 w-full bg-transparent text-base text-fg placeholder:text-muted focus:outline-none"
        />
        {q ? (
          <button type="button" className="tap flex items-center justify-center text-muted" onClick={() => setQ("")} aria-label="Clear search">
            <X className="size-5" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void locate()}
            className="tap flex items-center justify-center text-primary"
            aria-label="Use my location"
            disabled={status === "locating"}
          >
            <LocateFixed className={cx("size-5", status === "locating" && "animate-pulse")} aria-hidden />
          </button>
        )}
      </div>
      {open && dq.length >= 2 ? (
        <ul
          id={listId}
          aria-label="Search results"
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-3xl border border-border bg-surface py-2 shadow-card"
        >
          {res.isLoading ? <li className="px-4 py-3 text-muted">Searching…</li> : null}
          {res.isError ? <li className="px-4 py-3 text-danger">Search is unavailable right now.</li> : null}
          {res.isSuccess && items.length === 0 ? <li className="px-4 py-3 text-muted">No places found.</li> : null}
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
                  <span className="block font-semibold">{it.name}</span>
                  <span className="block text-sm text-muted">{it.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Explains where results are centred when GPS isn't available. */
export function LocationNotice() {
  const { status, source, placeName } = useLocation();
  if (source === "gps") return null;
  if (status === "locating" || status === "idle") return null;
  const why =
    status === "denied"
      ? "Location permission is off"
      : status === "unavailable"
        ? "We couldn't get your location"
        : null;
  return (
    <p role="status" className="rounded-2xl bg-warn-soft px-4 py-2.5 text-sm font-bold text-fg">
      {why ? `${why}. ` : ""}
      Showing toilets near <strong>{placeName ?? "Raffles Place"}</strong>. Search above to change.
    </p>
  );
}
