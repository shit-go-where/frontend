"use client";

import { useId, useState } from "react";
import { LEVEL_CHIPS, normalizeLevel } from "@/lib/level";
import { Chip, inputClass } from "./ui";

const isChip = (v: string | null): v is (typeof LEVEL_CHIPS)[number] => !!v && (LEVEL_CHIPS as readonly string[]).includes(v);

/**
 * Which floor a toilet is on: one tap for the common floors, "Other…" for the rest (mezzanines,
 * "B1 and L3", a 12th floor). What's typed is tidied on blur ("level 4" → "L4"), the way the API
 * stores it, so people see the form their level will take.
 */
export function LevelPicker({
  label,
  hint,
  value,
  onChange,
  required,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (level: string) => void;
  /** Says so in the legend; the form decides what that blocks. */
  required?: boolean;
}) {
  const ids = useId();
  const norm = normalizeLevel(value);
  const [other, setOther] = useState(() => !!value.trim() && !isChip(norm));
  const picked = !other && isChip(norm) ? norm : null;

  return (
    <fieldset aria-describedby={hint ? `${ids}-hint` : undefined}>
      <legend className="font-bold">
        {label}
        {required ? <span className="font-medium text-muted"> (needed here)</span> : null}
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {LEVEL_CHIPS.map((l) => (
          <Chip
            key={l}
            active={picked === l}
            onClick={() => {
              setOther(false);
              // A second tap on the picked floor clears it.
              onChange(picked === l ? "" : l);
            }}
            className="min-w-14 px-3 tabular-nums"
          >
            {l}
          </Chip>
        ))}
        <Chip
          active={other}
          onClick={() => {
            if (other) {
              setOther(false);
              onChange("");
            } else {
              setOther(true);
              // A chip's floor isn't an "other" one; start the field empty.
              if (picked) onChange("");
            }
          }}
          className="px-3"
        >
          Other…
        </Chip>
      </div>
      {other ? (
        <input
          id={`${ids}-other`}
          aria-label={`${label}: another floor`}
          className={`${inputClass} mt-2`}
          maxLength={20}
          placeholder="M, B4, L12, B1 and L3…"
          // It appears because they asked to type one.
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const n = normalizeLevel(value);
            onChange(n ?? "");
            // Typed one of the chips' floors: show it as that chip.
            if (isChip(n)) setOther(false);
          }}
        />
      ) : null}
      {hint ? (
        <p id={`${ids}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
