import type { OpeningHours } from "./api/types";

/*
 * The next opening time, for "Closed now · Opens 7am". Mirrors the backend's reading of the
 * stored hours (backend/src/common/opening-hours.ts): Singapore time (UTC+8, no DST), days
 * 0 = Sun … 6 = Sat, and a close at or before the open runs past midnight. Raw OSM strings
 * are left to the Address & hours fold rather than parsed twice.
 */

const SGT_OFFSET_MS = 8 * 3_600_000;
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v < 1440 ? v : null;
}

/** "7am", "10:30am", "12pm". */
export function clockText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** When it next opens: days from today (0–7) and minutes since midnight, Singapore time. Null when unknown. */
export function nextOpening(hours: OpeningHours | null, now: Date = new Date()): { inDays: number; minutes: number } | null {
  if (!hours || hours.type !== "weekly" || !Array.isArray(hours.periods)) return null;
  const local = new Date(now.getTime() + SGT_OFFSET_MS);
  const today = local.getUTCDay();
  const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  let best: { inDays: number; minutes: number } | null = null;
  for (const p of hours.periods) {
    const open = minutesOf(p.open);
    if (open === null || !Array.isArray(p.days)) continue;
    for (const day of p.days) {
      // Today counts only if the opening is still ahead; otherwise its next turn is a week on.
      let inDays = (day - today + 7) % 7;
      if (inDays === 0 && open <= nowMin) inDays = 7;
      if (!best || inDays < best.inDays || (inDays === best.inDays && open < best.minutes)) best = { inDays, minutes: open };
    }
  }
  return best;
}

/** "Opens 7am", "Opens tomorrow 7am", "Opens Mon 10am"; null when the hours can't say. */
export function opensText(hours: OpeningHours | null, now: Date = new Date()): string | null {
  const next = nextOpening(hours, now);
  if (!next) return null;
  const at = clockText(next.minutes);
  if (next.inDays === 0) return `Opens ${at}`;
  if (next.inDays === 1) return `Opens tomorrow ${at}`;
  const day = (new Date(now.getTime() + SGT_OFFSET_MS).getUTCDay() + next.inDays) % 7;
  return `Opens ${DAY_SHORT[day]} ${at}`;
}
