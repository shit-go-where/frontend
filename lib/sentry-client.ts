/**
 * Browser error reporting (Sentry). The only module that loads the SDK (lib/sentry-sdk.ts) in the browser.
 *
 * - A complete no-op unless NEXT_PUBLIC_SENTRY_DSN is set, and when the browser sends Do Not Track
 *   or Global Privacy Control (the same rule as analytics, lib/analytics.ts).
 * - The SDK is a separate chunk, imported once the page is idle (instrumentation-client.ts) or as
 *   soon as an error boundary reports something (lib/report-error.ts), so it never delays first paint.
 * - Reports go to same-origin /monitoring (withSentryConfig `tunnelRoute` in next.config.ts), so the
 *   CSP needs no Sentry origin and ad blockers don't drop them. The service worker never touches it.
 * - Errors only: no replay, no tracing, no release-health session ping on every page load.
 *   Everything passes through lib/sentry-options.ts scrubbing first.
 */
import { doNotTrack } from "./do-not-track";
import { SENTRY_DSN, sentryBaseOptions } from "./sentry-options";

type SentryModule = typeof import("./sentry-sdk");

/** Default integrations we don't want: a session ping per page load, and tracing (also tree-shaken). */
const DROPPED_INTEGRATIONS = new Set(["BrowserSession", "BrowserTracing"]);

let off = !SENTRY_DSN;
let loading: Promise<SentryModule | null> | undefined;

/** Whether reports may be sent from this browser at all. */
export function sentryEnabled(): boolean {
  if (off || typeof window === "undefined") return false;
  if (doNotTrack()) off = true;
  return !off;
}

/** Loads and starts the SDK once. Resolves to null when reporting is off or the chunk can't load. */
export function loadSentry(): Promise<SentryModule | null> {
  if (!sentryEnabled()) return Promise.resolve(null);
  loading ??= import("./sentry-sdk")
    .then((Sentry) => {
      Sentry.init({
        ...sentryBaseOptions(),
        integrations: (defaults) => defaults.filter((i) => !DROPPED_INTEGRATIONS.has(i.name)),
      });
      return Sentry;
    })
    .catch(() => {
      // Chunk failed to load (no signal): try again on the next report.
      loading = undefined;
      return null;
    });
  return loading;
}
