"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { historyBack } from "@/components/route-transition";
import { usePreviousPath } from "@/lib/use-previous-path";

/** Where a back button says it goes, by the page behind this one. Anything else is plain "Back". */
const LABELS: Record<string, string> = { "/": "Map", "/areas": "All areas", "/leaderboard": "Ranks" };

/**
 * Back to wherever the visitor came from in the app, named for it, with the same backwards slide
 * as a link out. Installed as an app there's no browser back button, so this is the only way back.
 * Opened fresh (a shared link, a search result), there's nothing behind it in the app, so it's a
 * plain link to `fallback` instead.
 */
export function BackButton({
  fallback,
  icon: Icon,
  iconClassName,
  className,
}: {
  fallback: { href: string; label: string };
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconClassName: string;
  className: string;
}) {
  const router = useRouter();
  const prev = usePreviousPath();
  if (!prev) {
    return (
      <Link href={fallback.href} transitionTypes={["pop"]} className={className}>
        <Icon className={iconClassName} aria-hidden />
        {fallback.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => historyBack(() => router.back())} className={className}>
      <Icon className={iconClassName} aria-hidden />
      {LABELS[prev] ?? "Back"}
    </button>
  );
}
