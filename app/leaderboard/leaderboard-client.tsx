"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, Coins, Crown, History, LoaderCircle, MapPin, Sparkles, TrainFront, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { ViewTransition, addTransitionType, startTransition, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { LineBadge, TierBadge, lastVerifiedText } from "@/components/toilet-bits";
import { holdChrome } from "@/components/route-transition";
import { TpBar } from "@/components/tp-bar";
import { Button, Card, Chip, EmptyState, ErrorState, PageHeader, Skeleton, buttonClass, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type { Me, ToiletLeaderboard, UserLeaderboard } from "@/lib/api/types";
import { areaSlug } from "@/lib/format";
import { ME_KEY, loginHref, useHydrated, useMe } from "@/lib/auth";
import { EASE_OUT, PANEL_IN, PANEL_OUT, reducedMotion } from "@/lib/motion";

const OPT_IN_HREF = "/me#leaderboard-optin";

/**
 * The heroes board opens once this many people have joined (GROWTH.md 1.9, decision G6). Before that
 * a near-empty podium makes the app look dead, so the page leads with the toilet rankings, which have
 * real scores from day one, and the heroes tab counts people in instead.
 */
const HEROES_MIN = 25;

/** People on the all-time board (joined, with points), capped at the API's top 100; undefined until known. */
function useHeroesJoined(): number | undefined {
  const q = useQuery({ queryKey: ["lb-users", "all"], queryFn: () => api.userLeaderboard("all") });
  return q.data?.items.length;
}

type Tab = "people" | "toilets";
type PersonRow = UserLeaderboard["items"][number];
type ToiletRow = ToiletLeaderboard["items"][number];

const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "people", label: "Toilet heroes", icon: Trophy },
  { value: "toilets", label: "Cleanest thrones", icon: Crown },
];

/*
 * Live re-rank. The board is a scoreboard, not a page that swaps: a new tab slides in from the side
 * you tapped, and a new time range or area re-ranks what's there. Every person and toilet is a named
 * view transition, so it glides to its new place (morphing between podium and list), newcomers rise
 * in, leavers drop away, and their numbers count to the new value. The header and tab bar hold still
 * while it plays, so the board passes under them. Reduced motion: it all just changes.
 * The CSS lives in globals.css ("Leaderboard re-rank").
 */
function animate(update: () => void, type: string) {
  if (reducedMotion()) return update();
  // The named entries are drawn above the live page; name the header and tab bar too so they stay on top.
  holdChrome();
  startTransition(() => {
    addTransitionType(type);
    update();
  });
}

/**
 * Keeps showing the board on screen while the next one loads, then swaps it in as one transition.
 * The first board just appears (the podium's own rise covers that).
 */
function useRerank<T>(data: T | undefined, fresh: boolean): T | undefined {
  const [shown, setShown] = useState<T | undefined>(undefined);
  useEffect(() => {
    if (!fresh || data === undefined || data === shown) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- server data arriving is the event being animated.
    if (shown === undefined) setShown(data);
    else animate(() => setShown(data), "lb-rerank");
  }, [data, fresh, shown]);
  return shown ?? (fresh ? data : undefined);
}

