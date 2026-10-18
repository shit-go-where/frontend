"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LocateFixed, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/bottom-sheet";
import { LocationNotice, LocationSearch } from "@/components/location-search";
import { ToiletMap } from "@/components/map";
import { TierLegend, ToiletCard } from "@/components/toilet-bits";
import { Chip, EmptyState, ErrorState, Skeleton, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type { ToiletSummary } from "@/lib/api/types";
import { FILTERS, toFilterQuery } from "@/lib/filters";
import { roundCoord, useLocation } from "@/lib/location";
import { useStoredFilters } from "@/lib/use-filters";

export function HomeClient() {
  const loc = useLocation();
  const { active, toggle, clear } = useStoredFilters();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [sheetPx, setSheetPx] = useState(200);
  const [snapRequest, setSnapRequest] = useState<{ index: number; key: number } | null>(null);

  const fq = useMemo(() => toFilterQuery(active), [active]);
  const lat = roundCoord(loc.coords.lat);
  const lng = roundCoord(loc.coords.lng);

  const nearby = useQuery({
    queryKey: ["nearby", lat, lng, fq],
    queryFn: ({ signal }) =>
      api.nearbyToilets(
        { lat, lng, radius: 1000, limit: 50, features: fq.features, openNow: fq.openNow, areaType: fq.areaType },
        signal,
      ),
    enabled: loc.settled,
    placeholderData: keepPreviousData,
  });
  const items = nearby.data?.items ?? [];
  const inList = items.find((t) => t.id === selectedId) ?? null;

  // A pin that isn't in the nearby list (e.g. after panning): fetch it.
  const selectedQ = useQuery({
    queryKey: ["toilet", selectedId],
    queryFn: ({ signal }) => api.toilet(selectedId!, signal),
    enabled: !!selectedId && !inList,
  });
  const selected: ToiletSummary | null = inList ?? (selectedQ.data as ToiletSummary | undefined) ?? null;
  const hasImported = items.some((t) => t.tier === "IMPORTED");

  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    setSnapRequest({ index: 1, key: Date.now() });
  }, []);
  const onSnapChange = useCallback((_i: number, px: number) => setSheetPx(px), []);

  const locateMe = async () => {
    const c = await loc.locate();
    if (c) setRecenter((n) => n + 1);
  };

  const user = loc.source === "gps" ? loc.coords : null;
  // Phones: search and chips cover the top, the sheet the bottom. Desktop: the sheet is a side panel.
  const [phone, setPhone] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const mapPad = useMemo(() => (phone ? { top: 130, bottom: sheetPx + 72 } : { top: 120, bottom: 0 }), [phone, sheetPx]);

  return (
    <div className="fixed inset-0 md:top-16" data-testid="home">
      <h1 className="sr-only">Toilets near you</h1>
      {/* Map fills the screen; on desktop it sits right of the side panel. */}
      <div className="absolute inset-0 md:left-[420px]">
        <ToiletMap
          className="size-full"
          center={loc.coords}
          recenterKey={`${loc.coords.lat},${loc.coords.lng},${recenter}`}
          zoom={16}
          user={user}
          features={fq.features}
          selectedId={selectedId ?? hoverId}
          onSelect={onSelect}
          viewPadding={mapPad}
        />
      </div>

      {/* Top overlay: search + filters */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:left-[420px] md:max-w-2xl">
        <div className="pointer-events-auto">
          <LocationSearch />
        </div>
        <div
          className="no-scrollbar pointer-events-auto -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] md:[mask-image:none]"
          role="group"
          aria-label="Filters"
        >
          {FILTERS.map((f) => (
            <Chip key={f.key} active={active.has(f.key)} onClick={() => toggle(f.key)} className="shadow-card">
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Locate me, floats above the sheet on phones */}
      <button
        type="button"
        onClick={locateMe}
        className="absolute bottom-[var(--locate-b)] right-4 z-20 flex size-12 items-center justify-center rounded-full border-2 border-border bg-surface text-primary shadow-card md:bottom-8"
        style={{ "--locate-b": `calc(${sheetPx}px + 5.5rem)` } as React.CSSProperties}
        aria-label="Centre on my location"
      >
        <LocateFixed className={cx("size-6", loc.status === "locating" && "animate-pulse")} aria-hidden />
      </button>

      <BottomSheet
        label="Nearby toilets"
        onSnapChange={onSnapChange}
        snapRequest={snapRequest}
        header={
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xl leading-tight">
                {nearby.isLoading || !loc.settled
                  ? "Finding toilets…"
                  : items.length
                    ? `${items.length} toilet${items.length === 1 ? "" : "s"} within 1 km`
                    : "Nearby toilets"}
              </h2>
              <Link
                href="/go"
                className="-my-2 inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline"
              >
                Help me choose
              </Link>
            </div>
            <TierLegend />
            <LocationNotice />
          </div>
        }
      >
        {selected ? (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Selected on map</span>
              <button
                type="button"
                className="tap flex items-center justify-center rounded-full text-muted"
                onClick={() => setSelectedId(null)}
                aria-label="Clear selection"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <ToiletCard t={selected} selected />
          </div>
        ) : null}

        {nearby.isError && !nearby.data ? (
          <ErrorState message={errorMessage(nearby.error)} onRetry={() => void nearby.refetch()} />
        ) : nearby.isLoading || !loc.settled ? (
          <div className="flex flex-col gap-3" aria-hidden>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="Wah, no toilet nearby leh">
            {active.size ? (
              <>
                Try removing a filter or two.{" "}
                <button type="button" className="font-semibold text-primary underline" onClick={clear}>
                  Clear filters
                </button>
              </>
            ) : (
              <>
                Nothing within 1 km of here yet. Know one?{" "}
                <Link href="/add" className="font-semibold text-primary underline">
                  Add it
                </Link>
                .
              </>
            )}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Toilets sorted by distance">
            {items.map((t) => (
              <li key={t.id}>
                <ToiletCard t={t} selected={t.id === selectedId} onHover={setHoverId} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">
          {hasImported ? "Some toilet data © OpenStreetMap contributors (ODbL). " : ""}
          <Link href="/about" className="font-semibold underline">
            How we rate toilets and where the data comes from
          </Link>
        </p>
      </BottomSheet>
    </div>
  );
}
