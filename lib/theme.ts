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

function resolved(): "light" | "dark" {
  const attr = document.documentElement.dataset.theme;
  if (attr === "light") return "light";
  if (attr === "system") return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  return "dark";
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", cb);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    mq.removeEventListener("change", cb);
    mo.disconnect();
  };
}

export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, resolved, () => "dark");
}
