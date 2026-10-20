# Production readiness audit: findings

Audit of `AUDIT_PLAN.md` run on 20 October 2026 against the merged baseline (main plus the motion,
leaderboard and Telegram keyboard branches), by six audit agents working in parallel, each on one area,
with the fixes reviewed and the suites re-run before commit. Everything below sits on the
`claude/production-readiness-audit-k5u4nh` branches of both repos.

How to read this: the summary and the open-items lists are here at the top. Sections A to F are each
agent's full report, kept verbatim (ids B-, F-, M-, I-, L- are theirs). Raw data (axe and Lighthouse
JSON, EXPLAIN plans, dependency audit output, screenshots) stayed in the session's scratch space and is
not in the repo; the reports quote the numbers that matter.

What could not be done from the cloud session: anything on a real phone (WebKit, iOS standalone, the
Telegram in-app browser, real network), the live probes of https://shitgowhere.com (the session's
egress policy blocked the host; `backend/docs/probe-production.sh` runs them from your machine), the
load test (needs a preview deploy with a seeded Neon branch) and a restore drill on Neon itself.

## Totals

| Area | Findings | Critical | High | Medium | Low | Fixed | Open |
|---|---|---|---|---|---|---|---|
| A. API and backend (§5) | 24 | 0 | 4 | 13 | 7 | 13 | 11 |
| B. Frontend code and build (§4) | 21 | 0 | 4 | 8 | 9 | 11 (+2 verified clean) | 8 |
| C. Emulated phone checks (§3, §9) | 22 | 0 | 0 | 8 | 14 | 11 (two in part) | 11 |
| D. Infrastructure, operations, CI (§6, §7, §9) | 31 | 0 | 4 | 13 | 11 (+3 info) | 7 areas fixed in CI, docs and runbooks | code and owner items |
| E. Legal, privacy, content (§10) | 16 | 0 | 1 | 8 | 7 | 5 in text (+4 disclosed) | 7 |
| F. Inventories | reference only | | | | | | |

"Fixed" counts include B-14, the client-IP finding, which both the backend (`fix(throttle)`) and the
frontend (`proxy.ts`) commits close; the inventory, infra and frontend agents raised the same issue as
observation 3, I-14 and F-04.

## What changed in the code

- **Backend:** trust and points shortcuts closed (photo reviews no longer count toward TRUSTED, status
  confirmations pay once per pair per day); cooldowns and daily caps re-checked under a per-person
  advisory lock so parallel requests cannot bypass them; presigned uploads sign the byte length and
  images over 40 MP are rejected; per-route throttles on OneMap-spending and write routes; Telegram
  update de-duplication; avatar URLs removed from public JSON; unapproved photos hidden once a
  submission is decided; account deletion clears positions and free text; the DB pool fails fast and
  is attached to Vercel's lifecycle; rate limits key on the real client IP when the frontend sends the
  proxy secret; 19 new e2e tests for IDOR, roles and abuse rules (280 unit, 155 e2e passing).
- **Frontend:** Content-Security-Policy and the other security headers on every path; MapLibre 6.12
  (clears the critical advisory) served so the main thread and worker share one download; `proxy.ts`
  forwards each phone's IP to the API; the service worker forgets personalised answers on sign-out,
  deletion and 401, races the network on every API read, and evicts removed toilets; structured
  error logging in both error boundaries and `instrumentation.ts`; the build fails when `API_ORIGIN`
  is missing on Vercel; canonicals and noindex; accessibility fixes (contrast tokens, headings,
  labels, 44 px links, radiogroup markup, large-text wrapping, reduced-motion fold); privacy, terms
  and about pages rewritten to match the code, with a new `/terms`; Playwright now runs 228 tests on
  nine projects (Pixel 7, iPhone 15, iPhone SE, 430 px Android, axe, three layout widths, offline).
- **Operations:** nightly backups are verified by restoring them, keep at least seven copies and can
  ping a dead-man's switch; a weekly keepalive counters GitHub's 60-day auto-disable; a Vercel
  `ignoreCommand` skips docs-only builds and can gate production on green CI; informational `pnpm
  audit` jobs and Dependabot in both repos; `backend/docs/RUNBOOKS.md`; every environment variable
  documented with its production value.

## Open: needs you (environment, accounts, decisions)

In rough order of launch impact.

1. **Set `API_PROXY_SECRET`** (same `openssl rand -hex 32` value) in both Vercel projects, Production
   and Preview. Without it the API still sees one Vercel IP for every phone and the per-route limits
   apply to all anonymous visitors together (B-14, F-04, I-14).
2. **Set `NEXT_PUBLIC_CONTACT_EMAIL`** in the frontend project. Until then nobody can reach a human
   for a data request or a takedown (L-01, high).
3. **Photo bucket is fully public** (B-13, high): unapproved photos and raw `tmp/` uploads are
   reachable by anyone with the URL. Decide between a private bucket with presigned reads (proposed
   design in A) and accepting it for launch with the `tmp/` lifecycle rule in place (I-15, L-14).
4. **Vercel plan** (I-05, high): Hobby is non-commercial only, pauses the project at its hard
   allowances and keeps about one hour of logs. Decide before announcing.
5. **Error tracking and uptime** (I-03, I-04, F-06, high): add a Sentry DSN (wiring plan in B) and a
   one-minute probe on `/api/health` with alerts; the structured logs are an interim measure.
6. **Google OAuth**: confirm the consent screen is published, not in testing mode (I-17); brand
   verification needs the custom domain and may object to the app name, so have a fallback
   consent-screen name (L-06).
7. **PostHog**: turn on "Discard client IP data" (L-07, F-08).
8. **Cloudflare R2**: apply the CORS rule for `https://shitgowhere.com` and the `tmp/` lifecycle rule,
   then do one real photo upload from the production origin (I-15, F-01 follow-up).
9. **After the deploy**: run `backend/docs/probe-production.sh` from your machine and compare with the
   expected-header table in D; create the `BACKUP_HEARTBEAT_URL` check and secret; do one Neon
   restore drill following the runbook; run the §8 load test against a preview.
10. **Legal**: have counsel read `/terms` and add the operating entity; confirm you may publish the
    fieldwork survey scores (L-13).

## Open: code, by severity

Medium, worth the first sprint after launch:

- Performance on a phone (M-02, M-03, M-04): Lighthouse mobile LCP 3.6 to 4.2 s against the 2.5 s
  budget on every route, so launch gate 5 is not met; about 500 kB compressed JS on `/` once the map
  loads; main thread blocked 363 to 423 ms. Proposals in C (server-render the first list, split
  MapLibre further, lazy-load the stations list F-10, `"use cache"` on toilet pages F-09).
- "Walk there" sits below the first screen on an iPhone SE and a 360x640 Android and partly under the
  tab bar on an iPhone 14/15 (M-07). Proposal: pin the CTA row above the tab bar on short viewports.
- Large system text (150 to 200 %) still overflows the leaderboard podium, `/go` filter bar, `/login`,
  `/stations`, `/admin` and the tab bar (M-06).
- Rate limits are in memory per function instance (B-15); move the hot ones to Postgres in the first
  month. Sessions cannot be revoked and there is no ban switch (B-16, I-19; runbook workaround).
- Anonymous "second device" closures can be forged by a cookieless script (B-17); distance rules
  trust client coordinates and first-check-in points have no cap (B-18).
- No way to report or delete a review or a published photo from the UI; takedown means SQL (L-03,
  I-18). Account deletion still keeps review text and photos (B-11 partial, L-02).
- Migrations run before compile in the Vercel build and rollback past `20261019120000_community_loop`
  is unsafe (I-06, I-08); a Preview holding the production database would migrate it (I-07).
- No `Cache-Control` on `nearby` and `in-bounds`, so every map move is a function invocation plus six
  queries (I-16).
- Placeholder `AUTH_SECRET` or `CRON_SECRET` and a localhost `PUBLIC_APP_URL` are accepted in
  production (I-12).

Low items are listed in each area's report.

## Launch gates (plan §11) as of this audit

| Gate | Status |
|---|---|
| 1. Core flows on two current phones, including offline | Emulation passes (228 tests); real devices still to do |
| 2. No high or critical open in §5 | B-13 (public bucket) open, awaiting your decision |
| 3. Security headers and error reporting live | Headers done; error reporting interim (structured logs), Sentry pending |
| 4. Backup restore drill and rollback runbook | Local round trip and runbook done; Neon drill pending |
| 5. Lighthouse budgets on `/` and `/go` | Not met (LCP 3.6 to 4.2 s locally) |
| 6. Uptime monitor and alerts | Not set up |
| 7. Privacy, attributions, OAuth consent published | Pages done; consent screen state to confirm |
| 8. Vercel plan and third-party terms | Your decision |
| 9. Load test at 2x passes | Not run (needs a preview with a seeded Neon branch) |



---

## A. API and backend (plan §5)

Repo `/home/user/backend`, branch `claude/production-readiness-audit-k5u4nh` (HEAD `d6855a9`, Telegram keyboard branch merged), audited 2026-10-20 against local Postgres 16. Baseline before any change: typecheck clean, lint 0 errors, `pnpm test` 28 files / 278 tests, `pnpm test:e2e` 10 files / 135 tests, `pnpm audit --prod` "No known vulnerabilities found".

**Summary.** Authentication is sound: cookie flags, signed OAuth state, redirect validation, the dev-login boot guard and the HMAC device cookie all hold. Every mutating route has the right guard, and the new IDOR tests found no ownership hole. The serious problems were in the abuse rules. Anyone could become TRUSTED alone in minutes by posting ten reviews with any photo, or with two accounts by confirming each other's status reports. TRUSTED can approve submissions on its own and, two of them together, can publish photos. Parallel requests also got past the check-in cooldown and daily point cap, and past the open-submission and auto-publish caps. All of these are fixed and covered by tests. Also fixed: presigned uploads now have a size limit, image decoding has a pixel cap, OneMap-spending and write routes have tighter throttles, Telegram retries are de-duplicated, and three privacy items from the legal audit (avatar URLs, pending photo visibility, deletion scrubbing). Two high items stay open and need a decision or infrastructure work: the R2 bucket is fully public, so unapproved photos and raw `tmp/` uploads can be fetched by anyone with the URL; and it is not verified what client IP the API sees behind the Next rewrite and from server-side rendering. If that IP turns out to be shared, every per-IP limit becomes one global limit. Final state: typecheck clean, lint 0 errors (10 warnings, all already present in `src/imports`), unit 28 files / 280 tests, e2e 11 files / 155 tests, `openapi.json` unchanged by `pnpm openapi`.

Counts: **4 high** (2 fixed, 2 open), **13 medium** (9 fixed, 4 open), **7 low** (1 fixed, 6 open).

---

#### Fixed

##### B-01 · high · A single user could become TRUSTED by posting ten photo reviews
- **Location:** `src/gamification/points.service.ts:27` (TRUST_REASONS), `src/reviews/reviews.service.ts:92`.
- **Traced:** `POST /media/presign` → PUT → `POST /media/:id/confirm` (any image) → `POST /toilets/:id/reviews {cleanliness, photoIds:[id]}` on 10 different toilets. Each review awards REVIEW_WITH_PHOTO (+5) as soon as the photo is *confirmed*, not approved. That reason counted toward `trustScore`, and `PointsService.award` promotes USER to TRUSTED at 50. A review needs no location and has no rate limit beyond the default 120/min. TRUSTED can then approve any NEW/EDIT/CLOSE submission alone (`quorum.ts`: 1 TRUSTED APPROVE), so it can close or edit any toilet, list every pending photo (`GET /admin/photos/pending`), and give one of the two approvals that publish a photo.
- **Evidence:** before the fix the new test `ten photo reviews no longer make anyone TRUSTED on their own` would reach trustScore 50 / role TRUSTED. After the fix: `role: 'USER', trustScore: 0`, points still 100.
- **Status:** fixed. REVIEW_WITH_PHOTO is points only (the leaderboard still counts it); the trust reasons are documented in `API_CONTRACT.md`. Files: `src/gamification/points.service.ts`, `API_CONTRACT.md`, `test/security.e2e-spec.ts`.

##### B-02 · high · Two accounts could farm TRUSTED through status confirmations
- **Location:** `src/status/status.service.ts:121-160` (`confirm`).
- **Traced:** account A `POST /toilets/:id/status` on many toilets (10/min; there are thousands of toilets and 6 kinds), account B `POST /status/:id/confirm` on each (30/min). Each confirmation pays A STATUS_CONFIRMED +2, a trust reason, with refId `${report}:${confirmer}`, so it is unique per report. 25 confirmations make A TRUSTED, and swapping roles makes B TRUSTED too: about 5 minutes with two Google accounts, and nothing visible on the map.
- **Evidence:** test `one confirmer earns a reporter STATUS_CONFIRMED at most once a day`: 3 confirmations from the same confirmer plus 1 from a second confirmer pay exactly 2 ledger rows (trust 4). Each confirmation still extends the report (`confirmations: 1`).
- **Status:** fixed. One STATUS_CONFIRMED award per (reporter, confirmer) pair per Singapore day (`CONFIRM_POINTS_PER_PAIR_PER_DAY`). Two accounts now need about 25 days, and every extra sybil account is one more Google account. Residual: see B-18 (sybil quorums). Files: `src/status/status.service.ts`, `API_CONTRACT.md`, `test/security.e2e-spec.ts`.

##### B-03 · medium · Parallel check-ins got past the 2 h cooldown and the 5-a-day point cap
- **Location:** `src/gamification/gamification.service.ts:200-230` (signed in), `:280-300` (anonymous).
- **Traced:** the cooldown `findFirst` ran outside the transaction, and the daily cap `count` ran inside it under READ COMMITTED. N parallel `POST /toilets/:id/check-ins` from one session all passed both checks. Each created a CheckIn and a CHECK_IN ledger row (refId is the check-in id, so the rows never collided), and `seenBy` was incremented more than once.
- **Evidence:** with the lock disabled, the new test got `[201, 201, 201, 201, 201, 201]` and 6 check-ins. With the fix: `[201, 429×5]`, 1 check-in, 1 CHECK_IN point.
- **Status:** fixed. A per-person (or per-device) transaction-scoped Postgres advisory lock (`src/common/locks.ts`), with the cooldown and caps re-read inside the locked transaction. This works across function instances. Files: `src/common/locks.ts` (new), `src/gamification/gamification.service.ts`, `test/security.e2e-spec.ts`.

##### B-04 · medium · Parallel submissions got past the open-submission cap and the 3-a-day auto-publish cap
- **Location:** `src/submissions/submissions.service.ts:290-335` (`create`, `assertOpenCap`, `lockSubmitter`, `autoPublishHistory`).
- **Traced:** `create` counted open submissions, and `createNewToilet` read today's auto-publishes, before the insert transaction. Six parallel on-site NEW_TOILET posts, each with its own photo, all went live at once.
- **Evidence:** with the lock disabled the new test saw `expected 6 to be 3`; with the fix exactly 3 are `autoPublished`.
- **Status:** fixed. The same advisory lock per submitter; the open cap and the auto-publish history are re-checked inside the transaction (the fast-fail pre-check stays). Files: `src/submissions/submissions.service.ts`, `test/security.e2e-spec.ts`.

##### B-05 · medium · Presigned upload URLs accepted any size
- **Location:** `src/media/storage.ts:55-66`, `src/media/media.service.ts` `presign`, `src/media/media.controller.ts` presign.
- **Traced:** `POST /media/presign {size}` validated `size <= 5 MB` but did not sign it into the URL. The PUT went straight to R2 (up to 5 GB per PUT), and the URL can be reused for 10 minutes. `confirm` rejects anything over 5 MB, but an upload that is never confirmed sits in the public bucket (B-13) until a lifecycle rule removes it, and a swap between `head` and `get` could load a large object into function memory.
- **Evidence:** with the real AWS presigner, `X-Amz-SignedHeaders` changed from `content-type;host` to `content-length;content-type;host`. The new unit test checks `ContentLength` and the signed headers. The frontend PUTs the same blob whose `size` it declared (`lib/api/client.ts:391-399`, browsers set Content-Length themselves), so no frontend change is needed.
- **Status:** fixed. Files: `src/media/storage.ts`, `src/media/media.service.ts`, `src/media/media.controller.ts`, `src/media/media.service.spec.ts`.

##### B-06 · medium · Decompression bomb in the sharp pipeline
- **Location:** `src/media/media.service.ts:33, 150-175`.
- **Traced:** `confirm` decoded with sharp's default `limitInputPixels` (268 MP). A 5 MB file can declare enormous dimensions (an 8000×6000 single-colour PNG is a few hundred KB and decodes to about 192 MB per copy, and the pipeline clones twice), so a few such uploads exhaust the function's memory. The app resizes to 1600 px before upload (`frontend/lib/image.ts`, about 2.6 MP).
- **Evidence:** new unit test: an 8000×6000 PNG is rejected with `Image dimensions are too large` and the tmp object is deleted.
- **Status:** fixed. `MAX_INPUT_PIXELS = 40 MP`, checked from the header before decoding and enforced again on the decode pipeline. Files: `src/media/media.service.ts`, `src/media/media.service.spec.ts`.

