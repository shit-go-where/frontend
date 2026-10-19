"use client";

import { ArrowDown, ChevronRight, CircleHelp, CircleSlash, DoorOpen, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { EmptyState, cx, inputClass } from "@/components/ui";
import type { StationLine, StationSummary } from "@/lib/api/types";
import { plural, timeAgo } from "@/lib/format";
import { LINE_ORDER, StationLineBadge, bestScoreText, sortLines, stationAnswer } from "./station-bits";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Word-start match, as on /areas: "pay" finds Paya Lebar and Toa Payoh, "ayoh" finds neither. */
function matches(name: string, q: string) {
  const n = norm(name);
  return n.startsWith(q) || n.includes(` ${q}`);
}

/** "130 have a toilet inside, 3 use the one next door, 1 has none and 50 aren't checked yet." */
function tally(items: StationSummary[]): string {
  const inside = items.filter((s) => s.toiletStatus === "HAS_TOILETS" && s.toiletCount > 0).length;
  const next = items.filter((s) => s.toiletStatus === "USES_NEARBY").length;
  const none = items.filter((s) => s.toiletStatus === "NONE").length;
  const unknown = items.filter((s) => s.toiletStatus === "UNKNOWN").length;
  const parts = [
    inside ? `${inside} ${inside === 1 ? "has a toilet" : "have a toilet"} inside` : null,
    next ? `${next} ${next === 1 ? "uses" : "use"} the one next door` : null,
    none ? `${none} ${none === 1 ? "has" : "have"} none` : null,
    unknown ? `${unknown} ${unknown === 1 ? "isn't" : "aren't"} checked yet` : null,
  ].filter((p): p is string => p !== null);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
  return `${plural(items.length, "station")}${list ? `: ${list}` : ""}.`;
}

/**
 * The answer at a glance. A toilet count carries the best score and how long since someone checked,
 * so a station of imports never reads as trustworthy as one that was surveyed.
 */
function Answer({ s }: { s: StationSummary }) {
  const answer = stationAnswer(s);
  if (s.toiletStatus === "HAS_TOILETS" && s.toiletCount > 0) {
    const score = bestScoreText(s);
    return (
      <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted tabular-nums">
        <span className="font-bold text-fg">{answer}</span>
        {score ? (
          <span className="inline-flex items-center gap-1 font-bold text-fg">
            <Sparkles className="size-3.5 text-accent" aria-hidden />
            {score}
          </span>
        ) : null}
        <span>{s.lastVerifiedAt ? `checked ${timeAgo(s.lastVerifiedAt)}` : "not checked in person yet"}</span>
      </span>
    );
  }
  const Icon = s.toiletStatus === "USES_NEARBY" ? DoorOpen : s.toiletStatus === "UNKNOWN" ? CircleHelp : CircleSlash;
  return (
    <span className={cx("flex items-center gap-1.5 text-sm", s.toiletStatus === "UNKNOWN" ? "text-muted" : "font-bold text-fg")}>
      <Icon className="size-4 shrink-0 text-muted" aria-hidden />
      {answer}
    </span>
  );
}

function StationRow({ s, except }: { s: StationSummary; except?: string }) {
  // Under a line's heading, only the other lines show: an interchange reads as one at a glance.
  const lines = sortLines(s.lines).filter((l) => l.code !== except);
  return (
    <li>
      <Link
        href={`/stations/${s.slug}`}
        className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-extrabold leading-snug">
            {s.name}
            {lines.map((l) => (
              <StationLineBadge key={l.code} line={l} />
            ))}
          </span>
          <span className="mt-0.5 block">
            <Answer s={s} />
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted transition-colors group-hover:text-primary" aria-hidden />
      </Link>
    </li>
  );
}

const LIST = "mt-3 divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest";

type Group = { line: StationLine; id: string; stations: StationSummary[] };

/** One group per line, MRT then LRT. An interchange is listed under every line it serves. */
function byLine(items: StationSummary[]): Group[] {
  const groups = new Map<string, Group>();
  for (const s of items) {
    for (const l of s.lines) {
      let g = groups.get(l.code);
      if (!g) groups.set(l.code, (g = { line: l, id: `line-${l.code.toLowerCase()}`, stations: [] }));
      g.stations.push(s);
    }
  }
  const at = (c: string) => (LINE_ORDER.includes(c) ? LINE_ORDER.indexOf(c) : LINE_ORDER.length);
  return [...groups.values()].sort((a, b) => at(a.line.code) - at(b.line.code) || a.line.name.localeCompare(b.line.name));
}

/**
 * Every station by line, with a name search on top. The server renders the full list (the query
 * starts empty), so search engines and no-JS get every station page linked.
 */
export function StationDirectory({ stations }: { stations: StationSummary[] }) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query);
  const nq = norm(q);
  const searching = nq.length > 0;
  const hits = useMemo(() => (nq ? stations.filter((s) => matches(s.name, nq)) : []), [stations, nq]);
  const groups = useMemo(() => byLine(stations), [stations]);
  const lineless = useMemo(() => stations.filter((s) => s.lines.length === 0), [stations]);
  const id = useId();

  return (
    <>
      <p className="mt-2 text-muted tabular-nums text-pretty">{tally(stations)}</p>

      <div className="mt-6">
        <label htmlFor={`${id}-q`} className="font-bold">
          Find a station
        </label>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id={`${id}-q`}
            type="search"
            inputMode="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="MRT or LRT station"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-describedby={`${id}-count`}
            className={cx(inputClass, "pr-12 pl-12 [&::-webkit-search-cancel-button]:hidden")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="tap absolute top-1/2 right-1 -translate-y-1/2 rounded-full text-muted hover:bg-surface hover:text-fg"
              aria-label="Clear search"
            >
              <X className="size-5" aria-hidden />
            </button>
          ) : null}
        </div>
        <p id={`${id}-count`} aria-live="polite" className="sr-only">
          {searching ? `${plural(hits.length, "station")} match` : ""}
        </p>
      </div>

      {searching ? (
        hits.length ? (
          <ul className={LIST} aria-label="Matching stations">
            {hits.map((s) => (
              <StationRow key={s.slug} s={s} />
            ))}
          </ul>
        ) : (
          <div className="mt-6 rounded-3xl border border-border/70 bg-surface shadow-rest">
            <EmptyState mascot="lost" title="Cannot find leh">
              <p>No station matches &ldquo;{q.trim()}&rdquo;. Check the spelling, or try the next station down the line.</p>
            </EmptyState>
          </div>
        )
      ) : (
        <>
          {groups.length >= 2 ? (
            <nav aria-label="Jump to a line" className="-mx-3 mt-4 flex flex-wrap gap-x-1">
              {groups.map((g) => (
                <a
                  key={g.id}
                  href={`#${g.id}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-extrabold text-primary hover:bg-surface-2"
                >
                  <ArrowDown className="size-4" aria-hidden />
                  <StationLineBadge line={g.line} />
                </a>
              ))}
            </nav>
          ) : null}
          {groups.map((g) => (
            <section
              key={g.id}
              id={g.id}
              aria-labelledby={`${g.id}-h`}
              className="mt-10 scroll-mt-6 first-of-type:mt-6 md:scroll-mt-24"
            >
              <h2 id={`${g.id}-h`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl leading-tight">
                {/* The badge keeps the sans (the display face is for the heading words), and is hidden from screen readers since the name follows. */}
                <span className="font-sans" aria-hidden>
                  <StationLineBadge line={g.line} />
                </span>
                {g.line.name}
                <span className="ml-auto font-sans text-sm font-bold text-muted tabular-nums">
                  {plural(g.stations.length, "station")}
                </span>
              </h2>
              <ul className={LIST}>
                {g.stations.map((s) => (
                  <StationRow key={s.slug} s={s} except={g.line.code} />
                ))}
              </ul>
            </section>
          ))}
          {lineless.length ? (
            <section aria-labelledby="line-other-h" className="mt-10">
              <h2 id="line-other-h" className="flex items-baseline gap-3 text-2xl leading-tight">
                Other stations
                <span className="ml-auto font-sans text-sm font-bold text-muted tabular-nums">
                  {plural(lineless.length, "station")}
                </span>
              </h2>
              <ul className={LIST}>
                {lineless.map((s) => (
                  <StationRow key={s.slug} s={s} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
