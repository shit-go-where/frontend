"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Award,
  Check,
  Flag,
  LoaderCircle,
  LogIn,
  MapPinCheck,
  MessageSquarePlus,
  PencilLine,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Mascot } from "@/components/mascot";
import { PhotoPicker } from "@/components/photo-picker";
import { PhotoViewer } from "@/components/photo-viewer";
import { Button, Dialog, ErrorState, StarInput, Stars, buttonClass, cx, inputClass } from "@/components/ui";
import { api, errorMessage, isApiError } from "@/lib/api/client";
import { STATUS_KINDS, type CheckInResult, type PhotoRef, type Review, type StatusKind, type ToiletDetail } from "@/lib/api/types";
import { BAD_STATUS, STATUS_LABELS, formatDate, timeAgo } from "@/lib/format";
import { INTENT_PARAM, loginWithIntent, useGuard, useMe, useResumeIntent } from "@/lib/auth";
import { getCurrentPosition } from "@/lib/location";
import { track } from "@/lib/analytics";
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
 * who checked in within the cooldown still gets there, without points. Arriving with `?do=checkin`
 * (the route screen, the map's "Here? Check in", or sign-in after a signed-out tap; `?checkin=1` is
 * the older link) opens it once, then strips the param so refresh/back don't repeat.
 */
