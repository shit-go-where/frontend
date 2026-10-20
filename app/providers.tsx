"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { isApiError, isNetworkError, setUnauthorizedHandler } from "@/lib/api/client";
import { captureSourceFromUrl, initAnalytics } from "@/lib/analytics";
import { ME_KEY, loginHref, useAnalyticsIdentity } from "@/lib/auth";
import { LocationProvider } from "@/lib/location";
import { forgetSignedInCopies } from "@/lib/offline";

function makeClient() {
  const qc: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Always try the fetch, even when the browser says it's offline: the service worker
        // answers from its saved copy, and navigator.onLine is often wrong underground.
        networkMode: "offlineFirst",
        retry: (count, err) => {
          if (isApiError(err) && err.status < 500) return false;
          // One quick retry for a dropped request, none when we know we're offline (the worker had
          // nothing saved) and none after a timeout, which already waited its full 10 s: retrying
          // doubled a lie-fi spinner to ~25 s. A fast "no signal" beats a long spinner, and the
          // error state has a "Try again" button.
          if (isNetworkError(err)) return err.kind === "unreachable" && count < 1;
          return count < 2;
        },
      },
      // Mutations fail fast with a clear message instead of silently pausing until online.
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
    queryCache: new QueryCache(),
    mutationCache: new MutationCache({
      onError: (err) => {
        // A mutation that needed a session: the cached "me" is stale, go sign in.
        if (isApiError(err) && err.status === 401) {
          qc.setQueryData(ME_KEY, null);
          void forgetSignedInCopies();
          window.location.assign(loginHref());
        }
      },
    }),
  });
  return qc;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);

  useEffect(() => {
    // Any non-silent 401 means our session is gone.
    // Also drop the worker's saved copies that can carry the signed-in person's own data.
    setUnauthorizedHandler(() => {
      client.setQueryData(ME_KEY, null);
      void forgetSignedInCopies();
    });
    return () => setUnauthorizedHandler(null);
  }, [client]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // A worker left by a production run on this origin serves dev chunks cache-first,
      // and dev chunk names don't change with their contents: remove it and its caches.
      void navigator.serviceWorker.getRegistrations().then(async (regs) => {
        await Promise.all(regs.map((r) => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith("sgw-")).map((k) => caches.delete(k)));
        if (regs.length) window.location.reload();
      });
      return;
    }
    const register = () => {
      // /sw.js is app/sw.js/route.ts: the worker with this deploy's version baked in.
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        /* offline support is best-effort */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return (
    <QueryClientProvider client={client}>
      <AnalyticsBoot />
      <LocationProvider>{children}</LocationProvider>
    </QueryClientProvider>
  );
}

/**
 * Notes the first-touch source from this URL (?utm_source= or ?src=), starts PostHog once the page
 * is idle (a no-op without NEXT_PUBLIC_POSTHOG_KEY) and keeps its identity in step with /me.
 */
function AnalyticsBoot() {
  useEffect(() => {
    captureSourceFromUrl();
    initAnalytics();
  }, []);
  useAnalyticsIdentity();
  return null;
}

