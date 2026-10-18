"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Award,
  Check,
  Flag,
  LoaderCircle,
  MapPinCheck,
  MessageSquarePlus,
  PencilLine,
  Share2,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import { PhotoPicker } from "@/components/photo-picker";
import { Button, Dialog, ErrorState, StarInput, Stars, cx, inputClass } from "@/components/ui";
import { api, errorMessage, isApiError } from "@/lib/api/client";
import { STATUS_KINDS, type CheckInResult, type PhotoRef, type Review, type StatusKind, type ToiletDetail } from "@/lib/api/types";
import { BAD_STATUS, STATUS_LABELS, formatDate, timeAgo } from "@/lib/format";
import { useGuard, useMe } from "@/lib/auth";
import { getCurrentPosition } from "@/lib/location";
import { FactsThanks, useFactsForm, type FactsOutcome } from "./facts-form";

// ---------------------------------------------------------------------------
// Check-in → points / badges → "what's inside?" form (facts-form.tsx)
// ---------------------------------------------------------------------------

/** The "Been here?" tiles: icon over label, three to a row on a phone. */
const TILE =
  "flex min-h-[4.5rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-3xl border-2 px-2 py-2 text-sm font-extrabold text-fg shadow-rest transition hover:brightness-110 active:translate-y-px";

/**
 * Check-in is the contribution loop, so its tile gets the pink outline on a soft pink fill and
 * leads the "Been here?" row. It is also the only way into the "What's inside?" form: someone
 * who checked in within the cooldown still gets there, without points. Arriving from the route
 * screen with `?checkin=1` opens it once, then strips the param so refresh/back don't repeat.
 */
