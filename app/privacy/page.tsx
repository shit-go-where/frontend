import type { Metadata } from "next";
import Link from "next/link";

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
        <li>A session cookie (<code>sgw_session</code>) so you stay signed in. We don&apos;t use advertising or tracking cookies.</li>
      </ul>

      <h2>Photos</h2>
      <p>
        Photos are shrunk in your browser before upload, which also removes embedded location (EXIF) data. Photos are hidden until a
        moderator or trusted members approve them. Please don&apos;t photograph people.
      </p>

      <h2>Who sees what</h2>
      <ul>
        <li>Other users see your handle on reviews and, only if you opt in, on the leaderboard.</li>
        <li>We never show your email or real name publicly.</li>
        <li>Data is stored with our hosting providers in or near Singapore (Vercel, Neon Postgres, Cloudflare R2).</li>
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
      <p>
        For access or correction requests, or questions about this notice, contact the Shit Go Where team through the project&apos;s
        GitHub organisation.
      </p>

      <p className="mt-12! border-t border-border/70 pt-4 text-sm text-muted">Last updated 18 October 2026.</p>
    </article>
  );
}
