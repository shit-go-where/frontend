import type { LineRow } from "@/lib/api/types";
import { plural, scoreNumber } from "@/lib/format";
import { StationLineBadge } from "./station-bits";

/** "Checked lately" as plain words; null when the line has no checked toilets to measure. */
function freshText(r: LineRow): string {
  if (r.freshPct === null) return "No checked toilets yet";
  if (r.freshPct === 0) return "None checked in 90 days";
  return `${Math.round(r.freshPct)}% checked in 90 days`;
}

/**
 * The MRT line board (GROWTH.md 2.3): every line ranked by its stations' toilets. Each station counts
 * by its best toilet, and an interchange counts for every line it serves. Lines nobody has scored go
 * last and say so, rather than pretending to a rank.
 */
export function LineBoard({ rows }: { rows: LineRow[] }) {
  if (!rows.length) return null;
  const scored = rows.filter((r) => r.avgScore !== null);
  const worst = scored.at(-1);
  return (
    <section id="line-board" aria-labelledby="line-board-h" className="mt-8 scroll-mt-6">
      <h2 id="line-board-h" className="text-2xl leading-tight">
        Which line has the cleanest toilets?
      </h2>
      <p className="mt-1 text-sm text-muted text-pretty">
        Each station counts by its best toilet, and interchanges count for every line they serve.
        {worst && scored.length > 1 ? ` ${worst.name}, your stations need you. Check in next time you pass through.` : ""}
      </p>
      <ol className="mt-3 divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest">
        {rows.map((r) => (
          <li key={r.code} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <span className="w-8 shrink-0 text-center font-display text-xl leading-none tabular-nums text-muted">
              {r.avgScore === null ? "–" : r.rank}
              <span className="sr-only">{r.avgScore === null ? ", not ranked" : ""}</span>
            </span>
            <StationLineBadge line={{ code: r.code, name: r.name }} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-extrabold leading-tight text-balance">{r.name}</span>
              <span className="text-xs text-muted tabular-nums">
                {r.scoredStations
                  ? `${r.scoredStations} of ${plural(r.stations, "station")} scored`
                  : `${plural(r.stations, "station")}, none scored yet`}
                {" · "}
                {freshText(r)}
                {r.checkInsWeek ? ` · ${plural(r.checkInsWeek, "check-in")} this week` : ""}
              </span>
            </span>
            {r.avgScore === null ? null : (
              <span className="shrink-0 text-right">
                <span className="font-display text-xl leading-none tabular-nums">{scoreNumber(r.avgScore)}</span>
                <span className="text-sm font-bold text-muted">/10</span>
                <span className="sr-only"> average cleanliness</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
