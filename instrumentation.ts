import type { Instrumentation } from "next";

/**
 * Server-side errors (Server Components, route handlers, OG images) as one JSON line each, so Vercel's
 * runtime logs can be searched by the digest a person sees on the error page ("Reference: …", app/error.tsx)
 * and alerted on. Replace or extend with Sentry's captureRequestError once a DSN exists.
 *
 * Logs the path without its query (it can carry coordinates or redirect targets) and never the
 * request headers (cookies).
 */
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
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
};
