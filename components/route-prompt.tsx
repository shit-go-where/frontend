"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { api, errorMessage, isApiError } from "@/lib/api/client";
import type { StatusKind } from "@/lib/api/types";
import { loginHref } from "@/lib/auth";
import {
  PENDING_EVENT,
  PENDING_KEY,
  clearPending,
  completeByTimeout,
  promptDue,
  readPending,
  type PendingRoute,
} from "@/lib/route-session";
import { Button, cx } from "./ui";

/** One tap each, plain English: these are facts the next person needs. */
const ANSWERS: { kind: StatusKind; label: string }[] = [
  { kind: "ALL_GOOD", label: "All good" },
  { kind: "NO_PAPER", label: "No paper" },
  { kind: "NO_SOAP", label: "No soap" },
  { kind: "LONG_QUEUE", label: "Long queue" },
  { kind: "CLOSED_NOW", label: "Closed" },
];

const THANKS = "Steady lah! Thanks for keeping it fresh.";
/** Long enough to read one line, then out of the way. */
const THANKS_MS = 2600;
/** After a navigation, wait out the page transition before asking. */
const ASK_AFTER_NAV_MS = 500;

/**
 * Never over the urgent flow: all of /go (the wizard's pinned button, urgent results and the route
 * screen itself) and sign-in.
 */
function hiddenHere(pathname: string) {
  return pathname === "/go" || pathname.startsWith("/go/") || pathname === "/login";
}

/**
 * The post-route "How was {place}?" card (GROWTH.md 1.1). After a /go route (lib/route-session.ts),
 * the next app open or navigation at least 3 minutes after the start (or the "Arrived?" tap), within
 * 2 hours, shows one small card. Each answer files a status report with `afterRoute: true` (signed
 * out works: the API issues an anonymous device cookie). Answering, "Not now" or Escape clears the
 * route, so the card never comes back for it.
 *
 * Floats above the phone tab bar (bottom right on desktop), below the nav in the stacking order, and
 * never takes focus on its own; a polite live region says it is there.
 */
export function RoutePrompt() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const thanksRef = useRef<HTMLParagraphElement>(null);

  const [route, setRoute] = useState<PendingRoute | null>(null);
  const [thanks, setThanks] = useState(false);
  const [busy, setBusy] = useState<StatusKind | null>(null);
  const [error, setError] = useState<unknown>(null);

  const hidden = hiddenHere(pathname);

  // Set before the answer clears the pending route, whose change event would otherwise hide the
  // card before the thanks has rendered.
  const answered = useRef(false);

  const evaluate = useEffectEvent(() => {
    if (thanks || answered.current) return;
    completeByTimeout();
    const p = readPending();
    if (!p) {
      setRoute(null);
      return;
    }
    // Already showing this route's card: keep it as it is.
    if (route && route.toiletId === p.toiletId && route.startedAt === p.startedAt) return;
    if (hidden) return;
    setRoute(promptDue(p) ? p : null);
  });

  // Every navigation (path or query) and every return to the app is a chance to ask. A beat after
  // the page has changed, so the card doesn't arrive in the middle of the route transition.
  const search = sp.toString();
  useEffect(() => {
    const t = window.setTimeout(evaluate, ASK_AFTER_NAV_MS);
    return () => window.clearTimeout(t);
  }, [pathname, search]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === PENDING_KEY) evaluate();
    };
    const onPending = () => evaluate();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    window.addEventListener(PENDING_EVENT, onPending);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PENDING_EVENT, onPending);
    };
  }, []);

  // The thanks says its line, then the card goes.
  useEffect(() => {
    if (!thanks) return;
    const t = window.setTimeout(() => {
      // Don't strand keyboard focus on a card that is about to disappear.
      if (cardRef.current?.contains(document.activeElement)) (document.activeElement as HTMLElement | null)?.blur();
      answered.current = false;
      setThanks(false);
      setRoute(null);
    }, THANKS_MS);
    return () => window.clearTimeout(t);
  }, [thanks]);

  // Answer buttons vanish under the finger: keep keyboard focus on the thanks instead of losing it.
  // Only when focus was on the card (now on <body>): never pulls focus from elsewhere.
  useEffect(() => {
    if (!thanks) return;
    const active = document.activeElement;
    if (!active || active === document.body || cardRef.current?.contains(active)) thanksRef.current?.focus({ preventScroll: true });
  }, [thanks]);

  const dismiss = () => {
    clearPending();
    setRoute(null);
    setError(null);
  };

  const answer = async (kind: StatusKind) => {
    if (!route || busy) return;
    setBusy(kind);
    setError(null);
    try {
      await api.reportStatus(route.toiletId, kind, { afterRoute: true });
      answered.current = true;
      setThanks(true);
      clearPending();
      void qc.invalidateQueries({ queryKey: ["status", route.toiletId] });
      void qc.invalidateQueries({ queryKey: ["toilet", route.toiletId] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const show = !!route && (thanks || !hidden);
  const needsSignIn = isApiError(error) && error.status === 401;

  return (
    <>
      {/* Always mounted, so screen readers hear the card arrive without focus moving to it. */}
      <p role="status" className="sr-only">
        {show ? (thanks ? THANKS : `Quick question: how was ${route.name}?`) : ""}
      </p>
      {show ? (
        <aside
          ref={cardRef}
          aria-labelledby={thanks ? undefined : titleId}
          aria-label={thanks ? "Thanks" : undefined}
          data-testid="route-prompt"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !thanks) {
              e.stopPropagation();
              dismiss();
            }
          }}
          className={cx(
            "rise-in vt-route-prompt fixed inset-x-4 z-30 mx-auto max-w-md rounded-3xl border border-border/70 bg-surface p-4 text-fg shadow-card",
            // Phones: just above the tab bar and its bump. Desktop: bottom right, clear of the content column.
            "bottom-[calc(var(--nav-h)+var(--nav-crown)+env(safe-area-inset-bottom)+0.75rem)] md:inset-x-auto md:right-6 md:bottom-6 md:w-96",
          )}
        >
          {thanks ? (
            <p ref={thanksRef} tabIndex={-1} className="flex items-center gap-2 text-lg font-extrabold outline-none">
              <Check className="size-6 shrink-0 text-mint" aria-hidden />
              {THANKS}
            </p>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-muted">Done already? Quick one</p>
                  <h2 id={titleId} className="text-lg font-extrabold leading-tight">
                    How was {route.name}?
                  </h2>
                </div>
                <Button variant="ghost" size="sm" className="-mr-2 -mt-1 shrink-0" onClick={dismiss}>
                  Not now
                </Button>
              </div>
              <div role="group" aria-labelledby={titleId} className="mt-3 flex flex-wrap gap-2">
                {ANSWERS.map((a) => (
                  <Button
                    key={a.kind}
                    variant={a.kind === "ALL_GOOD" ? "primary" : "secondary"}
                    size="sm"
                    className="grow"
                    loading={busy === a.kind}
                    disabled={busy !== null}
                    onClick={() => void answer(a.kind)}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
              {error ? (
                <p role="alert" className="mt-2 text-sm font-medium text-danger">
                  {needsSignIn ? (
                    <>
                      This one needs an account.{" "}
                      <Link href={loginHref(`/toilets/${route.toiletId}?do=report`)} className="font-bold underline">
                        Sign in to report
                      </Link>
                    </>
                  ) : (
                    errorMessage(error)
                  )}
                </p>
              ) : null}
            </>
          )}
        </aside>
      ) : null}
    </>
  );
}
