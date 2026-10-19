"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Baby,
  ChevronDown,
  ChevronRight,
  CloudOff,
  Droplet,
  ExternalLink,
  Flower2,
  Info,
  LocateFixed,
  MapPinCheck,
  Navigation,
  RefreshCw,
  Search,
  ShowerHead,
  SlidersHorizontal,
  Sparkles,
  Toilet,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ViewTransition, useEffect, useEffectEvent, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LocationNotice, LocationSearch } from "@/components/location-search";
import { ToiletMap } from "@/components/map";
import { historyBack, prepareRouteTransition } from "@/components/route-transition";
import {
  FeatureChips,
  FilterChipLabel,
  OpenNow,
  StatusChips,
  TierBadge,
  UnverifiedClaim,
  lastVerifiedText,
  shortAge,
} from "@/components/toilet-bits";
import { Button, Card, Chip, EmptyState, ErrorState, Skeleton, buttonClass, cx } from "@/components/ui";
import { NetworkError, api, errorMessage } from "@/lib/api/client";
import type { Feature, Purpose, RecommendBody, RecommendItem, SkippedVenue, ToiletSummary } from "@/lib/api/types";
import {
  FILTERS,
  FILTER_LABEL,
  MUST_HAVE_GROUPS,
  matchesFilters,
  requiredFeatures,
  toFilterQuery,
  type FilterKey,
} from "@/lib/filters";
import {
  AREA_TYPE_LABELS,
  FEATURE_LABELS,
  cleanlinessText,
  formatDistance,
  googleMapsWalkingUrl,
  walkMinutes,
} from "@/lib/format";
import { haversineM, roundCoord, useFixAge, useLocation, useWatchPosition } from "@/lib/location";
import { rankOffline, useOnline } from "@/lib/offline";
import { PURPOSE_OPTIONS, parsePurpose, type PurposeOption } from "@/lib/purposes";
import { markArrived, startRoute } from "@/lib/route-session";
import { HUE_TEXT, type Hue } from "@/lib/feature-hues";

/** Each mission wears the hue of the features it hunts for (sitting for number two, soap for freshening up). */
const PURPOSE_STYLE: Record<Purpose, { icon: React.ComponentType<{ className?: string }>; hue: Hue }> = {
  PEE: { icon: Droplet, hue: "gold" },
  POO: { icon: Toilet, hue: "taro" },
  BABY: { icon: Baby, hue: "papaya" },
  SHOWER: { icon: ShowerHead, hue: "soda" },
  FRESHEN_UP: { icon: Sparkles, hue: "soda" },
  PERIOD: { icon: Flower2, hue: "papaya" },
};

/**
 * The card's route preview and the "Take me there" map share this name, so the preview grows into
 * the full map and shrinks back into the card (globals.css "Take me there").
 */
const routeMapName = (id: string) => `route-map-${id}`;

/**
 * Back from the route view goes through history, which Next renders outside a React transition,
 * so React never animates it. It runs its own view transition instead: both maps (`data-route-map`)
 * are named by hand, and the update finishes once the results view is in (settleBack, from GoClient).
 */
let pendingBack: (() => void) | null = null;
/**
 * The results were on screen before this route, so Back returns to them and the map shrinks into
 * its preview. A route opened from anywhere else (a map card, a toilet page) goes back with a plain
 * `pop` instead: nothing on the page behind would finish the morph, so it would hang until its timeout.
 */
let resultsShown = false;
function nameRouteMaps(id: string | null) {
  document.querySelectorAll<HTMLElement>("[data-route-map]").forEach((el) => {
    const on = id !== null && el.dataset.routeMap === id;
    el.style.viewTransitionName = on ? routeMapName(id) : "";
    el.style.setProperty("view-transition-class", on ? "route-morph" : "");
  });
}
function settleBack() {
  pendingBack?.();
  pendingBack = null;
}
function animatedBack(id: string, back: () => void) {
  if (typeof document.startViewTransition !== "function") return back();
  prepareRouteTransition();
  nameRouteMaps(id);
  const vt = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 1000);
        pendingBack = () => {
          window.clearTimeout(timeout);
          nameRouteMaps(id);
          resolve();
        };
        back();
      }),
  );
  void vt.finished.finally(() => nameRouteMaps(null));
}

let idledOnce = false;
/**
 * True once the browser is idle after the first paint, so a picture-only map never holds up "Take me
 * there". At once after that, so coming back from the route finds the preview there to shrink into.
 */
