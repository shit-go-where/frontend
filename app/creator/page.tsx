import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, FolderGit2, Mail } from "lucide-react";
import { buttonClass } from "@/components/styles";
import { CONTACT_EMAIL } from "@/lib/site";
import { CERTIFICATIONS, EDUCATION, EXPERIENCE, GITHUB_URL, LINKEDIN_URL, NAME, PROJECTS, SKILLS } from "./content";

export const metadata: Metadata = {
  title: "Who made this?",
  description:
    "Dylan Chua, a software engineer in Singapore, made Shit Go Where. His experience, projects, skills and how to reach him.",
};

// Same reading-page patterns as /about.
const link = "font-bold text-primary underline hover:decoration-[3px]";
const h2 = "mt-12 text-2xl leading-tight sm:text-3xl";
/** Sticker card for each section's entries. */
const card = "rounded-3xl border border-border/70 bg-surface px-5 shadow-rest";
const bullets = "mt-3 flex list-disc flex-col gap-2 pl-5 marker:text-primary";
const external = { target: "_blank", rel: "noopener noreferrer" } as const;

function Tags({ tags }: { tags: string[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Built with">
      {tags.map((t) => (
        <li key={t} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-extrabold">
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function CreatorPage() {
  return (
    <article className="mx-auto w-full max-w-[calc(56ch+2rem)] px-4 pb-12 pt-6 leading-relaxed">
      <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
        {/* A fixed 480 px webp in public/, so next/image would add nothing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/creator/dylan.webp"
          alt={NAME}
          width={480}
          height={480}
          className="size-28 shrink-0 rounded-full object-cover shadow-rest ring-4 ring-surface-2 sm:size-32"
        />
        <div>
          <h1 className="text-4xl leading-tight sm:text-5xl">{NAME}</h1>
          <p className="mt-2 text-lg text-muted">
            Software engineer in Singapore. He built Shit Go Where because he kept needing a toilet at the wrong MRT station.
          </p>
        </div>
      </header>
      <ul className="mt-6 flex flex-wrap gap-2">
        <li>
          <a href={GITHUB_URL} className={buttonClass("secondary", "sm")} {...external}>
            <FolderGit2 className="size-4" aria-hidden />
            GitHub
          </a>
        </li>
        <li>
          <a href={LINKEDIN_URL} className={buttonClass("secondary", "sm")} {...external}>
            <BriefcaseBusiness className="size-4" aria-hidden />
            LinkedIn
          </a>
        </li>
        {CONTACT_EMAIL ? (
          <li>
            <a href={`mailto:${CONTACT_EMAIL}`} className={buttonClass("secondary", "sm")}>
              <Mail className="size-4" aria-hidden />
              Email
            </a>
          </li>
        ) : null}
      </ul>

      <h2 className={h2}>Why this exists</h2>
      <p className="mt-3">
        Shit Go Where? Every Singaporean has asked it in a hurry, usually halfway between two MRT stops. Dylan wanted the
        answer in one tap, so he built the app that gives it.
      </p>
      <p className="mt-3">
        It finds the nearest clean toilet, how far a walk it is and whether it has what you need. Tap{" "}
        <strong className="font-extrabold">I need to go</strong> and it picks the closest good one and walks you there.
        People check in, review and report what they find, so the map stays honest. Rather stay in Telegram? Send{" "}
        <a href="https://t.me/ShitGoWhereBot" className={link} {...external}>
          @ShitGoWhereBot
        </a>{" "}
        your location for the top three nearby.
      </p>
      <p className="mt-3">
        How it&apos;s built: a Next.js progressive web app and a NestJS API, with Prisma and Postgres for the data and
        MapLibre drawing OneMap tiles, all on Vercel. The data sources and licences are on the{" "}
        <Link href="/about" className={link}>
          About page
        </Link>
        .
      </p>

      <h2 className={h2}>Experience</h2>
      <ol className={`${card} mt-5 py-1`}>
        {EXPERIENCE.map((r) => (
          <li key={`${r.company} ${r.title}`} className="border-t border-border/70 py-5 first:border-t-0">
            <h3 className="font-display text-lg leading-snug">{r.title}</h3>
            <p className="mt-1">
              <strong className="font-extrabold">{r.company}</strong>
              {r.location ? <span className="text-muted"> · {r.location}</span> : null}
            </p>
            <p className="text-sm text-muted">{r.dates}</p>
            <ul className={bullets}>
              {r.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <h2 className={h2}>Projects</h2>
      <ul className="mt-5 flex flex-col gap-3">
        {PROJECTS.map((p) => (
          <li key={p.name} className={`${card} py-5`}>
            <h3 className="font-display text-lg leading-snug">{p.name}</h3>
            <p className="mt-1 text-sm text-muted">
              {p.context ? `${p.context} · ` : null}
              {p.dates}
            </p>
            <ul className={bullets}>
              {p.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <Tags tags={p.tags} />
            {p.links.length > 0 ? (
              <p className="mt-2 flex flex-wrap gap-x-5">
                {p.links.map((l) => (
                  <a key={l.href} href={l.href} className={`${link} inline-flex min-h-11 items-center gap-1`} {...external}>
                    {l.label}
                    <ArrowUpRight className="size-4" aria-hidden />
                  </a>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <h2 className={h2}>Education</h2>
      <div className={`${card} mt-5 py-5`}>
        <h3 className="font-display text-lg leading-snug">{EDUCATION.school}</h3>
        <p className="mt-1 font-extrabold">{EDUCATION.degree}</p>
        <p className="text-sm text-muted">{EDUCATION.dates}</p>
        <p className="mt-3">Majors: {EDUCATION.majors.join("; ")}</p>
      </div>

      <h2 className={h2}>Skills</h2>
      <dl className={`${card} mt-5 py-1`}>
        {SKILLS.map((s) => (
          <div key={s.group} className="border-t border-border/70 py-4 first:border-t-0">
            <dt className="font-extrabold">{s.group}</dt>
            <dd className="mt-1">{s.items.join(", ")}</dd>
          </div>
        ))}
      </dl>

      <h2 className={h2}>Certifications</h2>
      <p className="mt-3">{CERTIFICATIONS.issuer} courses:</p>
      <ul className={bullets}>
        {CERTIFICATIONS.courses.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </article>
  );
}
