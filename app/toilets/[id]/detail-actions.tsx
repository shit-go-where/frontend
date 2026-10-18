"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Check,
  CircleDot,
  Flag,
  LoaderCircle,
  MapPinCheck,
  MessageSquarePlus,
  PencilLine,
  Share2,
  ThumbsUp,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import { PhotoPicker } from "@/components/photo-picker";
import { Button, Dialog, ErrorState, StarInput, Stars, cx, inputClass } from "@/components/ui";
import { api, errorMessage, isApiError } from "@/lib/api/client";
import { STATUS_KINDS, type CheckInResult, type PhotoRef, type Review, type StatusKind, type ToiletDetail } from "@/lib/api/types";
import { BAD_STATUS, FEATURE_LABELS, STATUS_LABELS, formatDate, timeAgo } from "@/lib/format";
import { useGuard, useMe } from "@/lib/auth";
import { getCurrentPosition } from "@/lib/location";

// ---------------------------------------------------------------------------
// Check-in → points / badges → "still accurate?" verify prompt
// ---------------------------------------------------------------------------

/**
 * Check-in is the contribution loop, so it gets a strong secondary look (pink
 * outline on a soft pink fill) next to the primary "Walk there". Arriving from the route screen with
 * `?checkin=1` opens it once, then strips the param so refresh/back don't repeat.
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
  const [stage, setStage] = useState<"locating" | "result" | "verify" | "done" | "error">("locating");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const verify = useMutation({
    mutationFn: (accurate: boolean) =>
      api.verify(toilet.id, { ...coords!, accurate, note: accurate ? undefined : note || undefined }),
    onSuccess: () => {
      setStage("done");
      void qc.invalidateQueries({ queryKey: ["toilet", toilet.id] });
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  async function start() {
    setOpen(true);
    setStage("locating");
    setError(null);
    setResult(null);
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
      else if (isApiError(e) && e.status === 429) setError("You already checked in here recently. Try again in a couple of hours.");
      else setError(errorMessage(e));
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
        className={cx(
          "inline-flex min-h-14 items-center justify-center gap-2 rounded-full border-2 border-primary bg-primary-soft px-6 text-lg font-extrabold text-fg shadow-rest transition hover:brightness-110 active:translate-y-px",
          className,
        )}
      >
        <MapPinCheck className="size-5 text-primary" aria-hidden /> Check in
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Check in">
        {stage === "locating" ? (
          <p role="status" className="flex items-center gap-2 py-2 font-bold">
            <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden /> Checking where you are…
          </p>
        ) : null}
        {stage === "error" && error ? <ErrorState message={error} onRetry={() => void start()} /> : null}
        {stage === "result" && result ? (
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <Mascot mood="celebrating" className="size-24" />
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
                Quick check: still accurate?
              </Button>
            ) : (
              <Button size="lg" className="w-full" onClick={() => setOpen(false)}>
                Done
              </Button>
            )}
          </div>
        ) : null}
        {stage === "verify" && result ? (
          <div className="flex flex-col gap-3">
            <p className="font-bold">Is this still true here?</p>
            <ul className="flex flex-col gap-1.5">
              {result.verifyPrompt.map((f) => {
                const d = toilet.featureDetails.find((x) => x.feature === f);
                return (
                  <li key={f} className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-2.5 font-medium">
                    <span>{FEATURE_LABELS[f]}</span>
                    <span className="font-extrabold">{d ? (d.present ? "Yes" : "No") : "Unknown"}</span>
                  </li>
                );
              })}
            </ul>
            <label htmlFor="verify-note" className="text-sm font-bold">
              Anything wrong? (optional)
            </label>
            <textarea
              id="verify-note"
              className={inputClass}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" loading={verify.isPending && verify.variables === true} onClick={() => verify.mutate(true)}>
                <ThumbsUp className="size-5" aria-hidden /> All correct
              </Button>
              <Button
                size="lg"
                variant="secondary"
                loading={verify.isPending && verify.variables === false}
                onClick={() => verify.mutate(false)}
              >
                Something&apos;s off
              </Button>
            </div>
          </div>
        ) : null}
        {stage === "done" ? (
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <Mascot mood="happy" className="size-20" />
            <h3 className="font-display text-2xl leading-tight">Thanks, legend!</h3>
            <p className="font-medium text-muted">You just made this listing more trustworthy for everyone.</p>
            <Button className="w-full" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        ) : null}
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
    <Button variant="ghost" size="lg" className={className} onClick={() => void share()}>
      <Share2 className="size-5 text-muted" aria-hidden /> <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </Button>
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
      <button
        type="button"
        onClick={() => guard(() => setOpen(true))}
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-2 font-bold text-muted hover:bg-surface-2 hover:text-fg"
      >
        <Flag className="size-4" aria-hidden /> Something wrong with this listing?
      </button>
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
// Live status: active reports, confirm, report sheet
// ---------------------------------------------------------------------------

export function LiveStatus({ toilet }: { toilet: ToiletDetail }) {
  const guard = useGuard();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const statusQ = useQuery({
    queryKey: ["status", toilet.id],
    queryFn: () => api.statusReports(toilet.id),
    refetchInterval: 60_000,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["status", toilet.id] });
    void qc.invalidateQueries({ queryKey: ["toilet", toilet.id] });
  };
  const confirm = useMutation({ mutationFn: api.confirmStatus, onSuccess: refresh });
  const report = useMutation({
    mutationFn: (k: StatusKind) => api.reportStatus(toilet.id, k),
    onSuccess: () => {
      refresh();
      setOpen(false);
    },
  });
  const items = statusQ.data?.items ?? [];

  return (
    <section className="mt-10" aria-labelledby="live-status">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="live-status" className="text-2xl leading-tight">
          Live status
        </h2>
        <Button variant="secondary" onClick={() => guard(() => setOpen(true))}>
          <CircleDot className="size-4 text-muted" aria-hidden /> Report
        </Button>
      </div>
      {statusQ.isError ? (
        <p className="text-sm font-medium text-muted">Live status is unavailable right now.</p>
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
                  bad ? "border-danger/30 bg-danger-soft" : "border-ok/30 bg-ok-soft",
                )}
              >
                <div>
                  <p className={cx("font-extrabold", bad ? "text-danger" : "text-ok")}>{STATUS_LABELS[s.kind]}</p>
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
    </section>
  );
}

// ---------------------------------------------------------------------------
// Reviews
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

export function Reviews({ toilet }: { toilet: ToiletDetail }) {
  const guard = useGuard();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const mine = toilet.myReview;
  const [stars, setStars] = useState(mine?.cleanliness ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [photos, setPhotos] = useState<PhotoRef[]>([]);

  const more = useInfiniteQuery({
    queryKey: ["reviews", toilet.id],
    queryFn: ({ pageParam }) => api.reviews(toilet.id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: false,
  });

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

  const loaded = more.data?.pages.flatMap((p) => p.items);
  const list = loaded ?? toilet.reviews;
  const canLoadMore = loaded ? more.hasNextPage : toilet.reviewCount > toilet.reviews.length;

  return (
    <section className="mt-10" aria-labelledby="reviews">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="reviews" className="text-2xl leading-tight">
          Reviews <span className="text-lg text-muted">({toilet.reviewCount})</span>
        </h2>
        <Button
          variant="secondary"
          onClick={() =>
            guard(() => {
              setStars(mine?.cleanliness ?? 0);
              setComment(mine?.comment ?? "");
              setOpen(true);
            })
          }
        >
          <MessageSquarePlus className="size-4 text-muted" aria-hidden /> {mine ? "Edit my review" : "Write a review"}
        </Button>
      </div>
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
    </section>
  );
}
