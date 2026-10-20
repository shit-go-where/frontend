/**
 * The one place client-side crashes are reported, from the error boundaries (app/error.tsx and
 * app/global-error.tsx). Each report is a structured console line (visible in remote debugging and
 * any log drain that reads the browser console) and, when NEXT_PUBLIC_SENTRY_DSN is set, a Sentry
 * event tagged with where it was caught and the server digest (lib/sentry-client.ts).
 *
 * What it records: where it was caught, the error's name and message, the server digest (matches the
 * `[sgw:server-error]` line and the Sentry event instrumentation.ts sends), the path without query or
 * hash (no coordinates, search text or redirect targets) and the deploy's build id. Never the URL's
 * query, cookies or user data; the Sentry event is scrubbed the same way (lib/sentry-options.ts).
 */
import { loadSentry } from "./sentry-client";

export type ErrorBoundaryName = "route" | "global";

export interface ErrorReport {
  where: ErrorBoundaryName;
  name: string;
  message: string;
  digest?: string;
  path: string;
  build: string;
  online?: boolean;
}

const MAX_MESSAGE = 500;

export function describeError(error: unknown, where: ErrorBoundaryName): ErrorReport {
  const e = error instanceof Error ? error : null;
  const digest = e && "digest" in e && typeof (e as { digest?: unknown }).digest === "string" ? (e as { digest: string }).digest : undefined;
  return {
    where,
    name: e?.name ?? typeof error,
    message: (e?.message ?? String(error)).slice(0, MAX_MESSAGE),
    digest,
    path: typeof window !== "undefined" ? window.location.pathname : "",
    build: process.env.SGW_BUILD_ID ?? "dev",
    online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
  };
}

/** Reports an error caught by an error boundary. Never throws. */
export function reportError(error: unknown, where: ErrorBoundaryName): void {
  try {
    const report = describeError(error, where);
    console.error("[sgw:client-error]", report, error);
    void loadSentry()
      .then((Sentry) => {
        Sentry?.captureException(error, {
          level: where === "global" ? "fatal" : "error",
          tags: { where, ...(report.digest ? { digest: report.digest } : {}) },
          extra: { online: report.online },
        });
      })
      .catch(() => {});
  } catch {
    /* reporting must never break the fallback UI */
  }
}
