"use client";

import {
  ArrowDown,
  BookOpen,
  Bus,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Coffee,
  Dumbbell,
  Globe,
  Hospital,
  Landmark,
  Map as MapIcon,
  MapPin,
  ShoppingBag,
  Sparkles,
  TrainFront,
  Trees,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/back-button";
import { FoldMotion, Reveal, Tick, usePresence } from "@/components/presence";
import { FeatureChips, FilterChipLabel, LineBadge, TierBadge, lastVerifiedText } from "@/components/toilet-bits";
import { Button, Chip, EmptyState, Skeleton, buttonClass, cx } from "@/components/ui";
import type { AreaDetail, AreaVenue, Feature, ToiletSummary, ToiletTier, VenueType } from "@/lib/api/types";
import type { FilterKey } from "@/lib/filters";
import { FILTERS } from "@/lib/filters";
import {
  FEATURE_LABELS,
  REGION_LABELS,
  VENUE_TYPE_LABELS,
  VENUE_TYPE_SECTIONS,
  areaSlug,
  formatDistance,
  placeName,
  plural,
  shortAddress,
  timeAgo,
  scoreNumber,
} from "@/lib/format";
import { useLocation } from "@/lib/location";
import { EASE_OUT, reducedMotion } from "@/lib/motion";

/**
 * Must-haves someone can plan around. "Outside fare gates" is left out until toilets carry a known
 * area type, and "Open now" because this page is cached for an hour.
 */
const AREA_FILTERS: FilterKey[] = ["ACCESSIBLE", "BIDET", "BABY_CHANGE", "FREE"];
const FILTER_LABEL = Object.fromEntries(FILTERS.map((f) => [f.key, f.label])) as Record<FilterKey, string>;

const TYPE_ICON: Record<VenueType, React.ComponentType<{ className?: string }>> = {
  MRT_STATION: TrainFront,
  BUS_INTERCHANGE: Bus,
  MALL: ShoppingBag,
  HAWKER_CENTRE: UtensilsCrossed,
  COFFEESHOP: Coffee,
  COMMUNITY_CLUB: Landmark,
  LIBRARY: BookOpen,
  SPORTS_CENTRE: Dumbbell,
  HOSPITAL: Hospital,
  PARK: Trees,
  OTHER: MapPin,
};

const OPEN_DATA_ID = "open-data";

/** A jump lands: the section's icon squashes and springs up, the mascot's plop. */
const LAND: Keyframe[] = [
  { transform: "none" },
  { transform: "translateY(3px) scale(1.2, 0.8)", offset: 0.3 },
  { transform: "translateY(-6px) scale(0.92, 1.1)", offset: 0.62 },
  { transform: "none" },
];

/**
 * The jump links glide to their section instead of teleporting, then the section's icon plops
 * to say "here". Focus moves to the section, as a native jump would. Reduced motion: it jumps.
 */
function jumpTo(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  const still = reducedMotion();
  window.history.replaceState(window.history.state, "", `#${id}`);
  const icon = target.querySelector<HTMLElement>("[data-land]");
  const land = () => icon?.animate(LAND, { duration: 520, easing: EASE_OUT });
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const already = Math.abs(target.getBoundingClientRect().top - margin) < 2;
  target.scrollIntoView({ behavior: still ? "instant" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
  if (still) return;
  if (already) {
    land();
    return;
  }
  // Land when the glide ends; a timer stands in where `scrollend` is missing or never comes.
  let fallback = 0;
  const onEnd = () => {
    window.clearTimeout(fallback);
    window.removeEventListener("scrollend", onEnd);
    land();
  };
  window.addEventListener("scrollend", onEnd, { once: true });
  fallback = window.setTimeout(onEnd, "onscrollend" in window ? 1500 : 500);
}

/** `?has=accessible,bidet`: kept in the URL so a filtered list can be shared, read after hydration so the server HTML stays the full list. */
function readFilters(): Set<FilterKey> {
  const raw = new URLSearchParams(window.location.search).get("has") ?? "";
  const wanted = raw.toUpperCase().split(",");
  return new Set(AREA_FILTERS.filter((k) => wanted.includes(k)));
}

function writeFilters(active: Set<FilterKey>) {
  const url = new URL(window.location.href);
  if (active.size) url.searchParams.set("has", [...active].map((k) => k.toLowerCase()).join(","));
  else url.searchParams.delete("has");
  window.history.replaceState(window.history.state, "", url);
}

/** The cleanest open toilet someone has actually checked. Imports never win: nobody has scored them in person. */
function bestBet(venues: AreaVenue[]): { venue: AreaVenue; toilet: ToiletSummary } | null {
  let best: { venue: AreaVenue; toilet: ToiletSummary } | null = null;
  for (const venue of venues) {
    for (const toilet of venue.toilets) {
      if (toilet.status !== "ACTIVE" || toilet.tier === "IMPORTED" || toilet.scoreCleanliness === null) continue;
      if (!best || toilet.scoreCleanliness > best.toilet.scoreCleanliness!) best = { venue, toilet };
    }
  }
  return best;
}

function listText(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? "");
}

/** "6 surveyed in person and 13 from open data": the tier mix, said once, in words. */
function tierMix(venues: AreaVenue[]): string {
  const n = (tier: ToiletTier) =>
    venues.reduce((s, v) => s + v.toilets.filter((t) => t.status === "ACTIVE" && t.tier === tier).length, 0);
  const parts = [
    [n("VERIFIED"), "surveyed in person"],
    [n("COMMUNITY"), "added by the community"],
    [n("IMPORTED"), "from open data"],
  ] as const;
  const present = parts.filter(([count]) => count > 0);
  if (present.length === 1) return `All ${present[0][1]}`;
  return listText(present.map(([count, what]) => `${count} ${what}`));
}

/** A place is "checked" if any of its toilets is verified or community. Its imported toilets stay with it. */
function isChecked(v: AreaVenue) {
  return v.toilets.some((t) => t.tier !== "IMPORTED");
}

export function AreaView({ area }: { area: AreaDetail }) {
  const [active, setActive] = useState<Set<FilterKey>>(() => new Set());
  // Lists fold only once someone taps a filter; a shared filter from the URL applies at once.
  const [folding, setFolding] = useState(false);
  useEffect(() => {
    // The URL is client-only; apply a shared filter after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(readFilters());
  }, []);
  const toggle = (k: FilterKey) => {
    const next = new Set(active);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setFolding(true);
    setActive(next);
    writeFilters(next);
  };
  const clear = () => {
    setFolding(true);
    setActive(new Set());
    writeFilters(new Set());
  };
  return (
    <FoldMotion value={folding}>
      <AreaBody area={area} active={active} toggle={toggle} clear={clear} />
    </FoldMotion>
  );
}

function AreaBody({
  area,
  active,
  toggle,
  clear,
}: {
  area: AreaDetail;
  active: Set<FilterKey>;
  toggle: (k: FilterKey) => void;
  clear: () => void;
}) {

  const required = useMemo(() => AREA_FILTERS.filter((k) => active.has(k)) as Feature[], [active]);
  const venues = useMemo(
    () =>
      required.length
        ? area.venues
            .map((v) => ({ ...v, toilets: v.toilets.filter((t) => required.every((f) => t.features.includes(f))) }))
            .filter((v) => v.toilets.length)
        : area.venues,
    [area.venues, required],
  );
  const sections = useMemo(
    () =>
      VENUE_TYPE_SECTIONS.map((s) => ({
        ...s,
        id: areaSlug(s.title),
        venues: venues.filter((v) => v.type === s.type && isChecked(v)),
      })).filter((s) => s.venues.length),
    [venues],
  );
  const openData = useMemo(
    () => venues.filter((v) => !isChecked(v)).flatMap((v) => v.toilets.map((t) => ({ venue: v, toilet: t }))),
    [venues],
  );
  const shown = venues.reduce((n, v) => n + v.toilets.length, 0);
  const bests = useMemo(() => {
    const b = bestBet(venues);
    return b ? [b] : [];
  }, [venues]);
  const wanted = useMemo(() => listText(required.map((f) => FEATURE_LABELS[f].toLowerCase())), [required]);
  const matchText = required.length ? `${plural(shown, "toilet")} with ${wanted}` : "";

  // Each optional block is a one-item presence list holding its own data, so a block folding
  // away still shows what it held rather than emptying first.
  const navs = useMemo(() => {
    const jumps = [
      ...sections.map((s) => ({ id: s.id, label: s.title })),
      ...(openData.length ? [{ id: OPEN_DATA_ID, label: "Open data" }] : []),
    ];
    return jumps.length >= 2 ? [jumps] : [];
  }, [sections, openData]);
  const opens = useMemo(() => (openData.length ? [openData] : []), [openData]);
  const empties = useMemo(() => (shown ? [] : [wanted]), [shown, wanted]);

  const nav = usePresence(navs, () => "nav");
  const best = usePresence(bests, (b) => b.toilet.id);
  const sectionList = usePresence(sections, (s) => s.id);
  const open = usePresence(opens, () => OPEN_DATA_ID);
  const empty = usePresence(empties, () => "empty");

  return (
    <article className="mx-auto w-full max-w-2xl px-4 pb-12 pt-4">
      <BackButton
        fallback={{ href: "/areas", label: "All areas" }}
        icon={ChevronLeft}
        iconClassName="size-4"
        className={buttonClass("ghost", "sm", "-ml-3 text-muted hover:text-fg")}
      />
      <h1 className="mt-2 text-3xl leading-tight text-balance sm:text-4xl">Toilets in {area.name}</h1>
      <p className="mt-2 text-muted text-pretty">
        <span className="tabular-nums">{plural(area.toiletCount, "public toilet")}</span> at{" "}
        <span className="tabular-nums">{plural(area.venueCount, "place")}</span>
        {area.region ? `, ${REGION_LABELS[area.region]} region` : ""}. <span className="tabular-nums">{tierMix(area.venues)}</span>.
      </p>
      <MapLink area={area} />

      <div className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 mt-5 border-b border-border/70 bg-bg px-4 py-2.5 md:top-[calc(4rem+env(safe-area-inset-top))]">
        {/* Runs to the screen edge and fades there, so a chip cut off at the edge reads as "scroll for more". */}
        <div
          className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-2rem),transparent)] [scrollbar-width:none]"
          role="group"
          aria-label="Must have"
        >
          {AREA_FILTERS.map((k) => (
            <Chip key={k} active={active.has(k)} onClick={() => toggle(k)}>
              <FilterChipLabel k={k} label={FILTER_LABEL[k]} active={active.has(k)} />
            </Chip>
          ))}
        </div>
        {/* Opens and closes on a grid row instead of popping in, so the list under the bar doesn't jump. */}
        <div
          className={cx(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-opacity",
            matchText ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
          aria-hidden
        >
          <p className="overflow-hidden text-sm text-muted tabular-nums">
            <Tick value={matchText} className="pt-1.5">
              {matchText || " "}
            </Tick>
          </p>
        </div>
        <p aria-live="polite" className="sr-only">
          {matchText}
        </p>
      </div>

      {nav.entries.map((e) => (
        <Reveal key={e.key} as="nav" aria-label="Jump to" entering={e.entering} leaving={e.leaving} onExited={() => nav.exited(e.key)}>
          {/*
            Links, not chips: pink text with a down arrow, so they never read as more filters. No counts, since a
            section counts places and the summary above counts toilets, and the two looked like they disagreed.
          */}
          <div className="-mx-3 flex flex-wrap gap-x-1 pt-3">
            {e.item.map((j) => (
              <a
                key={j.id}
                href={`#${j.id}`}
                onClick={(ev) => jumpTo(ev, j.id)}
                className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-extrabold text-primary hover:bg-surface-2"
              >
                <ArrowDown className="size-4" aria-hidden />
                {j.label}
              </a>
            ))}
          </div>
        </Reveal>
      ))}

      {best.entries.map((e) => (
        <Reveal key={e.key} entering={e.entering} leaving={e.leaving} onExited={() => best.exited(e.key)}>
          <BestBet venue={e.item.venue} toilet={e.item.toilet} />
        </Reveal>
      ))}

      {sectionList.entries.map((e) => {
        const s = e.item;
        const Icon = TYPE_ICON[s.type];
        return (
          <Reveal
            key={e.key}
            as="section"
            id={s.id}
            aria-labelledby={`${s.id}-h`}
            tabIndex={-1}
            className="scroll-mt-28 outline-none md:scroll-mt-44"
            entering={e.entering}
            leaving={e.leaving}
            onExited={() => sectionList.exited(e.key)}
          >
            <div className="pt-10">
              <SectionHeading id={`${s.id}-h`} icon={Icon} title={s.title} count={plural(s.venues.length, "place")} />
              <PlaceList venues={s.venues} />
            </div>
          </Reveal>
        );
      })}

      {open.entries.map((e) => (
        <Reveal
          key={e.key}
          as="section"
          id={OPEN_DATA_ID}
          aria-labelledby="open-data-h"
          tabIndex={-1}
          className="scroll-mt-28 outline-none md:scroll-mt-44"
          entering={e.entering}
          leaving={e.leaving}
          onExited={() => open.exited(e.key)}
        >
          <div className="pt-10">
            <SectionHeading id="open-data-h" icon={Globe} title="From open data" count={plural(e.item.length, "toilet")} />
            <p className="mt-2 text-sm text-muted">
              Nobody has checked these in person yet, so what they list, or whether they&apos;re still there, may be out of date.
              Been to one? Check in from its page and it moves up.
            </p>
            <OpenDataList rows={e.item} />
          </div>
        </Reveal>
      ))}

      {empty.entries.map((e) => (
        <Reveal key={e.key} entering={e.entering} leaving={e.leaving} onExited={() => empty.exited(e.key)}>
          <div className="pt-8">
            <div className="rounded-3xl border border-border/70 bg-surface shadow-rest">
              <EmptyState
                mascot="lost"
                title="Nothing ticks every box"
                action={
                  <Button variant="secondary" onClick={clear}>
                    Clear filters
                  </Button>
                }
              >
                <p>
                  No toilet in {area.name} lists {e.item}. Most open-data toilets don&apos;t say what they have yet, so one of them
                  might still do.
                </p>
              </EmptyState>
            </div>
          </div>
        </Reveal>
      ))}

      {area.pendingCount > 0 ? (
        <p className="mt-8 text-sm text-muted">
          {area.pendingCount === 1 ? "1 more toilet is" : `${area.pendingCount} more toilets are`} waiting for review here.{" "}
          <Link href="/review" className="font-bold text-primary underline underline-offset-2 hover:decoration-[3px]">
            Help review
          </Link>
        </p>
      ) : null}

      {area.noToiletVenues.length ? <NoToilet venues={area.noToiletVenues} /> : null}

      <p className="mt-12 border-t border-border/70 pt-4 text-sm text-muted">
        From our March 2024 fieldwork survey, the community, OpenStreetMap contributors (ODbL) and data.gov.sg (Singapore Open Data
        Licence).{" "}
        <Link href="/about" className="font-bold text-primary underline underline-offset-2 hover:decoration-[3px]">
          About our data
        </Link>
      </p>
    </article>
  );
}

/**
 * Opens the home map centred on the area. Home has no URL for a centre, so this sets the area as
 * the searched place, exactly as picking it in the map's place search would: the map flies there,
 * the list reads "near {area}", and walk times stay off because it isn't the person's own fix.
 */
function MapLink({ area }: { area: AreaDetail }) {
  const { setManual } = useLocation();
  const center = area.center;
  if (!center) return null;
  return (
    <Link
      href="/"
      onClick={() => setManual({ lat: center.lat, lng: center.lng, name: area.name })}
      className="-ml-2 mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2"
    >
      <MapIcon className="size-5" aria-hidden />
      See these on the map
    </Link>
  );
}

function SectionHeading({
  id,
  icon: Icon,
  title,
  count,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {/* data-land: where a jump link lands, this plops (jumpTo). */}
      <span data-land className="mt-0.5 shrink-0 origin-bottom">
        <Icon className="size-6 text-muted" aria-hidden />
      </span>
      <div>
        <h2 id={id} className="text-2xl leading-tight">
          {title}
        </h2>
        <p className="text-sm font-bold text-muted tabular-nums">
          <Tick value={count}>{count}</Tick>
        </p>
      </div>
    </div>
  );
}

function Score({ t }: { t: ToiletSummary }) {
  if (t.scoreCleanliness === null) return <span className="text-sm text-muted">No score yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums">
      <Sparkles className="size-3.5 text-accent" aria-hidden />
      {scoreNumber(t.scoreCleanliness)}/10
      <span className="sr-only"> clean</span>
    </span>
  );
}

