"use client";

import {
  Accessibility,
  Armchair,
  Baby,
  BadgeCheck,
  ChevronRight,
  CircleDot,
  CircleHelp,
  Clock,
  Coins,
  DoorOpen,
  Droplets,
  Footprints,
  Globe,
  Milk,
  Navigation,
  Scroll,
  ShowerHead,
  SoapDispenserDroplet,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { memo, useState } from "react";
import type { ActiveStatus, Feature, ToiletSummary, ToiletTier } from "@/lib/api/types";
import {
  BAD_STATUS,
  FEATURE_LABELS,
  MRT_LINES,
  STATUS_LABELS,
  TIER_HELP,
  TIER_LABELS,
  TIER_LEGEND,
  cleanlinessText,
  formatDistance,
  lineColor,
  lineTextColor,
  timeAgo,
  toiletTag,
  walkMinutes,
} from "@/lib/format";
import { FEATURE_HUE, FILTER_HUE, HUE_TEXT } from "@/lib/feature-hues";
import type { FilterKey } from "@/lib/filters";
import { openFromCard } from "@/lib/toilet-handoff";
import { levelText } from "@/lib/level";
import { PinGlyph, tierPinVariant } from "./pin";
import { Dialog, cx } from "./ui";

export function TierBadge({
  tier,
  pending,
  unconfirmed,
  age,
  seenBy,
  help,
  className,
}: {
  tier: ToiletTier;
  pending?: boolean;
  /**
   * Calm results list pending toilets (trust model v2), so there the dashed badge says what that means for
   * the walker, "Unconfirmed", instead of "Pending review". Urgent results never show them.
   */
  unconfirmed?: boolean;
  /** Short freshness ("3 wk", "not checked") carried inside the badge, so a compact row says tier and age at once. */
  age?: string;
  /** Different people who've confirmed a Community toilet; said on the badge from two up. */
  seenBy?: number;
  /** What the tier means, for screen readers. Defaults to the tier's own help text. */
  help?: string;
  className?: string;
}) {
  if (pending) {
    return (
      <span
        className={cx(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-dashed border-warn px-2 py-0.5 text-xs font-extrabold text-warn",
          className,
        )}
      >
        {unconfirmed ? "Unconfirmed" : "Pending review"}
        <span className="sr-only">
          {unconfirmed
            ? ": added recently and not yet confirmed by a second person"
            : ": waiting for community review, not used for directions"}
        </span>
      </span>
    );
  }
  const seen = tier === "COMMUNITY" && seenBy !== undefined && seenBy >= 2 ? seenBy : null;
  const styles: Record<ToiletTier, string> = {
    VERIFIED: "bg-tier text-tier-fg border-2 border-tier",
    COMMUNITY: "bg-transparent text-tier border-2 border-tier",
    IMPORTED: "bg-transparent text-muted border-2 border-muted/50",
  };
  const Icon = tier === "VERIFIED" ? BadgeCheck : tier === "COMMUNITY" ? Users : Globe;
  return (
    <span
      className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-extrabold", styles[tier], className)}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {TIER_LABELS[tier]}
      <span className="sr-only">: {help ?? TIER_HELP[tier].toLowerCase()}</span>
      {seen !== null ? <span className="font-bold">· seen by {seen}</span> : null}
      {age ? (
        <span className="font-bold" aria-hidden>
          · {age}
        </span>
      ) : null}
    </span>
  );
}

const DAY_MS = 86_400_000;

/** The age a compact tier badge carries: "today", "4 d", "3 wk", "5 mo", "2 yr", or "not checked". */
export function shortAge(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "not checked";
  const days = Math.floor((now - new Date(iso).getTime()) / DAY_MS);
  if (Number.isNaN(days)) return "";
  if (days < 1) return "today";
  if (days < 7) return `${days} d`;
  if (days < 35) return `${Math.floor(days / 7)} wk`;
  if (days < 365) return `${Math.floor(days / 30)} mo`;
  return `${Math.floor(days / 365)} yr`;
}

/** MRT line code on its official colour, with text that clears 4.5:1. */
export function LineBadge({ line, className }: { line: string; className?: string }) {
  return (
    <span
      className={cx("inline-flex min-w-9 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold", className)}
      style={{ background: lineColor(line), color: lineTextColor(line) }}
    >
      <span aria-hidden>{line}</span>
      <span className="sr-only">{MRT_LINES[line]?.name ?? line}</span>
    </span>
  );
}

/** "Last verified …" in the same words everywhere a toilet appears. */
export function lastVerifiedText(t: Pick<ToiletSummary, "lastVerifiedAt" | "needsResurvey">): string {
  const base = t.lastVerifiedAt ? `Last verified ${timeAgo(t.lastVerifiedAt)}` : "Never verified in person";
  return t.needsResurvey ? `${base} · due for a re-survey` : base;
}

/**
 * When a must-have is only vouched for by open data, say so plainly.
 * Renders nothing for verified/community toilets or when nothing was required.
 */
export function UnverifiedClaim({ t, required }: { t: Pick<ToiletSummary, "tier">; required: Feature[] }) {
  if (t.tier !== "IMPORTED" || required.length === 0) return null;
  const names = required.map((f) => FEATURE_LABELS[f]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)!.toLowerCase()}` : names[0];
  return (
    <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-fg">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <span>
        {list} {names.length > 1 ? "come" : "comes"} from open data. Nobody has checked {names.length > 1 ? "them" : "it"} in person yet.
      </span>
    </p>
  );
}

function legendVariant(tier: ToiletTier | "PENDING") {
  return tier === "PENDING" ? tierPinVariant("IMPORTED", true) : tierPinVariant(tier);
}

/** Pin key for the map, with a button that explains the tiers. */
export function TierLegend({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={cx("flex items-center gap-2 text-xs font-medium text-muted", className)}>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Map key">
          {TIER_LEGEND.map((l) => (
            <li key={l.tier} className="inline-flex items-center gap-1">
              <PinGlyph variant={legendVariant(l.tier)} className="size-4" />
              {l.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap -my-3 ml-auto inline-flex shrink-0 items-center justify-center rounded-full text-primary"
          aria-haspopup="dialog"
          aria-label="What do the pins mean?"
        >
          <CircleHelp className="size-5" aria-hidden />
        </button>
      </div>
      <TierHelpDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function TierHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Can trust or not?">
      <p className="text-muted">Every toilet shows where its info comes from, so you know how much to trust it.</p>
      <ul className="mt-4 flex flex-col gap-4">
        {TIER_LEGEND.map((l) => (
          <li key={l.tier} className="flex items-start gap-3">
            <PinGlyph variant={legendVariant(l.tier)} className="size-9" />
            <div>
              <p className="font-bold">{l.label}</p>
              <p className="text-sm text-muted">{l.help}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm">
        <Link href="/about" className="font-semibold text-primary underline" onClick={onClose}>
          More about where our data comes from
        </Link>
      </p>
    </Dialog>
  );
}

const FEATURE_ICON: Partial<Record<Feature, React.ComponentType<{ className?: string }>>> = {
  BIDET: Droplets,
  ACCESSIBLE: Accessibility,
  BABY_CHANGE: Baby,
  SITTING: Armchair,
  FREE: Coins,
  TOILET_PAPER: Scroll,
  HAND_SOAP: SoapDispenserDroplet,
};

const FILTER_ICON: Record<FilterKey, React.ComponentType<{ className?: string }>> = {
  BIDET: Droplets,
  ACCESSIBLE: Accessibility,
  FREE: Coins,
  SITTING: Armchair,
  BABY_CHANGE: Baby,
  OPEN_NOW: Clock,
  UNPAID_AREA: DoorOpen,
  NURSING_ROOM: Milk,
  SHOWER: ShowerHead,
  UNISEX: Users,
};

/** A filter chip's contents: its feature-group icon in that group's hue (ink-coloured once the chip is picked). */
export function FilterChipLabel({ k, label, active }: { k: FilterKey; label: string; active: boolean }) {
  const Icon = FILTER_ICON[k];
  const hue = FILTER_HUE[k];
  return (
    <>
      <Icon className={cx("size-4 shrink-0", !active && (hue ? HUE_TEXT[hue] : "text-muted"))} aria-hidden />
      {label}
    </>
  );
}

const HIGHLIGHT: Feature[] = ["BIDET", "ACCESSIBLE", "FREE", "SITTING", "BABY_CHANGE", "TOILET_PAPER", "HAND_SOAP"];

/** Card feature chips stay fudge; the group hue rides on the icon only, so tier and walk time lead the card. */
export function FeatureChips({
  features,
  max = 4,
  plain,
  more,
  first = [],
}: {
  features: Feature[];
  max?: number;
  plain?: boolean;
  /** Count what didn't fit as a trailing "+n", so a compact card keeps its chips to one line without hiding that there's more. */
  more?: boolean;
  /** Shown ahead of the usual highlights when the toilet has them (what was asked for), even outside that set. */
  first?: Feature[];
}) {
  const known = [...new Set([...first, ...HIGHLIGHT])].filter((f) => features.includes(f));
  const shown = known.slice(0, max);
  const extra = more ? known.length - shown.length : 0;
  if (!shown.length) return null;
  if (plain) {
    // Dense lists (area pages): the hue icon and the word, no pill, so a row stays one line of facts.
    return (
      <ul className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-medium text-muted" aria-label="Features">
        {shown.map((f) => {
          const Icon = FEATURE_ICON[f];
          const hue = FEATURE_HUE[f];
          return (
            <li key={f} className="inline-flex items-center gap-1">
              {Icon ? <Icon className={cx("size-3.5", hue && HUE_TEXT[hue])} aria-hidden /> : null}
              {FEATURE_LABELS[f]}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Features">
      {shown.map((f) => {
        const Icon = FEATURE_ICON[f];
        const hue = FEATURE_HUE[f];
        return (
          <li key={f} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold text-fg">
            {Icon ? <Icon className={cx("size-3.5", hue && HUE_TEXT[hue])} aria-hidden /> : null}
            {FEATURE_LABELS[f]}
          </li>
        );
      })}
      {extra > 0 ? (
        <li className="inline-flex items-center px-1 text-xs font-bold text-muted">
          +{extra}
          <span className="sr-only"> more</span>
        </li>
      ) : null}
    </ul>
  );
}

export function StatusChips({ statuses }: { statuses: ActiveStatus[] }) {
  if (!statuses.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Live reports">
      {statuses.map((s) => {
        const bad = BAD_STATUS.includes(s.kind);
        return (
          <li
            key={s.kind}
            className={cx(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold",
              bad ? "bg-danger-soft text-danger" : "bg-mint-soft text-mint",
            )}
          >
            <CircleDot className="size-3" aria-hidden />
            {STATUS_LABELS[s.kind]}
            {s.count > 1 ? ` ×${s.count}` : ""}
            <span className="font-normal">· {timeAgo(s.latestAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function OpenNow({ openNow }: { openNow: boolean | null }) {
  if (openNow === null) return <span className="text-xs text-muted">Hours unknown</span>;
  if (!openNow) return <ClosedPill>Closed now</ClosedPill>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-mint">
      <Clock className="size-3.5" aria-hidden />
      Open now
    </span>
  );
}

/** "Closed now" and friends: a Broken Red pill, since a closed toilet is the one fact that changes the plan. */
export function ClosedPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-extrabold text-danger",
        className,
      )}
    >
      <Clock className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/**
 * Three rows: name, one fact line (tier with its age, level, then score and hours only when known), chips.
 * Unknowns stay off the card; the detail page says what isn't known yet.
 */
function ToiletCardInner({
  t,
  selected,
  onHover,
  walk,
  distanceFrom,
}: {
  t: ToiletSummary;
  selected?: boolean;
  onHover?: (id: string | null) => void;
  /**
   * Adds a "Walk there" side button (the route screen, one tap from the map). The card itself still opens
   * the detail page; the button sits beside it, as on the urgent alternates, since a link can't hold a link.
   */
  walk?: boolean;
  /** Where the metres are measured from when it isn't the person (a searched or fallback place). */
  distanceFrom?: string;
}) {
  const mins = walkMinutes(t.walkSecondsEstimate);
  const pending = t.status === "PENDING";
  // "Women's · DTL side": who it's for and its label, after the place's name.
  const tag = toiletTag(t);
  // Room for one line of chips: live reports first (they're news), then features.
  const featureRoom = Math.max(1, 2 - t.activeStatus.length);
  // Pending toilets are never used for directions.
  const side = walk && !pending;
  const shell = cx(
    "rounded-3xl border bg-surface shadow-rest",
    selected ? "border-primary ring-2 ring-primary" : "border-border/70",
  );
  const card = (
    <Link
      href={`/toilets/${t.id}`}
      // Going deeper: the detail page arrives from the right (and shows this name while it loads).
      transitionTypes={["push"]}
      onClick={() => openFromCard(t.id, t.venue.name)}
      // A real pointer or the keyboard only: a tap fires an emulated hover that never leaves, and a stuck
      // hover would pin the map's highlight to this card instead of following the list as it scrolls.
      onPointerEnter={(e) => e.pointerType === "mouse" && onHover?.(t.id)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onHover?.(null)}
      onFocus={(e) => e.currentTarget.matches(":focus-visible") && onHover?.(t.id)}
      onBlur={() => onHover?.(null)}
      className={cx(
        "group flex items-start gap-3 p-3 transition hover:brightness-110 active:scale-[0.98]",
        side ? "min-w-0 flex-1 bg-surface" : shell,
      )}
      data-testid="toilet-card"
    >
      {/* No walk block without walk minutes (no GPS fix): a dash in mint would still read as "near you". */}
      {mins !== null ? (
        <div className="flex w-14 shrink-0 flex-col items-center rounded-2xl bg-mint py-1.5 text-center text-mint-fg shadow-gloss">
          <Footprints className="size-3.5" aria-hidden />
          <span className="font-display text-2xl leading-none">{mins}</span>
          <span className="text-[11px] font-extrabold leading-tight">min</span>
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-extrabold leading-snug">
            {t.venue.name}
            {tag ? <span className="text-sm font-medium text-muted"> · {tag}</span> : null}
          </h3>
          <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted group-hover:text-primary" aria-hidden />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
          {/* Shut leads the facts: it's the one that changes the plan. */}
          {t.status === "CLOSED" ? <ClosedPill>Closed</ClosedPill> : null}
          {t.status === "RENOVATION" ? <ClosedPill>Under renovation</ClosedPill> : null}
          {t.openNow === false && t.status !== "CLOSED" && t.status !== "RENOVATION" ? <OpenNow openNow={false} /> : null}
          <TierBadge
            tier={t.tier}
            pending={pending}
            age={pending ? undefined : shortAge(t.lastVerifiedAt)}
            seenBy={t.seenBy}
          />
          <span className="sr-only">{lastVerifiedText(t)}.</span>
          {/* Metres only when there are no walk minutes to show (no GPS fix). */}
          {mins === null && t.distanceM !== undefined ? (
            <span className="text-muted tabular-nums">
              {formatDistance(t.distanceM)}
              {distanceFrom ? ` from ${distanceFrom}` : null}
            </span>
          ) : null}
          {t.level ? <span className="text-muted">{levelText(t.level)}</span> : null}
          {t.scoreCleanliness !== null && t.scoreCleanliness !== undefined ? (
            <span className="inline-flex items-center gap-1 font-semibold">
              <Sparkles className="size-3.5 text-accent" aria-hidden />
              {cleanlinessText(t.scoreCleanliness)}
            </span>
          ) : null}
          {t.openNow ? <OpenNow openNow /> : null}
          {t.needsResurvey ? <span className="text-xs font-bold text-warn">Re-survey due</span> : null}
        </div>
        {t.activeStatus.length || t.features.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusChips statuses={t.activeStatus} />
            <FeatureChips features={t.features} max={featureRoom} more />
          </div>
        ) : null}
      </div>
    </Link>
  );
  if (!side) return card;
  return (
    // A narrow card (a small phone with large text) stacks Walk under the card instead of squeezing the name.
    <div className={cx("@container overflow-hidden", shell)}>
      <div className="flex items-stretch @max-[18rem]:flex-col">
      {card}
      <Link
        href={`/go?to=${encodeURIComponent(t.id)}`}
        // Going deeper, like opening the toilet: the route arrives from the right, and its Back pops.
        transitionTypes={["push"]}
        className="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-border text-xs font-extrabold text-primary transition hover:bg-surface-2 active:scale-95 @max-[18rem]:min-h-11 @max-[18rem]:w-full @max-[18rem]:flex-row @max-[18rem]:gap-1.5 @max-[18rem]:border-l-0 @max-[18rem]:border-t @max-[18rem]:text-sm"
        aria-label={`Walk to ${t.venue.name}${tag ? `, ${tag}` : ""}`}
        data-testid="walk-there"
      >
        <Navigation className="size-5" aria-hidden />
        <span aria-hidden>Walk</span>
      </Link>
      </div>
    </div>
  );
}

/** Memoised: the map page re-renders on every selection, and a list holds up to 50 of these. */
export const ToiletCard = memo(ToiletCardInner);
