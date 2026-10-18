"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, MapPin, ThumbsDown, ThumbsUp, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LocationNotice } from "@/components/location-search";
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner, buttonClass, cx, inputClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type {
  CloseToiletPayload,
  EditToiletPayload,
  Feature,
  NewToiletPayload,
  SubmissionView,
} from "@/lib/api/types";
import { useRequireAuth } from "@/lib/auth";
import { AREA_TYPE_LABELS, FEATURE_LABELS, VENUE_TYPE_LABELS, formatDistance, timeAgo } from "@/lib/format";
import { roundCoord, useLocation } from "@/lib/location";

const KIND_LABELS: Record<SubmissionView["kind"], string> = {
  NEW_TOILET: "New toilet",
  EDIT_TOILET: "Edit",
  CLOSE_TOILET: "Closure",
  NEW_VENUE: "New place",
};

export function ReviewClient() {
  const meQ = useRequireAuth();
  const loc = useLocation();
  const lat = roundCoord(loc.coords.lat, 3);
  const lng = roundCoord(loc.coords.lng, 3);
  const q = useQuery({
    queryKey: ["queue", lat, lng],
    queryFn: () => api.submissionQueue({ lat, lng, radius: 3000 }),
    enabled: !!meQ.data && loc.settled,
  });

  if (meQ.isLoading || !meQ.data) return <Spinner label="Checking your account" />;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4">
      <PageHeader
        title="Kaypoh queue"
        subtitle={"Check toilets and edits other people submitted within 3 km. Two approvals from people nearby make a toilet live."}
      />
      <div className="mb-3">
        <LocationNotice />
      </div>
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.isLoading || !loc.settled ? (
        <Spinner label="Loading submissions" />
      ) : !q.data?.items.length ? (
        <Card>
          <EmptyState
            title="All clear. Shiok."
            mascot="happy"
            action={
              <>
                <Link href="/add" className={buttonClass("primary", "md")}>
                  Add a toilet
                </Link>
                <Link href="/" className={buttonClass("secondary", "md")}>
                  Back to map
                </Link>
              </>
            }
          >
            <p>
              Nothing is waiting for review within 3&nbsp;km of you right now. Reviewing means checking toilets and edits other people
              have submitted nearby, then approving or rejecting them. Two approvals from people nearby put a new toilet on the map.
            </p>
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {q.data.items.map((s) => (
            <li key={s.id}>
              <SubmissionCard s={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SubmissionCard({ s, readOnly }: { s: SubmissionView; readOnly?: boolean }) {
  const loc = useLocation();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const vote = useMutation({
    mutationFn: (value: "APPROVE" | "REJECT") =>
      api.vote(s.id, {
        value,
        comment: comment.trim() || undefined,
        ...(loc.source === "gps" ? { lat: loc.coords.lat, lng: loc.coords.lng } : {}),
      }),
    onSuccess: (updated) => {
      qc.setQueriesData<{ items: SubmissionView[] }>({ queryKey: ["queue"] }, (old) =>
        old ? { items: old.items.map((x) => (x.id === updated.id ? updated : x)) } : old,
      );
    },
  });
  const current = vote.data ?? s;
  const where = s.toilet ?? (s.kind === "NEW_TOILET" ? (s.payload as NewToiletPayload) : null);
  const title =
    s.toilet?.venueName ??
    s.venue?.name ??
    (s.payload as NewToiletPayload).newVenue?.name ??
    "Unnamed place";

  return (
    <Card className="flex flex-col gap-3" data-testid="submission">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl leading-tight">{title}</h2>
          {s.toilet?.label ? <p className="font-bold text-muted">{s.toilet.label}</p> : null}
          <p className="mt-0.5 text-sm text-muted">
            {KIND_LABELS[s.kind]} · {timeAgo(s.createdAt)} · by {s.submittedBy.handle ? `@${s.submittedBy.handle}` : "someone"}
          </p>
        </div>
        <StateBadge state={current.state} />
      </div>

      {where ? (
        <a
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-primary underline"
          href={`https://www.google.com/maps/search/?api=1&query=${where.lat},${where.lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MapPin className="size-4" aria-hidden />
          {s.distanceM !== undefined ? `${formatDistance(s.distanceM)} from you` : "See location"}
        </a>
      ) : null}

      {s.photos.length ? (
        <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {s.photos.map((p) => (
            <li key={p.id} className="shrink-0">
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl ?? p.url} alt="Submitted photo" className="h-32 w-44 rounded-2xl border border-border/70 object-cover" loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <PayloadView s={s} />

      <p className="text-sm font-bold text-muted tabular-nums">
        {current.approvals} approve · {current.rejections} reject
      </p>

      {!readOnly && current.canVote && !current.myVote ? (
        <div className="flex flex-col gap-2 border-t border-border/70 pt-3">
          <label htmlFor={`c-${s.id}`} className="text-sm font-extrabold">
            Comment (optional)
          </label>
          <input
            id={`c-${s.id}`}
            className={inputClass}
            maxLength={500}
            placeholder="E.g. confirmed, it's beside the lift"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              loading={vote.isPending && vote.variables === "APPROVE"}
              onClick={() => vote.mutate("APPROVE")}
            >
              <ThumbsUp className="size-5" aria-hidden /> Approve
            </Button>
            <Button
              size="lg"
              variant="secondary"
              loading={vote.isPending && vote.variables === "REJECT"}
              onClick={() => vote.mutate("REJECT")}
            >
              <ThumbsDown className="size-5 text-danger" aria-hidden /> Reject
            </Button>
          </div>
          {loc.source !== "gps" ? (
            <p className="text-xs text-muted">Votes count more when we can see you&apos;re within 150 m. Turn on location.</p>
          ) : null}
        </div>
      ) : current.myVote ? (
        <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-ok-soft px-3 py-1.5 font-bold text-ok">
          <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden />
          You voted {current.myVote === "APPROVE" ? "approve" : "reject"}. Thanks!
        </p>
      ) : null}
      {vote.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(vote.error)}
        </p>
      ) : null}
      {current.resolution ? <p className="text-sm text-muted">Resolution: {current.resolution}</p> : null}
    </Card>
  );
}

function StateBadge({ state }: { state: SubmissionView["state"] }) {
  const map: Record<SubmissionView["state"], string> = {
    // Dashed warn is the pending treatment (The Honest Pin Rule); nothing else is dashed.
    PENDING: "border-dashed border-warn text-warn",
    NEEDS_INFO: "border-transparent bg-warn-soft text-warn",
    APPROVED: "border-transparent bg-ok-soft text-ok",
    REJECTED: "border-transparent bg-danger-soft text-danger",
    EXPIRED: "border-transparent bg-surface-2 text-muted",
  };
  const label: Record<SubmissionView["state"], string> = {
    PENDING: "Pending review",
    NEEDS_INFO: "Needs info",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    EXPIRED: "Expired",
  };
  return <span className={cx("shrink-0 rounded-full border-2 px-2.5 py-0.5 text-xs font-extrabold", map[state])}>{label[state]}</span>;
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
            v ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger",
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

function PayloadView({ s }: { s: SubmissionView }) {
  if (s.kind === "NEW_TOILET" || s.kind === "NEW_VENUE") {
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
      </dl>
    );
  }
  if (s.kind === "EDIT_TOILET") {
    const p = s.payload as EditToiletPayload;
    const c = p.changes ?? {};
    const rows: [string, string | undefined][] = [
      ["Label", c.label],
      ["Level", c.level],
      ["Fare gates", c.areaType ? AREA_TYPE_LABELS[c.areaType] : undefined],
      ["Access", c.accessNote],
    ];
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-extrabold">Proposed changes</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {rows
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd>
                  <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-1.5 text-fg">
                    <ArrowRight className="size-3.5 text-ok" aria-hidden />
                    <span className="sr-only">Change to </span>
                    {v}
                  </span>
                </dd>
              </div>
            ))}
          {c.features ? (
            <>
              <dt className="text-muted">Features</dt>
              <dd>
                <FeatureList features={c.features} />
              </dd>
            </>
          ) : null}
        </dl>
        {p.note ? <p className="text-muted">&ldquo;{p.note}&rdquo;</p> : null}
      </div>
    );
  }
  const p = s.payload as CloseToiletPayload;
  return (
    <p className="text-sm">
      Mark as <strong className="font-extrabold">{p.status === "CLOSED" ? "closed" : "under renovation"}</strong>: {p.reason}
    </p>
  );
}
