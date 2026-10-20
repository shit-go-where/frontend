"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef, useSyncExternalStore } from "react";
import { api } from "./api/client";
import { identifyUser, resetUser } from "./analytics";
import { forgetSignedInCopies } from "./offline";
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

/** The query param that carries a signed-out tap through sign-in, e.g. `?do=report`. */
export const INTENT_PARAM = "do";

/** This page with `?do=<intent>` added, so sign-in brings the person back to the action they tapped. */
function hereWithIntent(intent: string) {
  const u = new URL(window.location.href);
  u.searchParams.set(INTENT_PARAM, intent);
  return u.pathname + u.search;
}

export interface GuardOptions {
  /**
   * Run the action signed out too. Only check-ins and status reports at live toilets work without an
   * account (the API ties them to an anonymous device cookie and pays their points on sign-in).
   */
  allowAnon?: boolean;
}

/** /login, coming back to this page with `?do=<intent>` so the action picks up again. */
export function loginWithIntent(intent?: string) {
  return loginHref(intent ? hereWithIntent(intent) : undefined);
}

/**
 * Wrap a contributing action: if signed out, go to /login instead. Pass an `intent` and the
 * page can pick the action up again after sign-in with `useResumeIntent`, so nobody has to tap twice.
 */
export function useGuard() {
  const { data: me } = useMe();
  const router = useRouter();
  return useCallback(
    (fn: () => void, intent?: string, opts?: GuardOptions) => {
      if (!me && !opts?.allowAnon) {
        router.push(loginWithIntent(intent));
        return;
      }
      fn();
    },
    [me, router],
  );
}

/**
 * Runs `run` once when the page was opened with `?do=<intent>` by someone signed in, then drops the
 * param so a refresh or Back doesn't run it again.
 */
export function useResumeIntent(intent: string, run: () => void) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const ran = useRef(false);
  const wanted = params.get(INTENT_PARAM) === intent;
  const resume = useEffectEvent(() => {
    ran.current = true;
    const rest = new URLSearchParams(params);
    rest.delete(INTENT_PARAM);
    const q = rest.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    run();
  });
  useEffect(() => {
    if (wanted && me && !ran.current) resume();
  }, [wanted, me]);
}

/**
 * Keeps analytics identity in step with who is signed in: the user id only (no email, name or other
 * traits), and back to a fresh anonymous id once a signed-in browser is signed out. Mounted once.
 */
export function useAnalyticsIdentity() {
  const { data: me, isSuccess } = useMe();
  const id = me?.id ?? null;
  useEffect(() => {
    if (!isSuccess) return;
    if (id) identifyUser(id);
    else resetUser();
  }, [isSuccess, id]);
}

export function useSignOut() {
  const qc = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    try {
      await api.logout();
    } finally {
      resetUser({ force: true });
      await forgetSignedInCopies();
      qc.setQueryData(ME_KEY, null);
      await qc.invalidateQueries();
      router.push("/");
    }
  }, [qc, router]);
}
