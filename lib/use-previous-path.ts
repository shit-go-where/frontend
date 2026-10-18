"use client";

import { useSyncExternalStore } from "react";

/** The slice of the Navigation API used here (not in TypeScript's DOM types everywhere yet). */
interface NavigationLike extends EventTarget {
  canGoBack: boolean;
  currentEntry: { index: number } | null;
  entries(): { url: string | null }[];
}

function navigation(): NavigationLike | undefined {
  return (window as unknown as { navigation?: NavigationLike }).navigation;
}

function subscribe(onChange: () => void) {
  const nav = navigation();
  nav?.addEventListener("currententrychange", onChange);
  return () => nav?.removeEventListener("currententrychange", onChange);
}

function read(): string | null {
  const nav = navigation();
  if (!nav?.canGoBack || !nav.currentEntry) return null;
  const prev = nav.entries()[nav.currentEntry.index - 1];
  return prev?.url ? new URL(prev.url).pathname : null;
}

/**
 * The path of the in-app page behind this one, or null when there is none: opened fresh from a
 * link or search, on the server, or without the Navigation API. Its history only lists this
 * site's own pages, so going back to this path never walks out of the app. Installed as an app
 * there's no browser back button, so pages offer their own.
 */
export function usePreviousPath(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
