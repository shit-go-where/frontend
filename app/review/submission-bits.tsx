"use client";

import { ArrowRight, Check, MapPinCheck, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type {
  AreaType,
  CloseToiletPayload,
  EditToiletPayload,
  Feature,
  NewToiletPayload,
  ReviewerNote,
  SubmissionView,
} from "@/lib/api/types";
import { AREA_TYPE_LABELS, FEATURE_LABELS, VENUE_TYPE_LABELS, formatDate, timeAgo } from "@/lib/format";
import type { LatLng } from "@/lib/location";
import { hoursText } from "@/lib/opening-hours";
import { cx } from "@/components/ui";

// ---------------------------------------------------------------------------
// Pieces shared by the three places a submission shows up: /review (people nearby),
// /me (the submitter) and /admin (moderators). Each says the same thing the same way.
// ---------------------------------------------------------------------------

export const KIND_LABELS: Record<SubmissionView["kind"], string> = {
  NEW_TOILET: "New toilet",
  EDIT_TOILET: "Edit",
  CLOSE_TOILET: "Closure",
};

/** Votes and check-ins only count within this distance of the toilet (the API's rule). */
export const NEAR_M = 150;

export function submissionTitle(s: SubmissionView): string {
  return s.toilet?.venueName ?? s.venue?.name ?? (s.payload as NewToiletPayload).newVenue?.name ?? "Unnamed place";
}

/** Where the toilet is: the toilet itself, else (older rows) the pin in the payload. */
export function submissionWhere(s: SubmissionView): LatLng | null {
  if (s.toilet) return { lat: s.toilet.lat, lng: s.toilet.lng };
  if (s.kind === "NEW_TOILET") {
    const p = s.payload as NewToiletPayload;
    return { lat: p.lat, lng: p.lng };
  }
  return null;
}

/** Still open: someone can still decide it. ESCALATED is open too (a moderator, or a nearby check-in). */
export function isOpen(s: SubmissionView) {
  return s.state === "PENDING" || s.state === "NEEDS_INFO" || s.state === "ESCALATED";
}

/**
 * How far along a pending one is, in plain English, or null when people nearby can't move it
 * (decided, or only a moderator can decide now).
 */
export function progressText(s: SubmissionView): string | null {
  if (!isOpen(s) || s.needed <= 0) return null;
  if (s.kind === "NEW_TOILET" && s.path === "on_site_check_in") {
    return `Waiting for ${s.needed} more ${s.needed === 1 ? "person" : "people"} to check in there`;
  }
  return `${s.nearbyApprovals} of ${s.nearbyApprovals + s.needed} nearby approvals`;
}

export function StateBadge({ state }: { state: SubmissionView["state"] }) {
  const map: Record<SubmissionView["state"], string> = {
    // Dashed warn is the pending treatment (The Honest Pin Rule); nothing else is dashed. An escalated
    // one is still pending (its toilet stays unconfirmed), just with a moderator now.
    PENDING: "border-dashed border-warn text-warn",
    ESCALATED: "border-dashed border-warn text-warn",
    NEEDS_INFO: "border-transparent bg-warn-soft text-warn",
    APPROVED: "border-transparent bg-mint-soft text-mint",
    REJECTED: "border-transparent bg-danger-soft text-danger",
    EXPIRED: "border-transparent bg-surface-2 text-muted",
  };
  const label: Record<SubmissionView["state"], string> = {
    PENDING: "Pending review",
    ESCALATED: "With a moderator",
    NEEDS_INFO: "Needs info",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    EXPIRED: "Expired",
  };
  return <span className={cx("shrink-0 rounded-full border-2 px-2.5 py-0.5 text-xs font-extrabold", map[state])}>{label[state]}</span>;
}

export function PhotoStrip({ s }: { s: SubmissionView }) {
  if (!s.photos.length) return null;
  return (
    <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {s.photos.map((p, i) => (
        <li key={p.id} className="shrink-0">
          <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open submitted photo ${i + 1} of ${s.photos.length}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumbUrl ?? p.url} alt="" className="h-32 w-44 rounded-2xl border border-border/70 object-cover" loading="lazy" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function FeatureList({ features }: { features: Partial<Record<Feature, boolean>> }) {
  const entries = Object.entries(features) as [Feature, boolean][];
  if (!entries.length) return <span className="text-muted">none given</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([f, v]) => (
        <span
          key={f}
          className={cx(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
            v ? "bg-mint-soft text-mint" : "bg-danger-soft text-danger",
          )}
        >
          {v ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
          {FEATURE_LABELS[f]}
          <span className="sr-only">{v ? " (has)" : " (does not have)"}</span>
        </span>
      ))}
    </span>
  );
}

/** "Before → after" for one changed fact. `before` undefined means we don't know the listing's value (decided edits). */
function Change({ before, after }: { before: string | undefined; after: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {before !== undefined ? (
        <>
          <span className="text-muted">{before}</span>
          <ArrowRight className="size-3.5 shrink-0 text-mint" aria-hidden />
          <span className="sr-only"> changes to </span>
        </>
      ) : (
        <span className="sr-only">Change to </span>
      )}
      <span className="rounded-md bg-mint-soft px-1.5 font-bold text-fg">{after}</span>
    </span>
  );
}

const NOT_RECORDED = "Not recorded";
const yesNo = (v: boolean | null | undefined) => (v === true ? "Yes" : v === false ? "No" : "Not known");
const areaLabel = (a: AreaType | undefined) => (a ? AREA_TYPE_LABELS[a] : NOT_RECORDED);

function EditView({ s }: { s: SubmissionView }) {
  const p = s.payload as EditToiletPayload;
  const c = p.changes ?? {};
  // `current` is the listing now, for open edits only. Anything already matching it isn't a change, so it's left out.
  const cur = s.current;
  const text = (v: string | null | undefined) => (v ? v : NOT_RECORDED);
  const rows: { key: string; label: string; before: string | undefined; after: string; same: boolean }[] = [];
  if (c.label !== undefined)
    rows.push({ key: "label", label: "Label", before: cur ? text(cur.label) : undefined, after: c.label, same: cur?.label === c.label });
  if (c.level !== undefined)
    rows.push({ key: "level", label: "Level", before: cur ? text(cur.level) : undefined, after: c.level, same: cur?.level === c.level });
  if (c.areaType !== undefined)
    rows.push({
      key: "areaType",
      label: "Fare gates",
      before: cur ? areaLabel(cur.areaType) : undefined,
      after: AREA_TYPE_LABELS[c.areaType],
      same: cur?.areaType === c.areaType,
    });
  if (c.nearestExit !== undefined)
    rows.push({
      key: "nearestExit",
      label: "Exit",
      before: cur ? text(cur.nearestExit) : undefined,
      after: c.nearestExit,
      same: cur?.nearestExit === c.nearestExit,
    });
  if (c.openingHours !== undefined)
    rows.push({
      key: "openingHours",
      label: "Hours",
      before: cur ? (hoursText(cur.openingHours ?? null) ?? NOT_RECORDED) : undefined,
      after: hoursText(c.openingHours) ?? "",
      same: !!cur && JSON.stringify(cur.openingHours) === JSON.stringify(c.openingHours),
    });
  if (c.accessNote !== undefined)
    rows.push({
      key: "accessNote",
      label: "Access",
      before: cur ? text(cur.accessNote) : undefined,
      after: c.accessNote,
      same: cur?.accessNote === c.accessNote,
    });
  const features = (Object.entries(c.features ?? {}) as [Feature, boolean][]).filter(
    ([f, v]) => !cur?.features || cur.features[f] !== v,
  );
  const shown = rows.filter((r) => !r.same);

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="font-extrabold">Proposed changes</p>
      {shown.length || features.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          {shown.map((r) => (
            <div key={r.key} className="contents">
              <dt className="text-muted">{r.label}</dt>
              <dd>
                <Change before={r.before} after={r.after} />
              </dd>
            </div>
          ))}
          {features.map(([f, v]) => (
            <div key={f} className="contents">
              <dt className="text-muted">{FEATURE_LABELS[f]}</dt>
              <dd>
                <Change before={cur?.features ? yesNo(cur.features[f]) : undefined} after={yesNo(v)} />
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted">Everything here already matches the listing.</p>
      )}
      {p.note ? <p className="text-muted">&ldquo;{p.note}&rdquo;</p> : null}
    </div>
  );
}

export function PayloadView({ s }: { s: SubmissionView }) {
  if (s.kind === "NEW_TOILET") {
    const p = s.payload as NewToiletPayload;
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {p.newVenue ? (
          <>
            <dt className="text-muted">New place</dt>
            <dd>
              {p.newVenue.name} ({VENUE_TYPE_LABELS[p.newVenue.type]})
            </dd>
          </>
        ) : null}
        {p.label ? (
          <>
            <dt className="text-muted">Label</dt>
            <dd>{p.label}</dd>
          </>
        ) : null}
        {p.level ? (
          <>
            <dt className="text-muted">Level</dt>
            <dd>{p.level}</dd>
          </>
        ) : null}
        {p.areaType ? (
          <>
            <dt className="text-muted">Fare gates</dt>
            <dd>{AREA_TYPE_LABELS[p.areaType]}</dd>
          </>
        ) : null}
        {p.accessNote ? (
          <>
            <dt className="text-muted">Access</dt>
            <dd>{p.accessNote}</dd>
          </>
        ) : null}
        <dt className="text-muted">Features</dt>
        <dd>
          <FeatureList features={p.features ?? {}} />
        </dd>
        {p.note ? (
          <>
            <dt className="text-muted">Note</dt>
            <dd>&ldquo;{p.note}&rdquo;</dd>
          </>
        ) : null}
      </dl>
    );
  }
  if (s.kind === "EDIT_TOILET") return <EditView s={s} />;
  const p = s.payload as CloseToiletPayload;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        Mark as <strong className="font-extrabold">{p.status === "CLOSED" ? "closed" : "under renovation"}</strong>: {p.reason}
      </p>
      {p.note ? <p className="text-muted">&ldquo;{p.note}&rdquo;</p> : null}
    </div>
  );
}

/** Every vote, newest first, with no names: what reviewers said and whether they were there. */
export function ReviewerNotes({ notes, className }: { notes: ReviewerNote[]; className?: string }) {
  if (!notes.length) return null;
  return (
    <ul className={cx("flex flex-col gap-1.5 text-sm", className)} aria-label="What reviewers said">
      {notes.map((n, i) => {
        const approve = n.value === "APPROVE";
        const who = n.viaCheckIn
          ? "Someone checked in there"
          : `Someone ${n.nearby ? "nearby" : "farther away"} ${approve ? "approved" : "said something's off"}`;
        return (
          <li key={`${n.createdAt}-${i}`} className="flex items-start gap-2">
            {n.viaCheckIn ? (
              <MapPinCheck className="mt-0.5 size-4 shrink-0 text-mint" aria-hidden />
            ) : approve ? (
              <ThumbsUp className="mt-0.5 size-4 shrink-0 text-mint" aria-hidden />
            ) : (
              <ThumbsDown className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="font-bold">{who}</span>
              <span className="text-muted"> · {timeAgo(n.createdAt)}</span>
              {n.note ? <span className="block [overflow-wrap:anywhere]">&ldquo;{n.note}&rdquo;</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "Live straight away…", "Waiting for 1 more person…", "A moderator is taking a look": what the submitter needs to know. */
export function submitterSentence(s: SubmissionView): string {
  switch (s.state) {
    case "APPROVED":
      return s.resolutionText ?? "Approved.";
    case "REJECTED":
      return s.resolutionText ?? "Rejected.";
    case "EXPIRED":
      return s.resolutionText ?? "Expired before anyone confirmed it.";
    case "ESCALATED":
      return "A moderator is taking a look.";
    case "NEEDS_INFO":
      return s.resolutionText ?? "Reviewers asked for more detail. Add it below and it goes back for review.";
    case "PENDING": {
      const progress = progressText(s);
      if (progress) return `${progress}.`;
      return "Waiting for a moderator or trusted reviewer to confirm it.";
    }
  }
}

/** When an open one goes to the moderators if nobody nearby decides it first. */
export function expiryText(s: SubmissionView): string | null {
  if (s.state !== "PENDING" && s.state !== "NEEDS_INFO") return null;
  return `If nobody nearby confirms it by ${formatDate(s.expiresAt)}, a moderator will review it.`;
}
