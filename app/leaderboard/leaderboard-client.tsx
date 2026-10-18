"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LineBadge, TierBadge, lastVerifiedText } from "@/components/toilet-bits";
import { Button, Card, Chip, EmptyState, ErrorState, PageHeader, Spinner, Tabs, buttonClass, cx, inputClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { ME_KEY, loginHref, useMe } from "@/lib/auth";

const OPT_IN_HREF = "/me#leaderboard-optin";

export function LeaderboardClient() {
  const [tab, setTab] = useState<"people" | "toilets">("people");
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4">
      <PageHeader title="Leaderboard" subtitle="Who's the toilet hero of the week, and which loo is cleanest?" />
      <Tabs
        label="Leaderboard type"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "people", label: "People" },
          { value: "toilets", label: "Toilets" },
        ]}
      />
      <div className="mt-4" role="tabpanel">
        {tab === "people" ? <People /> : <Toilets />}
      </div>
    </div>
  );
}

/** Rank number; the top three sit on a medal disc (gold, silver, bronze from tokens). */
function RankMark({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? "bg-accent text-accent-fg shadow-gloss"
      : rank === 2
        ? "border-2 border-muted/60 bg-surface-2 text-fg shadow-gloss"
        : rank === 3
          ? "border-2 border-warn/60 bg-warn-soft text-warn shadow-gloss"
          : "";
  return (
    <span
      className={cx(
        "flex size-10 shrink-0 items-center justify-center rounded-full font-display text-lg leading-none",
        medal || "text-muted",
      )}
    >
      <span className="sr-only">Rank </span>
      {rank}
    </span>
  );
}

function People() {
  const [scope, setScope] = useState<"week" | "all">("week");
  const { data: me } = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lb-users", scope], queryFn: () => api.userLeaderboard(scope) });
  const optIn = useMutation({
    mutationFn: () => api.updateMe({ leaderboardOptIn: true }),
    onSuccess: (m) => {
      qc.setQueryData(ME_KEY, m);
      void qc.invalidateQueries({ queryKey: ["lb-users"] });
    },
  });

  const empty = q.isSuccess && !q.data.items.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="group" aria-label="Time range">
        {(["week", "all"] as const).map((s) => (
          <Chip key={s} active={scope === s} onClick={() => setScope(s)}>
            {s === "week" ? "This week" : "All time"}
          </Chip>
        ))}
      </div>

      {/* Your standing. Signed out with an empty board, the empty state carries the sign-in. */}
      {!me && empty ? null : !me ? (
        <Card className="border-primary/50 bg-primary-soft!">
          <p>
            <Link href={loginHref("/leaderboard")} className="font-bold text-primary underline">
              Sign in
            </Link>{" "}
            to earn points for adding, reviewing and checking in.
          </p>
        </Card>
      ) : !me.leaderboardOptIn ? (
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
      ) : q.data?.me ? (
        <Card className="border-primary/50 bg-primary-soft!">
          <p>
            You&apos;re <strong className="font-extrabold tabular-nums">{q.data.me.rank ? `#${q.data.me.rank}` : "unranked"}</strong> with{" "}
            <strong className="font-extrabold tabular-nums">{q.data.me.points}</strong> points {scope === "week" ? "this week" : "all time"}.
          </p>
        </Card>
      ) : null}

      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Spinner />
      ) : !q.data?.items.length ? (
        <PeopleEmpty me={me} scope={scope} />
      ) : (
        <ol className="flex flex-col gap-2" aria-label={scope === "week" ? "Top contributors this week" : "Top contributors of all time"}>
          {q.data.items.map((r) => {
            const isMe = !!me?.handle && r.handle === me.handle;
            return (
              <li
                key={`${r.rank}-${r.handle}`}
                className={cx(
                  "flex min-h-16 items-center gap-3 rounded-3xl border bg-surface px-3 py-2 shadow-rest",
                  isMe ? "border-primary ring-2 ring-primary" : "border-border/70",
                )}
              >
                <RankMark rank={r.rank} />
                {/* Handle only: the board never shows a photo that could identify someone. */}
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft font-extrabold text-fg" aria-hidden>
                  {r.handle.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-extrabold">
                  @{r.handle}
                  {isMe ? <span className="ml-1.5 text-sm font-medium text-muted">(you)</span> : null}
                </span>
                <span className="flex shrink-0 items-baseline gap-1">
                  <span className="font-display text-xl leading-none text-accent">{r.points}</span>
                  <span className="text-sm font-bold text-muted">pts</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <HowPoints />
    </div>
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
  { label: "A toilet you added is approved", points: "+20" },
  { label: "Post a review", points: "+5" },
  { label: "Add a photo to your review", points: "+5" },
  { label: "First check-in at a toilet", points: "+3" },
  { label: "Your vote matches the final review decision", points: "+2" },
  { label: "Someone confirms your status report", points: "+2" },
  { label: "Check in at a toilet (up to 5 a day)", points: "+1" },
];

function HowPoints() {
  return (
    <section aria-labelledby="how-points" className="mt-4">
      <h2 id="how-points" className="mb-3 text-xl leading-tight">
        How points work
      </h2>
      <dl className="divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface text-sm shadow-rest">
        {POINT_RULES.map((r) => (
          <div key={r.label} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
            <dt>{r.label}</dt>
            <dd className="shrink-0 font-display text-lg leading-none text-mint">{r.points}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Toilets() {
  const [area, setArea] = useState("");
  const q = useQuery({ queryKey: ["lb-toilets", area], queryFn: () => api.toiletLeaderboard(area || undefined) });
  const areas = q.data?.areas ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="area" className="font-extrabold">
          Planning area
        </label>
        <select id="area" className={cx(inputClass, "cursor-pointer rounded-full font-bold")} value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">All of Singapore</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <h2 className="text-2xl leading-tight">Cleanest in {area || "Singapore"}</h2>
        <p className="text-sm text-muted">Ranked by cleanliness score out of 10, from surveys and reviews.</p>
      </div>
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Spinner />
      ) : !q.data?.items.length ? (
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
            <p>No toilet in {area || "this area"} has a cleanliness score yet. Review one and it shows up here.</p>
          </EmptyState>
        </Card>
      ) : (
        <ol className="flex flex-col gap-2">
          {q.data.items.map((r) => (
            <li key={r.toilet.id}>
              <Link
                href={`/toilets/${r.toilet.id}`}
                className="flex items-center gap-3 rounded-3xl border border-border/70 bg-surface px-3 py-3 shadow-rest transition hover:brightness-110"
              >
                <RankMark rank={r.rank} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-extrabold">{r.toilet.venue.name}</span>
                  {r.toilet.label ? <span className="truncate text-sm text-muted">{r.toilet.label}</span> : null}
                  <span className="flex flex-wrap items-center gap-1.5">
                    <TierBadge tier={r.toilet.tier} />
                    {r.toilet.venue.lines.map((l) => (
                      <LineBadge key={l} line={l} />
                    ))}
                  </span>
                  <span className="text-xs text-muted">{lastVerifiedText(r.toilet)}</span>
                </span>
                <span className="inline-flex shrink-0 items-baseline gap-1">
                  <Sparkles className="size-4 self-center text-accent" aria-hidden />
                  <span className="font-display text-xl leading-none">{r.score.toFixed(1)}</span>
                  <span className="text-sm font-bold text-muted">/10</span>
                  <span className="sr-only"> cleanliness</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <Link href="/" className={buttonClass("secondary", "md", "mt-2 self-start")}>
        Back to map
      </Link>
    </div>
  );
}
