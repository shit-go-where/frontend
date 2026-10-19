"use client";

import { useCallback, useEffect, useState } from "react";
import { FILTERS, type FilterKey } from "./filters";

const KEY = "sgw:filters";
const VALID = new Set<string>(FILTERS.map((f) => f.key));
const listeners = new Set<(v: Set<FilterKey>) => void>();
/** The latest set, so two taps in the same tick build on each other instead of on a stale render. */
let current: Set<FilterKey> | null = null;

function read(): Set<FilterKey> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? (arr.filter((k) => typeof k === "string" && VALID.has(k)) as FilterKey[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Must-have filters, shared by the map and the "Help me choose" wizard and kept
 * across visits, so someone who always needs an accessible toilet sets it once.
 */
export function useStoredFilters() {
  const [active, setActive] = useState<Set<FilterKey>>(() => new Set());
  /** False until the saved set has loaded, so a request that sends filters can wait instead of going twice. */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Storage is client-only; load after hydration.
    current ??= read();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(current);
    setReady(true);
    listeners.add(setActive);
    return () => {
      listeners.delete(setActive);
    };
  }, []);

  const set = useCallback((next: Set<FilterKey>) => {
    current = next;
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      /* private mode: still works for this page */
    }
    for (const l of listeners) l(new Set(next));
  }, []);

  const toggle = useCallback(
    (k: FilterKey) => {
      const next = new Set(current ?? active);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      set(next);
    },
    [active, set],
  );

  return { active, ready, toggle, set, clear: () => set(new Set()) };
}
