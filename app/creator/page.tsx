import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Brain,
  ChevronRight,
  Cloud,
  CodeXml,
  Database,
  Download,
  Footprints,
  GraduationCap,
  Image as ImageIcon,
  LayoutPanelTop,
  Mail,
  Map as MapIcon,
  MapPin,
  Server,
  ServerCog,
  Smartphone,
  Wrench,
} from "lucide-react";
import { buttonClass, cx } from "@/components/styles";
import { PinGlyph, tierPinVariant } from "@/components/pin";
import { TierBadge } from "@/components/toilet-bits";
import { getAreasServer, getStationsServer } from "@/lib/api/server";
import { HUE_CHIP, type Hue } from "@/lib/feature-hues";
import { TIER_LEGEND, formatDate } from "@/lib/format";
import { CONTACT_EMAIL } from "@/lib/site";
import {
  CERTIFICATIONS,
  CURRENT_ROLE,
  EDUCATION,
  EMAIL_SUBJECT,
  EXPERIENCE,
  FACTS,
  FIRST_YEAR,
  LINKEDIN_URL,
  MAJORS,
  NAME,
  PROJECTS,
  ROLE_COUNT,
  SHIT_GO_WHERE,
  SKILLS,
  SUMMARY,
  UPDATED_AT,
  VERIFIED_HELP,
  liveNumbersLine,
  roleSince,
} from "./content";
import { CheckIns, StickyColumn } from "./creator-client";

const description =
  "Dylan Chua, a software engineer in Singapore and the creator of Shit Go Where: where I've worked, what I've built, my CV and how to reach me.";

export const metadata: Metadata = {
  title: "Who made this?",
  description,
  alternates: { canonical: "/creator" },
  openGraph: { title: "Who made this? · Shit Go Where", description, url: "/creator", type: "profile" },
};

// Reading-page patterns shared with /about.
const link = "font-bold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary";
const H2 = "text-2xl leading-tight sm:text-3xl";
/** The plain label after a joke heading ("Check-ins · Work experience"): part of the heading's name, in the fact voice. */
const PLAIN = "font-sans text-lg font-extrabold text-muted sm:text-xl";
const card = "rounded-3xl border border-border/70 bg-surface shadow-rest";
const bullets = "mt-2 flex list-disc flex-col gap-1.5 pl-5 marker:text-primary";
const external = { target: "_blank", rel: "noopener noreferrer" } as const;

/** Each skill group wears one candy hue and icon, as a feature group does on a toilet page. */
const SKILL_STYLE: Record<string, { icon: React.ComponentType<{ className?: string }>; hue: Hue | null }> = {
  Languages: { icon: CodeXml, hue: null },
  Backend: { icon: Server, hue: "soda" },
  Frontend: { icon: LayoutPanelTop, hue: "papaya" },
  "Cloud and DevOps": { icon: Cloud, hue: "taro" },
  "Data and AI": { icon: Brain, hue: "gold" },
};

const FACT_ICONS = [MapPin, GraduationCap, Wrench];
const STACK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  App: Smartphone,
  API: Server,
  Data: Database,
  Map: MapIcon,
  Photos: ImageIcon,
  Hosting: Cloud,
};

interface LiveCounts {
  toilets: number;
  verified: number;
  areas: number;
  stations: number;
}

/**
 * The app's own numbers, from the same public reads /areas and /stations use. Cached for a day; when
 * the API can't be reached (CI builds have none) it answers null, cached for minutes so the page
 * picks the numbers up soon after, and the page leaves them out rather than showing zeros. Everything
 * is caught in here, so /creator never fails to render over them.
 */
