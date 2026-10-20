/**
 * The one place client-side crashes are reported. Today that is a structured console line (visible in
 * remote debugging and in any log drain that reads the browser console); swap the body for Sentry's
 * captureException once a DSN exists, keeping this signature so the error boundaries don't change.
 *
 * What it records: where it was caught, the error's name and message, the server digest (matches the
 * `[sgw:server-error]` line instrumentation.ts writes), the path without query or hash (no coordinates,
 * search text or redirect targets) and the deploy's build id. Never the URL's query, cookies or user data.
 */
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
    console.error("[sgw:client-error]", describeError(error, where), error);
  } catch {
    /* reporting must never break the fallback UI */
  }
}
