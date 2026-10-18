"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner, Tabs } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type { DataQuality } from "@/lib/api/types";
import { hasRole, useRequireAuth } from "@/lib/auth";
import { formatDate, timeAgo } from "@/lib/format";

type Tab = "flags" | "photos" | "quality" | "imports";

export function AdminClient() {
  const meQ = useRequireAuth();
  const [tab, setTab] = useState<Tab>("flags");
  if (meQ.isLoading || !meQ.data) return <Spinner label="Checking your account" />;
  if (!hasRole(meQ.data, "MODERATOR")) {
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
      <PageHeader title="Moderation" subtitle="Flags, photos and data health." />
      <Tabs
        label="Admin sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "flags", label: "Flags" },
          { value: "photos", label: "Photos" },
          { value: "quality", label: "Data" },
          { value: "imports", label: "Imports" },
        ]}
      />
      <div className="mt-4" role="tabpanel">
        {tab === "flags" ? <Flags /> : tab === "photos" ? <Photos /> : tab === "quality" ? <Quality /> : <Imports />}
      </div>
    </div>
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
