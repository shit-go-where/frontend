"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageCircleQuestion, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  KIND_LABELS,
  PayloadView,
  PhotoStrip,
  ReviewerNotes,
  StateBadge,
  progressText,
  submissionTitle,
} from "@/app/review/submission-bits";
import { Button, Card, Chip, EmptyState, ErrorState, PageHeader, Spinner, Tabs, inputClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type { DataQuality, ModeratorSubmission, ResolveSubmissionBody } from "@/lib/api/types";
import { hasRole, useRequireAuth } from "@/lib/auth";
import { formatDate, formatDistance, plural, timeAgo } from "@/lib/format";

type Tab = "queue" | "flags" | "photos" | "quality" | "imports";

export function AdminClient() {
  const meQ = useRequireAuth();
  const [tab, setTab] = useState<Tab>("queue");
  const isMod = hasRole(meQ.data, "MODERATOR");
  // Fetched here as well as in the tab so the tab label can carry the count. Same key, one request.
  const subs = useQuery({ queryKey: ["admin-subs", "all"], queryFn: () => api.adminSubmissions("all"), enabled: isMod });
  if (meQ.isLoading || !meQ.data) return <Spinner label="Checking your account" />;
  if (!isMod) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <EmptyState title="Moderators only" mascot="lost">
          This area is for the moderation team.{" "}
          <Link href="/" className="font-bold text-primary underline">
            Back to the map
          </Link>
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4">
      <PageHeader title="Moderation" subtitle="Submissions, flags, photos and data health." />
      {/* Five tabs at phone width: short labels, and the queue's count in the label (Tabs takes text only). */}
      <Tabs
        label="Admin sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "queue", label: subs.data?.items.length ? `Queue (${subs.data.items.length})` : "Queue" },
          { value: "flags", label: "Flags" },
          { value: "photos", label: "Photos" },
          { value: "quality", label: "Data" },
          { value: "imports", label: "Imports" },
        ]}
      />
      <div className="mt-4" role="tabpanel">
        {tab === "queue" ? (
          <Submissions />
        ) : tab === "flags" ? (
          <Flags />
        ) : tab === "photos" ? (
          <Photos />
        ) : tab === "quality" ? (
          <Quality />
        ) : (
          <Imports />
        )}
      </div>
    </div>
  );
}

type QueueFilter = "all" | "escalated" | "pending" | "needs_info";
const QUEUE_FILTERS: { value: QueueFilter; label: string }[] = [
  { value: "all", label: "All open" },
  { value: "escalated", label: "With a moderator" },
  { value: "pending", label: "Pending" },
  { value: "needs_info", label: "Needs info" },
];

