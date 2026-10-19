"use client";

import { Moon, Smartphone, Sun } from "lucide-react";
import { useId } from "react";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import { SlidingPill, cx } from "./ui";

/** Same order and words as the Theme setting on /me. */
const OPTIONS: { value: ThemePref; label: string; icon: typeof Moon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "Device", icon: Smartphone },
];

/**
 * A compact light / dark / device switch that works signed out (the map sheet footer, the desktop
 * header). Native radios, so arrow keys move the pick; it reads and writes the same store as /me
 * (lib/theme.ts), so the two never disagree.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const value = useThemePref();
  const name = useId();
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className="sr-only">Theme</legend>
      <div className="relative grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1">
        <SlidingPill index={OPTIONS.findIndex((o) => o.value === value)} count={OPTIONS.length} />
        {OPTIONS.map(({ value: v, label, icon: Icon }) => (
          <label
            key={v}
            className={cx(
              "relative flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-sm font-extrabold transition-[color,transform] duration-200 active:scale-[0.97]",
              "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              value === v ? "text-primary-fg" : "text-muted hover:text-fg",
            )}
          >
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => setThemePref(v)}
              className="sr-only"
            />
            <Icon className="size-4 shrink-0" aria-hidden />
            {/* Truncates rather than spilling at very large text; the radio keeps its full name. */}
            <span className="truncate">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
