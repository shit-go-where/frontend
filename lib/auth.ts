"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
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

/**
 * For pages that only make sense signed in (/add, /review, /me): bounce to
 * /login once we know the user is signed out.
 */
export function useRequireAuth() {
  const q = useMe();
  const router = useRouter();
  const signedOut = q.isSuccess && q.data === null;
  useEffect(() => {
    if (signedOut) router.replace(loginHref());
  }, [signedOut, router]);
  return q;
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
