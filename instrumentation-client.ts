/**
 * Runs before hydration (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * instrumentation-client.md). Starts browser error reporting once the page is idle; see
 * lib/sentry-client.ts. Nothing happens without NEXT_PUBLIC_SENTRY_DSN or with Do Not Track / GPC.
 *
 * Uncaught errors from before the SDK arrives are held (at most a few) and sent once it starts.
 * Errors caught by app/error.tsx and app/global-error.tsx go through lib/report-error.ts instead.
 */
import { loadSentry, sentryEnabled } from "@/lib/sentry-client";

const MAX_EARLY = 5;

if (sentryEnabled()) {
  const early: unknown[] = [];
  const onError = (e: ErrorEvent) => {
    if (e.error != null && early.length < MAX_EARLY) early.push(e.error);
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    if (e.reason != null && early.length < MAX_EARLY) early.push(e.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const start = () =>
    void loadSentry().then((Sentry) => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      for (const err of early.splice(0)) {
        Sentry?.captureException(err, { mechanism: { handled: false, type: "auto.browser.early_global_handler" } });
      }
    });
  const whenIdle = () => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 3000 });
    else setTimeout(start, 1500);
  };
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}
