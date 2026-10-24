"use client";

import { ChevronDown, Mars, Venus, VenusAndMars, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { SexPreference } from "@/lib/api/types";
import { HUE_TEXT } from "@/lib/feature-hues";
import { prefLabel, useSexPreference } from "@/lib/sex-pref";
import { useStoredFilters } from "@/lib/use-filters";
import { useLocationAskShown } from "./location-search";
import { Switch } from "./switch";
import { Button, Dialog, SlidingPill, buttonClass, cx } from "./ui";

/*
 * "Which toilets do you use?" (lib/sex-pref.ts): asked once on the map, then a chip wherever a list is
 * filtered by it (the map sheet, station and area pages) and a row in /me Settings, all opening the same
 * picker. Accessible here is the ACCESSIBLE must-have filter, switched from the same place because it's the
 * same question: which toilets can I walk into.
 */

type Choice = SexPreference | "ANY";

const OPTIONS: { value: Choice; label: string }[] = [
  { value: "MALE", label: "Men's" },
  { value: "FEMALE", label: "Women's" },
  { value: "ANY", label: "Any" },
];

const ICON: Record<Choice, React.ComponentType<{ className?: string }>> = {
  MALE: Mars,
  FEMALE: Venus,
  ANY: VenusAndMars,
};

const toChoice = (sex: SexPreference | null): Choice => sex ?? "ANY";
const fromChoice = (c: Choice): SexPreference | null => (c === "ANY" ? null : c);

/** Men's / Women's / Any as a pill track (radio group, arrow keys move), like the theme switch on /me. */
export function SexSegmented({
  value,
  onChange,
  label = "Which toilets do you use?",
  describedBy,
}: {
  value: SexPreference | null;
  onChange: (sex: SexPreference | null) => void;
  label?: string;
  describedBy?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = OPTIONS.findIndex((o) => o.value === toChoice(value));
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + OPTIONS.length) % OPTIONS.length;
    onChange(fromChoice(OPTIONS[next].value));
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      className="relative grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1"
    >
      <SlidingPill index={index} count={OPTIONS.length} />
      {OPTIONS.map((o, i) => {
        const on = i === index;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(fromChoice(o.value))}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "relative min-h-11 rounded-full px-3 text-sm font-extrabold whitespace-nowrap transition-[color,scale] duration-200 active:scale-[0.97]",
              on ? "text-primary-fg" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The Accessible switch: the ACCESSIBLE must-have, kept in step with the saved preference. */
function AccessibleSwitch() {
  const { active, toggle } = useStoredFilters();
  const { setAccessible } = useSexPreference();
  const hintId = useId();
  const on = active.has("ACCESSIBLE");
  return (
    <label className="flex min-h-11 items-center gap-3">
      <Switch
        checked={on}
        describedBy={hintId}
        onChange={(checked) => {
          if (checked !== on) toggle("ACCESSIBLE");
          setAccessible(checked);
        }}
      />
      <span className="min-w-0">
        <span className="block font-bold text-fg">Accessible toilets only</span>
        <span id={hintId} className="block text-sm font-medium text-muted">
          The same as the Accessible filter.
        </span>
      </span>
    </label>
  );
}

/** The whole picker, saving as it changes: the chip's dialog and /me Settings. */
export function SexPicker() {
  const { sex, choose } = useSexPreference();
  const hintId = useId();
  return (
    <div className="flex flex-col gap-3">
      <SexSegmented value={sex} onChange={(s) => choose(s)} describedBy={hintId} />
      <p id={hintId} className="text-sm text-muted">
        Men&apos;s and Women&apos;s also list unisex toilets and ones nobody has said yet.
      </p>
      <AccessibleSwitch />
    </div>
  );
}

/**
 * The one-time question, at the top of the map sheet's list. It waits while the location ask is up (one ask
 * at a time) and goes for good once answered or closed (closing is Any). With `peek` it is what the sheet's
 * peek shows (`data-sheet-peek`) while it's up, so the nearest card sits just under it instead of being cut off.
 */
export function SexAsk({ className, peek }: { className?: string; peek?: boolean }) {
  const { ready, asked, choose, dismiss } = useSexPreference();
  const locationAsk = useLocationAskShown();
  const titleId = useId();
  if (!ready || asked || locationAsk) return null;
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className={cx("rise-in rounded-2xl bg-primary-soft px-4 py-3 text-sm", className)}
      data-testid="sex-ask"
      data-sheet-peek={peek ? "" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <p id={titleId} className="pt-0.5 font-bold text-fg">
          Which toilets do you use?
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="tap -my-2.5 -mr-2.5 flex shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          aria-label="Not now, show every toilet"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {OPTIONS.map((o) => {
          const Icon = ICON[o.value];
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(fromChoice(o.value))}
              className={buttonClass("secondary", "sm", "px-4")}
            >
              <Icon className={cx("size-4", HUE_TEXT.taro)} aria-hidden />
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="mt-1">
        <AccessibleSwitch />
      </div>
    </div>
  );
}

/** The chip and, while it narrows the list, what it still lets through (so nobody thinks unisex ones are gone). */
export function SexPrefRow({ className }: { className?: string }) {
  const { sex } = useSexPreference();
  return (
    <div className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted", className)}>
      <SexPrefChip />
      {sex ? <span>Plus unisex and unlabelled ones</span> : null}
    </div>
  );
}

/**
 * The saved choice as a chip ("Women's", "Any toilet") that opens the picker. Candy Pink while it narrows
 * the list, as a filter that's on does; Fudge on Any.
 */
export function SexPrefChip({ className }: { className?: string }) {
  const { sex } = useSexPreference();
  const [open, setOpen] = useState(false);
  const Icon = ICON[toChoice(sex)];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cx(
          "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold transition duration-150 active:scale-[0.96]",
          sex ? "border-primary bg-primary text-primary-fg shadow-gloss" : "border-border bg-surface-2 text-fg hover:border-primary/60",
          className,
        )}
        data-testid="sex-chip"
      >
        <Icon className={cx("size-4 shrink-0", !sex && HUE_TEXT.taro)} aria-hidden />
        {prefLabel(sex)}
        <span className="sr-only">: change which toilets you see</span>
        <ChevronDown className="-mr-1 size-4 shrink-0" aria-hidden />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Which toilets do you use?"
        footer={
          <Button className="w-full" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        <SexPicker />
      </Dialog>
    </>
  );
}
