/**
 * Toilet levels, mirroring backend/src/common/level.ts: normalizeLevel and levelOrder here must
 * behave exactly like the backend's (e2e/level.spec.ts runs the same cases). The backend
 * normalises every level it stores; this copy keeps what people type tidy before it is sent, and
 * sorts pins and lists by floor.
 *
 * Singapore convention: ground is L1, the floor below it B1 (there is no level 0).
 */

/** Separators between levels in one value: "B1; L3", "B1, L3", "B1/L3", "B1 & L3", "B1 and L3". */
const LIST_SPLIT = /\s*(?:;|,|\/|&|\band\b)\s*/i;

/** One level, or null when it doesn't look like one. Input is trimmed, lower case, single spaces. */
function normalizeOne(s: string): string | null {
  if (/^(?:ground(?: floor| level)?|g|gf)$/.test(s)) return "L1";
  if (/^(?:mezzanine|mezz|m)$/.test(s)) return "M";
  if (s === "basement") return "B1";
  const basement = /^(?:basement|b) ?-? ?0*(\d+)$/.exec(s) ?? /^- ?0*(\d+)$/.exec(s);
  if (basement) {
    const n = Number(basement[1]);
    return n > 0 ? `B${n}` : null;
  }
  // "level 3", "lvl 3", "l3", "#03", "#03-12" (a unit number: level 3, unit 12), "3", "03", "3rd floor".
  const level =
    /^(?:level|lvl|lv|l|floor|flr|fl|storey) ?\.? ?0*(\d+)$/.exec(s) ??
    /^# ?0*(\d+)(?:-\w+)?$/.exec(s) ??
    /^0*(\d+)(?:st|nd|rd|th)?(?: (?:floor|storey|level))?$/.exec(s);
  if (level) {
    const n = Number(level[1]);
    // Level 0 is the ground floor in OpenStreetMap's numbering, which is L1 here.
    return `L${Math.max(1, n)}`;
  }
  const unitInBasement = /^# ?b ?0*(\d+)(?:-\w+)?$/.exec(s);
  if (unitInBasement && Number(unitInBasement[1]) > 0) return `B${Number(unitInBasement[1])}`;
  return null;
}

/**
 * "basement 1", "b1", "B01", "-1" → "B1"; "level 3", "l3", "lvl 3", "3", "03", "#03" → "L3";
 * "ground", "g", "gf", "ground floor" → "L1"; "mezzanine", "m" → "M". Lists ("B1, L3", "b1 & 3")
 * become "B1; L3". Anything else is kept as typed (trimmed). Empty → null.
 */
export function normalizeLevel(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const parts = raw
    .split(LIST_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const normalised = parts.map((p) => normalizeOne(p.toLowerCase().replace(/\s+/g, " ")));
  // Nothing in it reads as a level: keep exactly what was typed ("Block 2/3", "Roof garden").
  if (normalised.every((n) => n === null)) return raw;
  const out: string[] = [];
  normalised.forEach((n, i) => {
    const one = n ?? parts[i];
    if (!out.includes(one)) out.push(one);
  });
  return out.join("; ");
}

/** "B2" → -2, "L3" → 3, "M" → 1.5. */
function orderOne(level: string): number | null {
  if (level === "M") return 1.5;
  const m = /^([BL])(\d+)$/.exec(level);
  if (!m) return null;
  return m[1] === "B" ? -Number(m[2]) : Number(m[2]);
}

/**
 * Sort key for a level: B<n> → -n, L<n> → n, M → 1.5; a list → its lowest level; unknown → null.
 * Accepts un-normalised input too (rows written before normalisation).
 */
export function levelOrder(level: string | null | undefined): number | null {
  const norm = normalizeLevel(level);
  if (!norm) return null;
  const orders = norm
    .split("; ")
    .map(orderOne)
    .filter((n): n is number => n !== null);
  return orders.length ? Math.min(...orders) : null;
}

/** The floors offered as chips when adding or editing a toilet, lowest first. "Other…" opens a text field. */
export const LEVEL_CHIPS = ["B3", "B2", "B1", "L1", "L2", "L3", "L4", "L5", "L6"] as const;

/** Lowest floor first; unknown floors last, keeping their order. */
export function compareLevelOrder(a: number | null | undefined, b: number | null | undefined): number {
  return (a ?? Infinity) - (b ?? Infinity);
}

/** The distinct floors of some toilets, lowest first: "B1; L3" counts for both, unreadable levels for none. */
export function distinctLevels(items: { level: string | null | undefined }[]): { level: string; order: number }[] {
  const seen = new Map<string, number>();
  for (const t of items) {
    for (const part of levelParts(t.level)) {
      const order = levelOrder(part);
      if (order !== null && !seen.has(part)) seen.set(part, order);
    }
  }
  return [...seen].map(([level, order]) => ({ level, order })).sort((a, b) => a.order - b.order);
}

/** The parts of a level value ("B1; L3" → ["B1", "L3"]), normalised. */
export function levelParts(level: string | null | undefined): string[] {
  const norm = normalizeLevel(level);
  return norm ? norm.split("; ") : [];
}

/** Compact, for chips, map tags and the floor picker: "B1", "L3", "M", "B1, L3"; free text as typed. */
export function levelShort(level: string | null | undefined): string | null {
  const parts = levelParts(level);
  return parts.length ? parts.join(", ") : null;
}

/** Spelled out, for sentences and cards: "Level 3", "Basement 1", "Mezzanine", "Basement 1 and level 3". */
export function levelText(level: string | null | undefined): string | null {
  const parts = levelParts(level).map((p) => {
    const m = /^([BL])(\d+)$/.exec(p);
    if (m) return `${m[1] === "B" ? "Basement" : "Level"} ${m[2]}`;
    if (p === "M") return "Mezzanine";
    return /^level\b/i.test(p) ? p : `Level ${p}`;
  });
  if (!parts.length) return null;
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  // Later parts read as one phrase: "Basement 1 and level 3".
  return parts.length === 1 ? joined : joined.charAt(0) + joined.slice(1).replace(/\b(Level|Basement|Mezzanine)\b/g, (w) => w.toLowerCase());
}
