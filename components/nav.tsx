"use client";

import { ClipboardCheck, Map as MapIcon, Plus, Shield, Trophy, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { Me } from "@/lib/api/types";
import { hasRole, loginHref, useMe } from "@/lib/auth";
import { Logo } from "./logo";
import { Mascot } from "./mascot";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Map", icon: MapIcon, auth: false },
  { href: "/add", label: "Add", icon: Plus, auth: true },
  { href: "/leaderboard", label: "Ranks", icon: Trophy, auth: false },
  { href: "/me", label: "Me", icon: User, auth: true },
] as const;

/** Left-to-right tab order on each surface, so a route transition can glide the way you moved. */
const BOTTOM_ORDER = ["/", "/add", "/go", "/leaderboard", "/me"];
const HEADER_ORDER = ["/", "/go", "/add", "/review", "/leaderboard", "/me"];

function tabIndex(order: string[], path: string | null) {
  if (!path) return -1;
  return order.findLastIndex((p) => (p === "/" ? path === "/" : path === p || path.startsWith(p + "/")));
}

/** `tab-right` / `tab-left` for globals.css; none between non-tabs, which then just crossfade. */
function tabTypes(order: string[], from: string | null, to: string) {
  const a = tabIndex(order, from);
  const b = tabIndex(order, to);
  return a < 0 || b < 0 || a === b ? undefined : [b > a ? "tab-right" : "tab-left"];
}

function isActive(pathname: string | null, href: string, urgent = false) {
  if (!pathname) return false;
  // Urgent mode belongs to the red button, not the calm "Help me choose" link.
  if (href === "/go" && urgent) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * The tapped tab lights up at once, before the route has finished loading, and
 * hands back to the real pathname when it arrives.
 */
function usePendingTab(pathname: string | null) {
  const [pending, setPending] = useState<{ href: string; from: string | null } | null>(null);
  const live = pending && pending.from === pathname ? pending.href : null;
  const onNavigate = (href: string) => (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    setPending({ href, from: pathname });
  };
  const activeFor = (href: string, urgent = false) => (live ? href === live : isActive(pathname, href, urgent));
  return { activeFor, onNavigate };
}

function BottomNavInner({ pathname }: { pathname: string | null }) {
  const { activeFor, onNavigate } = usePendingTab(pathname);
  const { data: me } = useMe();
  // Known signed out: go straight to sign-in instead of loading a page that only redirects there.
  const signedOut = me === null;
  const unseen = hasUnseenActivity(me);
  const left = ITEMS.slice(0, 2);
  const right = ITEMS.slice(2);
  const item = (it: (typeof ITEMS)[number]) => {
    const active = activeFor(it.href);
    const Icon = it.icon;
    const dot = it.href === "/me" && unseen;
    return (
      <Link
        key={it.href}
        href={it.auth && signedOut ? loginHref(it.href) : it.href}
        transitionTypes={tabTypes(BOTTOM_ORDER, pathname, it.href)}
        onClick={onNavigate(it.href)}
        aria-current={isActive(pathname, it.href) ? "page" : undefined}
        className={cx(
          // min-w-0 and a truncating label, so very large text shrinks the tabs instead of widening the page.
          "group/tab flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 pb-2 text-xs font-extrabold transition-colors duration-150",
          active ? "text-primary" : "text-muted hover:text-fg",
        )}
      >
        {dot ? (
          <span className="relative shrink-0">
            <Icon className="size-6 shrink-0 transition-transform duration-100 group-active/tab:scale-90" aria-hidden />
            <UnseenDot />
          </span>
        ) : (
          <Icon className="size-6 shrink-0 transition-transform duration-100 group-active/tab:scale-90" aria-hidden />
        )}
        <span className="max-w-full truncate">{it.label}</span>
        {dot ? <span className="sr-only"> (new activity)</span> : null}
      </Link>
    );
  };
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-[28px] border-t border-border bg-surface safe-bottom shadow-card vt-tab-bar md:hidden"
    >
      {/*
        The bar's own bump, cradling the seated disc: one continuous edge, so nothing behind shows beside it.
        It rises --nav-crown and ends flat on the bar's top line, covering that line where it runs under.
        Below the pulse (z -1) and above the bar's fill.
      */}
      <svg
        aria-hidden
        viewBox="0 0 128 17"
        preserveAspectRatio="none"
        // 128px around the 60px disc, and in step with it when the disc shrinks or grows (--nav-disc).
        className="nav-bump pointer-events-none absolute left-1/2 -z-[2] h-[calc(var(--nav-crown)+1px)] w-[calc(var(--nav-disc)*2.13)] -translate-x-1/2 top-[calc(var(--nav-crown)*-1)]"
      >
        <path d="M0 17C22 17 30 0.5 64 0.5S106 17 128 17Z" className="fill-surface" />
        <path d="M0 16.5C22 16.5 30 0.5 64 0.5S106 16.5 128 16.5" className="fill-none stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mx-auto flex h-[var(--nav-h)] max-w-lg items-stretch px-2">
        {left.map(item)}
        {/* Never narrower than the disc: when space runs out (zoomed text, small phones) the tabs truncate instead. */}
        <div className="flex min-w-[calc(var(--nav-disc)+0.75rem)] flex-[1.3] justify-center">
          <NeedToGoButton compact transitionTypes={tabTypes(BOTTOM_ORDER, pathname, "/go")} />
        </div>
        {right.map(item)}
      </div>
    </nav>
  );
}

