"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { isApiError, setUnauthorizedHandler } from "@/lib/api/client";
import { ME_KEY, loginHref } from "@/lib/auth";
import { LocationProvider } from "@/lib/location";

function makeClient() {
  const qc: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => {
          if (isApiError(err) && err.status < 500) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
    queryCache: new QueryCache(),
    mutationCache: new MutationCache({
      onError: (err) => {
        // A mutation that needed a session: the cached "me" is stale, go sign in.
        if (isApiError(err) && err.status === 401) {
          qc.setQueryData(ME_KEY, null);
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
    setUnauthorizedHandler(() => client.setQueryData(ME_KEY, null));
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
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        /* offline support is best-effort */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return (
    <QueryClientProvider client={client}>
      <LocationProvider>{children}</LocationProvider>
    </QueryClientProvider>
  );
}

