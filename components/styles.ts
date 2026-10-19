// Plain class helpers usable from both Server and Client Components.

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "urgent" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

export const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg shadow-gloss hover:brightness-105 active:translate-y-px",
  secondary: "bg-surface-2 text-fg border border-border hover:brightness-110 active:translate-y-px",
  ghost: "bg-transparent text-fg hover:bg-surface-2",
  urgent: "bg-urgent text-urgent-fg shadow-gloss hover:brightness-105 active:translate-y-px",
  danger: "bg-danger text-danger-fg shadow-gloss hover:brightness-105",
};

export const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-6 text-lg",
  xl: "min-h-16 px-7 text-xl",
};

/** Button look for links. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-extrabold transition",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}
