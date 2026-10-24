"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SexPreference, ToiletSex } from "./api/types";

/**
 * Which toilets someone uses (Men's, Women's, or all toilets), kept on this phone so the map, the near-me list,
 * "Walk there" and the station and area pages only offer toilets they can walk into. Asked once, the
 * first time the map is used; dismissing the question is an answer too (all toilets) and it is never asked again.
 *
 * "Accessible" in the same picker is the ACCESSIBLE must-have filter (lib/use-filters.ts), not a second
 * setting: `accessible` here only records what the picker last saved it as.
 */
const KEY = "sgw:sex-pref";

export interface SexPrefState {
  /** Null is all toilets: no filter, whoever it's for. */
  sex: SexPreference | null;
  accessible: boolean;
  /** When they answered or dismissed the question; null until then. */
  askedAt: string | null;
}

const ANY: SexPrefState = { sex: null, accessible: false, askedAt: null };
const listeners = new Set<(v: SexPrefState) => void>();
/** The latest value, shared by every hook on the page. */
let current: SexPrefState | null = null;

function read(): SexPrefState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return ANY;
    const v = JSON.parse(raw) as Partial<SexPrefState> | null;
    return {
      sex: v?.sex === "MALE" || v?.sex === "FEMALE" ? v.sex : null,
      accessible: v?.accessible === true,
      askedAt: typeof v?.askedAt === "string" ? v.askedAt : null,
    };
  } catch {
    return ANY;
  }
}

function write(next: SexPrefState) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: still works for this page */
  }
  for (const l of listeners) l(next);
}

/**
 * The saved preference. All toilets (and not yet asked) on the server and until storage has loaded after
 * hydration; `ready` says when it has, so a request that sends `sex` can wait instead of going twice.
 */
export function useSexPreference() {
  const [state, setState] = useState<SexPrefState>(ANY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    current ??= read();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(current);
    setReady(true);
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  /** Save an answer (marks the question asked). */
  const choose = useCallback((sex: SexPreference | null, accessible?: boolean) => {
    const prev = current ?? read();
    write({ sex, accessible: accessible ?? prev.accessible, askedAt: new Date().toISOString() });
  }, []);

  /** Records the Accessible switch without answering the question (the card stays up until they pick). */
  const setAccessible = useCallback((accessible: boolean) => {
    write({ ...(current ?? read()), accessible });
  }, []);

  /** Closing the question without an answer: all toilets, and don't ask again. */
  const dismiss = useCallback(() => {
    const prev = current ?? read();
    write({ ...prev, askedAt: prev.askedAt ?? new Date().toISOString() });
  }, []);

  return {
    sex: state.sex,
    accessible: state.accessible,
    /** Answered or dismissed before. False until storage has loaded, so check `ready` first. */
    asked: state.askedAt !== null,
    ready,
    choose,
    setAccessible,
    dismiss,
  };
}

/**
 * Whether someone who uses `pref` toilets can use this one, as the API's `sex` filter decides it: their
 * own, unisex, or not known (most open-data toilets don't say). Null (all toilets) takes every one.
 */
export function usableBy(sex: ToiletSex | null | undefined, pref: SexPreference | null): boolean {
  return !pref || !sex || sex === "UNISEX" || sex === pref;
}

/**
 * A server-rendered page's data (rendered for everyone, so with every toilet), narrowed to the saved
 * preference: at once on the phone with `narrow`, then from the API with `sex`, which also redoes the
 * counts and fills a short list ("nearest 5") back up. All toilets (null) keeps the server's copy and asks for nothing.
 * `narrow` must be a module-level function (it's a memo dependency).
 */
export function usePrefData<T>(
  key: readonly unknown[],
  server: T,
  fetch: (sex: SexPreference, signal: AbortSignal) => Promise<T>,
  narrow: (data: T, sex: SexPreference) => T,
): { data: T; sex: SexPreference | null } {
  const { sex, ready } = useSexPreference();
  const q = useQuery({
    queryKey: [...key, sex],
    queryFn: ({ signal }) => fetch(sex!, signal),
    enabled: ready && !!sex,
    staleTime: 5 * 60_000,
  });
  const local = useMemo(() => (sex ? narrow(server, sex) : server), [server, sex, narrow]);
  return { data: sex ? (q.data ?? local) : server, sex };
}

/** "Men's" / "Women's" / "All toilets": the chip's words for the saved choice. */
export function prefLabel(sex: SexPreference | null): string {
  return sex === "MALE" ? "Men's" : sex === "FEMALE" ? "Women's" : "All toilets";
}
