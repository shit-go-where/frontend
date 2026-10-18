"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Baby,
  ChevronRight,
  Droplet,
  ExternalLink,
  Flower2,
  Info,
  LocateFixed,
  MapPinCheck,
  Navigation,
  ShowerHead,
  SlidersHorizontal,
  Sparkles,
  Toilet,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ViewTransition, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { LocationNotice, LocationSearch } from "@/components/location-search";
import { ToiletMap } from "@/components/map";
import { prepareRouteTransition } from "@/components/route-transition";
import {
  FeatureChips,
  FilterChipLabel,
  OpenNow,
  StatusChips,
  TierBadge,
  UnverifiedClaim,
  lastVerifiedText,
} from "@/components/toilet-bits";
import { Button, Card, Chip, EmptyState, ErrorState, Skeleton, buttonClass, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type { Feature, Purpose, RecommendBody, RecommendItem, SkippedVenue, ToiletSummary } from "@/lib/api/types";
import { FILTERS, requiredFeatures, toFilterQuery, type FilterKey } from "@/lib/filters";
import {
  AREA_TYPE_LABELS,
  FEATURE_LABELS,
  cleanlinessText,
  featureReasons,
  formatDistance,
  googleMapsWalkingUrl,
  walkMinutes,
} from "@/lib/format";
import { roundCoord, useLocation } from "@/lib/location";
import { PURPOSE_OPTIONS, parsePurpose, type PurposeOption } from "@/lib/purposes";
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
export function GoClient() {
  const sp = useSearchParams();
  const urgent = sp.get("urgent") === "1";
  const fussyParam = sp.get("fussy");
  const need = useMemo(() => parseNeed(sp.get("need")), [sp]);
  const purpose = useMemo(() => parsePurpose(sp.get("for")), [sp]);
  const to = sp.get("to");
  const loc = useLocation();
  // The results view is in: let an animated Back from the route view finish its update.
  useLayoutEffect(() => {
    if (!to) settleBack();
  }, [to]);

  const lat = roundCoord(loc.coords.lat);
  const lng = roundCoord(loc.coords.lng);
  const showWizard = !urgent && fussyParam === null;

  const body = useMemo<RecommendBody | null>(() => {
    if (urgent) return { lat, lng, urgent: true };
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
  }, [urgent, fussyParam, need, purpose, lat, lng]);

  const rec = useQuery({
    queryKey: ["recommend", body],
    queryFn: ({ signal }) => api.recommend(body!, signal),
    enabled: !!body && loc.settled,
    staleTime: 60_000,
  });

  if (to) {
    const item = rec.data?.items.find((i) => i.toilet.id === to) ?? null;
    return <TakeMe toiletId={to} item={item} urgent={urgent} />;
  }

  if (showWizard) return <Wizard />;

  const required = requiredFeatures(new Set(need));
  const noFix = loc.settled && loc.source === "default";
  const items = rec.data?.items.slice(0, 3) ?? [];
  const [first, ...rest] = items;
  const from = loc.source === "gps" ? "you" : (loc.placeName ?? "here");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10">
      {urgent ? (
        <header className="-mx-4 rounded-b-3xl bg-urgent px-4 pb-10 pt-5 text-urgent-fg sm:mx-0 md:rounded-none md:shadow-[0_0_0_100vmax_var(--urgent)] md:[clip-path:inset(0_-100vmax)]">
          {/* Wraps "Filters" under the title only when large text leaves no room beside it. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 grow basis-48">
              <h1 className="text-[2rem] leading-tight">{noFix ? "Where you at?" : "Quick, go here!"}</h1>
              {/* Two lines kept on phones, so the result line arriving never pushes the card down. */}
              <p className="mt-1 font-medium opacity-90 max-sm:min-h-12">
                {noFix
                  ? "We can't find your location, so we can't tell how far anything is yet."
                  : rec.data
                    ? `Nearest good toilet from ${from}, within ${formatDistance(rec.data.searchedRadiusM)}`
                    : "Finding the nearest good toilet…"}
              </p>
            </div>
            <Link
              href="/go"
              className="tap inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-urgent-fg/60 px-3 text-sm font-semibold hover:bg-urgent-fg/10"
            >
              <SlidersHorizontal className="size-4" aria-hidden /> Filters
            </Link>
          </div>
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
          <Link href="/go" className={buttonClass("secondary", "sm", "shrink-0")}>
            <SlidersHorizontal className="size-4" aria-hidden /> Change
          </Link>
        </header>
      )}

      {noFix ? (
        <NoFix urgent={urgent} />
      ) : !urgent ? (
        <div className="mt-3">
          <LocationNotice />
        </div>
      ) : null}

      <div className={cx(urgent && !noFix ? "-mt-6" : "mt-5")}>
        {!loc.settled ? (
          <p role="status" className={cx("mb-3", urgent ? "sr-only" : "text-muted")}>
            Getting your location…
          </p>
        ) : null}
        {/* Always rendered, so the result is announced when it lands (focus stays where it was). */}
        <p role="status" className="sr-only">
          {rec.data
            ? first
              ? `Closest: ${first.toilet.venue.name}, ${walkMinutes(first.walkSeconds)} minute walk.`
              : "No toilet found nearby."
            : ""}
        </p>
        {rec.isError ? (
          <ErrorState message={errorMessage(rec.error)} onRetry={() => void rec.refetch()} />
        ) : rec.isLoading || !loc.settled ? (
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

      {/* Only once there is something above it, so it never jumps as the results arrive. */}
      {urgent && (rec.data || rec.isError || noFix) ? (
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
            ? "Location permission is off for this site. Search for the MRT station, mall or postal code you're at."
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
  const extras = featureReasons(item.reasons);
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
          <div className="h-36 border-b border-border bg-surface-2 sm:h-44" data-route-map={t.id}>
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
                padding={{ top: 56, bottom: 44, left: 24, right: 24 }}
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
        <h2 className="mt-3 text-2xl leading-tight">{t.venue.name}</h2>
        {t.label || facts.length ? (
          <p className="mt-0.5 text-muted">{[t.label, ...facts].filter(Boolean).join(" · ")}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <TierBadge tier={t.tier} />
          <span className="inline-flex items-center gap-1">
            <Sparkles className="size-4 text-accent" aria-hidden /> {cleanlinessText(t.scoreCleanliness)}
          </span>
          <OpenNow openNow={t.openNow} />
        </div>
        {extras.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Has">
            {extras.map((r) => (
              <li key={r} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium">
                {r}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <FeatureChips features={t.features} />
          </div>
        )}
        <div className="mt-2 flex flex-col gap-2">
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
        <p className="mt-2 text-xs text-muted">{lastVerifiedText(t)}</p>

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
            <TierBadge tier={t.tier} />
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
  const summary = [
    purpose?.label ?? "Any mission",
    active.size ? `${active.size} must-have${active.size === 1 ? "" : "s"}` : "No must-haves",
    fussyText,
  ].join(" · ");

  return (
    // Phones: room below the last card for the pinned button, which floats above the bottom nav.
    <div className="mx-auto w-full max-w-2xl px-4 pb-36 pt-4 md:pb-10">
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
            <div className="mt-4 flex flex-col gap-4">
              {MUST_HAVE_GROUPS.map((g) => (
                <div key={g.label} role="group" aria-labelledby={`must-${g.id}`} className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                  <h3 id={`must-${g.id}`} className="text-sm font-extrabold text-muted sm:w-32 sm:shrink-0 sm:pt-3">
                    {g.label}
                  </h3>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      {g.keys.map((k) => {
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
                      })}
                    </div>
                    {g.note ? <p className="text-sm text-muted">{g.note}</p> : null}
                  </div>
                </div>
              ))}
            </div>
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
            className="mt-2 h-11 w-full"
          />
          <div className="flex justify-between text-sm text-muted">
            <span>Nearest</span>
            <span>Cleanest</span>
          </div>
        </Card>
      </div>

      {/*
        Phones: pinned so it can be pressed after any step. The bar is solid down to the bottom nav, so nothing
        shows through between them, and its bottom padding keeps the button clear of the raised poo button.
        A short fade on top lets the cards slide under it softly.
      */}
      <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 bg-bg px-4 pb-14 pt-2 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-linear-to-t before:from-bg before:to-transparent before:content-[''] md:static md:mt-6 md:bg-transparent md:p-0 md:before:hidden">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <p className="truncate text-center text-sm font-semibold text-muted" aria-live="polite">
            {summary}
          </p>
          <Button size="xl" className="w-full" onClick={submit} data-testid="go-submit">
            <Navigation className="size-6" aria-hidden /> Find my toilet
          </Button>
        </div>
      </div>
    </div>
  );
}

const FILTER_LABEL = Object.fromEntries(FILTERS.map((f) => [f.key, f.label])) as Record<FilterKey, string>;

/** The ten must-haves, grouped by what they're about so the list scans. Every FILTERS key appears once. */
const MUST_HAVE_GROUPS: { id: string; label: string; keys: FilterKey[]; note?: string }[] = [
  { id: "facilities", label: "Facilities", keys: ["BIDET", "SITTING", "SHOWER", "BABY_CHANGE", "NURSING_ROOM"] },
  { id: "access", label: "Access", keys: ["ACCESSIBLE", "FREE", "UNISEX"] },
  {
    id: "when-where",
    label: "When and where",
    keys: ["OPEN_NOW", "UNPAID_AREA"],
    note: "“Outside fare gates” skips MRT and bus interchange toilets you'd need to tap in to reach.",
  },
];

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
  const t: ToiletSummary | null = item?.toilet ?? (toiletQ.data as ToiletSummary | undefined) ?? null;
  const from = loc.coords;

  const walk = useQuery({
    queryKey: ["walk", from.lat, from.lng, t?.lat, t?.lng],
    queryFn: () => api.walk({ fromLat: from.lat, fromLng: from.lng, toLat: t!.lat, toLng: t!.lng }),
    enabled: !!t && !item?.route && loc.settled,
    staleTime: 10 * 60_000,
  });

  const back = () => {
    const p = new URLSearchParams(sp);
    p.delete("to");
    if (window.history.length > 1) animatedBack(toiletId, () => router.back());
    else {
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

  const polyline = item?.route?.polyline ?? walk.data?.polyline ?? null;
  const routeSource = item?.route?.source ?? walk.data?.source ?? null;
  const seconds = item?.walkSeconds ?? walk.data?.durationS ?? null;
  const metres = item?.walkDistanceM ?? walk.data?.distanceM ?? null;
  const gmaps = googleMapsWalkingUrl(loc.source === "default" ? null : from, t);
  const facts = [t.label, t.level ? `Level ${t.level}` : null, t.areaType !== "UNKNOWN" ? AREA_TYPE_LABELS[t.areaType] : null].filter(
    Boolean,
  );

  return (
    <div className="fixed inset-0 z-10 flex flex-col md:top-16" data-testid="take-me">
      <ViewTransition name={routeMapName(t.id)} share="route-morph" default="none">
        <div className="relative min-h-0 flex-1" data-route-map={t.id}>
          <ToiletMap
            className="size-full"
            center={{ lat: t.lat, lng: t.lng }}
            zoom={16}
            showPins={false}
            user={loc.source === "gps" ? from : null}
            route={polyline}
            destination={{ lat: t.lat, lng: t.lng }}
            fitPoints={[from, { lat: t.lat, lng: t.lng }]}
            label={`Walking route to ${t.venue.name}`}
          />
          <button
            type="button"
            onClick={back}
            className="absolute left-4 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex min-h-11 items-center gap-1 rounded-full bg-surface px-4 font-semibold shadow-card"
          >
            <ArrowLeft className="size-5" aria-hidden /> Back
          </button>
        </div>
      </ViewTransition>
      {/* On phones it runs down behind the bottom nav, and its padding clears the raised mascot button. */}
      <div className="rounded-t-[28px] border-t border-border bg-surface p-4 pb-[calc(7.25rem+env(safe-area-inset-bottom))] shadow-card md:pb-4">
        <div className="mx-auto max-w-2xl">
          <p className="flex items-baseline gap-2" aria-live="polite">
            {seconds !== null ? (
              <>
                <span className="font-display text-4xl leading-none text-mint">{walkMinutes(seconds)}</span>
                <span className="font-bold">min walk</span>
                <span className="text-sm whitespace-nowrap text-muted tabular-nums">{formatDistance(metres)}</span>
              </>
            ) : (
              <span className="text-muted">Working out the route…</span>
            )}
            {routeSource === "estimate" ? <span className="ml-auto text-xs text-muted">Route is approximate</span> : null}
          </p>
          <h2 className="mt-2 text-xl font-extrabold leading-tight">{t.venue.name}</h2>
          <p className="text-muted">{facts.join(" · ") || "Follow the red line on the map"}</p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/toilets/${t.id}?checkin=1`}
              transitionTypes={["push"]}
              className={buttonClass(urgent ? "urgent" : "primary", "lg", "flex-1")}
            >
              <MapPinCheck className="size-5" aria-hidden /> I&apos;m here, check in
            </Link>
            <a href={gmaps} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "lg", "flex-1")}>
              <ExternalLink className="size-5" aria-hidden /> Step by step in Google Maps
            </a>
          </div>
          {walk.isError && !item?.route ? (
            <p className="mt-2 text-sm text-muted">Couldn&apos;t draw the route. Google Maps will get you there.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
