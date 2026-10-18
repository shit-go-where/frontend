"use client";

import { Check, CircleHelp, X } from "lucide-react";
import { useId } from "react";
import { cx } from "@/components/ui";

export type Tri = "yes" | "no" | "unknown";

/** One feature as a Yes / No / Not sure segmented row. */
export function TriToggle({ label, value, onChange }: { label: string; value: Tri; onChange: (v: Tri) => void }) {
  const name = useId();
  // Selected Yes is a solid mint fill with mint ink; No is soft danger; Not sure is plain.
  const opts: { v: Tri; text: string; icon: React.ReactNode; on: string }[] = [
    { v: "yes", text: "Yes", icon: <Check className="size-4" aria-hidden />, on: "bg-mint text-mint-fg shadow-gloss" },
    { v: "no", text: "No", icon: <X className="size-4" aria-hidden />, on: "bg-danger-soft text-danger ring-2 ring-inset ring-danger" },
    { v: "unknown", text: "Not sure", icon: <CircleHelp className="size-4" aria-hidden />, on: "bg-surface text-fg shadow-rest" },
  ];
  return (
    <fieldset
      className={cx(
        "flex items-center gap-3 rounded-[28px] border-2 bg-surface py-1.5 pl-4 pr-1.5 shadow-rest transition-colors",
        value === "unknown" ? "border-border/70" : "border-primary/70",
      )}
    >
      <legend className="sr-only">{label}</legend>
      <span aria-hidden className="min-w-0 flex-1 font-bold">
        {label}
      </span>
      <div className="flex shrink-0 gap-0.5 rounded-full bg-surface-2 p-1">
        {opts.map((o) => (
          <label
            key={o.v}
            className={cx(
              "flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-full px-3 text-sm font-extrabold transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              value === o.v ? o.on : "text-muted hover:text-fg",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.v}
              checked={value === o.v}
              onChange={() => onChange(o.v)}
              className="sr-only"
              aria-label={`${label}: ${o.text}`}
            />
            {o.icon}
            <span aria-hidden>{o.text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