##### B-07 · medium · Routes that spend OneMap and several write routes had only the default 120/min
- **Location:** `routing.controller.ts` (recommend, walk, geo/search), `submissions.controller.ts` (POST, PATCH, votes), `gamification.controller.ts` (check-ins, verify), `reviews.controller.ts` (POST), `media.controller.ts` (confirm).
- **Traced:** (inventory agent's list, verified against the code) Signed out, one IP could call `POST /routing/recommend` 120 times a minute. Each call can make up to 3 OneMap route requests on the single shared account, so one script could use up OneMap's per-account rate limit and push everyone onto straight-line estimates. `POST /toilets/:id/verify {accurate:false}` creates a Flag, which got around the 5/min flag limit (flags escalate auto-published toilets). `confirm` costs a sharp re-encode per call.
- **Status:** fixed. Limits are per signed-in user, else per IP, per instance: recommend 30/min, walk 30/min, geo/search 60/min (the app debounces search by 300 ms), check-ins 10/min, verify 5/min (same as flags), reviews 10/min, POST and PATCH submissions 10/min, votes 20/min, media confirm 30/min. All of these are well above what one person on the app does. They are still in-memory per instance (B-15), and per-IP limits are subject to B-14 and to mobile CGNAT. The nine routes with no frontend caller were checked: `PATCH /admin/users/:id/role` is ADMIN only (method `@MinRole` overrides the class's MODERATOR), `PATCH /admin/toilets/:id` and `GET /admin/metrics` are MODERATOR+, `/admin/jobs/:name` uses the cron secret, `/media/files/*` and `PUT /media/:id/upload` return 404 unless local storage, `/integrations/telegram` needs its secret, and `/health`, `GET /venues/:id` and `/auth/callback` are public by design. Role guards are asserted in `test/security.e2e-spec.ts`. Files: the five controllers above, `API_CONTRACT.md`.

##### B-08 · medium · Telegram updates had no de-duplication
- **Location:** `src/integrations/telegram/telegram.service.ts` (`RecentUpdates`, `handleUpdate`).
- **Traced:** Telegram resends an update when our 200 is slow or lost (a cold start plus OneMap timeouts can approach Vercel's 30 s cap). The retry was handled again: duplicate replies, a second recommend run and a second route count. Check-ins and reports are partly protected by cooldowns.
- **Evidence:** new e2e test `handles a retried update (same update_id) only once`: the second post of the same update returns 200 and makes no Bot API calls.
- **Status:** fixed. A bounded FIFO of the last 2,000 update ids per instance (a retry normally lands on the same warm instance, and the service cooldowns cover the rest). Files: `src/integrations/telegram/telegram.service.ts`, `test/telegram.e2e-spec.ts`. Other webhook checks passed: the secret is compared in constant time (sha256 + `timingSafeEqual`), it fails closed (503) when unset, per-chat limits exist, and only the chat id, type, filters, link and timestamps are stored (no text or coordinates). `/stop` and bot removal delete the row. Contributions made under `hashTelegramId(chat)` stay, which the privacy page now says.

##### B-09 · medium · Public reviews and the leaderboard exposed Google profile picture URLs (legal L-05)
- **Location:** `src/toilets/toilet-presenter.service.ts` `toReview`, `src/gamification/gamification.service.ts` `topUsers`.
- **Traced:** an unauthenticated `GET /toilets/:id` or `/toilets/:id/reviews`, and `GET /leaderboard/users`, returned `user.avatarUrl` (a googleusercontent.com link, often a face) next to the handle. The frontend renders `avatarUrl` only on `/me` (`app/me/me-client.tsx:177`, which uses `GET /me` and is unchanged). `lib/api/types.ts:180, 513` declares the fields as `string | null`.
- **Status:** fixed without changing the contract. The field stays (nullable) and is always `null` in public responses; Prisma no longer selects it. `openapi.json` is unchanged. Proposed follow-up: drop the field from both DTOs together with the frontend types. Evidence: e2e test `public reviews and the leaderboard never carry the Google avatar URL`. Files: `src/toilets/toilet-presenter.service.ts`, `src/toilets/toilet.schemas.ts`, `src/gamification/gamification.service.ts`, `API_CONTRACT.md`.

##### B-10 · medium · Unapproved photos visible on any submission to any signed-in user (legal L-04)
- **Location:** `src/submissions/submissions.service.ts:160-170, 200-205` (`toView`).
- **Decision:** showing the photos is by design while a submission is **open**. Kaypoh reviewers must see the photo they are judging, and `/review?id=` is a deliberate shared link (the toilet page links its `openSubmissionId`), so `GET /submissions/:id` stays open to any signed-in user. A nearness check would break those links.
- **Narrowed:** once a submission is decided (APPROVED or REJECTED), or while it is `escalated_flagged` (moderator only), unapproved photos go only to the submitter and MODERATOR+; everyone else gets approved photos only. This applies to `get`, `queue`, `mine` and the moderator queue.
- **Evidence:** e2e test `hides a decided submission's unapproved photos ...` (open: visible to bob; rejected: hidden from bob, visible to alice and the moderator; approved photo: visible to all).
- **Status:** fixed (API side). The underlying exposure, that the object itself is public in R2, is B-13. Files: `src/submissions/submissions.service.ts`, `API_CONTRACT.md`, `test/security.e2e-spec.ts`.

##### B-11 · medium · Account deletion kept positions and free text (legal L-02)
- **Location:** `src/users/users.service.ts:248-285` (`deleteMe`).
- **Status:** fixed in part. In the same transaction, deletion now nulls `Submission.submittedLat/Lng` on the user's submissions (`submitterDistanceM` then reads null, while `onSite` and `path` history stay), nulls the user's `SubmissionVote.comment`, and replaces the `reason` of their **resolved** flags with "Removed: the reporter deleted their account". Open flags keep their reason until a moderator has acted. Evidence: extended `DELETE /me` e2e test. Files: `src/users/users.service.ts`, `API_CONTRACT.md`, `test/accounts.e2e-spec.ts`.
- **Proposed (not applied):** (a) review comments and photos stay. Offer "also delete my reviews and photos", deleting the R2 objects via `MediaService.deletePhotoObjects`; that needs a product decision and a UsersModule to MediaModule dependency. (b) The `payload.note` free text on NEEDS_INFO answers stays inside the JSON payload. (c) Confirmed photos never attached to anything stay (B-21). (d) `GET /me/export` stays a proposal only, as the coordinator asked.

##### B-12 · low · Database pool waited forever for a connection, with no Fluid lifecycle hook
- **Location:** `src/prisma/prisma.service.ts`.
- **Traced:** `PrismaPg({connectionString})` builds a `pg.Pool` with `connectionTimeoutMillis: 0` (wait forever, max 10 per instance). Under a burst, a request queued behind the pool hung until the 30 s function cap instead of failing fast. The pool was also not registered with Vercel's `attachDatabasePool`, so suspended Fluid instances kept idle Neon connections open.
- **Status:** fixed. The service now builds its own `pg.Pool` with `connectionTimeoutMillis: 10_000`, calls `attachDatabasePool(pool)` (from `@vercel/functions`, already a dependency; it does nothing off Vercel), and uses `PrismaPg(pool, { disposeExternalPool: true })`, so `$disconnect` still ends the pool. Pool size stays at pg's default of 10 per instance. §6 should size it against Neon's pooler under the §8 load test. Files: `src/prisma/prisma.service.ts`.

---

#### Open (proposed)

##### B-13 · high · The photo bucket is fully public: unapproved photos and raw `tmp/` uploads can be fetched by anyone with the URL
- **Location:** `src/media/media.service.ts` (`presign` writes `tmp/<userId>/<id>`, `confirm` writes `photos/<id>` and `thumbs/<id>` before approval), `src/media/storage.ts` `publicUrl`; README: `S3_PUBLIC_URL` = `pub-<hash>.r2.dev` (public bucket).
- **Traced:** sign in, presign, PUT any image, confirm. The confirm response itself returns `https://pub-…/photos/<id>.jpg`, which is public at once with no moderation, and need never be attached to a toilet. Even without confirming, the raw PUT bytes sit at a public `tmp/` key (with the user id in the path) until the lifecycle rule runs. That makes the bucket free, unmoderated image hosting on the project's domain (abuse imagery, takedown liability), and "the public bucket only ever holds approved photos" is false. Approval only controls which URLs the API lists.
- **Fix (not applied: it changes storage layout and needs a second bucket or private reads, which is not a local edit):** keep uploads and unapproved photos in a **private** bucket (or a private R2 bucket plus a custom-domain public bucket). Serve them to reviewers through short-lived presigned GETs from the API, copy to the public bucket on approval (`AdminService.approvePhoto`), delete on reject. Until then, at minimum confirm the R2 lifecycle rule on `tmp/` (1 day), and write a takedown runbook (`POST /admin/photos/:id/reject` works on any photo id, approved or not).

##### B-14 · high (verify before launch) · The client IP the API sees behind the rewrite and from SSR
- **Location:** `src/common/throttle.ts:47` (`clientIp`: `x-real-ip`, then the first `x-forwarded-for` hop, then `req.ip`); every per-IP limit (`DailyLimiter` 30 anonymous check-ins and 30 anonymous reports per IP per day, 100 route starts per IP per day, and the throttle key for signed-out users).
- **Traced:** browser → frontend Vercel edge → external rewrite `/api/:path*` → the API's Vercel edge → function. If the API's edge records the frontend proxy's address instead of the phone's, all signed-out traffic shares one bucket: 30 anonymous check-ins **for everyone** per day per API instance, 120/min per route overall, and the new 30/min recommend limit shared by all users. Separately, `frontend/lib/api/server.ts` calls `API_ORIGIN` directly from the frontend function: the uncached `getToiletServer` runs for every `/toilets/[id]` page and OG image, and those calls share the function's egress IP. Shared toilet links would then start returning "The API answered 429" at around 2 renders per second per API instance. Behind Singapore mobile CGNAT, many real users also share one IP.
- **Verify:** at the production origin, from two phones on different networks, call `GET /api/toilets/nearby?...` and compare `X-RateLimit-Remaining`. Independent counters mean the client IP arrives; one shared counter confirms the problem. Repeat with a toilet page render.
- **Fix (proposed, needs both repos):** a shared secret `INTERNAL_API_SECRET`. The frontend's SSR fetches (and, if the rewrite drops the IP, a Next middleware or route handler) send `x-sgw-internal` plus `x-sgw-client-ip`; the API trusts those headers only when the secret matches, and SSR reads with no client IP skip the per-IP throttle. Not applied because it is cross-repo and depends on the verification above.

##### B-15 · medium · Rate limits are in memory per instance
- **Location:** `src/common/throttle.ts` (ThrottleGuard, DailyLimiter), `telegram.service.ts` (ChatLimiter, per-chat daily limiters).
- **Assessment:** on Fluid compute each warm instance has its own counters and a cold start resets them, so every limit is per instance and advisory. The caps that matter for integrity now live in Postgres: check-in cooldowns and the per-device 5/day, the open-submission and auto-publish caps (now race-safe), points uniqueness, and the per-pair STATUS_CONFIRMED cap. The in-memory limits are acceptable for a small launch as anti-casual-abuse limits, **provided B-14 is resolved**. Move to Postgres or an external store in month one, in this order: anonymous status reports per IP (they feed B-17), `POST /submissions`, `POST /media/presign`, `POST /routing/recommend` (OneMap spend), Telegram per-chat limits. A small `RateCounter(key, window, count)` table with `INSERT … ON CONFLICT DO UPDATE … RETURNING count` costs one round trip.

##### B-16 · medium · Sessions cannot be revoked, and there is no way to ban a user
- **Location:** `src/common/auth/session.ts` (30-day stateless HMAC token), `src/auth/auth.controller.ts:153` (logout only clears the cookie), `src/common/auth/auth.guard.ts:35` (rejects only `deletedAt`).
- **Traced:** a stolen or leaked cookie stays valid for 30 days after sign-out. Demoting a moderator works on the next request (roles are reloaded from the DB), but nothing stops an abusive user except deleting their account. The only global kill switch is rotating `AUTH_SECRET`, which signs out everyone and also changes the Telegram `hashTelegramId` device ids (their anonymous contributions would no longer match).
- **Fix (proposed, needs a migration):** add `User.sessionsValidAfter DateTime?` and `User.bannedAt DateTime?`; put `iat` in the token; have `loadUser` reject `iat < sessionsValidAfter` or `bannedAt`; set `sessionsValidAfter = now()` on logout (optionally a "sign out everywhere" action) and on ban. Add `POST /admin/users/:id/ban` (ADMIN). `trackerFor` needs no change.

##### B-17 · medium · The "second device" rule for anonymous closures can be forged by any script
- **Location:** `src/status/unconfirmed.ts:22` (`isUnconfirmed`), `src/status/status.controller.ts:41-47`.
- **Traced:** a request without an `sgw_anon` cookie gets a new device id. Two cookieless `POST /toilets/:id/status {kind:'CLOSED_NOW'}` therefore count as two devices, and the closure counts: the toilet drops out of `recommend` and pins for 1 hour. Signed-out reports have no location check, so one IP can hide about 15 toilets an hour (30 reports per IP per day per instance), and IP rotation removes even that limit.
- **Fix (proposed, product rule):** count an anonymous closure only after a signed-in report or confirmation, or require the second device to be a different IP prefix (store a salted /24 hash on the report, kept 24 h) **and** older than N hours. Not applied because it changes documented behaviour (`API_CONTRACT.md` "a second device reports the same kind").

##### B-18 · medium · Every distance rule trusts the coordinates the client sends; first-check-in points have no cap
- **Location:** `gamification.service.ts` `loadToiletWithin` / `checkIn`, `submissions.service.ts` `vote` / `createForToilet`, `quorum.ts`.
- **Traced:** `lat/lng` in check-ins, votes, edits and new-toilet submissions come from the client, so a script that copies each toilet's coordinates from the public API passes every 150 m check. (1) Leaderboard: FIRST_CHECK_IN_AT_TOILET (+3) has no daily cap, so one account can check in at all of the roughly 2,000+ toilets (now at most 10 a minute) and earn 6,000+ points plus badges. (2) Quorum: two accounts can approve any CLOSE_TOILET or EDIT_TOILET (1 nearby approval). An on-site NEW_TOILET goes live after one other person's check-in and pays +20 trust, so three fake toilets make a sybil TRUSTED (the residual path after B-01 and B-02, which leaves visible fake toilets for moderators to catch).
- **Fix (proposed, product rules):** cap FIRST_CHECK_IN_AT_TOILET awards per Singapore day (say 10); add an impossible-travel check (reject a check-in, vote or edit when the distance from the person's previous one divided by the elapsed time is over about 30 m/s and the distance is over 1 km); require a minimum account age (say 7 days) before TRUSTED promotion and before a vote counts toward quorum; for photo publishing, consider requiring one MODERATOR rather than two TRUSTED.

##### B-19 · low · `/docs` and `/openapi.json` are public
- **Location:** `src/app.factory.ts:16`.
- **Assessment:** the spec lists the admin routes (their guards hold) and nothing secret. The frontend generates its client from the committed `openapi.json`, not the live one; `test/telegram.e2e-spec.ts` reads `/openapi.json`. Recommendation: keep `/openapi.json`, and serve Swagger UI only when `NODE_ENV !== 'production'`. That saves cold-start work and removes a public surface. Left as a product decision.

##### B-20 · low · Cron and webhook secrets have no minimum length, and the cron route is not throttled
- **Location:** `src/config/env.ts:41, 50`; `AdminJobsController` `@SkipThrottle`.
- **Assessment:** both comparisons are constant time, but a short secret could be brute-forced with no throttle (`.env.example` ships `change-me`). Proposed: in production, refuse to boot when `CRON_SECRET` or `TELEGRAM_WEBHOOK_SECRET` is set but shorter than 32 characters (same pattern as the DEV_LOGIN guard). Not applied because it could break a deployed environment that has a short secret today; check the production values first.

##### B-21 · low · Orphaned Photo rows and objects are never cleaned up
- **Location:** `media.service.ts` `presign` (creates a Photo row per call, 30/min per user), `admin.service.ts` `runJob`.
- **Assessment:** unconfirmed rows, and confirmed photos never attached to a review or submission, stay forever (rows in Neon, objects in R2, public per B-13). Proposed: a `cleanup-media` cron job that deletes rows with `confirmed=false` older than 1 day, plus confirmed, unattached, unapproved photos older than 7 days and their objects (`deletePhotoObjects`).

##### B-22 · low · Admin and dev-login configuration
- `ADMIN_EMAILS` only promotes (`auth.service.ts` `upsertGoogleUser`). Removing an email from the list does not demote that user; use `PATCH /admin/users/:id/role`. Put this in the runbook.
- `DEV_LOGIN_ENABLED` is refused at boot only when `NODE_ENV=production`. Vercel sets production for previews too, so that is safe, but any other host running with development `NODE_ENV` and the flag on gives sign-in as any email, including the admin emails. Keep it unset in every shared environment (env-parity table, §6).

##### B-23 · low · Telegram edge cases
- Link phishing: an attacker can send someone their own `t.me/<bot>?start=link_<token>`. Opening it links the victim's chat to the attacker's account and moves the chat's banked anonymous points over. The bot's reply names the handle, so the victim can see it. Optional: ask for a confirm button before linking.
- In a group, any member can `/stop` and wipe the group's saved filters. Acceptable.

##### B-24 · low · Errors and logs
- Responses: there is no custom exception filter, so unknown errors get Nest's generic `{statusCode:500,message:'Internal server error'}` with no stack or SQL in the body; zod errors are 400. Logs: no emails, tokens or coordinates are logged (checked every `Logger` call). The Telegram error boundary logs only the update kind and the error message. Nest's ExceptionsHandler does log stacks, which can contain Prisma messages naming fields (not values). The logger runs at `['error','warn','log']`, so every cold start logs about 70 route-mapping lines. Proposed: `['error','warn']` in production, and wire `SENTRY_DSN` (declared, never read) with PII scrubbing, as §4 already plans.

---

#### Checked and OK (no finding)
- `sgw_session`: httpOnly, `Secure` when `NODE_ENV=production`, SameSite Lax, path `/`, 30 days. The HMAC is compared in constant time. The role is never taken from the token (it is reloaded from the DB), and deleted users are rejected.
- OAuth: random 24-byte state in a signed 10-minute `sgw_oauth` cookie, cleared on callback. `safeRedirect` rejects `//`, `/\`, control characters and anything off-origin, and is applied again when decoding. Every failure goes to `/login?error=`. Google `email_verified` is required. Account linking by verified email is acceptable because only dev-login creates accounts without Google.
- `DEV_LOGIN_ENABLED`: refused at boot in production (`env.ts`), and 404 when off.
- `sgw_anon`: UUID plus HMAC with its own prefix. A forged or unsigned cookie is replaced, never trusted (new e2e test). The merge is idempotent (ledger unique per refId, rows moved once).
- Authorisation and IDOR: new `test/security.e2e-spec.ts` covers submissions (owner-only PATCH returns 404, no self-vote, resolve and admin queue MODERATOR+), reviews (no attaching others' photos; upsert only touches your own review), photos (confirming someone else's upload is 404; approve TRUSTED+ and not your own; reject MODERATOR+), status reports (no self-confirm, confirm needs sign-in), check-ins (no update or delete routes exist; pending toilets need sign-in), admin (role change ADMIN only, toilet patch and flags MODERATOR+, cron needs the secret, not a session). All pass.
- Input validation: every body and query is a zod DTO. Express's default JSON limit of 100 kB applies (no override). Photo bytes never pass through the API in production (`PUT /media/:id/upload` is 404 unless local storage). New-toilet positions are bounded to Singapore; check-in and vote positions are bounded only to the world, which is fine because they are only compared with a toilet's position.
- Cron jobs: `x-cron-secret` compared in constant time, 503 when unset. All four jobs are idempotent (updateMany on a state filter, deleteMany on age, a full score recompute, a metrics upsert), so running twice is safe.
- Dependencies: `pnpm audit --prod` reports no known vulnerabilities. Prisma 7.10.1 is the current 7.x (8.0 is still an RC). Nest 12.1.3 has 12.2.0 available (minor). `patches/nestjs-zod@5.5.0.patch` only rewrites zod 4 nullable `type: [T,"null"]` into `anyOf` for Swagger, it is still needed, and it is pinned to 5.5.0 by the lockfile (re-check it on any nestjs-zod bump).
- OpenAPI: `pnpm openapi` produces no diff against the committed `openapi.json` after these changes.

#### Recommendations for files I do not own
- `README.md` (another agent): the environment table could note that rate limits are per instance (B-15), that `CRON_SECRET` and `TELEGRAM_WEBHOOK_SECRET` should be 32+ characters (B-20), and the photo-bucket caveat (B-13). Add the rows for `POSTHOG_KEY` and `POSTHOG_HOST` if the inventory agent has not.
- `.github/workflows/scheduled.yml` (another agent): if B-21 is adopted, add a `cleanup-media` job next to `archive-status`.
- Frontend (another agent): the B-14 header forwarding; dropping `avatarUrl` from `Review.user` and the leaderboard types once the backend removes the field (B-09).

#### Files changed
- `src/common/locks.ts` (new): advisory lock helper
- `src/gamification/points.service.ts`: REVIEW_WITH_PHOTO removed from trust reasons (B-01)
- `src/status/status.service.ts`: STATUS_CONFIRMED pair-per-day cap (B-02)
- `src/gamification/gamification.service.ts`: check-in lock (B-03); public leaderboard avatarUrl null (B-09)
- `src/submissions/submissions.service.ts`: per-submitter lock and caps inside the transaction (B-04); photo visibility (B-10)
- `src/media/storage.ts`, `src/media/media.service.ts`, `src/media/media.controller.ts`: signed Content-Length (B-05), pixel cap (B-06), confirm throttle (B-07)
- `src/routing/routing.controller.ts`, `src/submissions/submissions.controller.ts`, `src/gamification/gamification.controller.ts`, `src/reviews/reviews.controller.ts`: route throttles (B-07)
- `src/integrations/telegram/telegram.service.ts`: update_id de-duplication (B-08)
- `src/toilets/toilet-presenter.service.ts`, `src/toilets/toilet.schemas.ts`: review avatarUrl null (B-09)
- `src/users/users.service.ts`: deletion scrubbing (B-11)
- `src/prisma/prisma.service.ts`: pool timeout and `attachDatabasePool` (B-12)
- `API_CONTRACT.md`: trust reasons, confirmation cap, route limits, photo visibility, deletion, avatarUrl
- Tests: `test/security.e2e-spec.ts` (new, 19 tests), `test/telegram.e2e-spec.ts` (+1), `test/accounts.e2e-spec.ts` (DELETE /me extended), `src/media/media.service.spec.ts` (+2)

(`.env.example`, `README.md`, `.github/*`, `vercel.json` and `docs/` show as modified or untracked in the working tree; other agents made those changes, not this audit.)

#### Final check output
```
$ pnpm typecheck
$ tsc --noEmit -p tsconfig.json            (exit 0, no output)

$ pnpm lint                                 (exit 0)
10 warnings, 0 errors; all 10 warnings already present in src/imports/** (normalise.ts, datagov.ts, import.ts, normalise.spec.ts)

$ pnpm test
 Test Files  28 passed (28)
      Tests  280 passed (280)

$ pnpm test:e2e
 Test Files  11 passed (11)
      Tests  155 passed (155)

$ pnpm openapi && git diff --stat openapi.json
openapi.json written                        (no diff)

$ pnpm audit --prod
No known vulnerabilities found
```
Race evidence (lock temporarily disabled, then restored): `expected 6 to be 3` (auto-publish) and `expected [201,201,201,201,201,201] to deeply equal [201,429,429,429,429,429]` (check-ins).


---

## B. Frontend code and build (plan §4)

Repo: `/home/user/frontend`, branch `claude/production-readiness-audit-k5u4nh` (baseline HEAD `483762f`, after the two motion/leaderboard merges and the legal commit). Next 16.4.2 (Turbopack, `cacheComponents`, `partialPrefetching`), React 19.3.0, MapLibre (now 6.12.0), PostHog EU.

#### Summary

The frontend is in good shape on the things that are hard to retrofit: server components never read cookies or headers, so nothing per-user is prerendered or shared through `"use cache"`; secrets stay server-side; the typed client matches the committed backend `openapi.json` exactly; analytics is conservative (no autocapture, query strings stripped, DNT/GPC honoured). The gaps were at the edges. There were no security headers at all, so I added a static CSP plus HSTS, nosniff, X-Frame-Options, Referrer-Policy and Permissions-Policy. The CSP was checked against every origin the code uses and a headless Chromium run of the real map shows no violations. The service worker kept personalised API answers (`myReview`, `confirmedByMe`, earned badges, the leaderboard's `me`) in a long-lived cache after sign-out. Its network-first paths had no lie-fi race, and it never evicted a toilet that had since been removed. Nothing reported errors. MapLibre 5.24 carried a critical advisory. I upgraded it to 6.12.0 and serve it so that the main thread and the worker share one download. That also needed a pin-image API migration and a fallback for devices without WebGL2. On request I also added the `proxy.ts` half of the client-IP contract (`x-sgw-proxy-secret`, `x-sgw-client-ip`), which I verified against an echo server. Lint, typecheck and build are clean with zero warnings, and `pnpm audit --prod` is clean.

Counts: 0 critical, 4 high, 8 medium, 9 low (21 findings). Fixed: 11 (F-01 to F-07, F-11, F-12, F-13, F-17; F-06 is interim logging until there is a Sentry DSN, and F-01 still needs a check on the production origin). Verified clean with no change: 2 (F-14, F-15). Proposed or open: 8 (F-08, F-09, F-10, F-16, F-18, F-19, F-20, F-21). Some fixed items also leave a follow-up for files I don't own (README, .env.example, privacy, about, terms).

#### Findings

##### F-01 High: No security headers or CSP anywhere
- Location: `next.config.ts:40-66, 110` (was only `/sw.js` headers).
- Traced: every external origin in `app/ components/ lib/ service-worker/` (grep for `https?://`) and every runtime fetch:
  - OneMap raster tiles (`components/map/ToiletMap.tsx` `basemap()`), fetched by MapLibre with `fetch`, so they fall under connect-src.
  - The OneMap logo in the attribution (img).
  - Photo display URLs from the backend `S3_PUBLIC_URL` (an r2.dev or custom domain that only the API knows), plus `/api/media/files` in dev.
  - Presigned uploads that PUT straight to the S3 endpoint: `<account>.r2.cloudflarestorage.com`, or AWS `s3.<region>.amazonaws.com` (backend `src/media/storage.ts:94-98`).
  - Google avatars (`me-client.tsx`, img).
  - PostHog through the same-origin `/ingest` rewrite, with `disable_external_dependency_loading`.
  - Google OAuth is a top-level `<a href="/api/auth/google">` followed by a 302, not a form post, so `form-action 'self'` is safe.
  - Service worker `/sw.js` and the MapLibre module worker `/maplibre/<v>/`, both same origin.
  - The inline theme/motion boot script in `app/layout.tsx` and Next's inline RSC scripts. Both need `'unsafe-inline'` unless every page goes dynamic with nonces. The Next CSP guide says nonces are incompatible with PPR shells, so I chose a static header.
- Fix (fixed). Applied to `/:path*`:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline'` (plus `'unsafe-eval'` in dev only)
  - `style-src 'self' 'unsafe-inline'`
  - `img-src 'self' data: blob: https:`. Broad on purpose: a missed photo host would mean blank photos, and images cannot run script.
  - `font-src 'self' data:`
  - `connect-src 'self' https://www.onemap.gov.sg https://*.r2.cloudflarestorage.com https://*.amazonaws.com`
  - `worker-src 'self' blob:`
  - `manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`

  Also added:
  - `Strict-Transport-Security: max-age=63072000`. No includeSubDomains or preload until the final domain's DNS is known.
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(self), camera=(self), microphone=(), payment=(), usb=(), serial=(), browsing-topics=()`. I dropped `bluetooth` because Chromium warns that it is an unrecognised feature.

  I left out `upgrade-insecure-requests`: it is not needed behind HSTS, and it would risk the http://localhost Playwright server.
- Evidence:
  - `curl -sI` against `next start` shows every header on `/`, on `/maplibre/...` and on `/api/...`.
  - Headless Chromium 1194 (SwiftShader WebGL2) loads `/`, `/toilets/t-dhoby-nsl` and `/` under `next dev`. All showed no CSP violations; the map rendered tiles and canvas pins (stub tiles served for `www.onemap.gov.sg`). Screenshots are in `scratchpad/viz/`.
- Still to do on the production origin: Appendix A's `curl -sI https://<domain>/`, and one real photo upload to R2. That upload is the only path whose host (`*.r2.cloudflarestorage.com`) I could not exercise locally. If the bucket uses a jurisdiction endpoint (`<acct>.eu.r2...`), the wildcard still matches.
- Files: `next.config.ts`.

##### F-02 High (advisory critical, real exposure low): maplibre-gl 5.24.0, GHSA-jrc7-96c5-q579 (DOM.sanitize bypass)
- Location: `package.json` maplibre-gl.
- Traced: in 5.24, `DOM.sanitize` is used only by `AttributionControl` (`src/ui/control/attribution_control.ts:177`). Our attribution strings are hard-coded constants (`ONEMAP_ATTRIBUTION`, `OSM_ATTRIBUTION`). There is no `Popup`, no `setHTML` and no label with user text, so no untrusted string reaches the sanitizer. The realistic exposure is nil, but `pnpm audit --prod` flags it critical and would block any audit gate.
- Upgrade (fixed), to `^6.12.0` (released 2026-10-03; 6.4.1 is the first patched version). Breaking changes checked against the v6 changelog and migration guide:
  - ESM only. `react-map-gl` 8.1.3 / `@vis.gl/react-maplibre` 8.1.3 already supports v6: it uses `setTransformCameraUpdate` and getters instead of `map.transform`, and its peer range is `>=4`.
  - `styleimagemissing` is now notify-only. I moved the pin images to `map.setMissingStyleImageResolver` (`ToiletMap.tsx:608`).
  - `Map.isEasing()` is no longer public. Replaced with `isMoving()` (`ToiletMap.tsx:446`).
  - Worker loading: under a bundler, v6 needs the worker at a real URL, and the worker imports `./maplibre-gl-shared.mjs` (147 kB gzipped). MapLibre's own Next.js recipe would bundle the main thread and copy the worker into `public/`. That downloads the shared module twice: about 431 kB gzipped for the map against 275 kB on v5. Instead, the three ES modules are served from `app/maplibre/[version]/[file]/route.ts`, which reads them from `node_modules` and prerenders them (SSG) at `/maplibre/6.12.0/...` with `Cache-Control: immutable`. The map imports `/maplibre/<v>/maplibre-gl.mjs` by URL (`webpackIgnore`) and passes it as `mapLib`. Browser and worker then share one shared module, for 304 kB gzipped in total. No `setWorkerUrl` is needed, `worker-src 'self'` suffices, and the version comes from `next.config.ts` `env.MAPLIBRE_VERSION`. The service worker treats `/maplibre/` as cache-first.
  - WebGL2 is now required. Without it the map used to fail silently inside react-map-gl's promise, leaving an empty box: `MapErrorBoundary` only catches render errors. `ToiletMap` now routes target-less `onError` (a failed start) into the boundary, which shows "The map can't load on this device. The list still works." I verified this with Chromium `--disable-webgl` (`scratchpad/viz/nowebgl.png`).
- Evidence:
  - `pnpm audit --prod`: "No known vulnerabilities found".
  - Map verified in a production build and in dev, with WebGL2 and without.
  - Typecheck, lint and build green.
- Note: react-map-gl still has an internal `import('maplibre-gl')` fallback, so Turbopack emits a 278 kB-gzipped lazy chunk that is never requested. It is harmless.
- CI proposal (workflow owned by another agent): the new `audit` job in `.github/workflows/ci.yml` is informational (`continue-on-error: true`, `--audit-level high`). Now that production dependencies are clean, add a blocking step, `pnpm audit --prod --audit-level critical`, to the main job, and keep the informational job for `high`. The only remaining full-tree advisory is `braces` through `eslint-config-next`: high, dev-only, no patched version.
- Files: `package.json`, `pnpm-lock.yaml`, `components/map/ToiletMap.tsx`, `app/maplibre/[version]/[file]/route.ts` (new), `lib/server/maplibre-asset.ts` (new), `next.config.ts`, `service-worker/sw.js`.

##### F-03 High: Service worker serves the previous user's personal data after sign-out
- Location: `service-worker/sw.js:59` (`NETWORK_FIRST_API`) and the `sgw-api-1` cache, which deliberately survives deploys. Also `lib/auth.ts` `useSignOut`.
- Traced, read-only in backend DTOs: these routes use `OptionalAuthGuard` and return per-user fields:
  - `GET /toilets/:id`: `myReview`, the person's own review and comment (`toilet-presenter.service.ts:219-279`).
  - `GET /toilets/:id/status`: `confirmedByMe` (`status.service.ts:72`).
  - `GET /badges`: earned flags per user (`gamification.service.ts:134`).
  - `GET /leaderboard/users`: `me: { rank, points }` (`gamification.service.ts:443-451`).

  All four match `NETWORK_FIRST_API` and were stored in `sgw-api-1`. Sign-out cleared only the TanStack cache. On a shared or family phone, the next person offline or on lie-fi would see the previous person's review, points and badges. Venue search queries (free text) and `venues/nearby` coordinates were kept too.
- Fix (fixed): `forgetSignedInCopies()` (`lib/offline.ts:61`) deletes every `sgw-api-1` entry except the public `nearby` and `in-bounds` lists and their `__sgw_last` copies, so the offline map survives. It runs on sign-out (`lib/auth.ts:151`, awaited before navigating), after account deletion (`me-client.tsx:1168`), on any non-silent 401 and on a mutation 401 (`app/providers.tsx:37,54`). Page-side Cache Storage access means it works even when no worker controls the page. Harness check (`scratchpad/swtest/run.mjs`): before, the keys were `/api/toilets/new, /api/toilets/nearby, /api/badges`; after, only `/api/toilets/nearby`.
- Residual (proposed): the API could send `Cache-Control: private, no-store` or `Vary: Cookie` on these four routes. The worker could then skip storing responses fetched with a session cookie. That is a backend change and was not applied here.

##### F-04 High: `/api/*` client IPs collapse to one Vercel IP (frontend half of the coordinator's contract)
- Location: `proxy.ts` (new), `lib/api/server.ts:16-31`.
- Fix (fixed):
  - `proxy.ts` (Next 16 `proxy` export, `matcher: "/api/:path*"`). When the server-only `API_PROXY_SECRET` is set, it rewrites to `${API_ORIGIN}${path minus /api}${search}`, the same destination as the `next.config.ts` rewrite, which stays as the fallback. It sets the request headers `x-sgw-proxy-secret` and `x-sgw-client-ip`. The IP is `x-real-ip`, else the first `x-forwarded-for` entry, else `"unknown"`, so a public request is never mistaken for an internal render. Browser-sent copies of both headers are overwritten.
  - When the secret is unset, the proxy returns `NextResponse.next()`.
  - `/ingest` is not matched.
  - `lib/api/server.ts` sends `x-sgw-proxy-secret` only, with no client IP, and reads only `process.env`, never `headers()`, so cached and prerendered pages are unchanged.
- Evidence: a build pointed at a local echo server returned:
  - With the secret: `{"url":"/echo/toilets/nearby?lat=1.3&lng=103.8","secret":"s3cret","ip":"203.0.113.7"}` for `X-Forwarded-For: 203.0.113.7, 10.0.0.1` with a spoofed `x-sgw-client-ip: 6.6.6.6`. With `X-Real-IP: 198.51.100.9` the IP was `198.51.100.9`.
  - POST bodies (33 bytes), cookies (`sgw_session=abc`) and `Set-Cookie` pass through. A 404 from the upstream stays a 404.
  - Without the secret, `/api` still works through the config rewrite (the API ignores client-sent `x-sgw-client-ip` unless the secret is present).
- Notes:
  - `API_PROXY_SECRET` needs adding to `.env.example` and the README env table. I don't own those files.
  - Set the same value on the API in Production and Preview.
  - On Vercel the proxy runs as a function on every `/api` request: one more invocation and possibly a cold start per API call. Watch it in the §8 load test and the Hobby quota.

##### F-05 Medium: Network-first paths had no lie-fi race, and removed toilets stayed cached
- Location: `service-worker/sw.js:348` `networkFirst()`, `navigate()`.
- Traced:
  - `networkFirst` (toilet detail, reviews, status, badges, leaderboards, venues, and every RSC payload) awaited `fetch` with no timer. On lie-fi it waited for the client's 10 s timeout, plus one retry: about 20 s, then an error even with a saved copy on hand. Only the lists and navigations had the 2.5 s race.
  - A 404 for a toilet that was rejected or deleted (backend `toilets.service.ts:101` throws NotFound for REJECTED) was not cacheable but never evicted the saved copy. Offline or slow, the stale toilet page and detail kept being served until trimmed out of the 100 entries.
- Fix (fixed): `networkFirst` now uses the same `fetchAndStore` + `race(…, 2.5 s)` as the list path: saved copy when the network is slow, fails or answers 5xx; otherwise the network's own answer. A 404 or 410 deletes the saved copy (`gone()`/`forget()`) for API reads, RSC payloads and pages. `NEVER` gains `/api/integrations/`. `/api/me/telegram` was already covered by `/^\/api\/me(\/|$)/`, and any `/api` path not listed passes straight to the network. Header comment updated.
- Evidence: Node harness against the real `sw.js` (`scratchpad/swtest/run.mjs`): slow network returned the saved copy at 2.5 s; offline returned saved; 404 passed through and evicted, so the next offline read errors instead of serving the removed toilet; 5xx with a saved copy returned saved; `/api/me/telegram`, `/api/integrations/...` and `/api/geo/search` passed through; a navigation 404 cleared PAGES.
- Residual (proposed): toilet detail and status served from a saved copy carry no "saved" marker, so the UI can't say "saved copy, may be out of date" as it does for lists. Have `networkFirst` add `X-SGW-Saved` for API reads and let `detail-client` show it.

##### F-06 Medium: No error reporting
- Location: `app/error.tsx`, `app/global-error.tsx`. Nothing in either app reports errors; the backend's `SENTRY_DSN` slot is unread.
- Fix (fixed, interim):
  - `lib/report-error.ts`: `reportError(error, "route" | "global")` writes one `[sgw:client-error]` line with name, message (truncated), server digest, pathname without query, build id and online state. Both boundaries call it in an effect, and `global-error` now also shows the digest "Reference".
  - `instrumentation.ts` `onRequestError` writes one JSON `[sgw:server-error]` line with digest, name, message, 8-line stack, method, path without query, routePath, routeType, renderSource and build id. Headers and cookies are never logged. Vercel runtime logs can be searched by the digest a person reads off the error page.
- Proposed: Sentry, once a DSN exists for each app (not added: there is no DSN to test against).
  1. Frontend: `@sentry/nextjs`, with `instrumentation-client.ts` (`Sentry.init`) and `instrumentation.ts` (`onRequestError = Sentry.captureRequestError`). Swap the body of `lib/report-error.ts` for `captureException` with `tags.where` and `digest`.
  2. Source maps as hidden source maps uploaded at build (`SENTRY_AUTH_TOKEN` in Vercel only), with `release = VERCEL_GIT_COMMIT_SHA`.
  3. `sendDefaultPii: false`, plus a `beforeSend` that drops `request.query_string`, cookies and breadcrumbs' URL queries (coordinates, redirect targets). No replay.
  4. The CSP needs `connect-src https://*.ingest.de.sentry.io` (EU), or a `/monitoring` tunnel route so the CSP and ad blockers don't matter.
  5. Alerts to a channel someone reads (§7).

  Backend: `@sentry/nestjs` reading the existing `SENTRY_DSN`.

##### F-07 Medium: Missing `API_ORIGIN` silently points production at localhost
- Location: `next.config.ts:10-14` (also flagged by the inventory agent in `.env.example`).
- Fix (fixed): the build throws when `process.env.VERCEL` is set and `API_ORIGIN` is not, so a misconfigured Preview or Production deploy fails loudly instead of every `/api` call 502ing.

##### F-08 Medium: Analytics and privacy follow-ups
- Location: `lib/analytics.ts`, `lib/route-session.ts:149`, `app/privacy/page.tsx` (legal agent's file).
- Traced:
  - PostHog loads only with `NEXT_PUBLIC_POSTHOG_KEY`, after idle, through `/ingest`. Settings: `autocapture: false`, no replay, surveys, heatmaps or flags, `capture_exceptions: false`, `respect_dnt` plus a GPC check, `persistence: localStorage`, `$geoip_disable: true`, and URLs stripped to an allowlist of query params.
  - The web events are `route_started` (toilet_id, tier, urgent, purpose, distance_m rounded to 10 m), `route_completed` and `share`. No coordinates, emails or free text. `install_prompt` is declared but never sent.
- Proposed:
  - (a) Turn on PostHog project setting "Discard client IP data". `$geoip_disable` stops enrichment but the IP can still land in `$ip`.
  - (b) For an identified user, `route_started` gives toilet id plus time plus distance, which is effectively a location trace. Fine for the stated purpose, but `/privacy` should say "which toilet you walked to".
  - (c) Consent: SG PDPA notification is satisfied by `/privacy`. If EU users are expected, PostHog's localStorage id is non-essential storage under ePrivacy. Either show a consent banner for EU visitors, or use `persistence: "memory"` (cookieless) for them.
  - (d) `/privacy` says the last position is kept "30 minutes at most". The service worker's saved nearby and in-bounds lists keep the request coordinates (`lat`, `lng` in the cached URL, plus `X-SGW-Fetched`) on the device indefinitely: 100 entries, surviving deploys and now sign-out by design. Add a sentence, and consider trimming saved lists older than about 7 days in `sw.js`.

##### F-09 Medium: Server-side toilet reads are uncached (API load and cold starts)
- Location: `lib/api/server.ts:57` `getToiletServer` (and the toilet OG image route, `ƒ`).
- Traced: every toilet page request and every chat-preview OG fetch calls the API fresh. Reads are anonymous, so caching is safe.
- Proposed (not applied: it changes freshness semantics during the audit):
  - Wrap it in `"use cache"` with `cacheLife("minutes")` and `cacheTag(\`toilet:${id}\`)`. The client refetches with the session cookie anyway.
  - Have moderation call `revalidateTag` on reject via an API webhook, or accept about a minute of staleness.
  - Measure in the §8 load test.

##### F-10 Medium: First-load JS
- Location: `app/layout.tsx:63` (`PersistentHome` in the root layout), `lib/stations.ts`.
- Traced (table below): 196-221 kB gzipped per route excluding the `noModule` polyfills (38.5 kB, skipped by modern browsers). That is within the 300 kB §3.5 budget. Every route ships the home client because the map shell is in the root layout (by design, for instant tab returns). `lib/stations.ts`, the full station and interchange name list, is a 22.6 kB-gzipped chunk loaded on every route. MapLibre is deferred and loaded only once a map mounts (idle or 1.2 s), at 304 kB gzipped from `/maplibre/6.12.0/` (main 151 + shared 147 + worker 6). It never loads on routes without a map. lucide-react is tree-shaken (48 icons). There is a single React copy (`react@19.3.0`).
- Proposed: lazy-load the stations list where search needs it (dynamic import on first keystroke). Optionally render `PersistentHome` lazily off `/` on the first visit.

##### F-11 Medium: Duplicate URLs and missing canonicals (`skipTrailingSlashRedirect`, utm links)
- Location: `app/toilets/[id]/page.tsx`, `app/page.tsx`, `app/go/page.tsx`, `app/leaderboard/page.tsx`.
- Traced: `skipTrailingSlashRedirect: true` serves `/about/` and `/toilets/x/` as 200 duplicates. Shared links add `?utm_source=` and `?src=`. Only areas and stations set canonicals.
- Fix (fixed): `alternates.canonical` on the toilet detail, `/`, `/go` and `/leaderboard`. `robots: { index: false }` on `/me`, `/add` and `/review`, in addition to the robots.txt disallow. Verified: `<link rel="canonical" href=".../toilets/t-dhoby-nsl">` on the page, and `/me` has `noindex`.
- Proposed (legal agent's files): add `alternates.canonical` to `app/about/page.tsx`, `app/privacy/page.tsx` and `app/terms/page.tsx`.
- Checked, fine: `sitemap.ts` and `robots.ts` use `SITE_URL` (`NEXT_PUBLIC_SITE_URL`, else `VERCEL_PROJECT_PRODUCTION_URL`). `/opengraph-image` (static) and `/toilets/[id]/opengraph-image` both return 200 PNG, including the fallback card for an unknown id.

##### F-12 Medium: Legal links and deletion copy (requested by the legal audit)
- Fix (fixed):
  - Home sheet footer (`app/home-client.tsx`) gains Privacy and Terms links.
  - `/login` says "By signing in you agree to the terms of use; see the privacy notice…" next to the Google button.
  - The Me footer adds Terms.
  - The account-deletion dialog (`me-client.tsx`) now matches `/privacy`: profile, email, handle, profile picture link, points, badges, check-ins and the Telegram link are deleted, and the person is signed out everywhere. Toilets, edits, reviews, photos, status reports, votes and reports stay, unlinked. To remove a specific review or photo, ask first.

##### F-13 Low: Typed client drift checks had gaps
- Location: `lib/api/contract-check.ts`.
- Traced: `openapi-typescript ../backend/openapi.json` output is byte-identical to `lib/api/schema.d.ts`, so there is no drift against the committed spec. Whether the backend's committed `openapi.json` matches its code is §5's check (`pnpm openapi && git diff`). The checks did not cover review pages, status lists, submission lists, venue search, media confirm, or any request body written inline in `client.ts`.
- Fix (fixed): 16 more compile-time assertions. Responses: `ReviewDto`, `ReviewPageDto`, `StatusReportListDto`, `SubmissionListDto`, `VenueLiteListDto`, `MediaPhotoRefDto`. Inline bodies, read through `Parameters<Api[K]>`: postReview, checkIn, verify, vote, updateMe, presign, devLogin, flag, status report, routing/started. I confirmed they fail on a deliberately wrong shape (2 TS errors in a scratch file).

##### F-14 Low: Secrets and `NEXT_PUBLIC_` exposure (clean)
- Traced:
  - The client reads only `NEXT_PUBLIC_DEV_LOGIN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL` and `NEXT_PUBLIC_POSTHOG_KEY`, all public by design.
  - Neither `API_ORIGIN` nor `localhost:4000` appears in `.next/static/chunks`.
  - No client source maps are emitted.
  - `.env.example` lists everything the code reads.
- Proposed (README owner): the README env table lacks `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_POSTHOG_KEY` and the new `API_PROXY_SECRET`. `.env.example` lacks `API_PROXY_SECRET`.

##### F-15 Low: `cacheComponents` / `partialPrefetching` correctness (verified, no change)
- Traced: no `cookies()`, `headers()` or `connection()` anywhere server-side.
  - `"use cache"` wraps only public reads (areas, stations, lines, sitemap). Successes are cached for hours; errors for seconds, which keeps outages out of prerenders.
  - `/toilets/[id]` is PPR with an anonymous, uncached fetch inside Suspense, so `myReview` is always null server-side, and the client refetches with the cookie.
  - `/me`, `/review`, `/admin` and `/add` are static shells with client-only data.
  - The service worker's PAGES and DATA caches hold only these anonymous shells and RSC payloads.
- Note: the build bakes whatever API is reachable at build time into `/areas`, `/stations` and `/sitemap.xml`, revalidating after 1 h. Locally a mock on `:4000` answered and its data was prerendered. Make sure Preview builds point `API_ORIGIN` at an API whose data you'd be happy to see indexed.

##### F-16 Low: Offline map after a deploy
- Traced: OneMap tiles are cross-origin and never cached (it's possible OneMap's terms don't allow caching them). `/maplibre/<v>/` is cache-first only after first use, so in airplane mode right after a deploy the map shows the "can't load" note. The list and urgent mode still work.
- Proposed: optionally add `/maplibre/<v>/*` to the worker's precache list. `app/sw.js/route.ts` can substitute `MAPLIBRE_VERSION` as it does the build id. It costs nothing when the files are already in the HTTP cache.

##### F-17 Low: `eslint-disable` without reasons
- Fix (fixed): added reasons to the three `react-hooks/exhaustive-deps` disables in `ToiletMap.tsx`.
- The others: the `no-img-element` ones are self-evident (remote R2 images, no `next/image`), and the `set-state-in-effect` ones have explanatory comments directly above them. Left as they are.

##### F-18 Low: `toilets/[id]/opengraph-image.tsx` header comment is stale
- "page.tsx prefers a real photo" contradicts `page.tsx`, which always uses the card. Comment-only drift. Proposed: fix the comment.

##### F-19 Low: Dev dependency advisory
- `braces <=3.0.3` (high, no patched release) through `eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch`. Dev-only, reachable only by linting hostile globs. Track it; no action.

##### F-20 Low: COOP not set
- Proposed: `Cross-Origin-Opener-Policy: same-origin` is safe: OAuth is a full-page redirect, not a popup, and outbound links use `noopener`. I left it out to keep this change to the requested set. Add it after the production header check.

##### F-21 Low: PostHog `install_prompt` event is declared but never emitted
- `lib/analytics.ts:22`. Either wire it to `beforeinstallprompt` or drop it from the type and the GROWTH funnel.

#### Per-route first-load JS (`pnpm build`, Next 16 prints no size column; computed from each prerendered HTML's `<script src>` set, excluding the `noModule` polyfill chunk)

| Route | JS files | First-load JS (raw kB) | First-load JS (gzip kB) |
|---|---:|---:|---:|
| /_global-error | 5 | 456 | 135 |
| /_not-found | 13 | 631 | 196 |
| /about | 13 | 631 | 196 |
| /add | 14 | 659 | 206 |
| /admin | 14 | 654 | 204 |
| /areas | 14 | 638 | 199 |
| /areas/[slug] | 14 | 655 | 204 |
| /go | 15 | 664 | 207 |
| / | 13 | 631 | 196 |
| /leaderboard | 14 | 657 | 205 |
| /login | 14 | 642 | 201 |
| /me | 15 | 699 | 218 |
| /privacy | 13 | 631 | 196 |
| /review | 14 | 652 | 204 |
| /stations | 14 | 639 | 199 |
| /stations/[slug] | 14 | 646 | 201 |
| /terms | 13 | 631 | 196 |
| /toilets/[id] | 15 | 710 | 221 |

Deferred, map routes only: MapLibre 6.12.0 from `/maplibre/6.12.0/`. That is `maplibre-gl.mjs` 151 kB plus `maplibre-gl-shared.mjs` 147 kB plus `maplibre-gl-worker.mjs` 6 kB, gzipped: 304 kB in all, against 275 kB for 5.24's single bundle and about 431 kB with MapLibre's documented bundle-plus-copied-worker setup. Script: `scratchpad/jssize.py`.

#### Files changed

Modified:
- `next.config.ts`: security headers and CSP, `API_ORIGIN` guard on Vercel, `MAPLIBRE_VERSION` env.
- `service-worker/sw.js`: race in `networkFirst`, 404/410 eviction, `/api/integrations` in `NEVER`, `/maplibre/` cache-first, docs.
- `lib/offline.ts`: `forgetSignedInCopies()`.
- `lib/auth.ts`: clear personal caches on sign-out.
- `app/providers.tsx`: clear personal caches on 401.
- `app/me/me-client.tsx`: clear caches after deletion, deletion copy, Terms link.
- `components/map/ToiletMap.tsx`: MapLibre 6 by URL, missing-image resolver, `isMoving`, fatal-start to boundary, lint reasons.
- `lib/api/contract-check.ts`: 16 more assertions.
- `lib/api/server.ts`: `x-sgw-proxy-secret` on direct API reads.
- `app/error.tsx`, `app/global-error.tsx`: report errors, show digest.
- `app/page.tsx`, `app/go/page.tsx`, `app/leaderboard/page.tsx`, `app/toilets/[id]/page.tsx`: canonicals.
- `app/me/page.tsx`, `app/add/page.tsx`, `app/review/page.tsx`: noindex.
- `app/home-client.tsx`, `app/login/login-client.tsx`: Privacy and Terms links.
- `package.json`, `pnpm-lock.yaml`: maplibre-gl `^6.12.0`.

New:
- `proxy.ts`
- `instrumentation.ts`
- `lib/report-error.ts`
- `lib/server/maplibre-asset.ts`
- `app/maplibre/[version]/[file]/route.ts`

Not mine, but present in the working tree from other agents: `.env.example`, `README.md`, `vercel.json`, `.github/**`.

#### Final lint, typecheck and build

```
$ eslint
LINT_EXIT 0
$ next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
TC_EXIT 0
$ next build      (API_ORIGIN=http://localhost:4000)
▲ Next.js 16.4.2 (Turbopack)
- Cache Components enabled
- Partial Prefetching enabled
✓ Compiled successfully
✓ Generating static pages using 3 workers (28/28)
Route (app)                                    Revalidate  Expire
┌ ○ /
├ ○ /_not-found
├ ○ /about
├ ○ /add
├ ○ /admin
├ ○ /apple-icon.png
├ ○ /areas                                             1h      1d
├   /areas/[slug]
│ └ ◐ /areas/[slug]
├ ○ /go
├ ○ /icon.svg
├ ○ /leaderboard
├ ○ /login
├ ○ /manifest.webmanifest
├   /maplibre/[version]/[file]
│ ├ ● /maplibre/6.12.0/maplibre-gl.mjs
│ ├ ● /maplibre/6.12.0/maplibre-gl-worker.mjs
│ └ ● /maplibre/6.12.0/maplibre-gl-shared.mjs
├ ○ /me
├ ○ /opengraph-image
├ ○ /privacy
├ ○ /review
├ ○ /robots.txt
├ ○ /sitemap.xml                                       1h      1d
├ ○ /stations                                          1h      1d
├   /stations/[slug]
│ └ ◐ /stations/[slug]
├ ○ /sw.js
├ ○ /terms
├   /toilets/[id]
│ └ ◐ /toilets/[id]
└ ƒ /toilets/[id]/opengraph-image

ƒ Proxy (Middleware)
BUILD_EXIT 0
```

No warnings in any of the three. `pnpm audit --prod`: No known vulnerabilities found.


---

## C. Emulated phone checks (plan §3, §9)

Worktree `/home/user/wt-frontend-emu`, branch `audit/emulation`, snapshot of the merged baseline `108ff5c`.
Everything below ran in emulated Chromium 141 (no WebKit, no real devices, no real network). Treat the
numbers as a floor and the pass/fail results as "no problem found in emulation", not "works on an iPhone".

#### 1. Summary

- 22 findings: 0 critical, 0 high, 8 medium, 14 low. 11 fixed in the worktree (one of them in the tests only),
  11 open (proposed fixes written).
- The suite grew from 14 tests on one project to 228 tests on 9 projects and passes in 5.9 minutes
  (4 CPUs, 2 workers, including the 40 s build). Lint, typecheck and build are clean with zero warnings.
- Accessibility is in good shape: axe finds nothing on 28 routes and states in both themes after five small
  fixes (two light-theme contrast tokens, a heading level, a label-in-name mismatch, an invalid `li` under a
  radiogroup, one 19 px link). No icon-only control lacks a name; no other control is under 44 px.
- No layout problem at 375, 390 or 430 px wide on 21 routes and states (no sideways scroll, nothing off-screen,
  nothing hidden under the tab bar at the end of the page). At 175 to 200 % system text size several screens
  overflow; the worst ones are fixed, the rest are open (M-05, M-06).
- The big open items are performance: Lighthouse mobile LCP is 3.6 to 4.2 s on all five routes against the
  2.5 s budget (launch gate 5 fails on `/` and `/go`), TBT is 363 ms on `/` and 423 ms on a toilet page, and
  `/` pulls roughly 500 kB of compressed JS once MapLibre loads against the 300 kB budget (M-02 to M-04).
- Offline works in emulation: the worker installs and precaches, `/` and `/go?urgent=1` render with the signal
  gone, a list saved for another spot is served with its label, "no signal" appears in 0.4 s (1.8 s in urgent
  mode). One real weakness: with nothing saved and a stalled connection the list spun for about 24 s; now
  about 13 s (M-01).
- The primary "Walk there" button on a toilet page is below the first screen on an iPhone SE and a 360x640
  Android and partly under the tab bar on an iPhone 14/15 (M-07).

#### 2. How this was run (and what was in the way)

| Thing | Detail |
|---|---|
| `node_modules` | The worktree's symlink to the main checkout made `pnpm build` try to install into it and made Turbopack refuse to build ("Could not find the Next.js package"). Replaced it with a real install in the worktree (`pnpm install --frozen-lockfile --offline`, 1.5 s). `/home/user/frontend` was not touched (checked its `.modules.yaml` timestamp). |
| Browser | Playwright 1.64.1 wants `chromium_headless_shell-1248`; only 1194 (Chromium 141) is installed. Added `PW_CHROMIUM_PATH` to `playwright.config.ts` (`launchOptions.executablePath`); all runs used `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Without it every test fails at launch. |
| axe | `pnpm add -D @axe-core/playwright` (4.14.0). |
| Lighthouse | `npx lighthouse@13.5.0`, mobile form factor, simulated slow 4G and 4x CPU, headless Chromium with `--no-sandbox`, 3 runs per route, medians. Run against port 3101 (same build as 3100, but with the stub API behind it so server rendering has data); 3100 has the API cut off, so `/toilets/[id]` would only show its error state. |
| Env | `API_ORIGIN=http://localhost:4000` for every build. |

New files in `e2e/`: `api-data.ts` (the mocked API as one pure function, now also used by `mock-api.ts`),
`stub-api.mjs` (port 4000), `flaky-proxy.mjs` (port 3102), `live.ts`, `a11y.spec.ts`, `layout.spec.ts`,
`offline.spec.ts`, `motion.spec.ts`. `serve.mjs` got a `--live-api` flag. `tsconfig.json` got
`allowImportingTsExtensions` (so `.mjs` scripts can load `.ts` fixtures under Node's type stripping; needs
Node 22.18+, CI uses 24).

#### 3. Test matrix (final run: 228 passed, 0 failed, 5.9 min)

| Project | Device / viewport | Spec | Tests | Result |
|---|---|---|---|---|
| chromium-mobile | Pixel 7, 412x839 | smoke (14) + motion (4) | 18 | pass |
| iphone-15 | iPhone 15 descriptor on Chromium, 393x659 | smoke + motion | 18 | pass |
| iphone-se | iPhone SE 3rd gen, 375x667 | smoke + motion | 18 | pass |
| android-large | Pixel 7 UA, 430x932 | smoke + motion | 18 | pass |
| a11y | iPhone 14, 390x664, light and dark | axe (56) + tap targets (28) | 84 | pass |
| layout-390 | iPhone 14 | layout (21 states) | 21 | pass |
| layout-375 | iPhone SE 3rd gen | layout | 21 | pass |
| layout-430 | Pixel 7 UA, 430x932 | layout | 21 | pass |
| offline | Pixel 7, service worker allowed | offline | 9 | pass |

The 14 smoke tests, each passing on all four device projects (baseline on Pixel 7 before any change: 14/14):
find (map and list, filters refetch; sheet stops below the search; drag down to the count strip and tap back),
route (urgent mode, 3 results, route), submit (add wizard with duplicate; photo optional and draft survives a
reload), what's inside (check-in leads into the form; no changes confirms; checked in recently),
contributing (map check-in pill; page says you can check in; signed-out report; signed-out review goes to
sign-in; `?do=report` opens the dialog once).

Layout states (each at 390, 375, 430): home, home with the sheet at the top, home Filters dialog, `/go`,
`/go?urgent=1`, `/go?urgent=1&to=...`, `/add` (signed in), toilet page, toilet Report dialog, `/leaderboard`,
`/me` signed out and in, `/login`, `/about`, `/privacy`, `/stations`, a station, `/areas`, an area, `/review`,
`/admin` (as admin). Checks: no horizontal page scroll, nothing visible past either edge unless an ancestor
clips or scrolls it, and no control covered by another element at the bottom of the page (modal dialogs and
closed folds excluded). 21 of 21 clean at all three widths. Screenshots (taken before the fixes below, which do
not change them) are in `findings/shots/` as `<width>-<state>.png` and `-full.png`.

Not covered by emulation and still for real devices: WebKit rendering, iOS standalone mode and
safe-area insets, the Dialog's visualViewport lift on iOS, `interactiveWidget` with a real keyboard, install
prompts, Telegram's in-app browser, GPU and memory on a low-end Android, real throttling, VoiceOver and
TalkBack.

#### 4. Accessibility (axe 4.14, tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice)

Covered at 390 px, light and dark theme (set through `localStorage["sgw:theme"]`; `data-scheme` is asserted),
reduced motion on so colours are final. Signed-in states use the stub API's `sgw_session` cookie.
28 routes and states: `/`, `/go`, `/go?urgent=1`, `/add`, `/toilets/t-dhoby-nsl`, `/leaderboard`, `/me` signed
out and signed in, `/login`, `/about`, `/privacy`, `/stations`, `/stations/dhoby-ghaut`, `/areas`,
`/areas/museum`, `/review`, `/admin`; plus sheet expanded, Filters dialog, route screen, Report dialog,
checked-in dialog, toilet folds open, add steps 2 and 4, leaderboard second tab, `/me` Settings and Activity tabs.

Violations found before the fixes (raw data in `findings/data/axe.jsonl`, `axe2.jsonl`):

| Rule (impact) | Elements | Where | Finding |
|---|---|---|---|
| color-contrast (serious) | `p.text-mint` "You're 50 m away, close enough to check in." 4.27:1; `span.text-accent` "42" points 3.78:1 | toilet page and `/me`, light theme | M-08 |
| label-content-name-mismatch (serious) | `a[href^="/go?urgent=1&to="]` result rows (aria-label did not contain the visible text) | `/go?urgent=1`, both themes | M-10 |
| heading-order (moderate) | `h3.font-display` "All clear. Shiok." | `/review`, both themes | M-09 |
| listitem (serious) | `ul[role=radiogroup] > li` | `/add` step 2, both themes | M-12 |

After the fixes: 0 violations on all 56 axe tests. Names: `button-name`, `link-name`, `input-button-name`,
`aria-input-field-name` and `label` pass in every state, so every icon-only control has an accessible name.

Tap targets (interactive element, or its label, under 43.5 px in either direction, excluding visually hidden,
inert, map-internal controls and links inside a sentence): one finding in 28 states, `a` "Privacy notice" on
`/about` at 97x19 (M-11, fixed). Everything else is at least 44x44, including the bottom tab bar, sheet grabber,
chips, dialog buttons and the wizard.

Contrast across the design tokens (computed from `globals.css`, text tokens against `bg`, `surface`,
`surface-2` and the soft fills): dark theme is fine except `urgent` on `surface-2` and the soft fills
(3.96 to 4.64:1). Light theme had `mint` 4.28, `accent` 3.78 and `urgent` 3.86 on `bg`; fixed (M-08). Still
below 4.5 on the darkest light surface (`surface-2`, `#ecc7a2`): `tier` 4.26, `warn` 4.33, `danger` 4.15, `soda`
4.36, `papaya` 3.93 and `taro` 4.59, none of which axe saw in a rendered state. Worth re-checking whenever a
text colour is put on `surface-2`.

#### 5. Offline and service worker (plan 3.4)

Method: the real `/sw.js` runs (`serviceWorkers: "allow"`) against the stub API on :4000, through a proxy on
:3102 that drops or stalls connections per browser context (cookie `sgw_stub_down` / `sgw_stub_delay`).
`context.setOffline(true)` alone proved unreliable with a worker in control: a navigation could fail with
`net::ERR_INTERNET_DISCONNECTED` before the worker saw it, and worker fetches did not always honour the
emulation; it passes only after a reload that the worker controlled (one test uses it that way). The proxy also
models the more common underground case where `navigator.onLine` stays true.

| Check | Result | Timing |
|---|---|---|
| Worker installs; shell cache holds `/`, `/go`, `/about`, manifest, both icons; static cache holds the shell's scripts and styles | pass | ready in about 2 s |
| Signal dropped after a second visit: `/` renders the map region and "I NEED TO GO", the saved list shows 3 cards | pass | |
| Same, `/go?urgent=1`: heading "Quick, go here!", nearest first from the saved list, status "Offline estimate: nearest by straight line from your saved list." | pass | |
| Phone moved 300 m, signal dropped: list for the nearest saved spot, heading "3 toilets from your saved list", banner "Offline · saved N ago, near <station>" | pass | |
| Nothing saved, signal dropped: "No signal leh" with "Try again" | pass | 0.38 s |
| Nothing saved, urgent mode, signal dropped: "No signal leh" | pass | 1.8 s |
| Signal comes back, "Try again" refetches without a reload | pass | |
| Lie-fi (connected, nothing arrives) with a saved list: saved list after the worker's 2.5 s race, banner with age | pass | 5.7 s (2.5 s page race + 2.5 s list race) |
| Lie-fi with nothing saved: the screen says it gave up | pass, but see M-01 | 13.0 s (was 24 s before the fix) |
| Airplane mode via `context.setOffline`: `/` and `/go?urgent=1` render from the worker, banner "Offline · this list may be out of date" | pass | |

Observations (no bug found, but good to know on a device): a list saved less than 10 minutes ago is served as
a normal list with no "saved" note even when the signal is gone and `navigator.onLine` is true (stale-while-
revalidate by design); older than that, or for another spot, it carries the label. Not automated: update rollout
and old-cache deletion (needs two builds), mutations offline fail fast (client code path only), quota eviction.
Manual test still needed on a device: install, airplane mode, relaunch from the home screen icon, shortcut
`/go?urgent=1`, then a real MRT tunnel.

#### 6. Performance (Lighthouse mobile, medians of 3, simulated slow 4G, 4x CPU)

Budgets (plan 3.5): LCP under 2.5 s, INP under 200 ms, CLS under 0.1, JS under 300 kB compressed on first load.
INP cannot be measured in a navigation run; TBT and max potential FID stand in. Raw reports:
`findings/data/lighthouse-*.json`.

| Route | Perf | LCP | FCP | TBT | Max FID | CLS | JS (compressed) | Total transfer | Requests | LCP element |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 80 | 3.78 s | 0.92 s | 363 ms | 214 ms | 0.031 | 233 kB, plus about 272 kB when MapLibre loads (see M-03) | 357 kB | 47 | status banner (client rendered) |
| `/go` | 89 | 3.62 s | 0.91 s | 116 ms | 175 ms | 0 | 233 kB | 359 kB | 37 | intro paragraph |
| `/add` (signed out, lands on `/login?redirect=/add`) | 84 | 4.13 s | 0.92 s | 185 ms | 148 ms | 0 | 243 kB | 376 kB | 45 | |
| `/leaderboard` | 88 | 3.82 s | 0.91 s | 120 ms | 177 ms | 0.040 | 263 kB | 402 kB | 51 | |
| `/toilets/t-dhoby-nsl` | 74 | 4.22 s | 0.92 s | 423 ms | 359 ms | 0 | 256 kB | 400 kB | 45 | text in the folds |

Accessibility 100 on all five. Best practices 92 to 96. SEO 100 on `/`, `/go`, `/leaderboard`; 63 on `/add`
(login page, noindex on purpose); 91 on the toilet page (meta description, see M-19).
Unthrottled, the same pages reach their LCP element in 0.37 s (TTFB 8 to 27 ms, then element render delay),
so the miss is bandwidth and CPU: the LCP content is client rendered, so on a 1.6 Mbps link it waits for
233 kB of JavaScript plus 17 kB of render-blocking CSS and four webfonts (81 kB).

Top opportunities (all five routes, same chunk each time): render-blocking stylesheet 17.4 kB, est. 230 to
300 ms; unused JavaScript 25 kB (35 %) in the 74 kB framework chunk, est. 300 to 430 ms; legacy JavaScript
14 kB on `/` (`Array.prototype.at`, `.flat` and friends shipped as polyfills); main-thread time 1.6 to 3.1 s,
with one chunk (`3bt7b21...js`) responsible for 0.6 to 1.4 s of scripting; DOM 1,498 elements on the toilet page.
Diagnostics that failed: console errors on every route (`GET /api/me` 401, plus a WebGL error from headless
Chromium without a GPU, which is an artefact), `geolocation-on-start`, back/forward cache, missing source maps
for large chunks.

#### 7. Reduced motion (plan 3.7)

Measured by sampling every running CSS animation and transition for a second after each action, normal versus
`reducedMotion: "reduce"`. Now a regression spec (`e2e/motion.spec.ts`, 4 tests on every phone project).

| Action | Normal | Reduced |
|---|---|---|
| Leaderboard tab change | 0 view transitions; pill `transform` 340 ms, podium rise 380 ms, crown land 340 ms | 0 view transitions; no pill transform; entries fade in 200 ms only |
| Bottom sheet, tap the grabber | `transform` 380 ms on the sheet, `bottom` 380 ms on the control, `grid-template-rows` 380 ms on the header fold, cards rise 260 ms | sheet snaps at once; cards fade 260 ms; the header fold still animated before the fix (M-13) |
| Route change (tab bar) | 1 view transition: out 90 ms, in 240 ms with `--route-shift` 28 px, fade 160 ms | still 1 view transition, but `--route-shift` is 0 px, so it is a 160 ms crossfade, no travel (as documented in `globals.css`) |
| Filters dialog | slides (`translate` 360 ms) with a 200 ms backdrop fade | opacity only |
| Add wizard Next | slide 40 px, fade 280 ms | fade 280 ms, no slide |
| Loading skeletons | sheen 1.6 s loop | `sgw-breathe` opacity loop 1.2 s |

Remaining motion under reduce is opacity or colour only, which the code documents as intended. No stale
view-transition names were seen after a route change (the names are only set while `data-route-vt` is on).

#### 8. Manifest, icons, head, service worker headers (plan 3.2)

| Check | Result |
|---|---|
| `/manifest.webmanifest` | 200, `application/manifest+json`, `display: standalone`, `id`, `start_url` and `scope` `/`, no orientation lock, 3 icons, 2 shortcuts (`/go?urgent=1`, `/add`), categories, `Cache-Control: public, max-age=0, must-revalidate` |
| Icons | `icon-192.png` (192x192), `icon-512.png` (512x512), `icon-maskable-512.png` (512x512, full-bleed, all content within a 147 px radius of the centre against a 205 px safe zone), `apple-icon.png` 180x180 linked as `apple-touch-icon`, `icon.svg` linked; no `/favicon.ico` (404) |
| `theme_color` per theme | manifest is static `#1e120b` (dark). The `theme-color` meta is added by the boot script and follows the theme: `#1e120b` dark, `#f2d3b1` light, for stored choice and for "system" on a dark or light device; it also updates on a live theme change (code path) |
| Viewport | `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content` (raw HTML) |
| iOS web app tags | `mobile-web-app-capable`, `apple-mobile-web-app-title`, `apple-mobile-web-app-status-bar-style: black-translucent` present; `apple-mobile-web-app-capable` was missing (M-14, fixed) |
| `lang`, `color-scheme` | `en-SG`; `color-scheme` follows the theme |
| `/sw.js` | 200, `Cache-Control: no-cache, no-store, must-revalidate`, `Content-Type: application/javascript; charset=utf-8`, `Service-Worker-Allowed: /` |

---

#### 9. Findings

Severity: critical = data loss, takeover, app unusable on a current phone; high = core flow broken on one matrix
row or realistic security weakness; medium = degraded experience or missing safeguard; low = polish.
Evidence paths are under `/tmp/claude-0/-home-user/85733a4e-b879-55ea-a246-eff480d9c708/scratchpad/findings/`.

##### M-01 Medium: lie-fi with nothing saved spins for about 24 s
- Device/viewport: Pixel 7 emulation, service worker on, connection stalled (proxy holds every request 60 s).
- Steps: visit `/about` once (worker installs, no toilet list saved), stall the connection, open `/`.
- Expected: a fast "no signal" or "taking long" state (plan 3.4: "the UI shows 'no signal' quickly, not a long spinner").
- Actual: skeleton for 24.1 s. The client's 10 s request timeout is retried once (`providers.tsx`), and the worker
  has nothing to answer with after its 2.5 s race, so it waits on the network (`sw.js` `list`).
- Evidence: `e2e/offline.spec.ts` "with nothing saved, the screen gives up within one request timeout, not two"
  (annotation `lie-fi-nothing-saved-ms`: 23.9 s to 24.3 s before, 13.0 s after); `data/offline.json`.
- Status: partly fixed. `app/providers.tsx`: retry only `unreachable` errors, not `timeout` (commit eb7f870).
  Still 13 s. Proposed: give list requests a 6 s timeout (urgent mode already uses 6 s) and show a "Taking
  longer than usual" line with the Try again button after about 4 s.

##### M-02 Medium: LCP is 3.6 to 4.2 s on every route (budget 2.5 s); launch gate 5 fails
- Device: Lighthouse mobile (Moto G Power profile, slow 4G, 4x CPU) against the production build.
- Steps: see section 6.
- Expected: LCP under 2.5 s on `/` and `/go`.
- Actual: `/` 3.78 s, `/go` 3.62 s, `/add` 4.13 s, `/leaderboard` 3.82 s, toilet page 4.22 s. FCP is 0.9 s; the LCP
  element renders after hydration (client rendered), so it waits for 233 kB of JS and 17 kB of blocking CSS.
  On the toilet page the element render delay is 2.25 s. Local server, so a floor.
- Evidence: `data/lighthouse-*.json` (insights `lcp-breakdown-insight`, `render-blocking-insight`).
- Status: proposed. Server-render the first screen's text on `/go`, `/leaderboard` and the toilet page (the
  data is available server side for the toilet page); inline or preload the critical CSS (17 kB); defer what
  the first screen does not need; re-measure on the real deployment with the Vercel edge in front.

##### M-03 Medium: first-load JS on `/` is about 500 kB compressed once the map loads (budget 300 kB)
- Device: any; measured with Lighthouse and `gzip -9` on the build output.
- Actual: the route's scripts total 233 kB compressed (Lighthouse), and the MapLibre chunk (1.03 MB raw, 272 kB
  gzipped) loads after that; Lighthouse reports its transfer as 0 because it arrives late, so its summary
  understates the cost. `/go` is 233 kB, `/leaderboard` 263 kB, toilet page 256 kB (all under 300 kB).
- Expected: under 300 kB compressed on first load, or the map clearly deferred past the first interaction.
- Evidence: `data/lighthouse-home.json` (`network-requests`, `27w_4ku98dxj5.js`), `.next/static/chunks`.
- Status: proposed. Confirm with brotli on Vercel (smaller than gzip); load MapLibre on first idle or first
  pointer, show the list immediately; consider a static map image for the first paint.

##### M-04 Medium: main thread blocked 363 ms on `/` and 423 ms on a toilet page (INP proxy)
- Device: Lighthouse mobile, 4x CPU throttle.
- Actual: TBT `/` 363 ms, toilet 423 ms (up to 606 ms in one run), others 116 to 185 ms. One chunk accounts for
  0.6 s to 1.4 s of scripting; max potential FID 359 ms on the toilet page. Budget is INP under 200 ms.
- Evidence: `data/lighthouse-home.json`, `lighthouse-toilet.json` (`bootup-time`, `mainthread-work-breakdown`).
  A forced-reflow insight also points at the home page.
- Status: proposed. Profile the toilet page (1,498 DOM nodes; the folds render closed content) and the home
  page's hydration; measure real INP on a mid-range Android with the PostHog web-vitals or `web-vitals` library.

##### M-05 Medium: large system text overflowed on leaderboard, toilet page and `/me` (fixed part)
- Device: 390 px wide, root font size 200 % (Android "largest" font; simulated with `html{font-size:200%}`,
  `LAYOUT_TEXT=200`).
- Steps: open `/leaderboard`, a toilet page, `/me`.
- Expected: text wraps, nothing clipped, no sideways scroll (WCAG 1.4.4, 1.4.10).
- Actual: the "Leaderboard" heading ran off the screen; the two tab labels overlapped each other; on the toilet
  page the walk tile and "8.4 /10" score pushed the page to 529 px and the Share button off-screen; on `/me` the
  points, badges and stations row went to 528 px.
- Evidence: `shots/text200-390-leaderboard.png`, `text200-390-me.png`; `data/layout200.jsonl` (before) and
  `layout200b.jsonl` (after).
- Status: fixed (commit a0811ca). `app/globals.css` (`overflow-wrap: break-word` on h1 to h3),
  `app/leaderboard/leaderboard-client.tsx` (tab labels wrap), `app/me/me-client.tsx` (stats row wraps),
  `app/toilets/[id]/detail-client.tsx` (verdict tiles and the CTA row wrap). The toilet page and `/me` no longer
  overflow at 200 %; 150 % is clean everywhere except `/admin` (M-06).

##### M-06 Medium: large system text still overflows on several screens (open part)
- Device: 390 and 375 px wide at 150 to 200 % text.
- Actual (after M-05): at 200 % the page is still 399 to 430 px wide on `/go` (filter bar), `/leaderboard`
  (podium: the "Community" and "Imported" badges and the 8.1/10 scores exceed their columns), `/login`, `/me`,
  `/stations` and `/admin`; the bottom tab bar then stretches to match and its "Me" label is clipped. At 175 %
  `/leaderboard` and `/admin` overflow by 2 to 27 px; at 150 % `/admin` by 11 px (390) and `/leaderboard`'s
  podium at 375 px. The tab bar's five columns need about 448 px of rem-based width at 200 %.
- Evidence: `data/layout200b.jsonl`, `layout175.jsonl`, `layout150.jsonl`.
- Status: proposed. Stack the podium into rows when the root font is large (or let its badges wrap); make the
  tab bar icons and padding fluid so the five columns fit down to 320 px at 200 % (the labels already truncate);
  find the `/admin` tab strip's minimum width. Add a `layout-390-text150` project once these pass.

##### M-07 Medium: "Walk there" is below the first screen on small phones
- Device/viewport: iPhone SE 375x667 (375x548 visible in Safari with its bars), 360x640 Android; partly covered
  on iPhone 14 and 15.
- Steps: open a toilet page that is open now (`/toilets/t-dhoby-nsl`).
- Expected: the primary action stays in the first screen (the code comment above the folds says so).
- Actual: the 56 px "Walk there" button is visible for 0 px on 375x548 and 360x640, 24 px on 375x667, 45 px on
  390x664, 40 px on 393x659, 56 px on 412x839 and 430x932; the fixed tab bar and its "I NEED TO GO" crown cover it.
- Evidence: `shots/375x548-toilet-walk-cta-hidden.png`, `shots/375-toilet.png`.
- Status: proposed. Pin the CTA row above the tab bar on short viewports (under about 700 px), or tighten the
  verdict card (shorter walk and score tiles, one line for the level and exit).

##### M-08 Medium: light-theme text contrast below AA (fixed)
- Device: 390 px, light theme.
- Actual: `text-mint` 4.27:1 ("You're 50 m away, close enough to check in." on the toilet page), `text-accent`
  3.78:1 (points on `/me`); `text-urgent` 3.86:1 on `bg`.
- Evidence: `data/axe.jsonl`; token table in section 4.
- Status: fixed (commit a0811ca), `app/globals.css` light theme only: `--mint` `#09704f` to `#086346`,
  `--accent` `#876500` to `#6f5300`, `--urgent` `#c62f16` to `#b22a14` (4.55 to 4.6:1 on `bg` and, for the first
  two, `surface-2`). Solid fills with white text only get higher contrast. Map pin colours in
  `components/map/ToiletMap.tsx` still hardcode the old `urgent`; unchanged on purpose (pins, not text).
  The remaining sub-4.5 pairs on `surface-2` are listed in section 4.

##### M-09 Low: heading level skipped under an empty state (fixed)
- `/review`, signed in with nothing to review: "All clear. Shiok." was an `h3` straight under the `h1` (axe
  heading-order, both themes). `EmptyState` in `components/ui.tsx` now renders an `h2`. Commit a0811ca.

##### M-10 Low: result rows on `/go` had an accessible name that dropped their visible text (fixed)
- `/go?urgent=1`, rows 2 and 3: `aria-label="Go to Plaza Singapura, 3 minute walk"` replaced the visible tier and
  label text (WCAG 2.5.3 Label in Name, axe label-content-name-mismatch). Removed the `aria-label` in
  `app/go/go-client.tsx` (`AltRow`); the name now comes from the content ("3 min Plaza Singapura Community ..."),
  and the unused `urgent` prop went with it. Commit a0811ca.

##### M-11 Low: "Privacy notice" link on `/about` was 19 px tall (fixed)
- 97x19 px standalone link in the footer. `app/about/page.tsx`: both footer links are `min-h-11` flex items.
  Commit a0811ca.

##### M-12 Low: invalid list markup under a radiogroup on `/add` step 2 (fixed)
- `<ul role="radiogroup"><li><button role="radio">` made screen readers lose the radios (axe listitem). Now a
  `div role="radiogroup"` with the radios directly, `app/add/add-client.tsx`. Commit a0811ca.

##### M-13 Low: the sheet's header fold animated its height under reduced motion (fixed)
- Device: reduced motion on. Tapping the sheet grabber left a 380 ms `grid-template-rows` transition running on
  `[data-sheet-reveal]` (the legend and "Help me choose" fold). `app/home-client.tsx`: added
  `motion-reduce:transition-none`. Guarded by `e2e/motion.spec.ts` "the bottom sheet snaps without travelling"
  (it failed before the fix). Commit a0811ca.

##### M-14 Low: `apple-mobile-web-app-capable` missing (fixed)
- Next emits only `mobile-web-app-capable`; iOS before 16.4 needs the apple-prefixed tag to open the home screen
  icon without Safari's bars. `app/layout.tsx` `metadata.other`. Commit a0811ca. Verify on a device.

##### M-15 Low: manifest and icon loose ends (shortcut icon fixed, rest proposed)
- "Add a toilet" shortcut had no icon: fixed (`app/manifest.ts`, commit a0811ca).
- Proposed: manifest `theme_color` is static dark while a light-theme user gets a caramel `theme-color` meta, so
  the installed app's title bar and splash can disagree with the theme (a static manifest cannot vary; pick the
  value you want the splash to show); no `screenshots` for the richer Android install sheet; no `/favicon.ico`
  (404 for crawlers and old clients; `icon.svg` covers modern browsers).

##### M-16 Low: easy Lighthouse opportunities
- Render-blocking 17 kB stylesheet (est. 230 to 300 ms), 25 kB unused JavaScript in the 74 kB framework chunk,
  14 kB of polyfills for `Array.prototype.at`, `.flat` and similar on `/` (check the browserslist / Next target),
  large chunks without source maps (Lighthouse `valid-source-maps`; matters once error reporting arrives).
  Evidence `data/lighthouse-home.json`. Status: proposed.

##### M-17 Low: every anonymous page load logs a 401 in the console
- `GET /api/me` answers 401 for signed-out visitors by design (`silent401`), but Chrome logs it as a network
  error on every page (Lighthouse `errors-in-console` fails on all five routes). Backend change (answer 200 with
  `null`, or 204) or accept it; PostHog and error reporting filters should ignore it. Status: proposed.

##### M-18 Low: location is requested the moment `/` or `/go` opens
- Lighthouse `geolocation-on-start`; with the prompt pending the page is also not eligible for the back/forward
  cache ("permission requests upon navigating away"). It matches the first-visit flow in the plan ("land, allow
  location"), but a prompt before any value is shown denies more often. Proposed: ask after the first tap on
  "Centre on my location" or "I need to go", and open on the Raffles Place fallback until then (3.3 behaviour).

##### M-19 Low: toilet page is `no-store`, and its meta description is streamed into the body
- `GET /toilets/<id>`: `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` (dynamic render),
  so Lighthouse reports back/forward cache disabled (two reasons: main resource and JS requests with `no-store`).
  Opening a toilet from a shared link and pressing Back reloads the map cold.
- For normal browsers and Googlebot the `<meta name="description">`, OpenGraph and Twitter tags arrive in the
  body (Next streams metadata); Lighthouse SEO scores the page 91 for it. Facebook, Twitter and Telegram bot user
  agents get them in `<head>` (checked with curl: `facebookexternalhit`, `Twitterbot`, `TelegramBot`), so link
  previews are fine. Status: proposed; decide whether the toilet page can be cached for a short time
  (`cacheLife`) and whether Googlebot should be added to `htmlLimitedBots`.

##### M-20 Low: two service worker start-up oddities (cannot confirm outside Playwright)
- Device: Chromium 141 under Playwright, worker in control.
  (a) Reloading within about 2 s of the worker becoming ready left the reloaded page uncontrolled in roughly
  1 run in 4 (nothing stored in the API, pages or data caches; the install had finished only part of the 29 static
  assets); (b) a navigation started within about 300 ms of a reload's load event skipped the worker, so a dropped
  connection showed as `ERR_EMPTY_RESPONSE` instead of the saved page.
- The tests wait for the precache and settle before cutting the signal, which removed both. Real phones rarely do
  either. Manual test: install the app, then within 2 s of the first load, reload and go into airplane mode,
  confirm the shell still opens. Possible hardening: `precache()` could wait for all static assets before
  `skipWaiting()` resolves `install` (it already uses `allSettled`, so a failed asset does not block).
- Evidence: comments in `e2e/offline.spec.ts` (`workerReady`, `secondVisit`). Status: open, needs a device.

##### M-21 Low: flaky smoke test, "dragging down from the peek..." (test fixed, product race not ruled out)
- About 1 run in 10 (all four device projects, 4 workers) the drag did nothing and the sheet stayed at the peek.
  Probable cause: the sheet is still re-measuring its peek for the first few frames after the list arrives and the
  count shifts by a few px (observed 443 to 389 px and 391 to 389 px), so a drag that starts then can be dropped.
- Status: fixed in the test (`e2e/smoke.spec.ts`): wait 600 ms, retry the drag inside `expect(...).toPass`;
  60 of 60 repeated runs pass. If the same race exists for a real finger dragging within a second of load, the
  sheet would ignore the first drag; worth a try on a device.

##### M-22 Low: test infrastructure notes (no product impact)
- The installed Chromium (1194) is not the build Playwright 1.64.1 expects (1248), so a stock `pnpm test:e2e` fails
  at launch here; `PW_CHROMIUM_PATH` is the escape hatch. `serve.mjs` cuts server components off from the API with
  `API_ORIGIN=127.0.0.1:9`, but the `/api` rewrite destination is fixed at build time, so a request that escapes
  `page.route` (for instance one in flight at test teardown) logs `Failed to proxy ... ECONNREFUSED 127.0.0.1:4000`
  in the server output. Harmless; it will stay in CI logs.

---

#### 10. Fixes and commits on `audit/emulation`

| Commit | What |
|---|---|
| `73790f0` | `PW_CHROMIUM_PATH` escape hatch in `playwright.config.ts` |
| `3ef213e` | Smoke suite also on iPhone 15, iPhone SE (375x667) and a 430 px Android |
| `eb7f870` | axe, layout and offline projects; stub API, flaky proxy, shared fixtures; `@axe-core/playwright`; stop retrying timed-out requests (M-01) |
| `a0811ca` | Fixes M-05, M-08 to M-15 (contrast tokens, `h2` empty state, label in name, 44 px links, radiogroup markup, large-text wrapping, reduced-motion fold, iOS tag, shortcut icon), more axe states, `motion.spec.ts`, smoke test flake fix (M-21), README |

Files changed in the app: `app/globals.css`, `app/providers.tsx`, `app/go/go-client.tsx`, `app/about/page.tsx`,
`app/add/add-client.tsx`, `app/home-client.tsx`, `app/layout.tsx`, `app/manifest.ts`,
`app/leaderboard/leaderboard-client.tsx`, `app/me/me-client.tsx`, `app/toilets/[id]/detail-client.tsx`,
`components/ui.tsx`. Nothing was pushed.

#### 11. Final e2e output

Command: `API_ORIGIN=http://localhost:4000 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e --reporter=list`
(servers started by Playwright itself, build included). Full listing: `findings/data/final-e2e-output.txt`.

```
  228 passed (5.9m)

real	5m55.832s
```

Per project: chromium-mobile 18, iphone-15 18, iphone-se 18, android-large 18, a11y 84, layout-390 21,
layout-375 21, layout-430 21, offline 9; 0 failed, 0 flaky, 0 skipped. `pnpm lint` and `pnpm typecheck`: clean,
no warnings.


---

## D. Data, infrastructure, operations and CI (plan §6, §7, §9)

Baseline: branch `claude/production-readiness-audit-k5u4nh` in `/home/user/frontend` and `/home/user/backend`
(working trees contain other agents' uncommitted edits; where one of them already fixed something I say so).
Date of audit: 2026-10-20.

#### Summary

- **The live probes could not be run.** The egress proxy answers `403` to `CONNECT shitgowhere.com:443`
  (`/__agentproxy/status` records `connect_rejected ... policy denial`). Per the proxy's own rules I did not
  retry or route around it. Instead I (a) reproduced every probe against a local production build of the
  repo code (`next start` + built API, headers below), and (b) wrote `backend/docs/probe-production.sh`, a
  read-only (GET only, ~15 requests/minute) script that produces the same table, redirects, TLS facts and
  latency spread against the real origin. **Run it once from your own machine and paste the output over the
  "Expected on Vercel" column.** Everything in that column is unverified platform behaviour. (I-01)
- The platform layout is sound (single region `sin1` for both Vercel projects, Neon `ap-southeast-1`, R2 APAC
  hint; pooled URL at runtime, direct URL for migrations; every query behind the hot paths has an index).
- The launch-blocking gaps are all in §7: **no security headers/CSP, no error tracking, no uptime monitor
  or alert, and a Hobby plan whose terms and hard allowances need a decision** (I-02..I-05).
- Backups existed but nobody knew they restored. They now do: the nightly job restores the exact uploaded
  object into a throwaway Postgres, retention can no longer delete the last good copies, and a dead-man's
  switch hook is wired (I-09). The pg_dump/psql round trip was run locally against the seeded database
  (identical schema, identical row counts, `prisma migrate diff` clean, restore as a different role works).
- Migrations run inside `pnpm vercel-build`; the forward-fix and rollback procedures are written
  (`backend/docs/RUNBOOKS.md` 2, 3, 6) and one real hazard found: a Preview scope holding the production
  database URL would let an unmerged PR migrate production (I-07).
- Files changed by me (all in my ownership): `backend/.github/workflows/{scheduled,ci,preview-db}.yml`,
  `frontend/.github/workflows/ci.yml`, new `{backend,frontend}/.github/dependabot.yml`,
  `{backend,frontend}/.github/scripts/vercel-ignore-build.mjs`, new `backend/.github/scripts/verify-restore.sh`,
  `{backend,frontend}/vercel.json` (`ignoreCommand`), both READMEs, both `.env.example`, new
  `backend/docs/RUNBOOKS.md` and `backend/docs/probe-production.sh`. All workflow YAML passes
  `@action-validator/cli`; the scripts were exercised locally (details per finding).
- Supporting evidence files next to this one: `infra-explain-plans.txt`, `infra-explain.sql`,
  `infra-prisma-sql.txt` (the SQL Prisma actually emits for nearby / in-bounds / leaderboards).

Counts by severity: critical 0, high 4, medium 13, low 11, info 3 (31 findings).

#### Live-probe header table

Left: what the repo code produces, observed locally (`next start` on the built frontend with the API behind
the rewrite; `NEXT_PUBLIC_SITE_URL=https://shitgowhere.com`). Right: what I expect Vercel to add; **not
verified** (I-01). Values are exact as received; empty means the header is absent.

| Route | Observed locally (exact) | Expected on Vercel (unverified) |
|---|---|---|
| `/` | `200`; `Cache-Control: s-maxage=31536000`; `X-Powered-By: Next.js`; `x-nextjs-prerender: 1`; `x-nextjs-stale-time: 300`; `Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding`; `Content-Type: text/html; charset=utf-8`; `ETag: "13h20bxwng410re"`; `link: </_next/static/media/dela_gothic_one_...woff2>; rel=preload; as="font"; crossorigin=""; type="font/woff2", ...`; 47,654 B. No CSP, no HSTS, no `X-Content-Type-Options`, no `Referrer-Policy`, no `Permissions-Policy`, no `X-Frame-Options` | `Strict-Transport-Security: max-age=63072000` added by Vercel; `Server: Vercel`; `X-Vercel-Id: sin1::...`; `X-Vercel-Cache: HIT/PRERENDER`; `Cache-Control: public, max-age=0, must-revalidate` (CDN keeps it for the s-maxage). Still no CSP or other security headers |
| `/go` | same shape as `/`; `ETag: "np5qr29qw511hj"`; 48,593 B | same as `/` |
| `/sw.js` | `Cache-Control: no-cache, no-store, must-revalidate`; `Content-Type: application/javascript; charset=utf-8`; `Service-Worker-Allowed: /`; 15,747 B; body contains `const BUILD = "<SGW_BUILD_ID>"` | same; `const BUILD` equals the sanitised `VERCEL_DEPLOYMENT_ID` (`dpl_...`), which changes every deploy |
| `/manifest.webmanifest` | `cache-control: public, max-age=0, must-revalidate`; `content-type: application/manifest+json`; 740 B; `display: standalone`, `start_url: /`, `theme_color`/`background_color: #1e120b` (dark only), 3 icons (192, 512, maskable 512), shortcuts "I need to go" (`/go?urgent=1`) and "Add a toilet" | same |
| `/robots.txt` | `cache-control: public, max-age=0, must-revalidate`; `content-type: text/plain`; `Allow: /`, `Disallow: /api/ /admin /me /login /add /review`; `Sitemap: https://shitgowhere.com/sitemap.xml` | same |
| `/sitemap.xml` | `cache-control: public, max-age=0, must-revalidate`; `content-type: application/xml`; 226,740 B (about 1,100 toilets + areas + stations); prerendered with revalidate 1 h / expire 1 d, fetched from the API at **build** time | same; if the API was unreachable during the build the file shipped with static entries only until the first revalidation |
| `/api/health` | `200`; `x-powered-by: Express`; `Vary: Origin, Accept-Encoding`; `content-type: application/json; charset=utf-8`; `content-length: 55`; `etag: W/"..."`; body `{"ok":true,"db":"up","time":"..."}`. (Direct API adds `X-RateLimit-Limit: 120`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, CORS headers for `FRONTEND_ORIGIN`) | adds `X-Vercel-Id`, `X-Vercel-Cache: MISS`, HSTS. No `Cache-Control`, so never CDN-cached |
| `/api/openapi.json` | `200`; `application/json`; 92,724 B. Reachable through the rewrite, public | same |
| `/api/docs` | `200`; `text/html; charset=utf-8`; 3,126 B (Swagger UI; the spec is embedded in `/api/docs/swagger-ui-init.js`, 254 KB). Reachable through the rewrite, public. `/api/docs/swagger-ui.css` 200; **`/api/docs/` (trailing slash) serves the same HTML whose CSS link `./docs/swagger-ui.css` 404s**; "Try it out" would call `https://<site>/health` (no `/api` prefix, wrong base) | same |
| `/_next/static/**` | `Cache-Control: public, max-age=31536000, immutable` (CSS, JS and woff2 all checked) | same, plus `X-Vercel-Cache: HIT` |
| `/icons/icon-192.png` | `Cache-Control: public, max-age=0` | `public, max-age=0, must-revalidate`; revalidated on every use, cheap |
| `/_next/static/nonexistent` | `404`; `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` | same |
| TLS / `http://` | not testable locally | Vercel 308-redirects `http://` to `https://` and serves HSTS (`max-age=63072000`, no `includeSubDomains`/`preload` unless you add them); TLS 1.2+ with a Let's Encrypt certificate |
| `www.` | not testable locally | depends on the Domains settings: attach the apex and `www`, redirect one to the other; confirm with the script |
| Cold-start hint | no `Server-Timing` header from either app | none; use `X-Vercel-Id` region (`sin1`) and the script's timing spread |

Local latency reference (not production): warm `/api/health` 4 to 11 ms, warm nearby 17 to 31 ms through
the rewrite; **API process boot to first `/health` answer: 2.2, 2.5, 2.9 s** (unbundled `dist/`, includes
Nest init, Prisma client, sharp). Expect a cold function on Vercel in the 1.5 to 3.5 s range, plus Neon
compute wake-up (hundreds of ms to a few seconds) after idle. Measure with the script's "first request after a
quiet period" line. (I-29)

#### Environment parity

Legend: R = read by code; D = documented in README table; E = in `.env.example`. "was" = state before my edits.

##### Frontend (`/home/user/frontend`)

| Variable | Read in | README | .env.example | Prod value | Status |
|---|---|---|---|---|---|
| `API_ORIGIN` | `next.config.ts`, `lib/api/server.ts` | D | E | **required**, API prod URL, no trailing slash | OK. **Silently defaults to `http://localhost:4000`** if unset (I-13) |
| `NEXT_PUBLIC_SITE_URL` | `lib/site.ts` | was missing, now D | E (commented) | required once a domain exists | fixed (doc). Falls back to `VERCEL_PROJECT_PRODUCTION_URL` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `lib/site.ts` | was missing, now D | E (commented) | recommended (takedown contact) | fixed (doc) |
| `NEXT_PUBLIC_POSTHOG_KEY` | `lib/analytics.ts` | was missing, now D | E (commented) | key; **unset in Preview** | fixed (doc) |
| `NEXT_PUBLIC_DEV_LOGIN` | `app/login/login-client.tsx` | D | E (**active** `=true`) | unset | OK. Example file enables it by default; fine locally, noted that Vercel does not read it |
| `VERCEL_DEPLOYMENT_ID`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_PROJECT_PRODUCTION_URL` | `next.config.ts`, `lib/site.ts` | was missing, now D | n/a | Vercel system vars | fixed (doc) |
| `SGW_BUILD_ID` | derived in `next.config.ts` into `env`, read by `app/sw.js/route.ts` | n/a | n/a | derived | OK |
| `NODE_ENV`, `CI`, `E2E_PORT` | `app/providers.tsx`, `playwright.config.ts` | n/a | n/a | n/a | test-only; `E2E_PORT` undocumented, harmless |
| (none) | Sentry DSN, release tag | n/a | n/a | n/a | missing feature (I-03) |

Documented but unused: none. Required in production but not enforced: `API_ORIGIN`.

##### Backend (`/home/user/backend`)

| Variable | Read in | README | .env.example | Status |
|---|---|---|---|---|
| `DATABASE_URL` | `env.ts` | D | E | OK (Neon **pooled** host) |
| `DIRECT_URL` | `env.ts`, `prisma.config.ts`, `imports/lib/db.ts` | D | E | OK. Also needed at **build** time (migrate). Now stated |
| `DATABASE_URL_UNPOOLED` | `prisma.config.ts`, `imports/lib/db.ts` (not `env.ts`) | was missing, now D | was missing, now E (comment) | fixed (doc) |
| `SHADOW_DATABASE_URL` | `prisma.config.ts`, CI | was missing, now D | was missing, now E (comment) | fixed (doc) |
| `PORT`, `NODE_ENV` | `env.ts` | D | E | OK (`PORT` unused on Vercel) |
| `FRONTEND_ORIGIN` | `app.factory.ts` (CORS only) | D | E | OK; browser never calls the API cross-origin in prod |
| `PUBLIC_APP_URL` | OAuth redirect, bot links | D | E | **required in prod but defaults to `http://localhost:3000`** and nothing refuses that (I-12) |
| `AUTH_SECRET` | sessions, anon cookie, OAuth state, Telegram hash | D | E (placeholder is 33 chars, so passes `min(16)`) | **placeholder accepted in prod** (I-12) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `auth.service.ts` | D | E | OK |
| `ONEMAP_EMAIL` / `ONEMAP_PASSWORD` | `onemap.service.ts`, geocode | D | E | OK. Wrong creds fail silently (I-22) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_PUBLIC_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `media.service.ts`, `storage.ts` | D | E | OK. **If bucket or keys are missing the API silently uses local disk**; if `S3_PUBLIC_URL` is missing photo URLs point at the private S3 API endpoint (I-12) |
| `ADMIN_EMAILS` | `auth.service.ts` | D (was "first login", wrong: every login) | E | fixed (doc) |
| `CRON_SECRET` | `cron-secret.guard.ts` | D | E (`change-me` passes) | placeholder accepted (I-12) |
| `DEV_LOGIN_ENABLED` | `env.ts` (refused in production) | D | E | OK |
| `SENTRY_DSN` | `env.ts` only | D ("optional") | E | **documented, read, never used**; README/example now say so (I-03) |
| `POSTHOG_KEY` / `POSTHOG_HOST` | `analytics.service.ts` | was missing, now D | E | fixed (doc) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_API_ROOT` | `telegram.*`, `cli` | D | E | OK |
| `TELEGRAM_CHANNEL_ID` | `env.ts` only | D ("unused in v1") | E | documented and unused, by design |

GitHub Actions (backend): secrets `DIRECT_URL`, `CRON_SECRET`, `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY`,
`ONEMAP_*`, `NEON_API_KEY`, `VERCEL_TOKEN`; variables `API_URL`, `R2_ACCOUNT_ID`, `R2_BACKUP_BUCKET`, `PG_DUMP_IMAGE`,
`NEON_PROJECT_ID`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `PREVIEW_SEED`: all read by the workflows and all in the README
table. New: secret `BACKUP_HEARTBEAT_URL` (documented). Frontend Actions: none.

Vercel scope check for the owner: the README previously said Preview is "same as Production except the database", which
would have put production Google/R2/Telegram/cron secrets into previews. Preview should have: its own DB (Neon branch),
no production `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` (previews must not be able to answer as the production bot; use a second bot or leave unset), no `NEXT_PUBLIC_POSTHOG_KEY`, `POSTHOG_KEY` unset, and `S3_*` for a separate bucket or unset.

#### Database plans (local seeded DB: 1,096 toilets, 1,436 venues; full output in `infra-explain-plans.txt`)

How Prisma 7 with `@prisma/adapter-pg` really queries (captured with query logging, `infra-prisma-sql.txt`): the
`include` tree is **not** a JOIN; it is one query for toilets (venue joined only as a filter) plus five `IN (...)`
queries (venue, features, surveys, photos, status reports), sequential. Each is cheap, but a nearby request is 6
round trips from the function to Neon. Survey and photo lookups fetch every row for the listed toilets and apply
`take: 1` in JS.

| Query | Plan (exact node) | Result |
|---|---|---|
| nearby, 1 km bbox | `Bitmap Index Scan on "Toilet_latitude_longitude_idx"` -> `Hash Join` with a `Seq Scan` on `Venue` (1,435 rows, hashed) | 63 rows, 1.0 ms, 98 buffers. Forced `enable_seqscan=off`: merge join, 0.5 ms (same answer) |
| nearby at 51k toilets (50k synthetic rows added) | same `Bitmap Index Scan` | 276 rows, 1.0 ms, 305 buffers: the lat/lng btree scales (latitude range does the work; a 1 km box touches about 0.5% of the island) |
| in-bounds 4x4 km, `ORDER BY id LIMIT 3000` | seq scan at 1.1k rows (197 rows, 0.8 ms); `Bitmap Index Scan` at 51k rows (1,238 rows, 3.1 ms) | fine. The sort is by `id`, not by relevance, so a truncated (over 3,000) viewport drops an arbitrary subset (I-23) |
| features / surveys / photos / status reports `IN (ids)` | seq scans at this size (tiny tables, planner is right); indexes exist: `ToiletFeature` PK `(toiletId, feature)`, `Survey_toiletId_surveyedAt_idx`, `Photo_toiletId_approved_idx`, `StatusReport_toiletId_expiresAt_idx` | all sub-millisecond |
| toilet leaderboard | `Seq Scan on "Toilet"` filter `status = 'ACTIVE' AND "scoreCleanliness" IS NOT NULL`, then `Survey` for **all** matching ids | 160 rows, 0.4 ms now; unbounded and uncached, grows with the number of reviewed toilets |
| venue areas `DISTINCT` | `Hash Semi Join` + sort | 0.9 ms |
| points leaderboard (week scope) | `GroupAggregate` over `PointsLedger` joined to `User`; index `PointsLedger_createdAt_userId_idx` available | 0.06 ms on an empty ledger. The all-time scope and the per-request "my rank" `groupBy ... having sum > n` aggregate the whole ledger (uncached, O(ledger)) (I-23) |

Verdict: no missing index for the hot paths. Re-run `infra-explain.sql` on the production branch once real
data exists (`psql "$DIRECT_URL" -f infra-explain.sql`; it only reads).

Connections: one `PrismaService` (one `pg.Pool`) per function instance. Pool `max` is pg's default 10, idle timeout 10 s.
The working tree (another agent) now adds `connectionTimeoutMillis: 10_000` (before: wait forever, up to the 30 s cap)
and `attachDatabasePool` (closes idle connections before a Fluid instance is suspended); the adapter already registers
an idle-client error handler, so a Neon-side connection drop does not crash the process. With the Neon **pooler**
(PgBouncer, transaction mode, thousands of client connections) 10 per instance times a few dozen instances is far from
any limit; the real ceiling is Neon's server-side `max_connections` for the compute size behind the pooler (check it
for your CU), and interactive transactions hold one server connection each for their duration. Do not use the pooled
URL for `prisma migrate` (advisory locks); `prisma.config.ts` correctly prefers `DIRECT_URL`.

#### Backup and restore round trip (local, PostgreSQL 16 client and server; Actions use `postgres:17-alpine`)

Dump exactly as `scheduled.yml` does (`pg_dump --no-owner --no-privileges | gzip -9`): 0.18 s, 198,584 bytes for an
11 MB database, 23 `COPY` blocks, **no** `ALTER ... OWNER`, `GRANT`, `REVOKE`, `CREATE ROLE` or `CREATE EXTENSION` lines
(the schema uses only `plpgsql`). `_prisma_migrations` is included. Restore into an empty database (`psql -v
ON_ERROR_STOP=1 -q -1`): 0.26 s, exit 0, counts equal (Toilet 1096, Venue 1436, Survey 166, ToiletFeature 3689, 8
migrations). `pg_dump -s` of source and copy are identical; `prisma migrate status` says "Database schema is up to
date"; `prisma migrate diff --from-config-datasource --to-schema` reports no difference. Restore **as a different role**
works (objects owned by the restoring role). Restore into a non-empty database fails on the first statement
(`type "AreaType" already exists`), hence the runbook restores into a new database. New pg_dump minor releases emit
`\restrict`/`\unrestrict` meta-commands: restore with a `psql` at least as new as the dump (use the same Docker image),
never by pasting into an SQL editor. Not tested (cannot from here): a real Neon target, Docker (not available in this
sandbox, so the container path of `verify-restore.sh` only runs in Actions; its URL mode was tested here including a
truncated dump and a schema-only dump, both rejected).

---

#### Findings

##### I-01 | info | Live probes of https://shitgowhere.com blocked by egress policy
- Location: audit environment, not the app.
- Evidence: `curl -sS https://shitgowhere.com/` returns `CONNECT tunnel failed, response 403`; the proxy status lists
  `connect_rejected ... host: shitgowhere.com:443`. Not retried.
- Status: **blocked, mitigated**. `backend/docs/probe-production.sh` (new) produces the header table, redirect/TLS facts,
  six-sample latency spread for `/api/health` and `/api/toilets/nearby?lat=1.2993&lng=103.8455`, rendered meta tags and
  the service-worker build id. Run: `backend/docs/probe-production.sh > probe.md`; `LOCAL=http://localhost:3000` also diffs
  manifest and robots against a local build. Open questions only the live run answers: HSTS value, `www` and `http`
  redirects, whether `/api/docs` and `/api/openapi.json` answer 200 on production (they do locally), cold-start spread,
  whether the deployed build matches the repo (compare `og:image`, manifest and `const BUILD` against a fresh deploy).

##### I-02 | high | No security headers or CSP on the frontend; `X-Powered-By` on both apps
- Location: `frontend/next.config.ts` (`headers()` only sets `/sw.js`), `backend/src/app.factory.ts` (no helmet).
- Evidence: local responses carry none of CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  frame protection; `X-Powered-By: Next.js` and `x-powered-by: Express`. HSTS comes from Vercel (expected, verify with I-01).
  Inline scripts exist (theme boot script in `app/layout.tsx` and `global-error.tsx`, JSON-LD), so a strict
  nonce-less `script-src 'self'` will break the app; start with Report-Only.
- Hosts the CSP must allow (from the code): `img-src 'self' data: blob: https://www.onemap.gov.sg <S3_PUBLIC_URL origin>`;
  `connect-src 'self' https://www.onemap.gov.sg <R2 endpoint https://<account>.r2.cloudflarestorage.com>` (MapLibre fetches
  tiles; the photo PUT is cross-origin); `worker-src 'self' blob:` (MapLibre workers and `/sw.js`); `font-src 'self'`;
  `style-src 'self' 'unsafe-inline'`; analytics goes through same-origin `/ingest`; `frame-ancestors 'none'`;
  `object-src 'none'`; `base-uri 'self'`. Also `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: geolocation=(self), camera=(self), microphone=()`, and `poweredByHeader: false`.
- Status: **proposed** (frontend agent owns `next.config.ts`). For the API: `app.disable('x-powered-by')` and `helmet()` with
  CSP off (Swagger UI needs inline script) or the same set of headers in `backend/vercel.json`; deliberately not added by me
  to avoid double headers if the code agents add them.

##### I-03 | high | No error tracking in either app (`SENTRY_DSN` is dead config)
- Location: `backend/src/config/env.ts:43` (read, never used), `frontend/app/error.tsx`, `global-error.tsx`.
- Evidence: `grep -r SENTRY` finds only `env.ts` and the docs. Hobby logs last about one hour, so a crash overnight leaves
  no record. Launch gate 3.
- Status: **proposed** (code). Wire `@sentry/nestjs` (API; flush with `waitUntil` on Vercel) and `@sentry/nextjs`
  (`global-error.tsx`, `error.tsx`, source maps, release = `VERCEL_GIT_COMMIT_SHA`), scrub request bodies and cookies,
  send alerts to a channel you read. Docs now say plainly that `SENTRY_DSN` does nothing yet.

##### I-04 | high | No uptime monitor or alerting; `/health` always queries the database
- Location: `backend/src/health/health.controller.ts`; no monitor configured anywhere.
- Evidence: `/health` does `SELECT 1` every call. A 1-minute probe keeps Neon's compute awake around the clock and spends
  the free compute allowance; with scale-to-zero the first user after idle pays the wake-up. `/health` also reports no build
  identity, so "is this the deployed SHA" cannot be answered remotely. Launch gate 6.
- Status: **proposed + documented.** Add an external monitor (UptimeRobot / Better Stack / healthchecks.io, Singapore
  probe) on `<site>/` and `<site>/api/health`, alert on two consecutive failures, 5-minute interval until the compute plan
  is known (README "Observability"). Code: split a cheap liveness route (no DB) from the readiness one, and add
  `commit: process.env.VERCEL_GIT_COMMIT_SHA` to the response. The backup job already pings a heartbeat URL when
  `BACKUP_HEARTBEAT_URL` is set.

##### I-05 | high | Vercel Hobby: non-commercial terms, hard allowances, one seat, one-hour logs
- Location: both projects; `README` plan notes; plan §6 and launch gate 8.
- Evidence (from Vercel's published terms; confirm current numbers at <https://vercel.com/docs/limits> and
  <https://vercel.com/pricing>): Hobby is for personal, non-commercial use (ads, sponsorship, a paid product or anyone
  profiting from the site make it commercial); one seat (no deputy can deploy or roll back while you sleep); runtime logs
  about one hour; monthly allowances for function time, invocations and bandwidth are hard limits that **pause the
  project** rather than bill; one concurrent build; function max duration set only in the dashboard
  (30 s, `vercel.json` cannot carry it for the NestJS builder, per the README). A Reddit post can exhaust an allowance.
- Status: **proposed (owner decision)**. Decide before announcing: stay non-commercial and accept the pause risk (add
  caching, I-16, and watch Usage), or move to Pro. README now states this next to the Vercel setup in both repos.

##### I-06 | medium | Migration runs before compile: a failed build leaves the schema ahead of the live code
- Location: `backend/package.json` `vercel-build` = `prisma generate && prisma migrate deploy && nest build`.
- Evidence: Vercel keeps serving the last good deployment when the build fails, so old code runs against the new schema.
  Two simultaneous builds contend on Prisma's advisory lock (second fails with `P1002`). A half-applied migration shows
  as `finished_at IS NULL` in `_prisma_migrations` and blocks every later deploy with `P3009`.
- Status: **fixed (docs)**: `RUNBOOKS.md` 3 (diagnose with `prisma migrate status`, forward-fix, `migrate resolve`,
  expand/contract rule); README "Migration rules" unchanged. Prevention is discipline (additive migrations) plus CI drift guard.

##### I-07 | medium | A Preview deployment configured with the production database would migrate production
- Location: `backend/README.md` (Preview env said "same, except the database"), `preview-db.yml` race.
- Evidence: preview builds run the same `vercel-build`, so `prisma migrate deploy` hits whatever `DIRECT_URL` the Preview
  scope holds. `preview-db.yml` writes branch-scoped vars only when `VERCEL_TOKEN` is set, and "the first preview build may
  start before this finishes" (workflow comment); in that window the generic Preview value, if any, wins.
- Status: **fixed (docs)** in README and `RUNBOOKS.md` 3 (check the Vercel scopes). **Proposed (code):** in `vercel-build`,
  refuse to migrate when `VERCEL_ENV=preview` and the target host equals a `SGW_PROD_DB_HOST` variable, or skip
  `migrate deploy` for previews and let `preview-db.yml` do it.

##### I-08 | medium | App rollback is unsafe past migration `20261019120000_community_loop`
- Location: `backend/prisma/migrations/20261019120000_community_loop/migration.sql`.
- Evidence: it makes `CheckIn.userId` and `StatusReport.userId` nullable (anonymous rows) and adds enum values
  (`PointReason`, `SubmissionState`). Older code reading such rows or values can fail. Other migrations are additive or
  backfills; `20261018083422` rebuilds the `SubmissionKind` enum (also not reversible).
- Status: **fixed (docs)**: `RUNBOOKS.md` 2 states the floor. Instant Rollback only moves the pointer; the database stays.

##### I-09 | medium | Nightly backup was unverified, could delete its own last copies, and nobody would notice it stopping
- Location: `backend/.github/workflows/scheduled.yml` (`backup` job).
- Evidence before: no restore test; retention swept everything older than 30 days even if no newer backup existed; no check
  that the dump was complete (a `pg_dump` cut off mid-stream is still valid gzip); no concurrency; no alert on silence.
  Good as it was: `--no-owner --no-privileges` plain dump of the whole database (restorable by any role, includes
  `_prisma_migrations`), `gzip -t`, size floor, private bucket, `DIRECT_URL` (not the pooler), pipefail on.
- Fix: **fixed** (`scheduled.yml`, new `.github/scripts/verify-restore.sh`, README, `RUNBOOKS.md` 6):
  completion-trailer check after the dump; `concurrency: sgw-backup`; retention only touches `sgw-*.sql.gz` and always keeps
  the newest 7 (tested with a synthetic listing); new `verify-backup` job (also runnable alone) downloads the **uploaded**
  object and restores it into a throwaway `postgres:17-alpine`, checks Toilet/Venue/migrations are non-empty, then pings
  `BACKUP_HEARTBEAT_URL` (dead-man's switch) on scheduled runs.
- Residual / open: RPO is up to 24 h (Neon point-in-time restore covers the recent hours; its window on the free plan is
  short); backups hold PII (emails, Google subject ids, device ids, Telegram chat links), so a deleted account stays in
  backups up to 30 days, which `/privacy` should say; restoring on Neon itself is untested (needs your account): do one
  drill and fill in the log in `RUNBOOKS.md` 6; photos are not backed up (R2 is the only copy); the R2 backup token should be
  scoped to the backup bucket only.

##### I-10 | medium | GitHub disables scheduled workflows after 60 days without repository activity
- Location: `scheduled.yml` header comment only mentioned it.
- Evidence: the backup, maintenance and imports would stop silently on a quiet repo.
- Status: **fixed (partly)**: `BACKUP_HEARTBEAT_URL` dead-man's switch (the dependable one), weekly best-effort `keepalive`
  job that re-enables the workflow through the API (a documented community workaround, not a GitHub guarantee), and
  `.github/dependabot.yml` (weekly Actions updates also create repository activity). **Owner action:** create the heartbeat
  check (healthchecks.io: period 1 day, grace 3 hours) and store its URL as the secret.

##### I-11 | medium | Vercel deploys on push regardless of CI
- Location: both `vercel.json`.
- Evidence: no gate; a red `main` still deploys.
- Status: **fixed (opt-in)**: `ignoreCommand` runs `.github/scripts/vercel-ignore-build.mjs` (both repos). Always on: skip builds
  whose diff since the last successful build is only docs/CI/tests. Opt-in (`SGW_REQUIRE_CI=1` in Production env): wait up to 10
  minutes for the commit's GitHub Actions check runs, cancel the production build if one failed, fail open on timeout or API
  error, `[skip-ci-gate]` in the commit message bypasses. Tested locally against a mock GitHub API (green / red / none yet /
  403 / bypass / preview scope) and a throwaway git repo (docs-only diff skips; code diff, missing or bogus previous SHA,
  same commit all build). Caveats: Hobby has one build at a time so a waiting gate queues behind itself; I could not verify
  here whether a dashboard Redeploy or `vercel --prod` evaluates the ignore step (believed not for CLI deploys). The simpler,
  equivalent control is branch protection on `main` requiring the CI check; that is a GitHub setting the owner must switch on.

##### I-12 | medium | Placeholder or missing production config is accepted silently by the API
- Location: `backend/src/config/env.ts`, `src/media/media.service.ts` (`createStorageFromEnv`), `src/media/storage.ts` (`publicUrl`).
- Evidence: `.env.example` ships `AUTH_SECRET=change-me-to-a-long-random-string` (33 chars) and `CRON_SECRET=change-me`; both pass
  validation (`min(16)`, any non-empty), so copying the example into Vercel makes sessions forgeable and the cron endpoints
  guessable. `PUBLIC_APP_URL` defaults to `http://localhost:3000` (OAuth redirect and every bot link would point at localhost
  with no error). If any of `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` is missing the API silently selects
  `LocalStorage` (writes under `uploads/` on a read-only serverless filesystem: uploads 500); with `S3_ENDPOINT` set but
  `S3_PUBLIC_URL` unset, stored photo URLs are `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`, which is the
  private API endpoint, not a public URL.
- Status: **proposed** (code, `env.ts`): when `NODE_ENV=production` refuse to boot on: known placeholder `AUTH_SECRET`/`CRON_SECRET`
  values, `PUBLIC_APP_URL`/`FRONTEND_ORIGIN` containing `localhost`, partial S3 configuration, `S3_ENDPOINT` without `S3_PUBLIC_URL`.
  `.env.example` comments now say which values are required in production.

##### I-13 | medium | Frontend silently falls back to `http://localhost:4000` when `API_ORIGIN` is unset
- Location: `frontend/next.config.ts:8`, `frontend/lib/api/server.ts:9`.
- Evidence: no error at build or boot; a production project missing the variable rewrites `/api/*` to localhost (502s) and
  server components show "The API is unreachable right now."
- Status: **proposed** (code): throw at build when `VERCEL_ENV==='production'` and `API_ORIGIN` is unset. README and
  `.env.example` now say it is required.

##### I-14 | medium | Rate-limit identity behind the rewrite may collapse all users into one bucket (needs live verification)
- Location: `backend/src/common/throttle.ts` (`clientIp`: `x-real-ip`, then first `x-forwarded-for`, then `req.ip`).
- Evidence: browsers reach the API through the frontend's server-side rewrite, i.e. the API's immediate client is the first
  Vercel project, not the visitor. Vercel sets/overwrites `x-forwarded-for` and `x-real-ip` per hop to protect against
  spoofing, so on the second hop they may carry the proxy's address. If so, every anonymous visitor shares `ip:<proxy>` and its
  120 req/min default and the per-IP daily limiters (anonymous check-ins, recommend 20/min). Signed-in users are unaffected
  (keyed on user id). Not confirmed: needs two clients on different networks calling `https://<site>/api/health` and
  comparing `X-RateLimit-Remaining` (a shared counter proves it). Telegram is unaffected (calls the API directly, not throttled).
- Status: **proposed / verify**. If confirmed: forward the visitor address explicitly from the frontend rewrite (a header the API
  trusts only when it arrives with a shared secret), or key anonymous limits on the signed device cookie.

##### I-15 | medium | R2 CORS, public URL and lifecycle: what the code assumes vs what the docs said
- Location: `backend/README.md` R2 section; `src/media/media.service.ts`, `storage.ts`.
- Evidence: the browser PUTs to the presigned R2 URL from the **site origin** with only a `Content-Type` header
  (`lib/api/client.ts putUpload`); the documented CORS rule listed `https://<frontend>.vercel.app` and localhost, not the
  production domain, so uploads would fail in the browser while the API looks healthy. `r2.dev` public URLs are rate limited
  and meant for development. The `tmp/` lifecycle rule is the only cleanup of abandoned uploads (the app deletes `tmp/` objects
  it confirms or rejects, nothing else) and `Photo` rows with `confirmed = false` are never purged (I-28). Public objects are served with
  `Cache-Control: public, max-age=31536000, immutable`.
- Status: **fixed (docs)**: README R2 section now lists `https://shitgowhere.com` in `AllowedOrigins`, recommends a custom
  domain for `S3_PUBLIC_URL`, and states the lifecycle dependency. **Owner action:** apply the CORS JSON and the 7-day `tmp/`
  rule in the Cloudflare dashboard and verify with a real upload from `https://shitgowhere.com`.

##### I-16 | medium | No cache headers on `nearby` / `in-bounds`: every map move is a function invocation plus six queries
- Location: `backend/src/toilets/toilets.controller.ts`; no `Cache-Control` anywhere except media.
- Evidence: responses have only a weak `ETag` and `Vary: Origin`; Vercel will not CDN-cache them. Nearby is about 29 KB of
  JSON. At 16 rps that is 16 invocations and about 100 queries per second against Hobby and Neon free allowances.
- Status: **proposed** (code): `Cache-Control: public, s-maxage=30, stale-while-revalidate=120` on read-only list routes, with
  the client rounding coordinates to about 100 m so the cache key repeats; keep `private` on anything user-specific.

##### I-17 | medium | Google OAuth consent screen state unknown (testing mode caps users at 100)
- Location: Google Cloud console (owner); `backend/src/auth/auth.service.ts` builds `PUBLIC_APP_URL + /api/auth/callback`.
- Evidence: cannot be read from the repo. In *Testing* only listed test users can sign in and the app shows as unverified.
- Status: **proposed (owner check)**; how to check is now in README "Google OAuth": Google Auth Platform -> Audience ->
  Publishing status must be *In production*; JS origin `https://shitgowhere.com` and redirect
  `https://shitgowhere.com/api/auth/callback` registered; `PUBLIC_APP_URL` equal to that origin; consent-screen name, logo,
  support email, homepage and privacy-policy link match the site. Scopes `openid email profile` need no verification review.

##### I-18 | low | Photo takedown is best effort and approved photos have no UI
- Location: `backend/src/admin/admin.service.ts` `rejectPhoto`, `src/media/media.service.ts` `deletePhotoObjects`.
- Evidence: object deletion failures are only logged (`Failed to delete ...`) and the DB row is deleted regardless, leaving a
  publicly reachable, now unreferenced object. `/admin` lists only unapproved photos; `POST /admin/photos/:id/reject` does work
  on approved ones (no state check). Objects are served immutable for a year.
- Status: **fixed (docs)**: `RUNBOOKS.md` 7 (find the id from the URL, call the endpoint with a moderator cookie, verify the URL
  returns 404, delete in R2 by hand, purge a CDN). **Proposed (code):** fail the request (or retry) when the R2 delete fails;
  add an approved-photos list with a Remove button.

##### I-19 | medium | No ban mechanism
- Location: `backend/src/admin`, `common/auth/auth.guard.ts`.
- Evidence: no ban flag or endpoint. `User.deletedAt` makes every request treat the user as signed out and Google re-login
  does not clear it, so it works as a ban (checked in `loadUser` and `upsertGoogleUser`; SQL tested in a rolled-back
  transaction). It bans the account only; a new Google account or anonymous device continues.
- Status: **fixed (docs)**: `RUNBOOKS.md` 8 with SQL, limits and un-ban. **Proposed (code):** a `bannedAt` column and
  `POST /admin/users/:id/ban`.

##### I-20 | low | `AUTH_SECRET` is the HMAC key for sessions, anonymous cookies and Telegram pseudonymous ids
- Location: `common/auth/session.ts`, `anon.ts`, `analytics/analytics.ts` (`hashTelegramId`).
- Evidence: rotating it signs everyone out, orphans banked anonymous points and changes every unlinked Telegram chat's
  `deviceId` (daily caps restart, banked points cannot link). That makes rotation after a leak costly.
- Status: **fixed (docs)**: effects table in `RUNBOOKS.md` 4. **Proposed (code):** a separate `IDENTITY_SECRET` for the
  pseudonymous ids so session-secret rotation stays cheap.

##### I-21 | low | README said admins are promoted "on first login"; it happens at every login
- Location: `auth.service.ts upsertGoogleUser` (`admin && existing.role !== ADMIN` -> ADMIN on each login).
- Status: **fixed (docs)**: README and `.env.example`; `RUNBOOKS.md` 8 explains demotion (remove from `ADMIN_EMAILS`, redeploy,
  then change the role).

##### I-22 | low | OneMap credential or token failure is silent to users and to you
- Location: `backend/src/routing/onemap.service.ts`.
- Evidence: token (3 days) cached in `KeyValue('onemap:token')`, refreshed 30 min before expiry, one retry on 401/403, 4 s
  timeouts, never throws. Failure returns `null` and callers fall back to straight-line estimates; the only trace is a
  `Logger.warn`. Each `recommend` makes up to 3 route calls (10-minute cache by coordinates rounded to 4 decimals). No
  cross-instance lock, so cold instances can each fetch a token (harmless). Search needs no token. Quota under launch traffic:
  about 3 calls per recommend at 10% of requests is roughly 5 calls/second at 16 rps; confirm OneMap's current limit.
- Status: **fixed (docs)** (README OneMap, `RUNBOOKS.md` 1 and 10). **Proposed (code):** count failures and surface
  `routing: degraded` in a readiness route; alert when the rate exceeds a threshold.

##### I-23 | low | Query scale notes (no missing index)
- Location: `toilets.service.ts` (`leaderboard`, `inBounds`), `gamification.service.ts` (`topUsers`, `leaderboard`).
- Evidence: see the plans above. Toilet leaderboard reads every scored ACTIVE toilet and all their surveys per request, uncached.
  `inBounds` caps at 3,000 ordered by `id`, so an over-full viewport shows an arbitrary subset (the client should zoom-gate or the
  API order by score). "My rank" re-aggregates the ledger on every request for a signed-in user outside the top 100.
- Status: **proposed** (code): cache the leaderboards for a minute, add `take`, order `inBounds` by relevance, cache the rank.

##### I-24 | info | Prisma pool settings: already improved in the working tree
- Location: `backend/src/prisma/prisma.service.ts` (uncommitted edit by another agent: `connectionTimeoutMillis: 10_000`,
  `attachDatabasePool`, `disposeExternalPool`).
- Status: noted, no action from me. Make sure that edit is committed; the pre-edit code waited forever for a free connection.

##### I-25 | low | Swagger UI and `openapi.json` are public through the rewrite; trailing-slash docs lose their CSS
- Location: `backend/src/app.factory.ts`; `frontend/next.config.ts` rewrite `/api/:path*`.
- Evidence: local: `/api/docs` 200 (Swagger UI works), `/api/openapi.json` 200 (92,724 B), `/api/docs/` serves HTML whose
  `./docs/swagger-ui.css` resolves to `/api/docs/docs/swagger-ui.css` (404); "Try it out" targets `<site>/health` because the
  spec has no `servers` entry for `/api`. The contract is public by design (plan §5 asks to decide).
- Status: **proposed**: decide; if kept, add `servers: [{ url: '/api' }]` to the OpenAPI document; if not, disable `SwaggerModule`
  when `NODE_ENV=production` (the committed `openapi.json` already feeds the frontend client).

##### I-26 | low | CI: frontend built twice, no Next cache, no audit step
- Location: `frontend/.github/workflows/ci.yml`, `frontend/playwright.config.ts` (`webServer.command = pnpm build && ...`).
- Evidence: the `Build` step and Playwright's `webServer` both run `next build`. `pnpm audit --prod` on the committed lockfile
  reported **1 critical** (`maplibre-gl` 5.24.0, GHSA-jrc7-96c5-q579, fixed in 6.4.1); the working tree bumps it to 6.12.0 (that
  change must be committed with its lockfile). Backend audit: clean.
- Status: **fixed (partly)**: `.next/cache` cached with a source-hash key, new non-blocking `audit` job in both repos (`pnpm audit
  --prod --audit-level high`, `continue-on-error`). **Proposed:** drop the duplicate build (Playwright `webServer.command` should only
  serve; or remove the standalone Build step). Note that the working-tree `components/map/ToiletMap.tsx` uses `map.isEasing()`, which
  fails typecheck against `maplibre-gl` 6.x types in a copy I built (`TS2339`): check CI after the bump.

##### I-27 | low | Workflow hygiene
- Evidence and status: actions are pinned to major tags (`actions/checkout@v7`, `pnpm/action-setup@v6`, ...), not commit SHAs. I
  could not resolve SHAs (GitHub API blocked from here), so **proposed**: pin by SHA once resolvable; **fixed:** Dependabot keeps the
  tags current (`.github/dependabot.yml`, weekly, grouped). **Fixed:** `persist-credentials: false` on every `actions/checkout`
  (nothing pushes); `preview-db.yml` jobs skip fork PRs (no secrets there, avoids a red check); permissions are already
  `contents: read` at workflow level; `monthly-gate` got a timeout; the DB URL in `preview-db.yml` goes through `--value` on a
  command line (masked in logs, visible in `ps` on the runner): acceptable on ephemeral runners. CI concurrency
  (`cancel-in-progress` per ref) and pnpm caching via `setup-node cache: pnpm` already exist; the scheduled imports use
  `cancel-in-progress: false` correctly. Playwright traces are uploaded on failure (14 days).

##### I-28 | low | Abandoned uploads leave rows and objects
- Location: `media.service.ts presign`, `admin.service.ts runJob` (job names: expire-submissions, archive-status,
  recompute-scores, metrics).
- Evidence: `presign` creates a `Photo` row with `url = ''` immediately; unconfirmed rows are never purged, and `tmp/` objects rely
  on the lifecycle rule (I-15).
- Status: **proposed** (code): add a nightly `purge-unconfirmed-photos` job (rows older than 1 day with `confirmed = false`).

##### I-29 | info | Cold start, region alignment and timings
- Region alignment is correct everywhere in the repo: both `vercel.json` have `regions: ["sin1"]`; Neon is documented as
  `ap-southeast-1`; R2 has an APAC hint; OneMap and Telegram are reached from sin1; PostHog EU is reached through the frontend
  rewrite (async, off the critical path). Hobby allows one region, which this uses.
- Local numbers (above) are an upper-bound sketch, not a measurement of Vercel. Function size: heaviest deps are `@prisma/client`
  (71 MB installed incl. generated runtime), the `prisma` CLI (41 MB, listed under dependencies because the build needs it, so it
  can be traced into the function), `sharp` + libvips (19 MB) and the AWS SDK (4.5 MB); check "Function size" in the Vercel build
  output stays well under 250 MB. Re-measure the cold-start spread with the probe script right after a deploy and after 15 quiet
  minutes (plan §3.5).

##### I-30 | low | Hobby has no log retention for forensics; runbooks account for it
- Evidence: about one hour of runtime logs; Log Drains are a paid feature. `RUNBOOKS.md` 1 tells the on-call to copy evidence
  immediately. Error tracking (I-03) is the real fix.
- Status: **fixed (docs)**.

##### I-31 | low | Docs drift: env tables and deploy notes
- Evidence: README env tables lacked `POSTHOG_KEY/HOST`, `DATABASE_URL_UNPOOLED`, `SHADOW_DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_POSTHOG_KEY`; claimed `SENTRY_DSN` optional (it does nothing); R2 CORS lacked the
  production origin; admin promotion wording; frontend Vercel table had two rows.
- Status: **fixed** in both READMEs and both `.env.example` files.

#### Runbooks delivered

`/home/user/backend/docs/RUNBOOKS.md`: incident triage, roll back a deploy, migration-succeeded-build-failed forward-fix,
rotate `AUTH_SECRET` (with the three side effects), rotate the Telegram secret (and token), restore a backup (Neon PITR and
dump restore into a new database with cut-over, verified commands), take down a photo, ban a user, pause the bot, routine
secret rotation table. Each step was checked against `src/` (guards, CLI `telegram:setup --delete`, admin endpoints,
`deletedAt` handling) or run locally (dump/restore, SQL in a rolled-back transaction, CLI env validation).

#### What I could not do

- Live probes (I-01), any Neon, Vercel, Cloudflare or Google console check, a real restore on Neon, a Docker run of the
  restore verifier, and resolving action SHAs. Each is listed with the exact command or setting for the owner above.


---

## E. Legal, privacy and content (plan §10)

Audited: frontend `claude/production-readiness-audit-k5u4nh` and backend (same branch), 20 Oct 2026.
`pnpm lint` and `pnpm typecheck` are green in /home/user/frontend after my edits.

#### Summary

- Counts (L-01 to L-15 plus the missing terms): 1 high, 8 medium (including missing terms), 7 low. Fully fixed in text: L-09, L-10, L-11, L-12 and terms. Disclosure fixed but code or ops change still open: L-02, L-04, L-07, L-08. Open only: L-01, L-03, L-05, L-06, L-13, L-14, L-15.
- The privacy page was mostly accurate on cookies, PostHog, Telegram and check-in distances. It was missing or wrong on:
  OneMap data sharing, retention, what account deletion leaves behind, who can see pending photos, and IP handling. All now corrected.
- There was no terms-of-use text at all. Added `/terms`, linked from `/about` and `/privacy`, added to the sitemap.
- Biggest open risks: no guaranteed contact address for data and takedown requests (env var unset = no route at all), no way to report or remove a review or photo (flags are toilet-level only), account deletion keeps free text and the position of submissions, and the brand name will need a deliberate answer for Google brand verification and app stores.

#### Claim on page vs what the code does

| Claim (page) | Code | Verdict |
|---|---|---|
| Session cookie `sgw_session`, no ad cookies | httpOnly, lax, 30 days (`session.ts`); also `sgw_oauth` 10 min during login (`auth.service.ts`) | OK; `sgw_oauth` was unmentioned, now added |
| Anon cookie `sgw_anon`, random id, up to a year, removed on sign-in | UUID+HMAC, 365 d, cleared by `mergeAnonymous` (`anon.ts`, `auth.controller.ts`) | OK |
| Anon check-in/report "stores only your distance" | CheckIn stores `distanceM`; StatusReport stores no distance or coordinates | Imprecise for reports; fixed |
| Check-ins keep only distance; coordinates used once for the 150 m check | `CheckIn.distanceM` only; `verify` uses lat/lng transiently | OK |
| Submissions keep "the position you were standing at" | `Submission.submittedLat/Lng` | OK, but survives account deletion (L-02) |
| PostHog EU, no replay, no autocapture, DNT/GPC honoured, URLs scrubbed | `lib/analytics.ts` matches; `/ingest` rewrite to eu.i.posthog.com; server uses `disableGeoip` | OK |
| "Never ... IP-based location" | Geo lookup is off, but PostHog still receives the IP via the rewrite | Reworded to say IP is seen, lookup off (L-07) |
| Server events (checkin, review, vote, ...) | Sent from backend with user id / device id / `tg:` hash, rounded distance | Was undisclosed; now stated |
| Route start counted per toilet per day, no who | `ToiletRouteDaily` only; IP kept in memory for a daily limiter | OK; in-memory IP limiter now disclosed |
| Telegram keeps chat id, type, filters, timestamps, linked user id | `TelegramChat` model matches; no names or text stored | OK |
| `/stop` deletes the chat record; `/unlink`; account deletion removes link | `chats.remove`, `unlink`, `deleteMe` clears link | OK. Also true and now stated: bot removed/blocked deletes the record. Contributions made via the hashed id stay |
| Unlinked chat contributions use scrambled id | `hashTelegramId` HMAC keyed on AUTH_SECRET | OK |
| Photos: EXIF stripped in browser | `lib/image.ts` canvas re-encode; server also re-encodes with sharp (metadata dropped) at confirm | OK; server step now stated |
| "Photos are hidden until a moderator or trusted members approve" | Public toilet page and reviews filter `approved: true`. But `GET /submissions/queue` and `/submissions/:id` return `confirmed` photos (approved or not) to any signed-in user | Overstated; fixed (L-04) |
| Data stored in or near Singapore (Vercel, Neon, R2) | Not verifiable from code; deployment setting | Not checked; operator must confirm regions |
| Delete my account: removes profile, email, points, badges; contributions stay anonymised | `deleteMe` also deletes check-ins; keeps reviews, photos, submissions (+lat/lng), votes, status reports, flags (free text), confirmations | Understated what stays; fixed (L-02) |
| Location sent only as part of the search | Also sent to OneMap (route start and end, place search text); tiles load from OneMap directly in the browser | Undisclosed; fixed (L-09) |
| (absent) retention | Sessions 30 d, anon cookie 1 y, status reports purged ~7 d after expiry (nightly job), backups 30 d, GPS fix reused for 30 min, add-form draft 6 h | Added section |
| Contact email via `NEXT_PUBLIC_CONTACT_EMAIL` | Optional; unset hides every email line | Open (L-01) |

#### Findings

##### L-01 High: no guaranteed route for data requests or content takedown
- Location: `frontend/lib/site.ts` (`CONTACT_EMAIL`), `app/privacy/page.tsx`, `app/about/page.tsx`, `.env.example`.
- Evidence: `CONTACT_EMAIL` is `null` unless `NEXT_PUBLIC_CONTACT_EMAIL` is set at build time. When null, `/privacy` points to `/about#contact`, and that section shows only "Report it / Suggest an edit" (toilet-level). A person cannot reach a human to ask for access, correction, deletion help, or to report a review or photo. PDPA expects business contact information to be available.
- Status: proposed (ops). Set `NEXT_PUBLIC_CONTACT_EMAIL` (a forwarding alias) in the Vercel production env and redeploy before launch. Consider a build check that fails a production build when it is unset. Text on all three pages is ready for it.

##### L-02 Medium: account deletion is partial and does not cascade through contributions
- Location: `backend/src/users/users.service.ts` `deleteMe`; `prisma/schema.prisma`.
- Evidence: deletes check-ins, points, badges, Telegram link, and blanks email, googleSub, handle, avatarUrl, displayName. It keeps Review (free-text comment), Photo, Submission (with `submittedLat/Lng` and payload), SubmissionVote (comment), Flag (reason text), StatusReport, StatusConfirmation, PhotoApproval, all pointing at the retained "Deleted user" row. There is no data export endpoint. The plan item "cascades (reviews, photos, points, Telegram link)" is only half true by design.
- Status: page text fixed to say exactly this (privacy "Deleting your account" and "How long we keep things"). Code proposal: in `deleteMe`, null `Submission.submittedLat/Lng`, blank `Flag.reason` and `SubmissionVote.comment`, and either delete the user's Reviews or offer "also delete my reviews and photos" (delete R2 objects via `MediaService.deletePhotoObjects`). Optional `GET /me/export` returning the user's own rows as JSON.

##### L-03 Medium: no report/takedown path for reviews and photos, no review deletion by anyone
- Location: `backend/src/flags/flags.controller.ts` (flags only at `toilets/:id/flags`), `reviews.controller.ts` (create/list only), `admin.controller.ts`; frontend `FlagButton`/`ReportButton` are toilet-level.
- Evidence: review text (max 1000 chars, trimmed, no content filter) appears immediately. Nobody (author, moderator, admin) has an endpoint to edit or delete a review; authors can only overwrite theirs (upsert). Authors cannot delete their own photos. Moderators can only delete photos through `POST /admin/photos/:id/reject`, which would also work on an already-approved photo by id, but the admin UI lists only pending photos. So an abusive review or a published bad photo can only be removed by editing the database.
- Status: proposed. Add `POST /reviews/:id/flags` and `POST /photos/:id/flags` (or a `targetType` on Flag), `DELETE /admin/reviews/:id`, `DELETE /reviews/:id` for the author, `DELETE /admin/photos/:id` for published photos plus a "published photos" list in `/admin`. Interim mitigation done: Terms and About now tell people to email the contact address with the toilet link (only effective once L-01 is fixed), and an operator needs a runbook for removing a review by SQL.

##### L-04 Medium: unapproved photos are visible to signed-in members through the Kaypoh queue
- Location: `backend/src/submissions/submissions.service.ts` `viewInclude` (photos `where: { confirmed: true }`), `queue()`, `get()`.
- Evidence: `GET /submissions/queue` returns nearby open submissions with their photos whether or not `approved`; `GET /submissions/:id` returns any submission to any signed-in user (ids are cuids, not enumerable, but there is no nearness check). Also the R2 public URL of a pending photo is reachable by anyone who has it (random uuid in key).
- Status: privacy page fixed (Photos section now describes this precisely). Code proposal: decide it is by design (reviewers need to see the photo) and restrict `GET /submissions/:id` to the submitter, moderators, or users within the queue radius; keep private R2 prefix for unapproved photos if stricter handling is wanted.

##### L-05 Medium: public API returns Google profile picture URLs
- Location: `backend/src/toilets/toilet-presenter.service.ts` `toReview` (`user.avatarUrl`), `gamification.service.ts` leaderboard, `toilet.schemas.ts:151`.
- Evidence: unauthenticated `GET /toilets/:id` reviews and the opted-in leaderboard carry `avatarUrl` (a googleusercontent.com link to the person's photo, often a face). The frontend never renders it, but anyone can read the JSON and link the photo to the handle. The privacy page promises no email or real name; the picture is personal data not stated as public.
- Status: proposed. Remove `avatarUrl` from the public review and leaderboard DTOs (and the generated schema), or add it to the privacy page if you intend to show it. I left the page text as "never show your email or real name publicly", which stays true.

##### L-06 Medium: app name and Google OAuth brand verification, app stores
- Location: `backend/src/auth/auth.service.ts` (scope `openid email profile`, `prompt=select_account`), `frontend/app/manifest.ts` (name "Shit Go Where", short_name "ShitGoWhere"), `app/layout.tsx`, `app/opengraph-image.tsx`, `lib/og.tsx`.
- Evidence and risks:
  - The consent screen name is set in Google Cloud Console, not in code. It must match the app name users see. A profanity in the name can be rejected on brand review ("inappropriate" naming, misleading content) and in Apple App Store (1.1) / Google Play objectionable-content review if you ever wrap the PWA.
  - Scopes are non-sensitive, so only brand verification is required, not a security assessment. Needs: a verified authorised domain that you own (`*.vercel.app` cannot be verified; `PUBLIC_APP_URL` and the redirect `/api/auth/callback` must be on a custom domain), a homepage URL, and a privacy policy URL linked from the homepage. The home page footer currently links only `/about` (`home-client.tsx:654`); `/privacy` is linked from `/login` and `/me` only.
  - The login page has no link to the terms (`login-client.tsx:181` links only privacy).
  - OG and manifest present the name consistently; nothing misleading. No logo trademark concerns spotted, though the "Happy Toilet (RAS)" name and star ratings are used with no stated permission (see L-13).
- Status: proposed. Decide the brand stance deliberately; if you keep it, use the identical name on the consent screen and expect to explain it; have a fallback name ready (for example "SGW: Singapore toilet finder"). Add `/privacy` and `/terms` links to the home page footer and `/terms` to the login page (files not in my ownership).

##### L-07 Low: PostHog still receives the visitor IP address
- Location: `frontend/next.config.ts` `/ingest` rewrite; `lib/analytics.ts`.
- Evidence: the rewrite forwards the browser request (and its IP) to eu.i.posthog.com. `$geoip_disable` only stops geo enrichment.
- Status: page reworded to say PostHog sees the IP and the lookup is off. Ops: enable "Discard client IP data" in the PostHog project settings, then you may say IPs are not stored.

##### L-08 Low: account deletion does not delete PostHog data
- Location: `users.service.ts` `deleteMe`; no PostHog deletion call.
- Status: page now says events already sent stay under an ID that no longer points to anyone. Optional: call PostHog's person-deletion API from `deleteMe`.

##### L-09 Medium (fixed): OneMap data sharing was undisclosed
- Evidence: map tiles are fetched by the browser from onemap.gov.sg (IP and viewed area visible to OneMap); `OneMapService.search/walk` send typed place text and route start/end coordinates from our server; Telegram free text goes to OneMap search too.
- Fixed: new "Maps, place search and routes (OneMap)" section in `frontend/app/privacy/page.tsx`, plus a line in the Telegram section.

##### L-10 Medium (fixed): no retention statement
- Fixed: added "How long we keep things" to `frontend/app/privacy/page.tsx` (30 d session, 1 y anon cookie, status reports purged about a week after expiry by the nightly `archive-status` job, Telegram record until /stop or removal, 30-day backups from `.github/workflows/scheduled.yml`, 6 h add-form draft, 30-minute GPS reuse).

##### L-11 Low (fixed): inaccurate or missing statements on the privacy page
- Photos "hidden until approved" (L-04 nuance), status reports "store distance", server-side analytics events undisclosed, in-memory IP rate limiting and host logs undisclosed, `sgw_oauth` cookie unmentioned, remembered GPS fix in localStorage (`sgw:fix`) unmentioned, bot removal/blocking deletes the record, private chat id equals Telegram user id, session lifetime. All corrected in `frontend/app/privacy/page.tsx`.

##### L-12 Low (fixed): attribution gaps on About
- `data.gov.sg` entry lacked agencies and the exact required wording ("Contains information from data.gov.sg datasets accessed under the Singapore Open Data Licence version 1.0", per `backend/data/README.md`); Wikidata had no licence link. Fixed in `frontend/app/about/page.tsx`.
- Checked and fine: map shows OneMap attribution always and "© OpenStreetMap contributors" when imported toilets are present (`ToiletMap.tsx:593`), home page and area/station pages carry the ODbL line, toilet pages show `t.attribution`. OneMap logo and SLA credit are present on the map.

##### L-13 Low: provenance of the fieldwork sheet and RAS ratings is not credited
- Location: `backend/data/README.md` ("SMU fieldwork sheet 13-17 Mar 2024", "project's own data"), About page ("Fieldwork survey, March 2024"), `rasStars` display.
- Status: proposed. Confirm you may publish the survey results and the Restroom Association (Singapore) star ratings, and name the survey authors if required.

##### L-14 Low: abandoned uploads rely on a bucket lifecycle rule
- Location: `backend/src/media/media.service.ts` `confirm` comment ("anything left in tmp/ is cleaned by the bucket lifecycle rule").
- Evidence: presign creates raw `tmp/<user>/<id>` objects (client-side EXIF stripping is bypassable by a hand-made request, though `confirm` re-encodes and removes tmp). Unconfirmed objects persist unless the rule exists.
- Status: proposed (ops). Verify the R2 lifecycle rule exists, and add it to the runbook.

##### L-15 Low: shared-phone attribution of anonymous contributions
- Location: `auth.controller.ts` `mergeAnonymous`, `gamification.service.ts` `mergeDevice`.
- Evidence: whoever signs in first on a browser inherits the device's anonymous check-ins and reports and banks their points. Disclosed implicitly ("give you the points when you sign in"). No action beyond awareness.

##### Terms of use (no previous text): fixed
- Added `frontend/app/terms/page.tsx` (plain English, same layout classes as `/privacy`): information can be wrong and 995/999 for emergencies, account rules, contribution licence and conduct (no faces or people in photos, honest check-ins), moderation and reporting, fair use, changes and Singapore law, contact fallback when no email is set. Linked from `/about` footer and `/privacy` footer; added to the sitemap (`app/sitemap.ts` is a static list for pages).
- Not drafted by a lawyer: have counsel read it and add the legal entity name that operates the service. `/privacy` is also absent from the sitemap (low; left alone).

#### What a MODERATOR can and cannot do (for reference)
- Can: view metrics, flags, imports, data-quality; resolve flags; approve or reject submissions (island-wide queue); patch toilets (status including REJECTED, features, labels); approve a photo with a single approval (TRUSTED needs two) and reject (delete) any photo by id.
- Cannot: change roles (ADMIN only), approve their own photo (ADMIN can), delete or edit reviews, delete users, see or act on review/photo reports (none exist). TRUSTED can list and approve pending photos but not reject.

#### Account and data rights summary
- Signed-out person: can browse, check in (5 a day) and report with the `sgw_anon` cookie; points are banked and paid on first sign-in via `mergeDevice`; cannot post photos or reviews. Data remains under a random id if they never sign in; no deletion route other than clearing the cookie (and the id is not linked to a person).
- Signed-in: edit handle and leaderboard/credit toggles, unlink Telegram, delete account (typed DELETE confirmation). No export.
- Proposal for the `/me` delete dialog (`app/me/me-client.tsx`, not my file): align its copy with the privacy page ("check-ins, handle and Telegram link are removed; reviews, photos, edits, reports and votes stay but are no longer linked to you").

#### Files changed
- /home/user/frontend/app/privacy/page.tsx
- /home/user/frontend/app/about/page.tsx
- /home/user/frontend/app/terms/page.tsx (new)
- /home/user/frontend/app/sitemap.ts (one line: `/terms`)


---

## F. Reference inventories (routes, environment variables, dependencies)

Scope: `/home/user/backend` (NestJS API) and `/home/user/frontend` (Next.js), both on branch `claude/production-readiness-audit-k5u4nh`. Read-only: no files in either repo were edited and no state-changing git commands were run. Date of capture: 2026-10-20.

Raw dependency output sits next to this file: `audit-frontend-prod.json`, `audit-frontend.json`, `audit-backend-prod.json`, `audit-backend.json`, `outdated-frontend.txt`, `outdated-backend.txt`.

Row counts: section 1 = 64 route rows. Section 2 = 61 variable rows (backend application 30, backend GitHub 18, frontend 13). Section 3 = 5 tables (advisory summary, advisory detail, two outdated lists, Node versions) plus a patch note.

---

#### 1. API route inventory

##### Global behaviour that applies to every route

- No global route prefix (`backend/src/app.factory.ts`). The browser's `/api` prefix comes from the Next rewrite `/api/:path*` to `${API_ORIGIN}/:path*` (`frontend/next.config.ts:32`).
- `ThrottleGuard` is registered as `APP_GUARD` (`backend/src/app.module.ts:52`). Unless a route or controller has `@Throttle` or `@SkipThrottle`, it allows 120 requests per minute per signed-in user (or per IP when signed out), per route (`common/throttle.ts`, `DEFAULT_LIMIT`). Counters live in memory per serverless instance, so the real limit is per instance, not global.
- `ZodSerializerInterceptor` is registered as `APP_INTERCEPTOR` (`app.module.ts:51`).
- Legend: **AG** = `AuthGuard` (401 when there is no session). **OAG** = `OptionalAuthGuard` (attaches the user if present, never rejects). **RG** = `RolesGuard` with `@MinRole` (403 below the role). **CSG** = `CronSecretGuard` (header `x-cron-secret`).
- Role order: USER < TRUSTED < MODERATOR < ADMIN. A method-level `@MinRole` overrides the class-level one (`RolesGuard` uses `getAllAndOverride([handler, class])`).
- "Frontend reference" = the `api.*` call in `frontend/lib/api/client.ts` (line given), or the call in `frontend/lib/api/server.ts` (marked server.ts). "none" = neither file references it.
- "SW list (by path)" = which list in `frontend/service-worker/sw.js` the path matches, ignoring method. The SW only acts on GET, so POST rows are informational. Server-side reads in `server.ts` go straight to the API and bypass the SW.

##### Routes (64)

| # | Method | Full path | Source (file:line) | Guards and decorators | Params and DTOs | Frontend reference | SW list (by path) |
|---|---|---|---|---|---|---|---|
| 1 | GET | /toilets/nearby | toilets/toilets.controller.ts:23 | none (default throttle) | Query NearbyQueryDto; ZodResponse ToiletSummaryListDto | client.ts:322 | SAVED_API |
| 2 | GET | /toilets/in-bounds | toilets.controller.ts:30 | none (default throttle) | Query InBoundsQueryDto; ToiletPinListDto | client.ts:324 | SAVED_API |
| 3 | GET | /toilets/sitemap | toilets.controller.ts:38 | none (default throttle) | ToiletSitemapDto | server.ts:62 | NETWORK_FIRST_API (matched by the :id regex; not called from the browser) |
| 4 | GET | /toilets/:id | toilets.controller.ts:44 | OAG; CurrentUser optional | Param id; ToiletDetailDto (includes myReview for the signed-in user) | client.ts:326; server.ts:46 | NETWORK_FIRST_API |
| 5 | GET | /leaderboard/toilets | toilets.controller.ts:57 (ToiletLeaderboardController) | none (default throttle) | Query LeaderboardQueryDto (toilets.dto); ToiletLeaderboardDto | client.ts:422 | NETWORK_FIRST_API |
| 6 | GET | /admin/metrics | admin/admin.controller.ts:51 | class: ApiCookieAuth, RG, MinRole MODERATOR | Query MetricsQueryDto; MetricsListDto | none | NEVER |
| 7 | GET | /admin/flags | admin.controller.ts:57 | RG, MODERATOR | Query FlagsQueryDto; AdminFlagListDto | client.ts:426 | NEVER |
| 8 | POST | /admin/flags/:id/resolve | admin.controller.ts:63 | RG, MODERATOR; HttpCode 200 | Param id; AdminOkDto | client.ts:427 | NEVER |
| 9 | GET | /admin/photos/pending | admin.controller.ts:70 | RG, MinRole TRUSTED (method overrides class MODERATOR; intended per API_CONTRACT.md:413) | PendingPhotoListDto | client.ts:428 | NEVER |
| 10 | POST | /admin/photos/:id/approve | admin.controller.ts:77 | RG, MinRole TRUSTED; HttpCode 200 | Param id; PhotoApprovalDto | client.ts:430 | NEVER |
| 11 | POST | /admin/photos/:id/reject | admin.controller.ts:85 | RG, MODERATOR; HttpCode 200 | Param id; AdminOkDto | client.ts:433 | NEVER |
| 12 | PATCH | /admin/toilets/:id | admin.controller.ts:92 | RG, MODERATOR | Param id; Body AdminToiletPatchDto; AdminIdDto | none | NEVER |
| 13 | PATCH | /admin/users/:id/role | admin.controller.ts:98 | RG, MinRole ADMIN | Param id; Body RolePatchDto; RoleResultDto | none | NEVER |
| 14 | GET | /admin/imports | admin.controller.ts:105 | RG, MODERATOR | ImportRunListDto | client.ts:438 | NEVER |
| 15 | GET | /admin/data-quality | admin.controller.ts:111 | RG, MODERATOR | DataQualityDto | client.ts:434 | NEVER |
| 16 | POST | /admin/jobs/:name | admin.controller.ts:126 (AdminJobsController) | class: SkipThrottle, CSG; HttpCode 200; ApiHeader x-cron-secret; name must be in JOB_NAMES or 404 | Param name; JobResultDto | none (GitHub Actions scheduled.yml) | NEVER |
| 17 | GET | /me | users/users.controller.ts:27 | class: ApiCookieAuth, AG | MeDto | client.ts:366 (silent401) | NEVER |
| 18 | PATCH | /me | users.controller.ts:33 | AG | Body UpdateMeDto; MeDto | client.ts:376 | NEVER |
| 19 | DELETE | /me | users.controller.ts:39 | AG; HttpCode 204; clears session cookie | none | client.ts:377 | NEVER |
| 20 | GET | /me/activity | users.controller.ts:48 | AG | Query ActivityQueryDto; ActivityPageDto | client.ts:378 | NEVER |
| 21 | POST | /me/activity/seen | users.controller.ts:55 | AG; HttpCode 200 | ActivitySeenDto | client.ts:380 | NEVER |
| 22 | POST | /me/telegram/link-token | users.controller.ts:63 | AG; Throttle 10 per 60 s; HttpCode 200 | TelegramLinkTokenDto | client.ts:382 | NEVER |
| 23 | DELETE | /me/telegram | users.controller.ts:71 | AG; HttpCode 204 | none | client.ts:383 | NEVER |
| 24 | POST | /routing/started | routing/routing.controller.ts:36 | Throttle 20 per 60 s; HttpCode 200; in-code DailyLimiter 100 per IP per SGT day; anonymous | Body RouteStartedBodyDto; RouteStartedResponseDto | client.ts:356 | none |
| 25 | POST | /routing/recommend | routing.controller.ts:48 | none (default throttle); anonymous | Body RecommendBodyDto; RecommendResponseDto | client.ts:358 | none |
| 26 | GET | /routing/walk | routing.controller.ts:55 | none (default throttle); anonymous; calls OneMap, falls back to a straight-line estimate | Query WalkQueryDto; WalkResponseDto | client.ts:360 | none |
| 27 | GET | /geo/search | routing.controller.ts:80 (GeoController) | none (default throttle); anonymous; calls OneMap | Query GeoSearchQueryDto; GeoSearchResponseDto | client.ts:361 | none |
| 28 | GET | /auth/google | auth/auth.controller.ts:113 | none (default throttle); redirect path validated, 302 | Query GoogleStartQuery | login-client.tsx:69 (navigation, not client.ts) | NEVER |
| 29 | GET | /auth/callback | auth.controller.ts:123 | none (default throttle); state cookie check; 302 to /login on any failure | Query CallbackQuery | none (Google redirect target) | NEVER |
| 30 | POST | /auth/logout | auth.controller.ts:153 | none; HttpCode 204 | none | client.ts:374 | NEVER |
| 31 | POST | /auth/dev-login | auth.controller.ts:161 | Throttle 30 per 60 s; HttpCode 200; 404 unless DEV_LOGIN_ENABLED | Body DevLoginBody; MeDto | client.ts:373 | NEVER |
| 32 | POST | /submissions | submissions/submissions.controller.ts:34 | class: ApiCookieAuth; AG; HttpCode 201 | Body CreateSubmissionSchema via ZodValidationPipe (swagger CreateSubmissionDto); SubmissionViewDto | client.ts:405 | NEVER |
| 33 | GET | /submissions/queue | submissions.controller.ts:53 | AG | Query QueueQueryDto; SubmissionListDto | client.ts:407 | NEVER |
| 34 | GET | /submissions/mine | submissions.controller.ts:60 | AG | SubmissionListDto | client.ts:408 | NEVER |
| 35 | GET | /submissions/:id | submissions.controller.ts:67 | AG | Param id; SubmissionViewDto | client.ts:409 | NEVER |
| 36 | PATCH | /submissions/:id | submissions.controller.ts:75 | AG (owner only, in service) | Param id; Body UpdateSubmissionDto; SubmissionViewDto | client.ts:412 | NEVER |
| 37 | POST | /submissions/:id/votes | submissions.controller.ts:82 | AG; HttpCode 201 | Param id; Body VoteDto; SubmissionViewDto | client.ts:414 | NEVER |
| 38 | POST | /submissions/:id/resolve | submissions.controller.ts:96 | RG, MinRole MODERATOR | Param id; Body ResolveDto; SubmissionViewDto | client.ts:417 | NEVER |
| 39 | GET | /admin/submissions | submissions.controller.ts:114 (AdminSubmissionsController) | class: ApiCookieAuth, RG, MODERATOR | Query ModeratorQueueQueryDto; ModeratorSubmissionListDto | client.ts:437 | NEVER |
| 40 | POST | /toilets/:id/check-ins | gamification/gamification.controller.ts:45 | OAG; ApiCookieAuth; HttpCode 201; signed-out path: DailyLimiter 30 per IP per SGT day plus per-device limit in service | Param id; Body CheckInDto; CheckInResultDto | client.ts:343 | none |
| 41 | POST | /toilets/:id/verify | gamification.controller.ts:67 | AG; ApiCookieAuth | Param id; Body VerifyDto; OkDto | client.ts:345 | none |
| 42 | GET | /me/passport | gamification.controller.ts:75 | AG; ApiCookieAuth | PassportDto | client.ts:384 | NEVER |
| 43 | GET | /leaderboard/users | gamification.controller.ts:83 | OAG | Query LeaderboardQueryDto (gamification); LeaderboardDto | client.ts:421 | NETWORK_FIRST_API |
| 44 | GET | /badges | gamification.controller.ts:90 | OAG (earned flags are per user) | BadgeListDto | client.ts:423 | NETWORK_FIRST_API |
| 45 | GET | /toilets/:id/reviews | reviews/reviews.controller.ts:20 | none (default throttle) | Param id; Query ReviewListQueryDto; ReviewPageDto | client.ts:328 | NETWORK_FIRST_API |
| 46 | POST | /toilets/:id/reviews | reviews.controller.ts:26 | AG; ApiCookieAuth sgw_session; HttpCode 201 | Body CreateReviewDto; ReviewDto | client.ts:330 | NETWORK_FIRST_API (POST is never acted on by the SW) |
| 47 | POST | /media/presign | media/media.controller.ts:54 | AG; ApiCookieAuth; Throttle 30 per 60 s; HttpCode 200 | Body PresignDto; PresignResultDto | client.ts:388 | NEVER |
| 48 | PUT | /media/:id/upload | media.controller.ts:65 | AG; Throttle 30 per 60 s; HttpCode 204; dev only (404 unless local storage); raw body capped at MAX_UPLOAD_BYTES (5 MB) | Param id; raw body | reached through the uploadUrl returned by presign (client.ts:399), not a literal path | NEVER |
| 49 | POST | /media/:id/confirm | media.controller.ts:78 | AG; ApiCookieAuth; HttpCode 200 | MediaPhotoRefDto | client.ts:390 | NEVER |
| 50 | GET | /media/files/*key | media.controller.ts:88 | none; ApiExcludeEndpoint; dev only (404 unless LocalStorage); key checked by isSafeKey; tmp/ blocked | none | e2e fixture only (e2e/fixtures.ts:239) | NEVER |
| 51 | GET | /stations | stations/stations.controller.ts:12 | none | StationListDto | server.ts:54 | none |
| 52 | GET | /stations/:slug | stations.controller.ts:18 | none | StationDetailDto | server.ts:56 | none |
| 53 | GET | /leaderboard/lines | stations.controller.ts:26 (ApiTags leaderboard) | none | LineBoardDto | server.ts:60 | NETWORK_FIRST_API (by path; server-side fetch only) |
| 54 | POST | /integrations/telegram | integrations/telegram/telegram.controller.ts:27 | class: ApiExcludeController, SkipThrottle; HttpCode 200; secret header X-Telegram-Bot-Api-Secret-Token vs TELEGRAM_WEBHOOK_SECRET (503 unset, 401 wrong) | Body unknown (grammy Update) | none (Telegram calls it) | none |
| 55 | GET | /health | health/health.controller.ts:10 | none (default throttle); 503 if the DB query fails | none | none | none |
| 56 | POST | /toilets/:id/flags | flags/flags.controller.ts:20 | AG; Throttle 5 per 60 s; ApiCookieAuth sgw_session; HttpCode 201 | Param id; Body CreateFlagDto; FlagCreatedDto | client.ts:341 | none |
| 57 | GET | /areas | areas/areas.controller.ts:12 | none | AreaListDto | server.ts:49 | none |
| 58 | GET | /areas/:slug | areas.controller.ts:18 | none | AreaDetailDto | server.ts:51 | none |
| 59 | GET | /toilets/:id/status | status/status.controller.ts:22 | OAG | Param id; StatusReportListDto | client.ts:331 | NETWORK_FIRST_API |
| 60 | POST | /toilets/:id/status | status.controller.ts:30 | OAG; Throttle 10 per 60 s; ApiCookieAuth sgw_session; HttpCode 201; signed-out path: DailyLimiter 30 per IP per SGT day | Param id; Body CreateStatusDto; StatusReportDto | client.ts:334 | NETWORK_FIRST_API (POST is never acted on by the SW) |
| 61 | POST | /status/:id/confirm | status.controller.ts:51 | AG; Throttle 30 per 60 s; ApiCookieAuth sgw_session | Param id; StatusReportDto | client.ts:339 | none |
| 62 | GET | /venues/nearby | venues/venues.controller.ts:18 | none | Query VenueNearbyQueryDto; VenueNearbyListDto | client.ts:349 | NETWORK_FIRST_API |
| 63 | GET | /venues/search | venues.controller.ts:24 | none | Query VenueSearchQueryDto; VenueLiteListDto | client.ts:351 | NETWORK_FIRST_API |
| 64 | GET | /venues/:id | venues.controller.ts:31 | none | Param id; VenueDetailDto | none | NETWORK_FIRST_API |

Totals: 64 routes across 16 controller files. Methods: 35 GET, 22 POST, 4 PATCH, 2 DELETE, 1 PUT (sum 64).

Reconciliation: the grep of `@Get|@Post|@Put|@Patch|@Delete` across `*.controller.ts` returns 64 decorator lines, matching the 64 rows above. Routes with no frontend caller in `client.ts` or `server.ts`, and no other frontend reference: #6, #12, #13, #16, #29 (by design), #50 (dev only), #54, #55, #64. Route #28 and #48 are reached by navigation and by the presigned upload URL respectively.

---

#### 2. Environment variable parity

Columns: "Read in code" lists the reading file and line. ".env.example" and "README" give the presence and line. "CI" is the GitHub workflow that sets or reads the name. "Vercel docs" is the README deployment material: "table" = the README env table (production column) or the deployment table; "prose" = mentioned in the deployment prose only; "no" = absent.

##### 2a. Backend: read by the application or its CLI

| Name | Repo | Read in code | .env.example | README | CI workflow | Vercel docs | Notes |
|---|---|---|---|---|---|---|---|
| NODE_ENV | backend | src/config/env.ts:14; auth/auth.controller.ts:60; common/auth/session.ts; common/auth/anon.ts | yes (L6) | yes (L103) | ci.yml:56 test; scheduled.yml:138 production | table | Vercel sets production (README L103). |
| PORT | backend | src/config/env.ts:15; src/main.ts | yes (L5) | yes (L102) | ci.yml:60 | table | Not needed on Vercel. |
| DATABASE_URL | backend | env.ts:16; prisma/prisma.service.ts; src/imports/lib/db.ts:14; prisma.config.ts:15 | yes (L2) | yes (L100) | ci.yml:57; preview-db.yml:78 (Neon output); scheduled.yml:139 (from secret DIRECT_URL) | table | Pooled URL in production. |
| DIRECT_URL | backend | env.ts:17 (optional, not otherwise validated); src/imports/lib/db.ts:14; prisma.config.ts:15 | yes (L4) | yes (L101) | ci.yml:58; preview-db.yml:79; scheduled.yml:86, 140 | table | Migrations, seed and CLI use it. |
| DATABASE_URL_UNPOOLED | backend | src/imports/lib/db.ts:14 (fallback); prisma.config.ts:15 (fallback) | no | no in the table; prose only (L200) | no | prose | Read but not in env.ts, not in .env.example, not in the table. The Neon integration injects it. |
| SHADOW_DATABASE_URL | backend | prisma.config.ts:16 (raw process.env) | no | no | ci.yml:59 | no | Read but undocumented; not in env.ts. Used by the drift guard. |
| FRONTEND_ORIGIN | backend | env.ts:18; src/app.factory.ts:14 | yes (L7) | yes (L104) | ci.yml:61 | table | CORS for Swagger and local tools only. |
| PUBLIC_APP_URL | backend | env.ts:20; auth/auth.service.ts; auth/auth.controller.ts:70; integrations/telegram/telegram.service.ts; commands.ts | yes (L9) | yes (L105) | ci.yml:62 | table | OAuth redirect and Telegram deep links are built from it. |
| AUTH_SECRET | backend | env.ts:21 (min 16); common/auth/session.ts; common/auth/anon.ts; auth/auth.service.ts; analytics/analytics.service.ts:46 | yes (L10) | yes (L106) | ci.yml:63 (placeholder); scheduled.yml:142 (placeholder); preview-db.yml:89 (placeholder) | table | Also keys the hash of Telegram chat ids (analytics.service.ts:44-46), so rotating it changes stored hashes. |
| GOOGLE_CLIENT_ID | backend | env.ts:22; auth/auth.service.ts | yes (L11) | yes (L107) | no | table | |
| GOOGLE_CLIENT_SECRET | backend | env.ts:23; auth/auth.service.ts | yes (L12) | yes (L107) | no | table | |
| ONEMAP_EMAIL | backend | env.ts:24; routing/onemap.service.ts | yes (L13) | yes (L108) | scheduled.yml:143 (secret) | table; GitHub secret table | |
| ONEMAP_PASSWORD | backend | env.ts:25; routing/onemap.service.ts | yes (L14) | yes (L108) | scheduled.yml:144 (secret) | table; GitHub secret table | |
| S3_ENDPOINT | backend | env.ts:26; media/media.service.ts | yes (L16) | yes (L109) | no | table | Omit for AWS S3. |
| S3_REGION | backend | env.ts:27 (default auto); media/media.service.ts | yes (L17) | yes (L110) | ci.yml:67 | table | |
| S3_BUCKET | backend | env.ts:28; media/media.service.ts | yes (L18) | yes (L111) | no | table | |
| S3_PUBLIC_URL | backend | env.ts:29; media/media.service.ts | yes (L19) | yes (L112) | no | table | |
| S3_ACCESS_KEY_ID | backend | env.ts:30; media/media.service.ts | yes (L20) | yes (L113) | no | table | |
| S3_SECRET_ACCESS_KEY | backend | env.ts:31; media/media.service.ts | yes (L21) | yes (L113) | no | table | |
| ADMIN_EMAILS | backend | env.ts:32-40 (split and lower-cased); auth/auth.service.ts | yes (L22) | yes (L114) | ci.yml:66 | table | |
| CRON_SECRET | backend | env.ts:41; admin/cron-secret.guard.ts:24 | yes (L23) | yes (L115) | ci.yml:65; scheduled.yml:58 (secret) | table; GitHub secret table | Also used by cron-secret.guard.spec.ts. |
| DEV_LOGIN_ENABLED | backend | env.ts:42 and 69-70 (boot refusal in production); auth/auth.controller.ts:166 | yes (L25) | yes (L116) | ci.yml:64 | table | Boot fails if true in production. |
| SENTRY_DSN | backend | declared in env.ts:43; no reader anywhere in src | yes (L26, empty) | yes (L117, "optional") | no | no | Documented but never read. No Sentry package in package.json. README accounts checklist still asks for a Sentry project (L290). |
| POSTHOG_KEY | backend | env.ts:45; analytics/analytics.service.ts | yes (L28, empty) | no | no | no | Read but undocumented in the README table. |
| POSTHOG_HOST | backend | env.ts:46 (default); analytics/analytics.service.ts | yes (L29, commented) | no | no | no | Read but undocumented in the README table. |
| TELEGRAM_BOT_TOKEN | backend | env.ts:48; users/users.service.ts; integrations/telegram/telegram.service.ts; telegram.module.ts; commands.ts | yes (L32) | yes (L118) | no | table | Unset = bot off, no webhook route. |
| TELEGRAM_WEBHOOK_SECRET | backend | env.ts:50; integrations/telegram/telegram.controller.ts:30; commands.ts | yes (L34) | yes (L119) | no | table | |
| TELEGRAM_BOT_USERNAME | backend | env.ts:52; users/users.service.ts; telegram.service.ts; commands.ts | yes (L36) | yes (L120) | no | table | |
| TELEGRAM_CHANNEL_ID | backend | declared in env.ts:54; no reader | yes (L38, empty) | yes (L121, "unused in v1") | no | no | Documented and declared but never read. |
| TELEGRAM_API_ROOT | backend | env.ts:56; telegram.service.ts; commands.ts | yes (L40, commented) | yes (L122) | no | table ("leave unset") | Tests set it to a local stub (test/telegram.e2e-spec.ts). |

##### 2b. Backend: GitHub Actions variables and secrets (read by workflow shell, not by the app)

| Name | Repo | Read in code | .env.example | README | CI workflow | Vercel docs | Notes |
|---|---|---|---|---|---|---|---|
| API_URL | backend | none (workflow shell) | no | GitHub variable table | scheduled.yml:57 (vars) | no | Set to the API production URL. |
| R2_ACCOUNT_ID | backend | none (workflow) | no | GitHub variable table | scheduled.yml:89 (vars) | no | Builds the R2 endpoint. |
| R2_BACKUP_BUCKET | backend | none (workflow) | no | GitHub variable table | scheduled.yml:88 (vars) | no | |
| R2_BACKUP_ACCESS_KEY_ID | backend | none (workflow) | no | GitHub secret table (combined row) | scheduled.yml:90 (secret, mapped to AWS_ACCESS_KEY_ID) | no | |
| R2_BACKUP_SECRET_ACCESS_KEY | backend | none (workflow) | no | GitHub secret table (combined row) | scheduled.yml:91 (secret, mapped to AWS_SECRET_ACCESS_KEY) | no | |
| PG_DUMP_IMAGE | backend | none (workflow) | no | GitHub variable table | scheduled.yml:87 (vars, default postgres:17-alpine) | no | Must be at least Neon's Postgres major. |
| RETENTION_DAYS | backend | none (workflow constant '30') | no | no (L235 says 30-day cleanup) | scheduled.yml:96 | no | Workflow constant, not a secret or variable. |
| AWS_ACCESS_KEY_ID | backend | none (AWS CLI) | no | no | scheduled.yml:90 | no | Set from R2_BACKUP_ACCESS_KEY_ID. |
| AWS_SECRET_ACCESS_KEY | backend | none (AWS CLI) | no | no | scheduled.yml:91 | no | Set from R2_BACKUP_SECRET_ACCESS_KEY. |
| AWS_DEFAULT_REGION | backend | none (AWS CLI) | no | no | scheduled.yml:92 (auto) | no | |
| AWS_REQUEST_CHECKSUM_CALCULATION | backend | none (AWS CLI) | no | no | scheduled.yml:94 (when_required) | no | Keeps extra checksum headers off for R2. |
| AWS_RESPONSE_CHECKSUM_VALIDATION | backend | none (AWS CLI) | no | no | scheduled.yml:95 (when_required) | no | |
| NEON_API_KEY | backend | none (workflow) | no | GitHub secret table | preview-db.yml:68 (secret) | no | |
| NEON_PROJECT_ID | backend | none (workflow) | no | GitHub variable table | preview-db.yml:67 (vars) | no | |
| VERCEL_TOKEN | backend | none (workflow) | no | GitHub secret table (optional) | preview-db.yml:94, 137 (secret) | no | |
| VERCEL_ORG_ID | backend | none (workflow) | no | GitHub variable table (optional) | preview-db.yml:95, 138 (vars) | no | |
| VERCEL_PROJECT_ID | backend | none (workflow) | no | GitHub variable table (optional) | preview-db.yml:96, 139 (vars) | no | |
| PREVIEW_SEED | backend | none (workflow) | no | GitHub variable table (optional) | preview-db.yml:85 (vars) | no | |

Workflow-internal values (not parity items, not listed as rows): BUCKET, R2_ENDPOINT, FILE, BRANCH_NAME, GIT_BRANCH, VERCEL_CLI, POOLED, DIRECT, BRANCH_ID, HOST, and the `pnpm-version` step output.

##### 2c. Frontend

| Name | Repo | Read in code | .env.example | README | CI workflow | Vercel docs | Notes |
|---|---|---|---|---|---|---|---|
| API_ORIGIN | frontend | next.config.ts:8; lib/api/server.ts:9 | yes (L3) | yes (L32) | ci.yml:27 (http://localhost:4000) | table (production, preview, development) | e2e/serve.mjs:10 overrides it to 127.0.0.1:9 so the mock API is the only one reached. |
| NEXT_PUBLIC_DEV_LOGIN | frontend | app/login/login-client.tsx:14; playwright.config.ts:40 (set to false for e2e) | yes (L19) | yes (L33) | no | table (dev only; unset in production) | Inlined at build time. |
| NEXT_PUBLIC_SITE_URL | frontend | lib/site.ts:6 | yes (L7, commented) | no | no | no | Read but documented only in .env.example. Default falls back to VERCEL_PROJECT_PRODUCTION_URL. |
| NEXT_PUBLIC_CONTACT_EMAIL | frontend | lib/site.ts:14 | yes (L11, commented) | no | no | no | Read but undocumented in README. Inlined at build time. |
| NEXT_PUBLIC_POSTHOG_KEY | frontend | lib/analytics.ts:20 | yes (L15, commented) | no | no | no | Read but undocumented in README. Unset = analytics off. |
| VERCEL_PROJECT_PRODUCTION_URL | frontend | lib/site.ts:7 | prose (L5) | no | no | no | Set by Vercel; mentioned in .env.example prose only. |
| VERCEL_DEPLOYMENT_ID | frontend | next.config.ts:12 | no | no | no | no | Set by Vercel; feeds SGW_BUILD_ID. |
| VERCEL_GIT_COMMIT_SHA | frontend | next.config.ts:12 (fallback) | no | no | no | no | Set by Vercel. |
| SGW_BUILD_ID | frontend | set in next.config.ts:11-15 (env block); read in app/sw.js/route.ts:13 | no | no | no | no | Internal: derived at build time, not an operator setting. Versions the service worker. |
| NODE_ENV | frontend | app/providers.tsx:55 | no | no | no | no | Standard. The dev-only block unregisters any production worker. |
| E2E_PORT | frontend | playwright.config.ts:4 (default 3100) | no | no (README L69 says port 3100 without naming the variable) | no | no | Read but undocumented. |
| CI | frontend | playwright.config.ts:13, 14, 15, 36 | no | no | not set in ci.yml (GitHub sets it) | no | Standard GitHub variable. Enables retries and the GitHub reporter. |
| NEXT_TELEMETRY_DISABLED | frontend | none in app code (read by Next.js) | no | no | ci.yml:28 | no | Set in CI only. |

Frontend totals: 13 rows. Frontend `.env.example` has no names the code does not read. Frontend README table names only API_ORIGIN and NEXT_PUBLIC_DEV_LOGIN, both of which are read.

Backend totals: 30 rows in 2a (application and CLI) and 18 rows in 2b (GitHub). CRON_SECRET and DIRECT_URL are listed once, in 2a, with their workflow usage in the CI column.

Names documented but never read: SENTRY_DSN (backend .env.example L26, README L117), TELEGRAM_CHANNEL_ID (backend .env.example L38, README L121). Both are declared in env.ts.

Names read but undocumented in the README table: DATABASE_URL_UNPOOLED, SHADOW_DATABASE_URL, POSTHOG_KEY, POSTHOG_HOST (backend); NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_CONTACT_EMAIL, NEXT_PUBLIC_POSTHOG_KEY, E2E_PORT (frontend).

---

#### 3. Dependencies

##### 3a. Advisories

Raw output: `audit-frontend-prod.json`, `audit-frontend.json`, `audit-backend-prod.json`, `audit-backend.json` (exit codes: frontend 1 because advisories were found, backend 0).

| Repo | Scope | Critical | High | Moderate | Low | Info | Total |
|---|---|---|---|---|---|---|---|
| frontend | `pnpm audit --prod` | 1 | 0 | 0 | 0 | 0 | 1 |
| frontend | `pnpm audit` (all) | 1 | 1 | 0 | 0 | 0 | 2 |
| backend | `pnpm audit --prod` | 0 | 0 | 0 | 0 | 0 | 0 |
| backend | `pnpm audit` (all) | 0 | 0 | 0 | 0 | 0 | 0 |

Advisories:

| Repo | Severity | Package | Installed | Vulnerable range | Fixed in | Dependency path | Scope | Advisory |
|---|---|---|---|---|---|---|---|---|
| frontend | critical | maplibre-gl | 5.24.0 | <=6.4.0 | >=6.4.1 (a major version above the installed 5.x) | .>maplibre-gl; .>react-map-gl>maplibre-gl; .>react-map-gl>@vis.gl/react-maplibre>maplibre-gl | production (runtime) | GHSA-jrc7-96c5-q579, CWE-79, XSS sanitizer bypass in DOM.sanitize() |
| frontend | high | braces | 3.0.3 | <=3.0.3 | no fixed version listed | .>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces | dev only (lint tooling) | GHSA-vfj7-8cjw-p6xm, stack exhaustion from deeply nested patterns |

No advisories for the backend, production or full.

##### 3b. Packages with a newer major available (pnpm outdated, raw in outdated-*.txt)

Frontend (`outdated-frontend.txt`):

| Package | Current | Latest | Kind | Major change |
|---|---|---|---|---|
| maplibre-gl | 5.24.0 | 6.15.0 | runtime | yes (also the fix for the critical advisory) |
| @types/node | 20.19.43 | 26.6.5 | dev | yes (CI and deploy run Node 24) |
| eslint | 9.39.5 | 10.13.0 | dev | yes |
| typescript | 5.9.3 | 7.0.2 | dev | yes |
| @tanstack/react-query | 5.104.3 | 5.104.4 | runtime | no (patch) |
| react | 19.3.0 | 19.3.1 | runtime | no (patch; pinned exactly in package.json) |
| react-dom | 19.3.0 | 19.3.1 | runtime | no (patch; pinned exactly) |
| lucide-react | 1.58.0 | 1.59.0 | runtime | no (minor) |

Backend (`outdated-backend.txt`):

| Package | Current | Latest | Kind | Major change |
|---|---|---|---|---|
| prisma | 7.10.1 | 8.0.0-rc.23 | runtime (CLI and client, pinned exactly) | yes, and the latest tag is a release candidate |
| @types/node | 24.19.2 | 26.6.5 | dev | yes |
| vitest | 4.1.12 | 5.0.5 | dev | yes |
| @vitest/coverage-v8 | 4.1.12 | 5.0.5 | dev | yes |
| typescript | 6.0.3 | 7.0.2 | dev | yes |
| @nestjs/common | 12.1.3 | 12.2.0 | runtime | no (minor) |
| @nestjs/core | 12.1.3 | 12.2.0 | runtime | no (minor) |
| @nestjs/platform-express | 12.1.3 | 12.2.0 | runtime | no (minor) |
| @nestjs/testing | 12.1.3 | 12.2.0 | dev | no (minor) |

`pnpm outdated` exited 1 in both repos because packages are outdated. Output was captured anyway.

##### 3c. Node versions

| Source | Version | Where |
|---|---|---|
| CI (backend) | 24 | ci.yml:84; scheduled.yml:158, 187, 237; preview-db.yml:60 |
| CI (frontend) | 24 | frontend ci.yml:37 |
| Vercel docs (backend README) | 24.x | README L195 ("Node.js version: 24.x"); L18 requirements "Node 24" |
| Vercel docs (frontend README) | 24.x | README L82; L18 requirements "Node 24" |
| `node --version` in this environment | v22.22.0 | sandbox only |
| package.json engines | not set in either repo | none |
| .nvmrc or .node-version | not present in either repo | none |

The pins agree at Node 24 everywhere in the repos. The sandbox runs Node 22, so the audit and outdated commands above ran on a different major from CI and from the Vercel setting. Dependency results are unlikely to change by Node major, but reproduce on Node 24 before quoting them.

##### 3d. Patches in backend/patches

`backend/patches/nestjs-zod@5.5.0.patch` (65 lines). Registered in `backend/pnpm-workspace.yaml` under `patchedDependencies` (`nestjs-zod@5.5.0`), and pinned by hash in `pnpm-lock.yaml`. Installed copy is under `node_modules/.pnpm/nestjs-zod@5.5.0_patch_hash=406324c9...`.

Header comments in the patch, per file:

1. `dist/dto-CHeB-l1i.mjs` and `dist/dto-sWxCeI9D.cjs` (`openApiMetadataFactory`): zod 4 emits a nullable property as `type: [T, "null"]`. @nestjs/swagger reads any type array as "isArray", so the patch rewrites a type list into `anyOf` before swagger sees it.
2. `dist/index.mjs` (`src/response.ts`): replaces the dynamic `require("@nestjs/swagger")` inside a try block with a static import of `ApiResponse`. The comment says @nestjs/swagger 12 is ESM-only, `require()` of it fails under Vercel's loader (ERR_REQUIRE_ESM), and the failure was silent ("ZodResponse requires @nestjs/swagger to be installed"). A static import also avoids top-level await on cold starts.

Upstream status: the patch comments say "patched (shit-go-where)"; no upstream issue or PR is referenced. The patch key is the exact version 5.5.0, while package.json uses `^5.5.0`. Any nestjs-zod bump must re-verify that the patch still applies and that the generated OpenAPI output is unchanged.

---

#### Observations

Ordered by how much they matter for production readiness. The first five are the ones to act on.

1. **Critical runtime advisory in the frontend.** `maplibre-gl` 5.24.0 (GHSA-jrc7-96c5-q579, XSS sanitizer bypass, CWE-79) is a production dependency, reached through three paths including `react-map-gl`. The fix is in 6.4.1 or later, so it needs a major-version move to 6.x (latest 6.15.0). Neither the frontend CI nor the backend CI runs an audit step.
2. **Personalised responses are cached by the service worker and survive sign-out.** `GET /toilets/:id` returns `myReview` for the signed-in user (toilet-presenter.service.ts:279) and is NETWORK_FIRST in `sw.js` (line 54), so it is stored under `sgw-api-1`. `GET /badges` and `GET /leaderboard/users` are per-user too. Sign-out (`lib/auth.ts` `useSignOut`) calls `api.logout()` and clears TanStack Query state, but not the service-worker caches. Only the non-production branch in `app/providers.tsx:58-61` clears them. On a shared phone, the offline fallback can show the previous user's data.
3. **OneMap-backed endpoints are anonymous and only rate-limited by the default per-instance throttle.** `GET /routing/walk` and `GET /geo/search` (and `POST /routing/recommend`) have no guard and no route-specific throttle, so they get the 120 per minute default, counted in memory per Vercel instance. Those calls spend a shared OneMap account (`ONEMAP_EMAIL` and `ONEMAP_PASSWORD`). A spread of IPs or instances defeats the limit. Consider a shared limiter or a lower route-specific limit.
4. **Config that is documented but dead, or read but undocumented.** `SENTRY_DSN` is declared in `env.ts:43`, listed in `.env.example` and the README, and never read; there is no Sentry package. `TELEGRAM_CHANNEL_ID` is declared and documented as unused. `DATABASE_URL_UNPOOLED` and `SHADOW_DATABASE_URL` are read outside the schema and are not in the README table. `POSTHOG_KEY` and `POSTHOG_HOST` are read but missing from the README table. In the frontend, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL` and `NEXT_PUBLIC_POSTHOG_KEY` are read but missing from the README.
5. **Write endpoints without a route-specific throttle.** `POST /submissions`, `PATCH /submissions/:id`, `POST /submissions/:id/votes`, `POST /toilets/:id/verify` and `POST /toilets/:id/reviews` are authenticated and rely on the 120 per minute default. Abuse is bounded per account, but nothing limits the rate of content creation or voting. Compare `POST /toilets/:id/flags` (5 per minute) and `POST /toilets/:id/status` (10 per minute).
6. **Nine routes have no caller in the frontend.** `GET /admin/metrics`, `PATCH /admin/toilets/:id`, `PATCH /admin/users/:id/role`, `GET /venues/:id`, `GET /health`, `POST /integrations/telegram` (Telegram), `POST /admin/jobs/:name` (GitHub cron), `GET /auth/callback` (Google redirect) and `GET /media/files/*key` (dev only). The ADMIN-only role PATCH has no UI, so confirm whether the admin tools are meant to be API-only or whether a screen is missing.
7. **Intentional role downgrade on photo moderation.** `GET /admin/photos/pending` and `POST /admin/photos/:id/approve` set `MinRole TRUSTED` at method level, overriding the class-level MODERATOR (admin.controller.ts:70-79). API_CONTRACT.md:413 documents this as intended. Worth a reviewer's check that the pending list exposes only the fields it should.
8. **Service-worker regex matches more than intended.** `^/api/toilets/[^/]+$` also matches `/api/toilets/sitemap` (sw.js:54). Harmless, because the browser never calls that path. `/api/leaderboard/` likewise matches `lines`, which the browser never calls either.
9. **Dev login is gated by a flag, not a guard.** `POST /auth/dev-login` has no guard. It checks `DEV_LOGIN_ENABLED` inside the handler (auth.controller.ts:166), and boot refuses that flag when `NODE_ENV` is `production` (env.ts:69-70). Boot protection only works if `NODE_ENV` really is `production` in every deployed environment. Vercel sets it, so this is fine as configured, but it is a single point of failure for the route.
10. **Frontend types target Node 20 while CI and deploy run Node 24.** `@types/node` is `^20` (frontend/package.json), against the Node 24 pin in CI and the README. Low risk, but it means the types do not describe the runtime.
11. **Patch on a pinned exact version.** `nestjs-zod@5.5.0` is patched by hash (`pnpm-workspace.yaml`, `pnpm-lock.yaml`). A routine `^5.5.0` bump needs a manual check that the patch still applies and that the OpenAPI output is unchanged.
12. **Prisma pinned to a pre-release line in outdated output.** `prisma` 7.10.1 is pinned exactly and the latest tag is 8.0.0-rc.23. No action is needed now; plan the move deliberately.
13. **Docs reference files outside this checkout.** Both READMEs link `../PLAN.md`, `../DEPLOY.md` and `../BOT.md` (backend README L8, L9, L126, L178; frontend README L7-8). None of those files is in `/home/user` or in either repo here, so the deployment checklist cannot be followed from these checkouts alone.
14. **Local runtime differs from the pinned Node.** This sandbox runs Node v22.22.0. The repos pin and document Node 24 everywhere. Anything reproduced here (audit, outdated, tests) should be re-run on Node 24 before it is quoted.
