"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, ViewTransition } from "react";

/** Covers a navigation that is slow to commit; cleared as soon as one does. */
const NO_NAVIGATION_MS = 4000;
/** Longer than the route animation in globals.css, for browsers without `activeViewTransition`. */
const SETTLE_MS = 600;

let unnameTimer = 0;
// `data-route-vt` also names the header and tab bar (globals.css), for this transition only.
function unnameRoot() {
  window.clearTimeout(unnameTimer);
  const html = document.documentElement;
  html.style.viewTransitionName = "";
  delete html.dataset.routeVt;
}
/** For a navigation started from code (router.push after a form), which no link tap announces. */
export function prepareRouteTransition() {
  nameRoot();
}

/**
 * For an in-page view transition (a tab panel swapping): names the header and tab bar, as a route
 * change does, so the sliding panel passes under them instead of over them. Unnamed once it has played.
 */
export function holdChrome() {
  document.documentElement.dataset.routeVt = "";
  window.clearTimeout(unnameTimer);
  unnameTimer = window.setTimeout(unnameRoot, SETTLE_MS);
}

/** Ends a `historyBack` transition once the page it went back to is in (RouteTransition). */
let settleBack: (() => void) | null = null;

/**
 * A real history back (so the stack stays right and the page behind keeps its scroll), animated
 * as a `pop` like "← Map". History navigations render outside a React transition, so React won't
 * animate one: this runs the view transition itself and finishes it when the new view commits.
 */
export function historyBack(back: () => void) {
  if (typeof document.startViewTransition !== "function") return back();
  nameRoot();
  const update = () =>
    new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 1000);
      settleBack = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      back();
    });
  try {
    document.startViewTransition({ update, types: ["pop"] });
  } catch {
    // No transition types here (older engines): still animate, just without the direction.
    document.startViewTransition(update);
  }
}

function nameRoot() {
  const html = document.documentElement;
  html.style.viewTransitionName = "root";
  html.dataset.routeVt = "";
  window.clearTimeout(unnameTimer);
  unnameTimer = window.setTimeout(unnameRoot, NO_NAVIGATION_MS);
}

/** A plain left click on an in-app link to another page, or another view of this one (`/go?to=…`). */
function isRouteClick(e: MouseEvent) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return false;
  const url = new URL(a.href, location.href);
  return url.origin === location.origin && (url.pathname !== location.pathname || url.search !== location.search);
}

/**
 * Every route change is a view transition of the whole viewport (globals.css "Route changes").
 *
 * React animates a route change only through a <ViewTransition> that enters or exits, so this
 * keyed marker does that on each new page or view (the path and its query, so "Take me there" counts). The root takes part only in that transition: it is
 * named as a navigation starts (a link tap, or back/forward) and unnamed once it has played,
 * because the browser ignores taps on whatever is in a running transition, and every other
 * transition (filters, loading reveals) must stay tappable. Naming the root makes the snapshot
 * exactly what was on screen, at any scroll position. The header and tab bar are named apart for
 * the same span and stay put. Tab links add `tab-left` / `tab-right` (nav.tsx) and toilet links
 * `push` / `pop` for the direction of travel.
 */
export function RouteTransition() {
  const pathname = usePathname();
  const view = `${pathname}?${useSearchParams().toString()}`;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (isRouteClick(e)) nameRoot();
    };
    // A swipe back already animated the page; don't play a second transition on top of it.
    const onPop = (e: PopStateEvent) => {
      if ("hasUAVisualTransition" in e && e.hasUAVisualTransition) unnameRoot();
      else nameRoot();
    };
    // Capture phase, so it runs before the Link's own handler starts the navigation.
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      unnameRoot();
    };
  }, []);

  // Runs inside the transition's DOM update, once the new route is in.
  useLayoutEffect(() => {
    settleBack?.();
    settleBack = null;
    if (!document.documentElement.style.viewTransitionName) return;
    window.clearTimeout(unnameTimer);
    const vt = (document as Document & { activeViewTransition?: { finished: Promise<void> } | null })
      .activeViewTransition;
    if (vt) void vt.finished.finally(unnameRoot);
    else unnameTimer = window.setTimeout(unnameRoot, SETTLE_MS);
  }, [view]);

  return (
    <ViewTransition key={view} default="route-marker">
      <span aria-hidden className="pointer-events-none fixed top-0 left-0 size-0" />
    </ViewTransition>
  );
}
