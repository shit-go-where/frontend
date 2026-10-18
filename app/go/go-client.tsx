"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Info,
  LocateFixed,
  MapPinCheck,
  Navigation,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LocationNotice, LocationSearch } from "@/components/location-search";
import { ToiletMap } from "@/components/map";
import {
  FeatureChips,
  OpenNow,
  StatusChips,
  TierBadge,
  UnverifiedClaim,
  lastVerifiedText,
} from "@/components/toilet-bits";
import { Button, Card, Chip, EmptyState, ErrorState, Skeleton, buttonClass, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type { RecommendBody, RecommendItem, SkippedVenue, ToiletSummary } from "@/lib/api/types";
import { FILTERS, requiredFeatures, toFilterQuery, type FilterKey } from "@/lib/filters";
import {
  AREA_TYPE_LABELS,
  cleanlinessText,
  featureReasons,
  formatDistance,
  googleMapsWalkingUrl,
  walkMinutes,
} from "@/lib/format";
import { roundCoord, useLocation } from "@/lib/location";
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
 *   /go                       the "Find a toilet" wizard
 *   /go?need=…&fussy=…        calm results
 *   /go?urgent=1              urgent results ("I need to go")
 *   …&to=<toiletId>           walking route to one of them
 */
export function GoClient() {
  const sp = useSearchParams();
  const urgent = sp.get("urgent") === "1";
  const fussyParam = sp.get("fussy");
  const need = useMemo(() => parseNeed(sp.get("need")), [sp]);
  const to = sp.get("to");
  const loc = useLocation();

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
      require: fq.features.length ? fq.features : undefined,
      openNow: fq.openNow || undefined,
      areaType: fq.areaType,
      // ASSUMPTION: weights are relative 0..1; "fussiness" trades distance for cleanliness.
      weights: { cleanliness: fussy / 10, distance: 1 - fussy / 20 },
    };
  }, [urgent, fussyParam, need, lat, lng]);

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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[2rem] leading-tight">{noFix ? "Where you at?" : "Quick, go here!"}</h1>
              <p className="mt-1 font-medium opacity-90">
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
                <Link href="/" className="font-semibold text-primary underline">
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
              <HeroCard item={first} urgent={urgent} required={required} />
              {rest.length ? (
                <section className="mt-6" aria-labelledby="alternates">
                  <h2 id="alternates" className="text-lg font-bold">
                    {urgent ? "Not this one? Try these" : "Also good"}
                  </h2>
                  <ol className="mt-2 flex flex-col gap-2" aria-label="Other options">
                    {rest.map((it) => (
                      <li key={it.toilet.id}>
                        <AltRow item={it} urgent={urgent} required={required} />
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

      {urgent ? (
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">
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

function HeroCard({ item, urgent, required }: { item: RecommendItem; urgent: boolean; required: ToiletSummary["features"] }) {
  const sp = useSearchParams();
  const loc = useLocation();
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
        <div className="h-36 border-b border-border sm:h-44">
          <ToiletMap
            className="size-full"
            center={{ lat: t.lat, lng: t.lng }}
            zoom={16}
            showPins={false}
            interactive={false}
            user={loc.source === "gps" ? loc.coords : null}
            route={item.route.polyline}
            destination={{ lat: t.lat, lng: t.lng }}
            fitPoints={[loc.coords, { lat: t.lat, lng: t.lng }]}
            padding={{ top: 56, bottom: 16, left: 24, right: 24 }}
            label={`Route preview to ${t.venue.name}`}
          />
        </div>
      ) : null}

      <div className="p-4">
        <p className="flex items-baseline gap-2">
          <span className="font-display text-5xl leading-none text-mint">{mins}</span>
          <span className="text-lg font-extrabold">min walk</span>
          <span className="ml-auto text-sm text-muted tabular-nums">{formatDistance(item.walkDistanceM)}</span>
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
}: {
  item: RecommendItem;
  urgent: boolean;
  required?: ToiletSummary["features"];
  noFix?: boolean;
}) {
  const sp = useSearchParams();
  const t = item.toilet;
  const mins = walkMinutes(item.walkSeconds);
  const caveat = t.tier === "IMPORTED" && required.length > 0;
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
        <span className="flex w-12 shrink-0 flex-col items-center rounded-2xl bg-mint py-1.5 text-center text-mint-fg shadow-gloss">
          {noFix ? (
            <span className="text-sm font-bold tabular-nums">{formatDistance(item.walkDistanceM)}</span>
          ) : (
            <>
              <span className="font-display text-xl leading-tight">{mins}</span>
              <span className="text-[11px] font-extrabold">min</span>
            </>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{t.venue.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <TierBadge tier={t.tier} />
            {t.label ? <span className="truncate">{t.label}</span> : null}
            {caveat ? <span className="font-semibold text-warn">Must-haves not checked in person</span> : null}
          </span>
        </span>
        <Navigation className="size-5 shrink-0 text-primary" aria-hidden />
      </Link>
      <Link
        href={`/toilets/${t.id}`}
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

  const submit = () => {
    const p = new URLSearchParams();
    if (active.size) p.set("need", [...active].join(","));
    p.set("fussy", String(fussy));
    router.push(`/go?${p.toString()}`);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
      <h1 className="text-[2rem] leading-tight">Where to go ah?</h1>
      <p className="mt-1 text-muted">Tell us what you need. We&apos;ll pick the best 3 toilets within walking distance.</p>

      <div className="mt-5 flex flex-col gap-2">
        <LocationSearch />
        <LocationNotice />
      </div>

      <fieldset className="mt-7">
        <legend className="text-lg font-bold">Must have</legend>
        <p className="mb-3 text-sm text-muted">We&apos;ll remember these for next time.</p>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Chip key={f.key} size="lg" active={active.has(f.key)} onClick={() => toggle(f.key)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">
          &ldquo;Outside fare gates&rdquo; skips MRT and bus interchange toilets you&apos;d need to tap in to reach.
        </p>
      </fieldset>

      <div className="mt-7">
        <label htmlFor="fussy" className="text-lg font-bold">
          Nearest or cleanest?
        </label>
        <input
          id="fussy"
          type="range"
          min={0}
          max={10}
          step={1}
          value={fussy}
          onChange={(e) => setFussy(Number(e.target.value))}
          aria-valuetext={fussy <= 2 ? "Nearest is fine" : fussy >= 8 ? "Cleanest, even if further" : "A bit of both"}
          className="mt-3 h-11 w-full"
        />
        <div className="flex justify-between text-sm text-muted">
          <span>Nearest is fine</span>
          <span>Cleanest, even if further</span>
        </div>
      </div>

      <Button size="xl" className="mt-8 w-full" onClick={submit} data-testid="go-submit">
        <Navigation className="size-6" aria-hidden /> Find my toilet
      </Button>
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
    if (window.history.length > 1) router.back();
    else router.replace(`/go?${p.toString()}`);
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
      <div className="relative min-h-0 flex-1">
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
      <div className="mb-[calc(4.5rem+env(safe-area-inset-bottom))] rounded-t-[28px] border-t border-border bg-surface p-4 shadow-card md:mb-0">
        <div className="mx-auto max-w-2xl">
          <p className="flex items-baseline gap-2" aria-live="polite">
            {seconds !== null ? (
              <>
                <span className="font-display text-4xl leading-none text-mint">{walkMinutes(seconds)}</span>
                <span className="font-bold">min walk</span>
                <span className="text-sm text-muted tabular-nums">{formatDistance(metres)}</span>
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
