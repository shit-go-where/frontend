"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Compass,
  Flame,
  HandHeart,
  Link2,
  LogOut,
  Map as MapIcon,
  MapPinPlus,
  Moon,
  NotebookPen,
  PencilLine,
  Repeat,
  Share2,
  ShieldCheck,
  Shield,
  Sprout,
  Stamp,
  Toilet,
  TrainFront,
  Trash2,
  TreePalm,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ViewTransition,
  addTransitionType,
  createElement,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KIND_LABELS,
  PayloadView,
  PhotoStrip,
  ReviewerNotes,
  StateBadge,
  expiryText,
  submissionTitle,
  submitterSentence,
} from "@/app/review/submission-bits";
import { FoldDetails } from "@/components/fold-details";
import { Mascot } from "@/components/mascot";
import { PhotoPicker } from "@/components/photo-picker";
import { holdChrome } from "@/components/route-transition";
import { LineBadge } from "@/components/toilet-bits";
import { Button, Card, Dialog, EmptyState, ErrorState, SlidingPill, Spinner, Tabs, buttonClass, cx, inputClass } from "@/components/ui";
import { Switch } from "@/components/switch";
import { TpBar } from "@/components/tp-bar";
import { api, errorMessage, isApiError } from "@/lib/api/client";
import type { ActivityItem, Badge, Me, Passport, PhotoRef, Role, SubmissionView, UpdateSubmissionBody } from "@/lib/api/types";
import { track } from "@/lib/analytics";
import { ME_KEY, hasRole, useRequireAuth, useSignOut } from "@/lib/auth";
import { MRT_LINES, formatDate, lineColor, lineTextColor, plural } from "@/lib/format";
import { forgetSignedInCopies } from "@/lib/offline";
import { PANEL_IN, PANEL_OUT, getMotionPref, reducedMotion, setMotionPref, type MotionPref } from "@/lib/motion";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";

const ROLE_LABELS: Record<Role, string> = { USER: "Member", TRUSTED: "Trusted", MODERATOR: "Moderator", ADMIN: "Admin" };

type Tab = "progress" | "activity" | "settings";
const TABS: { value: Tab; label: string }[] = [
  { value: "progress", label: "Progress" },
  { value: "activity", label: "Activity" },
  { value: "settings", label: "Settings" },
];
/** Old links point at the leaderboard switch by hash; it now lives under Settings. */
const OPTIN_HASH = "#leaderboard-optin";

/** `?tab=settings`, so a tab can be linked to and survives a reload. Read after hydration. */
function readTab(): Tab {
  if (window.location.hash === OPTIN_HASH) return "settings";
  const t = new URLSearchParams(window.location.search).get("tab");
  return TABS.some((x) => x.value === t) ? (t as Tab) : "progress";
}

function writeTab(tab: Tab) {
  const url = new URL(window.location.href);
  if (tab === "progress") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  url.hash = "";
  window.history.replaceState(window.history.state, "", url);
}

/*
 * Switching tabs moves like the leaderboard's: the pink pill slides under the tab you tapped at once,
 * then the old panel slips out and the new one glides in from that side (a React view transition;
 * the CSS is "Leaderboard re-rank" in globals.css). If you had scrolled past the tabs, the page brings
 * them back to the top inside the same transition, so a shorter panel never leaves you mid-air.
 * Reduced motion: the panel just changes.
 */