/** Island-wide: everything still open, escalated first (the API's order), then oldest. */
function Submissions() {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const q = useQuery({ queryKey: ["admin-subs", filter], queryFn: () => api.adminSubmissions(filter) });
  return (
    <div className="flex flex-col gap-3">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Show">
        {QUEUE_FILTERS.map((f) => (
          <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Spinner />
      ) : !q.data?.items.length ? (
        <EmptyState title="Queue empty. Shiok." mascot="happy">
          Nothing is waiting for a moderator right now.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.items.map((s) => (
            <li key={s.id}>
              <ModCard s={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModCard({ s }: { s: ModeratorSubmission }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const resolve = useMutation({
    mutationFn: (state: ResolveSubmissionBody["state"]) => api.resolveSubmission(s.id, { state, note: note.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-subs"] });
      void qc.invalidateQueries({ queryKey: ["admin-quality"] });
    },
  });
  const title = submissionTitle(s);
  const progress = progressText(s);
  const where =
    s.submitterDistanceM === null
      ? "Sent without a location"
      : s.onSite
        ? `Sent on site (${formatDistance(s.submitterDistanceM)} away)`
        : `Sent from ${formatDistance(s.submitterDistanceM)} away`;
  const busy = resolve.isPending ? resolve.variables : null;

  return (
    <Card className="flex flex-col gap-3" data-testid="mod-submission">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl leading-tight">
            {s.toilet ? (
              <Link href={`/toilets/${encodeURIComponent(s.toilet.id)}`} className="underline decoration-primary/50 underline-offset-4 hover:decoration-primary">
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
          {s.toilet?.label ? <p className="font-bold text-muted">{s.toilet.label}</p> : null}
          <p className="mt-0.5 text-sm text-muted tabular-nums">
            {KIND_LABELS[s.kind]} · {s.ageDays === 0 ? "today" : `${plural(s.ageDays, "day")} old`} · by{" "}
            {s.submittedBy.handle ? `@${s.submittedBy.handle}` : "someone"}
          </p>
        </div>
        <StateBadge state={s.state} />
      </div>
      {s.escalated && s.resolutionText ? <p className="text-sm font-bold">{s.resolutionText}</p> : null}
      <p className="text-sm text-muted tabular-nums">
        {where} · {s.hasPhoto ? "has a photo" : "no photo"} · {plural(s.nearbyApprovals, "nearby approval")}
        {s.approvals > s.nearbyApprovals ? ` (${s.approvals} in all)` : ""} · {plural(s.rejections, "rejection")}
        {progress ? ` · ${progress}` : ""}
      </p>
      <PhotoStrip s={s} />
      <PayloadView s={s} />
      <ReviewerNotes notes={s.reviewerNotes} />
      <div className="flex flex-col gap-2 border-t border-border/70 pt-3">
        <label htmlFor={`note-${s.id}`} className="text-sm font-extrabold">
          Note to the submitter (optional)
        </label>
        <input
          id={`note-${s.id}`}
          className={inputClass}
          maxLength={500}
          placeholder="E.g. which level is it on?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="lg" loading={busy === "APPROVED"} disabled={resolve.isPending} onClick={() => resolve.mutate("APPROVED")}>
          <ThumbsUp className="size-5" aria-hidden /> Approve
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" loading={busy === "NEEDS_INFO"} disabled={resolve.isPending} onClick={() => resolve.mutate("NEEDS_INFO")}>
            <MessageCircleQuestion className="size-5" aria-hidden /> Needs info
          </Button>
          <Button variant="danger" loading={busy === "REJECTED"} disabled={resolve.isPending} onClick={() => resolve.mutate("REJECTED")}>
            <ThumbsDown className="size-5" aria-hidden /> Reject
          </Button>
        </div>
        {resolve.isError ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(resolve.error)}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function Flags() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-flags"], queryFn: api.adminFlags });
  const resolve = useMutation({
    mutationFn: api.resolveFlag,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-flags"] }),
  });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (q.isLoading) return <Spinner />;
  if (!q.data?.items.length) return <EmptyState title="No open flags" mascot="happy">All clear. Shiok.</EmptyState>;
  return (
    <ul className="flex flex-col gap-3">
      {q.data.items.map((f) => (
        <li key={f.id}>
          <Card className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/toilets/${f.toilet.id}`} className="font-extrabold text-primary underline">
                  {f.toilet.venueName}
                  {f.toilet.label ? ` · ${f.toilet.label}` : ""}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  {f.user.handle ? `@${f.user.handle}` : "someone"} · {timeAgo(f.createdAt)}
                </p>
              </div>
              <Button className="shrink-0" loading={resolve.isPending && resolve.variables === f.id} onClick={() => resolve.mutate(f.id)}>
                <Check className="size-4" aria-hidden /> Resolve
              </Button>
            </div>
            <p>{f.reason}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Photos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-photos"], queryFn: api.pendingPhotos });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin-photos"] });
  const approve = useMutation({ mutationFn: api.approvePhoto, onSuccess: refresh });
  const reject = useMutation({ mutationFn: api.rejectPhoto, onSuccess: refresh });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (q.isLoading) return <Spinner />;
  if (!q.data?.items.length) return <EmptyState title="No photos waiting" mascot="happy">Nothing to approve right now.</EmptyState>;
  return (
    <>
      {approve.isError || reject.isError ? (
        <p role="alert" className="mb-2 text-sm text-danger">
          {errorMessage(approve.error ?? reject.error)}
        </p>
      ) : null}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {q.data.items.map((p) => (
          <li key={p.id}>
            <Card className="flex flex-col gap-2 p-2.5">
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbUrl ?? p.url} alt="Pending upload" className="h-48 w-full rounded-2xl object-cover" />
              </a>
              <p className="px-1 text-xs text-muted">
                {timeAgo(p.createdAt)} · {p.approvals} approval{p.approvals === 1 ? "" : "s"}
                {p.toiletId ? (
                  <>
                    {" · "}
                    <Link className="font-bold text-primary underline" href={`/toilets/${p.toiletId}`}>
                      View toilet
                    </Link>
                  </>
                ) : null}
                {p.reviewId ? " · review photo" : p.submissionId ? " · submission photo" : ""}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button loading={approve.isPending && approve.variables === p.id} onClick={() => approve.mutate(p.id)}>
                  <ThumbsUp className="size-4" aria-hidden /> Approve
                </Button>
                <Button
                  variant="danger"
                  loading={reject.isPending && reject.variables === p.id}
                  onClick={() => reject.mutate(p.id)}
                >
                  <ThumbsDown className="size-4" aria-hidden /> Reject
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

const QUALITY_LABELS: Record<keyof DataQuality["counts"], string> = {
  toilets: "Toilets",
  venues: "Venues",
  pending: "Pending submissions",
  escalated: "With a moderator",
  flagsOpen: "Open flags",
  photosPending: "Photos pending",
  noFeatures: "Toilets with no features",
  stale365d: "Not verified in 1 year",
  needsResurvey: "Needs re-survey",
  unknownAreaType: "Unknown fare-gate side",
};

function Quality() {
  const q = useQuery({ queryKey: ["admin-quality"], queryFn: api.dataQuality });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (q.isLoading || !q.data) return <Spinner />;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {(Object.keys(QUALITY_LABELS) as (keyof DataQuality["counts"])[]).map((k) => (
        <Card key={k} className="flex flex-col gap-1 p-4">
          <dt className="text-sm font-bold text-muted">{QUALITY_LABELS[k]}</dt>
          <dd className="font-display text-3xl leading-none">{q.data.counts[k] ?? "–"}</dd>
        </Card>
      ))}
    </dl>
  );
}

function Imports() {
  const q = useQuery({ queryKey: ["admin-imports"], queryFn: api.imports });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (q.isLoading) return <Spinner />;
  if (!q.data?.items.length) return <EmptyState title="No import runs yet" mascot="lost" />;
  return (
    <div className="overflow-x-auto rounded-3xl border border-border/70 bg-surface shadow-rest">
      <table className="w-full min-w-[520px] text-left text-sm">
        <caption className="sr-only">Import runs</caption>
        <thead className="bg-surface-2 text-xs font-extrabold text-muted">
          <tr>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Started</th>
            <th className="px-4 py-3">Finished</th>
            <th className="px-4 py-3 text-right">Inserted</th>
            <th className="px-4 py-3 text-right">Updated</th>
            <th className="px-4 py-3 text-right">Skipped</th>
          </tr>
        </thead>
        <tbody>
          {q.data.items.map((r) => (
            <tr key={r.id} className="border-t border-border/70">
              <td className="px-4 py-3 font-extrabold">{r.source}</td>
              <td className="px-4 py-3">{formatDate(r.startedAt)}</td>
              <td className="px-4 py-3">{r.finishedAt ? formatDate(r.finishedAt) : "running"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.inserted}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.updated}</td>
              <td className="px-4 py-3 text-right tabular-nums">{r.skipped}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
