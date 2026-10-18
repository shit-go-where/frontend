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
  Droplets,
  Footprints,
  Globe,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
  walkMinutes,
} from "@/lib/format";
import { PinGlyph, tierPinVariant } from "./pin";
import { Dialog, cx } from "./ui";

export function TierBadge({ tier, pending, className }: { tier: ToiletTier; pending?: boolean; className?: string }) {
  if (pending) {
    return (
      <span
        className={cx(
          "inline-flex items-center gap-1 rounded-full border-2 border-dashed border-warn px-2 py-0.5 text-xs font-extrabold text-warn",
          className,
        )}
      >
        Pending review
        <span className="sr-only">: waiting for community review, not used for directions</span>
      </span>
    );
  }
  const styles: Record<ToiletTier, string> = {
    VERIFIED: "bg-tier text-tier-fg border-2 border-tier",
    COMMUNITY: "bg-transparent text-tier border-2 border-tier",
    IMPORTED: "bg-transparent text-muted border-2 border-muted/50",
  };
  const Icon = tier === "VERIFIED" ? BadgeCheck : tier === "COMMUNITY" ? Users : Globe;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold", styles[tier], className)}>
      <Icon className="size-3.5" aria-hidden />
      {TIER_LABELS[tier]}
      <span className="sr-only">: {TIER_HELP[tier].toLowerCase()}</span>
    </span>
  );
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
};

const HIGHLIGHT: Feature[] = ["BIDET", "ACCESSIBLE", "FREE", "SITTING", "BABY_CHANGE", "TOILET_PAPER", "HAND_SOAP"];

export function FeatureChips({ features, max = 4 }: { features: Feature[]; max?: number }) {
  const shown = HIGHLIGHT.filter((f) => features.includes(f)).slice(0, max);
  if (!shown.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Features">
      {shown.map((f) => {
        const Icon = FEATURE_ICON[f];
        return (
          <li key={f} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold">
            {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
            {FEATURE_LABELS[f]}
          </li>
        );
      })}
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
              bad ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok",
            )}
          >
            <CircleDot className="size-3" aria-hidden />
            {STATUS_LABELS[s.kind]}
            {s.count > 1 ? ` ×${s.count}` : ""}
            <span className="font-normal opacity-80">· {timeAgo(s.latestAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function OpenNow({ openNow }: { openNow: boolean | null }) {
  if (openNow === null) return <span className="text-xs text-muted">Hours unknown</span>;
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs font-semibold", openNow ? "text-ok" : "text-danger")}>
      <Clock className="size-3.5" aria-hidden />
      {openNow ? "Open now" : "Closed now"}
    </span>
  );
}

export function ToiletCard({
  t,
  selected,
  onHover,
}: {
  t: ToiletSummary;
  selected?: boolean;
  onHover?: (id: string | null) => void;
}) {
  const mins = walkMinutes(t.walkSecondsEstimate);
  return (
    <Link
      href={`/toilets/${t.id}`}
      onMouseEnter={() => onHover?.(t.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(t.id)}
      onBlur={() => onHover?.(null)}
      className={cx(
        "group flex items-start gap-3 rounded-3xl border bg-surface p-3 shadow-rest transition hover:brightness-110",
        selected ? "border-primary ring-2 ring-primary" : "border-border/70",
      )}
      data-testid="toilet-card"
    >
      <div className="flex w-14 shrink-0 flex-col items-center rounded-2xl bg-mint py-2 text-center text-mint-fg shadow-gloss">
        <Footprints className="size-4" aria-hidden />
        <span className="font-display text-2xl leading-none">{mins ?? "–"}</span>
        <span className="text-[11px] font-extrabold">min</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-extrabold leading-snug">
            {t.venue.name}
            {t.label ? <span className="block text-sm font-medium text-muted">{t.label}</span> : null}
          </h3>
          <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted group-hover:text-primary" aria-hidden />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <TierBadge tier={t.tier} pending={t.status === "PENDING"} />
          {t.distanceM !== undefined ? <span className="text-muted tabular-nums">{formatDistance(t.distanceM)}</span> : null}
          {t.level ? <span className="text-muted">Level {t.level}</span> : null}
          <span className="inline-flex items-center gap-1">
            <Sparkles className="size-3.5 text-accent" aria-hidden />
            {cleanlinessText(t.scoreCleanliness)}
          </span>
          <OpenNow openNow={t.openNow} />
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          <FeatureChips features={t.features} />
          <StatusChips statuses={t.activeStatus} />
        </div>
        <p className="mt-1.5 text-xs text-muted">{lastVerifiedText(t)}</p>
      </div>
    </Link>
  );
}
