import type { Metadata } from "next";
import { Send } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { PinGlyph, type PinVariant } from "@/components/pin";
import { buttonClass } from "@/components/styles";
import { TELEGRAM_QR_URL, TelegramQr } from "@/components/telegram-qr";
import { LineBadge } from "@/components/toilet-bits";
import { MRT_LINES, TIER_LEGEND } from "@/lib/format";
import { CONTACT_EMAIL, TELEGRAM_BOT_HANDLE, TELEGRAM_BOT_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why Shit Go Where exists, how to read the map, words you'll see in the app, data licences, the Telegram bot, and how to contact us.",
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
          <strong className="font-extrabold">data.gov.sg</strong>: hawker centres (NEA), MRT station exits (LTA), community clubs (People&apos;s
          Association), parks (NParks), libraries (NLB) and planning area boundaries (URA). Contains information from data.gov.sg
          datasets accessed under the{" "}
          <a href="https://data.gov.sg/open-data-licence" className={link} target="_blank" rel="noopener noreferrer">
            Singapore Open Data Licence
          </a>{" "}
          version 1.0.
        </li>
        <li>
          <strong className="font-extrabold">Wikidata</strong>: MRT and LRT station names, codes and lines, released under{" "}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/" className={link} target="_blank" rel="noopener noreferrer">
            CC0
          </a>
          .
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

      {TELEGRAM_BOT_URL ? (
        <section aria-labelledby="telegram">
          {/* Clear of the sticky 64 px header from md up. */}
          <h2 id="telegram" className={`${h2} scroll-mt-6 md:scroll-mt-24`}>
            On Telegram also can
          </h2>
          <div className="md:flex md:items-start md:gap-8">
            <div className="min-w-0 flex-1">
              <p className="mt-3">
                Send {TELEGRAM_BOT_HANDLE} your location and it replies with the top 3 toilets nearby, or type a place name
                instead. You can check in and report how a toilet is from the chat, no account needed. In a group chat,{" "}
                <code className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.9em]">/toilet Bishan</code> finds toilets near a
                place for everyone.
              </p>
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass("secondary", "md", "mt-5")}
              >
                <Send className="size-5" aria-hidden /> Open {TELEGRAM_BOT_HANDLE}
              </a>
              <p className="mt-5">
                Have an account?{" "}
                <Link href="/me#telegram" className={link}>
                  Connect it in Me
                </Link>{" "}
                so points from the bot land there.
              </p>
              <p className="mt-3 text-muted">
                The bot uses your location for that one search and never keeps it. See the{" "}
                <Link href="/privacy#telegram" className={link}>
                  privacy notice
                </Link>{" "}
                for what it does keep.
              </p>
            </div>
            {/* Desktop only: on a phone you are already where the button goes. */}
            {TELEGRAM_BOT_URL === TELEGRAM_QR_URL ? (
              <figure className="mt-4 hidden w-40 shrink-0 -rotate-2 rounded-3xl border border-border bg-rim p-2 text-center shadow-rest md:block">
                <TelegramQr label={`QR code that opens ${TELEGRAM_BOT_HANDLE} in Telegram`} className="w-full rounded-2xl" />
                <figcaption className="px-1 pb-1 text-sm font-bold leading-snug text-poo-ink">Scan to open on your phone</figcaption>
              </figure>
            ) : null}
          </div>
        </section>
      ) : null}

      <h2 id="contact" className={`${h2} scroll-mt-6`}>
        Contact
      </h2>
      <ul className="mt-4 flex list-disc flex-col gap-3 pl-5 marker:text-primary">
        <li>
          <strong className="font-extrabold">Toilet wrong, closed or gone?</strong> Open it and tap{" "}
          <strong className="font-extrabold">Report it</strong>, or <strong className="font-extrabold">Suggest an edit</strong>{" "}
          for a missing fact. Moderators see those fastest, and the fix shows up for everyone.
        </li>
        {CONTACT_EMAIL ? (
          <>
            <li>
              <strong className="font-extrabold">Your data</strong>: for access, correction or deletion requests, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}?subject=Data%20request`} className={link}>
                {CONTACT_EMAIL}
              </a>
              . See the{" "}
              <Link href="/privacy" className={link}>
                privacy notice
              </Link>{" "}
              for what we keep.
            </li>
            <li>
              <strong className="font-extrabold">A review, photo or name that shouldn&apos;t be here</strong>: if it is abusive, shows
              a person, or breaks someone&apos;s privacy, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}?subject=Content%20report`} className={link}>
                {CONTACT_EMAIL}
              </a>{" "}
              with a link to the toilet&apos;s page and what you saw. See the{" "}
              <Link href="/terms" className={link}>
                terms of use
              </Link>
              .
            </li>
            <li>
              <strong className="font-extrabold">Anything else</strong>: partnerships, press, ideas or a toilet we should
              know about, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
                {CONTACT_EMAIL}
              </a>
              .
            </li>
          </>
        ) : null}
      </ul>
      <p className="mt-6">
        <strong className="font-extrabold">Who made this?</strong>{" "}
        <Link href="/creator" className={link}>
          Meet the creator
        </Link>
        .
      </p>

      {/* Standalone links, so each is a 44 px tap target. */}
      <p className="mt-12 flex flex-wrap items-center gap-x-3 border-t border-border/70 pt-2 text-sm text-muted">
        <Link href="/privacy" className={`${link} inline-flex min-h-11 items-center`}>
          Privacy notice
        </Link>
        {" · "}
        <Link href="/terms" className={`${link} inline-flex min-h-11 items-center`}>
          Terms of use
        </Link>
        {CONTACT_EMAIL ? (
          <>
            <span aria-hidden>·</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className={`${link} inline-flex min-h-11 items-center`}>
              Contact
            </a>
          </>
        ) : null}
      </p>
    </article>
  );
}
