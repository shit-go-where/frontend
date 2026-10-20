"use client";

import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { ChevronRight, CloudOff, LocateFixed, MapPinCheck, Navigation, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet, SHEET_PEEK, SHEET_TOP } from "@/components/bottom-sheet";
import { LocateFailed, LocationNotice, LocationSearch, nearestStationName } from "@/components/location-search";
import { ToiletMap, type Bounds, type MapFocus, type MapView } from "@/components/map";
import { FilterChipLabel, TierLegend, ToiletCard } from "@/components/toilet-bits";
import { Button, Chip, Dialog, EmptyState, ErrorState, Skeleton, buttonClass, cx } from "@/components/ui";
import { NetworkError, api, errorMessage } from "@/lib/api/client";
import type { ToiletSummary } from "@/lib/api/types";
import { levelShort } from "@/lib/level";
import { FILTERS, FILTER_LABEL, MUST_HAVE_GROUPS, toFilterQuery } from "@/lib/filters";
import { formatDistance, isClosedNow, savedAge } from "@/lib/format";
import { estimateWalkSeconds, haversineM, roundCoord, useLocation, type LatLng } from "@/lib/location";
import { remeasure, useOnline, type SavedFrom } from "@/lib/offline";
import { useStoredFilters } from "@/lib/use-filters";
import { useFlipList } from "@/lib/use-flip";
import { useTopCard } from "@/lib/use-top-card";

/** Quick taps on several chips become one refetch. */
const FILTER_SETTLE_MS = 160;
const NEAR_RADIUS_M = 1000;
/** "Search further" from an empty near list: the urgent flow's middle step, still a walk. */
const WIDE_RADIUS_M = 3000;
const LIST_LIMIT = 50;
/** The widest search /toilets/nearby allows. */
const MAX_RADIUS_M = 5000;
/**
 * Standing this close to a toilet (by a fix at least this accurate) offers a check-in on the map.
 * Tighter than the API's 150 m so walking past a mall doesn't count as being there.
 */
const AT_TOILET_M = 50;

const inside = (b: Bounds, p: LatLng) => p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;
const toilets = (n: number) => `${n} toilet${n === 1 ? "" : "s"}`;

/** Open (or not known shut) first, keeping the distance order within each group: for the map-area list. */
function openFirst(list: ToiletSummary[]): ToiletSummary[] {
  const shut = list.filter(isClosedNow);
  return shut.length ? [...list.filter((t) => !isClosedNow(t)), ...shut] : list;
}

