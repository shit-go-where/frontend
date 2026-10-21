"use client";

import { ChevronDown, MapPinCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/styles";
import { type Role, roleDates } from "./content";

/** Header height plus breathing room, as on the toilet page (detail-client.tsx PIN_CLEARANCE_PX). */
const PIN_CLEARANCE_PX = 80 + 24;

/**
 * The Check-ins column on desktop, pinned under the header like the toilet page's verdict column, but
 * only while all of it fits the window: a taller column (a short window, or every role opened) would
 * stay stuck with its end below the fold. Phones never stick.
 */
export function StickyColumn({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setFits(el.offsetHeight + PIN_CLEARANCE_PX <= window.innerHeight);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);
  return (
    <div ref={ref} data-fits={fits ? "" : undefined} className={cx("lg:data-fits:sticky lg:data-fits:top-20", className)}>
      {children}
    </div>
  );
}

/** Shown on phones; the rest fold behind "Show earlier check-ins". Desktop shows them all. */
const SHOWN_ON_PHONE = 2;

/**
 * Work experience as a toilet's check-ins, newest first: one compact row per role, the current role
 * with its bullets, each earlier role with its own "What I did". Two lists, so the earlier entries
 * follow their phone toggle in reading order once opened; on desktop the two read as one.
 */
export function CheckIns({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const recent = roles.slice(0, SHOWN_ON_PHONE);
  const earlier = roles.slice(SHOWN_ON_PHONE);
  return (
    <>
      <ol className="mt-3 flex flex-col">
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
            className="-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2 lg:hidden"
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
  const [open, setOpen] = useState(now);
  const id = useId();
  return (
    <li className={cx("relative py-3", first ? "pt-0" : "border-t border-border/70")}>
      <div className="flex items-start gap-3">
        {/* The current role's pin is filled, like a fresh check-in; past ones are soft. */}
        <span
          className={cx(
            "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full",
            now ? "bg-mint text-mint-fg shadow-gloss" : "bg-mint-soft text-mint",
          )}
          aria-hidden
        >
          <MapPinCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={cx("font-extrabold leading-snug", !now && "pr-28")}>{r.company}</h3>
          {/* One line, as in the sketch: "Software Engineer Intern · Jan – May 2026". */}
          <p className="text-sm font-bold text-muted">
            <span className="text-fg">{r.title}</span> · <span className="whitespace-nowrap">{roleDates(r)}</span>
            {r.location ? ` · ${r.location}` : null}
          </p>
        </div>
        {/* Beside the company, not in its own column, so the title and dates keep the full width on one line. */}
        {now ? null : (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            className="absolute -right-2 top-1.5 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-extrabold text-primary hover:bg-surface-2"
          >
            What I did
            <span className="sr-only"> at {r.company}</span>
            <ChevronDown className={cx("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
          </button>
        )}
      </div>
      {/* Always in the DOM (find-in-page, search engines); shown for the current role or once opened. */}
      <ul id={id} className={cx("mt-2 flex-col gap-1.5 pl-[3.75rem] text-sm marker:text-primary", open ? "flex list-disc" : "hidden")}>
        {r.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </li>
  );
}
