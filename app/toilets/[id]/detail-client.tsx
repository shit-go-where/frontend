"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Accessibility,
  Activity,
  Armchair,
  ArrowLeft,
  Baby,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Clock,
  Coins,
  Droplet,
  Droplets,
  ExternalLink,
  FlipHorizontal2,
  Footprints,
  Frame,
  Info,
  GlassWater,
  HandHeart,
  LoaderCircle,
  LocateFixed,
  LocateOff,
  Lock,
  MapPin,
  MapPinCheck,
  Mars,
  MessageSquareHeart,
  MessageSquareMore,
  Milk,
  PackageOpen,
  PersonStanding,
  Route,
  Scroll,
  Search,
  Shirt,
  ShowerHead,
  Signpost,
  SoapDispenserDroplet,
  TriangleAlert,
  Venus,
  VenusAndMars,
  Vote,
  Wind,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LineBadge, StatusChips, TierBadge, TierHelpDialog, UnverifiedClaim, lastVerifiedText } from "@/components/toilet-bits";
import { arriving } from "@/lib/toilet-handoff";
import { BackButton } from "@/components/back-button";
import { ErrorState, SectionIcon, Skeleton, Stars, buttonClass, cx } from "@/components/ui";
import { FoldDetails } from "@/components/fold-details";
import { PhotoViewer } from "@/components/photo-viewer";
import { api, errorMessage } from "@/lib/api/client";
import type { Feature, FeatureDetail, Survey, ToiletDetail } from "@/lib/api/types";
import {
  BAD_STATUS,
  FEATURE_GROUPS,
  FEATURE_LABELS,
  TIER_LABELS,
  VENUE_TYPE_LABELS,
  areaSlug,
  formatDate,
  formatDistance,
  googleMapsWalkingUrl,
  scoreNumber,
  shortAddress,
  walkMinutes,
} from "@/lib/format";
import { FEATURE_HUE, HUE_CHIP, type Hue } from "@/lib/feature-hues";
import { FILTERS } from "@/lib/filters";
import { estimateWalkSeconds, haversineM, useLocation } from "@/lib/location";
import { compareLevelOrder, levelOrder, levelShort, levelText } from "@/lib/level";
import { hoursText, opensText } from "@/lib/opening-hours";
import { isUnnamed } from "@/lib/unnamed-toilet";
import { useHydrated, useMe } from "@/lib/auth";
import { useStoredFilters } from "@/lib/use-filters";
import {
  CheckInButton,
  FlagButton,
  LiveStatusList,
  ReportButton,
  ReviewButton,
  ReviewList,
  ShareButton,
  SuggestEditButton,
} from "./detail-actions";

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
    return <DetailSkeleton />;
  }

  return <Detail t={q.data} />;
}

/** Same shape as the page: title, verdict card, the walk button. Shared with the route's Suspense fallback. */
export function DetailSkeleton() {
  // Opened from a card: the name is already known, so the real heading shows while the rest loads.
  // No URL read here: this is the page's Suspense fallback, and the tap that got here is the only fresh hand-off.
  const [opened] = useState(arriving);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-2 md:max-w-7xl" aria-busy>
      <span className="sr-only">Loading toilet…</span>
      {opened ? (
        <>
          <BackLink />
          <h1 className={cx(TITLE_CLASS, "mt-1")}>{opened.name}</h1>
        </>
      ) : (
        <>
          <Skeleton className="h-11 w-20 rounded-full" />
          <Skeleton className="mt-1 h-9 w-2/3" />
        </>
      )}
      <Skeleton className="mt-3 h-5 w-1/2" />
      <Skeleton className="mt-4 h-64 rounded-[28px] md:w-1/2 lg:w-[28rem]" />
      <Skeleton className="mt-4 h-14 rounded-full md:w-1/2 lg:w-[28rem]" />
    </div>
  );
}

/** Shared by the page and its loading state, so the heading doesn't shift when the data lands. */
const TITLE_CLASS = "text-3xl leading-tight text-balance sm:text-[2.5rem]";

/** Back to the map, the area list or wherever this toilet was opened from; the map when opened fresh. */
function BackLink() {
  return (
    <BackButton
      fallback={{ href: "/", label: "Map" }}
      icon={ArrowLeft}
      iconClassName="size-5"
      className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2"
    />
  );
}

/**
 * Decide and go: the first screen answers "is this one right for me, and how far?"
 * (verdict card), then gets the visitor walking. Contributing sits below in "Been here?",
 * and everything else is folded into one list. Phones read top to bottom; from `md` the
 * verdict column sticks on the left beside the folds. The page shares the header's 7xl
 * container so the title lines up with the logo; from `lg` the verdict keeps a phone-like
 * 28rem and the folds take the rest, so the two never read as a near-miss pair.
 */
/** Header height plus breathing room: the pinned column sits at `top-20` and needs to clear the window's bottom edge. */
const PIN_CLEARANCE_PX = 80 + 24;