export function CheckInButton({ toilet, className }: { toilet: ToiletDetail; className?: string }) {
  const guard = useGuard();
  const qc = useQueryClient();
  const { isSuccess: meReady, data: me } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const wantsCheckIn = useSearchParams().get("checkin") === "1";
  const autoStarted = useRef(false);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"locating" | "result" | "recent" | "verify" | "done" | "error">("locating");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<FactsOutcome>("verified");
  const facts = useFactsForm({
    toilet,
    lead: result?.verifyPrompt,
    coords,
    checkedIn: true,
    onDone: (o) => {
      setOutcome(o);
      setStage("done");
    },
  });

  async function start() {
    setOpen(true);
    setStage("locating");
    setError(null);
    setResult(null);
    facts.reset();
    try {
      const pos = await getCurrentPosition(15000);
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(c);
      const r = await api.checkIn(toilet.id, c);
      setResult(r);
      setStage("result");
      void qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      const code = (e as GeolocationPositionError)?.code;
      if (code === 1) setError("We need your location to check in. Turn on location for this site and try again.");
      else if (code === 2 || code === 3) setError("Couldn't get a GPS fix. Step outside or near a window and try again.");
      else if (isApiError(e) && e.status === 400)
        setError(`${e.message || "You're too far away."} Check-ins only count within 150 m of the toilet.`);
      else if (isApiError(e) && e.status === 429) {
        // Still within 150 m (the check-in passed its distance check first), so the form stays open to them.
        setStage("recent");
        return;
      } else setError(errorMessage(e));
      setStage("error");
    }
  }

  const autoStart = useEffectEvent(() => {
    autoStarted.current = true;
    // Signed out: guard sends them to /login and back here with the param intact.
    if (me) router.replace(pathname, { scroll: false });
    guard(() => void start());
  });
  useEffect(() => {
    if (wantsCheckIn && meReady && !autoStarted.current) autoStart();
  }, [wantsCheckIn, meReady]);

  return (
    <>
      <button
        type="button"
        onClick={() => guard(() => void start())}
        className={cx(TILE, "border-primary bg-primary-soft", className)}
      >
        <MapPinCheck className="size-6 text-primary" aria-hidden /> Check in
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={stage === "verify" || stage === "done" ? "What's inside?" : "Check in"}
        footer={stage === "verify" ? facts.footer : undefined}
      >
        {stage === "locating" ? (
          <p role="status" className="flex items-center gap-2 py-2 font-bold">
            <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden /> Checking where you are…
          </p>
        ) : null}
        {stage === "error" && error ? <ErrorState message={error} onRetry={() => void start()} /> : null}
        {stage === "recent" ? (
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <Mascot mood="happy" className="size-20" />
            <h3 className="font-display text-2xl leading-tight">Already checked in</h3>
            <p className="font-medium text-muted">
              You checked in here in the last 2 hours, so no points this time. Spotted something new? You can still update
              what&apos;s inside.
            </p>
            <Button size="lg" className="w-full" onClick={() => setStage("verify")}>
              Update what&apos;s inside
            </Button>
          </div>
        ) : null}
        {stage === "result" && result ? (
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <Mascot mood="celebrating" className="celebrate-in size-24" />
            <h3 className="font-display text-2xl leading-tight">Shiok! Checked in</h3>
            <p className="text-lg font-bold">
              {result.pointsAwarded > 0 ? (
                <>
                  <strong className="font-display text-3xl text-mint">+{result.pointsAwarded}</strong> point
                  {result.pointsAwarded === 1 ? "" : "s"}
                </>
              ) : (
                "No points this time (daily cap reached), but thanks!"
              )}
            </p>
            {result.newBadges.length ? (
              <ul className="flex flex-col gap-2">
                {result.newBadges.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 font-extrabold text-accent-fg shadow-gloss"
                  >
                    <Award className="size-5" aria-hidden /> New badge: {b.name}
                  </li>
                ))}
              </ul>
            ) : null}
            {result.verifyPrompt.length ? (
              <Button size="lg" className="w-full" onClick={() => setStage("verify")}>
                Quick check: what&apos;s inside?
              </Button>
            ) : (
              <Button size="lg" className="w-full" onClick={() => setOpen(false)}>
                Done
              </Button>
            )}
          </div>
        ) : null}
        {stage === "verify" ? facts.fields : null}
        {stage === "done" ? <FactsThanks outcome={outcome} onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

export function ShareButton({ toilet, className }: { toilet: ToiletDetail; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${window.location.origin}/toilets/${toilet.id}`;
    const title = `${toilet.venue.name}${toilet.label ? ` (${toilet.label})` : ""}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Toilet at ${title} on Shit Go Where`, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => void share()}
        aria-label={copied ? "Link copied" : "Share this toilet"}
        className={cx(
          "inline-flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-border bg-surface text-fg shadow-rest transition hover:brightness-110 active:translate-y-px",
          className,
        )}
      >
        {copied ? <Check className="size-6 text-mint" aria-hidden /> : <Share2 className="size-6" aria-hidden />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Flag
// ---------------------------------------------------------------------------

const FLAG_COPY = {
  flag: {
    title: "Flag this listing",
    label: "What's wrong?",
    placeholder: "E.g. this toilet was removed, it's actually on L2, wrong station…",
    thanks: "Thanks! A moderator will take a look.",
  },
  edit: {
    title: "Suggest an edit",
    label: "What should we add or fix?",
    placeholder: "E.g. it's on B1 near Exit A, step-free from the lift, inside the fare gates…",
    thanks: "Thanks! A moderator will update the listing.",
  },
} as const;

function FlagDialog({
  toilet,
  mode,
  open,
  onClose,
}: {
  toilet: ToiletDetail;
  mode: keyof typeof FLAG_COPY;
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const m = useMutation({ mutationFn: () => api.flagToilet(toilet.id, reason.trim()) });
  const copy = FLAG_COPY[mode];
  const close = () => {
    if (m.isSuccess) setReason("");
    m.reset();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={copy.title}
      footer={
        m.isSuccess ? (
          <Button className="w-full" onClick={close}>
            Close
          </Button>
        ) : (
          <Button className="w-full" loading={m.isPending} disabled={reason.trim().length < 3} onClick={() => m.mutate()}>
            Send to moderators
          </Button>
        )
      }
    >
      {m.isSuccess ? (
        <p role="status" className="font-bold">
          {copy.thanks}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={`flag-reason-${mode}`} className="font-bold">
            {copy.label}
          </label>
          <textarea
            id={`flag-reason-${mode}`}
            rows={4}
            minLength={3}
            maxLength={500}
            className={inputClass}
            placeholder={copy.placeholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {m.isError ? (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(m.error)}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

export function FlagButton({ toilet }: { toilet: ToiletDetail }) {
  const guard = useGuard();
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Same shape as "… not known yet. Suggest an edit": a plain question, then a link-styled action. */}
      <p className="flex flex-wrap items-center gap-x-2">
        <span>Something wrong with this listing?</span>
        <button
          type="button"
          onClick={() => guard(() => setOpen(true))}
          className="inline-flex min-h-11 items-center gap-1.5 font-bold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary"
        >
          <Flag className="size-4" aria-hidden /> Report it
        </button>
      </p>
      <FlagDialog toilet={toilet} mode="flag" open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Inline "Suggest an edit" for facts we don't know yet. Sends a flag the moderators act on. */
export function SuggestEditButton({ toilet, className }: { toilet: ToiletDetail; className?: string }) {
  const guard = useGuard();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => guard(() => setOpen(true))}
        className={cx(
          "inline-flex min-h-11 items-center gap-1.5 font-bold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary",
          className,
        )}
      >
        <PencilLine className="size-4" aria-hidden /> Suggest an edit
      </button>
      <FlagDialog toilet={toilet} mode="edit" open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Live status: report tile (in "Been here?") and the confirmable list (folded)
// ---------------------------------------------------------------------------

function useRefreshStatus(toiletId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["status", toiletId] });
    void qc.invalidateQueries({ queryKey: ["toilet", toiletId] });
  };
}

export function ReportButton({ toilet, className }: { toilet: ToiletDetail; className?: string }) {
  const guard = useGuard();
  const refresh = useRefreshStatus(toilet.id);
  const [open, setOpen] = useState(false);
  const report = useMutation({
    mutationFn: (k: StatusKind) => api.reportStatus(toilet.id, k),
    onSuccess: () => {
      refresh();
      setOpen(false);
    },
  });

  return (
    <>
      <button type="button" onClick={() => guard(() => setOpen(true))} className={cx(TILE, "border-border bg-surface", className)}>
        <Activity className="size-6 text-mint" aria-hidden />
        <span>
          Report<span className="max-sm:hidden"> status</span>
        </span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="How is it right now?">
        <div className="grid grid-cols-2 gap-2">
          {STATUS_KINDS.map((k) => (
            <Button
              key={k}
              variant={k === "ALL_GOOD" ? "primary" : "secondary"}
              size="lg"
              className={cx(k === "ALL_GOOD" && "col-span-2")}
              loading={report.isPending && report.variables === k}
              onClick={() => report.mutate(k)}
            >
              {STATUS_LABELS[k]}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-sm font-medium text-muted">Reports disappear after 2 hours (closures after 24 hours).</p>
        {report.isError ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {errorMessage(report.error)}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

/** Live reports with "Still true" confirms. The headline reports also sit in the verdict card. */
export function LiveStatusList({ toilet }: { toilet: ToiletDetail }) {
  const guard = useGuard();
  const refresh = useRefreshStatus(toilet.id);
  const statusQ = useQuery({
    queryKey: ["status", toilet.id],
    queryFn: () => api.statusReports(toilet.id),
    refetchInterval: 60_000,
  });
  const confirm = useMutation({ mutationFn: api.confirmStatus, onSuccess: refresh });
  const items = statusQ.data?.items ?? [];

  return (
    <div>
      {statusQ.isError ? (
        <p className="text-sm font-medium text-muted">Live status is unavailable right now.</p>
      ) : statusQ.isPending ? (
        <p className="text-sm font-medium text-muted">Checking for reports…</p>
      ) : items.length === 0 ? (
        <p className="font-medium text-muted">No reports in the last couple of hours. Bo jio? Tell others how it is.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s) => {
            const bad = BAD_STATUS.includes(s.kind);
            return (
              <li
                key={s.id}
                className={cx(
                  "flex items-center justify-between gap-2 rounded-3xl border py-2 pl-4 pr-2",
                  bad ? "border-danger/30 bg-danger-soft" : "border-mint/30 bg-mint-soft",
                )}
              >
                <div>
                  <p className={cx("font-extrabold", bad ? "text-danger" : "text-mint")}>{STATUS_LABELS[s.kind]}</p>
                  <p className="text-xs font-medium text-muted">
                    {timeAgo(s.createdAt)}
                    {s.confirmations ? ` · confirmed by ${s.confirmations}` : ""}
                  </p>
                </div>
                <Button
                  variant={s.confirmedByMe ? "ghost" : "secondary"}
                  disabled={s.confirmedByMe}
                  loading={confirm.isPending && confirm.variables === s.id}
                  onClick={() => guard(() => confirm.mutate(s.id))}
                  aria-label={s.confirmedByMe ? "You confirmed this" : `Confirm: ${STATUS_LABELS[s.kind]}`}
                >
                  <Check className="size-4" aria-hidden /> {s.confirmedByMe ? "Confirmed" : "Still true"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {confirm.isError ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorMessage(confirm.error)}
        </p>
      ) : null}
      <p className="mt-3 text-xs font-medium text-muted">Reports disappear after 2 hours (closures after 24 hours).</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reviews: write tile (in "Been here?") and the list (folded)
// ---------------------------------------------------------------------------

function ReviewItem({ r }: { r: Review }) {
  return (
    <li className="rounded-3xl border border-border/70 bg-surface p-4 shadow-rest">
      <div className="flex items-center justify-between gap-2">
        <span className="font-extrabold">{r.user.handle ? `@${r.user.handle}` : "Anonymous"}</span>
        <span className="text-xs font-medium text-muted">{formatDate(r.createdAt)}</span>
      </div>
      <div className="mt-1">
        <Stars value={r.cleanliness} label={`Cleanliness ${r.cleanliness} of 5`} />
      </div>
      {r.comment ? <p className="mt-1.5 whitespace-pre-line font-medium">{r.comment}</p> : null}
      {r.photos.length ? (
        <ul className="mt-3 flex gap-2">
          {r.photos.map((p) => (
            <li key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.thumbUrl ?? p.url}
                alt="Review photo"
                loading="lazy"
                className="size-20 rounded-2xl border border-border/70 bg-surface-2 object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ReviewButton({ toilet, className }: { toilet: ToiletDetail; className?: string }) {
  const guard = useGuard();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const mine = toilet.myReview;
  const [stars, setStars] = useState(mine?.cleanliness ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [photos, setPhotos] = useState<PhotoRef[]>([]);

  const post = useMutation({
    mutationFn: () =>
      api.postReview(toilet.id, {
        cleanliness: stars,
        comment: comment.trim() || undefined,
        photoIds: photos.length ? photos.map((p) => p.id) : undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setPhotos([]);
      void qc.invalidateQueries({ queryKey: ["toilet", toilet.id] });
      void qc.invalidateQueries({ queryKey: ["reviews", toilet.id] });
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <>
      <button
        type="button"
        className={cx(TILE, "border-border bg-surface", className)}
        onClick={() =>
          guard(() => {
            setStars(mine?.cleanliness ?? 0);
            setComment(mine?.comment ?? "");
            setOpen(true);
          })
        }
      >
        <MessageSquarePlus className="size-6 text-taro" aria-hidden /> {mine ? "Edit review" : "Review"}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={mine ? "Edit your review" : "How clean was it?"}
        footer={
          <Button className="w-full" size="lg" disabled={stars < 1} loading={post.isPending} onClick={() => post.mutate()}>
            Post review
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <StarInput label="Cleanliness" value={stars} onChange={setStars} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="review-comment" className="font-bold">
              Comment (optional)
            </label>
            <textarea
              id="review-comment"
              rows={4}
              maxLength={1000}
              className={inputClass}
              placeholder="Got bidet? Paper ok? Smell how?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <p className="text-right text-xs font-medium tabular-nums text-muted">{comment.length}/1000</p>
          </div>
          {me ? (
            <div>
              <p className="mb-1.5 font-bold">Photo (optional)</p>
              <PhotoPicker value={photos} onChange={setPhotos} max={3} />
              <p className="mt-1 text-xs font-medium text-muted">Photos show after a moderator approves them. No people please.</p>
            </div>
          ) : null}
          {post.isError ? (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(post.error)}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

export function ReviewList({ toilet }: { toilet: ToiletDetail }) {
  const more = useInfiniteQuery({
    queryKey: ["reviews", toilet.id],
    queryFn: ({ pageParam }) => api.reviews(toilet.id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: false,
  });
  const loaded = more.data?.pages.flatMap((p) => p.items);
  const list = loaded ?? toilet.reviews;
  const canLoadMore = loaded ? more.hasNextPage : toilet.reviewCount > toilet.reviews.length;

  return (
    <div>
      {list.length === 0 ? (
        <div className="flex items-center gap-3 rounded-3xl bg-surface-2/60 px-4 py-3">
          <Mascot mood="happy" className="size-12 shrink-0" />
          <p className="font-bold text-muted">No reviews yet. Be the first to spill the tea.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <ReviewItem key={r.id} r={r} />
          ))}
        </ul>
      )}
      {canLoadMore ? (
        <Button
          variant="ghost"
          className="mt-2 w-full"
          loading={more.isFetching}
          onClick={() => void (loaded ? more.fetchNextPage() : more.refetch())}
        >
          Show more reviews
        </Button>
      ) : null}
    </div>
  );
}
