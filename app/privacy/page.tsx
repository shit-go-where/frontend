import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What Shit Go Where stores about you, why, and how to delete it (PDPA).",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-[calc(56ch+2rem)] px-4 pb-12 pt-6 leading-relaxed [&_code]:rounded-md [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:leading-tight [&_li]:mt-2 [&_p]:mt-3 [&_strong]:font-extrabold [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-primary">
      <h1 className="text-4xl leading-tight sm:text-5xl">Privacy notice</h1>
      <p className="text-lg text-muted">
        This notice explains how Shit Go Where collects, uses and protects personal data, in line with Singapore&apos;s Personal
        Data Protection Act 2012 (PDPA).
      </p>

      <h2>You can browse without an account</h2>
      <p>
        Finding toilets, viewing details and getting directions never require signing in. Your location is used in your browser
        to search nearby and is sent to our server only as part of that search. We don&apos;t keep a history of where you searched.
      </p>

      <h2>Checking in or reporting without an account</h2>
      <p>
        If you check in or report a toilet&apos;s status without signing in, we set a cookie (<code>sgw_anon</code>) holding a
        random device ID (no name, email or location) for up to a year, so we can limit abuse and give you the points when you sign
        in; we store only your distance from the toilet, never your location, and the cookie is removed once you sign in.
      </p>

      <h2>What we store when you sign in</h2>
      <ul>
        <li>From Google: your email address, name and profile picture URL.</li>
        <li>The handle you choose, your points, badges and leaderboard choice (off by default).</li>
        <li>What you contribute: toilets and edits you submit (with the position you were standing at when submitting), reviews,
          photos, status reports, votes and flags.</li>
        <li>
          <strong>Check-ins keep only the distance</strong> between you and the toilet and which toilet it was. Your coordinates
          are used once to verify you are within 150 m and are then discarded.
        </li>
        <li>A session cookie (<code>sgw_session</code>) so you stay signed in. We don&apos;t use advertising cookies.</li>
      </ul>

      <h2>Usage analytics</h2>
      <p>
        To learn which parts of the app help people and where they give up, we use{" "}
        <a href="https://posthog.com" className="font-bold text-primary underline hover:decoration-[3px]">
          PostHog
        </a>
        , hosted in the European Union. It records which pages you open and a few actions: starting a walk to a toilet, arriving,
        sharing, checking in, reporting, reviewing, adding and voting, and signing in. It also records how you found us when a link
        says so (for example &ldquo;from Reddit&rdquo;).
      </p>
      <ul>
        <li>
          Events are tied to a random ID kept in your browser&apos;s storage, or to your account ID once you sign in. Never your email,
          name, coordinates or IP-based location, and we strip location from page addresses before anything is sent.
        </li>
        <li>No session recordings, no heatmaps and no advertising use.</li>
        <li>
          If your browser sends Do Not Track or Global Privacy Control, analytics doesn&apos;t load at all. Clearing your site data
          resets the random ID.
        </li>
        <li>
          Separately, when someone starts walking to a toilet we add one to that toilet&apos;s count for the day. Only the count is
          kept, not who it was, so we can tell contributors how many people their toilets helped.
        </li>
      </ul>

      <h2>Photos</h2>
      <p>
        Photos are shrunk in your browser before upload, which also removes embedded location (EXIF) data. Photos are hidden until a
        moderator or trusted members approve them. Please don&apos;t photograph people.
      </p>

      <h2>Who sees what</h2>
      <ul>
        <li>Other users see your handle on reviews and, only if you opt in, on the leaderboard.</li>
        <li>
          When you confirm a toilet is still accurate, its page says it was last checked by your handle. You can turn this off on{" "}
          <Link href="/me" className="font-bold text-primary underline hover:decoration-[3px]">
            Me
          </Link>
          .
        </li>
        <li>We never show your email or real name publicly.</li>
        <li>
          Data is stored with our hosting providers in or near Singapore (Vercel, Neon Postgres, Cloudflare R2). Usage analytics are
          the one exception: they go to PostHog in the European Union, under its data processing terms.
        </li>
      </ul>

      <h2>Deleting your account</h2>
      <p>
        Open{" "}
        <Link href="/me" className="font-bold text-primary underline hover:decoration-[3px]">
          Me
        </Link>{" "}
        and choose <em>Delete my account</em>. This permanently deletes your profile, email, points and badges. Toilets, reviews and
        photos you contributed stay so the map remains useful, but they are anonymised and no longer linked to you.
      </p>

      <h2>Contact</h2>
      {CONTACT_EMAIL ? (
        <p>
          For access or correction requests, or questions about this notice, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Data%20request`} className="font-bold text-primary underline hover:decoration-[3px]">
            {CONTACT_EMAIL}
          </a>
          . Tell us the email you signed in with so we can find your account.
        </p>
      ) : (
        <p>
          For access or correction requests, or questions about this notice, see{" "}
          <Link href="/about#contact" className="font-bold text-primary underline hover:decoration-[3px]">
            Contact
          </Link>{" "}
          on the About page.
        </p>
      )}

      <p className="mt-12! border-t border-border/70 pt-4 text-sm text-muted">Last updated 20 October 2026.</p>
    </article>
  );
}