/**
 * Something happened since they last looked at /me (a decision on a submission, a badge, points, or
 * people sent to toilets they helped). `routed` may be missing from a Me cached before it existed.
 */
function hasUnseenActivity(me: Me | null | undefined) {
  const u = me?.unseen;
  return !!u && u.resolvedSubmissions + u.badges + u.points + (u.routed ?? 0) > 0;
}

/** Mint, the good-news colour; ringed in the bar's surface so it reads on the icon. */
function UnseenDot() {
  return <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-mint ring-2 ring-surface" />;
}

function PathBottomNav() {
  return <BottomNavInner pathname={usePathname()} />;
}

export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavInner pathname={null} />}>
      <PathBottomNav />
    </Suspense>
  );
}

/**
 * Letting go plays the plop from the pressed squish (globals.css `[data-plop]`), on touch
 * as well as mouse. Reduced motion stands the CSS down, so this needs no check of its own.
 */
const plopOnRelease = {
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    delete el.dataset.plop;
    void el.offsetWidth; // restart a plop that's still running
    el.dataset.plop = "";
  },
  onAnimationEnd: (e: React.AnimationEvent<HTMLElement>) => {
    if (e.animationName === "sgw-plop-release") delete e.currentTarget.dataset.plop;
  },
};

/**
 * The signature move: the glossy poo mascot is the panic button. It squishes on
 * press and plops back; its red ring pulse is the app's only perpetual motion.
 */
export function NeedToGoButton({
  compact,
  className,
  transitionTypes,
}: {
  compact?: boolean;
  className?: string;
  transitionTypes?: string[];
}) {
  if (compact) {
    return (
      <Link
        href="/go?urgent=1"
        prefetch
        transitionTypes={transitionTypes}
        // Seated: the disc's ring sits inside the bar's bump, so it rises only --nav-crown above the bar.
        // The focus ring goes on the disc, not the column.
        className={cx(
          "group -mt-[calc(var(--nav-crown)-0.3125rem)] flex w-full max-w-[9.5rem] flex-col items-center gap-1 pb-2 focus-visible:outline-none",
          className,
        )}
        data-testid="need-to-go"
        {...plopOnRelease}
      >
        {/* The pulse spreads 10px past the disc (60px at rest), so it starts at about 60 / 80 of its size. */}
        <span className="urgent-pulse flex size-[var(--nav-disc)] shrink-0 items-center justify-center rounded-full bg-urgent shadow-gloss ring-[5px] ring-surface [--pulse-from:0.75] [--pulse-spread:10px] group-focus-visible:outline-3 group-focus-visible:outline-offset-[7px] group-focus-visible:outline-ring group-focus-visible:outline-solid">
          <Mascot mood="worried" className="mascot-press -mt-0.5 size-[calc(var(--nav-disc)*0.77)]" />
        </span>
        {/*
          One line at rest, borrowing a little of the neighbouring tabs' empty sides (their labels are short and centred).
          When that isn't enough (zoomed or enlarged text) it shrinks towards 10px, then breaks into "I NEED / TO GO".
        */}
        <span className="w-max max-w-[calc(100%+min(2rem,9vw))] text-center font-display text-[length:clamp(0.625rem,3.6vw,0.8125rem)] leading-[1.05] text-balance text-urgent">
          I NEED TO GO
        </span>
      </Link>
    );
  }
  return (
    <Link
      href="/go?urgent=1"
      prefetch
      transitionTypes={transitionTypes}
      className={cx(
        // 48px tall with an 8px pulse, so it stays inside the 64px header instead of clipping at the screen edge.
        // The pulse starts at 48 / 64 of its height and a little under the pill's width, hidden behind it.
        "group urgent-pulse flex min-h-12 items-center justify-center gap-2 rounded-full bg-urgent pl-2 pr-5 text-urgent-fg shadow-gloss [--pulse-from-x:0.9] [--pulse-from-y:0.75] [--pulse-spread:8px]",
        className,
      )}
      data-testid="need-to-go"
      {...plopOnRelease}
    >
      {/* 36px in the 48px pill, so the mascot sits clear of the rim. */}
      <Mascot mood="worried" className="mascot-press size-9" />
      <span className="font-display text-lg leading-none">I NEED TO GO</span>
    </Link>
  );
}

