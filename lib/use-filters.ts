"use client";

import { useCallback, useEffect, useState } from "react";
import { FILTERS, type FilterKey } from "./filters";

const KEY = "sgw:filters";
const VALID = new Set<string>(FILTERS.map((f) => f.key));
const listeners = new Set<(v: Set<FilterKey>) => void>();

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
 * Must-have filters, shared by the map and the "Find a toilet" wizard and kept
 * across visits, so someone who always needs an accessible toilet sets it once.
 */
export function useStoredFilters() {
  const [active, setActive] = useState<Set<FilterKey>>(() => new Set());

  useEffect(() => {
    // Storage is client-only; load after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(read());
    listeners.add(setActive);
    return () => {
      listeners.delete(setActive);
    };
  }, []);

  const set = useCallback((next: Set<FilterKey>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      /* private mode: still works for this page */
    }
    for (const l of listeners) l(new Set(next));
  }, []);

  const toggle = useCallback(
    (k: FilterKey) => {
      const next = new Set(active);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      set(next);
    },
    [active, set],
  );

  return { active, toggle, set, clear: () => set(new Set()) };
}