/** A view-transition name for one board entry (names must be plain CSS identifiers). */
const vtName = (kind: "p" | "t", key: string) => `lb-${kind}-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

function Entry({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <ViewTransition name={name} share="lb-move" update="lb-move" enter="lb-enter" exit="lb-exit">
      {children}
    </ViewTransition>
  );
}

export function LeaderboardClient() {
  // `picked` lights the tab on the tap itself; `tab` swaps the panel inside the view transition.
  const [picked, setPicked] = useState<Tab>("people");
  const [tab, setTab] = useState<Tab>("people");
  const id = useId();
  const qc = useQueryClient();
  // Fetch the other tab's board in the background, so switching shows its podium straight away.
  useEffect(() => {
    void qc.prefetchQuery({ queryKey: ["lb-toilets", ""], queryFn: () => api.toiletLeaderboard(undefined) });
  }, [qc]);
  // Until the heroes board opens, land on the toilets (unless they already picked a tab).
  const joined = useHeroesJoined();
  const touched = useRef(false);
  useEffect(() => {
    if (joined === undefined || joined >= HEROES_MIN || touched.current) return;
    // The board size arriving decides the opening tab.
    setPicked("toilets");
    setTab("toilets");
  }, [joined]);
  const pick = (next: Tab) => {
    touched.current = true;
    if (next === picked) return;
    const dir = TABS.findIndex((t) => t.value === next) > TABS.findIndex((t) => t.value === picked) ? "lb-tab-right" : "lb-tab-left";
    setPicked(next);
    animate(() => setTab(next), dir);
  };
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4">
      <PageHeader title="Leaderboard" subtitle="Who's the toilet hero of the week, and which loo is cleanest?" />
      <LeaderTabs value={picked} onChange={pick} id={id} />
      <div className="mt-6" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        <ViewTransition key={tab} enter={PANEL_IN} exit={PANEL_OUT} default="none">
          <div>{tab === "people" ? <People /> : <Toilets />}</div>
        </ViewTransition>
      </div>
    </div>
  );
}

/**
 * This page's own tabs: big glossy pills with an icon each, and one pink pill that slides under
 * whichever is picked. (Admin keeps the plain shared Tabs.) Arrow keys move between them.
 */
function LeaderTabs({ value, onChange, id }: { value: Tab; onChange: (t: Tab) => void; id: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = TABS.findIndex((t) => t.value === value);
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    onChange(TABS[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Leaderboard type" className="relative grid grid-cols-2 gap-1.5 rounded-[28px] bg-surface-2 p-1.5">
      {/* The pill: half the track less the padding and gap, slid across by one tab width plus the gap. */}
      <span
        aria-hidden
        className="absolute inset-y-1.5 left-1.5 w-[calc((100%-1.125rem)/2)] rounded-3xl bg-primary shadow-gloss transition-transform duration-[340ms] motion-reduce:transition-none"
        style={{ transform: `translateX(calc(${index} * (100% + 0.375rem)))`, transitionTimingFunction: EASE_OUT }}
      />
      {TABS.map((t, i) => {
        const on = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${id}-tab-${t.value}`}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls={`${id}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              // Phones stack the icon over the label, so "Cleanest thrones" never breaks across two lines.
              "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-3xl px-2 text-sm font-extrabold transition-[color,scale] duration-200 active:scale-[0.97] sm:flex-row sm:gap-2 sm:px-3 sm:text-base",
              on ? "text-primary-fg" : "text-muted hover:text-fg",
            )}
          >
            <Icon className={cx("size-5 shrink-0 transition-colors duration-200", !on && "text-accent")} aria-hidden />
            <span className="whitespace-nowrap leading-tight">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A board's filter sits under its heading, just above the podium, as the app's filter chips: loose
 * pills, not a track. Only the tabs above are a track, so the two never read as a second set of tabs.
 */
function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
  busy,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon: React.ComponentType<{ className?: string }> }[];
  onChange: (v: T) => void;
  busy?: boolean;
}) {
  return (
    <div role="group" aria-label={label} aria-busy={busy || undefined} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <Chip key={o.value} active={on} onClick={() => onChange(o.value)}>
            {/* Only while the picked board is on its way in. */}
            {on && busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
            {o.label}
          </Chip>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- numbers */

/** Last value each entry showed, so a number counts on from there even when its row remounts elsewhere. */
const lastShown = new Map<string, number>();
const COUNT_MS = 520;

/**
 * Counts to `value` from whatever this entry last showed. The final value reserves the width
 * (the display face has no tabular figures), so nothing around it shifts while it counts.
 */
function CountUp({ id, value, decimals = 0, className }: { id: string; value: number; decimals?: number; className?: string }) {
  const [shown, setShown] = useState(() => lastShown.get(id) ?? value);
  const shownRef = useRef(shown);
  // A layout effect, so counting starts in the same commit as a re-rank and runs while entries glide
  // (React holds passive effects until its view transition has finished).
  useLayoutEffect(() => {
    const from = shownRef.current;
    lastShown.set(id, value);
    if (from === value) return;
    let raf = 0;
    if (reducedMotion()) {
      raf = requestAnimationFrame(() => {
        shownRef.current = value;
        setShown(value);
      });
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / COUNT_MS);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = k === 1 ? value : from + (value - from) * eased;
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, value]);
  const fmt = (n: number) => (decimals ? n.toFixed(decimals) : String(Math.round(n)));
  return (
    <span className={cx("inline-grid", className)}>
      <span className="invisible col-start-1 row-start-1" aria-hidden>
        {fmt(value)}
      </span>
      <span className="col-start-1 row-start-1 text-right" aria-hidden>
        {fmt(shown)}
      </span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- podium */

const PLACE = ["1st", "2nd", "3rd"] as const;
/** Visual order is 2nd, 1st, 3rd; the DOM stays 1, 2, 3 so screen readers hear the ranks in order. */
const PODIUM_COL = ["col-start-2", "col-start-1", "col-start-3"];
/** Each step is a stack of toilet rolls: 1st three layers high, gold-wrapped; 2nd two, silver; 3rd one, bronze. */
const STEP = [
  { wrap: "text-accent", layers: 3, height: "h-28 sm:h-36", delay: "180ms" },
  { wrap: "text-silver", layers: 2, height: "h-20 sm:h-24", delay: "90ms" },
  { wrap: "text-bronze", layers: 1, height: "h-12 sm:h-14", delay: "0ms" },
];

/**
 * One roll, side on: a wrapped body (its colour is currentColor) under a cream paper face with
 * the cardboard core, outlined in Poo Ink like the mascot, with the vinyl gloss and shade.
 */
function Roll() {
  return (
    <svg viewBox="0 0 48 40" className="block w-full" aria-hidden>
      <path d="M3 9v22c0 3.9 9.4 7 21 7s21-3.1 21-7V9z" fill="currentColor" stroke="var(--poo-ink)" strokeWidth="1.4" />
      <path d="M9 13v19.5" stroke="#fff" strokeOpacity=".45" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M38 14.5v18" stroke="#000" strokeOpacity=".14" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="24" cy="9" rx="21" ry="7" fill="var(--rim)" stroke="var(--poo-ink)" strokeWidth="1.4" />
      <ellipse cx="24" cy="9" rx="14" ry="4.6" fill="none" stroke="var(--poo)" strokeOpacity=".35" strokeWidth="1" />
      <ellipse cx="24" cy="9" rx="7" ry="2.6" fill="#c9a27a" stroke="var(--poo-ink)" strokeWidth="1" />
      <ellipse cx="24" cy="9.3" rx="4.6" ry="1.5" fill="var(--poo-ink)" />
    </svg>
  );
}

/**
 * Layers of rolls, two across on phones and three from sm up. Upper layers sit on the paper faces
 * below (painted after them, overlapping by the face's depth: about 23% of a roll's width).
 */
function RollStack({ place }: { place: number }) {
  const s = STEP[place];
  return (
    <div
      className={cx("podium-rise relative flex w-full flex-col-reverse", s.wrap)}
      style={{ "--podium-delay": s.delay } as React.CSSProperties}
    >
      {Array.from({ length: s.layers }, (_, l) => (
        <div key={l} className={cx("flex w-full", l > 0 && "-mb-[11.5%] sm:-mb-[7.6%]")}>
          <div className="flex-1">
            <Roll />
          </div>
          <div className="flex-1">
            <Roll />
          </div>
          <div className="hidden flex-1 sm:block">
            <Roll />
          </div>
        </div>
      ))}
      {/* The rank on a cream sticker across the front of the stack. */}
      <span className="absolute bottom-[12%] left-1/2 z-10 -translate-x-1/2 rounded-full bg-rim px-3 py-1 font-display text-xl leading-none text-poo-ink shadow-gloss ring-2 ring-poo-ink sm:text-2xl">
        {PLACE[place]}
      </span>
    </div>
  );
}

/**
 * The top three on chunky steps. The steps stay put; the entries on them are named transitions,
 * so a re-rank moves people on and off the podium. Missing places read "Could be you".
 */
function Podium<T>({
  items,
  label,
  keyOf,
  render,
}: {
  items: T[];
  label: string;
  keyOf: (item: T) => string;
  render: (item: T, place: number) => React.ReactNode;
}) {
  return (
    <ol aria-label={label} className="grid grid-cols-3 items-end gap-2 pt-6 sm:gap-3">
      {[0, 1, 2].map((i) => {
        const item = items[i];
        return (
          <li key={i} className={cx("row-start-1 flex min-w-0 flex-col items-center", PODIUM_COL[i])}>
            <div className="flex w-full min-w-0 flex-1 flex-col items-center gap-1 pb-2 text-center">
              {/* Keyed by the winner, so a new winner gets the crown landing on them afresh. */}
              {i === 0 ? (
                <Crown
                  key={`crown-${item ? keyOf(item) : "none"}`}
                  className="crown-land size-8 text-accent drop-shadow-[0_2px_0_rgb(0_0_0/0.35)]"
                  aria-hidden
                />
              ) : null}
              {item ? (
                // Keyed by the entry, not the place: a new occupant is a new element, so it morphs in from wherever it was.
                <Entry key={keyOf(item)} name={keyOf(item)}>
                  <div className="flex w-full min-w-0 flex-col items-center gap-1">{render(item, i + 1)}</div>
                </Entry>
              ) : (
                <span className="py-2 text-sm font-bold text-muted">Could be you</span>
              )}
            </div>
            <RollStack place={i} />
          </li>
        );
      })}
    </ol>
  );
}

function PodiumSkeleton() {
  return (
    <div className="grid grid-cols-3 items-end gap-2 pt-6 sm:gap-3" aria-hidden>
      {[1, 0, 2].map((i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className={cx("w-full rounded-b-none rounded-t-3xl", STEP[i].height)} />
        </div>
      ))}
    </div>
  );
}

/** Rows below the podium: a plain rank number, nothing fancy, so the stage keeps the spotlight. */
function RankNo({ rank }: { rank: number }) {
  return (
    <span className="w-8 shrink-0 text-center font-display text-lg leading-none text-muted">
      <span className="sr-only">Rank </span>
      {rank}
    </span>
  );
}

/* ---------------------------------------------------------------- people */

function Initial({ handle, big }: { handle: string; big?: boolean }) {
  // Handle only: the board never shows a photo that could identify someone.
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-extrabold text-fg",
        big ? "size-12 text-lg ring-[3px] ring-surface" : "size-9",
      )}
      aria-hidden
    >
      {handle.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Points({ handle, points, big }: { handle: string; points: number; big?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <CountUp id={`p:${handle}`} value={points} className={cx("font-display leading-none text-accent", big ? "text-2xl" : "text-xl")} />
      <span className="text-sm font-bold text-muted">pts</span>
    </span>
  );
}

function People() {
  const [scope, setScope] = useState<"week" | "all">("week");
  const meQ = useMe();
  // Unknown (undefined) until hydrated: the server never knows who is signed in.
  const me = useHydrated() ? meQ.data : undefined;
  const q = useQuery({
    queryKey: ["lb-users", scope],
    queryFn: () => api.userLeaderboard(scope),
    placeholderData: keepPreviousData,
  });
  const board = useRerank(q.data, !q.isPlaceholderData);
  const joined = useHeroesJoined();
  const open = joined === undefined || joined >= HEROES_MIN;
  const items = open ? (board?.items ?? []) : [];
  const empty = !!board && !items.length;
  // Like the area heading: the board on screen decides the words, so they change with the re-rank.
  const [shownScope, setShownScope] = useState(scope);
  if (board === q.data && !q.isPlaceholderData && shownScope !== scope) setShownScope(scope);
  const when = shownScope === "week" ? "this week" : "all time";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl leading-tight">{shownScope === "week" ? "Heroes of the week" : "Heroes of all time"}</h2>
        <p className="text-sm text-muted">Ranked by points from adding, reviewing and checking in. Only people who join are listed.</p>
      </div>

      <FilterChips
        label="Time range"
        value={scope}
        onChange={setScope}
        busy={q.isPlaceholderData && q.isFetching}
        options={[
          { value: "week", label: "This week", icon: CalendarDays },
          { value: "all", label: "All time", icon: History },
        ]}
      />

      {q.isError && !board ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !board ? (
        <PodiumSkeleton />
      ) : !open ? (
        <HeroesOpening joined={joined ?? 0} me={me} />
      ) : empty ? null : (
        // An empty board says so once, in the card below, not with three empty steps as well.
        <Podium
          items={items}
          label={shownScope === "week" ? "Top three this week" : "Top three of all time"}
          keyOf={(r: PersonRow) => vtName("p", r.handle)}
          render={(r: PersonRow, place) => (
            <>
              <Initial handle={r.handle} big />
              <span className="w-full truncate font-extrabold">@{r.handle}</span>
              <Points handle={r.handle} points={r.points} big={place === 1} />
            </>
          )}
        />
      )}

      <YourStanding me={me} board={board} empty={empty} when={when} />

      {empty && open ? <PeopleEmpty me={me} scope={shownScope} /> : null}

      {items.length > 3 ? (
        <ol className="flex flex-col gap-1.5" aria-label={shownScope === "week" ? "Everyone else this week" : "Everyone else, all time"}>
          {items.slice(3).map((r) => {
            const isMe = !!me?.handle && r.handle === me.handle;
            return (
              <Entry key={r.handle} name={vtName("p", r.handle)}>
                <li
                  className={cx(
                    "flex min-h-14 items-center gap-3 rounded-2xl border bg-surface px-3 py-2 shadow-rest",
                    isMe ? "border-primary ring-2 ring-primary" : "border-border/70",
                  )}
                >
                  <RankNo rank={r.rank} />
                  <Initial handle={r.handle} />
                  <span className="min-w-0 flex-1 truncate font-extrabold">
                    @{r.handle}
                    {isMe ? <span className="ml-1.5 text-sm font-medium text-muted">(you)</span> : null}
                  </span>
                  <Points handle={r.handle} points={r.points} />
                </li>
              </Entry>
            );
          })}
        </ol>
      ) : null}

      <HowPoints />
    </div>
  );
}

/**
 * Where you stand, and how close the next place is. Worked out from the board itself:
 * the lowest-scoring person still above you is the one to overtake.
 */
function YourStanding({ me, board, empty, when }: { me: Me | null | undefined; board?: UserLeaderboard; empty: boolean; when: string }) {
  const qc = useQueryClient();
  const optIn = useMutation({
    mutationFn: () => api.updateMe({ leaderboardOptIn: true }),
    onSuccess: (m) => {
      qc.setQueryData(ME_KEY, m);
      void qc.invalidateQueries({ queryKey: ["lb-users"] });
    },
  });

  // Not known yet: show nothing rather than a sign-in prompt a signed-in person would see flash by.
  if (me === undefined) return null;
  // Signed out on an empty board: the empty state below carries the sign-in.
  if (!me && empty) return null;
  if (!me) {
    return (
      <Card className="border-primary/50 bg-primary-soft!">
        <p>
          <Link href={loginHref("/leaderboard")} className="font-bold text-primary underline">
            Sign in
          </Link>{" "}
          to earn points for adding, reviewing and checking in.
        </p>
      </Card>
    );
  }
  if (!me.leaderboardOptIn) {
    return (
      <Card className="flex flex-col gap-3 border-primary/50 bg-primary-soft!">
        <p>
          You have <strong className="font-extrabold tabular-nums">{me.points}</strong> points. The board only lists people who join. Only your
          handle and points are shown, never your name or email.
        </p>
        {me.handle ? (
          <Button className="self-start" loading={optIn.isPending} onClick={() => optIn.mutate()}>
            Join the leaderboard
          </Button>
        ) : (
          <Link href="/me" className={buttonClass("primary", "md", "self-start")}>
            Pick a handle to join
          </Link>
        )}
        {optIn.isError ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(optIn.error)}
          </p>
        ) : null}
      </Card>
    );
  }
  const mine = board?.me;
  if (!mine) return null;

  const above = (board?.items ?? []).filter((r) => r.points > mine.points && r.handle !== me.handle).at(-1);
  const onTop = mine.rank === 1;
  const gap = above ? above.points - mine.points + 1 : 0;
  const progress = above ? Math.max(0.04, Math.min(1, mine.points / (above.points + 1))) : 1;

  return (
    <Card className="flex flex-col gap-2 border-primary bg-primary-soft! ring-2 ring-primary">
      {onTop ? <h2 className="text-xl leading-tight">Defend the throne lah!</h2> : null}
      <p className="flex items-center gap-3">
        <span className="font-display text-3xl leading-none">{mine.rank ? `#${mine.rank}` : "–"}</span>
        <span>
          {mine.rank ? "That's you, with " : "Not ranked yet, with "}
          <strong className="font-extrabold tabular-nums">{mine.points}</strong> points {when}.
        </span>
      </p>
      {onTop ? (
        <p className="text-sm font-semibold">You&apos;re in first place. Keep checking in to stay there.</p>
      ) : above ? (
        <>
          <TpBar
            value={progress}
            max={1}
            role="progressbar"
            aria-label={`Progress towards overtaking @${above.handle}`}
            aria-valuemin={0}
            aria-valuemax={above.points + 1}
            aria-valuenow={mine.points}
          />
          <p className="text-sm font-semibold">
            <span className="tabular-nums">{gap}</span> pt{gap === 1 ? "" : "s"} to overtake @{above.handle}
          </p>
        </>
      ) : (
        <p className="text-sm font-semibold">Earn your first points to get on the board.</p>
      )}
    </Card>
  );
}