function BestBet({ venue, toilet }: { venue: AreaVenue; toilet: ToiletSummary }) {
  const where = [toilet.label, toilet.level ? `Level ${toilet.level}` : null].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby="best-h" className="pt-8">
      <h2 id="best-h" className="flex flex-wrap items-baseline gap-x-3 text-2xl leading-tight">
        Best bet
        <span className="font-sans text-sm font-bold text-muted">cleanest checked toilet</span>
      </h2>
      <div className="mt-3 rounded-[28px] border border-border/70 bg-surface p-5 shadow-rest">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl leading-tight text-balance">{placeName(venue)}</p>
            {where ? <p className="mt-0.5 font-medium text-muted">{where}</p> : null}
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold text-muted">
              {VENUE_TYPE_LABELS[venue.type]}
              {venue.lines.map((l) => (
                <LineBadge key={l} line={l} />
              ))}
            </p>
          </div>
          <p className="flex shrink-0 flex-col items-end">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-5 text-accent" aria-hidden />
              <span className="font-display text-4xl leading-none">{scoreNumber(toilet.scoreCleanliness!)}</span>
            </span>
            <span className="mt-1 text-xs font-extrabold text-muted">clean out of 10</span>
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <TierBadge tier={toilet.tier} />
          <span className="text-xs text-muted">{lastVerifiedText(toilet)}</span>
        </div>
        <div className="mt-3">
          <FeatureChips features={toilet.features} />
        </div>
        <Link href={`/toilets/${toilet.id}`} transitionTypes={["push"]} className={buttonClass("primary", "md", "mt-5 w-full sm:w-auto")}>
          See this toilet
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

const LIST_CARD = "mt-3 divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest";

/** A section's places. Ones a filter rules out fold shut and the rest close up; clearing it folds them back. */
function PlaceList({ venues }: { venues: AreaVenue[] }) {
  const { entries, exited } = usePresence(venues, (v) => v.id);
  return (
    <ul className={LIST_CARD}>
      {entries.map((e) => (
        <Reveal key={e.key} as="li" entering={e.entering} leaving={e.leaving} onExited={() => exited(e.key)}>
          <PlaceGroup v={e.item} />
        </Reveal>
      ))}
    </ul>
  );
}

function OpenDataList({ rows }: { rows: { venue: AreaVenue; toilet: ToiletSummary }[] }) {
  const { entries, exited } = usePresence(rows, (r) => r.toilet.id);
  return (
    <ul className={LIST_CARD}>
      {entries.map((e) => (
        <Reveal key={e.key} as="li" entering={e.entering} leaving={e.leaving} onExited={() => exited(e.key)}>
          <OpenDataRow v={e.item.venue} t={e.item.toilet} />
        </Reveal>
      ))}
    </ul>
  );
}

/** One place: name and lines, then its tier and age said once, then a fact line per toilet. */
function PlaceGroup({ v }: { v: AreaVenue }) {
  const lead = v.toilets[0].tier;
  const latest = v.toilets.reduce<string | null>(
    (m, t) => (t.lastVerifiedAt && (!m || t.lastVerifiedAt > m) ? t.lastVerifiedAt : m),
    null,
  );
  const toilets = usePresence(v.toilets, (t) => t.id);
  return (
    <div className="pb-1.5">
      <div className="px-4 pt-3.5">
        <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-extrabold leading-snug">
          {v.name}
          {v.lines.map((l) => (
            <LineBadge key={l} line={l} />
          ))}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <TierBadge tier={lead} />
          {latest ? `checked ${timeAgo(latest)}` : null}
        </p>
        {v.note ? <p className="mt-1.5 text-sm text-muted">{v.note}</p> : null}
      </div>
      <ul className="mt-1">
        {toilets.entries.map((e) => (
          <Reveal key={e.key} as="li" entering={e.entering} leaving={e.leaving} onExited={() => toilets.exited(e.key)}>
            <ToiletLine t={e.item} venueName={v.name} lead={lead} only={v.toilets.length === 1} />
          </Reveal>
        ))}
      </ul>
    </div>
  );
}

const CLOSED_LABEL: Partial<Record<ToiletSummary["status"], string>> = {
  CLOSED: "Closed",
  RENOVATION: "Under renovation",
};

function ToiletLine({ t, venueName, lead, only }: { t: ToiletSummary; venueName: string; lead: ToiletTier; only: boolean }) {
  // A place's only toilet needs no name of its own: the place header already says where it is.
  const title = t.label ?? (t.level ? `Level ${t.level}` : only ? null : "Toilet");
  const level = t.label && t.level ? `Level ${t.level}` : null;
  const closed = CLOSED_LABEL[t.status];
  return (
    <Link
      href={`/toilets/${t.id}`}
      transitionTypes={["push"]}
      className="group flex min-h-12 items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2"
      data-testid="area-toilet"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold">
            <span className="sr-only">{venueName}{title ? ": " : ""}</span>
            {title}
            {level ? <span className="font-medium text-muted"> · {level}</span> : null}
          </span>
          {closed ? (
            <span className="inline-flex items-center rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-extrabold text-danger">
              {closed}
            </span>
          ) : (
            <Score t={t} />
          )}
          {/* The place header carries the tier; a toilet only repeats it when it differs. */}
          {t.tier !== lead ? <TierBadge tier={t.tier} /> : null}
          <FeatureChips features={t.features} max={3} plain />
        </span>
        {t.needsResurvey ? <span className="mt-0.5 block text-xs text-muted">Due for a re-survey</span> : null}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted transition-colors group-hover:text-primary" aria-hidden />
    </Link>
  );
}

/** Open-data toilets: one flowing line each. The section says where they come from, so rows don't. */
function OpenDataRow({ v, t }: { v: AreaVenue; t: ToiletSummary }) {
  const where = v.near
    ? `${formatDistance(v.near.distanceM)} from ${placeName(v.near)}`
    : v.address
      ? shortAddress(v.address)
      : null;
  const bits = [where, t.level ? `Level ${t.level}` : null, CLOSED_LABEL[t.status] ?? null].filter(Boolean);
  return (
    <Link
      href={`/toilets/${t.id}`}
      transitionTypes={["push"]}
      className="group flex min-h-12 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
      data-testid="area-toilet"
    >
      <span className="min-w-0 flex-1">
        <span className="font-bold">{t.label ? `${v.name} (${t.label})` : v.name}</span>
        {bits.length ? <span className="text-muted"> · {bits.join(" · ")}</span> : null}
        {t.features.length ? (
          <span className="mt-0.5 block">
            <FeatureChips features={t.features} max={3} plain />
          </span>
        ) : null}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted transition-colors group-hover:text-primary" aria-hidden />
    </Link>
  );
}

function NoToilet({ venues }: { venues: AreaDetail["noToiletVenues"] }) {
  return (
    <section aria-labelledby="none-h" className="mt-12">
      <h2 id="none-h" className="text-2xl leading-tight">
        No toilet here leh
      </h2>
      <p className="mt-1 text-sm text-muted">These places have no toilet of their own, so plan around them.</p>
      <ul className="mt-3 divide-y divide-border/70 rounded-3xl border border-border/70 bg-surface px-4 shadow-rest">
        {venues.map((v) => (
          <li key={v.id} className="flex items-start gap-3 py-3.5">
            <CircleSlash className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-extrabold">
                {placeName(v)}
                {v.lines.map((l) => (
                  <LineBadge key={l} line={l} />
                ))}
              </p>
              <p className="text-sm text-muted">
                {v.note ?? (v.toiletStatus === "USES_NEARBY" ? "Uses a toilet nearby." : "No toilet here.")}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AreaSkeleton() {
  return (
    <div className={cx("mx-auto w-full max-w-2xl px-4 pt-4")} aria-busy>
      <span className="sr-only">Loading area…</span>
      <Skeleton className="h-10 w-28 rounded-full" />
      <Skeleton className="mt-3 h-10 w-3/4" />
      <Skeleton className="mt-3 h-5 w-2/3" />
      <Skeleton className="mt-5 h-11 w-full rounded-full" />
      <Skeleton className="mt-8 h-56 rounded-[28px]" />
      <Skeleton className="mt-10 h-48 rounded-3xl" />
    </div>
  );
}
