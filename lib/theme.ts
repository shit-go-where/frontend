"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY as KEY } from "./theme-script";

/** Dark is the default look; "system" follows the device. */
export type ThemePref = "system" | "light" | "dark";

export function getThemePref(): ThemePref {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "system" ? t : "dark";
  } catch {
    return "dark";
  }
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "dark") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  const el = document.documentElement;
  if (pref === "dark") delete el.dataset.theme;
  else el.dataset.theme = pref;
}

/** The boot script resolves data-theme and the device setting into data-scheme. */
function resolved(): "light" | "dark" {
  return document.documentElement.dataset.scheme === "light" ? "light" : "dark";
}

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme"] });
  return () => mo.disconnect();
}

export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, resolved, () => "dark");
}