function useIdle() {
  const [idle, setIdle] = useState(idledOnce);
  useEffect(() => {
    if (idle) return;
    const done = () => {
      idledOnce = true;
      setIdle(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(done, { timeout: 500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(done, 200);
    return () => window.clearTimeout(t);
  }, [idle]);
  return idle;
}

function PurposeIcon({ k, active }: { k: Purpose; active: boolean }) {
  const { icon: Icon, hue } = PURPOSE_STYLE[k];
  return <Icon className={cx("size-4 shrink-0", !active && HUE_TEXT[hue])} aria-hidden />;
}
import { useStoredFilters } from "@/lib/use-filters";

export function skippedText(v: SkippedVenue): string {
  const dist = formatDistance(v.distanceM);
  if (v.toiletStatus === "NONE") return `${v.name} has no toilet${v.note ? ` — ${v.note}` : ""}${dist ? ` (${dist} away)` : ""}`;
  if (v.toiletStatus === "USES_NEARBY")
    return `${v.name} doesn't have its own toilet${v.note ? ` — ${v.note}` : ""}${dist ? ` (${dist} away)` : ""}`;
  return `${v.name}: ${v.note ?? "toilet status unknown"}`;
}

const VALID_FILTERS = new Set<string>(FILTERS.map((f) => f.key));

/** The must-haves most people reach for. The rest wait behind "More must-haves" unless picked or suggested. */
const QUICK_MUST_HAVES: FilterKey[] = ["ACCESSIBLE", "BIDET", "FREE", "OPEN_NOW"];

function parseNeed(raw: string | null): FilterKey[] {
  if (!raw) return [];
  return raw.split(",").filter((k): k is FilterKey => VALID_FILTERS.has(k));
}

/**
 * /go has three states, all in the URL so the back button always works:
 *   /go                       the "Help me choose" wizard
 *   /go?need=…&fussy=…&for=…  calm results (`for` is the optional purpose)
 *   /go?urgent=1              urgent results ("I need to go")
 *   …&to=<toiletId>           walking route to one of them
 */
/** A fix rougher than this (metres) can't be trusted for "nearest": say so and offer search. */
const APPROX_M = 150;
/** On the route screen, this close (by GPS) to the toilet counts as there: "Arrived? Check in". */
const ARRIVED_M = 40;
/** Locating longer than this offers search instead of more waiting. */
const SLOW_LOCATE_MS = 3000;
/**
 * Short screens (or large text, since em in a media query follows the browser's text size) get a compact
 * red header, so "Take me there" stays above the fold.
 */
const SHORT_SCREEN = "(max-height: 48em)";

function subscribeShort(cb: () => void) {
  const mq = window.matchMedia(SHORT_SCREEN);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function useShortScreen() {
  return useSyncExternalStore(
    subscribeShort,
    () => window.matchMedia(SHORT_SCREEN).matches,
    () => false,
  );
}

/** Saved toilets ranked on the phone stand in for recommendations offline (no route, straight-line walk). */
function offlineItem(t: ToiletSummary): RecommendItem {
  return {
    toilet: t,
    score: 0,
    walkSeconds: t.walkSecondsEstimate ?? 0,
    walkDistanceM: t.distanceM ?? 0,
    reasons: [],
    route: null,
    unconfirmed: t.status === "PENDING",
  };
}

export function GoClient() {
  const sp = useSearchParams();
  const urgent = sp.get("urgent") === "1";
  const fussyParam = sp.get("fussy");
  const need = useMemo(() => parseNeed(sp.get("need")), [sp]);
  const purpose = useMemo(() => parsePurpose(sp.get("for")), [sp]);
  const to = sp.get("to");
  const loc = useLocation();
  const { locate } = loc;
  const fixAge = useFixAge();
  const online = useOnline();
  const qc = useQueryClient();
  const short = useShortScreen();
  // Urgent mode sends the saved must-haves (the API honours them there too), shown as removable chips.
  const stored = useStoredFilters();
  // The results view is in: let an animated Back from the route view finish its update.
  useLayoutEffect(() => {
    if (to) return;
    resultsShown = true;
    settleBack();
  }, [to]);
  useEffect(
    () => () => {
      resultsShown = false;
    },
    [],
  );

  // /go needs a location, so it asks for one (other pages never prompt). Urgent mode wants where you are
  // now, not the last station you passed: a cached fix has to be under 30 seconds old.
  useEffect(() => {
    void locate(urgent ? { maxAgeMs: 30_000 } : undefined);
  }, [urgent, locate]);

  const lat = roundCoord(loc.coords.lat);
  const lng = roundCoord(loc.coords.lng);
  const showWizard = !urgent && fussyParam === null;
  const urgentFilters = useMemo(() => toFilterQuery(stored.active), [stored.active]);

  const body = useMemo<RecommendBody | null>(() => {
    if (urgent)
      return {
        lat,
        lng,
        urgent: true,
        require: urgentFilters.features.length ? urgentFilters.features : undefined,
        openNow: urgentFilters.openNow || undefined,
        areaType: urgentFilters.areaType,
      };
    if (fussyParam === null) return null;
    const fussy = Math.min(10, Math.max(0, Number(fussyParam) || 0));
    const fq = toFilterQuery(new Set(need));
    return {
      lat,
      lng,
      purpose: purpose?.key,
      require: fq.features.length ? fq.features : undefined,
      openNow: fq.openNow || undefined,
      areaType: fq.areaType,
      // ASSUMPTION: weights are relative 0..1; "fussiness" trades distance for cleanliness.
      weights: { cleanliness: fussy / 10, distance: 1 - fussy / 20 },
    };
  }, [urgent, fussyParam, need, purpose, lat, lng, urgentFilters]);

  const rec = useQuery({
    queryKey: ["recommend", body],
    queryFn: ({ signal }) => api.recommend(body!, signal),
    // Urgent waits for the saved must-haves to load, so it asks once, with them.
    enabled: !!body && loc.settled && (!urgent || stored.ready),
    staleTime: 60_000,
    // A fresh fix asks again; meanwhile the answer from the old one stays up, labelled with its age.
    placeholderData: urgent ? keepPreviousData : undefined,
  });

  /*
   * No answer and no way to get one (no signal, timed out, or the request is waiting for a network): rank
   * what this phone already has, the newest saved nearby lists, by straight line from where you are.
   */
  const recOffline =
    !!body && !rec.data && ((rec.isError && rec.error instanceof NetworkError) || rec.fetchStatus === "paused" || !online);
  const fromPoint = loc.source === "default" ? null : loc.coords;
  // The service worker may still hold a list for about here, and on a weak signal the request may get through.
  const offlineSource = useQuery({
    queryKey: ["nearby", "offline-fallback", roundCoord(lat, 3), roundCoord(lng, 3)],
    queryFn: ({ signal }) => api.nearbyToilets({ lat, lng, radius: 2000, limit: 50 }, signal),
    enabled: recOffline && !!fromPoint,
    retry: false,
  });
  const offlineItems = useMemo<RecommendItem[]>(() => {
    if (!recOffline || !fromPoint) return [];
    const byId = new Map<string, ToiletSummary>();
    for (const t of offlineSource.data?.items ?? []) byId.set(t.id, t);
    const saved = qc
      .getQueryCache()
      .findAll({ queryKey: ["nearby"] })
      .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    for (const q of saved) {
      for (const t of (q.state.data as { items?: ToiletSummary[] } | undefined)?.items ?? []) {
        if (!byId.has(t.id)) byId.set(t.id, t);
      }
    }
    const must = urgent ? stored.active : new Set(need);
    return rankOffline(
      [...byId.values()].filter((t) => matchesFilters(t, must)),
      fromPoint,
    ).map(offlineItem);
  }, [recOffline, fromPoint, offlineSource.data, qc, urgent, stored.active, need]);

  // Still locating after a few seconds: offer search rather than leave a skeleton with no way out.
  const waitingForFix = (!loc.settled || (loc.status === "locating" && loc.source === "default")) && !rec.data;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waitingForFix) return;
    const t = window.setTimeout(() => setSlow(true), SLOW_LOCATE_MS);
    return () => window.clearTimeout(t);
  }, [waitingForFix]);
  const [searching, setSearching] = useState(false);

  if (to) {
    const item = [...(rec.data?.items ?? []), ...offlineItems].find((i) => i.toilet.id === to) ?? null;
    return <TakeMe toiletId={to} item={item} urgent={urgent} />;
  }

  if (showWizard) return <Wizard />;

  const required = requiredFeatures(new Set(need));
  const noFix = loc.settled && loc.source === "default";
  const live = rec.data?.items ?? [];
  // Pending toilets can show in calm results (as "Unconfirmed"), never in urgent ones.
  const items = (rec.data ? (urgent ? live.filter((i) => i.toilet.status !== "PENDING") : live) : offlineItems).slice(0, 3);
  const [first, ...rest] = items;
  const offline = !rec.data && offlineItems.length > 0;
  const from =
    loc.source === "gps" ? (fixAge !== null ? `where you were ${fixAge} min ago` : "you") : (loc.placeName ?? "here");
  const locating = loc.status === "locating";
  const approx = !noFix && loc.source === "gps" && (loc.accuracy ?? 0) > APPROX_M ? Math.round(loc.accuracy!) : null;
  const searchHere = () => setSearching(true);
  const showSearch = searching && loc.source !== "search" && !noFix;

  // Facts about the answer itself (rough fix, offline estimate) sit in the red band when urgent, above the list when calm.
  const notices =
    approx !== null || offline ? (
      <div className="mt-3 flex flex-col gap-2">
        {approx !== null ? (
          <p role="status" className="flex flex-wrap items-center gap-x-2 rounded-2xl bg-warn-soft px-4 py-1.5 text-sm font-bold text-fg">
            <span>Location approximate (±{formatDistance(approx)})</span>
            <button type="button" onClick={searchHere} className="min-h-11 font-extrabold text-primary underline">
              Search where you are
            </button>
          </p>
        ) : null}
        {offline ? (
          <p role="status" className="flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-2.5 text-sm font-bold text-fg">
            <CloudOff className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            Offline estimate: nearest by straight line from your saved list.
          </p>
        ) : null}
      </div>
    ) : null;

  const activeFilters = FILTERS.filter((f) => stored.active.has(f.key));

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10">
      {urgent ? (
        <header
          className={cx(
            "-mx-4 rounded-b-3xl bg-urgent px-4 text-urgent-fg sm:mx-0 md:rounded-none md:shadow-[0_0_0_100vmax_var(--urgent)] md:[clip-path:inset(0_-100vmax)]",
            short ? "pb-8 pt-3" : "pb-10 pt-5",
          )}
        >
          {/* Wraps the buttons under the title only when large text leaves no room beside it. */}
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0 grow basis-48">
              <h1 className={cx("leading-tight", short ? "text-2xl" : "text-[2rem]")}>
                {noFix ? "Where you at?" : "Quick, go here!"}
              </h1>
              {/* Two lines kept on phones, so the result line arriving never pushes the card down. */}
              <p className={cx("mt-1 font-medium opacity-90", short ? "text-sm" : "max-sm:min-h-12")}>
                {noFix
                  ? "We can't find your location, so we can't tell how far anything is yet."
                  : rec.data
                    ? `Nearest good toilet from ${from}, within ${formatDistance(rec.data.searchedRadiusM)}`
                    : offline
                      ? `Nearest from ${from}, worked out on your phone`
                      : waitingForFix || locating
                        ? "Getting your location…"
                        : "Finding the nearest good toilet…"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void locate({ maxAgeMs: 0 })}
                disabled={locating}
                className="tap inline-flex items-center justify-center rounded-xl border border-urgent-fg/60 hover:bg-urgent-fg/10 disabled:opacity-100"
                aria-label={locating ? "Getting your location" : "Refresh my location"}
              >
                <LocateFixed className={cx("size-5", locating && "animate-pulse")} aria-hidden />
              </button>
              <Link
                href="/go"
                className="tap inline-flex items-center gap-1.5 rounded-xl border border-urgent-fg/60 px-3 text-sm font-semibold hover:bg-urgent-fg/10"
              >
                <SlidersHorizontal className="size-4" aria-hidden /> Filters
              </Link>
            </div>
          </div>
          {/* The saved must-haves this search used, each one tap to drop. One scrolling row on short screens. */}
          {activeFilters.length ? (
            <div
              role="group"
              aria-label="Must-haves on"
              className={cx("mt-2 flex gap-1.5", short ? "no-scrollbar -mx-4 overflow-x-auto px-4" : "flex-wrap")}
            >
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => stored.toggle(f.key)}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border-2 border-urgent-fg/70 px-3 text-sm font-bold whitespace-nowrap transition-transform duration-100 hover:bg-urgent-fg/10 active:scale-[0.96]"
                >
                  {f.label} only
                  <X className="-mr-1 size-4" aria-hidden />
                  <span className="sr-only">, remove</span>
                </button>
              ))}
            </div>
          ) : null}
          {notices}
        </header>
      ) : (
        <header className="flex items-start justify-between gap-3 pt-4">
          <div>
            <h1 className="text-3xl leading-tight">Your top 3</h1>
            <p className="text-muted">
              {purpose ? `${purpose.label} · ` : null}
              {rec.data ? `Within ${formatDistance(rec.data.searchedRadiusM)} of ${from}` : "Best options by walking time"}
            </p>
          </div>
          <Link href="/go" className={buttonClass("secondary", "md", "shrink-0")}>
            <SlidersHorizontal className="size-4" aria-hidden /> Change
          </Link>
        </header>
      )}

      {noFix ? (
        <NoFix urgent={urgent} />
      ) : !urgent ? (
        <div className="mt-3">
          <LocationNotice />
          {notices}
        </div>
      ) : null}

      <div className={cx(urgent && !noFix ? "-mt-6" : "mt-5")}>
        {/* Still finding you after a few seconds, or a rough fix: search where you are instead. */}
        {showSearch || (slow && waitingForFix && !noFix) ? (
          <Card className="relative z-10 mb-3 flex flex-col gap-3 shadow-card">
            {showSearch ? null : (
              <p className="font-bold">Still finding you. Underground or indoors? Search where you are.</p>
            )}
            {showSearch ? (
              <LocationSearch autoFocus />
            ) : (
              <Button variant="secondary" onClick={searchHere} className="w-full">
                <Search className="size-4" aria-hidden /> Search where you are
              </Button>
            )}
          </Card>
        ) : null}
        {waitingForFix && !noFix ? (
          <p role="status" className={cx("mb-3", urgent ? "sr-only" : "text-muted")}>
            Getting your location…
          </p>
        ) : null}
        {/* Always rendered, so the result is announced when it lands (focus stays where it was). */}
        <p role="status" className="sr-only">
          {rec.data || offline
            ? first
              ? `Closest: ${first.toilet.venue.name}, ${walkMinutes(first.walkSeconds)} minute walk.`
              : "No toilet found nearby."
            : ""}
        </p>
        {rec.isError && !recOffline && !rec.data ? (
          <ErrorState message={errorMessage(rec.error)} onRetry={() => void rec.refetch()} />
        ) : recOffline && !first ? (
          noFix ? null : offlineSource.isFetching ? (
            <div className="flex flex-col gap-3" aria-hidden>
              <Skeleton className="h-96 rounded-3xl shadow-card" />
            </div>
          ) : (
            <Card className="relative z-10 pt-2 shadow-card">
              <EmptyState
                icon={<CloudOff className="size-10" aria-hidden />}
                title="No signal leh"
                action={
                  <Button variant="secondary" size="sm" onClick={() => void rec.refetch()}>
                    <RefreshCw className="size-4" aria-hidden /> Try again
                  </Button>
                }
              >
                We can&apos;t reach Shit Go Where, and nothing saved on this phone is near enough to rank. Try the map,
                or look for signs to the nearest MRT station or mall.
              </EmptyState>
            </Card>
          )
        ) : !first && (rec.isPending || !loc.settled) ? (
          <div className="flex flex-col gap-3" aria-hidden>
            <Skeleton className="h-96 rounded-3xl shadow-card" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : rec.data && items.length === 0 ? (
          <Card className="pt-2">
            <EmptyState title="Wah, nothing matches leh">
              No toilet fits within {formatDistance(rec.data.searchedRadiusM)}.{" "}
              {!urgent ? (
                <Link href="/go" className="font-semibold text-primary underline">
                  Loosen your must-haves
                </Link>
              ) : (
                <Link href="/" transitionTypes={["tab-left"]} className="font-semibold text-primary underline">
                  Browse the map
                </Link>
              )}
            </EmptyState>
          </Card>
        ) : first ? (
          noFix ? (
            <section aria-labelledby="near-default">
              <h2 id="near-default" className="text-lg font-bold">
                Meanwhile, near {loc.placeName ?? "Raffles Place"}
              </h2>
              <p className="text-sm text-muted">Distances are from {loc.placeName ?? "Raffles Place"}, not from you.</p>
              <ol className="mt-3 flex flex-col gap-2" aria-label={`Toilets near ${loc.placeName ?? "Raffles Place"}`}>
                {items.map((it) => (
                  <li key={it.toilet.id}>
                    <AltRow item={it} urgent={urgent} noFix />
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <>
              <HeroCard item={first} urgent={urgent} required={required} essential={purpose?.essential} />
              {rest.length ? (
                <section className="mt-6" aria-labelledby="alternates">
                  <h2 id="alternates" className="text-lg font-bold">
                    {urgent ? "Not this one? Try these" : "Also good"}
                  </h2>
                  <ol className="mt-2 flex flex-col gap-2" aria-label="Other options">
                    {rest.map((it) => (
                      <li key={it.toilet.id}>
                        <AltRow item={it} urgent={urgent} required={required} essential={purpose?.essential} />
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </>
          )
        ) : null}

        {rec.data?.skippedVenues.length ? (
          <Card className="mt-6 border-transparent bg-warn-soft shadow-none">
            <h2 className="flex items-center gap-2 font-bold">
              <Info className="size-5 text-warn" aria-hidden /> Skipped nearby
            </h2>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
              {rec.data.skippedVenues.map((v) => (
                <li key={`${v.name}-${v.distanceM}`}>{skippedText(v)}</li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      {/* From the first frame: a way out even while nothing has loaded. */}
      {urgent ? (
        <Link
          href="/"
          transitionTypes={["tab-left"]}
          className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
        >
          Show me the map instead
        </Link>
      ) : null}
    </div>
  );
}

/** Location failed: lead with "where are you", not with numbers measured from somewhere else. */
function NoFix({ urgent }: { urgent: boolean }) {
  const loc = useLocation();
  return (
    <section className={cx("relative z-10 flex flex-col gap-3", urgent ? "-mt-6" : "mt-4")} aria-label="Set your location">
      <Card className="flex flex-col gap-3 shadow-card">
        <LocationSearch autoFocus />
        <Button
          variant="secondary"
          size="lg"
          onClick={() => void loc.locate()}
          loading={loc.status === "locating"}
          className="w-full"
        >
          {loc.status === "locating" ? null : <LocateFixed className="size-5" aria-hidden />}
          Try my location again
        </Button>
        <p className="text-sm text-muted">
          {loc.status === "denied"
            ? "Location permission is off for this site. Search for the MRT station, mall or postal code you're at, or allow location for this site in your browser's settings."
            : "Underground or indoors? Search for the MRT station or mall you're at."}
        </p>
      </Card>
    </section>
  );
}

function takeHref(sp: URLSearchParams, id: string) {
  const p = new URLSearchParams(sp);
  p.set("to", id);
  return `/go?${p.toString()}`;
}

/** The purpose can't be met without this feature, and this toilet has no record of it. */
function lacksEssential(t: ToiletSummary, essential?: Feature): essential is Feature {
  return !!essential && !t.features.includes(essential);
}

function HeroCard({
  item,
  urgent,
  required,
  essential,
}: {
  item: RecommendItem;
  urgent: boolean;
  required: ToiletSummary["features"];
  essential?: Feature;
}) {
  const sp = useSearchParams();
  const loc = useLocation();
  const mapReady = useIdle();
  const t = item.toilet;
  const mins = walkMinutes(item.walkSeconds);
  // What was asked for leads the chips, then the usual highlights.
  const asked = essential ? [...required, essential] : required;
  const facts = [t.level ? `Level ${t.level}` : null, t.areaType !== "UNKNOWN" ? AREA_TYPE_LABELS[t.areaType] : null].filter(
    Boolean,
  );

  return (
    <article
      className="relative z-10 overflow-hidden rounded-[28px] border border-border/70 bg-surface shadow-card"
      data-testid="recommendation"
      aria-label={`Best option: ${t.venue.name}`}
    >
      {item.route ? (
        <ViewTransition name={routeMapName(t.id)} share="route-morph" default="none">
          {/* Short on phones, so the hero's one button still lands above the bottom nav at 360px; gone on
              short screens (and large text), where it would push "Take me there" below the fold. */}
          <div
            className="h-28 border-b border-border bg-surface-2 sm:h-44 [@media(max-height:48em)]:hidden"
            data-route-map={t.id}
          >
            {mapReady ? (
              <ToiletMap
                className="size-full animate-[sgw-fade_200ms_ease-out]"
                center={{ lat: t.lat, lng: t.lng }}
                zoom={16}
                showPins={false}
                interactive={false}
                user={loc.source === "gps" ? loc.coords : null}
                route={item.route.polyline}
                destination={{ lat: t.lat, lng: t.lng }}
                fitPoints={[loc.coords, { lat: t.lat, lng: t.lng }]}
                // Bottom clears the attribution strip, so the toilet pin is never under it.
                padding={{ top: 32, bottom: 28, left: 24, right: 24 }}
                label={`Route preview to ${t.venue.name}`}
              />
            ) : null}
          </div>
        </ViewTransition>
      ) : null}

      <div className="p-4">
        <p className="flex items-baseline gap-2">
          <span className="font-display text-5xl leading-none text-mint">{mins}</span>
          <span className="text-lg font-extrabold">min walk</span>
          <span className="ml-auto text-sm whitespace-nowrap text-muted tabular-nums">{formatDistance(item.walkDistanceM)}</span>
        </p>
        <h2 className="mt-2 text-2xl leading-tight">{t.venue.name}</h2>
        {t.label || facts.length ? (
          <p className="mt-0.5 text-muted">{[t.label, ...facts].filter(Boolean).join(" · ")}</p>
        ) : null}

        {/* One fact line, as on the cards: the tier carries its age, so there's no separate "verified" line. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          {t.status === "PENDING" ? (
            <TierBadge tier={t.tier} pending unconfirmed />
          ) : (
            <TierBadge tier={t.tier} age={shortAge(t.lastVerifiedAt)} seenBy={t.seenBy} />
          )}
          <span className="sr-only">{lastVerifiedText(t)}.</span>
          {t.scoreCleanliness !== null ? (
            <span className="inline-flex items-center gap-1 font-semibold">
              <Sparkles className="size-4 text-accent" aria-hidden /> {cleanlinessText(t.scoreCleanliness)}
            </span>
          ) : null}
          <OpenNow openNow={t.openNow} />
          {t.needsResurvey ? <span className="text-xs font-bold text-warn">Re-survey due</span> : null}
        </div>
        <div className="mt-2.5 empty:hidden">
          <FeatureChips features={t.features} first={asked} />
        </div>
        <div className="mt-2 flex flex-col gap-2 empty:hidden">
          <StatusChips statuses={t.activeStatus} />
          <UnverifiedClaim t={t} required={required} />
          {lacksEssential(t, essential) ? (
            <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-fg">
              <Info className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <span>
                No {FEATURE_LABELS[essential].toLowerCase()} listed here. It might just not be recorded yet, so check the
                details or try another option.
              </span>
            </p>
          ) : null}
        </div>
        <Link
          href={takeHref(new URLSearchParams(sp), t.id)}
          className={buttonClass(urgent ? "urgent" : "primary", "xl", "mt-4 w-full")}
          data-testid="take-me-button"
        >
          <Navigation className="size-6" aria-hidden /> Take me there
        </Link>
        <Link
          href={`/toilets/${t.id}`}
          transitionTypes={["push"]}
          className="mt-1 flex min-h-11 items-center justify-center gap-1 text-sm font-semibold text-primary"
        >
          Details, reviews and photos <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function AltRow({
  item,
  urgent,
  required = [],
  noFix,
  essential,
}: {
  item: RecommendItem;
  urgent: boolean;
  required?: ToiletSummary["features"];
  noFix?: boolean;
  essential?: Feature;
}) {
  const sp = useSearchParams();
  const t = item.toilet;
  const mins = walkMinutes(item.walkSeconds);
  const caveat = t.tier === "IMPORTED" && required.length > 0;
  const lacks = lacksEssential(t, essential);
  return (
    <div
      className="flex items-stretch overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest"
      data-testid="recommendation"
    >
      <Link
        href={takeHref(new URLSearchParams(sp), t.id)}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 p-3 transition hover:bg-surface-2"
        aria-label={`${urgent ? "Go" : "Walk"} to ${t.venue.name}${noFix ? "" : `, ${mins} minute walk`}`}
      >
        {/* Grows past 48px for a long distance ("1.2 km") instead of running into its edges. */}
        <span className="flex min-w-12 shrink-0 flex-col items-center rounded-2xl bg-mint px-2 py-1.5 text-center text-mint-fg shadow-gloss">
          {noFix ? (
            <span className="text-sm font-bold whitespace-nowrap tabular-nums">{formatDistance(item.walkDistanceM)}</span>
          ) : (
            <>
              <span className="font-display text-xl leading-tight">{mins}</span>
              <span className="text-xs font-extrabold">min</span>
            </>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{t.venue.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <TierBadge tier={t.tier} pending={t.status === "PENDING"} unconfirmed seenBy={t.seenBy} />
            {t.label ? <span className="truncate">{t.label}</span> : null}
            {caveat ? <span className="font-semibold text-warn">Must-haves not checked in person</span> : null}
            {lacks ? <span className="font-semibold text-warn">No {FEATURE_LABELS[essential!].toLowerCase()} listed</span> : null}
          </span>
        </span>
        <Navigation className="size-5 shrink-0 text-primary" aria-hidden />
      </Link>
      <Link
        href={`/toilets/${t.id}`}
        transitionTypes={["push"]}
        className="flex w-12 shrink-0 items-center justify-center border-l border-border text-muted hover:bg-surface-2 hover:text-fg"
        aria-label={`Details for ${t.venue.name}`}
      >
        <Info className="size-5" aria-hidden />
      </Link>
    </div>
  );
}

function Wizard() {
  const router = useRouter();
  const { active, toggle } = useStoredFilters();
  const [fussy, setFussy] = useState(5);
  // Picking a purpose suggests a slider position, until the user sets one themselves.
  const [fussyTouched, setFussyTouched] = useState(false);
  const [purpose, setPurpose] = useState<PurposeOption | null>(null);
  const [allMustHaves, setAllMustHaves] = useState(false);

  const pick = (p: PurposeOption) => {
    const next = purpose?.key === p.key ? null : p;
    setPurpose(next);
    if (!fussyTouched) setFussy(next?.fussy ?? 5);
  };

  const submit = () => {
    const p = new URLSearchParams();
    if (purpose) p.set("for", purpose.key);
    if (active.size) p.set("need", [...active].join(","));
    p.set("fussy", String(fussy));
    prepareRouteTransition();
    router.push(`/go?${p.toString()}`);
  };

  const fussyText = fussy <= 2 ? "Nearest is fine" : fussy >= 8 ? "Cleanest, even if further" : "A bit of both";
  const suggested = new Set<FilterKey>(purpose?.suggests ?? []);
  // Collapsed: the quick four plus anything picked or suggested, in the usual order, so nothing chosen is ever hidden.
  const quick = FILTERS.map((f) => f.key).filter((k) => QUICK_MUST_HAVES.includes(k) || active.has(k) || suggested.has(k));
  const mustHaveChip = (k: FilterKey) => {
    const on = active.has(k);
    const hinted = !on && suggested.has(k);
    return (
      <Chip
        key={k}
        active={on}
        onClick={() => toggle(k)}
        // Dashed, not just recoloured, so a suggestion reads without relying on hue.
        className={cx(hinted && "border-dashed border-primary")}
      >
        <FilterChipLabel k={k} label={FILTER_LABEL[k]} active={on} />
        {hinted ? <span className="sr-only">, suggested</span> : null}
      </Chip>
    );
  };
  const summary = [
    purpose?.label ?? "Any mission",
    active.size ? `${active.size} must-have${active.size === 1 ? "" : "s"}` : "No must-haves",
    fussyText,
  ].join(" · ");

  return (
    // Phones: room below the last card for the pinned button, which floats above the bottom nav.
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 md:pb-10">
      <h1 className="text-[2rem] leading-tight">Where to go ah?</h1>
      <p className="mt-1 text-muted">Tell us what you need. We&apos;ll pick the best 3 toilets within walking distance.</p>

      {/* Four questions, in the order they're answered; each a sticker card of its own. */}
      <div className="mt-6 flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          {/* Body face like the other three questions; h2 would otherwise pick up the display face. */}
          <h2 className="font-sans text-lg font-bold">Starting from</h2>
          <LocationSearch />
          <LocationNotice />
        </Card>

        <Card>
          <fieldset>
            {/* Legends don't take flex reliably, so the row lives in a span inside. */}
            <legend className="w-full">
              <span className="flex items-baseline justify-between gap-2 text-lg font-bold">
                What&apos;s the mission?
                <span className="text-sm font-medium text-muted">Optional</span>
              </span>
            </legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PURPOSE_OPTIONS.map((p) => (
                <Chip
                  key={p.key}
                  active={purpose?.key === p.key}
                  onClick={() => pick(p)}
                  className="w-full justify-start px-3.5 text-left leading-tight"
                >
                  <PurposeIcon k={p.key} active={purpose?.key === p.key} />
                  {p.label}
                </Chip>
              ))}
            </div>
            {/* Two lines kept for the hint, so picking a mission never shifts the cards below. */}
            <p className="mt-3 min-h-10 text-sm text-muted" aria-live="polite">
              {purpose ? purpose.hint : "Changes what we look for first."}
            </p>
          </fieldset>
        </Card>

        <Card>
          <fieldset>
            <legend className="text-lg font-bold">Must have</legend>
            <p className="mt-0.5 text-sm text-muted">
              {suggested.size
                ? `Dashed ones suit ${purpose!.label.toLowerCase()}. Tap one to make it a must-have.`
                : "We'll remember these for next time."}
            </p>
            {allMustHaves || quick.length >= FILTERS.length ? (
              <div className="mt-4 flex flex-col gap-4">
                {MUST_HAVE_GROUPS.map((g) => (
                  <div key={g.label} role="group" aria-labelledby={`must-${g.id}`} className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                    <h3 id={`must-${g.id}`} className="text-sm font-extrabold text-muted sm:w-32 sm:shrink-0 sm:pt-3">
                      {g.label}
                    </h3>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">{g.keys.map(mustHaveChip)}</div>
                      {g.note ? <p className="text-sm text-muted">{g.note}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {quick.map(mustHaveChip)}
                <button
                  type="button"
                  onClick={() => setAllMustHaves(true)}
                  aria-expanded={false}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-extrabold text-primary hover:bg-surface-2"
                >
                  More must-haves ({FILTERS.length - quick.length})
                  <ChevronDown className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </fieldset>
        </Card>

        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="fussy" className="text-lg font-bold">
              Nearest or cleanest?
            </label>
            <span className="text-sm font-extrabold text-primary" aria-hidden>
              {fussyText}
            </span>
          </div>
          <input
            id="fussy"
            type="range"
            min={0}
            max={10}
            step={1}
            value={fussy}
            onChange={(e) => {
              setFussy(Number(e.target.value));
              setFussyTouched(true);
            }}
            aria-valuetext={fussyText}
            className="range-candy mt-2 h-11 w-full"
          />
          <div className="flex justify-between text-sm text-muted">
            <span>Nearest</span>
            <span>Cleanest</span>
          </div>
        </Card>
      </div>

      {/*
        Phones: pinned so it can be pressed after any step. The bar is solid down to the bottom nav, so nothing
        shows through between them, and its bottom padding only clears the mascot disc's rise above the nav
        (a little more ate the questions' room on small phones). A short fade on top lets the cards slide under it softly.
      */}
      <div className="fixed inset-x-0 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom))] z-30 bg-bg px-4 pb-[calc(var(--nav-crown)+0.25rem)] pt-1.5 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-linear-to-t before:from-bg before:to-transparent before:content-[''] md:static md:mt-6 md:bg-transparent md:p-0 md:before:hidden">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {/* Phones skip the summary line, so the questions keep the room; screen readers still hear it. */}
          <p className="truncate text-center text-sm font-semibold text-muted max-md:sr-only" aria-live="polite">
            {summary}
          </p>
          {/* One size down on phones (still well over 44px), so the questions keep more of the screen. */}
          <Button size="xl" className="w-full max-md:min-h-14 max-md:text-lg" onClick={submit} data-testid="go-submit">
            <Navigation className="size-6" aria-hidden /> Find my toilet
          </Button>
        </div>
      </div>
    </div>
  );
}

function TakeMe({ toiletId, item, urgent }: { toiletId: string; item: RecommendItem | null; urgent: boolean }) {
  const loc = useLocation();
  const router = useRouter();
  const sp = useSearchParams();

  // Opened from a shared/refreshed link: the recommendation may not be in cache.
  const toiletQ = useQuery({
    queryKey: ["toilet", toiletId],
    queryFn: ({ signal }) => api.toilet(toiletId, signal),
    enabled: !item,
  });
  // From a map card the toilet is already in a nearby list: start from it, so "Walk there" lands on the
  // route screen itself rather than a skeleton that the map then replaces.
  const qc = useQueryClient();
  const listed = useMemo(() => {
    if (item) return null;
    for (const q of qc.getQueryCache().findAll({ queryKey: ["nearby"] })) {
      const hit = (q.state.data as { items?: ToiletSummary[] } | undefined)?.items?.find((x) => x.id === toiletId);
      if (hit) return hit;
    }
    return null;
  }, [qc, item, toiletId]);
  const t: ToiletSummary | null = item?.toilet ?? (toiletQ.data as ToiletSummary | undefined) ?? listed;
  const gps = loc.source === "gps";
  // The fallback place is never a route origin: no walk time, no route from it, not in the framing.
  const noFix = loc.source === "default";
  // Follow the walker so the dot moves and "Arrived?" shows up on its own.
  useWatchPosition(true);
  // Rounded to ~100 m, so walking along refreshes the route now and then instead of on every fix,
  // and the map doesn't refit under the walker's thumb.
  const from = useMemo(
    () => ({ lat: roundCoord(loc.coords.lat, 3), lng: roundCoord(loc.coords.lng, 3) }),
    [loc.coords.lat, loc.coords.lng],
  );
  const routeFrom = gps ? from : loc.coords;

  const walk = useQuery({
    queryKey: ["walk", routeFrom.lat, routeFrom.lng, t?.lat, t?.lng],
    queryFn: () => api.walk({ fromLat: routeFrom.lat, fromLng: routeFrom.lng, toLat: t!.lat, toLng: t!.lng }),
    enabled: !!t && !item?.route && loc.settled && !noFix,
    staleTime: 10 * 60_000,
  });
  const hereM = t && gps ? haversineM(loc.coords, t) : null;
  const arrived = hereM !== null && hereM <= ARRIVED_M;

  // The walk has started once we know the toilet and where they are (or that we can't tell):
  // count it and remember it for the "How was it?" card (lib/route-session.ts dedupes repeats).
  const routeReady = !!t && loc.settled;
  const onRouteReady = useEffectEvent(() => {
    if (!t) return;
    const straight = noFix ? null : haversineM(loc.coords, t);
    startRoute({
      toiletId: t.id,
      name: t.venue.name,
      tier: t.tier,
      urgent,
      purpose: parsePurpose(sp.get("for"))?.key ?? null,
      distanceM: item?.walkDistanceM || walk.data?.distanceM || straight,
    });
  });
  useEffect(() => {
    if (routeReady) onRouteReady();
  }, [routeReady, toiletId]);

  const back = () => {
    const p = new URLSearchParams(sp);
    p.delete("to");
    if (window.history.length > 1) {
      if (resultsShown) animatedBack(toiletId, () => router.back());
      else historyBack(() => router.back());
    } else {
      // A replace is a React transition already, so it animates like any other view change.
      prepareRouteTransition();
      router.replace(`/go?${p.toString()}`);
    }
  };

  if (!t) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6">
        {toiletQ.isError ? (
          <ErrorState message={errorMessage(toiletQ.error)} onRetry={() => void toiletQ.refetch()} />
        ) : (
          <Skeleton className="h-64 rounded-3xl" />
        )}
      </div>
    );
  }

  const polyline = noFix ? null : (item?.route?.polyline ?? walk.data?.polyline ?? null);
  const routeSource = item?.route?.source ?? walk.data?.source ?? null;
  // An offline item's walk is a straight-line estimate, zero when it had nowhere to measure from.
  const seconds = noFix ? null : (item?.walkSeconds || walk.data?.durationS || null);
  const metres = item?.walkDistanceM || walk.data?.distanceM || null;
  // From a GPS fix, Google Maps starts from the phone's own live position and goes straight into navigation;
  // from a searched place, it starts there.
  const gmaps = googleMapsWalkingUrl(loc.source === "search" ? loc.coords : null, t);
  const facts = [t.label, t.level ? `Level ${t.level}` : null, t.areaType !== "UNKNOWN" ? AREA_TYPE_LABELS[t.areaType] : null].filter(
    Boolean,
  );
  const shut =
    t.status === "CLOSED"
      ? "This toilet is marked closed."
      : t.status === "RENOVATION"
        ? "This toilet is under renovation."
        : t.activeStatus.some((s) => s.kind === "CLOSED_NOW")
          ? "Someone reported it closed right now."
          : t.openNow === false
            ? "It's outside its opening hours right now."
            : null;

  return (
    <div className="fixed inset-0 z-10 flex flex-col md:top-[calc(4rem+env(safe-area-inset-top))]" data-testid="take-me">
      <ViewTransition name={routeMapName(t.id)} share="route-morph" default="none">
        <div className="relative min-h-0 flex-1" data-route-map={t.id}>
          <ToiletMap
            className="size-full"
            center={{ lat: t.lat, lng: t.lng }}
            zoom={16}
            showPins={false}
            user={gps ? loc.coords : null}
            accuracy={gps ? loc.accuracy : null}
            route={polyline}
            destination={{ lat: t.lat, lng: t.lng }}
            fitPoints={noFix ? [{ lat: t.lat, lng: t.lng }] : [routeFrom, { lat: t.lat, lng: t.lng }]}
            label={`Walking route to ${t.venue.name}`}
          />
          <button
            type="button"
            onClick={back}
            className="absolute left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 md:top-3 flex min-h-11 items-center gap-1 rounded-full bg-surface px-4 font-semibold shadow-card"
          >
            <ArrowLeft className="size-5" aria-hidden /> Back
          </button>
        </div>
      </ViewTransition>
      {/* On phones it runs down behind the bottom nav, and its padding clears the nav and its bump. */}
      <div className="rounded-t-[28px] border-t border-border bg-surface p-4 pb-[calc(var(--nav-h)+var(--nav-crown)+1rem+env(safe-area-inset-bottom))] shadow-card md:pb-4">
        <div className="mx-auto max-w-2xl">
          {noFix ? (
            // No fix: no walk time from somewhere else. Turning location on is the fix; Google Maps still works.
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-bold">Turn on location for walk time</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loc.locate()}
                loading={loc.status === "locating"}
              >
                {loc.status === "locating" ? null : <LocateFixed className="size-4" aria-hidden />}
                Use my location
              </Button>
            </div>
          ) : (
            <p className="flex flex-wrap items-baseline gap-x-2" aria-live="polite">
              {seconds !== null ? (
                <>
                  <span className="font-display text-4xl leading-none text-mint">{walkMinutes(seconds)}</span>
                  <span className="font-bold">min walk</span>
                  <span className="text-sm whitespace-nowrap text-muted tabular-nums">
                    {formatDistance(metres)}
                    {loc.source === "search" && loc.placeName ? ` from ${loc.placeName}` : null}
                  </span>
                </>
              ) : (
                <span className="text-muted">Working out the route…</span>
              )}
              {routeSource === "estimate" ? <span className="ml-auto text-xs text-muted">Route is approximate</span> : null}
            </p>
          )}
          {noFix && (loc.status === "denied" || loc.status === "unavailable") ? (
            <p className="mt-1 text-sm text-muted" role="status">
              {loc.status === "denied"
                ? "Location is off for this site. Allow it in your browser's settings to see the walk time."
                : "Couldn't find your location. Google Maps can still take you there."}
            </p>
          ) : null}
          <h2 className="mt-2 text-xl font-extrabold leading-tight">{t.venue.name}</h2>
          <p className="text-muted">{facts.join(" · ") || "Follow the red line on the map"}</p>
          {shut ? (
            <p className="mt-2 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger" role="status">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {shut} Check before you walk, or go back for another.
            </p>
          ) : null}

          {/* Standing at it (by a GPS fix): checking in is now the thing to do. */}
          {arrived ? (
            <Link
              href={`/toilets/${t.id}?do=checkin`}
              transitionTypes={["push"]}
              className={buttonClass("primary", "lg", "rise-in mt-4 w-full")}
              onClick={() => markArrived(t.id)}
              data-testid="arrived-checkin"
            >
              <MapPinCheck className="size-5" aria-hidden /> Arrived? Check in
            </Link>
          ) : null}

          {/* Getting there leads (hot red only when urgent); checking in is for after, so it stays secondary. */}
          <div className={cx("flex flex-col gap-2 sm:flex-row", arrived ? "mt-2" : "mt-4")}>
            <a
              href={gmaps}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass(urgent ? "urgent" : "primary", "lg", "flex-1")}
            >
              <ExternalLink className="size-5" aria-hidden /> Step by step in Google Maps
            </a>
            {arrived ? null : (
              <Link
                href={`/toilets/${t.id}?do=checkin`}
                transitionTypes={["push"]}
                className={buttonClass("secondary", "lg", "flex-1")}
                onClick={() => markArrived(t.id)}
              >
                <MapPinCheck className="size-5" aria-hidden /> I&apos;m here, check in
              </Link>
            )}
          </div>
          {walk.isError && !item?.route ? (
            <p className="mt-2 text-sm text-muted">Couldn&apos;t draw the route. Google Maps will get you there.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
