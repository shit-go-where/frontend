"use client";

import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CircleSlash,
  DoorOpen,
  Footprints,
  Info,
  Map as MapIcon,
  MapPinCheck,
  Plus,
  Search,
  Sparkles,
  TrainFront,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { SexPrefRow } from "@/components/sex-pref";
import { ClosedPill, FeatureChips, TierBadge, ToiletCard, lastVerifiedText } from "@/components/toilet-bits";
import { EmptyState, Skeleton, buttonClass, cx } from "@/components/ui";
import { api } from "@/lib/api/client";
import type { SexPreference, StationDetail, ToiletSummary } from "@/lib/api/types";
import { formatDistance, placeName, plural, scoreNumber, sexLabel, toiletTag } from "@/lib/format";
import { useLocation } from "@/lib/location";
import { usableBy, usePrefData } from "@/lib/sex-pref";
import { SURVEY_CREDIT, SURVEY_URL } from "@/lib/site";
import { isUnnamed } from "@/lib/unnamed-toilet";
import { StationLineBadge, sortLines, stationLabel } from "../station-bits";

type Nearby = StationDetail["nearby"][number];

/** A trusted toilet this much further than the nearest one is still the better walk (both are inside 400 m). */
const TRUST_SLACK_M = 150;

/**
 * Where "Walk there" goes: the best open toilet in the station (the API sends them best first),
 * else the nearest open one around it, or a checked one only a little further than that.
 */
function bestOption(s: StationDetail): { toilet: ToiletSummary; distanceM: number | null } | null {
  const inside = s.toilets.find((t) => t.status === "ACTIVE");
  if (inside) return { toilet: inside, distanceM: null };
  const nearest = s.nearby[0];
  if (!nearest) return null;
  const checked = s.nearby.find((n) => n.toilet.tier !== "IMPORTED");
  const pick = checked && checked.distanceM - nearest.distanceM <= TRUST_SLACK_M ? checked : nearest;
  return { toilet: pick.toilet, distanceM: pick.distanceM };
}

function nearbyName(t: ToiletSummary): string {
  return isUnnamed(t) ? "the public toilet" : placeName(t.venue);
}

function walkHref(id: string) {
  return `/go?to=${encodeURIComponent(id)}`;
}

const LINK = "font-bold text-primary underline underline-offset-2 hover:decoration-[3px]";

/** On the phone, until the API's own narrowed copy lands: only toilets this person can use. */
function narrowStation(s: StationDetail, sex: SexPreference): StationDetail {
  return {
    ...s,
    toilets: s.toilets.filter((t) => usableBy(t.sex, sex)),
    nearby: s.nearby.filter((n) => usableBy(n.toilet.sex, sex)),
  };
}

