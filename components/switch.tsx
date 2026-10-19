"use client";

/**
 * The on/off switch from /me Settings: a real checkbox with role="switch" laid invisibly over a pill
 * track (Toffee Outline edge, Candy Pink once on). Put it inside a <label> with the row's words so the
 * whole row toggles it. Moved out of the leaderboard opt-in row so every settings switch is the same.
 */
export function Switch({
  checked,
  disabled,
  onChange,
  describedBy,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  describedBy?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className="flex h-8 w-14 items-center rounded-full border-2 border-border-strong bg-surface-2 p-0.5 transition peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50 [&>span]:transition peer-checked:[&>span]:translate-x-6 peer-checked:[&>span]:bg-primary-fg"
      >
        <span className="size-6 rounded-full bg-muted shadow-gloss" />
      </span>
    </span>
  );
}
