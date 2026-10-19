"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY as KEY } from "./theme-script";

/** "system" (the default) follows the device; dark stays the brand's look, light is caramel. */
export type ThemePref = "system" | "light" | "dark";

export function getThemePref(): ThemePref {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  // The boot script watches data-theme and re-resolves data-scheme and the theme-color meta.
  document.documentElement.dataset.theme = pref;
}

/** The pick as the boot script applied it, so every control showing it (ThemeToggle, /me) stays in step. */
function pref(): ThemePref {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : "system";
}

function subscribePref(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

/** The live theme pick. On the server (and before hydration) it reads "system", the default. */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribePref, pref, () => "system");
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

/** The theme on screen. Server render assumes dark (the CSS defaults); the client corrects on hydration. */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, resolved, () => "dark");
}