function HeaderInner({ pathname, urgent = false }: { pathname: string | null; urgent?: boolean }) {
  const { data: me } = useMe();
  const { activeFor, onNavigate } = usePendingTab(pathname);
  const signedOut = me === null;
  const links = [
    { href: "/", label: "Map", auth: false },
    // Same name as the map sheet's link to this page on phones.
    { href: "/go", label: "Help me choose", auth: false },
    { href: "/add", label: "Add a toilet", auth: true },
    { href: "/review", label: "Review", auth: true },
    { href: "/leaderboard", label: "Leaderboard", auth: false },
  ];
  // Known signed out: go straight to sign-in instead of loading a page that only redirects there.
  const target = (href: string, auth: boolean) => (auth && signedOut ? loginHref(href) : href);
  return (
    // Sticks under the status-bar band (zero outside the installed app); the body already pads for side notches.
    <header className="sticky top-[env(safe-area-inset-top)] z-40 hidden border-b border-border bg-surface vt-site-header md:block">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link
          href="/"
          transitionTypes={tabTypes(HEADER_ORDER, pathname, "/")}
          className="flex min-h-11 items-center gap-2"
          aria-label="Shit Go Where home"
        >
          <Logo className="size-9" />
          <span className="font-display text-lg leading-none">Shit Go Where</span>
        </Link>
        <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-0.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={target(l.href, l.auth)}
              transitionTypes={tabTypes(HEADER_ORDER, pathname, l.href)}
              onClick={onNavigate(l.href)}
              aria-current={isActive(pathname, l.href, urgent) ? "page" : undefined}
              className={cx(
                "inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-sm font-extrabold transition-colors duration-150 active:scale-[0.96]",
                activeFor(l.href, urgent) ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {l.label}
            </Link>
          ))}
          {hasRole(me, "MODERATOR") ? (
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center gap-1 rounded-full px-3.5 text-sm font-extrabold text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Shield className="size-4" aria-hidden /> Admin
            </Link>
          ) : null}
        </nav>
        <NeedToGoButton transitionTypes={tabTypes(HEADER_ORDER, pathname, "/go")} />
        <Link
          href={target("/me", true)}
          transitionTypes={tabTypes(HEADER_ORDER, pathname, "/me")}
          onClick={onNavigate("/me")}
          className="flex min-h-11 items-center gap-2 rounded-full border-2 border-border px-4 text-sm font-extrabold hover:border-primary"
        >
          <span className="relative">
            <User className="size-4" aria-hidden />
            {hasUnseenActivity(me) ? <UnseenDot /> : null}
          </span>
          {me ? (me.handle ?? me.displayName) : "Sign in"}
          {hasUnseenActivity(me) ? <span className="sr-only"> (new activity)</span> : null}
        </Link>
      </div>
    </header>
  );
}

function PathHeader() {
  const urgent = useSearchParams().get("urgent") === "1";
  return <HeaderInner pathname={usePathname()} urgent={urgent} />;
}

export function SiteHeader() {
  return (
    <Suspense fallback={<HeaderInner pathname={null} />}>
      <PathHeader />
    </Suspense>
  );
}

/** Phones have no header, so this carries the links the bottom bar has no room for: Review, and Admin for moderators. */
export function MobileTopBar({ title, back = "/" }: { title: string; back?: string }) {
  const { data: me } = useMe();
  const pill =
    "tap inline-flex items-center justify-center gap-1.5 rounded-full px-3 text-sm font-extrabold text-muted hover:bg-surface-2 hover:text-fg active:scale-[0.96]";
  return (
    // The body pads for the status bar once, so this only sticks under that band instead of padding for it again.
    <div className="sticky top-[env(safe-area-inset-top)] z-30 flex h-14 items-center gap-2 border-b border-border bg-surface px-2 md:hidden">
      <Link href={back} className="tap flex items-center justify-center rounded-full" aria-label="Back to map">
        <Logo className="size-8" />
      </Link>
      <span className="min-w-0 truncate font-display">{title}</span>
      <div className="ml-auto flex items-center">
        <Link href="/review" className={pill}>
          <ClipboardCheck className="size-5" aria-hidden /> Review
        </Link>
        {hasRole(me, "MODERATOR") ? (
          <Link href="/admin" className={pill}>
            <Shield className="size-5" aria-hidden /> Admin
          </Link>
        ) : null}
      </div>
    </div>
  );
}
