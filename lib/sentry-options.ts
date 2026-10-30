/**
 * Sentry options shared by the browser (lib/sentry-client.ts) and the server and edge runtimes
 * (instrumentation.ts), and the scrubbing every event and breadcrumb goes through before it leaves.
 *
 * Off unless NEXT_PUBLIC_SENTRY_DSN is set: local dev and the e2e suite send nothing.
 *
 * Privacy (PDPA, see /privacy): `dataCollection` off for user info (so no IP is inferred or stored),
 * cookies, headers other than User-Agent, bodies, query strings and local variables (SDK v11 replaced
 * `sendDefaultPii` with this, and its defaults collect everything); no session replay, no performance
 * tracing. Page addresses lose their query string and hash everywhere (they carry
 * lat/lng, search text and sign-in redirect targets); request headers other than User-Agent,
 * cookies, bodies and query strings are dropped; text that looks like a coordinate pair is masked.
 * What remains: the error's type, message and stack, the page path, browser and OS, and the deploy.
 *
 * Only types are imported from @sentry/nextjs, so this module costs nothing when Sentry is off.
 */
import type { Breadcrumb, BrowserOptions, Event } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

/** "https://x.sg/go?lat=1.3&lng=103.8#map" -> "https://x.sg/go"; "/go?urgent=1" -> "/go". */
export function stripUrl(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

/** A URL or absolute path followed by a query or hash, inside free text. Keeps the part before it. */
const URL_WITH_QUERY = /((?:[a-z][a-z0-9+.-]*:\/\/|\/)[^\s?#"'`<>()[\]{}]*)[?#][^\s"'`<>()[\]{}]*/gi;
/** Two decimals with four or more places, comma separated: "1.29930, 103.84550". */
const COORD_PAIR = /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g;

/** Free text (messages, exception values, console breadcrumbs) without URL queries or coordinates. */
export function scrubText(text: string): string {
  return text.replace(URL_WITH_QUERY, "$1").replace(COORD_PAIR, "[coords]");
}

/** Breadcrumb data keys that hold a URL or path: their query and hash go. */
const URL_KEY = /^(url|from|to|href|path|request_path)$/i;
/** Breadcrumb data keys dropped outright: raw console arguments, query strings, bodies. */
const DROP_KEY = /query|fragment|arguments|body|input|cookie|header/i;

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  if (crumb.message) crumb.message = scrubText(crumb.message);
  if (crumb.data) {
    for (const [key, value] of Object.entries(crumb.data)) {
      if (DROP_KEY.test(key)) delete crumb.data[key];
      else if (typeof value === "string") crumb.data[key] = URL_KEY.test(key) ? scrubText(stripUrl(value)) : scrubText(value);
    }
  }
  return crumb;
}

export function scrubEvent<T extends Event>(event: T): T {
  delete event.user;

  const req = event.request;
  if (req) {
    if (req.url) req.url = stripUrl(req.url);
    delete req.query_string;
    delete req.cookies;
    delete req.data;
    delete req.env;
    // User-Agent is how Sentry tells the browser and OS apart. Referer, Cookie, X-Forwarded-For go.
    const ua = req.headers?.["User-Agent"] ?? req.headers?.["user-agent"];
    req.headers = ua ? { "User-Agent": ua } : {};
  }

  if (event.message) event.message = scrubText(event.message);
  if (event.logentry) {
    if (event.logentry.message) event.logentry.message = scrubText(event.logentry.message);
    delete event.logentry.params;
  }
  if (event.transaction) event.transaction = stripUrl(event.transaction);

  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
    for (const frame of ex.stacktrace?.frames ?? []) {
      // An inline script's frame is the page address itself.
      if (frame.abs_path) frame.abs_path = stripUrl(frame.abs_path);
      if (frame.filename) frame.filename = stripUrl(frame.filename);
      delete frame.vars;
    }
  }

  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);

  const nextjs = event.contexts?.nextjs;
  if (nextjs && typeof nextjs.request_path === "string") nextjs.request_path = stripUrl(nextjs.request_path);

  if (event.tags) {
    for (const [key, value] of Object.entries(event.tags)) {
      if (typeof value === "string") event.tags[key] = key === "url" ? stripUrl(value) : scrubText(value);
    }
  }
  if (event.extra) {
    // Arguments of the wrapped callback (BrowserApiErrors), e.g. a DOM event.
    delete event.extra.arguments;
    for (const [key, value] of Object.entries(event.extra)) if (typeof value === "string") event.extra[key] = scrubText(value);
  }
  return event;
}

/**
 * The browser skipping a view transition (viewport resized as Android's URL bar moves, tab hidden).
 * The DOM update still lands; only the animation is lost. React ignores these by exact message, but
 * Chrome 154 appends the reason ("… invalid state. Viewport size changed"), so match the prefix. Firefox
 * words it its own way ("Skipped ViewTransition due to document being hidden"), which React doesn't know.
 */
export const SKIPPED_VIEW_TRANSITION =
  /^(InvalidStateError: )?(Transition was aborted because of invalid state|Skipping view transition because|View transition was skipped because|Skipped ViewTransition due to)/;

/**
 * Options common to every runtime. Environment and release come from next.config.ts `env`
 * (VERCEL_ENV and VERCEL_GIT_COMMIT_SHA at build time), so browser and server agree.
 */
export function sentryBaseOptions(): BrowserOptions {
  const release = process.env.SGW_RELEASE;
  return {
    dsn: SENTRY_DSN,
    environment: process.env.SGW_ENV || "local",
    // Left out when unknown, so withSentryConfig's own release value still applies.
    ...(release ? { release } : {}),
    // Sentry v11's replacement for `sendDefaultPii: false`, and stricter: every category off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    // Errors only: no performance tracing (free quota, and nothing timed about a person).
    tracesSampleRate: 0,
    maxBreadcrumbs: 30,
    ignoreErrors: [SKIPPED_VIEW_TRANSITION],
    initialScope: { tags: { build: process.env.SGW_BUILD_ID ?? "dev" } },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
