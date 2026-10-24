"use client";

import { Check, ChevronDown, Mars, Venus, VenusAndMars, X } from "lucide-react";
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
 * filtered by it (the map's "Filters on" row, the sheet on desktop, station and area pages) and a row in /me
 * Settings, all opening the same picker. The picker's Accessible switch is the ACCESSIBLE must-have filter,
 * switched from the same place because it's the same question: which toilets can I walk into.
 */

type Choice = SexPreference | "ALL";

/** The two answers, as the main buttons. "Show all toilets" (null, no filter) sits under them as the quiet option. */
const OPTIONS: { value: SexPreference; label: string }[] = [
  { value: "MALE", label: "Men's" },
  { value: "FEMALE", label: "Women's" },
];
const ALL_LABEL = "Show all toilets";
/** Every radio in arrow-key order: the two pills, then "Show all toilets". */
const CHOICES: Choice[] = ["MALE", "FEMALE", "ALL"];

const ICON: Record<Choice, React.ComponentType<{ className?: string }>> = {
  MALE: Mars,
  FEMALE: Venus,
  ALL: VenusAndMars,
};

const toChoice = (sex: SexPreference | null): Choice => sex ?? "ALL";
const fromChoice = (c: Choice): SexPreference | null => (c === "ALL" ? null : c);

/**
 * Men's / Women's as a pill track, with "Show all toilets" under it as a text-style option: one radio group
 * (arrow keys move through all three), like the theme switch on /me.
 */
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
  const current = toChoice(value);
  const index = CHOICES.indexOf(current);
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + CHOICES.length) % CHOICES.length;
    onChange(fromChoice(CHOICES[next]));
    refs.current[next]?.focus();
  };
  const all = current === "ALL";
  return (
    <div role="radiogroup" aria-label={label} aria-describedby={describedBy} className="flex flex-col items-start gap-1">
      <div className="relative grid w-full grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
        {all ? null : <SlidingPill index={index} count={OPTIONS.length} />}
        {OPTIONS.map((o, i) => (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={current === o.value}
            tabIndex={current === o.value ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "relative min-h-11 rounded-full px-3 text-sm font-extrabold whitespace-nowrap transition-[color,scale] duration-200 active:scale-[0.97]",
              current === o.value ? "text-primary-fg" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {/* The quiet third answer: a link-like radio, a soft pill with a tick once it's the one picked. */}
      <button
        ref={(el) => {
          refs.current[OPTIONS.length] = el;
        }}
        type="button"
        role="radio"
        aria-checked={all}
        tabIndex={all ? 0 : -1}
        onClick={() => onChange(null)}
        onKeyDown={(e) => onKeyDown(e, OPTIONS.length)}
        className={cx(
          "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm transition-[color,background-color,scale] duration-200 active:scale-[0.97]",
          all ? "bg-primary-soft font-extrabold text-fg" : "font-semibold text-primary underline-offset-2 hover:underline",
        )}
      >
        {all ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
        {ALL_LABEL}
      </button>
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
 * at a time) and goes for good once answered or closed (closing shows all toilets). With `peek` it is what the sheet's
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
      className={cx("rise-in rounded-2xl bg-primary-soft px-4 pb-2 pt-2.5 text-sm", className)}
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
      {/*
        One row, so the card (the sheet's peek) stays short: the quiet option may wrap onto two short lines.
        Accessible isn't asked here: it's a filter like any other, and Filters has it.
      */}
      <div className="mt-1.5 flex items-center gap-2">
        {OPTIONS.map((o) => {
          const Icon = ICON[o.value];
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              className={buttonClass("secondary", "sm", "shrink-0 px-4")}
            >
              <Icon className={cx("size-4", HUE_TEXT.taro)} aria-hidden />
              {o.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => choose(null)}
          className="min-h-11 min-w-0 px-1 text-left leading-tight font-semibold text-primary underline-offset-2 hover:underline"
        >
          {ALL_LABEL}
        </button>
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
 * The saved choice as a chip ("Women's", "All toilets") that opens the picker. Candy Pink while it narrows
 * the list, as a filter that's on does; Fudge on all toilets.
 */
export function SexPrefChip({
  className,
  onOpenChange,
}: {
  className?: string;
  /** Where the chip only shows while a choice narrows the list, so "Show all toilets" doesn't unmount its own dialog. */
  onOpenChange?: (open: boolean) => void;
}) {
  const { sex } = useSexPreference();
  const [open, setOpenState] = useState(false);
  const setOpen = (o: boolean) => {
    setOpenState(o);
    onOpenChange?.(o);
  };
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
