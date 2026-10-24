import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, ChevronRight, Mail } from "lucide-react";
import { Mascot } from "@/components/mascot";
import { buttonClass } from "@/components/styles";
import { getAreasServer } from "@/lib/api/server";
import { CONTACT_EMAIL, TELEGRAM_BOT_HANDLE, TELEGRAM_BOT_URL } from "@/lib/site";
import { EMAIL_SUBJECT, INTRO, LINKEDIN_URL, NAME, PERSONAL_SITE_URL, SHIT_GO_WHERE, liveNumbersLine } from "./content";

const description = "Dylan Chua, the creator of Shit Go Where: why I built it, and where to find out more about me.";

export const metadata: Metadata = {
  title: "Who made this?",
  description,
  alternates: { canonical: "/creator" },
  openGraph: { title: "Who made this? · Shit Go Where", description, url: "/creator", type: "profile" },
};

// Reading-page patterns shared with /about.
const link = "font-bold text-primary underline hover:decoration-[3px]";
const external = { target: "_blank", rel: "noopener noreferrer" } as const;
const newTab = <span className="sr-only"> (opens in a new tab)</span>;

interface LiveCounts {
  toilets: number;
  verified: number;
  areas: number;
}

/**
 * The app's own numbers, from the same public read /areas uses. Cached for a day; when the API can't be
 * reached (CI builds have none) it answers null, cached for minutes so the page picks the numbers up
 * soon after, and the page leaves them out rather than showing zeros. Everything is caught in here, so
 * /creator never fails to render over them.
 */
async function getLiveCounts(): Promise<LiveCounts | null> {
  "use cache";
  try {
    const areas = await getAreasServer();
    if (areas.kind === "ok") {
      const counts: LiveCounts = {
        toilets: areas.data.items.reduce((n, a) => n + a.toiletCount, 0),
        verified: areas.data.items.reduce((n, a) => n + a.verifiedCount, 0),
        areas: areas.data.items.length,
      };
      if (Object.values(counts).every((n) => Number.isFinite(n) && n > 0)) {
        cacheLife("days");
        return counts;
      }
    }
  } catch {
    // Falls through to "no numbers".
  }
  cacheLife("minutes");
  return null;
}

export default async function CreatorPage() {
  const live = await getLiveCounts();
  const s = SHIT_GO_WHERE;
  return (
    <article className="mx-auto w-full max-w-[calc(56ch+2rem)] px-4 pb-12 pt-6 leading-relaxed">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-x-1 text-sm font-bold text-muted">
          <li className="inline-flex items-center gap-1">
            <Link href="/about" className="-ml-2 inline-flex min-h-11 items-center rounded-full px-2 hover:bg-surface-2 hover:text-fg">
              About
            </Link>
            <ChevronRight className="size-4" aria-hidden />
          </li>
          <li aria-current="page" className="text-fg">
            Who made this?
          </li>
        </ol>
      </nav>
      <header className="mt-2 flex items-center gap-4 sm:gap-5">
        {/* The app's mascot stands in for a photo: the personal site carries that. */}
        <span className="grid size-20 shrink-0 place-items-center rounded-[28px] bg-surface-2 shadow-rest ring-4 ring-rim sm:size-24">
          <Mascot mood="happy" className="size-14 sm:size-16" />
        </span>
        <div className="min-w-0">
          <h1 className="text-4xl leading-tight sm:text-5xl">{NAME}</h1>
          <p className="mt-1 text-lg text-muted">{INTRO}</p>
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-4">
        <p>
          {s.why}
          {TELEGRAM_BOT_URL ? (
            <>
              {" "}
              {s.bot}{" "}
              <a href={TELEGRAM_BOT_URL} className={link} {...external}>
                {TELEGRAM_BOT_HANDLE}
                {newTab}
              </a>{" "}
              {s.botAfter}
            </>
          ) : null}
        </p>
        <p>
          {s.honest}{" "}
          <Link href="/about" className={`${link} whitespace-nowrap`}>
            {s.honestLink}
            <ArrowRight className="ml-1 inline size-4 align-[-0.15em]" aria-hidden />
          </Link>
        </p>
        {live ? (
          <p className="rounded-3xl bg-mint-soft px-5 py-4 font-medium text-pretty">
            {liveNumbersLine(live).map((part, i) =>
              part.figure ? (
                <strong key={i} className="font-extrabold tabular-nums">
                  {part.text}
                </strong>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </p>
        ) : null}
      </div>

      <ul className="mt-8 flex flex-col gap-2 sm:flex-row sm:flex-wrap" aria-label="More about me">
        <li>
          <a href={PERSONAL_SITE_URL} className={buttonClass("primary", "md", "w-full px-5")} {...external}>
            More about me
            <ArrowUpRight className="size-5 shrink-0" aria-hidden />
            {newTab}
          </a>
        </li>
        <li>
          <a href={LINKEDIN_URL} className={buttonClass("secondary", "md", "w-full px-5")} {...external}>
            <BriefcaseBusiness className="size-5 shrink-0" aria-hidden />
            LinkedIn
            {newTab}
          </a>
        </li>
        {CONTACT_EMAIL ? (
          <li>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(EMAIL_SUBJECT)}`}
              className={buttonClass("secondary", "md", "w-full px-5")}
            >
              <Mail className="size-5 shrink-0" aria-hidden />
              Email
            </a>
          </li>
        ) : null}
      </ul>
    </article>
  );
}
