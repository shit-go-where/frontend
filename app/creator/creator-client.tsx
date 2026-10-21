"use client";

import { ChevronDown, MapPinCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/styles";
import { type Role, roleDates } from "./content";

/** Header height plus breathing room, as on the toilet page (detail-client.tsx PIN_CLEARANCE_PX). */
const STICK_TOP_PX = 80;
const STICK_BOTTOM_PX = 24;

/**
 * The Check-ins column on desktop, pinned like the toilet page's verdict column. While it fits the
 * window it sticks under the header; when it is taller, it scrolls with the page until its last entry
 * is in view and sticks there, so no check-in is ever held below the fold. Phones never stick.
 */
export function StickyColumn({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTop(Math.min(STICK_TOP_PX, window.innerHeight - el.offsetHeight - STICK_BOTTOM_PX));
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);
  return (
    <div
      ref={ref}
      // Until measured there is no top, so nothing sticks (sticky with `top: auto` stays in flow).
      style={top !== null ? ({ "--stick-top": `${top}px` } as React.CSSProperties) : undefined}
      className={cx("lg:sticky lg:top-(--stick-top)", className)}
    >
      {children}
    </div>
  );
}

/** Shown in full on phones; the rest fold behind "Show earlier check-ins". Desktop shows them all. */
const SHOWN_ON_PHONE = 2;

/**
 * Work experience as a toilet's check-ins, newest first. Two lists, so the older entries can follow
 * their own toggle in reading order once opened, and on desktop the two read as one.
 */
export function CheckIns({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const recent = roles.slice(0, SHOWN_ON_PHONE);
  const earlier = roles.slice(SHOWN_ON_PHONE);
  return (
    <>
      <ol className="mt-4 flex flex-col">
        {recent.map((r, i) => (
          <CheckIn key={`${r.company} ${r.start}`} r={r} first={i === 0} />
        ))}
      </ol>
      {earlier.length ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            className="-mx-2 mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2 lg:hidden"
          >
            {open ? "Hide earlier check-ins" : `Show earlier check-ins (${earlier.length})`}
            <ChevronDown className={cx("size-5 transition-transform duration-200", open && "rotate-180")} aria-hidden />
          </button>
          <ol id={id} start={SHOWN_ON_PHONE + 1} className={cx("flex-col", open ? "flex" : "hidden lg:flex")}>
            {earlier.map((r) => (
              <CheckIn key={`${r.company} ${r.start}`} r={r} />
            ))}
          </ol>
        </>
      ) : null}
    </>
  );
}

function CheckIn({ r, first }: { r: Role; first?: boolean }) {
  const now = r.end === null;
  return (
    <li className={cx("flex gap-3 py-4", first ? "pt-0" : "border-t border-border/70")}>
      {/* The current role's pin is filled, like a fresh check-in; past ones are soft. */}
      <span
        className={cx(
          "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full",
          now ? "bg-mint text-mint-fg shadow-gloss" : "bg-mint-soft text-mint",
        )}
        aria-hidden
      >
        <MapPinCheck className="size-5" />
      </span>
      <div className="min-w-0">
        <h3 className="leading-snug">
          <span className="block font-extrabold">{r.company}</span>
          <span className="block font-bold">{r.title}</span>
        </h3>
        <p className="text-sm font-bold text-muted">
          {roleDates(r)}
          {r.location ? ` · ${r.location}` : null}
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm marker:text-primary">
          {r.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}
