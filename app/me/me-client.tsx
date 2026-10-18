"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Camera,
  Check,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Flame,
  LogOut,
  Map as MapIcon,
  MapPinPlus,
  Moon,
  NotebookPen,
  Repeat,
  Shield,
  ShieldCheck,
  Stamp,
  Toilet,
  TrainFront,
  Trash2,
  TreePalm,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { SubmissionCard } from "@/app/review/review-client";
import { Mascot } from "@/components/mascot";
import { LineBadge } from "@/components/toilet-bits";
import { Button, Card, Dialog, EmptyState, ErrorState, Spinner, buttonClass, cx, inputClass } from "@/components/ui";
import { api, errorMessage, isApiError } from "@/lib/api/client";
import type { Badge, Me, Passport, Role } from "@/lib/api/types";
import { ME_KEY, hasRole, useRequireAuth, useSignOut } from "@/lib/auth";
import { MRT_LINES, formatDate, lineColor, lineTextColor } from "@/lib/format";
import { getThemePref, setThemePref, type ThemePref } from "@/lib/theme";

const ROLE_LABELS: Record<Role, string> = { USER: "Member", TRUSTED: "Trusted", MODERATOR: "Moderator", ADMIN: "Admin" };

export function MeClient() {
  const meQ = useRequireAuth();
  if (meQ.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <ErrorState message={errorMessage(meQ.error)} onRetry={() => void meQ.refetch()} />
      </div>
    );
  }
  if (meQ.isLoading || !meQ.data) return <Spinner label="Loading your profile" />;
  const me = meQ.data;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pb-8 pt-4">
      {me.needsHandle ? <HandleSetup me={me} /> : null}
      <Profile me={me} />
      <LeaderboardOptIn me={me} />
      <Badges me={me} />
      <PassportSection />
      <MySubmissions />
      <Settings me={me} />
      <MeFooter />
    </div>
  );
}

function Profile({ me }: { me: Me }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-4">
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
          <h1 className="text-2xl leading-tight [overflow-wrap:anywhere] sm:text-[2rem]">{me.handle ? `@${me.handle}` : me.displayName}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            <span className="min-w-0 truncate">{me.displayName}</span>
            {me.role !== "USER" ? (
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-extrabold text-fg">{ROLE_LABELS[me.role]}</span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 py-2 pl-4 pr-3">
        <p className="flex items-baseline gap-2">
          <span className="font-display text-5xl leading-none text-accent">{me.points}</span>
          <span className="font-bold text-muted">points</span>
        </p>
        <Mascot mood="happy" className="size-16" />
      </div>
    </Card>
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
        <div className="flex min-w-0 flex-1 items-center rounded-full border-2 border-border bg-surface pl-4 focus-within:border-primary has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
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
      <p id="handle-status" className={cx("mt-2 text-sm", problem ? "text-muted" : "font-bold text-ok")} aria-live="polite">
        {problem ?? `Ready to save @${handle}.`}
      </p>
      <p id="handle-err" role="alert" className="text-sm text-danger">
        {taken ? "That handle is taken. Try another one." : m.isError ? errorMessage(m.error) : ""}
      </p>
    </Card>
  );
}

function LeaderboardOptIn({ me }: { me: Me }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLElement>(null);
  const optIn = useMutation({
    mutationFn: (v: boolean) => api.updateMe({ leaderboardOptIn: v }),
    onSuccess: (m) => {
      qc.setQueryData(ME_KEY, m);
      void qc.invalidateQueries({ queryKey: ["lb-users"] });
    },
  });
  // The page renders after /me loads, so the browser's own #hash jump misses this section.
  useEffect(() => {
    if (window.location.hash === "#leaderboard-optin") ref.current?.scrollIntoView({ block: "start" });
  }, []);
  const noHandle = !me.handle;

  return (
    <section ref={ref} id="leaderboard-optin" aria-labelledby="leaderboard-optin-title" className="scroll-mt-20">
      <h2 id="leaderboard-optin-title" className="mb-3 text-2xl leading-tight">
        Leaderboard
      </h2>
      <Card className="flex flex-col gap-3">
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block font-extrabold">Show me on the leaderboard</span>
            <span id="optin-help" className="block text-sm text-muted">
              {noHandle
                ? "Pick a handle above first. The leaderboard only lists handles."
                : `Others see only @${me.handle} and your points. Never your name, email, photo or where you checked in.`}
            </span>
          </span>
          <span className="relative inline-flex shrink-0">
            <input
              type="checkbox"
              role="switch"
              className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              checked={me.leaderboardOptIn}
              disabled={optIn.isPending || noHandle}
              aria-describedby="optin-help"
              onChange={(e) => optIn.mutate(e.target.checked)}
            />
            <span
              aria-hidden
              className="flex h-8 w-14 items-center rounded-full border-2 border-border bg-surface-2 p-0.5 transition peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50 [&>span]:transition peer-checked:[&>span]:translate-x-6 peer-checked:[&>span]:bg-primary-fg"
            >
              <span className="size-6 rounded-full bg-muted shadow-gloss" />
            </span>
          </span>
        </label>
        {optIn.isError ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(optIn.error)}
          </p>
        ) : null}
        <Link href="/leaderboard" className="inline-flex min-h-11 items-center self-start font-bold text-primary underline">
          See the leaderboard
        </Link>
      </Card>
    </section>
  );
}

