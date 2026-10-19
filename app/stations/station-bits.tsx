/*
 * Shared by the station pages' server metadata and their client views: no directive, no hooks, so
 * both sides can import it.
 */
import { LineBadge } from "@/components/toilet-bits";
import type { StationLine, StationSummary } from "@/lib/api/types";
import { MRT_LINES, plural, scoreNumber } from "@/lib/format";

/** Line codes as stored on Venue.lines, in the order the network map reads: MRT first, then LRT. */
export const LINE_ORDER = ["NSL", "EWL", "NEL", "CCL", "DTL", "TEL", "BPLRT", "SKLRT", "PGLRT"];

export function sortLines(lines: StationLine[]): StationLine[] {
  const at = (c: string) => (LINE_ORDER.includes(c) ? LINE_ORDER.indexOf(c) : LINE_ORDER.length);
  return [...lines].sort((a, b) => at(a.code) - at(b.code));
}

/** "LRT" only when every line the station serves is an LRT line; "MRT" otherwise (and when lines are unknown). */
export function stationKind(lines: StationLine[]): "MRT" | "LRT" {
  return lines.length > 0 && lines.every((l) => /LRT$/.test(l.code)) ? "LRT" : "MRT";
}

/** "Bishan MRT", "Bakau LRT". A name that already says MRT or LRT is left alone. */
export function stationLabel(s: Pick<StationSummary, "name" | "lines">): string {
  return /\b(MRT|LRT)\b/i.test(s.name) ? s.name : `${s.name} ${stationKind(s.lines)}`;
}

/**
 * The station's toilet answer in a few plain words, the same on the index and in search results.
 * Absence is an answer here, never an error.
 */
export function stationAnswer(s: StationSummary): string {
  switch (s.toiletStatus) {
    case "NONE":
      return "No toilet in the station";
    case "USES_NEARBY":
      return "Uses the toilet next door";
    case "UNKNOWN":
      return "Not checked yet";
    default:
      return s.toiletCount > 0 ? `${plural(s.toiletCount, "toilet")} in the station` : "No open toilet on record";
  }
}

/** "Clean 8/10" for the station's best toilet, when someone has scored it. */
export function bestScoreText(s: Pick<StationSummary, "bestScore">): string | null {
  return s.bestScore === null ? null : `Clean ${scoreNumber(s.bestScore)}/10`;
}

/**
 * A line badge that also names the LRT lines to screen readers. The shared LineBadge only knows the
 * MRT line names (and LRT's grey is its fallback colour), so for those the station's own line name
 * stands in for its screen-reader text.
 */
export function StationLineBadge({ line }: { line: StationLine }) {
  if (MRT_LINES[line.code]) return <LineBadge line={line.code} />;
  return (
    <span className="inline-flex">
      <span aria-hidden className="inline-flex">
        <LineBadge line={line.code} />
      </span>
      <span className="sr-only">{line.name}</span>
    </span>
  );
}
