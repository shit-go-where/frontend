"use client";

import { ClipboardCheck, Map as MapIcon, Plus, Shield, Trophy, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { hasRole, useMe } from "@/lib/auth";
import { Logo } from "./logo";
import { Mascot } from "./mascot";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Map", icon: MapIcon },
  { href: "/add", label: "Add", icon: Plus },
  { href: "/leaderboard", label: "Ranks", icon: Trophy },
  { href: "/me", label: "Me", icon: User },
] as const;

function isActive(pathname: string | null, href: string, urgent = false) {
  if (!pathname) return false;
  // Urgent mode belongs to the red button, not the calm "Find a toilet" link.
  if (href === "/go" && urgent) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function BottomNavInner({ pathname }: { pathname: string | null }) {
  const left = ITEMS.slice(0, 2);
  const right = ITEMS.slice(2);
  const item = (it: (typeof ITEMS)[number]) => {
    const active = isActive(pathname, it.href);
    const Icon = it.icon;
    return (
      <Link
        key={it.href}
        href={it.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-extrabold",
          active ? "text-primary" : "text-muted hover:text-fg",
        )}
      >
        <Icon className="size-6" aria-hidden />
        {it.label}
      </Link>
    );
  };
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-[28px] border-t border-border bg-surface safe-bottom shadow-card md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-end px-2">
        {left.map(item)}
        <div className="flex flex-[1.4] justify-center">
          <NeedToGoButton compact />
        </div>
        {right.map(item)}
      </div>
    </nav>
  );
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
 * The signature move: the glossy poo mascot is the panic button. It squishes on
 * press and plops back; its red ring pulse is the app's only perpetual motion.
 */
export function NeedToGoButton({ compact, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <Link
        href="/go?urgent=1"
        prefetch
        className={cx("group -mt-10 flex w-full max-w-[9.5rem] flex-col items-center gap-1 pb-1.5", className)}
        data-testid="need-to-go"
      >
        <span className="urgent-pulse flex size-[76px] items-center justify-center rounded-full bg-urgent shadow-gloss ring-[5px] ring-surface">
          <Mascot mood="worried" className="mascot-press -mt-1 size-[58px]" />
        </span>
        <span className="font-display text-[13px] leading-none whitespace-nowrap text-urgent">I NEED TO GO</span>
      </Link>
    );
  }
  return (
    <Link
      href="/go?urgent=1"
      prefetch
      className={cx(
        "group urgent-pulse flex min-h-14 items-center justify-center gap-2 rounded-full bg-urgent pl-2 pr-6 text-urgent-fg shadow-gloss",
        className,
      )}
      data-testid="need-to-go"
    >
      <Mascot mood="worried" className="mascot-press size-11" />
      <span className="font-display text-lg leading-none">I NEED TO GO</span>
    </Link>
  );
}

function HeaderInner({ pathname, urgent = false }: { pathname: string | null; urgent?: boolean }) {
  const { data: me } = useMe();
  const links = [
    { href: "/", label: "Map" },
    { href: "/go", label: "Find a toilet" },
    { href: "/add", label: "Add a toilet" },
    { href: "/review", label: "Review" },
    { href: "/leaderboard", label: "Leaderboard" },
  ];
  return (
    <header className="sticky top-0 z-40 hidden border-b border-border bg-surface md:block">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="Shit Go Where home">
          <Logo className="size-9" />
          <span className="font-display text-lg leading-none">Shit Go Where</span>
        </Link>
        <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-0.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(pathname, l.href, urgent) ? "page" : undefined}
              className={cx(
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-extrabold",
                isActive(pathname, l.href, urgent) ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {l.label}
            </Link>
          ))}
          {hasRole(me, "MODERATOR") ? (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-extrabold text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Shield className="size-4" aria-hidden /> Admin
            </Link>
          ) : null}
        </nav>
        <NeedToGoButton />
        <Link
          href="/me"
          className="flex min-h-11 items-center gap-2 rounded-full border-2 border-border px-4 text-sm font-extrabold hover:border-primary"
        >
          <User className="size-4" aria-hidden />
          {me ? (me.handle ?? me.displayName) : "Sign in"}
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

export function MobileTopBar({ title, back = "/" }: { title: string; back?: string }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface px-2 md:hidden">
      <Link href={back} className="tap flex items-center justify-center rounded-full" aria-label="Back">
        <Logo className="size-8" />
      </Link>
      <span className="truncate font-display">{title}</span>
      <Link href="/review" className="tap ml-auto flex items-center justify-center rounded-full text-muted" aria-label="Review queue">
        <ClipboardCheck className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
