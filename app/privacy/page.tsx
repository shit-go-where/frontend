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
      <ul>
        <li>
          Your browser remembers your last position on your device for a short while, so the next page opens quickly. It is used for
          30 minutes at most and is never kept on our servers.
        </li>
        <li>
          To limit abuse, our server counts requests by IP address in memory. Those counts aren&apos;t saved to our database. Like
          any web host, our hosting provider&apos;s standard server logs can include page addresses and IP addresses for a short time.
        </li>
      </ul>

      <h2 id="onemap" className="scroll-mt-20">
        Maps, place search and routes (OneMap)
      </h2>
      <p>
        Maps, place search and walking routes come from{" "}
        <a href="https://www.onemap.gov.sg/" className="font-bold text-primary underline hover:decoration-[3px]" target="_blank" rel="noopener noreferrer">
          OneMap
        </a>
        , run by the Singapore Land Authority (SLA), under its own terms.
      </p>
      <ul>
        <li>
          Map tiles load straight from OneMap&apos;s servers, so OneMap sees your IP address and which part of the map you are looking at.
        </li>
        <li>
          When you search for a place, our server sends OneMap the words you typed. When you ask for a walking route, it sends the
          start point (your position or the place you picked) and the toilet&apos;s location. These requests come from our server, not
          your phone, and don&apos;t carry your IP address or your account.
        </li>
        <li>A route can be reused for up to ten minutes from the server&apos;s memory so repeat requests are fast. It is not saved to our database.</li>
      </ul>

      <h2>Checking in or reporting without an account</h2>
      <p>
        If you check in or report a toilet&apos;s status without signing in, we set a cookie (<code>sgw_anon</code>) holding a
        random device ID (no name, email or location) for up to a year, so we can limit abuse and give you the points when you sign
        in. A check-in stores only your distance from the toilet, never your location, and a status report stores no location at
        all. When you sign in, those check-ins and reports move to your account and the cookie is removed. If you never sign in, they
        stay under the random ID and are not linked to a person.
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
        <li>
          A session cookie (<code>sgw_session</code>) so you stay signed in, for up to 30 days or until you sign out. We don&apos;t use
          advertising cookies. While you sign in with Google, a short-lived cookie (<code>sgw_oauth</code>, 10 minutes) holds the sign-in
          state.
        </li>
      </ul>

      <h2>Usage analytics</h2>
      <p>
        To learn which parts of the app help people and where they give up, we use{" "}
        <a href="https://posthog.com" className="font-bold text-primary underline hover:decoration-[3px]">
          PostHog
        </a>
        , hosted in the United States. It records which pages you open and a few actions: starting a walk to a toilet, arriving,
        sharing, checking in, reporting, reviewing, adding and voting, and signing in. It also records how you found us when a link
        says so (for example &ldquo;from Reddit&rdquo;).
      </p>
      <ul>
        <li>
          Events are tied to a random ID kept in your browser&apos;s storage, or to your account ID once you sign in. Never your email,
          name or coordinates, and we strip location from page addresses before anything is sent. PostHog&apos;s servers receive each
          request as any web service does, so they see your IP address, but we switch off the location lookup that uses it.
        </li>
        <li>No session recordings, no heatmaps and no advertising use.</li>
        <li>
          If your browser sends Do Not Track or Global Privacy Control, analytics doesn&apos;t load at all. Clearing your site data
          resets the random ID. Check-ins, reports, reviews, submissions, votes and sign-ins are also sent as events from our server, under your account ID,
          or under the random ID or a scrambled ID if you aren&apos;t signed in, with the toilet and, for check-ins, your distance
          rounded to 10 m.
        </li>
        <li>
          Separately, when someone starts walking to a toilet we add one to that toilet&apos;s count for the day. Only the count is
          kept, not who it was, so we can tell contributors how many people their toilets helped.
        </li>
      </ul>

      <h2 id="errors" className="scroll-mt-20">
        Error reports
      </h2>
      <p>
        When something breaks, the app sends an error report to{" "}
        <a href="https://sentry.io" className="font-bold text-primary underline hover:decoration-[3px]">
          Sentry
        </a>
        , hosted in the United States, so we can find and fix the problem. Nothing is sent while the app works normally.
      </p>
      <ul>
        <li>
          <strong>What a report holds:</strong> the type of error, its message and the lines of our code it came from, the page
          address without anything after the &ldquo;?&rdquo;, your browser and operating system, and which version of the app you
          had.
        </li>
        <li>
          <strong>What it doesn&apos;t hold:</strong> your name, email, account, coordinates, search words or cookies. We strip
          location and search text from page addresses and error messages before anything is sent, and we tell Sentry not to store
          your IP address.
        </li>
        <li>
          Reports from your browser go through our own website address. No session recordings and no tracking of what you do. If
          your browser sends Do Not Track or Global Privacy Control, your browser sends no reports at all. Errors on our server are
          still reported, with the same limits.
        </li>
      </ul>

      <h2 id="telegram" className="scroll-mt-20">
        Telegram bot
      </h2>
      <p>
        Our Telegram bot finds toilets and takes check-ins and status reports, like the app. You don&apos;t need an account to use it.
        Messages to the bot pass through Telegram, under Telegram&apos;s own privacy policy. If you send the bot a place name, the words are passed to OneMap for that one search and not kept.
      </p>
      <ul>
        <li>
          <strong>What we keep for each chat:</strong> the Telegram chat ID, whether it is a private chat or a group, the filters you
          saved, when the chat was started and last used, and, if you connect it on{" "}
          <Link href="/me" className="font-bold text-primary underline hover:decoration-[3px]">
            Me
          </Link>
          , the ID of your Shit Go Where account. In a private chat the chat ID is the same number as your Telegram user ID.
        </li>
        <li>
          <strong>What we don&apos;t keep:</strong> names, usernames, phone numbers, the text of your messages or your coordinates. A
          location you send is used for that one search, and to check you are within 150 m when you check in, then discarded. As in
          the app, a check-in stores only the distance.
        </li>
        <li>
          Check-ins and reports from a chat that isn&apos;t connected to an account are saved under a scrambled ID made from the chat
          ID with our server key. It can&apos;t be turned back into the chat ID without that key.
        </li>
        <li>
          In groups the bot runs with Telegram&apos;s privacy mode on: it only receives commands sent to it and replies to its own
          messages, never the group&apos;s conversation.
        </li>
        <li>
          Send <code>/stop</code> to the bot to delete the chat&apos;s record (its filters and any account link). <code>/unlink</code>{" "}
          or the Unlink button on Me disconnects your account. Deleting your account also removes the link. Removing the bot from a
          group, or blocking it, deletes the chat&apos;s record too. Check-ins and reports already made stay, under the scrambled ID
          or your account.
        </li>
      </ul>

      <h2>Photos</h2>
      <p>
        Photos are shrunk in your browser before upload, which also removes embedded location (EXIF) data, and our server
        re-encodes each photo again when it arrives. They are stored with Cloudflare R2.
      </p>
      <ul>
        <li>
          A photo stays off the public toilet page and reviews until a moderator or trusted members approve it. One that is rejected
          is deleted.
        </li>
        <li>
          A photo that comes with a new toilet or an edit is also shown to signed-in members near the toilet who are asked to check
          that submission, and to moderators and trusted members who review photos. Anyone who somehow had the photo&apos;s exact
          web address could open it, but the addresses are long random strings that we never publish.
        </li>
      </ul>
      <p>Please don&apos;t photograph people.</p>

      <h2>Who sees what</h2>
      <ul>
        <li>
          Other users see your handle on reviews, and your handle and points on the leaderboard. You can hide yourself from the
          leaderboard on{" "}
          <Link href="/me#leaderboard-optin" className="font-bold text-primary underline hover:decoration-[3px]">
            your profile
          </Link>
          .
        </li>
        <li>
          When you confirm a toilet is still accurate, its page says it was last checked by your handle. You can turn this off on{" "}
          <Link href="/me" className="font-bold text-primary underline hover:decoration-[3px]">
            Me
          </Link>
          .
        </li>
        <li>We never show your email or real name publicly.</li>
        <li>
          Data is stored with our hosting providers in or near Singapore (Vercel, Neon Postgres, Cloudflare R2). Usage analytics and
          error reports are the exceptions: they go to PostHog and Sentry in the United States, under their data processing terms.
        </li>
      </ul>

      <h2>Deleting your account</h2>
      <p>
        Open{" "}
        <Link href="/me" className="font-bold text-primary underline hover:decoration-[3px]">
          Me
        </Link>{" "}
        and choose <em>Delete my account</em>. This permanently deletes your profile, email, handle, profile picture link, points,
        badges, check-ins and Telegram link, and signs you out everywhere.
      </p>
      <p>
        Toilets, edits, reviews, photos, status reports, votes and reports you contributed stay so the map remains useful. They are
        no longer linked to your name, email or handle. The position you stood at when you
        submitted a toilet or edit stays with that submission. Events already sent to PostHog stay there under your random or account
        ID, which no longer points to anyone. If you want a particular review or photo removed, ask us (see Contact below).
      </p>

      <h2>How long we keep things</h2>
      <ul>
        <li>Your account, check-ins, points and badges: until you delete your account.</li>
        <li>Reviews, photos, toilets and edits: until they are removed. They stay after your account is deleted, as above.</li>
        <li>
          Status reports: shown while they are live, then removed from our database by a nightly clean-up about a week after they expire.
        </li>
        <li>Telegram chat record: until <code>/stop</code>, or the bot is removed from the chat or blocked.</li>
        <li>Error reports: deleted by Sentry within 90 days.</li>
        <li>
          Backups: we keep nightly database backups for 30 days, so deleted data drops out of them within about a month.
        </li>
        <li>
          In your browser: an unfinished &ldquo;add a toilet&rdquo; form is restored for up to 6 hours. Clear your site data to remove
          anything we store there.
        </li>
      </ul>

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

      <p className="mt-12! border-t border-border/70 pt-4 text-sm text-muted">
        <Link href="/terms" className="font-bold text-primary underline hover:decoration-[3px]">
          Terms of use
        </Link>{" "}
        · Last updated 24 October 2026.
      </p>
    </article>
  );
}
