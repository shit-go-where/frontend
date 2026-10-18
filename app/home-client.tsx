"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LocateFixed, Navigation, X } from "lucide-react";
import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/bottom-sheet";
import { LocationNotice, LocationSearch } from "@/components/location-search";
import { ToiletMap, type Bounds, type MapFocus, type MapView } from "@/components/map";
import { FilterChipLabel, TierLegend, ToiletCard } from "@/components/toilet-bits";
import { Chip, EmptyState, ErrorState, Skeleton, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type { ToiletSummary } from "@/lib/api/types";
import { FILTERS, toFilterQuery } from "@/lib/filters";
import { formatDistance } from "@/lib/format";
import { estimateWalkSeconds, haversineM, roundCoord, useLocation, type LatLng } from "@/lib/location";
import { useStoredFilters } from "@/lib/use-filters";
import { useFlipList } from "@/lib/use-flip";
import { useTopCard } from "@/lib/use-top-card";

/** Quick taps on several chips become one refetch. */
const FILTER_SETTLE_MS = 160;
const NEAR_RADIUS_M = 1000;
const LIST_LIMIT = 50;
/** The widest search /toilets/nearby allows. */
const MAX_RADIUS_M = 5000;

const inside = (b: Bounds, p: LatLng) => p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
const toilets = (n: number) => `${n} toilet${n === 1 ? "" : "s"}`;

/** The search circle for a map area: centred where the person is looking, just wide enough to reach its corners. */
function areaSearch({ center, open }: MapView) {
  const reach = Math.max(
    ...[
      { lat: open.maxLat, lng: open.minLng },
      { lat: open.maxLat, lng: open.maxLng },
      { lat: open.minLat, lng: open.minLng },
      { lat: open.minLat, lng: open.maxLng },
    ].map((corner) => haversineM(center, corner)),
  );
  return {
    lat: roundCoord(center.lat),
    lng: roundCoord(center.lng),
    radius: Math.min(MAX_RADIUS_M, Math.ceil(reach / 50) * 50),
    /** Zoomed out past the widest search: the list can only hold what's nearest the middle. */
    capped: reach > MAX_RADIUS_M,
    open,
  };
}

export function HomeClient() {
  const loc = useLocation();
  const { active, toggle, clear } = useStoredFilters();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [sheetPx, setSheetPx] = useState(330);
  const [sheetSnap, setSheetSnap] = useState(0);
  const [snapRequest, setSnapRequest] = useState<{ index: number; key: number } | null>(null);

  // Chips flip at once; the list and pins follow once tapping pauses, as a low-priority render.
  const [queryFilters, setQueryFilters] = useState(active);
  useEffect(() => {
    if (queryFilters === active) return;
    const t = window.setTimeout(() => startTransition(() => setQueryFilters(active)), FILTER_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [active, queryFilters]);
  const fq = useMemo(() => toFilterQuery(queryFilters), [queryFilters]);
  const lat = roundCoord(loc.coords.lat);
  const lng = roundCoord(loc.coords.lng);
  const user = loc.source === "gps" ? loc.coords : null;

  /*
   * Two lists: near you (1 km around your spot), and once your spot is off the open map, whatever the map shows.
   * Each view is tagged with the recentre it came from, so a view from before a jump (locate, search, "Back to
   * near me") can't flip the list while the camera is still flying.
   */
  const recenterKey = `${loc.coords.lat},${loc.coords.lng},${recenter}`;
  const [view, setView] = useState<(MapView & { key: string }) | null>(null);
  const onViewChange = useCallback((v: MapView) => setView({ ...v, key: recenterKey }), [recenterKey]);
  const awayFromSpot = loc.settled && !!view && view.key === recenterKey && !inside(view.open, loc.coords);
  const area = useMemo(() => (awayFromSpot && view ? areaSearch(view) : null), [awayFromSpot, view]);

  const nearby = useQuery({
    queryKey: area ? ["nearby", "area", area, fq] : ["nearby", lat, lng, fq],
    queryFn: async ({ signal }) => {
      const at = area ?? { lat, lng, radius: NEAR_RADIUS_M };
      const res = await api.nearbyToilets(
        { lat: at.lat, lng: at.lng, radius: at.radius, limit: LIST_LIMIT, features: fq.features, openNow: fq.openNow, areaType: fq.areaType },
        signal,
      );
      // The list remembers which mode it was fetched for, so a list kept on screen while the next one loads stays labelled right.
      return { ...res, area };
    },
    enabled: loc.settled,
    placeholderData: keepPreviousData,
  });
  const listArea = nearby.data?.area ?? null;
  const items = useMemo(() => {
    const raw = nearby.data?.items ?? [];
    const a = nearby.data?.area;
    if (!a) return raw;
    // Only what's on screen, so list and pins agree. Walk times stay from you, never from the map centre.
    return raw
      .filter((t) => inside(a.open, t))
      .map((t) => {
        if (!user) return { ...t, distanceM: undefined, walkSecondsEstimate: undefined };
        const d = haversineM(user, t);
        return { ...t, distanceM: Math.round(d), walkSecondsEstimate: estimateWalkSeconds(d) };
      });
  }, [nearby.data, user]);
  /** Filters changed but their results haven't landed: the stale list and pins dim instead of sitting there looking final. */
  const filtering = active !== queryFilters;
  const updating = filtering || (nearby.isPlaceholderData && nearby.isFetching);
  // The selected toilet sits in its own card above the list, so leave it out of the list.
  const listItems = useMemo(() => items.filter((t) => t.id !== selectedId), [items, selectedId]);
  const listRef = useRef<HTMLUListElement>(null);
  const itemKeys = useMemo(() => listItems.map((t) => t.id), [listItems]);
  useFlipList(listRef, itemKeys);
  // A full page of results means the area holds more than the list can: say which ones these are.
  const crowded = !!listArea && (listArea.capped || (nearby.data?.items.length ?? 0) >= LIST_LIMIT);
  const sheetTitle =
    nearby.isLoading || !loc.settled
      ? "Finding toilets…"
      : listArea
        ? items.length === 0
          ? "Toilets in this area"
          : crowded
            ? `${toilets(items.length)} nearest the map centre`
            : `${toilets(items.length)} in this area`
        : items.length
          ? `${toilets(items.length)} within 1 km`
          : "Nearby toilets";
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
  // The map keeps its framing at the top snap: the sheet covers it, and padding taller than the map makes the camera jump.
  const onSnapChange = useCallback((i: number, px: number) => {
    setSheetSnap(i);
    if (i < 2) setSheetPx(px);
  }, []);

  const locateMe = async () => {
    const c = await loc.locate();
    if (c) setRecenter((n) => n + 1);
  };
  // Flying back to your spot puts it on the open map again, which brings back the near-you list.
  const backToNear = () => setRecenter((n) => n + 1);
  // Phones: search and chips cover the top, the sheet the bottom. Desktop: the sheet is a side panel.
  const [phone, setPhone] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // What the map points out: a picked pin, else the hovered card (desktop), else the card the list is scrolled to (phones).
  const topId = useTopCard(listRef, itemKeys, phone && !nearby.isLoading);
  const focusId = selectedId ?? hoverId ?? topId;
  const focus = useMemo<MapFocus | null>(() => {
    const t = focusId && selected?.id === focusId ? selected : items.find((i) => i.id === focusId);
    if (!t) return null;
    return {
      id: t.id,
      lat: t.lat,
      lng: t.lng,
      tier: t.tier,
      pending: t.status === "PENDING",
      name: t.venue.name,
      distance: formatDistance(t.distanceM),
      picked: t.id === selectedId,
    };
  }, [focusId, selected, items, selectedId]);

  // The sheet stops below the search and filters instead of sliding under them.
  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayBottom, setOverlayBottom] = useState(0);
  // How far the search and filters reach into the map (two rows of chips on desktop, one on phones).
  const [overlayDepth, setOverlayDepth] = useState(0);
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const measure = () => {
      // Zero while the map page is hidden on another tab; keep the last real value.
      if (!el.offsetHeight) return;
      setOverlayBottom(Math.round(el.getBoundingClientRect().bottom));
      setOverlayDepth(el.offsetTop + el.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The camera centres in the map left open between the search and filters and the sheet.
  const padTop = overlayDepth ? overlayDepth + 12 : phone ? 130 : 180;
  const mapPad = useMemo(() => ({ top: padTop, bottom: phone ? sheetPx + 72 : 0 }), [padTop, phone, sheetPx]);
  // The off-screen pill also keeps clear of the locate button (above the sheet on phones, bottom-right on desktop).
  const hintInset = useMemo(() => ({ bottom: phone ? 64 : 88 }), [phone]);

  const locateButton = (
    <button
      type="button"
      onClick={locateMe}
      className="flex size-12 items-center justify-center rounded-full border-2 border-border bg-surface text-primary shadow-card transition-transform duration-100 active:scale-90"
      aria-label="Centre on my location"
    >
      <LocateFixed className={cx("size-6", loc.status === "locating" && "animate-pulse")} aria-hidden />
    </button>
  );
  // Rides beside the locate button: both bring the map back to you, and the sheet's peek has no room to spare.
  const mapControls = (
    <div className="flex items-center gap-2">
      {area ? (
        <button
          type="button"
          onClick={backToNear}
          className="rise-in flex min-h-12 items-center gap-2 rounded-full border-2 border-border bg-surface pl-3.5 pr-4 text-sm font-extrabold text-fg shadow-card transition-transform duration-100 active:scale-95"
        >
          <Navigation className="size-4 text-primary" aria-hidden />
          Back to near me
        </button>
      ) : null}
      {locateButton}
    </div>
  );

  return (
    <div className="fixed inset-0 md:top-16" data-testid="home">
      <h1 className="sr-only">Toilets near you</h1>
      {/* Map fills the screen; on desktop it sits right of the side panel. */}
      <div className="absolute inset-0 md:left-[420px]">
        <ToiletMap
          className="size-full"
          center={loc.coords}
          recenterKey={recenterKey}
          zoom={16}
          user={user}
          features={fq.features}
          openNow={fq.openNow}
          areaType={fq.areaType}
          onViewChange={onViewChange}
          selectedId={selectedId}
          focus={focus}
          // At the top snap the sheet covers the map, so there's nothing to point from.
          focusHint={!phone || sheetSnap < 2}
          focusInset={hintInset}
          // Only for filter changes: panning refetches the list too, and the pins shouldn't fade for that.
          dimPins={filtering}
          onSelect={onSelect}
          viewPadding={mapPad}
        />
      </div>

      {/* Top overlay: search + filters */}
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:left-[420px] md:pr-16"
      >
        {/* Desktop: one column as wide as the chips on one line (or the map, clear of the zoom controls), so search and filters share both edges. */}
        <div className="flex flex-col gap-2 md:w-fit md:max-w-full">
          <div className="pointer-events-auto">
            <LocationSearch showLocate={false} />
          </div>
          <div
            className="no-scrollbar pointer-events-auto flex gap-2 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] md:pointer-events-none md:flex-wrap md:overflow-visible md:[mask-image:none]"
            role="group"
            aria-label="Filters"
          >
            {FILTERS.map((f) => (
              <Chip
                key={f.key}
                active={active.has(f.key)}
                onClick={() => toggle(f.key)}
                className="pointer-events-auto shadow-card md:grow"
              >
                <FilterChipLabel k={f.key} label={f.label} active={active.has(f.key)} />
              </Chip>
            ))}
            {/* Phones: lets the last chip scroll clear of the edge fade. */}
            <span aria-hidden className="w-8 shrink-0 md:hidden" />
          </div>
        </div>
      </div>

      {/* Desktop: locate sits on the map; on phones it rides on top of the sheet. */}
      <div className="absolute bottom-8 right-4 z-20 hidden md:block">{mapControls}</div>

      <BottomSheet
        label="Nearby toilets"
        floating={mapControls}
        onSnapChange={onSnapChange}
        snapRequest={snapRequest}
        topInset={phone ? overlayBottom : undefined}
        busy={updating}
        header={
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xl leading-tight">
                {/* Keyed so a new count rises in rather than snapping. */}
                <span key={sheetTitle} className="rise-in">
                  {sheetTitle}
                </span>
                <span className="sr-only" aria-live="polite">
                  {updating ? "Updating results" : listArea ? "Now listing toilets in this map area" : ""}
                </span>
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
          <div key={selected.id} className="rise-in mb-3">
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
        ) : items.length === 0 && listArea ? (
          <div className="rise-in">
            <EmptyState title="Eh, no toilet around here leh">
              {active.size ? (
                <>
                  Try zooming out or removing a filter.{" "}
                  <button type="button" className="font-semibold text-primary underline" onClick={clear}>
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  Nothing on this part of the map yet. Zoom out, or if you know one,{" "}
                  <Link href="/add" className="font-semibold text-primary underline">
                    add it
                  </Link>
                  .
                </>
              )}
            </EmptyState>
          </div>
        ) : items.length === 0 ? (
          <div className="rise-in">
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
          </div>
        ) : (
          <ul
            ref={listRef}
            className="flex flex-col gap-3"
            aria-label={listArea ? "Toilets in this map area, nearest the centre first" : "Toilets sorted by distance"}
          >
            {listItems.map((t) => (
              <li key={t.id} data-flip-key={t.id}>
                <ToiletCard t={t} onHover={setHoverId} />
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
