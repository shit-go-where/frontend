"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Accessibility,
  Armchair,
  ArrowLeft,
  Baby,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Clock,
  Coins,
  DoorOpen,
  Droplets,
  Footprints,
  Frame,
  Layers,
  MapPin,
  Mars,
  MessageSquareMore,
  Milk,
  PersonStanding,
  Route,
  Shirt,
  ShowerHead,
  Signpost,
  SoapDispenserDroplet,
  Ticket,
  TriangleAlert,
  Venus,
  VenusAndMars,
  Vote,
  Wind,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { LineBadge, OpenNow, TierBadge, TierHelpDialog, UnverifiedClaim, lastVerifiedText } from "@/components/toilet-bits";
import { Card, ErrorState, Skeleton, Stars, buttonClass, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type { Feature, FeatureDetail, OpeningHours, Survey, ToiletDetail } from "@/lib/api/types";
import { AREA_TYPE_LABELS, FEATURE_GROUPS, FEATURE_LABELS, TIER_LABELS, VENUE_TYPE_LABELS, formatDate } from "@/lib/format";
import { CheckInButton, FlagButton, LiveStatus, Reviews, ShareButton, SuggestEditButton } from "./detail-actions";

export function ToiletDetailView({
  id,
  initial,
  serverError,
}: {
  id: string;
  initial: ToiletDetail | null;
  serverError: string | null;
}) {
  const q = useQuery({
    queryKey: ["toilet", id],
    queryFn: ({ signal }) => api.toilet(id, signal),
    initialData: initial ?? undefined,
    // Server render has no session; refetch in the browser for myReview etc.
    initialDataUpdatedAt: 0,
  });

  if (!q.data) {
    if (q.isError || (serverError && !q.isFetching)) {
      return (
        <div className="mx-auto w-full max-w-3xl px-4 pt-6">
          <BackLink />
          <h1 className="mt-4 text-2xl leading-tight">Aiyo, can&apos;t load this toilet</h1>
          <div className="mt-4">
            <ErrorState
              message={q.error ? errorMessage(q.error) : (serverError ?? "Something went wrong.")}
              onRetry={() => void q.refetch()}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-2" aria-busy>
        <span className="sr-only">Loading toilet…</span>
        <Skeleton className="mt-11 h-10 w-2/3" />
        <Skeleton className="mt-3 h-5 w-1/3" />
        <Skeleton className="mt-4 h-7 w-44 rounded-full" />
        <Skeleton className="mt-5 h-14 rounded-full" />
        <Skeleton className="mt-4 h-40 rounded-3xl" />
      </div>
    );
  }

  return <Detail t={q.data} />;
}

function BackLink() {
  return (
    <Link
      href="/"
      className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2"
    >
      <ArrowLeft className="size-5" aria-hidden /> Map
    </Link>
  );
}

function Detail({ t }: { t: ToiletDetail }) {
  const pending = t.status === "PENDING";
  const [tierHelp, setTierHelp] = useState(false);
  const tierName = pending ? "Pending review" : TIER_LABELS[t.tier];
  const accessibleFromOpenData = t.featureDetails.some((d) => d.feature === "ACCESSIBLE" && d.present);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-10 pt-2" data-testid="toilet-detail">
      <BackLink />

      <header className="mt-1">
        <h1 className="text-3xl leading-tight text-balance sm:text-[2.5rem]">{t.venue.name}</h1>
        {t.label ? <p className="mt-1 text-lg font-bold text-muted">{t.label}</p> : null}

        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-bold text-muted">
          {t.venue.type !== "OTHER" ? (
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-4" aria-hidden />
              {VENUE_TYPE_LABELS[t.venue.type]}
            </span>
          ) : null}
          {t.venue.lines.length ? (
            <span className="inline-flex flex-wrap items-center gap-1">
              {t.venue.lines.map((l) => (
                <LineBadge key={l} line={l} />
              ))}
            </span>
          ) : null}
          {t.venue.planningArea ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden />
              {t.venue.planningArea}
            </span>
          ) : null}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center">
            <TierBadge tier={t.tier} pending={pending} />
            <button
              type="button"
              onClick={() => setTierHelp(true)}
              className="tap -my-2 inline-flex items-center justify-center rounded-full text-primary hover:bg-surface-2"
              aria-haspopup="dialog"
              aria-label={`What does ${tierName} mean?`}
            >
              <CircleHelp className="size-5" aria-hidden />
            </button>
          </span>
          <span className="text-sm font-medium text-muted">{lastVerifiedText(t)}</span>
          <OpenNow openNow={t.openNow} />
          {t.status === "CLOSED" || t.status === "RENOVATION" ? (
            <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-extrabold text-danger">
              {t.status === "CLOSED" ? "Closed" : "Under renovation"}
            </span>
          ) : null}
        </div>
        <TierHelpDialog open={tierHelp} onClose={() => setTierHelp(false)} />

        {t.needsResurvey ? (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-2.5 text-sm font-medium">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            This toilet was renovated or changed since our last survey. Details may be out of date.
          </p>
        ) : null}
        {pending ? (
          <p className="mt-3 rounded-2xl border-2 border-dashed border-warn px-4 py-2.5 text-sm font-medium">
            Added by the community and waiting for review. Not used for directions yet.
          </p>
        ) : null}
      </header>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {pending ? (
          <Link href="/review" className={buttonClass("primary", "lg", "sm:flex-1")}>
            <Vote className="size-5" aria-hidden /> Help review it
          </Link>
        ) : (
          <Link href={`/go?to=${encodeURIComponent(t.id)}`} className={buttonClass("primary", "lg", "sm:flex-1")}>
            <Footprints className="size-5" aria-hidden /> Walk there
          </Link>
        )}
        <div className="flex gap-2 sm:flex-1">
          <CheckInButton toilet={t} className="flex-1" />
          <ShareButton toilet={t} className="shrink-0" />
        </div>
      </div>

      <KeyFacts t={t} />

      <LiveStatus toilet={t} />

      <Section title="What's inside">
        {t.tier === "IMPORTED" && accessibleFromOpenData ? (
          <div className="mb-3">
            <UnverifiedClaim t={t} required={["ACCESSIBLE"]} />
          </div>
        ) : null}
        <Features details={t.featureDetails} />
      </Section>

      <Section title="Survey score">
        <SurveyBlock survey={t.latestSurvey} count={t.surveyCount} score={t.scoreCleanliness} ras={t.rasStars} />
      </Section>

      {t.photos.length ? (
        <Section title="Photos">
          <ul className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4">
            {t.photos.map((p) => (
              <li key={p.id} className="shrink-0 snap-start">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="block rounded-3xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumbUrl ?? p.url}
                    alt={`Photo of the toilet at ${t.venue.name}`}
                    loading="lazy"
                    className="h-40 w-56 rounded-3xl border border-border/70 bg-surface-2 object-cover shadow-rest"
                  />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Reviews toilet={t} />

      <footer className="mt-10 flex flex-col gap-2 border-t border-border/70 pt-4 text-sm font-medium text-muted">
        <FlagButton toilet={t} />
        <p>
          Source: {sourceLabel(t.source)}
          {t.attribution ? <> · {t.attribution}</> : null}
        </p>
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-2xl leading-tight">{title}</h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Key facts: known facts as a clean list, unknowns folded into one prompt
// ---------------------------------------------------------------------------

type Fact = { key: string; icon: React.ReactNode; label: string; value: string };

function KeyFacts({ t }: { t: ToiletDetail }) {
  const known: Fact[] = [];
  const missing: string[] = [];
  const add = (key: string, icon: React.ReactNode, label: string, value: string | null | undefined, missingAs: string) => {
    if (value) known.push({ key, icon, label, value });
    else missing.push(missingAs);
  };
  const icon = (I: React.ComponentType<{ className?: string }>) => <I className="size-4" aria-hidden />;

  add("address", icon(MapPin), "Address", t.venue.address, "address");
  add("level", icon(Layers), "Level", t.level ? t.level.split(";").map((s) => s.trim()).join(", ") : null, "level");
  add("exit", icon(DoorOpen), "Nearest exit", t.nearestExit, "nearest exit");
  let gatesUnknown = false;
  if (t.areaType === "PAID_AREA" || t.areaType === "UNPAID_AREA") {
    known.push({ key: "gates", icon: icon(Ticket), label: "Fare gates", value: AREA_TYPE_LABELS[t.areaType] });
  } else if (t.areaType === "UNKNOWN" && t.venue.type === "MRT_STATION") {
    gatesUnknown = true;
  }
  add("access", icon(Route), "Getting in", t.accessNote, "access");
  add("hours", icon(Clock), "Opening hours", hoursText(t.openingHours), "opening hours");
  // "We don't know the level, nearest exit or access yet, or whether it's inside the fare gates."
  const unknownText = [
    missing.length ? `the ${joinList(missing)} yet` : null,
    gatesUnknown ? (missing.length ? "or whether it's inside the fare gates" : "whether it's inside the fare gates yet") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Card className="mt-5 p-5">
      {known.length ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {known.map((f) => (
            <div key={f.key}>
              <dt className="flex items-center gap-1.5 text-sm font-bold text-muted">
                {f.icon}
                {f.label}
              </dt>
              <dd className="mt-0.5 font-bold">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {t.venue.note ? (
        <p className={cx("rounded-2xl bg-surface-2 px-4 py-2.5 text-sm font-medium", known.length > 0 && "mt-4")}>
          {t.venue.note}
        </p>
      ) : null}
      {unknownText ? (
        <div
          className={cx(
            "flex flex-wrap items-center gap-x-2 text-sm",
            (known.length > 0 || !!t.venue.note) && "mt-4 border-t border-border/70 pt-2",
          )}
        >
          <p className="font-medium text-muted">
            We don&apos;t know {unknownText}. Seen it?
          </p>
          <SuggestEditButton toilet={t} />
        </div>
      ) : null}
    </Card>
  );
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function hoursText(h: OpeningHours | null): string | null {
  if (!h) return null;
  if (h.type === "always") return "Open 24 hours";
  if (h.type === "osm") return h.value;
  const s = h.periods
    .map((p) => {
      const days = p.days.length === 7 ? "Daily" : p.days.map((d) => DAYS[d] ?? d).join(", ");
      return `${days} ${p.open}–${p.close}`;
    })
    .join("; ");
  return h.inferred ? `${s} (estimated)` : s;
}

const SOURCE_LABELS: Record<string, string> = {
  FIELDWORK_2024: "Fieldwork survey, March 2024",
  OSM: "OpenStreetMap",
  ONEMAP: "OneMap / Singapore Land Authority",
  DATAGOV: "data.gov.sg",
  WIKIDATA: "Wikidata",
  COMMUNITY: "Community submission",
  ADMIN: "Shit Go Where team",
};

/** For per-feature rows, where the date follows. */
const SOURCE_SHORT: Record<string, string> = { FIELDWORK_2024: "Fieldwork survey", COMMUNITY: "Community" };

function sourceLabel(s: string) {
  return SOURCE_LABELS[s] ?? s;
}

/** Sources nobody visited in person. Claims from these never get verified styling. */
const OPEN_DATA_SOURCES = new Set(["OSM", "ONEMAP", "DATAGOV", "WIKIDATA"]);
const isOpenData = (d: FeatureDetail) => OPEN_DATA_SOURCES.has(d.source);

// ---------------------------------------------------------------------------
// Features: what it has first, a one-line summary of the rest, full table on demand
// ---------------------------------------------------------------------------

const FEATURE_ICONS: Partial<Record<Feature, React.ComponentType<{ className?: string }>>> = {
  MALE: Mars,
  FEMALE: Venus,
  UNISEX: VenusAndMars,
  ACCESSIBLE: Accessibility,
  AMBULANT: PersonStanding,
  CHILD: Baby,
  SITTING: Armchair,
  BIDET: Droplets,
  HAND_SOAP: SoapDispenserDroplet,
  AUTO_SOAP: SoapDispenserDroplet,
  HAND_DRYER: Wind,
  BABY_CHANGE: Baby,
  NURSING_ROOM: Milk,
  SHOWER: ShowerHead,
  COAT_HOOK: Shirt,
  FEEDBACK_DEVICE: MessageSquareMore,
  SIGNAGE: Signpost,
  POSTERS: Frame,
  FREE: Coins,
};

function namesList(features: Feature[], max = 5): string {
  const names = features.map((f) => FEATURE_LABELS[f].toLowerCase());
  if (names.length <= max) return joinAnd(names);
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function Features({ details }: { details: FeatureDetail[] }) {
  const byFeature = useMemo(() => new Map(details.map((d) => [d.feature, d])), [details]);
  const all = FEATURE_GROUPS.flatMap((g) => g.features);
  const has = FEATURE_GROUPS.map((g) => ({
    title: g.title,
    items: g.features.filter((f) => byFeature.get(f)?.present),
  })).filter((g) => g.items.length);
  const hasNot = all.filter((f) => byFeature.get(f)?.present === false);
  const unknown = all.filter((f) => !byFeature.has(f));

  if (details.length === 0) {
    return (
      <p className="font-medium text-muted">
        Nobody has recorded what&apos;s inside yet. Check in when you visit and help fill it in.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {has.length ? (
        <div className="flex flex-col gap-3">
          {has.map((g) => (
            <div key={g.title} className="sm:flex sm:items-start sm:gap-4">
              <h3 className="mb-1.5 text-sm font-bold text-muted sm:mb-0 sm:w-28 sm:shrink-0 sm:pt-2">{g.title}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {g.items.map((f) => {
                  const Icon = FEATURE_ICONS[f] ?? Check;
                  const open = isOpenData(byFeature.get(f)!);
                  return (
                    <li
                      key={f}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/70 bg-surface-2 px-3.5 text-sm font-bold shadow-rest"
                    >
                      <Icon className="size-4 shrink-0 text-mint" aria-hidden />
                      {FEATURE_LABELS[f]}
                      {open ? <span className="text-xs font-medium text-muted">· open data</span> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="font-medium text-muted">No features recorded as present yet.</p>
      )}

      {hasNot.length || unknown.length ? (
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          {hasNot.length ? (
            <p className="flex items-start gap-2">
              <X className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span>
                <span className="font-extrabold">No </span>
                {namesList(hasNot)}
              </span>
            </p>
          ) : null}
          {unknown.length ? (
            <p className="flex items-start gap-2 text-muted">
              <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Not recorded yet: {namesList(unknown)}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <details className="group overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-3xl px-5 font-extrabold hover:bg-surface-2 focus-visible:-outline-offset-4 [&::-webkit-details-marker]:hidden">
          All {all.length} features
          <ChevronDown className="size-5 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <table className="w-full border-t border-border/70 text-sm">
          <caption className="sr-only">Every feature, whether this toilet has it, and where that comes from</caption>
          {FEATURE_GROUPS.map((g) => (
            <tbody key={g.title}>
              <tr>
                <th colSpan={2} scope="rowgroup" className="bg-surface-2 px-5 py-1.5 text-left font-extrabold text-muted">
                  {g.title}
                </th>
              </tr>
              {g.features.map((f) => {
                const d = byFeature.get(f);
                return (
                  <tr key={f} className="border-t border-border/70 first:border-t-0">
                    <th scope="row" className="px-5 py-2.5 text-left font-bold">
                      {FEATURE_LABELS[f]}
                      {d ? (
                        <span className="block text-xs font-medium text-muted">
                          {isOpenData(d) ? `Open data (${sourceLabel(d.source)})` : (SOURCE_SHORT[d.source] ?? sourceLabel(d.source))}
                          {d.observedAt ? `, ${formatDate(d.observedAt)}` : ""}
                        </span>
                      ) : null}
                    </th>
                    <td className="px-5 py-2.5 text-right">
                      <FeatureState d={d} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </details>
    </div>
  );
}

function FeatureState({ d }: { d: FeatureDetail | undefined }) {
  const base = "inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-extrabold";
  if (!d)
    return (
      <span className={cx(base, "border-border text-muted")}>
        <CircleHelp className="size-3.5" aria-hidden /> Not sure
      </span>
    );
  if (d.present)
    return (
      <span className={cx(base, "border-ok/40 bg-ok-soft text-ok")}>
        <Check className="size-3.5" aria-hidden /> Yes
      </span>
    );
  return (
    <span className={cx(base, "border-transparent bg-surface-2 text-fg")}>
      <X className="size-3.5" aria-hidden /> No
    </span>
  );
}

// ---------------------------------------------------------------------------
// Survey
// ---------------------------------------------------------------------------

const RUBRIC: { key: keyof Pick<Survey, "cleanliness" | "scent" | "aesthetics" | "music" | "toiletries" | "facilities">; label: string; max: number }[] = [
  { key: "cleanliness", label: "Cleanliness", max: 10 },
  { key: "scent", label: "Scent", max: 5 },
  { key: "aesthetics", label: "Aesthetics", max: 5 },
  { key: "music", label: "Music", max: 5 },
  { key: "toiletries", label: "Toiletries", max: 5 },
  { key: "facilities", label: "Facilities", max: 20 },
];

function SurveyBlock({
  survey,
  count,
  score,
  ras,
}: {
  survey: Survey | null;
  count: number;
  score: number | null;
  ras: number | null;
}) {
  const rasStars = ras ?? survey?.rasStars ?? null;
  if (!survey && score === null && !rasStars) {
    return <p className="font-medium text-muted">Not surveyed yet. Reviews from people like you fill the gap.</p>;
  }
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
        <div>
          <p className="text-sm font-bold text-muted">Cleanliness score</p>
          <p className="mt-1 font-display text-5xl leading-none">
            {score !== null ? score.toFixed(1) : "–"}
            <span className="ml-0.5 text-xl text-muted">/10</span>
          </p>
          <p className="mt-1.5 text-xs font-medium text-muted">Survey plus recent reviews</p>
        </div>
        {survey ? (
          <div>
            <p className="text-sm font-bold text-muted">Survey total</p>
            <p className="mt-1 font-display text-5xl leading-none">
              {survey.total}
              <span className="ml-0.5 text-xl text-muted">/50</span>
            </p>
            <p className="mt-1.5 text-xs font-medium text-muted">Our 50-point rubric</p>
          </div>
        ) : null}
        {rasStars ? (
          <div>
            <p className="text-sm font-bold text-muted">Happy Toilet rating</p>
            <div className="mt-2.5 [&_svg]:size-6">
              <Stars value={rasStars} label={`Happy Toilet rating ${rasStars} of 5 stars`} />
            </div>
            <p className="mt-1.5 text-xs font-medium text-muted">From the Restroom Association of Singapore</p>
          </div>
        ) : null}
      </div>
      {survey ? (
        <>
          <ul className="mt-6 flex flex-col gap-3">
            {RUBRIC.map((r) => {
              const v = survey[r.key];
              const pct = Math.max(0, Math.min(100, (v / r.max) * 100));
              return (
                <li key={r.key}>
                  <div className="flex justify-between text-sm">
                    <span className="font-bold">{r.label}</span>
                    <span className="font-bold tabular-nums text-muted">
                      {v}/{r.max}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-3 overflow-hidden rounded-full bg-surface-2"
                    role="meter"
                    aria-label={r.label}
                    aria-valuemin={0}
                    aria-valuemax={r.max}
                    aria-valuenow={v}
                  >
                    <div className="h-full rounded-full bg-tier shadow-gloss" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs font-medium text-muted">
            Surveyed in person {formatDate(survey.surveyedAt)}
            {survey.phase ? ` (${survey.phase})` : ""}
            {count > 1 ? ` · ${count} surveys on record` : ""}
          </p>
          {survey.remarks ? (
            <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-2.5 text-sm font-medium">&ldquo;{survey.remarks}&rdquo;</p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 font-medium text-muted">Not surveyed yet. Reviews from people like you fill the gap.</p>
      )}
    </Card>
  );
}
