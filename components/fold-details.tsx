"use client";

import { useRef, useState } from "react";
import { EASE_OUT, foldMs, reducedMotion } from "@/lib/motion";

/**
 * A native <details> that unfolds instead of snapping: the body grows to its height while
 * its content fades in, and folds away a little faster than it opened. A tap mid-way
 * reverses from wherever it is. `data-expanded` flips on the tap itself, so the chevron
 * and labels answer at once rather than when a close finishes. Reduced motion: no height
 * change, the content just fades in. Find-in-page and other native opens still work; they
 * simply don't animate.
 */
export function FoldDetails({
  summary,
  children,
  className,
  summaryClassName,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  summaryClassName?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const [expanded, setExpanded] = useState(false);

  const onClick = (e: React.MouseEvent) => {
    const details = ref.current;
    const body = bodyRef.current;
    if (!details || !body) return;
    e.preventDefault();
    const opening = !expanded;
    setExpanded(opening);

    // Where it is right now (mid-animation included), before anything is reset.
    const from = details.open ? body.getBoundingClientRect().height : 0;
    const fromOpacity = details.open ? Number(getComputedStyle(body).opacity) : 0;
    anim.current?.cancel();
    anim.current = null;

    if (reducedMotion()) {
      details.open = opening;
      if (opening) body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: EASE_OUT });
      return;
    }

    if (opening) details.open = true;
    const to = opening ? body.offsetHeight : 0;
    const full = opening ? to : from;
    const duration = opening ? foldMs(full) : Math.round(foldMs(full) * 0.75);
    body.style.overflow = "hidden";
    const a = body.animate(
      [
        { height: `${from}px`, opacity: fromOpacity },
        { height: `${to}px`, opacity: opening ? 1 : 0 },
      ],
      { duration, easing: EASE_OUT },
    );
    anim.current = a;
    a.onfinish = () => {
      if (anim.current !== a) return;
      anim.current = null;
      body.style.overflow = "";
      if (!opening) details.open = false;
    };
  };

  return (
    <details
      ref={ref}
      className={className}
      data-expanded={expanded || undefined}
      // Opened or closed some other way (find-in-page, a script): keep the state in step.
      onToggle={(e) => {
        if (!anim.current) setExpanded(e.currentTarget.open);
      }}
    >
      <summary className={summaryClassName} onClick={onClick}>
        {summary}
      </summary>
      <div ref={bodyRef}>{children}</div>
    </details>
  );
}
