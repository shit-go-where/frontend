import type { Instrumentation } from "next";
import { SENTRY_DSN, sentryBaseOptions } from "./lib/sentry-options";

/**
 * Server and edge error reporting (Sentry), only when NEXT_PUBLIC_SENTRY_DSN is set. The SDK is
 * imported here rather than at the top so a build without a DSN never loads it. Options and scrubbing
 * (no PII, no query strings, no headers but User-Agent) are shared with the browser: lib/sentry-options.ts.
 */
export async function register() {
  if (!SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(sentryBaseOptions());
}

/**
 * Server-side errors (Server Components, route handlers, OG images) as one JSON line each, so Vercel's
 * runtime logs can be searched by the digest a person sees on the error page ("Reference: …", app/error.tsx)
 * and alerted on; and, with a DSN, to Sentry tagged with the same digest.
 *
 * Logs the path without its query (it can carry coordinates or redirect targets) and never the
 * request headers (cookies).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err instanceof Error ? err : null;
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  console.error(
    "[sgw:server-error]",
    JSON.stringify({
      digest,
      name: e?.name,
      message: (e?.message ?? String(err)).slice(0, 500),
      stack: e?.stack?.split("\n").slice(0, 8).join("\n"),
      method: request.method,
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
      build: process.env.SGW_BUILD_ID,
    }),
  );

  if (!SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.withScope((scope) => {
      if (digest) scope.setTag("digest", digest);
      Sentry.captureRequestError(err, request, context);
    });
  } catch {
    /* reporting must never turn one error into two */
  }
};
