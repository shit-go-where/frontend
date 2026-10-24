/**
 * The public origin for canonical URLs, the sitemap and robots.txt. Set NEXT_PUBLIC_SITE_URL once a
 * domain is bought; until then Vercel's production domain, then localhost for dev.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/+$/, "");

/**
 * The public contact address shown on /about and /privacy (a forwarding alias, never a personal
 * inbox). Unset means the pages fall back to in-app reporting only.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

/**
 * Where the survey scores come from: someone else's work, not ours, so every place that shows them credits it.
 * One author ran both rounds (the March 2024 pilot, FIELDWORK_2024, and the expanded Aug–Oct 2024 survey,
 * FIELDWORK_2024_EXPANDED) and asked to be credited by handle alone; the sentence around it says which round.
 */
export const SURVEY_URL = "https://www.reddit.com/r/SGExams/comments/1brmuvx/i_reviewed_150_toilets_ama/";
export const SURVEY_CREDIT = "u/eggmayosandwich";

/**
 * The Telegram bot (BOT.md), linked from /about, the map sheet and a few contextual moments. Defaults to the
 * live @ShitGoWhereBot so production shows it with no extra env; set NEXT_PUBLIC_TELEGRAM_BOT_URL to "off" to
 * hide every mention, or to another t.me link for a test bot. Inlined at build time.
 */
const TELEGRAM_ENV = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL?.trim().replace(/\/+$/, "");
export const TELEGRAM_BOT_URL =
  TELEGRAM_ENV?.toLowerCase() === "off" ? null : TELEGRAM_ENV || "https://t.me/ShitGoWhereBot";

/** "@ShitGoWhereBot", read off the link so a test bot names itself. */
export const TELEGRAM_BOT_HANDLE = TELEGRAM_BOT_URL ? `@${TELEGRAM_BOT_URL.split("/").pop()}` : null;

/**
 * Opens the bot asking for a location straight away (its /start handler reads the `near` payload; anything
 * it doesn't know falls through to the normal welcome).
 */
export function telegramStartUrl(payload: "near"): string | null {
  return TELEGRAM_BOT_URL ? `${TELEGRAM_BOT_URL}?start=${payload}` : null;
}
