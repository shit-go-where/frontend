"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "./api/client";
import type { Me, Role } from "./api/types";

export const ME_KEY = ["me"] as const;

export function loginHref(redirect?: string) {
  const path =
    redirect ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
  return `/login?redirect=${encodeURIComponent(path)}`;
}

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ME_KEY,
    queryFn: api.me,
    staleTime: 60_000,
    retry: 1,
  });
}

const ROLE_RANK: Record<Role, number> = { USER: 0, TRUSTED: 1, MODERATOR: 2, ADMIN: 3 };
export function hasRole(me: Me | null | undefined, min: Role) {
  return !!me && ROLE_RANK[me.role] >= ROLE_RANK[min];
}

const noSubscribe = () => () => {};

/**
 * False on the server and during hydration, true after. The nav may already have fetched /me by the
 * time a page hydrates, so anything that branches on who is signed in should wait for this to match
 * the server's HTML.
 */
export function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/**
 * For pages that only make sense signed in (/add, /review, /me): bounce to
 * /login once we know the user is signed out.
 *
 * The server never knows who is signed in, so it renders "still checking". Until
 * hydration is done this reports the same, even if the nav already fetched /me,
 * so the first client render matches the server's HTML.
 */
export function useRequireAuth() {
  const q = useMe();
  const router = useRouter();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const signedOut = q.isSuccess && q.data === null;
  useEffect(() => {
    if (signedOut) router.replace(loginHref());
  }, [signedOut, router]);
  return hydrated ? q : ({ ...q, isLoading: true, data: undefined } as typeof q);
}

/** Wrap a contributing action: if signed out, go to /login instead. */
export function useGuard() {
  const { data: me } = useMe();
  const router = useRouter();
  return useCallback(
    (fn: () => void) => {
      if (!me) {
        router.push(loginHref());
        return;
      }
      fn();
    },
    [me, router],
  );
}

export function useSignOut() {
  const qc = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    try {
      await api.logout();
    } finally {
      qc.setQueryData(ME_KEY, null);
      await qc.invalidateQueries();
      router.push("/");
    }
  }, [qc, router]);
}
