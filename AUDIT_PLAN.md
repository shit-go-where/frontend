# Production readiness audit plan

How we check that Shit Go Where (this frontend plus the `backend` API) is ready for real people,
most of them on a phone with one bar of signal. This is the plan for the audit, not its findings:
each section says what to check, how, and what counts as a pass. Findings go in the log described
in §12 and become issues.

Scope is both repos. Backend items name files under `../backend/`.

## 1. Baseline and prerequisites

Audit a frozen commit, not a moving target.

1. Merge the three open branches first, in this order, and re-run CI on `main` after each:
   - `claude/mobile-animation-bugs-ta1hi8` (frontend: bottom sheet drag ceiling, route
     transitions, tab pill, map padding ease, Safari/Firefox dialog exit, press feedback).
   - `claude/leaderboard-startup-counter-h9vque` (frontend: tab bar held still during re-rank;
     touches the same `globals.css` block, so merge after the one above and check the result).
   - `claude/tele-bot-features-kn7oyo` (backend only: pick-then-act Telegram keyboards that
     edit the message in place, new `p:`, `l:` and `f:*` callback kinds, status picker with
     icons, named Navigate links in groups).

   All three are a single commit ahead of `main` and only the first two touch the same file
   (`app/globals.css`), so expect at most one small conflict.
2. Tag the result (`audit-baseline`) in both repos. Every finding cites that SHA.
3. Deploy that SHA to the production Vercel projects behind the final domain, with production
   env vars in place (`NEXT_PUBLIC_SITE_URL`, `API_ORIGIN`, `PUBLIC_APP_URL`, Google OAuth
   redirect, R2 CORS origin). Most mobile checks only mean something on HTTPS at the real origin.
4. Bring `PLAN.md`, `DEPLOY.md`, `BOT.md` and `GROWTH.md` into a place the auditor can read.
   Both READMEs link to them as `../PLAN.md` etc., but they are in neither repo.

## 2. Device and network matrix

Most traffic will be phones, so the matrix is phone-first. Desktop gets one pass at the end.

| Class | Devices | Browsers | Why |
|---|---|---|---|
| iPhone, current | iPhone 15/16, iOS 18 | Safari, installed PWA, Telegram in-app browser, Chrome iOS | Largest SG share; PWA and cookie behaviour differ from the browser tab |
| iPhone, old | iPhone SE 2 or 11, latest iOS it runs | Safari | Small viewport, slower JS, older WebKit features (View Transitions, `overlay`) |
| Android, current | Pixel 7/8, Samsung S23/S24, Android 14/15 | Chrome, Samsung Internet, installed PWA, Telegram in-app | Samsung Internet has its own dark-mode and gesture quirks |
| Android, low end | A ~S$200 device (Redmi/Galaxy A1x), 3-4 GB RAM | Chrome | MapLibre and photo resize on a weak GPU/CPU |
| Tablet / desktop | iPad, a laptop | Safari, Chrome, Firefox | Layout above the `md` breakpoint, keyboard navigation |

Network profiles, applied with Chrome DevTools throttling and by actually standing on an MRT
platform: good 4G, slow 3G (400 kbps, 400 ms RTT), lie-fi (connected, nothing arrives), offline,
and offline-then-back-online mid-flow.

Each flow in §3 is run on every row of the matrix at least once; the full network set is run on
the two "current" phone rows.

## 3. Mobile experience audit (hands on real devices)

### 3.1 Core flows to walk
- First visit, no account: land, allow location, see nearby toilets, open one, start a route.
- Urgent: home screen shortcut `/go?urgent=1`, three results, route, arrive, "How was it?" card.
- Contribute: `/add` wizard from pin to success, with and without a photo, duplicate detection,
  draft survives a reload and a tab kill.
- Check in and status report, signed out (anonymous device id) and signed in.
- Sign in with Google from a browser tab, from the installed PWA, and from the Telegram in-app
  browser. Sign out. Session still valid after the phone sleeps overnight.