/** The heroes board before it opens: how many have joined, and how to be one of them. */
function HeroesOpening({ joined, me }: { joined: number; me: Me | null | undefined }) {
  const left = HEROES_MIN - joined;
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-xl leading-tight">
        <Users className="size-5 text-accent" aria-hidden />
        The board opens at {HEROES_MIN} heroes
      </h3>
      <TpBar
        value={joined}
        max={HEROES_MIN}
        role="progressbar"
        aria-label="Heroes who have joined"
        aria-valuemin={0}
        aria-valuemax={HEROES_MIN}
        aria-valuenow={joined}
      />
      <p>
        <strong className="font-extrabold tabular-nums">{joined}</strong> joined so far, <span className="tabular-nums">{left}</span> more
        to go. Early ones get the Founding Contributor badge: the first 100 people to check in or add a toilet keep it for good.
      </p>
      {me === null ? (
        <Link href={loginHref("/leaderboard")} className={buttonClass("primary", "md", "self-start")}>
          Sign in to join
        </Link>
      ) : null}
    </Card>
  );
}

function PeopleEmpty({ me, scope }: { me: Me | null | undefined; scope: "week" | "all" }) {
  const when = scope === "week" ? "this week" : "yet";
  return (
    <Card>
      <EmptyState
        title="Nobody yet leh"
        mascot="lost"
        action={
          !me ? (
            <Link href={loginHref("/leaderboard")} className={buttonClass("primary", "md")}>
              Sign in to join
            </Link>
          ) : !me.leaderboardOptIn ? (
            // The card above already has the Join button; this is the settings route to the same switch.
            <Link href={OPT_IN_HREF} className={buttonClass("secondary", "md")}>
              Leaderboard settings
            </Link>
          ) : (
            <Link href="/" className={buttonClass("primary", "md")}>
              Find a toilet to check in
            </Link>
          )
        }
      >
        <p>
          No one who has joined the leaderboard has points {when}. The board only lists people who turn it on in their profile.
        </p>
      </EmptyState>
    </Card>
  );
}

