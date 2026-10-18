"use client";

import { LoaderCircle, RefreshCw, Star, TriangleAlert, X } from "lucide-react";
import { forwardRef, useEffect, useId, useRef } from "react";
import { Mascot, type MascotMood } from "./mascot";
import { SIZES, VARIANTS, buttonClass, cx, type ButtonSize, type ButtonVariant } from "./styles";

export { buttonClass, cx };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-extrabold transition disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function Chip({
  active,
  onClick,
  children,
  className,
  size = "md",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 font-bold transition",
        size === "lg" ? "min-h-12 px-5 text-base" : "min-h-11 px-4 text-sm",
        active
          ? "border-primary bg-primary text-primary-fg shadow-gloss"
          : "border-border bg-surface-2 text-fg hover:border-primary/60",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-6 text-muted">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("sheen rounded-2xl bg-surface-2", className)} />;
}

/** Empty states are where the mascot is allowed to talk. */
export function EmptyState({
  title,
  children,
  icon,
  mascot,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  mascot?: MascotMood;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {mascot ? <Mascot mood={mascot} className="mb-1 size-20" /> : icon ? <div className="text-muted">{icon}</div> : null}
      <h3 className="font-display text-xl">{title}</h3>
      {children ? <div className="max-w-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-3xl bg-danger-soft px-4 py-6 text-center">
      <Mascot mood="worried" className="size-14" />
      <p className="flex items-center gap-1.5 font-bold">
        <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden />
        {message}
      </p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // cx doesn't merge Tailwind classes, so only add the default fill when the caller didn't pass one.
      className={cx("rounded-3xl border border-border/70 p-4 shadow-rest", !/(^|\s)bg-/.test(className ?? "") && "bg-surface", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Stars({ value, max = 5, label }: { value: number; max?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${value} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cx("size-4", i < Math.round(value) ? "fill-accent text-accent" : "text-border")}
        />
      ))}
    </span>
  );
}

export function StarInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1 font-semibold">{label}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="tap flex cursor-pointer items-center justify-center rounded-lg">
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
            />
            <Star
              aria-hidden
              className={cx(
                "size-9 rounded-md peer-focus-visible:outline-3 peer-focus-visible:outline-ring",
                n <= value ? "fill-accent text-accent" : "text-muted",
              )}
            />
            <span className="sr-only">
              {n} star{n > 1 ? "s" : ""}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Accessible modal built on <dialog> (focus trap + Esc for free). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // Close when the route is hidden by <Activity> so it doesn't reappear open.
  useEffect(() => () => ref.current?.close(), []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto mb-0 w-full max-w-lg rounded-t-[28px] border-t border-border bg-surface p-0 text-fg shadow-card backdrop:bg-[var(--overlay)] backdrop:backdrop-blur-[2px] sm:mb-auto sm:rounded-[28px] sm:border"
    >
      {open ? (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 id={titleId} className="text-xl">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="tap rounded-full p-2 hover:bg-surface-2" aria-label="Close">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-4">{children}</div>
          {footer ? <div className="border-t border-border px-4 py-3 safe-bottom">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-full bg-surface-2 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            "min-h-11 flex-1 rounded-full px-3 text-sm font-extrabold transition",
            value === t.value ? "bg-primary text-primary-fg shadow-gloss" : "text-muted hover:text-fg",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-bold">
        {label}
      </label>
      {children}
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "min-h-12 w-full rounded-2xl border-2 border-border bg-surface-2 px-4 py-2 text-base text-fg placeholder:text-muted focus:border-primary";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-4 flex flex-col gap-1">
      <h1 className="text-3xl leading-tight">{title}</h1>
      {subtitle ? <p className="text-muted">{subtitle}</p> : null}
      {children}
    </header>
  );
}