export function StationView({ station }: { station: StationDetail }) {
  // Rendered for everyone on the server; narrowed here to the toilets this person uses, if they said.
  const { data: s } = usePrefData(
    ["station", station.slug],
    station,
    (sex, signal) => api.station(station.slug, sex, signal),
    narrowStation,
  );
  const label = stationLabel(s);
  const lines = sortLines(s.lines);
  const inside = s.toilets;
  const usableInside = inside.filter((t) => t.status === "ACTIVE");
  const best = bestOption(s);

  return (
    <article className="mx-auto w-full max-w-2xl px-4 pb-12 pt-4">
      <BackButton
        fallback={{ href: "/stations", label: "All stations" }}
        icon={ChevronLeft}
        iconClassName="size-4"
        className={buttonClass("ghost", "sm", "-ml-3 text-muted hover:text-fg")}
      />
      <h1 className="mt-2 text-3xl leading-tight text-balance sm:text-4xl">Toilets at {label}</h1>
      {lines.length || s.area ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
          {lines.map((l) => (
            <StationLineBadge key={l.code} line={l} />
          ))}
          {lines.length ? <span className="sr-only">{lines.length > 1 ? "lines" : "line"}</span> : null}
          {s.area ? (
            <span>
              {lines.length ? "· " : ""}in{" "}
              <Link href={`/areas/${s.area.slug}`} className={LINK}>
                {s.area.name}
              </Link>
            </span>
          ) : null}
        </p>
      ) : null}
      <MapLink s={s} label={label} />
      <SexPrefRow className="mt-1" />

      {inside.length ? (
        <section aria-labelledby="inside-h" className="pt-6">
          <h2 id="inside-h" className="flex flex-wrap items-baseline gap-x-3 text-2xl leading-tight">
            In the station
            <span className="font-sans text-sm font-bold text-muted tabular-nums">{plural(inside.length, "toilet")}</span>
          </h2>
          {s.note ? <Note>{s.note}</Note> : null}
          <ul className="mt-3 flex flex-col gap-3">
            {inside.map((t) => (
              <li key={t.id}>
                <StationToilet t={t} primary={t.id === best?.toilet.id} only={inside.length === 1} />
              </li>
            ))}
          </ul>
          {!usableInside.length ? (
            <AnswerCard icon={CircleSlash} title="Closed for now" label={label} best={best}>
              <p>{inside.length === 1 ? "The toilet in the station is" : "Every toilet in the station is"} closed right now.</p>
            </AnswerCard>
          ) : null}
        </section>
      ) : (
        <section aria-labelledby="answer-h" className="pt-6">
          <NoToiletAnswer s={s} label={label} best={best} />
        </section>
      )}

      <section aria-labelledby="nearby-h" className="pt-10">
        <h2 id="nearby-h" className="text-2xl leading-tight">
          Within a short walk
        </h2>
        <p className="mt-1 text-sm text-muted text-pretty">
          Open toilets at other places within 400 m of the station, nearest first. Distances are straight-line from the station.
        </p>
        {s.nearby.length ? (
          <ul className="mt-3 flex flex-col gap-3">
            {s.nearby.map((n) => (
              <li key={n.toilet.id}>
                <ToiletCard t={fromStation(n)} walk distanceFrom={label} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 rounded-3xl border border-border/70 bg-surface shadow-rest">
            <EmptyState mascot="lost" title="Nothing nearby leh">
              <p>We don&apos;t know of another open toilet within 400 m of {label}.</p>
            </EmptyState>
          </div>
        )}
      </section>

      <CheckInNudge s={s} usableInside={usableInside} label={label} />

      <nav aria-label="More toilets" className="mt-10 flex flex-col gap-1">
        {s.area ? (
          <MoreLink href={`/areas/${s.area.slug}`} icon={MapIcon}>
            Every toilet in {s.area.name}
          </MoreLink>
        ) : null}
        <MoreLink href="/stations" icon={TrainFront}>
          Toilets at every MRT station
        </MoreLink>
        <MoreLink href="/stations#line-board" icon={Trophy}>
          {lines.length === 1 ? `How the ${lines[0].name} ranks` : "Which line has the cleanest toilets?"}
        </MoreLink>
      </nav>

      <p className="mt-10 border-t border-border/70 pt-4 text-sm text-muted">
        From{" "}
        <a href={SURVEY_URL} className={LINK} target="_blank" rel="noopener noreferrer">
          {SURVEY_CREDIT}
        </a>
        &apos;s 2024 toilet surveys, the community, OpenStreetMap contributors (ODbL) and data.gov.sg (Singapore Open Data
        Licence).{" "}
        <Link href="/about" className={LINK}>
          About our data
        </Link>
      </p>
    </article>
  );
}

/**
 * Nearby toilets show metres from the station, never walk minutes: those would read as from the
 * person, who may be anywhere (the Toilet Card's no-fallback-minutes rule). "Open now" and live
 * reports stay off too, as on area pages: this page is cached for hours, so they could be stale.
 * The toilet's own page has them live.
 */
function fromStation(n: Nearby): ToiletSummary {
  return {
    ...n.toilet,
    walkSecondsEstimate: undefined,
    distanceM: n.distanceM,
    openNow: null,
    activeStatus: [],
  };
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-2 text-sm text-muted">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Opens the home map on the station as the searched place, as the area page does; walk times stay off. */
function MapLink({ s, label }: { s: StationDetail; label: string }) {
  const { setManual } = useLocation();
  return (
    <Link
      href="/"
      onClick={() => setManual({ lat: s.lat, lng: s.lng, name: label })}
      className="-ml-2 mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2"
    >
      <MapIcon className="size-5" aria-hidden />
      See it on the map
    </Link>
  );
}

const CLOSED_LABEL: Partial<Record<ToiletSummary["status"], string>> = {
  CLOSED: "Closed",
  RENOVATION: "Under renovation",
};

const FARE_GATES: Record<ToiletSummary["areaType"], string | null> = {
  PAID_AREA: "Inside the fare gates",
  UNPAID_AREA: "Outside the fare gates",
  NOT_APPLICABLE: null,
  UNKNOWN: "Fare gates not known yet",
};

function levelText(level: string): string {
  const parts = level
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return `${parts.length > 1 ? "Levels" : "Level"} ${parts.join(", ")}`;
}

/**
 * What a station toilet is called on its card: its label (with who it's for), else who it's for and its
 * level ("Women's · Level 2"), else just its level. A station's men's and women's often share a floor.
 */
function stationToiletName(t: ToiletSummary, only: boolean): string {
  if (t.label) return toiletTag(t) ?? t.label;
  const who = sexLabel(t.sex);
  const level = t.level ? levelText(t.level) : null;
  if (who) return level && !only ? `${who} · ${level}` : `${who} toilet`;
  return only ? "Station toilet" : (level ?? "Toilet");
}

/**
 * One toilet in the station, decide-and-go: where it is (level, fare gates), how clean, who
 * vouches for it and when, then Walk there. Live reports and "open now" stay on the toilet's own
 * page, since this page is cached for hours.
 */
function StationToilet({ t, primary, only }: { t: ToiletSummary; primary: boolean; only: boolean }) {
  const closed = CLOSED_LABEL[t.status];
  const title = stationToiletName(t, only);
  const level = t.level ? levelText(t.level) : null;
  const where = [level && !title.includes(level) ? level : null, FARE_GATES[t.areaType]].filter((w): w is string => !!w);
  return (
    <div className="rounded-[28px] border border-border/70 bg-surface p-5 shadow-rest" data-testid="station-toilet">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl leading-tight text-balance">{title}</h3>
          {where.length ? (
            <p className="mt-1 flex items-start gap-1.5 font-medium text-muted">
              <DoorOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{where.join(" · ")}</span>
            </p>
          ) : null}
          {closed ? <ClosedPill className="mt-2">{closed}</ClosedPill> : null}
        </div>
        {t.scoreCleanliness !== null ? (
          <p className="flex shrink-0 flex-col items-end">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-5 text-accent" aria-hidden />
              <span className="font-display text-4xl leading-none">{scoreNumber(t.scoreCleanliness)}</span>
            </span>
            <span className="mt-1 text-xs font-extrabold text-muted">clean out of 10</span>
          </p>
        ) : (
          <p className="shrink-0 text-sm font-bold text-muted">No score yet</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <TierBadge tier={t.tier} seenBy={t.seenBy} />
        <span className="text-xs text-muted">{lastVerifiedText(t)}</span>
      </div>
      {t.features.length ? (
        <div className="mt-3">
          <FeatureChips features={t.features} more />
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {closed ? null : (
          <Link href={walkHref(t.id)} transitionTypes={["push"]} className={buttonClass(primary ? "primary" : "secondary", "lg", "flex-1 sm:flex-none")}>
            <Footprints className="size-5" aria-hidden /> Walk there
            <span className="sr-only">: {title}</span>
          </Link>
        )}
        <Link
          href={`/toilets/${t.id}`}
          transitionTypes={["push"]}
          className={buttonClass("secondary", "lg", cx(closed ? "flex-1 sm:flex-none" : "", "px-5"))}
        >
          Details
          <span className="sr-only">: {title}</span>
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/** The one tap to get walking, or a wider search when there's nothing within 400 m. */
function WalkCta({ best, label }: { best: ReturnType<typeof bestOption>; label: string }) {
  if (!best) {
    return (
      <Link href="/go?urgent=1" className={buttonClass("primary", "lg", "mt-5 w-full py-2 text-center leading-tight sm:w-auto")}>
        <Search className="size-5 shrink-0" aria-hidden /> Find an open toilet
      </Link>
    );
  }
  return (
    <Link href={walkHref(best.toilet.id)} className={buttonClass("primary", "lg", "mt-5 w-full py-2 text-center leading-tight sm:w-auto")}>
      <Footprints className="size-5 shrink-0" aria-hidden />
      <span>
        Walk to {nearbyName(best.toilet)}
        {best.distanceM !== null ? (
          <span className="font-bold tabular-nums">
            {" "}
            · {formatDistance(best.distanceM)}
            <span className="sr-only"> from {label}</span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function AnswerCard({
  icon: Icon,
  title,
  titleId,
  label,
  best,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  titleId?: string;
  label: string;
  best: ReturnType<typeof bestOption>;
  children: React.ReactNode;
}) {
  const Heading = titleId ? "h2" : "h3";
  return (
    <div className="mt-3 rounded-[28px] border border-border/70 bg-surface p-5 shadow-rest" data-testid="station-answer">
      <div className="flex items-start gap-3">
        <Icon className="mt-1 size-7 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0">
          <Heading id={titleId} className="font-display text-2xl leading-tight text-balance">
            {title}
          </Heading>
          <div className="mt-1.5 text-muted text-pretty">{children}</div>
        </div>
      </div>
      {best && best.distanceM !== null ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <TierBadge tier={best.toilet.tier} seenBy={best.toilet.seenBy} />
          <span className="text-xs text-muted">{lastVerifiedText(best.toilet)}</span>
        </div>
      ) : null}
      <WalkCta best={best} label={label} />
    </div>
  );
}

/** No toilet to list inside: the answer is still an answer, with the best way out of it. */
function NoToiletAnswer({ s, label, best }: { s: StationDetail; label: string; best: ReturnType<typeof bestOption> }) {
  const props = { titleId: "answer-h", label, best };
  if (s.toiletStatus === "NONE") {
    return (
      <AnswerCard icon={CircleSlash} title="No toilet in the station" {...props}>
        <p>{label} has no toilet of its own.</p>
        {s.note ? <Note>{s.note}</Note> : null}
      </AnswerCard>
    );
  }
  if (s.toiletStatus === "USES_NEARBY") {
    return (
      <AnswerCard icon={DoorOpen} title="Uses the toilet next door" {...props}>
        <p>{s.note ?? `${label} has no toilet of its own. People use the one in the building next door.`}</p>
      </AnswerCard>
    );
  }
  if (s.toiletStatus === "UNKNOWN") {
    return (
      <AnswerCard icon={CircleHelp} title="Not checked yet" {...props}>
        <p>Nobody has told us whether {label} has a toilet inside.</p>
        {s.note ? <Note>{s.note}</Note> : null}
        <p className="mt-2">
          Been there and found one?{" "}
          <Link href="/add" className={cx(LINK, "inline-flex items-center gap-0.5")}>
            <Plus className="size-4" aria-hidden />
            Add it
          </Link>
        </p>
      </AnswerCard>
    );
  }
  return (
    <AnswerCard icon={CircleHelp} title="No open toilet on record" {...props}>
      <p>We don&apos;t have a confirmed, open toilet inside {label} yet.</p>
      {s.note ? <Note>{s.note}</Note> : null}
    </AnswerCard>
  );
}

/**
 * The cheapest contribution, asked where it's easiest: on the toilet's page, which opens the
 * check-in when it arrives with `?do=checkin` (sign-in carries it through).
 */
function CheckInNudge({ s, usableInside, label }: { s: StationDetail; usableInside: ToiletSummary[]; label: string }) {
  const targets = usableInside.length
    ? usableInside.slice(0, 3).map((t) => ({
        t,
        name: (usableInside.length === 1 && !t.label) || !(t.label || t.sex || t.level) ? null : stationToiletName(t, false),
      }))
    : s.nearby.slice(0, 1).map((n) => ({
        t: n.toilet,
        name: isUnnamed(n.toilet) ? null : placeName(n.toilet.venue),
      }));
  if (!targets.length) return null;
  const where = usableInside.length ? `the toilet at ${label}` : (targets[0].name ?? "the public toilet nearby");
  return (
    <section aria-labelledby="checkin-h" className="mt-10 rounded-3xl border border-border/70 bg-surface p-5 shadow-rest">
      <h2 id="checkin-h" className="text-2xl leading-tight">
        Been here?
      </h2>
      <p className="mt-1.5 text-muted text-pretty">
        Used {where}? Check in when you&apos;re there. It tells the next person it&apos;s still there and still clean, and you earn points
        for it.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {targets.map(({ t, name }) => (
          <Link
            key={t.id}
            href={`/toilets/${encodeURIComponent(t.id)}?do=checkin`}
            transitionTypes={["push"]}
            className={buttonClass("secondary", "md")}
          >
            <MapPinCheck className="size-5" aria-hidden />
            {targets.length > 1 && name ? `Check in: ${name}` : "Check in"}
          </Link>
        ))}
      </div>
    </section>
  );
}

function MoreLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group -mx-2 flex min-h-12 items-center gap-2 rounded-2xl px-2 font-extrabold text-primary hover:bg-surface-2"
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="flex-1">{children}</span>
      <ChevronRight className="size-5 shrink-0" aria-hidden />
    </Link>
  );
}

export function StationSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4" aria-busy>
      <span className="sr-only">Loading station…</span>
      <Skeleton className="h-10 w-28 rounded-full" />
      <Skeleton className="mt-3 h-10 w-3/4" />
      <Skeleton className="mt-3 h-6 w-1/2" />
      <Skeleton className="mt-3 h-11 w-40 rounded-full" />
      <Skeleton className="mt-6 h-8 w-48" />
      <Skeleton className="mt-3 h-64 rounded-[28px]" />
      <Skeleton className="mt-10 h-8 w-56" />
      <Skeleton className="mt-3 h-28 rounded-3xl" />
      <Skeleton className="mt-3 h-28 rounded-3xl" />
    </div>
  );
}
