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
| `API_ORIGIN` | `http://localhost:4000` | Where `/api/*` is rewritten to. Server-side only; the browser never sees it. Also used by server components that fetch the API directly. |
| `NEXT_PUBLIC_DEV_LOGIN` | `true` locally | Shows the email-only dev login on `/login`. Pairs with `DEV_LOGIN_ENABLED=true` on the API. Leave unset in production. |

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

CI (`.github/workflows/ci.yml`) runs install, lint, typecheck, build, and Playwright on every PR
and push to `main`. When it fails, it uploads the Playwright report and traces as an artifact.

## Deployment (Vercel)

Separate Vercel Hobby project from the API.

- Import this repo; framework preset **Next.js**; defaults for install/build/output.
- `vercel.json` pins functions to `sin1` (Singapore). Without it they would run in the default
  US region.
- Node.js version: 24.x.
- Environment variables:

| Variable | Production | Preview | Development |
|---|---|---|---|
| `API_ORIGIN` | API production URL, e.g. `https://sgw-api.vercel.app` | API production URL (preview API URLs sit behind Vercel deployment protection), or a specific API preview URL with protection disabled | `http://localhost:4000` |
| `NEXT_PUBLIC_DEV_LOGIN` | unset | unset | `true` |

After the first production deploy, put the frontend's production origin into the API's
`PUBLIC_APP_URL` / `FRONTEND_ORIGIN`, the Google OAuth client and the R2 CORS rule (see
`DEPLOY.md`).