/** The service worker's saved copy, when that's what answered (lib/api/client.ts adds `saved`). */
const savedOf = (res: unknown): SavedFrom | null => (res as { saved?: SavedFrom } | null)?.saved ?? null;
/** Requests that can't reach the API: no signal, or the request timed out. */
const offlineError = (e: unknown) => e instanceof NetworkError;

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
  /** A tapped building (or spot) on the map: its toilets, lowest level first. */
  const [groupIds, setGroupIds] = useState<string[] | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [sheetPx, setSheetPx] = useState(330);
  const [sheetSnap, setSheetSnap] = useState(SHEET_PEEK);
  const [snapRequest, setSnapRequest] = useState<{ index: number; key: number } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  /** A searched or fallback place: distances are measured from it and labelled with its name. */
  const placeFrom = loc.source === "gps" ? null : loc.coords;

  // The map page needs a location, so it asks on its first visit (other pages never prompt).
  const { locate } = loc;
  useEffect(() => {
    void locate();
  }, [locate]);

  /*
   * Two lists: near you (1 km around your spot), and once your spot is off the open map, whatever the map shows.
   * Each view is tagged with the recentre it came from, so a view from before a jump (locate, search, "Back to
   * near me") can't flip the list while the camera is still flying.
   */
  const recenterKey = `${loc.coords.lat},${loc.coords.lng},${recenter}`;
  // Widened from an empty list; back to 1 km whenever the spot changes.
  const [nearRadius, setNearRadius] = useState(NEAR_RADIUS_M);
  const [radiusFor, setRadiusFor] = useState(recenterKey);
  if (radiusFor !== recenterKey) {
    setRadiusFor(recenterKey);
    setNearRadius(NEAR_RADIUS_M);
  }
  const [view, setView] = useState<(MapView & { key: string }) | null>(null);
  const onViewChange = useCallback((v: MapView) => setView({ ...v, key: recenterKey }), [recenterKey]);
  const awayFromSpot = loc.settled && !!view && view.key === recenterKey && !inside(view.open, loc.coords);
  const area = useMemo(() => (awayFromSpot && view ? areaSearch(view) : null), [awayFromSpot, view]);

  const nearby = useQuery({
    queryKey: area ? ["nearby", "area", area, fq] : ["nearby", lat, lng, nearRadius, fq],
    queryFn: async ({ signal }) => {
      const at = area ?? { lat, lng, radius: nearRadius };
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
  const online = useOnline();
  /** The service worker answered from its saved copy: no signal, or the network was too slow. */
  const saved = savedOf(nearby.data);
  // Offline with nothing on screen: the request is waiting for a network that isn't there, or gave up.
  const offlineNoList =
    !nearby.data && ((nearby.isError && offlineError(nearby.error)) || nearby.fetchStatus === "paused" || (!online && !nearby.isSuccess));
  const items = useMemo(() => {
    const raw = nearby.data?.items ?? [];
    const a = nearby.data?.area;
    if (!a) {
      // A saved list was measured from wherever it was fetched: measure again from where you are now.
      const list = savedOf(nearby.data) ? remeasure(raw, user ?? placeFrom) : raw;
      // Measured from a searched or fallback place: metres only, no walk minutes, so nothing reads as "from you".
      // Near you it stays in walk-time order, closed ones included: they say "Closed now" on the card.
      return user ? list : list.map((t) => ({ ...t, walkSecondsEstimate: undefined }));
    }
    // Only what's on screen, so list and pins agree. Walk times stay from you, never from the map centre.
    return openFirst(
      raw
        .filter((t) => inside(a.open, t))
        .map((t) => {
          if (!user) return { ...t, distanceM: undefined, walkSecondsEstimate: undefined };
          const d = haversineM(user, t);
          return { ...t, distanceM: Math.round(d), walkSecondsEstimate: estimateWalkSeconds(d) };
        }),
    );
  }, [nearby.data, user, placeFrom]);
  /** Filters changed but their results haven't landed: the stale list and pins dim instead of sitting there looking final. */
  const filtering = active !== queryFilters;
  const updating = filtering || (nearby.isPlaceholderData && nearby.isFetching);
  // A building's toilets are listed together at the top; the list leaves them out.
  const groupQs = useQueries({
    queries: (groupIds ?? [])
      .filter((id) => !items.some((t) => t.id === id))
      .map((id) => ({ queryKey: ["toilet", id], queryFn: ({ signal }: { signal: AbortSignal }) => api.toilet(id, signal) })),
  });
  const group = useMemo(() => {
    if (!groupIds) return null;
    const fetched = new Map(groupQs.flatMap((q) => (q.data ? [[q.data.id, q.data as ToiletSummary] as const] : [])));
    return groupIds.map((id) => ({ id, t: items.find((i) => i.id === id) ?? fetched.get(id) ?? null }));
  }, [groupIds, groupQs, items]);
  const groupVenue = group?.find((g) => g.t)?.t?.venue ?? null;
  const oneBuilding = !!group && group.every((g) => !g.t || g.t.venue.id === groupVenue?.id);
  // The selected toilet sits in its own card above the list, so leave it out of the list.
  const listItems = useMemo(
    () => items.filter((t) => t.id !== selectedId && !groupIds?.includes(t.id)),
    [items, selectedId, groupIds],
  );
  // "Walk there" goes on the nearest one you can actually use, so it never routes to a shut door.
  const walkId = listItems.find((t) => t.status !== "PENDING" && !isClosedNow(t))?.id;
  const listRef = useRef<HTMLUListElement>(null);
  const itemKeys = useMemo(() => listItems.map((t) => t.id), [listItems]);
  useFlipList(listRef, itemKeys);
  // A full page of results means the area holds more than the list can: say which ones these are.
  const crowded = !!listArea && (listArea.capped || (nearby.data?.items.length ?? 0) >= LIST_LIMIT);
  const sheetTitle =
    offlineNoList
      ? "Nearby toilets"
      : nearby.isLoading || !loc.settled
        ? "Finding toilets…"
        : saved && !listArea && items.length
          ? // A saved list isn't "within 1 km" of anything any more: say what it is.
            `${toilets(items.length)} from your saved list`
          : listArea
            ? items.length === 0
              ? "Toilets in this area"
              : crowded
                ? `${items.length} nearest the map centre`
                : `${toilets(items.length)} in this area`
            : !items.length
              ? "Nearby toilets"
              : user
                ? `${toilets(items.length)} within ${nearRadius / 1000} km`
                : // No fix: say where the list is measured from, in the one line that's always on screen.
                  `${toilets(items.length)} near ${loc.placeName ?? "here"}`;
  const inList = items.find((t) => t.id === selectedId) ?? null;
  // Metres from a searched or fallback place say which place, on every card.
  const distanceFrom = user ? undefined : (loc.placeName ?? "Raffles Place");

  // A pin that isn't in the nearby list (e.g. after panning): fetch it.
  const selectedQ = useQuery({
    queryKey: ["toilet", selectedId],
    queryFn: ({ signal }) => api.toilet(selectedId!, signal),
    enabled: !!selectedId && !inList,
  });
  const selected: ToiletSummary | null = inList ?? (selectedQ.data as ToiletSummary | undefined) ?? null;
  const hasImported = items.some((t) => t.tier === "IMPORTED");
  // The toilet you're standing at, if any: the nearest one that takes check-ins, by a good GPS fix.
  const atToilet = useMemo(() => {
    if (!user || area || (loc.accuracy ?? Infinity) > AT_TOILET_M) return null;
    let best: { t: ToiletSummary; d: number } | null = null;
    for (const t of items) {
      if (t.status !== "ACTIVE") continue;
      const d = haversineM(user, t);
      if (d <= AT_TOILET_M && (!best || d < best.d)) best = { t, d };
    }
    return best?.t ?? null;
  }, [user, area, loc.accuracy, items]);
  // "Add it" from an empty map area starts the pin where the person was looking, not where they stand.
  const addHref = listArea ? `/add?lat=${listArea.lat}&lng=${listArea.lng}` : "/add";

  // A picked pin's card takes the peek, so the map stays in view while you decide.
  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    setGroupIds(null);
    setSnapRequest({ index: SHEET_PEEK, key: Date.now() });
  }, []);
  // A building's floors open the sheet halfway, with room for a few of them.
  const onSelectGroup = useCallback((ids: string[]) => {
    setSelectedId(null);
    setGroupIds(ids);
    setSnapRequest({ index: SHEET_PEEK + 1, key: Date.now() });
  }, []);
  // The map keeps its framing at the top snap: the sheet covers it, and padding taller than the map makes the camera jump.
  const onSnapChange = useCallback((i: number, px: number) => {
    setSheetSnap(i);
    if (i < SHEET_TOP) setSheetPx(px);
  }, []);

  // A locate tap that fails says so (and offers search), instead of quietly leaving the map where it was.
  const [locateFailed, setLocateFailed] = useState(false);
  const locateMe = async () => {
    setLocateFailed(false);
    const c = await loc.locate();
    if (c) setRecenter((n) => n + 1);
    else setLocateFailed(true);
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

  // The sheet's extra header rows show once the list is open (always, on desktop).
  const revealed = !phone || sheetSnap > SHEET_PEEK;

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
  // Standing at a toilet swaps in the check-in pill: the moment people would otherwise forget.
  const mapControls = (
    <div className="flex flex-col items-end gap-2">
      {locateFailed ? (
        <LocateFailed onDismiss={() => setLocateFailed(false)} className="rise-in w-[min(20rem,calc(100vw-2rem))]" />
      ) : null}
      <div className="flex items-center gap-2">
        {atToilet ? (
          <Link
            href={`/toilets/${atToilet.id}?do=checkin`}
            className="rise-in flex min-h-12 min-w-0 max-w-[min(16rem,calc(100vw-6rem))] items-center gap-2 rounded-full border-2 border-primary bg-primary-soft pl-3.5 pr-4 text-sm font-extrabold text-fg shadow-card transition-transform duration-100 active:scale-95"
            data-testid="checkin-here"
          >
            <MapPinCheck className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">At {atToilet.venue.name}?</span>
            <span className="shrink-0 text-primary">Check in</span>
          </Link>
        ) : null}
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
    </div>
  );

  return (
    <div className="fixed inset-0 md:top-[calc(4rem+env(safe-area-inset-top))]" data-testid="home">
      <h1 className="sr-only">Toilets near you</h1>
      {/* Map fills the screen; on desktop it sits right of the side panel. */}
      {/*
        Phones: the map's credit rides above the sheet, level with the locate button, instead of under the sheet
        and the nav (the OneMap and OSM credits are licence terms). At the top snap the sheet covers the map anyway.
      */}
      <div
        className="absolute inset-0 md:left-[420px]"
        style={
          phone && sheetSnap < SHEET_TOP
            ? ({ "--map-ctrl-bottom": `calc(${sheetPx}px + var(--nav-h) + env(safe-area-inset-bottom) + 1.75rem)` } as React.CSSProperties)
            : undefined
        }
      >
        <ToiletMap
          className="size-full"
          center={loc.coords}
          recenterKey={recenterKey}
          zoom={16}
          user={user}
          accuracy={user ? loc.accuracy : null}
          features={fq.features}
          openNow={fq.openNow}
          areaType={fq.areaType}
          onViewChange={onViewChange}
          selectedId={selectedId}
          focus={focus}
          // At the top snap the sheet covers the map, so there's nothing to point from.
          focusHint={!phone || sheetSnap < SHEET_TOP}
          focusInset={hintInset}
          // Only for filter changes: panning refetches the list too, and the pins shouldn't fade for that.
          dimPins={filtering}
          onSelect={onSelect}
          onSelectGroup={onSelectGroup}
          viewPadding={mapPad}
          foldCredit={phone}
        />
      </div>

      {/* Top overlay: search + filters */}
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:left-[420px] md:pr-[calc(4rem+env(safe-area-inset-right))] md:pt-3"
      >
        {/* Desktop: one column as wide as the chips on one line (or the map, clear of the zoom controls), so search and filters share both edges. */}
        <div className="flex flex-col gap-2 md:w-fit md:max-w-full">
          <div className="pointer-events-auto">
            <LocationSearch
              showLocate={false}
              trailing={
                // Phones fold the chips into one button, so they stop covering the map.
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="tap inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-extrabold text-fg transition-transform duration-100 hover:bg-surface-2 active:scale-[0.96] md:hidden"
                  aria-haspopup="dialog"
                >
                  <SlidersHorizontal className="size-5 text-primary" aria-hidden />
                  Filters
                  {active.size ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-fg tabular-nums">
                      {active.size}
                      <span className="sr-only"> on</span>
                    </span>
                  ) : null}
                </button>
              }
            />
          </div>
          {/* Phones: only the filters that are on, each one tap to drop. */}
          {active.size ? (
            <div
              className="no-scrollbar pointer-events-auto flex gap-2 overflow-x-auto pb-1 md:hidden"
              role="group"
              aria-label="Filters on"
            >
              {FILTERS.filter((f) => active.has(f.key)).map((f) => (
                <Chip key={f.key} active onClick={() => toggle(f.key)} className="shadow-card">
                  <FilterChipLabel k={f.key} label={f.label} active />
                  <X className="-mr-1 size-4" aria-hidden />
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="pointer-events-none hidden gap-2 pb-1 md:flex md:flex-wrap" role="group" aria-label="Filters">
            {FILTERS.map((f) => (
              <Chip
                key={f.key}
                active={active.has(f.key)}
                onClick={() => toggle(f.key)}
                className="pointer-events-auto grow shadow-card"
              >
                <FilterChipLabel k={f.key} label={f.label} active={active.has(f.key)} />
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={clear} disabled={!active.size}>
              Clear all
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              {updating || nearby.isLoading ? "Show toilets" : `Show ${toilets(items.length)}`}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5" role="group" aria-label="Filters">
          {MUST_HAVE_GROUPS.map((g) => (
            <div key={g.id} role="group" aria-labelledby={`map-must-${g.id}`} className="flex flex-col gap-2">
              <h3 id={`map-must-${g.id}`} className="text-sm font-extrabold text-muted">
                {g.label}
              </h3>
              <div className="flex flex-wrap gap-2">
                {g.keys.map((k) => (
                  <Chip key={k} active={active.has(k)} onClick={() => toggle(k)}>
                    <FilterChipLabel k={k} label={FILTER_LABEL[k]} active={active.has(k)} />
                  </Chip>
                ))}
              </div>
              {g.note ? <p className="text-sm text-muted">{g.note}</p> : null}
            </div>
          ))}
        </div>
      </Dialog>

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
          <div className="flex flex-col">
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
                className="-my-2 hidden min-h-11 shrink-0 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline md:inline-flex"
              >
                Help me choose
              </Link>
            </div>
            {/*
              Where the list is measured from, and whether it's a saved copy, stay up even at the peek: a list
              from somewhere else must never pass for "near you".
            */}
            {saved || (!online && nearby.data) ? (
              <p role="status" className="mt-2 flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-2.5 text-sm font-bold text-fg">
                <CloudOff className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <span>
                  {saved
                    ? `Offline · saved ${savedAge(saved.at)} ago, near ${nearestStationName(saved) ?? "where you last were"}`
                    : "Offline · this list may be out of date"}
                </span>
              </p>
            ) : null}
            <LocationNotice className="mt-2" />
            {/* Phones: the key and "Help me choose" open with the list and fold away at the peek. */}
            <div
              data-sheet-reveal
              className="grid transition-[grid-template-rows] duration-[380ms] ease-[var(--ease-sheet)] motion-reduce:transition-none"
              style={{ gridTemplateRows: revealed ? "1fr" : "0fr" }}
              inert={!revealed}
            >
              <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                <TierLegend className="pt-2" />
                <Link
                  href="/go"
                  className="-mt-1 inline-flex min-h-11 items-center gap-0.5 self-start text-sm font-semibold text-primary underline-offset-2 hover:underline md:hidden"
                >
                  Not sure which? Help me choose
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        }
      >
        {selected ? (
          <div key={selected.id} className="rise-in mb-3" data-sheet-peek>
            <div className="-mt-1 flex items-center justify-between">
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
            <ToiletCard t={selected} selected walk distanceFrom={distanceFrom} />
          </div>
        ) : null}

        {group ? (
          <section key={groupIds?.join()} className="rise-in mb-3" data-sheet-peek aria-labelledby="map-group-title" data-testid="map-group">
            <div className="-mt-1 flex items-center justify-between gap-2">
              <h3 id="map-group-title" className="min-w-0 truncate text-sm font-semibold text-muted">
                {oneBuilding && groupVenue
                  ? `${toilets(group.length)} in ${groupVenue.name}`
                  : `${toilets(group.length)} at this spot`}
              </h3>
              <button
                type="button"
                className="tap flex items-center justify-center rounded-full text-muted"
                onClick={() => setGroupIds(null)}
                aria-label="Close this list"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {/* Lowest level first, as the map stacks them. */}
            <ul className="flex flex-col gap-3" aria-label={oneBuilding ? "Toilets in this building, by level" : "Toilets at this spot"}>
              {group.map(({ id, t }) => (
                <li key={id}>
                  {t ? (
                    <ToiletCard t={t} distanceFrom={distanceFrom} />
                  ) : (
                    <Skeleton className="h-24" />
                  )}
                </li>
              ))}
            </ul>
            {group.some((g) => g.t && !levelShort(g.t.level)) ? (
              <p className="mt-2 text-xs text-muted">Some of these have no level yet. Been there? Check in and add it.</p>
            ) : null}
          </section>
        ) : null}

        {/* "No toilet nearby" only from a real answer: offline, an empty list just means nothing saved covers it. */}
        {offlineNoList || (nearby.data && items.length === 0 && (saved || !online)) ? (
          <div className="rise-in" data-sheet-peek>
            <EmptyState
              icon={<CloudOff className="size-10" aria-hidden />}
              title="No signal leh"
              action={
                <Button variant="secondary" size="sm" onClick={() => void nearby.refetch()}>
                  <RefreshCw className="size-4" aria-hidden /> Try again
                </Button>
              }
            >
              We can&apos;t load toilets without a connection, and nothing saved on this phone covers this spot. The
              map&apos;s pins may still show places you&apos;ve looked at before.
            </EmptyState>
          </div>
        ) : nearby.isError && !nearby.data ? (
          <div data-sheet-peek>
            <ErrorState message={errorMessage(nearby.error)} onRetry={() => void nearby.refetch()} />
          </div>
        ) : nearby.isLoading || !loc.settled ? (
          <div className="flex flex-col gap-3" aria-hidden>
            <div data-sheet-peek>
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : items.length === 0 && listArea ? (
          <div className="rise-in" data-sheet-peek>
            <EmptyState
              title="Eh, no toilet around here leh"
              action={
                active.size ? (
                  <Button variant="secondary" size="sm" onClick={clear}>
                    <X className="size-4" aria-hidden /> Clear filters
                  </Button>
                ) : undefined
              }
            >
              {active.size ? (
                "Try zooming out or removing a filter."
              ) : (
                <>
                  Nothing on this part of the map yet. Zoom out, or if you know one,{" "}
                  <Link href={addHref} className="font-semibold text-primary underline">
                    add it
                  </Link>
                  .
                </>
              )}
            </EmptyState>
          </div>
        ) : items.length === 0 ? (
          <div className="rise-in" data-sheet-peek>
          {/* Real buttons, not inline links: a thumb needs the way out to be big. */}
          <EmptyState
            title="Wah, no toilet nearby leh"
            action={
              <>
                {nearRadius < WIDE_RADIUS_M ? (
                  <Button size="sm" onClick={() => setNearRadius(WIDE_RADIUS_M)}>
                    Search up to {WIDE_RADIUS_M / 1000} km
                  </Button>
                ) : null}
                {active.size ? (
                  <Button variant="secondary" size="sm" onClick={clear}>
                    <X className="size-4" aria-hidden /> Clear filters
                  </Button>
                ) : (
                  <Link href="/add" className={buttonClass("secondary", "sm")}>
                    Add one
                  </Link>
                )}
              </>
            }
          >
            {active.size
              ? `Nothing with ${active.size === 1 ? "that filter" : "those filters"} within ${nearRadius / 1000} km.`
              : `Nothing within ${nearRadius / 1000} km of here yet. Know one?`}
          </EmptyState>
          </div>
        ) : (
          <ul
            ref={listRef}
            className="flex flex-col gap-3"
            aria-label={listArea ? "Toilets in this map area, nearest the centre first" : "Toilets sorted by walking time"}
          >
            {listItems.map((t, i) => (
              <li key={t.id} data-flip-key={t.id} data-sheet-peek={i === 0 ? "" : undefined}>
                {/* The nearest usable card (or the picked one above) gets "Walk there": one tap from the map to the route. */}
                <ToiletCard t={t} onHover={setHoverId} walk={t.id === walkId && !selected} distanceFrom={distanceFrom} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 text-xs text-muted">
          <p>
            {hasImported ? "Some toilet data © OpenStreetMap contributors (ODbL). " : ""}
            <Link href="/about" className="font-semibold underline">
              How we rate toilets and where the data comes from
            </Link>
          </p>
          <p className="mt-2 flex gap-4">
            <Link href="/privacy" className="inline-flex min-h-11 min-w-11 items-center font-semibold underline">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 min-w-11 items-center font-semibold underline">
              Terms
            </Link>
          </p>
        </div>
      </BottomSheet>
    </div>
  );
}