/**
 * Pin the verdict column only while all of it fits in the window. A taller column would stay
 * stuck with "Been here?" cut off below the fold until the page ran out.
 */
function useFitsWindow(ref: React.RefObject<HTMLElement | null>) {
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setFits(el.offsetHeight + PIN_CLEARANCE_PX <= window.innerHeight);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [ref]);
  return fits;
}

function Detail({ t }: { t: ToiletDetail }) {
  const pending = t.status === "PENDING";
  const pinRef = useRef<HTMLDivElement>(null);
  const fits = useFitsWindow(pinRef);
  // Close enough to check in (the API's 150 m), so say so where the tiles are. GPS fixes only.
  const loc = useLocation();
  const hereM = loc.source === "gps" ? haversineM(loc.coords, t) : null;
  // Pending toilets take check-ins too: a signed-in check-in there is how a new toilet gets confirmed.
  const canCheckIn = t.status === "ACTIVE" || pending;
  const nearEnough = canCheckIn && hereM !== null && hereM <= 150;
  const { data: me, isSuccess: meKnown } = useMe();
  const hydrated = useHydrated();
  const signedOut = hydrated && meKnown && !me;
  const closedForGood = t.status === "CLOSED" || t.status === "RENOVATION";
  // Shut for now, by its hours or by someone on the spot, but it will open again.
  const closedNow = t.status === "ACTIVE" && (t.openNow === false || t.activeStatus.some((s) => s.kind === "CLOSED_NOW"));
  // Only the hours can say when it opens; a "Closed now" report alone gives no time.
  const opens = closedNow && t.openNow === false ? opensText(t.openingHours) : null;
  const [photoAt, setPhotoAt] = useState<number | null>(null);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-10 pt-2 md:max-w-7xl" data-testid="toilet-detail">
      {/* The title sits above both columns, so the verdict and the folds start on the same line beneath it. */}
      <div>
        <BackLink />

        <header className="mt-1">
          <h1 className={TITLE_CLASS}>{t.venue.name}</h1>
          {t.label ? <p className="mt-0.5 text-lg font-bold text-muted">{t.label}</p> : null}
          <VenueLine t={t} />
          <OtherFloors t={t} />
        </header>
      </div>

      {/* The columns get their own grid so the pinned one stops where the folds end, never over the footer. */}
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-x-8 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-x-12">
        <div ref={pinRef} data-fits={fits ? "" : undefined} className="md:data-fits:sticky md:data-fits:top-20">
          <Verdict t={t} />

          <div className="mt-4 flex gap-2">
            {pending && nearEnough ? (
              // Standing at it: a check-in is the confirmation. The link only adds ?do=checkin, which the
              // Check in tile below picks up, so there is one check-in dialog on the page.
              <Link
                href={`/toilets/${encodeURIComponent(t.id)}?do=checkin`}
                replace
                scroll={false}
                className={buttonClass("primary", "lg", "flex-1")}
              >
                <MapPinCheck className="size-5" aria-hidden /> Check in to confirm it
              </Link>
            ) : pending ? (
              // The toilet page doesn't say which submission is open, so this opens the nearby queue.
              <Link
                href={t.openSubmissionId ? `/review?id=${encodeURIComponent(t.openSubmissionId)}` : "/review"}
                className={buttonClass("primary", "lg", "flex-1")}
              >
                <Vote className="size-5" aria-hidden /> Help review it
              </Link>
            ) : closedForGood || closedNow ? (
              // Nobody standing in front of a shut door wants directions to it: lead with the way out.
              <Link href="/go?urgent=1" className={buttonClass("primary", "lg", "flex-1 py-2 text-center leading-tight")}>
                <Search className="size-5 shrink-0" aria-hidden /> Find an open toilet
              </Link>
            ) : (
              <Link href={`/go?to=${encodeURIComponent(t.id)}`} transitionTypes={["push"]} className={buttonClass("primary", "lg", "flex-1")}>
                <Footprints className="size-5" aria-hidden /> Walk there
              </Link>
            )}
            <ShareButton toilet={t} />
          </div>
          {closedNow ? (
            // Still worth the walk for someone who'll arrive after it opens.
            <Link href={`/go?to=${encodeURIComponent(t.id)}`} transitionTypes={["push"]} className={buttonClass("secondary", "md", "mt-2 w-full")}>
              <Footprints className="size-5" aria-hidden /> Walk there
              {opens ? (
                <span className="font-medium text-muted" suppressHydrationWarning>
                  · {opens}
                </span>
              ) : null}
            </Link>
          ) : null}
          {pending ? (
            // Pending toilets aren't routed here, but someone far away still needs to find it.
            <a
              href={googleMapsWalkingUrl(null, t)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("secondary", "md", "mt-2 w-full")}
            >
              <ExternalLink className="size-5" aria-hidden /> Directions in Google Maps
            </a>
          ) : null}

          {t.photos.length ? (
            <ul aria-label="Photos" className="no-scrollbar -mx-4 mt-4 flex snap-x gap-2 overflow-x-auto px-4">
              {t.photos.map((p, i) => (
                <li key={p.id} className="shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => setPhotoAt(i)}
                    aria-haspopup="dialog"
                    aria-label={`Open photo ${i + 1} of ${t.photos.length}`}
                    className="block rounded-3xl transition active:scale-[0.98]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.thumbUrl ?? p.url}
                      alt=""
                      loading="lazy"
                      className="h-32 w-44 rounded-3xl border border-border/70 bg-surface-2 object-cover shadow-rest"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <PhotoViewer
            photos={t.photos}
            index={photoAt}
            onIndex={setPhotoAt}
            onClose={() => setPhotoAt(null)}
            alt={(i) => `Photo ${i + 1} of the toilet at ${t.venue.name}`}
          />

          <section aria-labelledby="been-here" className="mt-8">
            <h2 id="been-here" className="text-xl leading-tight">
              {nearEnough ? "You're here" : "Been here?"}
            </h2>
            {nearEnough ? (
              <p className="mt-1 font-bold text-mint">
                {hereM < 15 ? "You're right at it" : `You're ${formatDistance(hereM)} away`}, close enough to check in.
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              {/* Closed toilets don't take check-ins. */}
              {canCheckIn ? <CheckInButton toilet={t} /> : null}
              <ReportButton toilet={t} />
              <ReviewButton toilet={t} />
            </div>
            {signedOut && t.status === "ACTIVE" ? (
              <p className="mt-2 text-sm font-medium text-muted">
                Check-ins and reports work without signing in.{" "}
                <Link
                  href={`/login?redirect=${encodeURIComponent(`/toilets/${t.id}`)}`}
                  className="font-bold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary"
                >
                  Sign in to earn points.
                </Link>
              </p>
            ) : null}
            {/* The gaps sit with the other ways to help, not in the verdict, so "Walk there" stays in the first screen. */}
            <MissingFacts t={t} />
          </section>
        </div>

        {/* From md, top-aligned with the verdict card (both 16px under the title). */}
        <div className="mt-8 md:mt-4">
          <MoreInfo t={t} />
        </div>
      </div>

      {/* Below both columns, not under the shorter one. */}
      <footer className="mt-8 flex flex-col gap-2 border-t border-border/70 pt-4 text-sm font-medium text-muted md:mt-12">
        <FlagButton toilet={t} />
        <p>
          Source: {sourceLabel(t.source)}
          {t.attribution ? <> · {t.attribution}</> : null}
        </p>
      </footer>
    </article>
  );
}

/** One quiet row under the name: what kind of place, which lines, which area. */
/**
 * The building's other toilets, one chip per floor with this one lit: in a mall the toilet one floor
 * down is often the better bet, and its page is a tap away.
 */
function OtherFloors({ t }: { t: ToiletDetail }) {
  // A page saved offline before siblings came in has none.
  const siblings = t.siblings ?? [];
  if (!siblings.length) return null;
  const all = [{ id: t.id, label: t.label, level: t.level, levelOrder: levelOrder(t.level) }, ...siblings].sort(
    (a, b) => compareLevelOrder(a.levelOrder, b.levelOrder),
  );
  const chip = "inline-flex min-h-11 items-center whitespace-nowrap rounded-full border-2 px-4 text-sm font-bold tabular-nums";
  return (
    <nav aria-labelledby="other-floors" className="mt-3" data-testid="other-floors">
      <p id="other-floors" className="text-sm font-bold text-muted">
        {siblings.length === 1 ? "1 other toilet in this building" : `${siblings.length} other toilets in this building`}
      </p>
      <ul className="no-scrollbar -mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 pb-1">
        {all.map((s) => {
          const text = levelShort(s.level) ?? s.label ?? "Level unknown";
          return (
            <li key={s.id} className="shrink-0">
              {s.id === t.id ? (
                <span aria-current="page" className={cx(chip, "border-primary bg-primary text-primary-fg shadow-gloss")}>
                  {text}
                  <span className="sr-only"> (this one)</span>
                </span>
              ) : (
                <Link
                  href={`/toilets/${encodeURIComponent(s.id)}`}
                  className={cx(chip, "border-border bg-surface-2 text-fg transition hover:border-primary/60 active:scale-[0.96]")}
                >
                  {levelShort(s.level) ? <span className="sr-only">Toilet on </span> : null}
                  {text}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function VenueLine({ t }: { t: ToiletDetail }) {
  const type = t.venue.type !== "OTHER" ? VENUE_TYPE_LABELS[t.venue.type] : null;
  // "Public toilet" alone says nothing, and a pending toilet has no directions here: both say where they are.
  const near =
    isUnnamed(t) || t.status === "PENDING"
      ? (t.near ?? (t.status === "PENDING" && t.venue.address ? shortAddress(t.venue.address) : null))
      : null;
  if (!near && !type && !t.venue.lines.length && !t.venue.planningArea) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm font-bold text-muted">
      {near ? (
        <span className="inline-flex items-center gap-1.5 text-fg">
          <Signpost className="size-4 text-muted" aria-hidden />
          {near}
        </span>
      ) : null}
      {type ? (
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="size-4" aria-hidden />
          {type}
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
        <Link
          href={`/areas/${areaSlug(t.venue.planningArea)}`}
          className="-my-3 inline-flex min-h-11 items-center gap-1.5 underline decoration-border-strong underline-offset-4 hover:text-fg hover:decoration-primary"
        >
          <MapPin className="size-4" aria-hidden />
          {t.venue.planningArea}
          <span className="sr-only">: see every toilet in this area</span>
        </Link>
      ) : null}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Verdict: everything needed to decide, in the order it's needed
// ---------------------------------------------------------------------------

function Verdict({ t }: { t: ToiletDetail }) {
  const pending = t.status === "PENDING";
  const [tierHelp, setTierHelp] = useState(false);
  const tierName = pending ? "Pending review" : TIER_LABELS[t.tier];
  const loc = useLocation();
  const { active } = useStoredFilters();

  // Only from a real GPS fix: never a walk from the fallback place (DESIGN.md).
  const distanceM = loc.source === "gps" ? haversineM(loc.coords, t) : null;
  const mins = distanceM !== null ? walkMinutes(estimateWalkSeconds(distanceM)) : null;
  // Without a fix the tile asks for one; a refusal or a failed fix is said in a line under the row.
  const locateNote =
    mins === null && loc.status === "denied"
      ? "Location is off for this site. Turn it on in your browser settings."
      : mins === null && loc.status === "unavailable"
        ? "Couldn't get a fix. Try again outside or near a window."
        : null;

  const musts = useMemo(() => mustHaves(t, active), [t, active]);
  // Open-data must-haves get the full sentence, not just the chip suffix (DESIGN.md "Do say so").
  const unverified = musts.filter((m) => m.state === "yes" && m.openData && (m.required || m.feature === "ACCESSIBLE")).map((m) => m.feature);
  const where = whereParts(t);
  const paid = t.featureDetails.some((d) => d.feature === "FREE" && !d.present);

  return (
    <section aria-label="At a glance" className="mt-4 rounded-[28px] border border-border/70 bg-surface p-4 shadow-rest">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill t={t} />
        {/* Cost decides as much as hours do, so it sits beside them rather than in the chips below. */}
        {paid ? (
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-extrabold">
            <Coins className="size-4 text-accent" aria-hidden />
            Paid
          </span>
        ) : null}
        <StatusChips statuses={t.activeStatus} />
      </div>

      {/* A quiet line, not a panel: it's context, and the walk and score below are what decide. */}
      {t.venue.note ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-sm font-medium text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t.venue.note}
        </p>
      ) : null}
      {pending ? (
        <p className="mt-3 rounded-2xl border-2 border-dashed border-warn px-3 py-2 text-sm font-medium">
          Added by the community and not confirmed yet, so it isn&apos;t used for directions. It goes live when someone else
          checks in there, or a moderator confirms it.
        </p>
      ) : null}
      {t.needsResurvey ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-warn-soft px-3 py-2 text-sm font-medium">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          Renovated or changed since our last survey. Details may be out of date.
        </p>
      ) : null}

      <div className="mt-3 flex items-stretch gap-2">
        {mins !== null ? (
          <div className="flex w-24 shrink-0 flex-col items-center justify-center rounded-2xl bg-mint px-2 py-2.5 text-center text-mint-fg shadow-gloss">
            <Footprints className="size-4" aria-hidden />
            <span className="mt-0.5 font-display text-4xl leading-none">{mins}</span>
            <span className="mt-1 text-xs font-extrabold">min walk</span>
            <span className="text-[11px] font-bold tabular-nums">{formatDistance(distanceM)}</span>
          </div>
        ) : (
          // The page no longer asks for location by itself, so the walk tile asks instead of going missing.
          <WalkTimeButton status={loc.status} onLocate={() => void loc.locate()} />
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-center rounded-2xl bg-surface-2 px-4 py-2.5">
          <p className="text-sm font-bold text-muted">Cleanliness</p>
          {t.scoreCleanliness !== null ? (
            <p className="mt-0.5 font-display text-4xl leading-none">
              {scoreNumber(t.scoreCleanliness)}
              <span className="ml-0.5 text-lg text-muted">/10</span>
            </p>
          ) : (
            <p className="mt-1 font-bold">No score yet</p>
          )}
        </div>
      </div>
      <p role="status" className={cx("text-sm font-medium text-muted", locateNote && "mt-2 flex items-start gap-1.5")}>
        {locateNote ? (
          <>
            <LocateOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            {locateNote}
          </>
        ) : null}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
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
        <VerifiedLine t={t} />
      </div>
      <TierHelpDialog open={tierHelp} onClose={() => setTierHelp(false)} />

      {where.length ? (
        <p className="mt-2 flex items-start gap-2 font-bold">
          <MapPin className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
          <span>{where.join(" · ")}</span>
        </p>
      ) : null}
      {/* Who gets in ("Customers only") decides as much as where it is, so it isn't left to the Address fold. */}
      {t.accessNote ? (
        <p className="mt-2 flex items-start gap-2 font-bold text-warn">
          <Lock className="mt-1 size-4 shrink-0" aria-hidden />
          <span>{t.accessNote}</span>
        </p>
      ) : null}

      {musts.length ? (
        <ul aria-label="Must-haves" className="mt-3 flex flex-wrap gap-1.5">
          {musts.map((m) => (
            <MustHaveChip key={m.feature} m={m} />
          ))}
        </ul>
      ) : null}
      {t.tier === "IMPORTED" && unverified.length ? (
        <div className="mt-3">
          <UnverifiedClaim t={t} required={unverified} />
        </div>
      ) : null}
    </section>
  );
}

/**
 * "Last verified 2 hours ago by @handle" (GROWTH.md 1.7): credit for whoever last tapped "still accurate"
 * on site. Handle only, never a name, and no link: there are no public profiles. The API sends null when
 * nobody is known or they turned credit off on /me, and then the line reads as it always did.
 */
function VerifiedLine({ t }: { t: ToiletDetail }) {
  const by = t.lastVerifiedAt ? t.verifiedBy?.handle : null;
  if (!by) return <span className="text-sm font-medium text-muted">{lastVerifiedText(t)}</span>;
  return (
    <span className="text-sm font-medium text-muted">
      {lastVerifiedText({ lastVerifiedAt: t.lastVerifiedAt, needsResurvey: false })} by{" "}
      <span className="font-bold text-fg">@{by}</span>
      {t.needsResurvey ? " · due for a re-survey" : null}
    </span>
  );
}

function MissingFacts({ t }: { t: ToiletDetail }) {
  const missing = missingFacts(t);
  if (!missing.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 text-sm">
      <p className="font-medium text-muted">{sentenceCase(joinAnd(missing))} not known yet.</p>
      <SuggestEditButton toilet={t} />
    </div>
  );
}

function StatusPill({ t }: { t: ToiletDetail }) {
  const base = "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-extrabold";
  if (t.status === "CLOSED" || t.status === "RENOVATION") {
    return (
      <span className={cx(base, "bg-danger-soft text-danger")}>
        <X className="size-4" aria-hidden />
        {t.status === "CLOSED" ? "Closed" : "Under renovation"}
      </span>
    );
  }
  if (t.openNow === null) {
    return (
      <span className={cx(base, "bg-surface-2 text-muted")}>
        <Clock className="size-4" aria-hidden />
        Hours unknown
      </span>
    );
  }
  // "Closed now" alone leaves the question everyone asks next. Clock-dependent, hence the hydration hush.
  const opens = t.openNow ? null : opensText(t.openingHours);
  return (
    <span className={cx(base, t.openNow ? "bg-mint-soft text-mint" : "bg-danger-soft text-danger")}>
      <Clock className="size-4" aria-hidden />
      {t.openNow ? "Open now" : "Closed now"}
      {opens ? (
        <span className="font-bold" suppressHydrationWarning>
          · {opens}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Stands in for the walk tile when there's no GPS fix. Walk time is never worked out from a
 * fallback or searched place, so the only way to it is the person's own location, asked for here.
 */
function WalkTimeButton({ status, onLocate }: { status: ReturnType<typeof useLocation>["status"]; onLocate: () => void }) {
  const locating = status === "locating";
  const Icon = locating ? LoaderCircle : status === "denied" ? LocateOff : LocateFixed;
  return (
    <button
      type="button"
      onClick={onLocate}
      disabled={locating}
      aria-busy={locating || undefined}
      className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-mint-soft px-2 py-2.5 text-center text-mint transition hover:brightness-110 active:translate-y-px disabled:cursor-wait"
    >
      <Icon className={cx("size-5", locating && "animate-spin")} aria-hidden />
      <span className="text-xs font-extrabold leading-tight">{locating ? "Finding you…" : "Show walk time"}</span>
    </button>
  );
}

function whereParts(t: ToiletDetail): string[] {
  const out: string[] = [];
  const level = levelText(t.level);
  if (level) out.push(level);
  if (t.nearestExit) out.push(/^exit/i.test(t.nearestExit) ? t.nearestExit : `Exit ${t.nearestExit}`);
  if (t.areaType === "PAID_AREA") out.push("Inside fare gates");
  if (t.areaType === "UNPAID_AREA") out.push("Outside fare gates");
  return out;
}

/** The where-facts nobody has recorded yet, for the "Seen it?" line. */
function missingFacts(t: ToiletDetail): string[] {
  const station = t.venue.type === "MRT_STATION";
  const out: string[] = [];
  if (!t.level) out.push("level");
  if (station && !t.nearestExit) out.push("exit");
  if (station && t.areaType === "UNKNOWN") out.push("fare gates");
  if (!t.openingHours) out.push("hours");
  return out;
}

// ---------------------------------------------------------------------------
// Must-haves: the visitor's saved filters first, then what this toilet is known to have
// ---------------------------------------------------------------------------

type MustHave = { feature: Feature; state: "yes" | "no" | "unknown"; openData: boolean; required: boolean };

/** Filled in when the visitor has saved fewer than four must-haves. Things people ask first. */
const FILL_ORDER: Feature[] = ["ACCESSIBLE", "BIDET", "TOILET_PAPER", "FREE", "BABY_CHANGE", "SITTING", "HAND_SOAP"];
const MAX_CHIPS = 4;

function mustHaves(t: ToiletDetail, saved: ReadonlySet<string>): MustHave[] {
  const byF = new Map(t.featureDetails.map((d) => [d.feature, d]));
  const out: MustHave[] = [];
  // Open now and fare gates have their own places in the card.
  for (const f of FILTERS) {
    if (!saved.has(f.key) || f.key === "OPEN_NOW" || f.key === "UNPAID_AREA") continue;
    const feature = f.key as Feature;
    const d = byF.get(feature);
    // Not free already shows as the "Paid" chip beside the status.
    if (feature === "FREE" && d && !d.present) continue;
    out.push({ feature, state: d ? (d.present ? "yes" : "no") : "unknown", openData: !!d && isOpenData(d), required: true });
  }
  for (const feature of FILL_ORDER) {
    if (out.length >= MAX_CHIPS) break;
    const d = byF.get(feature);
    if (d?.present && !out.some((m) => m.feature === feature)) out.push({ feature, state: "yes", openData: isOpenData(d), required: false });
  }
  return out;
}

function MustHaveChip({ m }: { m: MustHave }) {
  const Icon = FEATURE_ICONS[m.feature] ?? Check;
  const label = FEATURE_LABELS[m.feature];
  const base = "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold";
  if (m.state === "no") {
    return (
      <li className={cx(base, "bg-surface-2 text-fg")}>
        <X className="size-4 shrink-0 text-muted" aria-hidden />
        No {label.toLowerCase()}
      </li>
    );
  }
  if (m.state === "unknown") {
    return (
      <li className={cx(base, "border border-border text-muted")}>
        <CircleHelp className="size-4 shrink-0" aria-hidden />
        {label}: not known
      </li>
    );
  }
  const hue = FEATURE_HUE[m.feature];
  return (
    <li className={cx(base, hue ? HUE_CHIP[hue] : "border border-border/70 bg-surface-2")}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
      {m.openData ? <span className="text-xs font-medium">· open data</span> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// More info: one grouped list of folds, each with a summary on its closed face
// ---------------------------------------------------------------------------

function MoreInfo({ t }: { t: ToiletDetail }) {
  const all = FEATURE_GROUPS.flatMap((g) => g.features);
  const known = t.featureDetails.filter((d) => all.includes(d.feature)).length;
  const reports = t.activeStatus.reduce((n, s) => n + s.count, 0);
  const anyBad = t.activeStatus.some((s) => BAD_STATUS.includes(s.kind));
  const hours = hoursText(t.openingHours);
  const hasPlace = !!(t.venue.address || hours || t.accessNote);
  const rasStars = t.rasStars ?? t.latestSurvey?.rasStars ?? null;
  const accessibleFromOpenData = t.featureDetails.some((d) => d.feature === "ACCESSIBLE" && d.present && isOpenData(d));

  return (
    <div className="divide-y divide-border/70 overflow-hidden rounded-[28px] border border-border/70 bg-surface shadow-rest">
      <Fold title="Live status" icon={Activity} hue="mint" meta={reports ? `${reports} report${reports === 1 ? "" : "s"}` : "Quiet"} alert={anyBad}>
        <LiveStatusList toilet={t} />
      </Fold>
      <Fold title="What's inside" icon={PackageOpen} hue="soda" meta={`${known}/${all.length} known`}>
        {t.tier === "IMPORTED" && accessibleFromOpenData ? (
          <div className="mb-3">
            <UnverifiedClaim t={t} required={["ACCESSIBLE"]} />
          </div>
        ) : null}
        <Features details={t.featureDetails} />
        {t.featureDetails.length ? (
          <p className="mt-3 text-sm font-medium text-muted">Been here? Check in to update what&apos;s inside.</p>
        ) : null}
      </Fold>
      {t.latestSurvey || rasStars ? (
        <Fold
          title="Survey"
          icon={ClipboardCheck}
          hue="gold"
          meta={t.latestSurvey ? `${t.latestSurvey.total}/50` : `${rasStars}/5 stars`}
        >
          <SurveyBreakdown survey={t.latestSurvey} count={t.surveyCount} ras={rasStars} />
        </Fold>
      ) : null}
      {hasPlace ? (
        <Fold title="Address & hours" icon={MapPin} hue="papaya">
          <dl className="flex flex-col gap-3">
            {t.venue.address ? <Fact icon={MapPin} label="Address" value={t.venue.address} /> : null}
            {hours ? <Fact icon={Clock} label="Opening hours" value={hours} /> : null}
            {t.accessNote ? <Fact icon={Route} label="Getting in" value={t.accessNote} /> : null}
          </dl>
        </Fold>
      ) : null}
      <Fold title="Reviews" icon={MessageSquareHeart} hue="taro" meta={String(t.reviewCount)}>
        <ReviewList toilet={t} />
      </Fold>
    </div>
  );
}

function Fold({
  title,
  icon,
  hue,
  meta,
  alert,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  hue: Hue;
  meta?: string;
  alert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FoldDetails
      className="group/fold"
      summaryClassName="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-2 hover:bg-surface-2 focus-visible:-outline-offset-4 [&::-webkit-details-marker]:hidden"
      summary={
        <>
          <SectionIcon icon={icon} hue={hue} />
          <h2 className="min-w-0 flex-1 text-lg leading-tight">{title}</h2>
          {meta ? (
            <span className={cx("shrink-0 text-sm font-bold tabular-nums", alert ? "text-danger" : "text-muted")}>{meta}</span>
          ) : null}
          <ChevronDown className="size-5 shrink-0 text-muted transition-transform duration-200 group-data-expanded/fold:rotate-180" aria-hidden />
        </>
      }
    >
      <div className="px-4 pb-5 pt-1">{children}</div>
    </FoldDetails>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-sm font-bold text-muted">
        <Icon className="size-4" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 font-bold">{value}</dd>
    </div>
  );
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  TOILET_PAPER: Scroll,
  HAND_SOAP: SoapDispenserDroplet,
  AUTO_SOAP: SoapDispenserDroplet,
  HAND_DRYER: Wind,
  BABY_CHANGE: Baby,
  NURSING_ROOM: Milk,
  SHOWER: ShowerHead,
  MIRROR: FlipHorizontal2,
  WATER_REFILL: GlassWater,
  ABLUTION: HandHeart,
  PERIOD_PRODUCTS: Droplet,
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

function Features({ details }: { details: FeatureDetail[] }) {
  const byFeature = useMemo(() => new Map(details.map((d) => [d.feature, d])), [details]);
  const all = FEATURE_GROUPS.flatMap((g) => g.features);
  const has = FEATURE_GROUPS.map((g) => ({
    title: g.title,
    items: g.features.filter((f) => byFeature.get(f)?.present),
  })).filter((g) => g.items.length);
  const hasNot = all.filter((f) => byFeature.get(f)?.present === false);

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
            <div key={g.title}>
              <h3 className="mb-1.5 text-sm font-bold text-muted">{g.title}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {g.items.map((f) => {
                  const Icon = FEATURE_ICONS[f] ?? Check;
                  const open = isOpenData(byFeature.get(f)!);
                  const hue = FEATURE_HUE[f];
                  return (
                    <li
                      key={f}
                      className={cx(
                        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold",
                        hue ? HUE_CHIP[hue] : "border border-border/70 bg-surface-2",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {FEATURE_LABELS[f]}
                      {open ? <span className="text-xs font-medium">· open data</span> : null}
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

      {/* What isn't recorded is left to the full list below (and the "n/30 known" count), not spelled out twice. */}
      {hasNot.length ? (
        <p className="flex items-start gap-2 text-sm font-medium">
          <X className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <span>
            <span className="font-extrabold">No </span>
            {namesList(hasNot)}
          </span>
        </p>
      ) : null}

      {/* A plain row, not a box: it opens inside the fold, so a second panel would nest a card in a card. */}
      <FoldDetails
        className="group border-t border-border/70 pt-1"
        summaryClassName="-mx-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
        summary={
          <>
            <span className="group-data-expanded:hidden">All {all.length} features, with sources</span>
            <span className="hidden group-data-expanded:inline">Hide the full list</span>
            <ChevronDown className="size-5 transition-transform duration-200 group-data-expanded:rotate-180" aria-hidden />
          </>
        }
      >
        <FeatureChecklist byFeature={byFeature} />
      </FoldDetails>
    </div>
  );
}

type SourceKey = string;
const sourceKey = (d: FeatureDetail): SourceKey => `${d.source}|${d.observedAt ? formatDate(d.observedAt) : ""}`;
function sourceText(d: FeatureDetail): string {
  const name = isOpenData(d) ? `Open data (${sourceLabel(d.source)})` : (SOURCE_SHORT[d.source] ?? sourceLabel(d.source));
  return d.observedAt ? `${name}, ${formatDate(d.observedAt)}` : name;
}

/**
 * Every feature as a two-column checklist. Sources are stated once: the most common
 * source and date leads, and only features recorded elsewhere carry their own note.
 */
function FeatureChecklist({ byFeature }: { byFeature: Map<Feature, FeatureDetail> }) {
  const counts = new Map<SourceKey, { d: FeatureDetail; n: number }>();
  for (const d of byFeature.values()) {
    const k = sourceKey(d);
    const c = counts.get(k);
    if (c) c.n++;
    else counts.set(k, { d, n: 1 });
  }
  const sources = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  const main = sources[0]?.[0];

  return (
    <div className="@container pb-1 pt-2">
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1">
          <StateMark state="yes" /> Yes
        </span>
        <span className="inline-flex items-center gap-1">
          <StateMark state="no" /> No
        </span>
        <span className="inline-flex items-center gap-1">
          <StateMark state="unknown" /> Not recorded
        </span>
      </p>

      {FEATURE_GROUPS.map((g) => (
        <div key={g.title} className="mt-3">
          <h3 className="text-sm font-bold text-muted">{g.title}</h3>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 @lg:grid-cols-3">
            {g.features.map((f) => {
              const d = byFeature.get(f);
              const state = !d ? "unknown" : d.present ? "yes" : "no";
              return (
                <li key={f} className="flex min-h-8 items-start gap-2 py-1 text-sm">
                  <StateMark state={state} />
                  <span className={cx("min-w-0 leading-tight", state === "unknown" ? "font-medium text-muted" : "font-bold")}>
                    {FEATURE_LABELS[f]}
                    <span className="sr-only">: {state === "yes" ? "yes" : state === "no" ? "no" : "not recorded"}</span>
                    {d && sourceKey(d) !== main ? (
                      <span className="block text-xs font-medium text-muted">{sourceText(d)}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {sources.length ? (
        <p className="mt-4 border-t border-border/70 pt-3 text-xs font-medium text-muted">
          <span className="font-bold">Source:</span> {sourceText(sources[0][1].d)}
          {sources.length > 1 ? " unless marked under a feature." : "."}
        </p>
      ) : null}
    </div>
  );
}

function StateMark({ state }: { state: "yes" | "no" | "unknown" }) {
  const base = "inline-flex size-5 shrink-0 items-center justify-center rounded-full";
  if (state === "yes")
    return (
      <span className={cx(base, "bg-mint-soft text-mint")} aria-hidden>
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  if (state === "no")
    return (
      <span className={cx(base, "bg-surface-2 text-fg")} aria-hidden>
        <X className="size-3.5" strokeWidth={3} />
      </span>
    );
  return (
    <span className={cx(base, "text-muted")} aria-hidden>
      <CircleHelp className="size-4" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Survey breakdown (the headline cleanliness score lives in the verdict card)
// ---------------------------------------------------------------------------

const RUBRIC: { key: keyof Pick<Survey, "cleanliness" | "scent" | "aesthetics" | "music" | "toiletries" | "facilities">; label: string; max: number }[] = [
  { key: "cleanliness", label: "Cleanliness", max: 10 },
  { key: "scent", label: "Scent", max: 5 },
  { key: "aesthetics", label: "Aesthetics", max: 5 },
  { key: "music", label: "Music", max: 5 },
  { key: "toiletries", label: "Toiletries", max: 5 },
  { key: "facilities", label: "Facilities", max: 20 },
];

function SurveyBreakdown({ survey, count, ras }: { survey: Survey | null; count: number; ras: number | null }) {
  return (
    <div className="flex flex-col gap-4">
      {survey ? (
        <>
          <p className="text-sm font-medium text-muted">
            <span className="font-extrabold text-fg">{survey.total}/50</span> on our 50-point rubric, surveyed in person{" "}
            {formatDate(survey.surveyedAt)}
            {survey.phase ? ` (${survey.phase})` : ""}
            {count > 1 ? ` · ${count} surveys on record` : ""}. The cleanliness score above blends it with recent reviews.
          </p>
          <ul className="flex flex-col gap-3">
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
                    className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2"
                    role="meter"
                    aria-label={r.label}
                    aria-valuemin={0}
                    aria-valuemax={r.max}
                    aria-valuenow={v}
                  >
                    <div className="h-full rounded-full bg-accent shadow-gloss" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {survey.remarks ? (
            <p className="rounded-2xl bg-surface-2 px-4 py-2.5 text-sm font-medium">&ldquo;{survey.remarks}&rdquo;</p>
          ) : null}
        </>
      ) : (
        <p className="font-medium text-muted">Not surveyed in person yet. Reviews from people like you fill the gap.</p>
      )}
      {ras ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stars value={ras} label={`Happy Toilet rating ${ras} of 5 stars`} />
          <span className="text-sm font-medium text-muted">Happy Toilet rating, Restroom Association of Singapore</span>
        </div>
      ) : null}
    </div>
  );
}
