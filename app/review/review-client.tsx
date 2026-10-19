"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Flag, Footprints, LocateFixed, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LocationNotice } from "@/components/location-search";
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner, buttonClass, cx, inputClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type { Me, SubmissionView } from "@/lib/api/types";
import { useRequireAuth } from "@/lib/auth";
import { formatDistance, googleMapsWalkingUrl, timeAgo } from "@/lib/format";
import { haversineM, roundCoord, useLocation } from "@/lib/location";
import {
  KIND_LABELS,
  NEAR_M,
  PayloadView,
  PhotoStrip,
  StateBadge,
  progressText,
  submissionTitle,
  submissionWhere,
} from "./submission-bits";

export function ReviewClient() {
  const meQ = useRequireAuth();
  const loc = useLocation();
  // `/review?id=<submission>`: the one someone was sent to (a shared link, a pending toilet's page) leads.
  const focusId = useSearchParams().get("id");
  const lat = roundCoord(loc.coords.lat, 3);
  const lng = roundCoord(loc.coords.lng, 3);
  const q = useQuery({
    queryKey: ["queue", lat, lng],
    queryFn: () => api.submissionQueue({ lat, lng, radius: 3000 }),
    enabled: !!meQ.data && loc.settled,
  });
  const focus = useQuery({
    queryKey: ["submission", focusId],
    queryFn: () => api.submission(focusId!),
    enabled: !!meQ.data && !!focusId,
  });

  if (meQ.isLoading || !meQ.data) return <Spinner label="Checking your account" />;
  const me = meQ.data;
  const items = (q.data?.items ?? []).filter((s) => s.id !== focusId);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4">
      <PageHeader
        title="Kaypoh queue"
        subtitle={"Check toilets and edits other people sent within 3 km. Approvals only count from people within 150 m of the toilet."}
      />
      <ReviewLocation />
      {focusId ? (
        <section aria-label="The submission you opened" className="mb-6">
          {focus.isError ? (
            <ErrorState message={errorMessage(focus.error)} onRetry={() => void focus.refetch()} />
          ) : focus.data ? (
            <SubmissionCard s={focus.data} me={me} />
          ) : (
            <Spinner label="Loading the submission" />
          )}
        </section>
      ) : null}
      {focusId && items.length ? <h2 className="mb-3 text-2xl leading-tight">Also near you</h2> : null}
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.isLoading || !loc.settled ? (
        <Spinner label="Loading submissions" />
      ) : !items.length && focusId ? null : !items.length ? (
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
              have sent nearby, then approving or rejecting them. When people nearby approve a new toilet, it goes on the map.
            </p>
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((s) => (
            <li key={s.id}>
              <SubmissionCard s={s} me={me} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Votes only count within 150 m, so the page says where it's measuring from and offers to look, rather than
 * "Search above to change" (there is no search here). An old fix still gets its age from LocationNotice.
 */
function ReviewLocation() {
  const loc = useLocation();
  if (loc.source === "gps") return <LocationNotice className="mb-3" />;
  const denied = loc.status === "denied";
  return (
    <div role="status" className="mb-3 flex flex-col gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-bold text-fg">
      <p>
        {denied ? "Location is off for this site. " : loc.status === "unavailable" ? "We couldn't get your location. " : ""}
        Showing what&apos;s near <strong>{loc.placeName ?? "Raffles Place"}</strong>. Votes only count within 150 m of the toilet,
        so we need to know where you are.
      </p>
      {denied ? (
        <p className="font-medium">To turn it on, allow location for this site in your browser&apos;s settings, then reload.</p>
      ) : (
        <Button size="sm" className="self-start" loading={loc.status === "locating"} onClick={() => void loc.locate()}>
          <LocateFixed className="size-4" aria-hidden /> Use my location
        </Button>
      )}
    </div>
  );
}

/** Where "Walk there" goes: our route screen for live toilets, Google Maps for pending ones (we never route to those). */
function walkHref(s: SubmissionView, where: { lat: number; lng: number }) {
  return s.kind !== "NEW_TOILET" && s.toilet ? `/go?to=${encodeURIComponent(s.toilet.id)}` : googleMapsWalkingUrl(null, where);
}

/**
 * One submission, for someone deciding on it. Approve is offered only where it counts: within 150 m by a GPS
 * fix, or for trusted reviewers (whose approval counts from anywhere). From farther away the card offers the
 * walk instead, plus a way to say something's wrong: rejections aren't distance-checked by the API and two of
 * them only send it back to the submitter for more detail, so a remote reviewer who spots a duplicate or a
 * photo that isn't a toilet can still help. That path asks for a reason, which the submitter sees.
 */
function SubmissionCard({ s, me }: { s: SubmissionView; me: Me }) {
  const loc = useLocation();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [reporting, setReporting] = useState(false);
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
      qc.setQueryData(["submission", updated.id], updated);
    },
  });
  const current = vote.data ?? s;
  const where = submissionWhere(s);
  // Measured on the phone from the live fix: the queue's own distance is from a rounded point (about 100 m out).
  const awayM = where && loc.source === "gps" ? haversineM(loc.coords, where) : null;
  const near = awayM !== null && awayM <= NEAR_M;
  const trusted = me.trust.isTrusted;
  const canApprove = near || trusted;
  const progress = progressText(current);
  const title = submissionTitle(s);
  const reasonOk = comment.trim().length >= 3;

  return (
    <Card className="flex flex-col gap-3" data-testid="submission">
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
          <p className="mt-0.5 text-sm text-muted">
            {KIND_LABELS[s.kind]} · {timeAgo(s.createdAt)} · by {s.submittedBy.handle ? `@${s.submittedBy.handle}` : "someone"}
          </p>
        </div>
        <StateBadge state={current.state} />
      </div>

      {awayM !== null ? (
        <p className={cx("text-sm font-bold", near ? "text-mint" : "text-fg")}>
          {near
            ? `You're ${awayM < 15 ? "right at it" : `${formatDistance(awayM)} away`}, close enough to vote.`
            : `You're ${formatDistance(awayM)} away. Your vote only counts within 150 m.`}
        </p>
      ) : (
        <p className="text-sm font-bold">We don&apos;t know how far away you are. Votes only count within 150 m.</p>
      )}

      <PhotoStrip s={s} />
      <PayloadView s={s} />

      {progress || current.escalated ? (
        <p className="text-sm font-bold text-muted tabular-nums">
          {progress ?? "A moderator is reviewing it."}
          {current.rejections > 0 ? ` · ${current.rejections} said something's off` : ""}
        </p>
      ) : null}

      {current.canVote && !current.myVote ? (
        <div className="flex flex-col gap-2 border-t border-border/70 pt-3">
          {canApprove ? (
            <>
              <p className="text-sm font-bold">
                {near
                  ? "Approve only if you can see this toilet from where you are."
                  : "As a trusted reviewer, your approval counts from anywhere. Approve only if you're sure it's there, for example from the photos."}
              </p>
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
                <Button size="lg" loading={vote.isPending && vote.variables === "APPROVE"} onClick={() => vote.mutate("APPROVE")}>
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
            </>
          ) : (
            <>
              {where ? (
                s.kind !== "NEW_TOILET" && s.toilet ? (
                  <Link href={walkHref(s, where)} transitionTypes={["push"]} className={buttonClass("primary", "lg", "w-full")}>
                    <Footprints className="size-5" aria-hidden /> Walk there
                  </Link>
                ) : (
                  <a href={walkHref(s, where)} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "lg", "w-full")}>
                    <Footprints className="size-5" aria-hidden /> Walk there
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                )
              ) : null}
              {reporting ? (
                <>
                  <label htmlFor={`c-${s.id}`} className="text-sm font-extrabold">
                    What&apos;s wrong with it?
                  </label>
                  <input
                    id={`c-${s.id}`}
                    className={inputClass}
                    maxLength={500}
                    placeholder="E.g. this is the same toilet as the one on L2, or the photo isn't a toilet"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    aria-describedby={`c-${s.id}-hint`}
                  />
                  <p id={`c-${s.id}-hint`} className="text-sm text-muted">
                    The person who sent it sees your reason (not your name). Two of these send it back to them for more detail.
                  </p>
                  <Button
                    variant="secondary"
                    disabled={!reasonOk}
                    loading={vote.isPending && vote.variables === "REJECT"}
                    onClick={() => vote.mutate("REJECT")}
                  >
                    <ThumbsDown className="size-5 text-danger" aria-hidden /> Send
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" className="self-start" onClick={() => setReporting(true)}>
                  <Flag className="size-4" aria-hidden /> Something&apos;s wrong with it
                </Button>
              )}
            </>
          )}
        </div>
      ) : current.myVote ? (
        <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-mint-soft px-3 py-1.5 font-bold text-mint">
          <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden />
          You voted {current.myVote === "APPROVE" ? "approve" : "reject"}. Thanks!
        </p>
      ) : null}
      {vote.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(vote.error)}
        </p>
      ) : null}
      {current.resolutionText ? <p className="text-sm text-muted">{current.resolutionText}</p> : null}
    </Card>
  );
}