async function getLiveCounts(): Promise<LiveCounts | null> {
  "use cache";
  try {
    const [areas, stations] = await Promise.all([getAreasServer(), getStationsServer()]);
    if (areas.kind === "ok" && stations.kind === "ok") {
      const counts: LiveCounts = {
        toilets: areas.data.items.reduce((n, a) => n + a.toiletCount, 0),
        verified: areas.data.items.reduce((n, a) => n + a.verifiedCount, 0),
        areas: areas.data.items.length,
        stations: stations.data.items.length,
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
  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-12 pt-3 leading-relaxed lg:max-w-7xl">
      {/*
       * One grid, sections in phone reading order. From lg, Check-ins moves into the right column across
       * every row (the last row absorbs any height difference), so the list is never rendered twice.
       */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:grid-rows-[repeat(6,auto)_1fr] lg:gap-x-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:gap-x-16">
        <Header />

        <section aria-labelledby="facts" className="mt-10 lg:col-start-1">
          <h2 id="facts" className={H2}>
            Facts
          </h2>
          <dl className={cx(card, "mt-3 grid divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0")}>
            {FACTS.map((f, i) => {
              const Icon = FACT_ICONS[i] ?? MapPin;
              return (
                <div key={f.label} className="px-4 py-3.5">
                  <dt className="flex items-center gap-1.5 text-sm font-bold text-muted">
                    <Icon className="size-4" aria-hidden />
                    {f.label}
                  </dt>
                  <dd className="mt-0.5 font-extrabold leading-snug">{f.value}</dd>
                  {f.detail ? <dd className="mt-1 text-sm font-medium text-muted">{f.detail}</dd> : null}
                </div>
              );
            })}
          </dl>
        </section>

        <section aria-labelledby="features" className="mt-10 lg:col-start-1">
          <h2 id="features" className={H2}>
            Features <span className={PLAIN}>· Skills</span>
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {SKILLS.map((g) => {
              const style = SKILL_STYLE[g.group] ?? { icon: Wrench, hue: null };
              const Icon = style.icon;
              return (
                <div key={g.group}>
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-muted">
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {g.group}
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {g.items.map((s) => (
                      <li
                        key={s}
                        className={cx(
                          "inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-bold",
                          style.hue ? HUE_CHIP[style.hue] : "border border-border/70 bg-surface-2",
                        )}
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="check-ins"
          className="mt-10 lg:col-start-2 lg:row-start-1 lg:row-end-[-1] lg:mt-0 lg:pt-2"
        >
          <StickyColumn className={cx(card, "p-5")}>
            <h2 id="check-ins" className="text-2xl leading-tight">
              Check-ins <span className={PLAIN}>· Work experience</span>
            </h2>
            <p className="mt-0.5 text-sm font-medium text-muted">Where I&apos;ve been, newest first</p>
            <CheckIns roles={EXPERIENCE} />
            {live ? <ProofTeaser live={live} /> : null}
          </StickyColumn>
        </section>

        <AlsoBuiltHere live={live} />

        <section aria-labelledby="projects" className="mt-12 lg:col-start-1">
          <h2 id="projects" className={H2}>
            Other projects
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {PROJECTS.map((p) => (
              <li key={p.name} className={cx(card, "px-5 py-4")}>
                <h3 className="font-display text-lg leading-snug">{p.name}</h3>
                <p className="text-sm font-bold text-muted">
                  {p.context ? `${p.context} · ` : null}
                  {p.dates}
                </p>
                <ul className={bullets}>
                  {p.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Built with">
                  {p.tags.map((t) => (
                    <li key={t} className="rounded-full border border-border/70 bg-surface-2 px-2.5 py-0.5 text-xs font-bold">
                      {t}
                    </li>
                  ))}
                </ul>
                {p.links.length ? (
                  <p className="mt-1 flex flex-wrap gap-x-5">
                    {p.links.map((l) => (
                      <a key={l.href} href={l.href} className={cx(link, "inline-flex min-h-11 items-center gap-1")} {...external}>
                        {l.label}
                        <ArrowUpRight className="size-4" aria-hidden />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ))}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="education" className="mt-12 lg:col-start-1">
          <h2 id="education" className={H2}>
            Education
          </h2>
          <div className={cx(card, "mt-3 flex gap-3 px-5 py-4")}>
            <GraduationCap className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
            <div>
              <h3 className="font-display text-lg leading-snug">{EDUCATION.school}</h3>
              <p className="font-extrabold">{EDUCATION.degree}</p>
              <p className="text-sm font-bold text-muted">{EDUCATION.dates}</p>
              <p className="mt-2">Majors: {MAJORS}</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="certifications" className="mt-12 lg:col-start-1">
          <h2 id="certifications" className={H2}>
            Certifications
          </h2>
          <ul className={cx(card, "mt-3 px-5 py-1")}>
            {CERTIFICATIONS.map((c) => (
              <li key={c.name} className="border-t border-border/70 py-4 first:border-t-0">
                <h3 className="font-extrabold">{c.name}</h3>
                <p className="text-sm font-bold text-muted">{c.issuer}</p>
                {c.items ? (
                  <ul className={bullets}>
                    {c.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

/** The listing's head, in toilet-page anatomy: breadcrumb, photo, name, tier, freshness, the mint block, actions. */
function Header() {
  const updated = formatDate(UPDATED_AT);
  return (
    <header className="lg:col-start-1">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-x-1 text-sm font-bold text-muted">
          <li className="inline-flex items-center gap-1">
            <Link href="/areas" className="-ml-2 inline-flex min-h-11 items-center rounded-full px-2 hover:bg-surface-2 hover:text-fg">
              Singapore
            </Link>
            <ChevronRight className="size-4" aria-hidden />
          </li>
          <li className="inline-flex items-center gap-1">
            People
            <ChevronRight className="size-4" aria-hidden />
          </li>
          <li aria-current="page" className="text-fg">
            Who made this?
          </li>
        </ol>
      </nav>

      <div className="mt-2 flex items-center gap-4 sm:gap-6">
        {/* A fixed 480 px webp in public/, so next/image would add nothing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/creator/dylan.webp"
          alt={`Photo of ${NAME}`}
          width={480}
          height={480}
          className="size-24 shrink-0 rounded-[28px] bg-surface-2 object-cover shadow-rest ring-4 ring-rim sm:size-28 lg:size-32"
        />
        <div className="min-w-0">
          <h1 className="text-[2.5rem] leading-none sm:text-5xl lg:text-6xl">{NAME}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <TierBadge tier="VERIFIED" help={VERIFIED_HELP} className="px-3! py-1! text-sm!" />
            <span className="text-sm font-medium text-muted">
              Last verified: <time dateTime={UPDATED_AT}>{updated}</time>
            </span>
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-stretch gap-2">
        {/* The walk-time block, counting check-ins instead of minutes; counted from EXPERIENCE. */}
        <p className="flex w-28 shrink-0 flex-col items-center justify-center rounded-3xl bg-mint px-2 py-3 text-center text-mint-fg shadow-gloss">
          <Footprints className="size-4" aria-hidden />
          <span className="mt-0.5 font-display text-4xl leading-none">{ROLE_COUNT}</span>{" "}
          <span className="mt-1 text-xs font-extrabold">{ROLE_COUNT === 1 ? "role" : "roles"}</span>{" "}
          <span className="text-xs font-bold">since {FIRST_YEAR}</span>
        </p>
        <div className={cx(card, "flex min-w-0 flex-1 basis-52 flex-col justify-center px-4 py-3 sm:px-5")}>
          <p className="flex items-start gap-2 font-extrabold leading-snug sm:text-lg">
            <BriefcaseBusiness className="mt-1 hidden size-5 shrink-0 text-muted sm:block" aria-hidden />
            {CURRENT_ROLE.title}
          </p>
          <p className="mt-0.5 text-sm font-bold text-muted sm:pl-7">
            Now at {CURRENT_ROLE.company}
            {CURRENT_ROLE.location ? ` · ${CURRENT_ROLE.location}` : null} · {roleSince(CURRENT_ROLE)}
          </p>
        </div>
      </div>

      <p className="mt-4 max-w-[60ch] text-lg font-medium text-pretty">{SUMMARY}</p>

      <ul className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-label="Get in touch">
        <li>
          <a href="/creator/cv.pdf" download="Dylan-Chua-CV.pdf" className={buttonClass("primary", "md", "w-full px-4 sm:px-5")}>
            <Download className="size-5 shrink-0" aria-hidden />
            Download CV
          </a>
        </li>
        {CONTACT_EMAIL ? (
          <li>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(EMAIL_SUBJECT)}`}
              className={buttonClass("secondary", "md", "w-full px-4 sm:px-5")}
            >
              <Mail className="size-5 shrink-0" aria-hidden />
              Email me
            </a>
          </li>
        ) : null}
        <li>
          <a href={LINKEDIN_URL} className={buttonClass("secondary", "md", "w-full px-4 sm:px-5")} {...external}>
            <BriefcaseBusiness className="size-5 shrink-0" aria-hidden />
            LinkedIn
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
        <li className="odd:last:col-span-2">
          <Link href="/" className={buttonClass("secondary", "md", "w-full px-4 sm:px-5")}>
            Try the app
            <ArrowRight className="size-5 shrink-0" aria-hidden />
          </Link>
        </li>
      </ul>
    </header>
  );
}

/** The figures of the live-numbers sentence, emphasised. */
function LiveNumbers({ live }: { live: LiveCounts }) {
  return liveNumbersLine(live).map((part, i) =>
    part.figure ? (
      <strong key={i} className="font-extrabold whitespace-nowrap text-mint tabular-nums">
        {part.text}
      </strong>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}

/**
 * The proof, in the desktop first screen: the sketch's mint teaser under the check-ins, pointing down to
 * the case study. Phones reach the full section right after Check-ins, so it would only repeat there.
 */
function ProofTeaser({ live }: { live: LiveCounts }) {
  return (
    <div className="mt-4 hidden rounded-3xl bg-mint-soft px-4 py-3 lg:block">
      <p className="font-display text-lg leading-snug">Also built here: {SHIT_GO_WHERE.name}</p>
      <p className="mt-1 text-sm font-medium">
        <LiveNumbers live={live} />
      </p>
      <a
        href="#also-built"
        className="-ml-2 mt-1 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-extrabold text-primary hover:bg-surface-2"
      >
        {SHIT_GO_WHERE.teaserLink}
        <ArrowDown className="size-4" aria-hidden />
      </a>
    </div>
  );
}

/** The case study: what the app does, how trust works, what it's built on and what I run. Live numbers when the API answers. */
function AlsoBuiltHere({ live }: { live: LiveCounts | null }) {
  const s = SHIT_GO_WHERE;
  return (
    <section aria-labelledby="also-built" className="mt-12 lg:col-start-1">
      <h2 id="also-built" className={cx(H2, "scroll-mt-24")}>
        Also built here: {s.name}
      </h2>
      <div className="mt-3 flex max-w-[65ch] flex-col gap-3">
        {s.what.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p>
          {s.bot.before}{" "}
          <a href={s.bot.href} className={link} {...external}>
            {s.bot.handle}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>{" "}
          {s.bot.after}
        </p>
      </div>

      {live ? (
        <p className="mt-4 rounded-3xl bg-mint-soft px-5 py-4 text-lg font-medium leading-relaxed text-pretty">
          <LiveNumbers live={live} />
        </p>
      ) : null}

      <div className={cx(card, "mt-4 divide-y divide-border/70")}>
        <div className="px-5 py-4">
          <h3 className="font-display text-lg leading-snug">How the map stays honest</h3>
          <p className="mt-1 text-pretty">{s.tiersIntro}</p>
          <ul className="mt-3 flex flex-col gap-3">
            {TIER_LEGEND.map((l) => (
              <li key={l.tier} className="flex items-start gap-3">
                <PinGlyph
                  variant={l.tier === "PENDING" ? tierPinVariant("IMPORTED", true) : tierPinVariant(l.tier)}
                  className="size-8"
                />
                <p>
                  <span className="font-extrabold">{l.label}</span>
                  <span className="block text-sm font-medium text-muted">{l.help}</span>
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <Link href="/about" className={cx(link, "inline-flex min-h-11 items-center gap-1")}>
              Where the data comes from
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </p>
        </div>

        <div className="px-5 py-4">
          <h3 className="font-display text-lg leading-snug">How I built it</h3>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {s.stack.map((x) => {
              const Icon = STACK_ICONS[x.label] ?? Server;
              return (
                <div key={x.label}>
                  <dt className="flex items-center gap-1.5 text-sm font-bold text-muted">
                    <Icon className="size-4" aria-hidden />
                    {x.label}
                  </dt>
                  <dd className="mt-0.5 font-bold">{x.value}</dd>
                </div>
              );
            })}
          </dl>
        </div>

        <div className="px-5 py-4">
          <h3 className="font-display text-lg leading-snug">What I run myself</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {s.runs.map((r) => (
              <li key={r} className="flex items-start gap-2 font-bold">
                <ServerCog className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