/* ─────────────── badges ─────────────── */

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
          ? "-rotate-6 border-[3px] border-[#fff8ef] bg-accent text-accent-fg shadow-[var(--gloss),0_3px_0_rgb(0_0_0/0.35)]"
          : "rotate-3 border-[3px] border-[#fff8ef]/55 bg-surface-2 text-muted opacity-80 shadow-[0_2px_0_rgb(0_0_0/0.3)] grayscale",
        className ?? "size-12",
      )}
      aria-hidden
    >
      {createElement(badgeIcon(id), { className: "size-1/2", strokeWidth: earned ? 2.25 : 1.75 })}
    </span>
  );
}

function Badges({ me }: { me: Me }) {
  const q = useQuery({ queryKey: ["badges"], queryFn: api.badges, staleTime: 10 * 60_000 });
  const passport = useQuery({ queryKey: ["passport"], queryFn: api.passport });
  const earned = useMemo(() => new Map<string, Badge>(me.badges.map((b) => [b.id, b])), [me.badges]);
  const all = useMemo(() => q.data?.items ?? me.badges, [q.data, me.badges]);
  const lines = useMemo(() => lineProgress(passport.data), [passport.data]);
  const nextUp = useMemo(
    () =>
      all
        .filter((b) => !earned.has(b.id))
        .sort((a, b) => effort(a, lines) - effort(b, lines))
        .slice(0, 3),
    [all, earned, lines],
  );
  const total = q.data?.items.length;
  const mine = all.filter((b) => earned.has(b.id));

  return (
    <section aria-labelledby="badges" className="flex flex-col gap-4">
      <h2 id="badges" className="flex flex-wrap items-baseline gap-x-3 text-2xl leading-tight">
        Badges
        <span className="font-sans text-base font-bold text-muted tabular-nums">
          {me.badges.length} of {total ?? "?"} earned
        </span>
      </h2>
      {q.isError ? <p className="text-sm text-muted">Couldn&apos;t load the full badge list.</p> : null}

      {mine.length ? (
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-4 shadow-rest">
        <div className="flex items-center gap-3">
          <Mascot mood="celebrating" className="size-14" />
          <p className="font-display text-lg leading-tight">
            Shiok! {mine.length} badge{mine.length === 1 ? "" : "s"} collected
          </p>
        </div>
        <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4" aria-label="Badges you've earned">
          {mine.map((b) => {
            const got = earned.get(b.id);
            return (
              <li key={b.id} className="flex flex-col items-center gap-2 text-center" title={b.description}>
                <BadgeMedal id={b.id} earned className="size-16" />
                <span className="text-sm font-extrabold leading-tight">{b.name}</span>
                <span className="text-xs text-muted">{got?.awardedAt ? formatDate(got.awardedAt) : "Earned"}</span>
              </li>
            );
          })}
        </ul>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-4 shadow-rest">
          <Mascot mood="happy" className="size-14" />
          <p className="font-bold text-muted">No badges yet. Here&apos;s what&apos;s closest.</p>
        </div>
      )}

      {nextUp.length && q.data ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-lg">Next up</h3>
          <ul className="flex flex-col gap-2">
            {nextUp.map((b) => {
              const line = badgeLine(b.id);
              const pr = line ? lines.get(line) : undefined;
              return (
                <li key={b.id} className="flex items-start gap-3 rounded-3xl border border-border/70 bg-surface p-3 shadow-rest">
                  <BadgeMedal id={b.id} earned={false} className="size-14" />
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">{b.name}</p>
                    <p className="text-sm text-muted">{b.description}</p>
                    {line && pr ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <ProgressBar value={pr.stamped} max={pr.total} color={lineColor(line)} />
                        <span className="shrink-0 text-xs font-bold text-muted tabular-nums">
                          {pr.stamped} of {pr.total} stations
                        </span>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {q.data && all.length ? (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-surface-2 px-4 font-extrabold text-fg transition hover:brightness-110 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
            See all {all.length} badges
          </summary>
          <ul className="mt-3 flex flex-col divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest">
            {all.map((b) => {
              const got = earned.get(b.id);
              return (
                <li key={b.id} className="flex items-center gap-3 p-3">
                  <BadgeMedal id={b.id} earned={!!got} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">{b.name}</p>
                    <p className="text-sm text-muted">{b.description}</p>
                  </div>
                  <span className={cx("shrink-0 text-xs font-bold", got ? "text-accent" : "text-muted")}>
                    {got ? (got.awardedAt ? formatDate(got.awardedAt) : "Earned") : "Not yet"}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/* ─────────────── passport ─────────────── */

function ProgressBar({ value, max, color, thick }: { value: number; max: number; color?: string; thick?: boolean }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className={cx("block flex-1 overflow-hidden rounded-full bg-surface-2", thick ? "h-2.5" : "h-1.5")} aria-hidden>
      <span
        className="block h-full rounded-full bg-mint"
        style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }}
      />
    </span>
  );
}

function PassportSection() {
  const q = useQuery({ queryKey: ["passport"], queryFn: api.passport });
  return (
    <section aria-labelledby="passport">
      <h2 id="passport" className="mb-1 flex items-center gap-2 text-2xl leading-tight">
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
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">Check in at an MRT station&apos;s toilet to stamp it.</p>
      <div className="flex items-center gap-3">
        <p className="flex shrink-0 items-baseline gap-1.5">
          <strong className="font-display text-4xl leading-none text-mint">{p.stamped}</strong>
          <span className="font-bold text-muted tabular-nums">of {p.total} stations stamped</span>
        </p>
        <ProgressBar value={p.stamped} max={p.total} thick />
      </div>
      <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest">
        {groups.map(([line, stations]) => {
          const stamped = stations.filter((s) => s.stampedAt).length;
          const color = lineColor(line);
          const ink = lineTextColor(line);
          return (
            <li key={line}>
              <details className="group">
                <summary className="flex min-h-14 cursor-pointer list-none flex-col justify-center gap-2 px-4 py-2.5 transition hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
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
                    <ChevronDown className="size-4 text-muted transition group-open:rotate-180" aria-hidden />
                  </span>
                  <ProgressBar value={stamped} max={stations.length} color={color} />
                </summary>
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
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─────────────── submissions ─────────────── */

function MySubmissions() {
  const q = useQuery({ queryKey: ["my-submissions"], queryFn: api.mySubmissions });
  return (
    <section aria-labelledby="mine">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="mine" className="text-2xl leading-tight">
          My submissions
        </h2>
        <Link href="/review" className={buttonClass("secondary", "md")}>
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
            Add a toilet and earn 20 points when it&apos;s approved.
          </EmptyState>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.items.map((s) => (
            <li key={s.id}>
              <SubmissionCard s={s} readOnly />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─────────────── settings ─────────────── */

function Settings({ me }: { me: Me }) {
  const qc = useQueryClient();
  const router = useRouter();
  const signOut = useSignOut();
  // Settings only renders after /me loads in the browser, so reading storage here is safe.
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const del = useMutation({
    mutationFn: api.deleteMe,
    onSuccess: async () => {
      qc.setQueryData(ME_KEY, null);
      await qc.invalidateQueries();
      router.push("/?deleted=1");
    },
  });

  return (
    <section aria-labelledby="settings" className="flex flex-col gap-3">
      <h2 id="settings" className="text-2xl leading-tight">
        Settings
      </h2>
      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="theme" className="font-extrabold">
            Theme
          </label>
          <select
            id="theme"
            className={cx(inputClass, "w-auto cursor-pointer rounded-full font-bold")}
            value={theme}
            onChange={(e) => {
              const v = e.target.value as ThemePref;
              setTheme(v);
              setThemePref(v);
            }}
          >
            <option value="dark">Dark (default)</option>
            <option value="light">Light</option>
            <option value="system">Match device</option>
          </select>
        </div>
      </Card>

      {hasRole(me, "MODERATOR") ? (
        <Link href="/admin" className={buttonClass("secondary", "md")}>
          <Shield className="size-4" aria-hidden /> Moderation
        </Link>
      ) : null}

      <Button variant="secondary" onClick={() => void signOut()}>
        <LogOut className="size-4" aria-hidden /> Sign out
      </Button>
      <Button variant="ghost" className="text-danger" onClick={() => setConfirmOpen(true)}>
        <Trash2 className="size-4" aria-hidden /> Delete my account
      </Button>

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
            This removes your profile, email, points and badges. Toilets, reviews and photos you contributed stay on the map but are
            no longer linked to you. This can&apos;t be undone.
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

function MeFooter() {
  const link = "flex min-h-11 items-center font-bold text-primary underline";
  return (
    <footer className="border-t border-border/70 pt-3 text-sm">
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
        </ul>
      </nav>
    </footer>
  );
}