- Leaderboard, profile, badges, Telegram link from `/me`.
- Stations and areas directories, a shared toilet link opened cold (OG image, canonical).

### 3.2 Install and PWA
- `manifest.ts`: install prompt on Android, Add to Home Screen on iOS, icons and maskable icon
  render, shortcuts work, `display: standalone`, start URL, theme colour matches each theme.
- iOS standalone: `black-translucent` status bar is readable in both themes (`status-scrim`),
  safe-area insets on notch and home-indicator phones, no white flash at launch.
- Google OAuth from the standalone app returns to the app, not a stranded Safari tab, and the
  session cookie is visible to the standalone context (iOS partitions them in some versions).
- Update rollout: deploy, reopen the app, confirm the new worker installs and old caches are
  deleted (`service-worker/sw.js` `activate`); no page stuck on an old shell.

### 3.3 Location
- Permission prompt timing and copy; denied and "unavailable" states show the Raffles Place
  fallback and the search box, not a spinner (`lib/location.tsx`).
- Stored fix reuse: age shown when the fix is older than 2 min, refresh after 60 s on return.
- Indoor and underground accuracy: results re-measured when a better fix arrives.
- `watchPosition` on the route screen stops when leaving it (battery), survives screen lock.
- Telegram in-app browser and iOS Chrome: geolocation works or degrades to search.

### 3.4 Offline and weak signal
- With the worker installed: airplane mode, open app, shell renders, last saved nearby list is
  served with the "saved from where you were" label; `/go` shortcut still opens urgent mode.
- Lie-fi: the 2.5 s race serves saved copies; the UI shows "no signal" quickly, not a long spinner.
- Mutations offline fail fast with a clear message; check-in, report and submission drafts are
  not lost.
- Back online: queries refetch, no duplicate submissions from retried taps.
- Playwright blocks service workers, so none of this is covered by CI (§9).

### 3.5 Performance on a phone
- Lighthouse mobile on `/`, `/go`, `/toilets/[id]`, `/add`, `/leaderboard` at the production URL.
  Budgets: LCP under 2.5 s on slow 4G, INP under 200 ms, CLS under 0.1, total JS under 300 kB
  compressed on first load.
- Map: time to first tiles, frame rate while panning on the low-end Android, memory after ten
  minutes of use, cluster bubbles stable across refetches.
- Fonts: four self-hosted woff2 files, confirm `font-display` and no layout shift on load.
- Photo path: HEIC from an iPhone camera is accepted (`lib/image.ts` goes through a canvas, so
  check `createImageBitmap` HEIC support per browser), resize of a 12 MP image finishes in under
  3 s on the low-end device, EXIF GPS is stripped, upload progress and failure states are visible.
- Cold start of the API from Singapore: measure p50/p95 of `/toilets/nearby` with a cold
  function; a long cold start shows up as a spinner on the first screen.

### 3.6 Touch, gestures, keyboard
- Bottom sheet: drag between all snaps, fling, scroll inside the list without dragging the
  sheet, map pan while the sheet is at peek, no stuck pressed state.
- Tap targets at least 44x44 px; thumb reach of the bottom nav and "I need to go".
- Forms: keyboard pushes content rather than covering it on Android (`interactiveWidget`), and
  the Dialog lifts itself on iOS (`components/ui.tsx`); autofocus, return key, number keypad
  where expected, autocomplete off on search.
- Android system back: closes a sheet or dialog before leaving the page; browser back and
  forward do not leave stale view-transition names (fixed in the motion branch, re-verify).
- Pull-to-refresh and overscroll do not fight the map or the sheet.
- Landscape and split-screen do not break the layout (no orientation lock by design).

### 3.7 Visual and accessibility
- Dark and light theme in Safari, Chrome and Samsung Internet (forced dark mode), theme-color
  follows the chosen theme.
- Reduced motion honoured in every animation (`lib/motion.ts`, `globals.css`).
- Screen reader pass with VoiceOver and TalkBack on the five core flows: labels on icon-only
  buttons, map has a text alternative (the list), focus order with the fixed bottom nav, skip
  link works, live regions for route progress.