/** Values from the API's points ledger (backend/src/gamification/points.service.ts). */
const POINT_RULES: { label: string; points: string }[] = [
  { label: "A toilet you added is confirmed by people nearby or a moderator", points: "+20" },
  { label: "An edit or closure you sent is approved", points: "+20" },
  // An on-site toilet with a photo goes live at once: 5 now and 15 when the next person checks in, so it still totals 20.
  { label: "Someone else checks in at a toilet you added that went live straight away", points: "+15" },
  { label: "Add a toilet on site with a photo (it goes live straight away)", points: "+5" },
  { label: "Post a review", points: "+5" },
  { label: "Add a photo to your review", points: "+5" },
  { label: "First check-in at a toilet", points: "+3" },
  { label: "Your vote matches the final review decision", points: "+2" },
  { label: "Someone confirms your status report", points: "+2" },
  { label: "Check in at a toilet (up to 5 a day)", points: "+1" },
];

/** A menu of ways to score: each value a gold coin sticker beside its action. */
function HowPoints() {
  return (
    <section aria-labelledby="how-points" className="mt-4">
      <h2 id="how-points" className="mb-3 text-xl leading-tight">
        How points work
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {POINT_RULES.map((r) => (
          <li key={r.label} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/70 bg-surface px-3 py-2 shadow-rest">
            <span className="flex h-10 min-w-14 shrink-0 items-center justify-center gap-1 rounded-full bg-accent px-2.5 text-accent-fg shadow-gloss">
              <Coins className="size-4" aria-hidden />
              <span className="font-display text-lg leading-none">{r.points}</span>
              <span className="sr-only"> points</span>
            </span>
            <span className="text-sm font-semibold leading-snug">{r.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- toilets */

/** Score, plus the survey total that breaks ties between equal scores (the order is otherwise unexplained). */
function Score({ r, big }: { r: ToiletRow; big?: boolean }) {
  const survey = r.toilet.surveyTotal;
  return (
    <span className={cx("flex flex-col", big ? "items-center" : "items-end")}>
      <span className="inline-flex items-baseline gap-1">
        <Sparkles className="size-4 self-center text-accent" aria-hidden />
        <CountUp id={`t:${r.toilet.id}`} value={r.score} decimals={1} className={cx("font-display leading-none", big ? "text-2xl" : "text-xl")} />
        <span className="text-sm font-bold text-muted">/10</span>
        <span className="sr-only"> cleanliness</span>
      </span>
      {survey !== null ? <span className="text-xs font-semibold text-muted tabular-nums">survey {survey}/50</span> : null}
    </span>
  );
}

function Toilets() {
  const [area, setArea] = useState("");
  const q = useQuery({
    queryKey: ["lb-toilets", area],
    queryFn: () => api.toiletLeaderboard(area || undefined),
    placeholderData: keepPreviousData,
  });
  const board = useRerank(q.data, !q.isPlaceholderData);
  const areas = board?.areas ?? [];
  const items = board?.items ?? [];
  // The heading follows the board on screen, so it changes with the re-rank, not before it.
  const [shownArea, setShownArea] = useState(area);
  if (board === q.data && !q.isPlaceholderData && shownArea !== area) setShownArea(area);
  const where = shownArea || "Singapore";
  const busy = q.isPlaceholderData && q.isFetching;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl leading-tight">Cleanest in {where}</h2>
        <p className="text-sm text-muted">
          Ranked by cleanliness score out of 10, from surveys and reviews. Equal scores are split by the in-person survey total.
        </p>
        {shownArea ? (
          <Link
            href={`/areas/${areaSlug(shownArea)}`}
            className="-my-2 inline-flex min-h-11 items-center self-start text-sm font-bold text-primary underline underline-offset-2 hover:decoration-[3px]"
          >
            Every toilet in {shownArea}, scored or not
          </Link>
        ) : null}
      </div>

      {/* The area filter, in the same place and chip shape as the People tab's time range. A native
          select (keyboard and screen readers get the real thing), sized to its choice like a chip. */}
      <div className="relative max-w-full self-start">
        <label htmlFor="area" className="sr-only">
          Planning area
        </label>
        <MapPin
          className={cx("pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-primary", busy && "animate-pulse")}
          aria-hidden
        />
        <select
          id="area"
          aria-busy={busy || undefined}
          className="field-sizing-content min-h-11 max-w-full cursor-pointer appearance-none truncate rounded-full border-2 border-border bg-surface-2 pl-10 pr-10 text-sm font-bold text-fg transition duration-150 hover:border-primary/60 focus:border-primary"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          <option value="">All of Singapore</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      </div>

      {q.isError && !board ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !board ? (
        <PodiumSkeleton />
      ) : !items.length ? (
        <Card>
          <EmptyState
            title="No scores here yet"
            mascot="happy"
            action={
              <Link href="/" className={buttonClass("primary", "md")}>
                Find a toilet to review
              </Link>
            }
          >
            <p>No toilet in {shownArea || "this area"} has a cleanliness score yet. Review one and it shows up here.</p>
          </EmptyState>
        </Card>
      ) : (
        <>
          <Podium
            items={items}
            label={`Top three cleanest in ${where}`}
            keyOf={(r: ToiletRow) => vtName("t", r.toilet.id)}
            render={(r: ToiletRow, place) => (
              <Link
                href={`/toilets/${r.toilet.id}`}
                className="flex w-full min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-1 transition hover:bg-surface"
              >
                <span className={cx("line-clamp-2 w-full font-extrabold leading-tight", place === 1 ? "text-base" : "text-sm")}>
                  {r.toilet.venue.name}
                </span>
                <TierBadge tier={r.toilet.tier} />
                <Score r={r} big />
                <span className="text-xs leading-snug text-muted">{lastVerifiedText(r.toilet)}</span>
              </Link>
            )}
          />
          {items.length > 3 ? (
            <ol className="flex flex-col gap-1.5" aria-label={`More of the cleanest in ${where}`}>
              {items.slice(3).map((r) => (
                <Entry key={r.toilet.id} name={vtName("t", r.toilet.id)}>
                  <li>
                    <Link
                      href={`/toilets/${r.toilet.id}`}
                      className="flex min-h-16 items-center gap-3 rounded-2xl border border-border/70 bg-surface px-3 py-2 shadow-rest transition hover:brightness-110"
                    >
                      <RankNo rank={r.rank} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-extrabold">{r.toilet.venue.name}</span>
                          {r.toilet.venue.lines.map((l) => (
                            <LineBadge key={l} line={l} className="shrink-0" />
                          ))}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <TierBadge tier={r.toilet.tier} />
                          <span className="text-xs text-muted">{lastVerifiedText(r.toilet)}</span>
                        </span>
                      </span>
                      <Score r={r} />
                    </Link>
                  </li>
                </Entry>
              ))}
            </ol>
          ) : null}
        </>
      )}
      <Link
        href="/stations#line-board"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-primary underline underline-offset-2 hover:decoration-[3px]"
      >
        <TrainFront className="size-4" aria-hidden />
        Which MRT line has the cleanest toilets?
      </Link>
      <Link href="/" className={buttonClass("secondary", "md", "mt-2 self-start")}>
        Back to map
      </Link>
    </div>
  );
}
