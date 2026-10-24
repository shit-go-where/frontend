import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The ground rules for using Shit Go Where: what you can expect from us, what we expect from you, and how content is handled.",
};

const link = "font-bold text-primary underline hover:decoration-[3px]";

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-[calc(56ch+2rem)] px-4 pb-12 pt-6 leading-relaxed [&_code]:rounded-md [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:leading-tight [&_li]:mt-2 [&_p]:mt-3 [&_strong]:font-extrabold [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-primary">
      <h1 className="text-4xl leading-tight sm:text-5xl">Terms of use</h1>
      <p className="text-lg text-muted">
        The ground rules for Shit Go Where, in plain English. By using the app or the Telegram bot you agree to them. If you
        don&apos;t, please don&apos;t use it.
      </p>

      <h2>What this is</h2>
      <p>
        Shit Go Where helps you find, rate and walk to public toilets in Singapore. It is free to use, and you can browse without an
        account. What we do with your data is in the{" "}
        <Link href="/privacy" className={link}>
          privacy notice
        </Link>
        . Where the map and toilet data comes from is on the{" "}
        <Link href="/about" className={link}>
          About page
        </Link>
        .
      </p>

      <h2>Information can be wrong</h2>
      <ul>
        <li>
          Toilet details come from two in-person surveys done in 2024, public data sets, OpenStreetMap and people like you. Toilets close, move and run
          out of soap. Opening hours, walking times and routes are best guesses.
        </li>
        <li>
          Use your own judgement and look where you are going. In an emergency call 995 (ambulance) or 999 (police), don&apos;t open
          an app.
        </li>
        <li>
          The app is provided as it is, without promises that it will always be available, accurate or fit for a particular purpose.
          We&apos;re not responsible for losses from relying on it, to the extent the law allows. Nothing here limits rights or
          liability that the law doesn&apos;t allow us to limit.
        </li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>You sign in with Google. One account per person, and you are responsible for what is done with it.</li>
        <li>Pick a handle that isn&apos;t someone else&apos;s name, doesn&apos;t pretend to be staff, and isn&apos;t offensive.</li>
        <li>
          You can delete your account any time on{" "}
          <Link href="/me" className={link}>
            Me
          </Link>
          . What that removes and what stays is in the privacy notice.
        </li>
        <li>
          Points, badges and leaderboard places are for fun. They have no cash value, and we may change or reset them, for example to
          fix cheating.
        </li>
      </ul>

      <h2>What you post</h2>
      <p>
        Reviews, photos, toilets, edits, status reports, votes and reports are your contributions. You keep ownership of them. By
        posting, you give us a free, non-exclusive licence to store, show, adapt (for example resize or crop a photo) and share them in
        the app, the Telegram bot and our sharing previews, for as long as they are on the service. Only post what you have the right to
        post.
      </p>
      <ul>
        <li>
          <strong>Be truthful and be there.</strong> Check in and report from the toilet itself. Don&apos;t fake locations, use scripts,
          or make several accounts to collect points or sway votes.
        </li>
        <li>
          <strong>Photograph the toilet, not people.</strong> No faces, children, people using the toilet, or cubicles in use. Don&apos;t
          post anything that identifies a person or reveals private information.
        </li>
        <li>
          <strong>Keep it civil.</strong> No abuse, harassment, hate, sexual content, advertising, spam, or anything unlawful in
          Singapore.
        </li>
      </ul>

      <h2>Moderation and reporting</h2>
      <ul>
        <li>
          Photos are held back until a moderator or trusted members approve them. Reviews, status reports and check-ins appear straight
          away and can be removed afterwards.
        </li>
        <li>
          We may edit or remove contributions, and limit or close accounts, that break these terms or that we believe could harm
          someone, with or without notice.
        </li>
        <li>
          Report a wrong, closed or missing toilet with <strong>Report it</strong> or <strong>Suggest an edit</strong> on its page.
          {CONTACT_EMAIL ? (
            <>
              {" "}
              To report a review, photo or name, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}?subject=Content%20report`} className={link}>
                {CONTACT_EMAIL}
              </a>{" "}
              with a link to the toilet&apos;s page and what you saw, and we will look at it.
            </>
          ) : (
            <>
              {" "}
              For a review, photo or name, see{" "}
              <Link href="/about#contact" className={link}>
                Contact
              </Link>{" "}
              on the About page.
            </>
          )}
        </li>
      </ul>

      <h2>Using the service fairly</h2>
      <p>
        Don&apos;t scrape the app in bulk, overload it, probe it for weaknesses, or use it to build a competing database. Map tiles,
        place search and routes belong to OneMap and are covered by its terms, and our other data sources have the licences listed on
        the About page.
      </p>

      <h2>Changes and governing law</h2>
      <p>
        We may change the app or these terms, and we will update the date below when we do. Using the app after a change means you
        accept it. These terms are governed by the laws of Singapore, and the Singapore courts have jurisdiction over any dispute.
      </p>

      <h2>Contact</h2>
      {CONTACT_EMAIL ? (
        <p>
          Questions about these terms:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      ) : (
        <p>
          Questions about these terms: see{" "}
          <Link href="/about#contact" className={link}>
            Contact
          </Link>{" "}
          on the About page.
        </p>
      )}

      <p className="mt-12! border-t border-border/70 pt-4 text-sm text-muted">
        <Link href="/privacy" className={link}>
          Privacy notice
        </Link>{" "}
        · Last updated 20 October 2026.
      </p>
    </article>
  );
}