- Colour contrast at AA, text scales with system font size up to 200 % without clipping.
- Automated axe run on every route at 390 px wide.

### 3.8 Telegram bot as a mobile surface
- All links from the bot open the right page with the `utm_source` tag and sign-in works in the
  in-app browser.
- Location sharing, place search, `/go` urgent mode (closest toilet's card first, then "See N
  more"), the result list with one button per toilet, tapping into a card and back to the list,
  Navigate, Details, I'm here, Report, the Filters menu and Nearest only, callback expiry ("no
  longer in the results"), edits that arrive out of order on a slow connection, `/stop` deletes
  the chat row, `/unlink`.
- Group behaviour, rate limits per chat and per day, webhook secret rejection, reply sent before
  the 200 so nothing is cut off when the function freezes.

## 4. Frontend code and build audit

- Security headers: `next.config.ts` only sets headers for `/sw.js`. Add and verify
  Content-Security-Policy (MapLibre needs `worker-src blob:` and OneMap tile origins, PostHog
  through `/ingest`, R2 public URL for images), Strict-Transport-Security, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy (geolocation self only, camera self only).
- Secrets: no `NEXT_PUBLIC_` variable carries anything private; `API_ORIGIN` never reaches the
  browser; `.env.example` matches what the code reads.
- Service worker correctness: review `NEVER`, `SAVED_API` and `NETWORK_FIRST_API` lists against
  the current API routes (new routes since the lists were written, for example `/api/me/telegram`
  and `/api/integrations/*`); nothing user-specific is cached; `/api/toilets/[id]` for a toilet
  that was later rejected does not keep serving from cache forever.
- `cacheComponents` and `partialPrefetching` (Next 16): confirm no per-user data is prerendered
  or shared across users in server components (`lib/api/server.ts`, `app/toilets/[id]/page.tsx`).
- Error handling: `app/error.tsx` and `global-error.tsx` exist, but nothing reports errors.
  Decide on Sentry (the API already has a `SENTRY_DSN` slot) and wire both apps, with source
  maps, release tags and PII scrubbing.
- Analytics and privacy: PostHog loads only with a key, through `/ingest`; check autocapture
  settings, that no coordinates, emails or free text are sent, that `/privacy` describes it,
  and whether a consent notice is needed for the SG and EU audiences you expect.
- Typed client drift: `lib/api/contract-check.ts` and `pnpm gen:api` against the baseline
  backend; no `any` escapes at the boundary.
- Bundle: `next build` output per route, MapLibre split from routes that do not show a map,
  `lucide-react` tree-shaken, no duplicate React.
- SEO: `sitemap.ts`, `robots.ts`, canonical URLs use `NEXT_PUBLIC_SITE_URL`, OG images render
  for toilets and the root, `skipTrailingSlashRedirect` does not create duplicate URLs.
- Lint, typecheck and build are clean with zero warnings; no `eslint-disable` without a reason.

## 5. API and backend audit

- Authentication: `sgw_session` is httpOnly, Secure in production, SameSite Lax
  (`src/common/auth/session.ts`). Check TTL, whether tokens can be revoked (stateless signed
  token means sign-out does not invalidate), OAuth state cookie and redirect validation
  (`redirect` must stay on `PUBLIC_APP_URL`), `DEV_LOGIN_ENABLED` refused in production (it is).
- Authorisation: every mutating route has the right guard; role checks for MODERATOR and ADMIN
  on `admin`, `submissions` resolution, `media` approvals; object ownership on update and
  delete (IDOR tests per resource: submissions, reviews, photos, status reports, check-ins).
- Anonymous identity: the device id cookie (`src/common/auth/anon.ts`) cannot be forged to
  claim another device's banked points; linking on sign-in is idempotent.
- Input validation: every body and query is a zod DTO. No explicit body size limit is
  configured, so the Express default of 100 kB applies; confirm it holds and that photo bytes
  never pass through the API. Coordinates are bounded to Singapore where that matters.
- Abuse and gamification integrity: check-in distance checks, cooldowns, points per day,
  quorum rules (`src/submissions/quorum.ts`), status report spam, leaderboard poisoning by a
  script, review text length and content.
- Rate limiting: `src/common/throttle.ts` is in memory per instance. On Vercel Fluid compute
  that is per warm instance and resets on cold start, so limits are advisory. Decide whether
  that is acceptable for launch or move hot limits (auth, submissions, media presign, Telegram)
  to Postgres or an external store.
- Media: presign scope (`tmp/` prefix, content type and size limits, single use), server-side
  re-encode with `sharp` strips metadata, `tmp/` lifecycle rule exists in R2, public bucket
  only ever holds approved photos, takedown path.
- Telegram webhook: secret header compared in constant time, update id de-duplication (Telegram
  retries), per-chat limits, no message text or coordinates persisted, `/stop` really deletes.
- Cron endpoints: `x-cron-secret` guard, idempotent jobs, safe to run twice.
- Errors and logs: no stack traces or SQL in responses; logs carry no emails, tokens or
  coordinates; Nest logger levels in production.
- Dependencies: `pnpm audit` in both repos, Prisma 7.10 and Next 16.4 on supported lines,
  `patches/` reviewed and still needed.
- OpenAPI: `pnpm openapi` output matches `API_CONTRACT.md` and the committed `openapi.json`;
  `/docs` and `/openapi.json` are intentionally public (decide).

## 6. Data and infrastructure

- Database: Neon pooled URL at runtime, direct URL for migrations; Prisma connection count
  per function instance, pool exhaustion under burst; indexes behind `nearby`, `in-bounds`,
  leaderboards (run `EXPLAIN ANALYZE` on the top five queries with production-sized data).
- Migrations run inside `pnpm vercel-build`, so a bad migration blocks the deploy and a
  deploy that fails after migrating leaves the schema ahead of the code. Document the
  forward-fix procedure and test a rollback of the app without rolling back the schema.
- Backups: nightly `pg_dump` to R2 exists (`scheduled.yml`). Do one full restore into a
  scratch Neon branch and boot the API against it; time it; write it down as the runbook.
- Vercel: Hobby plan limits and terms (commercial use is not allowed on Hobby; confirm the plan
  before launch), 30 s max duration set in the dashboard (not in `vercel.json`), `sin1` for both
  projects, cold start size of the API function, deployment protection on previews.
- Regions line up: Vercel `sin1`, Neon `ap-southeast-1`, R2 APAC hint.
- Domains: production domain on both projects or the API reached only through the rewrite,
  HTTPS and HSTS, `NEXT_PUBLIC_SITE_URL` and `PUBLIC_APP_URL` set to the final domain, Google
  OAuth and R2 CORS updated to it.
- Third parties: OneMap token refresh (3 days) and quota under launch traffic, tile usage terms,
  OSM and data.gov.sg attributions on the map and `/about`, Google OAuth consent screen
  published (not in testing mode, which caps users and expires tokens).
- Environment parity: a table of every variable per environment; a preview deploy that hits
  production data is a finding.
- Scheduled workflows: GitHub disables them after 60 days without activity; set a reminder or a
  heartbeat check. Confirm `API_URL`, `CRON_SECRET` and R2 backup secrets are set.

## 7. Observability and operations

- Error tracking in both apps (see §4), with alerts to a channel you read.
- Uptime monitor on `GET /health` (API) and `/` (frontend) from a Singapore probe, 1 min
  interval, alert on two consecutive failures.
- Dashboards: PostHog funnels for find, route, add and check-in; API p95 and error rate from
  Vercel logs; Neon connection and storage graphs.
- Runbooks, each one page: incident triage, roll back a deploy, rotate `AUTH_SECRET` (signs
  everyone out; sessions last 30 days), rotate the Telegram secret and re-run `telegram:setup`,
  restore a backup, take down a photo, ban a user, pause the bot.
- Capacity: the load test in §8.

## 8. Load test

A load test at the expected launch peak, not a run-to-failure stress test. On Vercel Hobby and
Neon's free tier a stress test mostly finds the plan's ceiling and spends the month's quota; the
run-to-failure version is deferred to the first month, after the plan tier is settled (§11).

- Target: a Vercel preview deployment of the API at the baseline SHA, with a Neon branch seeded
  from a production-shaped dataset (the full curated plus OSM toilet set, `PREVIEW_SEED=true` or
  `pnpm db:seed` plus `pnpm cli import:osm`). Deployment protection off for that preview, or the
  test runs with a bypass token. Never production.
- Sizing: a small launch, about 50 concurrent users (friends, a few Telegram groups, one Reddit
  post). Baseline about 8 requests per second; the test runs at 2x (16 rps) for 10 minutes and
  5x (40 rps) for 5 minutes, each preceded by a 2 minute ramp from zero so cold starts are
  included in the numbers.
- Mix (per 100 requests): 45 `GET /toilets/nearby`, 25 `GET /toilets/in-bounds`,
  10 `POST /routing/recommend`, 8 `GET /toilets/:id`, 5 writes (check-in, status report and a
  submission in a 3:1:1 ratio, from a pool of pre-created test sessions and device ids spread
  across toilets so throttles and cooldowns behave as they would for real people), 7 Telegram
  webhook updates (location messages and callback taps, with `TELEGRAM_API_ROOT` pointed at a
  stub Bot API so no real messages are sent). Photo presign and upload are out of scope.
- Tool: k6 (or Artillery) run from a GitHub Actions job or a laptop in Singapore so latency is
  measured from where users are. Scripts live in `../backend/test/load/`.
- Pass criteria at 2x: p95 under 800 ms for reads and 1.5 s for `recommend` (OneMap call
  included), error rate under 0.5 % excluding deliberate 429s, zero 5xx, no Neon connection
  errors, Vercel function duration never near the 30 s cap. At 5x: p95 under 2 s, 429s only
  from the intended per-user limits, the API recovers to baseline within 1 minute after the run.
- Also record: cold-start count and duration, Neon active connections and compute time, Vercel
  function invocations and GB-hours used by the run against the Hobby monthly allowance, and
  whether the webhook handler always answers before the 200 under load.
- Clean up: delete the Neon branch and the preview afterwards; the test must create no rows in
  production.

## 9. Testing and CI gaps

- Playwright runs one project (`chromium-mobile`, Pixel 7) with service workers blocked. Add a
  WebKit project at iPhone size, an un-mocked smoke run against a preview API, and an offline
  suite that lets the worker run (separate project, `serviceWorkers: "allow"`).
- Backend: unit and e2e suites exist (28 unit specs, 10 e2e specs); check coverage on auth,
  guards, throttle, media presign and Telegram callbacks; add the IDOR tests from §5.
- Visual regression at 390 and 430 px wide for the home sheet states, detail page and add wizard.
- Lighthouse CI with the §3.5 budgets on every PR to `main`.
- axe in Playwright on each route.
- CI runs on PRs and `main` only; there is no deploy gate (Vercel deploys on push). Decide
  whether `main` should require green CI before Vercel builds (Vercel "Ignored Build Step" or
  a protected branch).

## 10. Legal, content and trust

- `/privacy` matches reality: session cookie, anonymous device id, PostHog (EU), Telegram chat
  ids, photos, approximate locations in check-ins, retention and deletion (`/stop`, account
  delete). `/about` carries OSM ODbL, OneMap, data.gov.sg and Wikidata attributions.
- User generated content: moderation queue works end to end on a phone (`/review`, `/admin`),
  report and takedown contact is live (`NEXT_PUBLIC_CONTACT_EMAIL`), no photo is public before
  approval.
- Account deletion exists and cascades (reviews, photos, points, Telegram link).
- The app name is deliberate; check store, OAuth consent and OG previews present it the way you
  want, and that Google's OAuth brand verification does not object.

## 11. Launch gates

Must be green before announcing:

1. All §3.1 flows pass on the two current-phone rows of the matrix, including offline shell.
2. No high or critical finding open in §5 (auth, authz, IDOR, media, webhook).
3. Security headers and error reporting live in production.
4. Backup restore drill done once; rollback runbook written.
5. Lighthouse mobile budgets met on `/` and `/go`.
6. Uptime monitor and error alerts reach a human.
7. Privacy page and attributions accurate; OAuth consent screen published.
8. Vercel plan and third-party terms allow the launch.
9. The §8 load test passes at 2x the launch peak with the 5x run showing graceful degradation.

Should-fix within the first month: distributed rate limiting, WebKit e2e project, a
run-to-failure stress test once the hosting tier is decided, Lighthouse CI, visual regression.

## 12. How findings are recorded

One row per finding in `AUDIT_FINDINGS.md` (or a GitHub project), with: id, area (section
number), device/browser/network where seen, steps, expected, actual, severity (critical, high,
medium, low), evidence (screen recording or trace), owner, status. Critical and high become
issues with the `launch-blocker` label.

Severity: critical = data loss, account takeover, app unusable on a current phone; high =
core flow broken on one matrix row or a security weakness with a realistic path; medium =
degraded experience or missing safeguard; low = polish.

## 13. Order and effort

| Step | What | Effort |
|---|---|---|
| 1 | §1 baseline: merge, tag, deploy to production origin | half a day |
| 2 | §5 and §4 code audit (desk work, can run in parallel with 3) | 2 days |
| 3 | §3 device walk on the two current phones, all network profiles | 2 days |
| 4 | §3 on the old iPhone, low-end Android, tablet and desktop | 1 day |
| 5 | §6 and §7: restore drill, headers, monitoring, runbooks | 1.5 days |
| 6 | §8 load test: seed a Neon branch, write the k6 script, run 2x and 5x, write up | 1 day |
| 7 | §9 CI additions (WebKit, offline, axe, Lighthouse CI) | 1.5 days |
| 8 | §10 content and legal pass | half a day |
| 9 | Fix launch blockers, re-test affected flows, sign off §11 | depends on findings |

About ten working days for one person before fixes, less with two people splitting desk and
device work.

## Appendix A: commands

```bash
# frontend
pnpm install && pnpm lint && pnpm typecheck && pnpm build
pnpm exec playwright install chromium webkit
pnpm test:e2e
pnpm audit --prod
npx @lhci/cli autorun --collect.url=https://<domain>/ --collect.settings.preset=mobile

# backend
pnpm install && pnpm lint && pnpm typecheck && pnpm test
docker compose up -d db && pnpm db:deploy && pnpm test:e2e
pnpm openapi && git diff --exit-code openapi.json
pnpm audit --prod

# load test (backend/test/load, against the preview API URL; see §8)
k6 run --env API=https://<api-preview>.vercel.app --env STAGE=2x test/load/launch.js
k6 run --env API=https://<api-preview>.vercel.app --env STAGE=5x test/load/launch.js

# headers at the production origin
curl -sI https://<domain>/ | grep -i -E 'content-security|strict-transport|x-content-type|referrer|permissions-policy'
curl -sI https://<domain>/api/health
```

## Appendix B: observations noted while scoping

Not findings yet (the audit confirms them), but worth knowing going in.

- No security headers beyond `/sw.js` caching headers in `next.config.ts`; no CSP anywhere.
- `SENTRY_DSN` is accepted by `src/config/env.ts` but nothing in either repo reports errors.
- Rate limiting is in-memory per function instance (`src/common/throttle.ts`), by design, and
  the file says so.
- Playwright covers Chromium at Pixel 7 size only, with service workers blocked, so iOS Safari
  and every offline path are untested in CI.
- `PLAN.md`, `DEPLOY.md`, `BOT.md`, `GROWTH.md` are referenced from both READMEs but live
  outside both repos.
- The API's `/docs` Swagger UI and `/openapi.json` are public.
- Sessions are stateless signed tokens; sign-out clears the cookie but cannot revoke a stolen
  token before it expires.
- Both deploy targets are Vercel Hobby, whose terms limit commercial use.
