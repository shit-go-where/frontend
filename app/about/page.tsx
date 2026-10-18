import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { PinGlyph, type PinVariant } from "@/components/pin";
import { LineBadge } from "@/components/toilet-bits";
import { MRT_LINES, TIER_LEGEND } from "@/lib/format";

export const metadata: Metadata = {
  title: "About",
  description: "Why Shit Go Where exists, how to read the map, words you'll see in the app, and data licences.",
};

const TIER_PIN: Record<(typeof TIER_LEGEND)[number]["tier"], PinVariant> = {
  VERIFIED: "verified",
  COMMUNITY: "community",
  IMPORTED: "imported",
  PENDING: "pending",
};

const link = "font-bold text-primary underline hover:decoration-[3px]";
const h2 = "mt-12 text-2xl leading-tight sm:text-3xl";
const h3 = "mt-8 font-display text-lg";
/** Sticker card for the pin legend and glossary groups. */
const card = "rounded-3xl border border-border/70 bg-surface px-5 shadow-rest";

function Term({ term, children }: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/70 py-4 first:border-t-0">
      <dt className="font-extrabold">{term}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

export default function AboutPage() {
  return (
    <article className="mx-auto w-full max-w-[calc(56ch+2rem)] px-4 pb-12 pt-6 leading-relaxed">
      <Logo className="size-16" />
      <h1 className="mt-4 text-4xl leading-tight sm:text-5xl">Shit Go Where?</h1>
      <p className="mt-3 text-lg text-muted">
        The question every Singaporean has asked in a hurry. This app answers it: the nearest clean toilet, how far it is, and
        whether it has what you need.
      </p>

      <h2 className={h2}>How to read the map</h2>
      <p className="mt-3">
        Every toilet shows how much you can trust it. The pin&apos;s fill tells you who checked it, and toilet cards carry the
        same tier as a badge.
      </p>
      <ul className={`${card} mt-5 py-1`}>
        {TIER_LEGEND.map((l) => (
          <li key={l.tier} className="flex items-start gap-4 border-t border-border/70 py-4 first:border-t-0">
            <PinGlyph variant={TIER_PIN[l.tier]} className="mt-0.5 size-10" />
            <span>
              <strong className="font-extrabold">{l.label}</strong>
              <span className="block text-muted">{l.help}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4">
        In a hurry? Tap <strong className="font-extrabold">I need to go</strong> on any page for the closest good options and a
        walking route. Planning ahead?{" "}
        <Link href="/areas" className={link}>
          Browse toilets by area
        </Link>
        .
      </p>

      <h2 className={h2}>Words you&apos;ll see</h2>
      <p className="mt-3">New to Singapore, or just to the app? Here&apos;s what the local terms mean.</p>

      <h3 className={h3}>Getting around</h3>
      <dl className={`${card} mt-3 py-1`}>
        <Term term="Inside or outside the fare gates">
          MRT stations and bus interchanges have fare gates where you tap your card. Toilets inside the gates can only be
          reached after tapping in, so if you&apos;re not already travelling, pick one outside. The &ldquo;Outside fare
          gates&rdquo; filter does this for you.
        </Term>
        <Term term="MRT line codes">
          <span className="block">Each station shows the lines that stop there:</span>
          <span className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {Object.entries(MRT_LINES).map(([code, l]) => (
              <span key={code} className="flex items-center gap-2">
                <LineBadge line={code} />
                <span>{l.name}</span>
              </span>
            ))}
          </span>
        </Term>
        <Term term="“NSL side”, “NEL side” and so on">
          At interchange stations where lines meet, this says which line&apos;s part of the station the toilet is in. Follow
          the signs for that line once you&apos;re inside.
        </Term>
        <Term term="Happy Toilet (RAS) rating">
          A star rating from the Restroom Association (Singapore) under its Happy Toilet programme. When a toilet has one,
          its page shows it next to our own survey score.
        </Term>
      </dl>

      <h3 className={h3}>Singlish</h3>
      <dl className={`${card} mt-3 py-1`}>
        <Term term="Kaypoh">
          Busybody. The{" "}
          <Link href="/review" className={link}>
            Kaypoh queue
          </Link>{" "}
          is where you check toilets other people added near you, so be a kaypoh.
        </Term>
        <Term term="Bo jio">
          &ldquo;You didn&apos;t invite me.&rdquo; We say it when nobody has reported on a toilet lately: you went, so tell
          everyone how it was.
        </Term>
        <Term term="Shiok">Great, very satisfying. Like finding a clean toilet just in time.</Term>
        <Term term="Steady lah">Nicely done. You&apos;ll see it after you add a toilet.</Term>
        <Term term="Aiyo">Oh no. It means something went wrong on our side.</Term>
        <Term term="Wah, lah, leh">
          Little words that add feeling (surprise, emphasis, a shrug). They never change the facts.
        </Term>
      </dl>

      <h2 className={h2}>Data sources and licences</h2>
      <ul className="mt-4 flex list-disc flex-col gap-3 pl-5 marker:text-primary">
        <li>
          <strong className="font-extrabold">Fieldwork survey, March 2024</strong>: 160 toilets surveyed in person across MRT stations, malls, bus interchanges,
          hawker centres and coffee shops.
        </li>
        <li>
          <strong className="font-extrabold">OneMap</strong>, © Singapore Land Authority: base map tiles, place search and walking routes. Map data ©{" "}
          <a href="https://www.onemap.gov.sg/" className={link} target="_blank" rel="noopener noreferrer">
            OneMap
          </a>{" "}
          contributors |{" "}
          <a href="https://www.sla.gov.sg/" className={link} target="_blank" rel="noopener noreferrer">
            Singapore Land Authority
          </a>
          .
        </li>
        <li>
          <strong className="font-extrabold">OpenStreetMap</strong>: toilet locations and amenities, © OpenStreetMap contributors, available under the{" "}
          <a href="https://opendatacommons.org/licenses/odbl/" className={link} target="_blank" rel="noopener noreferrer">
            Open Database Licence (ODbL)
          </a>
          .
        </li>
        <li>
          <strong className="font-extrabold">data.gov.sg</strong>: hawker centres, MRT station exits, community clubs, parks and libraries, under the{" "}
          <a href="https://data.gov.sg/open-data-licence" className={link} target="_blank" rel="noopener noreferrer">
            Singapore Open Data Licence
          </a>
          .
        </li>
        <li>
          <strong className="font-extrabold">Wikidata</strong>: MRT station details, CC0.
        </li>
      </ul>

      <h2 className={h2}>Help out</h2>
      <p className="mt-3">
        Spotted a missing toilet?{" "}
        <Link href="/add" className={link}>
          Add it
        </Link>
        . Near a pending one?{" "}
        <Link href="/review" className={link}>
          Review it
        </Link>
        . Every check-in keeps the map fresh.
      </p>

      <p className="mt-12 border-t border-border/70 pt-4 text-sm text-muted">
        <Link href="/privacy" className={link}>
          Privacy notice
        </Link>
      </p>
    </article>
  );
}
