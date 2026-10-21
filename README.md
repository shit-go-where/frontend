# Shit Go Where (web)

Next.js 16 PWA for **Shit Go Where**, a Singapore public toilet finder: map, list, toilet detail,
"route me to a toilet now", contributions, profile and leaderboard. All data comes from the
NestJS API in the sibling `backend` repo.

Design and roadmap: [`../PLAN.md`](../PLAN.md). API: [`../backend/README.md`](../backend/README.md).
First production deploy: [`../DEPLOY.md`](../DEPLOY.md).

Stack: Next 16.4 (App Router, Turbopack), React 19.3, Tailwind 4, MapLibre with OneMap tiles,
TanStack Query, zod, `openapi-fetch` client generated from the API's OpenAPI spec, Playwright.

> This Next version has breaking changes from older releases. Read the guides in
> `node_modules/next/dist/docs/` before changing framework-level code (see `AGENTS.md`).

## Local development

Requirements: Node 24, pnpm 12 (`packageManager` is pinned in `package.json`).

```bash
# 1. start the API first (see ../backend/README.md): it listens on http://localhost:4000
# 2. then:
pnpm install
cp .env.example .env.local
pnpm dev                      # http://localhost:3000
```

`.env.local`:

| Variable | Default | Meaning |
|---|---|---|
| `API_ORIGIN` | `http://localhost:4000` | Where `/api/*` is rewritten to. Server-side only; the browser never sees it. Also used by server components that fetch the API directly. **No build error if it is missing**: it silently falls back to localhost, so a production deploy without it serves broken pages. |
| `API_PROXY_SECRET` | unset | Same value as the API's `API_PROXY_SECRET`. When set, `proxy.ts` handles the `/api/*` rewrite and forwards each visitor's IP (`x-sgw-client-ip`) with the secret, so the API rate-limits per phone rather than per Vercel proxy. Server-side only. |
| `NEXT_PUBLIC_SITE_URL` | unset (falls back to `VERCEL_PROJECT_PRODUCTION_URL`, then localhost) | Public origin for canonical URLs, `sitemap.xml`, `robots.txt` and the Open Graph URLs. Set it to the final domain. Inlined at build time. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | unset | Takedown/contact address shown on `/about` and `/privacy`; unset hides the email lines. Inlined at build time. |
| `NEXT_PUBLIC_TELEGRAM_BOT_URL` | `https://t.me/ShitGoWhereBot` | The Telegram bot linked from `/about`, the map sheet and a few contextual tips. `off` hides every mention; another t.me link points them at a test bot (the `/about` QR code then hides, since it encodes the live bot). Inlined at build time. |
| `NEXT_PUBLIC_POSTHOG_KEY` | unset | PostHog US project key. Unset = analytics off, nothing loads or is sent. Inlined at build time; traffic goes through the `/ingest` rewrite. |
| `NEXT_PUBLIC_SENTRY_DSN` | unset | Sentry DSN (US region) for error reporting. Unset = off: the SDK never loads in the browser or on the server and nothing is sent. Browser reports go through the same-origin `/monitoring` tunnel. Inlined at build time. See [Error reporting](#error-reporting-sentry). |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | unset | Build-time only, for uploading source maps. Without `SENTRY_AUTH_TOKEN` no source maps are generated or uploaded and the build is unchanged. Never set the token locally. |
| `NEXT_PUBLIC_DEV_LOGIN` | `true` locally | Shows the email-only dev login on `/login`. Pairs with `DEV_LOGIN_ENABLED=true` on the API. Leave unset in production. |

Vercel also provides `VERCEL_DEPLOYMENT_ID`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` and
`VERCEL_PROJECT_PRODUCTION_URL`; `next.config.ts` and `lib/site.ts` read them (the service worker's cache
version is derived from the deployment id; Sentry's environment and release are `VERCEL_ENV` and the
commit SHA). Nothing else needs setting. Everything `NEXT_PUBLIC_*` is baked into the bundle at
build time and visible to every visitor: changing one means a redeploy, and it must never hold a secret.

### How `/api/*` works

The browser only ever calls same-origin `/api/...`. `next.config.ts` rewrites
`/api/:path*` to `${API_ORIGIN}/:path*` (the API itself has no `/api` prefix). So:

- the API's session cookie is first-party on the frontend origin (Google login works in Safari
  without a custom domain);
- there is no CORS in production;
- the Google OAuth redirect URI is `<frontend origin>/api/auth/callback`.

### Typed API client

`lib/api/schema.d.ts` is generated from the API's OpenAPI spec:

```bash
(cd ../backend && pnpm openapi)   # writes ../backend/openapi.json
pnpm gen:api                      # openapi-typescript -> lib/api/schema.d.ts
```

You can also download `openapi.json` from the backend CI run's `openapi` artifact, or from a
running API at `/openapi.json`. Regenerate whenever the backend contract changes, and commit the
result with the frontend change that uses it (backend PR merges first; PLAN.md §9.4).

## Scripts and tests

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server on 3000 |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `next typegen && tsc --noEmit` |
| `pnpm gen:api` | Regenerate the typed API client |
| `pnpm test:e2e` | Playwright: smoke tests on four phone sizes, axe, layout, reduced motion, offline |

Playwright builds the app and serves it on port 3100. Every `/api/**` call is mocked in
`e2e/mock-api.ts`, so no backend is needed. First run: `pnpm exec playwright install chromium`.
The projects (`playwright.config.ts`), about 6 minutes in all:

| Project | What it runs |
|---|---|
| `chromium-mobile`, `iphone-15`, `iphone-se`, `android-large` | The smoke and motion specs at 412, 393, 375 and 430 px wide. WebKit is not installed, so the iPhones are Chromium with an iPhone's size, pixel ratio, touch and user agent |
| `a11y` | axe on every route and on dialogs, tabs and wizard steps at 390 px, both themes, plus tap targets under 44 px |
| `layout-390`, `layout-375`, `layout-430` | No sideways page scroll, nothing sticking out past the edge, no control hidden under the tab bar. `LAYOUT_TEXT=200` simulates 200 % text, `LAYOUT_SHOTS=dir` saves screenshots |
| `offline` | The service worker for real: precache, shell and urgent mode with the signal gone, saved list, lie-fi |

`a11y`, `layout-*` and `offline` need the app's server rendering and the worker's requests, which `page.route` cannot
mock, so they run against the same build on port 3101 with a stub API (`e2e/stub-api.mjs`, port 4000, same fixtures as
the mock). `offline` goes through a proxy on 3102 (`e2e/flaky-proxy.mjs`) that drops or stalls connections per browser
context. If the installed Chromium is not the build this Playwright expects, set `PW_CHROMIUM_PATH` to its binary.

CI (`.github/workflows/ci.yml`) runs install, lint, typecheck, build (with a restored `.next/cache`) and
Playwright on every PR and push to `main`, plus a non-blocking `pnpm audit --prod` job. When it fails, it
uploads the Playwright report and traces as an artifact. Playwright's `webServer` runs `pnpm build`
again, so the app is built twice in CI.

## Deployment (Vercel)

Separate Vercel Hobby project from the API.

- Import this repo; framework preset **Next.js**; defaults for install/build/output.
- `vercel.json` pins functions to `sin1` (Singapore). Without it they would run in the default
  US region.
- Node.js version: 24.x.
- Environment variables:

| Variable | Production | Preview | Development |
|---|---|---|---|
| `API_ORIGIN` | **required**: API production URL, e.g. `https://sgw-api.vercel.app` (no trailing slash) | API production URL (preview API URLs sit behind Vercel deployment protection), or a specific API preview URL with protection disabled | `http://localhost:4000` |
| `API_PROXY_SECRET` | **recommended**: `openssl rand -hex 32`, identical in the API project | same | unset |
| `NEXT_PUBLIC_SITE_URL` | **required once a domain exists**: `https://shitgowhere.com` | unset (previews then canonicalise to the production alias, which is fine) | unset |
| `NEXT_PUBLIC_CONTACT_EMAIL` | recommended: the takedown/contact alias | same or unset | unset |
| `NEXT_PUBLIC_TELEGRAM_BOT_URL` | unset (the live bot) | unset | unset |
| `NEXT_PUBLIC_POSTHOG_KEY` | the US project key | **unset** (keeps preview traffic out of the product data) | unset |
| `NEXT_PUBLIC_SENTRY_DSN` | the `sgw-frontend` DSN (US) | same (events are tagged `environment: preview`) | unset |
| `SENTRY_ORG` / `SENTRY_PROJECT` | `shit-go-where` / `sgw-frontend` | same | unset |
| `SENTRY_AUTH_TOKEN` | recommended: an org auth token with `project:releases` (Sentry, Settings, Auth Tokens), marked Sensitive. Without it the build still succeeds and simply skips source maps | same | unset |
| `NEXT_PUBLIC_DEV_LOGIN` | **unset** | unset | `true` |

`API_ORIGIN` is also read while the build prerenders `sitemap.xml` and the area/station pages, so the API
must be reachable from Vercel's build machines (production URL, not a protected preview).

After the first production deploy, put the frontend's production origin into the API's
`PUBLIC_APP_URL` / `FRONTEND_ORIGIN`, the Google OAuth client and the R2 CORS rule (see
`DEPLOY.md`).

Hobby plan: personal, **non-commercial** use only, one seat, about one hour of runtime logs, and hard
monthly allowances that pause the project instead of billing (<https://vercel.com/docs/limits>).
Decide on the plan before announcing the site. Domains: attach the apex and `www` to this project and
redirect one to the other (Settings -> Domains); `http://` is redirected to `https://` and HSTS is added
by Vercel. The API project does not need the public domain: it is reached through the `/api/*` rewrite,
by the Telegram webhook (API URL) and by cron.

### Deploy gate (Vercel `ignoreCommand`)

Vercel builds on every push regardless of GitHub Actions. `vercel.json` therefore runs
`.github/scripts/vercel-ignore-build.mjs` before each Git-triggered build:

- **Always on:** skips the build when the diff since the last successful build only touches docs, CI
  config or e2e tests. Anything unexpected (no previous build, shallow clone, script error) builds.
- **Opt-in CI gate:** set `SGW_REQUIRE_CI=1` in the project's *Production* environment variables and a
  production build waits (default 10 minutes, `SGW_CI_WAIT_S`) for the commit's GitHub Actions checks,
  cancels the deploy if one failed, and builds anyway if none reported in time. A commit message with
  `[skip-ci-gate]` bypasses it (hotfix on a red `main`). Private repos also need a `GITHUB_TOKEN` env var
  with read access to checks. Hobby runs one build at a time, so a waiting gate queues the builds behind it.
- The lighter alternative with the same effect for normal flow: branch protection on `main` requiring
  the CI check, and merge only through pull requests.

Test locally: `SGW_IGNORE_DRY_RUN=1 VERCEL_GIT_COMMIT_SHA=<sha> VERCEL_GIT_PREVIOUS_SHA=<older sha> node .github/scripts/vercel-ignore-build.mjs`.

### Operations

Incident triage, rollback, restore and the other runbooks live with the API:
[`../backend/docs/RUNBOOKS.md`](../backend/docs/RUNBOOKS.md). `../backend/docs/probe-production.sh`
records the live site's headers, redirects and latency. There is no uptime monitor wired up yet (see
the audit plan).

### Error reporting (Sentry)

With `NEXT_PUBLIC_SENTRY_DSN` set, errors go to the Sentry project `sgw-frontend` (US region, free plan):

- **Browser:** `instrumentation-client.ts` loads the SDK (`lib/sentry-client.ts`, about 30 kB gzipped, its
  own chunk) once the page is idle, or straight away when an error boundary reports something
  (`lib/report-error.ts`, tagged `where: route|global` and the server `digest`). Uncaught errors thrown
  before it arrives are held and sent once it starts. It sends through `/monitoring`, a same-origin rewrite
  to Sentry's ingest added by `withSentryConfig` (`tunnelRoute`), so the CSP needs no Sentry origin and ad
  blockers don't drop reports. `proxy.ts` doesn't match it and the service worker never caches it.
- **Server and edge:** `instrumentation.ts` `register()` starts the SDK, and `onRequestError` sends each
  server error tagged with its digest, beside the `[sgw:server-error]` log line.
- **Privacy:** errors only (tracing compiled out, `tracesSampleRate: 0`, no replay, no session pings).
  `lib/sentry-options.ts` turns off all of the SDK's data collection (user, IP inference, cookies, headers
  except User-Agent, bodies, query strings, local variables) and scrubs every event and breadcrumb: query
  strings and hashes go from every URL and path, and coordinate pairs in messages become `[coords]`.
  Do Not Track and Global Privacy Control turn browser reporting off, as for analytics.
- **Source maps:** only when `SENTRY_AUTH_TOKEN` is set. The build then generates browser source maps,
  uploads them for the release (the commit SHA) and deletes them before deploy, so the site serves none.
- **Sentry project settings to set once:** Security & Privacy, turn on "Prevent Storing of IP Addresses"
  and keep "Data Scrubber" on; add an alert rule that emails you on new issues.
- To try it locally, put the DSN in `.env.local`, `pnpm build && pnpm start`, and remove it afterwards
  (local events are tagged `environment: local`).

Until an issue reaches Sentry, the Vercel logs (about one hour on Hobby) are the fallback; search them
for the digest a person reads off the error page.