export function CheckInButton({ toilet, className }: { toilet: ToiletDetail; className?: string }) {
  const guard = useGuard();
  const qc = useQueryClient();
  const { isSuccess: meReady, data: me } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const wantsCheckIn = params.get(INTENT_PARAM) === "checkin" || params.get("checkin") === "1";
  const autoStarted = useRef(false);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"locating" | "result" | "recent" | "verify" | "done" | "error">("locating");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Signed out past the anonymous daily limit: the way on is signing in, so the error offers it.
  const [errorNeedsSignIn, setErrorNeedsSignIn] = useState(false);
  // Signed out works at live toilets only; confirming a new one counts as a vote, which needs an account.
  const anonOk = toilet.status === "ACTIVE";
  const signedOut = meReady && !me;
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
    setErrorNeedsSignIn(false);
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
      // A confirmation can put a pending toilet live: show the page as it is now.
      if (r.confirmedPending) void qc.invalidateQueries({ queryKey: ["toilet", toilet.id] });
    } catch (e) {
      const code = (e as GeolocationPositionError)?.code;
      if (code === 1) setError("We need your location to check in. Turn on location for this site and try again.");
      else if (code === 2 || code === 3) setError("Couldn't get a GPS fix. Step outside or near a window and try again.");
      else if (isApiError(e) && e.status === 401) {
        // "Sign in to confirm a new toilet": not a failure, just the next step. Come back and check in again.
        setOpen(false);
        router.push(loginWithIntent("checkin"));
        return;
      }
      // The API says why (too far, with the distance, or not open for check-ins yet); don't bolt a second reason on.
      else if (isApiError(e) && e.status === 400)
        setError(e.message || "You're too far away. Check-ins only count within 150 m of the toilet.");
      else if (isApiError(e) && e.status === 429 && !me && /sign in/i.test(e.message)) {
        // The signed-out daily limits ("You can check in 5 times a day without signing in…") say what to do next.
        setError(e.message);
        setErrorNeedsSignIn(true);
      } else if (isApiError(e) && e.status === 429) {
        // Still within 150 m (the check-in passed its distance check first), so the form stays open to them.
        setStage("recent");
        return;
      } else setError(errorMessage(e));
      setStage("error");
    }
  }

  const tryCheckIn = () => guard(() => void start(), "checkin", { allowAnon: anonOk });

  const autoStart = useEffectEvent(() => {
    autoStarted.current = true;
    // Signed out at a pending toilet: guard sends them to /login and back here with the param intact.
    if (me || anonOk) router.replace(pathname, { scroll: false });
    tryCheckIn();
  });
  useEffect(() => {
    // Cleared once the param is gone, so a later `?do=checkin` link on this page (the pending toilet's
    // "Check in to confirm it") starts it again.
    if (!wantsCheckIn) autoStarted.current = false;
    else if (meReady && !autoStarted.current) autoStart();
  }, [wantsCheckIn, meReady]);

  return (
    <>
      <button
        type="button"
        onClick={tryCheckIn}
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
        {stage === "error" && error ? (
          errorNeedsSignIn ? (
            <div className="flex flex-col gap-3">
              <ErrorState message={error} />
              <Link href={loginWithIntent("checkin")} className={buttonClass("primary", "lg", "w-full")}>
                <LogIn className="size-5" aria-hidden /> Sign in
              </Link>
            </div>
          ) : (
            <ErrorState message={error} onRetry={() => void start()} />
          )
        ) : null}
        {stage === "recent" ? (
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <Mascot mood="happy" className="size-20" />
            <h3 className="font-display text-2xl leading-tight">Already checked in</h3>
            {signedOut ? (
              <>
                {/* Fact edits are signed in only (they go to people nearby to confirm), so offer the account instead. */}
                <p className="font-medium text-muted">
                  You checked in here in the last 2 hours, so nothing new to save. Sign in to update what&apos;s inside.
                </p>
                <Link href={loginWithIntent("checkin")} className={buttonClass("primary", "lg", "w-full")}>
                  <LogIn className="size-5" aria-hidden /> Sign in
                </Link>
              </>
            ) : (
              <>
                <p className="font-medium text-muted">
                  You checked in here in the last 2 hours, so no points this time. Spotted something new? You can still update
                  what&apos;s inside.
                </p>
                <Button size="lg" className="w-full" onClick={() => setStage("verify")}>
                  Update what&apos;s inside
                </Button>
              </>
            )}
          </div>
        ) : null}
        {stage === "result" && result ? (
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <Mascot mood="celebrating" className="celebrate-in size-24" />
            <h3 className="font-display text-2xl leading-tight">
              {result.confirmedPending ? "You confirmed a new toilet" : "Shiok! Checked in"}
            </h3>
            {result.wentLive ? (
              <p className="text-lg font-bold text-mint">It&apos;s live now, thanks to you.</p>
            ) : result.confirmedPending ? (
              <p className="font-medium text-muted">
                {toilet.status === "PENDING"
                  ? "Your check-in counts as a confirmation. It goes live once enough people nearby confirm it."
                  : "You're the second person to confirm it's really there."}
              </p>
            ) : null}
            <p className="text-lg font-bold">
              {result.pointsAwarded > 0 ? (
                <>
                  <strong className="font-display text-3xl text-mint">+{result.pointsAwarded}</strong> point
                  {result.pointsAwarded === 1 ? "" : "s"}
                </>
              ) : !me && result.bankedPoints > 0 ? (
                <>
                  <strong className="font-display text-3xl text-mint">+{result.bankedPoints}</strong> point
                  {result.bankedPoints === 1 ? "" : "s"} saved on this phone. Sign in to keep them.
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
            {!me ? (
              // Signed out: the points wait on this phone and "What's inside?" edits need an account, so one
              // sign-in covers both. Coming back with ?do=checkin lands on the form (the check-in is already done).
              <>
                <Link href={loginWithIntent("checkin")} className={buttonClass("primary", "lg", "w-full")}>
                  <LogIn className="size-5" aria-hidden /> Sign in
                </Link>
                <p className="text-sm font-medium text-muted">Signed in, you can also tell others what&apos;s inside.</p>
                <Button variant="secondary" className="w-full" onClick={() => setOpen(false)}>
                  Not now
                </Button>
              </>
            ) : result.verifyPrompt.length ? (
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
    const shared = (method: "native" | "copy" | "prompt") =>
      track("share", { what: "toilet", method, toilet_id: toilet.id, toilet_tier: toilet.tier });
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Toilet at ${title} on Shit Go Where`, url });
        shared("native");
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      shared("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
      shared("prompt");
    }
  }
  return (
    // Relative so the "Link copied" pill can float above the button without moving the row.
    <span className="relative inline-flex shrink-0">
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
      {/* An icon swap alone is easy to miss on a phone: say it in words for the two seconds it lasts. */}
      <span
        aria-live="polite"
        className={cx(
          "pointer-events-none absolute right-0 bottom-full mb-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-mint px-3 py-1.5 text-sm font-extrabold text-mint-fg shadow-card transition duration-200 motion-reduce:transition-opacity",
          copied ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        )}
      >
        {copied ? (
          <>
            <Check className="size-4" aria-hidden /> Link copied
          </>
        ) : null}
      </span>
    </span>
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
  useResumeIntent("flag", () => setOpen(true));
  return (
    <>
      {/* Same shape as "… not known yet. Suggest an edit": a plain question, then a link-styled action. */}
      <p className="flex flex-wrap items-center gap-x-2">
        <span>Something wrong with this listing?</span>
        <button
          type="button"
          onClick={() => guard(() => setOpen(true), "flag")}
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
  useResumeIntent("edit", () => setOpen(true));
  return (
    <>
      <button
        type="button"
        onClick={() => guard(() => setOpen(true), "edit")}
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

/** How long the thanks stays up before the dialog closes itself. Long enough to read one line. */
const REPORT_THANKS_MS = 2600;

export function ReportButton({ toilet, className }: { toilet: ToiletDetail; className?: string }) {
  const guard = useGuard();
  const refresh = useRefreshStatus(toilet.id);
  const [open, setOpen] = useState(false);
  const report = useMutation({
    mutationFn: (k: StatusKind) => api.reportStatus(toilet.id, k),
    onSuccess: refresh,
  });
  // The thanks stays through the sheet's exit; the next open starts fresh.
  const close = () => setOpen(false);
  const openReport = () => {
    report.reset();
    setOpen(true);
  };
  useResumeIntent("report", openReport);
  // Said, then gone: the thanks closes the dialog on its own unless they close it first.
  const sent = report.isSuccess ? report.variables : null;
  const { data: me } = useMe();
  // Signed-out reports last an hour, and a lone signed-out closure waits for someone to back it up
  // before it changes anything (API_CONTRACT.md, "Anonymous device").
  const lasts = !me ? "about an hour" : sent === "CLOSED_NOW" ? "24 hours" : "2 hours";
  const unconfirmed = report.data?.unconfirmed ?? false;
  useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(() => setOpen(false), REPORT_THANKS_MS);
    return () => window.clearTimeout(t);
  }, [sent]);

  return (
    <>
      <button
        type="button"
        // Signed-out reports work at live toilets (they expire sooner and a lone closure waits for someone to back it up).
        onClick={() => guard(openReport, "report", { allowAnon: toilet.status === "ACTIVE" })}
        className={cx(TILE, "border-border bg-surface", className)}
      >
        <Activity className="size-6 text-mint" aria-hidden />
        <span>
          Report<span className="max-sm:hidden"> status</span>
        </span>
      </button>
      <Dialog open={open} onClose={close} title={sent ? "Thanks!" : "How is it right now?"}>
        {sent ? (
          <p role="status" className="flex items-start gap-2 py-1 text-lg font-bold">
            <Check className="mt-1 size-5 shrink-0 text-mint" aria-hidden />
            <span>
              {unconfirmed
                ? `Others will see '${STATUS_LABELS[sent]}' as unconfirmed until someone else backs it up.`
                : `Others will see '${STATUS_LABELS[sent]}' for ${lasts}.`}
            </span>
          </p>
        ) : (
          <ReportChoices report={report} />
        )}
      </Dialog>
    </>
  );
}

/** The status buttons, two to a row, with "All good" across the top. */
function ReportChoices({
  report,
}: {
  report: { mutate: (k: StatusKind) => void; isPending: boolean; variables: StatusKind | undefined; isError: boolean; error: unknown };
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {STATUS_KINDS.map((k) => (
          <Button
            key={k}
            variant={k === "ALL_GOOD" ? "primary" : "secondary"}
            size="lg"
            className={cx(k === "ALL_GOOD" && "col-span-2")}
            loading={report.isPending && report.variables === k}
            disabled={report.isPending}
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
                    {s.unconfirmed ? " · unconfirmed" : ""}
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

function ReviewItem({ r, as: Tag = "li" }: { r: Review; as?: "li" | "div" }) {
  const [photoAt, setPhotoAt] = useState<number | null>(null);
  const who = r.user.handle ? `@${r.user.handle}` : "Anonymous";
  return (
    <Tag className="rounded-3xl border border-border/70 bg-surface p-4 shadow-rest">
      <div className="flex items-center justify-between gap-2">
        <span className="font-extrabold">{who}</span>
        <span className="text-xs font-medium text-muted">{formatDate(r.createdAt)}</span>
      </div>
      <div className="mt-1">
        <Stars value={r.cleanliness} label={`Cleanliness ${r.cleanliness} of 5 stars`} />
      </div>
      {r.comment ? <p className="mt-1.5 whitespace-pre-line font-medium">{r.comment}</p> : null}
      {r.photos.length ? (
        <ul className="mt-3 flex gap-2">
          {r.photos.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPhotoAt(i)}
                aria-haspopup="dialog"
                aria-label={`Open photo ${i + 1} of ${r.photos.length} from ${who}'s review`}
                className="block rounded-2xl transition active:scale-[0.97]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbUrl ?? p.url}
                  alt=""
                  loading="lazy"
                  className="size-20 rounded-2xl border border-border/70 bg-surface-2 object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {r.photos.length ? (
        <PhotoViewer
          photos={r.photos}
          index={photoAt}
          onIndex={setPhotoAt}
          onClose={() => setPhotoAt(null)}
          alt={(i) => `Photo ${i + 1} from ${who}'s review`}
        />
      ) : null}
    </Tag>
  );
}

/** What a review earns, from the API's rules (backend POINTS): 5 for the review, 5 more once it has a photo. */
const REVIEW_POINTS = 5;
const REVIEW_PHOTO_POINTS = 5;

export function ReviewButton({ toilet, className }: { toilet: ToiletDetail; className?: string }) {
  const guard = useGuard();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const mine = toilet.myReview;
  const [stars, setStars] = useState(mine?.cleanliness ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const hadPhoto = !!mine?.photos.length;

  const post = useMutation({
    mutationFn: async () => {
      const review = await api.postReview(toilet.id, {
        cleanliness: stars,
        comment: comment.trim() || undefined,
        photoIds: photos.length ? photos.map((p) => p.id) : undefined,
      });
      // The API returns the review, not the points. Its awards are once per review (an edit earns
      // nothing again) and once more for its first photo, so the same rule is worked out here.
      const earned = (mine ? 0 : REVIEW_POINTS) + (photos.length && !hadPhoto ? REVIEW_PHOTO_POINTS : 0);
      return { review, earned };
    },
    onSuccess: () => {
      setPhotos([]);
      void qc.invalidateQueries({ queryKey: ["toilet", toilet.id] });
      void qc.invalidateQueries({ queryKey: ["reviews", toilet.id] });
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const openReview = () => {
    post.reset();
    setStars(mine?.cleanliness ?? 0);
    setComment(mine?.comment ?? "");
    setOpen(true);
  };
  useResumeIntent("review", openReview);
  const done = post.data;
  // Said before they write, so the photo ask has a reason attached.
  const offer = !mine
    ? `+${REVIEW_POINTS} points, +${REVIEW_PHOTO_POINTS} more with a photo.`
    : !hadPhoto && me
      ? `Add a photo for +${REVIEW_PHOTO_POINTS} points.`
      : null;

  return (
    <>
      <button
        type="button"
        className={cx(TILE, "border-border bg-surface", className)}
        onClick={() => guard(openReview, "review")}
      >
        <MessageSquarePlus className="size-6 text-taro" aria-hidden /> {mine ? "Edit review" : "Review"}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={done ? "Steady lah!" : mine ? "Edit your review" : "How clean was it?"}
        footer={
          done ? (
            <Button className="w-full" size="lg" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <Button className="w-full" size="lg" disabled={stars < 1} loading={post.isPending} onClick={() => post.mutate()}>
              Post review
            </Button>
          )
        }
      >
        {done ? (
          <div className="flex flex-col gap-3" role="status">
            <div className="flex items-center gap-3">
              <Mascot mood="celebrating" className="celebrate-in size-16 shrink-0" />
              <p className="text-lg font-bold">
                Posted.{" "}
                {done.earned > 0 ? (
                  <strong className="font-display text-2xl font-normal text-mint">+{done.earned} points</strong>
                ) : (
                  <span className="text-muted">Your review is updated.</span>
                )}
              </p>
            </div>
            {/* Their own words back, here, rather than inside the folded Reviews list. */}
            <ReviewItem r={done.review} as="div" />
          </div>
        ) : (
        <div className="flex flex-col gap-4">
          {offer ? (
            <p className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm font-bold">
              <Award className="size-4 shrink-0 text-accent" aria-hidden />
              {offer}
            </p>
          ) : null}
          <div>
            <StarInput label="Cleanliness (1–5 stars)" value={stars} onChange={setStars} />
            {/* True to backend/src/toilets/scoring.ts: reviews (1–5 mapped to 2–10) blend with the latest survey. */}
            <p className="mt-1 text-sm font-medium text-muted">
              The score out of 10 on this page combines reviews with our in-person survey, where there is one.
            </p>
          </div>
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
        )}
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