export function MeClient() {
  const meQ = useRequireAuth();
  // `picked` lights the tab on the tap itself; `tab` swaps the panel inside the view transition.
  const [picked, setPicked] = useState<Tab>("progress");
  const [tab, setTab] = useState<Tab>("progress");
  const tabsRef = useRef<HTMLDivElement>(null);
  const switched = useRef(false);
  useEffect(() => {
    // The URL is client-only; open a linked tab after hydration, without animating.
    const t = readTab();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(t);
    setTab(t);
  }, []);
  useLayoutEffect(() => {
    const el = tabsRef.current;
    if (!switched.current || !el) return;
    if (el.getBoundingClientRect().top < parseFloat(getComputedStyle(el).scrollMarginTop)) el.scrollIntoView({ block: "start" });
  }, [tab]);
  if (meQ.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <ErrorState message={errorMessage(meQ.error)} onRetry={() => void meQ.refetch()} />
      </div>
    );
  }
  if (meQ.isLoading || !meQ.data) return <Spinner label="Loading your profile" />;
  const me = meQ.data;
  const pick = (t: Tab) => {
    if (t === picked) return;
    const order = (x: Tab) => TABS.findIndex((o) => o.value === x);
    setPicked(t);
    writeTab(t);
    switched.current = true;
    if (reducedMotion()) return setTab(t);
    holdChrome();
    startTransition(() => {
      addTransitionType(order(t) > order(picked) ? "lb-tab-right" : "lb-tab-left");
      setTab(t);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-8 pt-4">
      {me.needsHandle ? <HandleSetup me={me} /> : null}
      <Profile me={me} />
      <SinceLastVisit me={me} onSeeActivity={() => pick("activity")} />
      <div ref={tabsRef} className="scroll-mt-4 md:scroll-mt-20">
        <Tabs tabs={TABS} value={picked} onChange={pick} label="Your profile" idBase="me" />
      </div>
      <div role="tabpanel" id="me-panel" aria-labelledby={`me-tab-${tab}`}>
        <ViewTransition key={tab} enter={PANEL_IN} exit={PANEL_OUT} default="none">
          <div className="flex flex-col gap-8">
            {tab === "progress" ? <ProgressTab me={me} /> : null}
            {tab === "activity" ? <ActivityTab /> : null}
            {tab === "settings" ? <SettingsTab me={me} /> : null}
          </div>
        </ViewTransition>
      </div>
    </div>
  );
}

/* ─────────────── header ─────────────── */

function Profile({ me }: { me: Me }) {
  const badges = useQuery({ queryKey: ["badges"], queryFn: api.badges, staleTime: 10 * 60_000 });
  const passport = useQuery({ queryKey: ["passport"], queryFn: api.passport });
  const name = me.handle ? `@${me.handle}` : me.displayName;
  return (
    <header className="flex items-center gap-4">
      {me.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={me.avatarUrl}
          alt=""
          className="size-16 shrink-0 rounded-full object-cover ring-4 ring-surface-2"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary font-display text-3xl text-primary-fg shadow-gloss ring-4 ring-surface-2"
          aria-hidden
        >
          {(me.handle ?? me.displayName).slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl leading-tight [overflow-wrap:anywhere] sm:text-[2rem]">{name}</h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          {me.handle ? <span className="min-w-0 truncate">{me.displayName}</span> : null}
          {me.role !== "USER" ? (
            <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-extrabold text-fg">{ROLE_LABELS[me.role]}</span>
          ) : null}
        </p>
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 tabular-nums">
          <Stat value={me.points} label="points" gold />
          <Stat value={me.badges.length} of={badges.data?.items.length} label="badges" />
          <Stat value={passport.data?.stamped} of={passport.data?.total} label="stations" />
        </dl>
      </div>
    </header>
  );
}

/** One small stat: the number leads, "of 20" and the label sit quietly under it. Never a hero number. */
function Stat({ value, of, label, gold }: { value: number | undefined; of?: number; label: string; gold?: boolean }) {
  return (
    <div className="flex flex-col">
      <dd className="order-1 leading-tight">
        <span className={cx("text-lg font-extrabold", gold ? "text-accent" : "text-fg")}>{value ?? "–"}</span>
        {of !== undefined ? <span className="text-sm font-bold text-muted">/{of}</span> : null}
      </dd>
      <dt className="order-2 text-xs font-bold text-muted">{label}</dt>
    </div>
  );
}

/* ─────────────── since your last visit ─────────────── */

const NOTHING_UNSEEN: Me["unseen"] = { resolvedSubmissions: 0, badges: 0, points: 0, routed: 0 };

/**
 * What happened while they were away (Me.unseen), marked seen once it's on screen so the Me tab's dot
 * clears. The counts are kept from the first render, so the banner stays for this visit after the
 * API resets them; it's gone next time.
 */
function SinceLastVisit({ me, onSeeActivity }: { me: Me; onSeeActivity: () => void }) {
  const qc = useQueryClient();
  const [snap] = useState(() => ({ unseen: me.unseen, since: me.lastSeenActivityAt }));
  const marked = useRef(false);
  const { resolvedSubmissions, badges, points } = snap.unseen;
  // Missing on a Me cached before the field existed.
  const routed = snap.unseen.routed ?? 0;
  const any = resolvedSubmissions + badges + points + routed > 0;
  useEffect(() => {
    if (!any || marked.current) return;
    marked.current = true;
    api
      .markActivitySeen()
      .then((r) =>
        qc.setQueryData<Me | null>(ME_KEY, (m) => (m ? { ...m, unseen: NOTHING_UNSEEN, lastSeenActivityAt: r.seenAt } : m)),
      )
      .catch(() => {
        // Not marked, so the dot and this banner simply come back next visit.
        marked.current = false;
      });
  }, [any, qc]);
  if (!any) return null;
  const since = snap.since ? new Date(snap.since).getTime() : 0;
  const fresh = me.badges.filter((b) => b.awardedAt && new Date(b.awardedAt).getTime() > since);

  return (
    <section aria-labelledby="since-last" className="flex items-start gap-3 rounded-3xl bg-mint-soft p-4 shadow-rest">
      {/* A badge earned while away is a celebration, so the mascot may come out for it. */}
      {badges > 0 ? <Mascot mood="celebrating" className="celebrate-in size-14 shrink-0" /> : null}
      <div className="min-w-0 flex-1">
        <h2 id="since-last" className="text-xl leading-tight">
          Since your last visit
        </h2>
        <ul className="mt-1 flex flex-col text-sm font-bold tabular-nums">
          {points > 0 ? (
            <li>
              +{points} points
            </li>
          ) : null}
          {resolvedSubmissions > 0 ? (
            <li className="flex flex-wrap items-center gap-x-2">
              <span>{plural(resolvedSubmissions, "submission")} decided.</span>
              <button type="button" onClick={onSeeActivity} className="inline-flex min-h-11 items-center text-primary underline">
                See what happened
              </button>
            </li>
          ) : null}
          {badges > 0 ? <li>{plural(badges, "new badge")}</li> : null}
          {routed > 0 ? (
            <li>
              {routed === 1 ? "1 person was sent to a toilet you helped" : `${routed} people were sent to toilets you helped`}
            </li>
          ) : null}
        </ul>
        {fresh.length ? (
          <ul className="mt-2 flex flex-wrap gap-3">
            {fresh.map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                <BadgeMedal id={b.id} earned className="size-10" />
                <span className="text-sm font-extrabold">{b.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

/** Why Save can't be pressed yet, or null when it can. */
function handleProblem(handle: string, current: string | null): string | null {
  if (handle.length === 0) return "Type a handle to save it.";
  if (handle.length < 3) return `${3 - handle.length} more character${3 - handle.length === 1 ? "" : "s"} needed.`;
  if (!HANDLE_RE.test(handle)) return "Use 3 to 20 lowercase letters, numbers or _.";
  if (handle === current) return "That's already your handle.";
  return null;
}

function HandleSetup({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [handle, setHandle] = useState(me.handle ?? "");
  const problem = handleProblem(handle, me.handle);
  const m = useMutation({
    mutationFn: () => api.updateMe({ handle }),
    onSuccess: (updated) => qc.setQueryData(ME_KEY, updated),
  });
  const taken = isApiError(m.error) && m.error.status === 409;
  return (
    <Card className="border-primary bg-primary-soft!">
      <h2 className="text-2xl leading-tight">Pick a handle</h2>
      <p id="handle-hint" className="mt-1 text-sm">
        This is what others see on reviews and the leaderboard. No real names needed. 3–20 characters: lowercase letters, numbers
        and _.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) m.mutate();
        }}
      >
        <label htmlFor="handle" className="sr-only">
          Handle
        </label>
        <div className="flex min-w-0 flex-1 items-center rounded-full border-2 border-border-strong bg-surface pl-4 focus-within:border-primary has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
          <span className="font-extrabold text-muted" aria-hidden>
            @
          </span>
          <input
            id="handle"
            className="min-h-12 w-full min-w-0 bg-transparent pl-1 pr-4 text-base text-fg placeholder:text-muted focus:outline-none"
            value={handle}
            autoComplete="username"
            onChange={(e) => {
              m.reset();
              setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
            }}
            maxLength={20}
            aria-invalid={handle.length > 0 && !!problem}
            aria-describedby="handle-hint handle-status handle-err"
          />
        </div>
        {/* Disabled looks secondary (not a faded pink) so the two states can't be confused. */}
        <Button type="submit" variant={problem ? "secondary" : "primary"} disabled={!!problem} loading={m.isPending}>
          Save
        </Button>
      </form>
      <p id="handle-status" className={cx("mt-2 text-sm", problem ? "text-muted" : "font-bold text-mint")} aria-live="polite">
        {problem ?? `Ready to save @${handle}.`}
      </p>
      <p id="handle-err" role="alert" className="text-sm text-danger">
        {taken ? "That handle is taken. Try another one." : m.isError ? errorMessage(m.error) : ""}
      </p>
    </Card>
  );
}

/* ─────────────── progress: badges ─────────────── */

const BADGE_ICONS: Record<string, LucideIcon> = {
  "first-flush": Toilet,
  regular: Repeat,
  explorer: Compass,
  "island-hopper": TreePalm,
  "first-contribution": MapPinPlus,
  cartographer: MapIcon,
  critic: NotebookPen,
  shutterbug: Camera,
  "night-owl": Moon,
  "streak-7": Flame,
  trusted: ShieldCheck,
  // The API's icon is an emoji (🌱); DESIGN.md draws icons, so it gets the lucide sprout.
  "founding-contributor": Sprout,
};

function badgeIcon(id: string): LucideIcon {
  return BADGE_ICONS[id] ?? (id.startsWith("line-") ? TrainFront : Award);
}

/** "line-nsl" → "NSL" for the line-collector badges. */
function badgeLine(id: string): string | null {
  return id.startsWith("line-") ? id.slice(5).toUpperCase() : null;
}

/**
 * Rough order of effort, easiest first, mirroring the thresholds in the API's badge rules.
 * Line badges are ranked by how many stations are left on that line.
 */
const BADGE_EFFORT: Record<string, number> = {
  "first-flush": 1,
  "first-contribution": 2,
  "night-owl": 3,
  regular: 4,
  explorer: 5,
  shutterbug: 6,
  "streak-7": 7,
  critic: 8,
  trusted: 9,
  "island-hopper": 10,
  cartographer: 11,
  // Only while fewer than 100 people hold it, which we can't see from here, so it's suggested last.
  "founding-contributor": 99,
};

type LineProgress = Map<string, { stamped: number; total: number }>;

function lineProgress(p: Passport | undefined): LineProgress {
  const m: LineProgress = new Map();
  for (const s of p?.stations ?? []) {
    for (const l of s.lines) {
      const cur = m.get(l) ?? { stamped: 0, total: 0 };
      m.set(l, { stamped: cur.stamped + (s.stampedAt ? 1 : 0), total: cur.total + 1 });
    }
  }
  return m;
}

function effort(b: Badge, lines: LineProgress): number {
  const line = badgeLine(b.id);
  if (line) {
    const pr = lines.get(line);
    if (!pr) return 99;
    const left = pr.total - pr.stamped;
    return left <= 3 ? 3.5 : 12 + left;
  }
  return BADGE_EFFORT[b.id] ?? 50;
}

function BadgeMedal({ id, earned, className }: { id: string; earned: boolean; className?: string }) {
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full",
        earned
          ? "-rotate-6 border-[3px] border-rim bg-accent text-accent-fg shadow-[var(--gloss),0_3px_0_rgb(0_0_0/0.35)]"
          : "rotate-3 border-[3px] border-rim/55 bg-surface-2 text-muted opacity-80 shadow-[0_2px_0_rgb(0_0_0/0.3)] grayscale",
        className ?? "size-12",
      )}
      aria-hidden
    >
      {createElement(badgeIcon(id), { className: "size-1/2", strokeWidth: earned ? 2.25 : 1.75 })}
    </span>
  );
}

function ProgressTab({ me }: { me: Me }) {
  const q = useQuery({ queryKey: ["badges"], queryFn: api.badges, staleTime: 10 * 60_000 });
  const passport = useQuery({ queryKey: ["passport"], queryFn: api.passport });
  const earned = useMemo(() => new Map<string, Badge>(me.badges.map((b) => [b.id, b])), [me.badges]);
  const lines = useMemo(() => lineProgress(passport.data), [passport.data]);
  const all = useMemo(() => {
    const items = q.data?.items ?? me.badges;
    // Earned first (in the order earned), then the rest easiest first, so the shelf fills left to right.
    return [
      ...items.filter((b) => earned.has(b.id)),
      ...items.filter((b) => !earned.has(b.id)).sort((a, b) => effort(a, lines) - effort(b, lines)),
    ];
  }, [q.data, me.badges, earned, lines]);
  const next = all.find((b) => !earned.has(b.id)) ?? null;

  return (
    <>
      <Impact me={me} />
      {next && q.data ? (
        <section aria-labelledby="next-badge" className="flex flex-col gap-3">
          <h2 id="next-badge" className="text-2xl leading-tight">
            Next badge
          </h2>
          <BadgeDetail b={next} got={undefined} lines={lines} />
        </section>
      ) : null}
      <BadgeShelf all={all} earned={earned} lines={lines} failed={q.isError} total={q.data?.items.length} />
      <TrustProgress me={me} />
      <PassportSection q={passport} />
    </>
  );
}

/**
 * What their contributions did (Me.impact, GROWTH.md 1.3): route starts this week to toilets they added,
 * last verified or checked in at within 90 days. Counts only, never who. A dead "0 people" is never
 * shown: with no toilets yet it's a nudge, and with toilets but a quiet week it says so in words.
 */
function Impact({ me }: { me: Me }) {
  // Missing on a Me cached before the field existed.
  const { toilets, routedWeek } = me.impact ?? { toilets: 0, routedWeek: 0 };
  return (
    <section aria-labelledby="impact" className="flex flex-col gap-3">
      <h2 id="impact" className="flex items-center gap-2 text-2xl leading-tight">
        <HandHeart className="size-6 shrink-0 text-primary" aria-hidden /> Your impact
      </h2>
      <div className="flex flex-col gap-1 rounded-3xl border border-border/70 bg-surface p-4 shadow-rest tabular-nums">
        {toilets === 0 && routedWeek === 0 ? (
          <>
            <p className="font-extrabold">Nothing to count yet lah.</p>
            <p className="text-sm text-muted">
              Check in at a toilet, confirm one is still accurate or add a missing one. Then each week we&apos;ll show how many
              people were sent to the toilets you helped.
            </p>
          </>
        ) : (
          <>
            {routedWeek > 0 ? (
              <p className="font-bold">
                Your toilets helped <strong className="text-lg font-extrabold text-mint">{routedWeek}</strong>{" "}
                {routedWeek === 1 ? "person" : "people"} this week.
              </p>
            ) : (
              <p className="font-bold">Quiet week. Nobody was sent to your toilets in the last 7 days.</p>
            )}
            <p className="text-sm text-muted">
              {plural(toilets, "toilet")} helped: ones you added, verified or checked in at in the last 90 days.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/** Trusted reviewer: what it is, how far along they are, and what earns progress (backend TRUST_REASONS). */
function TrustProgress({ me }: { me: Me }) {
  const { score, threshold, isTrusted } = me.trust;
  const left = Math.max(0, threshold - score);
  return (
    <section aria-labelledby="trust" className="flex flex-col gap-3">
      <h2 id="trust" className="flex items-center gap-2 text-2xl leading-tight">
        <ShieldCheck className="size-6 shrink-0 text-primary" aria-hidden /> Trusted reviewer
      </h2>
      <div className="flex flex-col gap-2 rounded-3xl border border-border/70 bg-surface p-4 shadow-rest">
        {isTrusted ? (
          <p className="font-bold">
            You&apos;re a trusted reviewer. Your approval alone confirms a new toilet or an edit, from anywhere.
          </p>
        ) : (
          <>
            {/* The ladder says its prize up front (GROWTH.md 1.7), so the points have a point. */}
            <p className="font-bold tabular-nums">
              {left > 0
                ? `${plural(left, "point")} to Trusted. Then your single vote approves a toilet or an edit, from anywhere.`
                : `You have the ${threshold} points. Trusted means your single vote approves a toilet or an edit, from anywhere.`}
            </p>
            <div className="flex items-center gap-3">
              <p className="shrink-0 text-sm text-muted tabular-nums">
                <strong className="text-base font-extrabold text-fg">{Math.min(score, threshold)}</strong> of {threshold} points
              </p>
              <ProgressBar value={Math.min(score, threshold)} max={threshold} color="var(--primary)" thick />
            </div>
            <p className="text-sm">
              <strong className="font-extrabold">What counts:</strong> points other people back up. A toilet or edit you sent
              going live, someone confirming your status report, your review vote matching the outcome, and reviews with a photo.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function BadgeDetail({ b, got, lines }: { b: Badge; got: Badge | undefined; lines: LineProgress }) {
  const line = badgeLine(b.id);
  const pr = line ? lines.get(line) : undefined;
  return (
    <div className="flex items-start gap-3 rounded-3xl border border-border/70 bg-surface p-4 shadow-rest">
      <BadgeMedal id={b.id} earned={!!got} className="size-14" />
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">{b.name}</p>
        <p className="text-sm text-muted">{b.description}</p>
        {got ? (
          <p className="mt-1 text-xs font-bold text-accent">Earned {got.awardedAt ? formatDate(got.awardedAt) : ""}</p>
        ) : line && pr ? (
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar value={pr.stamped} max={pr.total} color={lineColor(line)} />
            <span className="shrink-0 text-xs font-bold text-muted tabular-nums">
              {pr.stamped} of {pr.total} stations
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BadgeShelf({
  all,
  earned,
  lines,
  failed,
  total,
}: {
  all: Badge[];
  earned: Map<string, Badge>;
  lines: LineProgress;
  failed: boolean;
  total: number | undefined;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const picked = all.find((b) => b.id === open) ?? null;
  return (
    <section aria-labelledby="badges" className="flex flex-col gap-3">
      <h2 id="badges" className="flex flex-wrap items-baseline gap-x-3 text-2xl leading-tight">
        Badges
        <span className="font-sans text-sm font-bold text-muted tabular-nums">
          {earned.size} of {total ?? "?"} earned
        </span>
      </h2>
      {failed ? <p className="text-sm text-muted">Couldn&apos;t load the full badge list.</p> : null}
      <ul className="grid grid-cols-5 gap-x-2 gap-y-3 rounded-3xl border border-border/70 bg-surface p-4 shadow-rest sm:grid-cols-10" aria-label="All badges">
        {all.map((b) => {
          const got = earned.has(b.id);
          return (
            <li key={b.id} className="flex justify-center">
              <button
                type="button"
                aria-pressed={open === b.id}
                onClick={() => setOpen(open === b.id ? null : b.id)}
                className={cx(
                  "flex size-14 items-center justify-center rounded-full ring-primary transition-[box-shadow,scale] duration-200 active:scale-95",
                  open === b.id ? "ring-3" : "ring-0",
                )}
              >
                {/* Re-keyed on pick so the squeeze replays every time a medal is chosen. */}
                <span key={open === b.id ? "on" : "off"} className={open === b.id ? "medal-tap" : undefined}>
                  <BadgeMedal id={b.id} earned={got} className="size-11" />
                </span>
                <span className="sr-only">
                  {b.name}, {got ? "earned" : "not earned yet"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div aria-live="polite">
        {picked ? (
          <div key={picked.id} className="rise-in">
            <BadgeDetail b={picked} got={earned.get(picked.id)} lines={lines} />
          </div>
        ) : (
          <p className="text-sm text-muted">Tap a badge to see what it&apos;s for.</p>
        )}
      </div>
    </section>
  );
}

/* ─────────────── progress: passport ─────────────── */

/** Passport progress as unrolling toilet paper; the roll's core wears the MRT line's colour (mint overall). */
function ProgressBar({ value, max, color, thick }: { value: number; max: number; color?: string; thick?: boolean }) {
  return <TpBar value={value} max={max} core={color ?? "var(--mint)"} size={thick ? "md" : "sm"} className="flex-1" aria-hidden />;
}

function PassportSection({ q }: { q: ReturnType<typeof useQuery<Passport>> }) {
  return (
    <section aria-labelledby="passport" className="flex flex-col gap-3">
      <h2 id="passport" className="flex items-center gap-2 text-2xl leading-tight">
        <Stamp className="size-6 shrink-0 text-primary" aria-hidden /> MRT toilet passport
      </h2>
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Spinner />
      ) : q.data ? (
        <PassportView p={q.data} />
      ) : null}
    </section>
  );
}

function PassportView({ p }: { p: Passport }) {
  const groups = useMemo(() => {
    const m = new Map<string, Passport["stations"]>();
    for (const s of p.stations) for (const l of s.lines.length ? s.lines : ["Other"]) m.set(l, [...(m.get(l) ?? []), s]);
    const order = Object.keys(MRT_LINES);
    return [...m.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [p.stations]);
  const started = groups.filter(([, st]) => st.some((s) => s.stampedAt));
  const rest = groups.filter(([, st]) => !st.some((s) => s.stampedAt));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="shrink-0 text-sm text-muted tabular-nums">
          <strong className="text-base font-extrabold text-mint">{p.stamped}</strong> of {p.total} stations stamped
        </p>
        <ProgressBar value={p.stamped} max={p.total} thick />
      </div>
      {started.length ? (
        <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest">
          {started.map(([line, stations]) => (
            <LineRow key={line} line={line} stations={stations} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Check in at any MRT station&apos;s toilet to stamp your first station.</p>
      )}
      {rest.length ? (
        <FoldDetails
          className="group/all"
          summaryClassName="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-surface-2 px-4 text-sm font-extrabold text-fg transition hover:brightness-110 [&::-webkit-details-marker]:hidden"
          summary={
            <>
              <ChevronDown className="size-4 transition-transform duration-200 group-data-expanded/all:rotate-180" aria-hidden />
              {started.length ? `Other lines (${rest.length})` : `All lines (${rest.length})`}
            </>
          }
        >
          {/* Padding, not margin: a fold can't measure a child's margin. */}
          <div className="pt-3">
            <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest">
              {rest.map(([line, stations]) => (
                <LineRow key={line} line={line} stations={stations} />
              ))}
            </ul>
          </div>
        </FoldDetails>
      ) : null}
    </div>
  );
}

function LineRow({ line, stations }: { line: string; stations: Passport["stations"] }) {
  const stamped = stations.filter((s) => s.stampedAt).length;
  const color = lineColor(line);
  const ink = lineTextColor(line);
  return (
    <li>
      <FoldDetails
        className="group/line"
        summaryClassName="flex min-h-14 cursor-pointer list-none flex-col justify-center gap-2 px-4 py-2.5 transition hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
        summary={
          <>
          <span className="flex items-center gap-2">
            <span aria-hidden>
              <LineBadge line={line} />
            </span>
            <span className="min-w-0 flex-1 truncate font-extrabold">{MRT_LINES[line]?.name ?? line}</span>
            <span className="text-sm font-extrabold tabular-nums">
              {stamped}
              <span className="font-medium text-muted">/{stations.length}</span>
              <span className="sr-only"> stamped</span>
            </span>
            <ChevronDown className="size-4 text-muted transition-transform duration-200 group-data-expanded/line:rotate-180" aria-hidden />
          </span>
          <ProgressBar value={stamped} max={stations.length} color={color} />
          </>
        }
      >
        <ul className="flex flex-wrap gap-2 px-4 pb-4 pt-1">
          {stations.map((s) => (
            <li
              key={`${line}-${s.venueId}`}
              className={cx(
                "flex min-h-8 items-center gap-1 rounded-full border-2 px-3 text-xs font-bold",
                s.stampedAt ? "shadow-gloss" : "border-border bg-transparent text-muted",
              )}
              style={s.stampedAt ? { background: color, borderColor: color, color: ink } : undefined}
              title={s.stampedAt ? `Stamped ${formatDate(s.stampedAt)}` : "Not visited yet"}
            >
              {s.stampedAt ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
              {s.name}
              <span className="sr-only">{s.stampedAt ? " (stamped)" : " (not yet)"}</span>
            </li>
          ))}
        </ul>
      </FoldDetails>
    </li>
  );
}

/* ─────────────── activity ─────────────── */

const REASON_LABELS: Record<string, string> = {
  SUBMISSION_APPROVED: "A toilet or edit you sent was approved",
  NEW_TOILET_SUBMITTED: "You added a toilet on site",
  NEW_TOILET_CONFIRMED: "Someone confirmed a toilet you added",
  REVIEW_POSTED: "Review",
  REVIEW_WITH_PHOTO: "Review with a photo",
  STATUS_CONFIRMED: "Someone confirmed your report",
  CHECK_IN: "Check-in",
  FIRST_CHECK_IN_AT_TOILET: "First check-in at a toilet",
  VOTE_MATCHED_OUTCOME: "Your review vote matched the outcome",
  SURVEY_COMPLETED: "Survey",
};

function ActivityTab() {
  return (
    <>
      <MySubmissions />
      <PointsHistory />
    </>
  );
}

function MySubmissions() {
  const q = useQuery({ queryKey: ["my-submissions"], queryFn: api.mySubmissions });
  return (
    <section aria-labelledby="mine" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mine" className="text-2xl leading-tight">
          Your submissions
        </h2>
        <Link href="/review" className={buttonClass("secondary", "sm")}>
          <ClipboardCheck className="size-4" aria-hidden /> Review others
        </Link>
      </div>
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Spinner />
      ) : !q.data?.items.length ? (
        <Card>
          <EmptyState
            title="Nothing submitted yet"
            mascot="happy"
            action={
              <Link href="/add" className={buttonClass("primary", "md")}>
                <MapPinPlus className="size-5" aria-hidden /> Add a toilet
              </Link>
            }
          >
            Add a toilet and earn 20 points once it&apos;s confirmed. Add it while you&apos;re there with a photo and it goes
            live straight away.
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.items.map((s) => (
            <li key={s.id}>
              <MySubmissionCard s={s} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One of their own submissions: one plain sentence for where it stands, then what's useful next
 * (who said what, a form when it needs more info, a link to ask someone nearby).
 */
function MySubmissionCard({ s }: { s: SubmissionView }) {
  const expiry = expiryText(s);
  // Flagged ones are for a moderator only; nobody nearby can move them, so there's nothing to share.
  const askable = (s.state === "PENDING" || s.state === "ESCALATED") && s.resolution !== "escalated_flagged";
  return (
    <Card className="flex flex-col gap-3" data-testid="my-submission">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-xl leading-tight">
            {s.toilet ? (
              <Link href={`/toilets/${encodeURIComponent(s.toilet.id)}`} className="underline decoration-primary/50 underline-offset-4 hover:decoration-primary">
                {submissionTitle(s)}
              </Link>
            ) : (
              submissionTitle(s)
            )}
          </h3>
          {s.toilet?.label ? <p className="font-bold text-muted">{s.toilet.label}</p> : null}
          <p className="mt-0.5 text-sm text-muted">
            {KIND_LABELS[s.kind]} · sent {formatDate(s.createdAt)}
          </p>
        </div>
        <StateBadge state={s.state} />
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-bold">{submitterSentence(s)}</p>
        {s.state === "ESCALATED" && s.resolutionText ? <p className="text-sm text-muted">{s.resolutionText}</p> : null}
        {s.resolutionNote ? (
          <p className="text-sm">
            <span className="font-extrabold">Moderator&apos;s note:</span> &ldquo;{s.resolutionNote}&rdquo;
          </p>
        ) : null}
        {expiry ? <p className="text-sm text-muted">{expiry}</p> : null}
      </div>

      {s.state === "NEEDS_INFO" ? <NeedsInfoForm s={s} /> : null}
      {askable ? <AskNearby s={s} /> : null}

      {s.reviewerNotes.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-extrabold">What reviewers said</p>
          <ReviewerNotes notes={s.reviewerNotes} />
        </div>
      ) : null}

      <FoldDetails
        className="group/sent"
        summaryClassName="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-extrabold text-primary [&::-webkit-details-marker]:hidden"
        summary={
          <>
            <ChevronDown className="size-4 transition-transform duration-200 group-data-expanded/sent:rotate-180" aria-hidden />
            What you sent
          </>
        }
      >
        {/* Padding, not margin: a fold can't measure a child's margin. */}
        <div className="flex flex-col gap-3 pt-2">
          <PhotoStrip s={s} />
          <PayloadView s={s} />
        </div>
      </FoldDetails>
    </Card>
  );
}

/**
 * Shares the one link that moves it forward: for a new toilet, its page with `?do=checkin` (a check-in
 * there counts as a confirmation); for an edit or closure, its card on /review (check-ins don't confirm those).
 */
function AskNearby({ s }: { s: SubmissionView }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const path =
      s.kind === "NEW_TOILET" && s.toilet
        ? `/toilets/${encodeURIComponent(s.toilet.id)}?do=checkin`
        : `/review?id=${encodeURIComponent(s.id)}`;
    const url = `${window.location.origin}${path}`;
    const text =
      s.kind === "NEW_TOILET"
        ? "Near this toilet? Check in on Shit Go Where to confirm it's there."
        : "Near this toilet? Help confirm this change on Shit Go Where.";
    const shared = (method: "native" | "copy") =>
      track("share", { what: "submission", method, kind: s.kind, ...(s.toilet ? { toilet_id: s.toilet.id } : {}) });
    if (navigator.share) {
      try {
        await navigator.share({ title: submissionTitle(s), text, url });
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
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button variant="secondary" size="sm" onClick={() => void share()}>
        <Share2 className="size-4" aria-hidden /> Ask someone nearby to confirm
      </Button>
      {/* Said in words, not only by an icon swap, for the moment it lasts. */}
      <span aria-live="polite" className="inline-flex items-center gap-1 text-sm font-extrabold text-mint">
        {copied ? (
          <>
            <Link2 className="size-4" aria-hidden /> Link copied
          </>
        ) : null}
      </span>
    </div>
  );
}

/** Reviewers or a moderator asked for more: add a note, a photo or the level, and it goes back for review. */
function NeedsInfoForm({ s }: { s: SubmissionView }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<PhotoRef[]>([]);
  const [level, setLevel] = useState("");
  const [uploading, setUploading] = useState(false);
  const body: UpdateSubmissionBody = {
    ...(note.trim() ? { note: note.trim() } : {}),
    ...(photos.length ? { photoIds: photos.map((p) => p.id) } : {}),
    ...(level.trim() && s.kind !== "CLOSE_TOILET" ? { level: level.trim() } : {}),
  };
  const empty = Object.keys(body).length === 0;
  const m = useMutation({
    mutationFn: () => api.updateSubmission(s.id, body),
    onSuccess: (updated) => {
      qc.setQueryData<{ items: SubmissionView[] }>(["my-submissions"], (old) =>
        old ? { items: old.items.map((x) => (x.id === updated.id ? updated : x)) } : old,
      );
    },
  });
  const id = `ni-${s.id}`;
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!empty) m.mutate();
      }}
    >
      <p className="flex items-center gap-2 font-extrabold">
        <PencilLine className="size-4 shrink-0" aria-hidden /> Add what&apos;s missing
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-sm font-bold">
          Note for reviewers
        </label>
        <textarea
          id={`${id}-note`}
          rows={3}
          maxLength={1000}
          className={inputClass}
          placeholder="E.g. it's past the lifts on the left, beside the nursing room"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {s.kind !== "CLOSE_TOILET" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-level`} className="text-sm font-bold">
            Level
          </label>
          <input
            id={`${id}-level`}
            className={inputClass}
            maxLength={20}
            placeholder="E.g. B1 or L3"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          />
        </div>
      ) : null}
      <div>
        <p className="mb-1.5 text-sm font-bold">Photo</p>
        <PhotoPicker value={photos} onChange={setPhotos} max={3} onBusyChange={setUploading} />
      </div>
      <Button type="submit" disabled={empty || uploading} loading={m.isPending}>
        Send for review again
      </Button>
      {empty ? <p className="text-sm text-muted">Add a note, the level or a photo to send it.</p> : null}
      {m.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(m.error)}
        </p>
      ) : null}
    </form>
  );
}

function PointsHistory() {
  const q = useInfiniteQuery({
    queryKey: ["me-activity"],
    queryFn: ({ pageParam }) => api.activity(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items: ActivityItem[] = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section aria-labelledby="points" className="flex flex-col gap-3">
      <h2 id="points" className="text-2xl leading-tight">
        Points
      </h2>
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Spinner />
      ) : !items.length ? (
        <p className="text-sm text-muted">No points yet. Check in at a toilet, review one or add a missing one to earn some.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest">
            {items.map((a) => (
              <li key={a.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                <span
                  className={cx(
                    "w-12 shrink-0 text-right font-extrabold tabular-nums",
                    a.delta >= 0 ? "text-accent" : "text-danger",
                  )}
                >
                  {a.delta >= 0 ? `+${a.delta}` : a.delta}
                </span>
                <span className="min-w-0 flex-1 font-bold">{REASON_LABELS[a.reason] ?? a.reason}</span>
                <span className="shrink-0 text-sm text-muted">{formatDate(a.createdAt)}</span>
              </li>
            ))}
          </ul>
          {q.hasNextPage ? (
            <Button variant="secondary" size="sm" className="self-start" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
              Show older
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ─────────────── settings ─────────────── */

/** A three-way pill switch, same material as the tab track. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  describedBy,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  describedBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className="relative grid gap-1 rounded-full bg-surface-2 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <SlidingPill index={options.findIndex((o) => o.value === value)} count={options.length} />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "relative min-h-11 rounded-full px-3 text-sm font-extrabold whitespace-nowrap transition-[color,scale] duration-200 active:scale-[0.97]",
            value === o.value ? "text-primary-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const row = "flex flex-col gap-2 px-4 py-3.5";
const actionRow = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left font-extrabold transition hover:bg-surface-2";

function SettingsTab({ me }: { me: Me }) {
  const qc = useQueryClient();
  const router = useRouter();
  const signOut = useSignOut();
  // The theme is read live from <html data-theme>, so it always shows the theme the boot script applied.
  const theme = useThemePref();
  // Settings only renders after /me loads in the browser, so reading storage here is safe.
  const [motion, setMotion] = useState<MotionPref>(getMotionPref);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const del = useMutation({
    mutationFn: api.deleteMe,
    onSuccess: async () => {
      await forgetSignedInCopies();
      qc.setQueryData(ME_KEY, null);
      await qc.invalidateQueries();
      router.push("/?deleted=1");
    },
  });

  return (
    <section aria-label="Settings" className="flex flex-col gap-6">
      <ul className="divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest">
        {me.handle ? (
          <li>
            <HandleChange me={me} />
          </li>
        ) : null}
        <li>
          <LeaderboardOptIn me={me} />
        </li>
        <li>
          <VerifierCredit me={me} />
        </li>
        <li>
          <TelegramLink me={me} />
        </li>
        <li className={row}>
          <span id="theme-label" className="font-extrabold">
            Theme
          </span>
          {/* Device first: following the phone is the default. */}
          <Segmented<ThemePref>
            label="Theme"
            value={theme}
            onChange={setThemePref}
            options={[
              { value: "system", label: "Device" },
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        </li>
        <li className={row}>
          <span className="font-extrabold">Motion</span>
          <Segmented<MotionPref>
            label="Motion"
            describedBy="motion-hint"
            value={motion}
            onChange={(v) => {
              setMotion(v);
              setMotionPref(v);
            }}
            options={[
              { value: "system", label: "Device" },
              { value: "reduce", label: "Reduced" },
              { value: "full", label: "Full" },
            ]}
          />
          <p id="motion-hint" className="text-sm text-muted">
            Reduced stops the pulsing button and the map ping, and swaps slides and bounces for fades.
          </p>
        </li>
      </ul>

      <ul className="divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest">
        <li>
          <Link href="/areas" className={actionRow}>
            <MapIcon className="size-5 text-muted" aria-hidden />
            <span className="flex-1">Toilets by area</span>
            <ChevronRight className="size-5 text-muted" aria-hidden />
          </Link>
        </li>
        {hasRole(me, "MODERATOR") ? (
          <li>
            <Link href="/admin" className={actionRow}>
              <Shield className="size-5 text-muted" aria-hidden />
              <span className="flex-1">Moderation</span>
              <ChevronRight className="size-5 text-muted" aria-hidden />
            </Link>
          </li>
        ) : null}
        <li>
          <button type="button" className={actionRow} onClick={() => void signOut()}>
            <LogOut className="size-5 text-muted" aria-hidden />
            Sign out
          </button>
        </li>
        <li>
          <button type="button" className={cx(actionRow, "text-danger")} onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-5" aria-hidden />
            Delete my account
          </button>
        </li>
      </ul>

      <MeFooter />

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete your account?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" disabled={typed !== "DELETE"} loading={del.isPending} onClick={() => del.mutate()}>
              Delete forever
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p>
            This permanently deletes your profile, email, handle, profile picture link, points, badges, check-ins and Telegram link,
            and signs you out everywhere.
          </p>
          <p>
            Toilets, edits, reviews, photos, status reports, votes and reports you contributed stay so the map remains useful, no
            longer linked to your name, email or handle. To have a particular review or photo removed, ask us first (see the{" "}
            <Link href="/privacy" className="font-bold text-primary underline">
              privacy notice
            </Link>
            ). This can&apos;t be undone.
          </p>
          <label htmlFor="confirm-delete" className="font-extrabold">
            Type DELETE to confirm
          </label>
          <input id="confirm-delete" className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          {del.isError ? (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(del.error)}
            </p>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
}

/** Changing an existing handle: once every 30 days (the first pick is free and lives in HandleSetup). */
function HandleChange({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState(me.handle ?? "");
  // Read once: the page doesn't need to tick over at midnight.
  const [now] = useState(Date.now);
  const lockedUntil = me.handleChangeableAt && new Date(me.handleChangeableAt).getTime() > now ? me.handleChangeableAt : null;
  const problem = handleProblem(handle, me.handle);
  const m = useMutation({
    mutationFn: () => api.updateMe({ handle }),
    onSuccess: (updated) => {
      qc.setQueryData(ME_KEY, updated);
      setOpen(false);
    },
  });
  const taken = isApiError(m.error) && m.error.status === 409;
  return (
    <div className={row}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-extrabold">Handle</span>
          <span className="block text-sm text-muted [overflow-wrap:anywhere]">
            @{me.handle}.{" "}
            {lockedUntil ? `You can change it again from ${formatDate(lockedUntil)}.` : "You can change it once every 30 days."}
          </span>
        </span>
        {!open ? (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={!!lockedUntil}
            onClick={() => {
              setHandle(me.handle ?? "");
              m.reset();
              setOpen(true);
            }}
          >
            <PencilLine className="size-4" aria-hidden /> Change
          </Button>
        ) : null}
      </div>
      {open ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) m.mutate();
          }}
        >
          <label htmlFor="new-handle" className="text-sm font-bold">
            New handle
          </label>
          <input
            id="new-handle"
            className={inputClass}
            value={handle}
            autoComplete="username"
            maxLength={20}
            onChange={(e) => {
              m.reset();
              setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
            }}
            aria-invalid={handle.length > 0 && !!problem}
            aria-describedby="new-handle-status new-handle-err"
          />
          <p id="new-handle-status" className={cx("text-sm", problem ? "text-muted" : "font-bold text-mint")} aria-live="polite">
            {problem ?? `Ready to save @${handle}. You won't be able to change it again for 30 days.`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" variant={problem ? "secondary" : "primary"} disabled={!!problem} loading={m.isPending}>
              Save
            </Button>
          </div>
          <p id="new-handle-err" role="alert" className="text-sm text-danger">
            {taken ? "That handle is taken. Try another one." : m.isError ? errorMessage(m.error) : ""}
          </p>
        </form>
      ) : null}
    </div>
  );
}

function LeaderboardOptIn({ me }: { me: Me }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const optIn = useMutation({
    mutationFn: (v: boolean) => api.updateMe({ leaderboardOptIn: v }),
    onSuccess: (m) => {
      qc.setQueryData(ME_KEY, m);
      void qc.invalidateQueries({ queryKey: ["lb-users"] });
    },
  });
  // Linked from the leaderboard as /me#leaderboard-optin, which opens this tab after /me loads.
  useEffect(() => {
    if (window.location.hash === OPTIN_HASH) ref.current?.scrollIntoView({ block: "center" });
  }, []);
  const noHandle = !me.handle;

  return (
    <div ref={ref} id="leaderboard-optin" className={cx(row, "scroll-mt-20")}>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block font-extrabold">Show me on the leaderboard</span>
          <span id="optin-help" className="block text-sm text-muted">
            {noHandle
              ? "Pick a handle above first. The leaderboard only lists handles."
              : `Others see only @${me.handle} and your points. Never your name, email, photo or where you checked in.`}
          </span>
        </span>
        <Switch
          checked={me.leaderboardOptIn}
          disabled={optIn.isPending || noHandle}
          describedBy="optin-help"
          onChange={(v) => optIn.mutate(v)}
        />
      </label>
      {optIn.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(optIn.error)}
        </p>
      ) : null}
      <Link href="/leaderboard" className="inline-flex min-h-11 items-center self-start text-sm font-bold text-primary underline">
        See the leaderboard
      </Link>
    </div>
  );
}

/** Credit on toilet pages (ToiletDetail.verifiedBy): "Last verified 2 hours ago by @handle". On by default. */
function VerifierCredit({ me }: { me: Me }) {
  const qc = useQueryClient();
  const credit = useMutation({
    mutationFn: (v: boolean) => api.updateMe({ verifierCredit: v }),
    onSuccess: (m) => {
      qc.setQueryData(ME_KEY, m);
      // Toilet pages already loaded carry the old credit line.
      void qc.invalidateQueries({ queryKey: ["toilet"] });
    },
  });
  const noHandle = !me.handle;

  return (
    <div className={row}>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block font-extrabold">Show my handle on toilets I check</span>
          <span id="credit-help" className="block text-sm text-muted">
            {noHandle
              ? "Pick a handle above first. Toilet pages only ever show handles."
              : `When you confirm a toilet is still accurate, its page credits you as @${me.handle}. Never your name or email.`}
          </span>
        </span>
        <Switch
          checked={me.verifierCredit}
          disabled={credit.isPending || noHandle}
          describedBy="credit-help"
          onChange={(v) => credit.mutate(v)}
        />
      </label>
      {credit.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(credit.error)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Connect Telegram (BOT.md T15). The API hands back a one-time t.me link (10 minutes); opening it starts
 * the bot, which links that chat and moves its banked points here. Same window, so phones hand the link
 * to the Telegram app. Sign-in never happens inside Telegram, so this row is the only way in.
 */
function TelegramLink({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [opened, setOpened] = useState(false);
  const connect = useMutation({
    mutationFn: api.telegramLinkToken,
    onSuccess: ({ url }) => {
      setOpened(true);
      window.location.href = url;
    },
  });
  const unlink = useMutation({
    mutationFn: api.unlinkTelegram,
    onSuccess: () => {
      setOpened(false);
      qc.setQueryData<Me | null>(ME_KEY, (m) => (m ? { ...m, telegramLinked: false } : m));
    },
  });
  // Back from Telegram: pick up the new link (window-focus refetch is off app-wide).
  useEffect(() => {
    if (!opened || me.telegramLinked) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void qc.invalidateQueries({ queryKey: ME_KEY });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [opened, me.telegramLinked, qc]);
  const failed = connect.error ?? unlink.error;

  return (
    <div className={row}>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <span>
          <span className="block font-extrabold">{me.telegramLinked ? "Telegram: linked" : "Connect Telegram"}</span>
          <span id="telegram-help" className="block text-sm text-muted">
            {me.telegramLinked
              ? "Check-ins and reports from the Telegram bot earn points on this account."
              : opened
                ? "Tap Start in Telegram to finish. The link works for 10 minutes."
                : "Find toilets from Telegram, and keep the points from check-ins you make there."}
          </span>
        </span>
        {me.telegramLinked ? (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            aria-describedby="telegram-help"
            loading={unlink.isPending}
            onClick={() => unlink.mutate()}
          >
            Unlink
          </Button>
        ) : (
          <Button
            size="sm"
            className="shrink-0"
            aria-describedby="telegram-help"
            loading={connect.isPending}
            onClick={() => connect.mutate()}
          >
            {opened ? "Open again" : "Connect"}
          </Button>
        )}
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(failed)}
        </p>
      ) : null}
    </div>
  );
}

function MeFooter() {
  const link = "flex min-h-11 items-center font-bold text-primary underline";
  return (
    <footer className="text-sm">
      <nav aria-label="About this app">
        <ul>
          <li>
            <Link href="/about" className={link}>
              How we rate toilets and where the data comes from
            </Link>
          </li>
          <li>
            <Link href="/privacy" className={link}>
              Privacy notice: how we handle your data
            </Link>
          </li>
          <li>
            <Link href="/terms" className={link}>
              Terms of use
            </Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
