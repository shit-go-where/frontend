"use client";

import { Map as MapIcon, RefreshCw, Siren } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Mascot } from "@/components/mascot";
import { Button, buttonClass } from "@/components/ui";
import { isNetworkError } from "@/lib/api/client";
import { useOnline } from "@/lib/offline";
import { reportError } from "@/lib/report-error";

/**
 * A page whose code never arrived: the network dropped while loading a chunk, or a deploy
 * replaced the chunk the old page asked for. Not a bug in the page, so don't say "it's us".
 */
function isLoadFailure(error: unknown) {
  if (isNetworkError(error)) return true;
  if (!(error instanceof Error)) return false;
  return (
    error.name === "ChunkLoadError" ||
    /loading (css )?chunk|dynamically imported module|importing a module script failed|failed to fetch/i.test(error.message)
  );
}

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const online = useOnline();
  // Load failures (no signal, or a deploy replaced the chunk) are reported too: a spike after a deploy is a finding.
  useEffect(() => reportError(error, "route"), [error]);
  const digest = error instanceof Error && "digest" in error ? (error as Error & { digest?: string }).digest : undefined;

  if (!online || isLoadFailure(error)) {
    return (
      <div role="alert" className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 pb-10 pt-14 text-center">
        <Mascot mood="lost" className="size-28" />
        <h1 className="mt-3 text-3xl leading-tight sm:text-4xl">Aiyo, this one cannot load</h1>
        <p className="max-w-sm text-muted">No signal. The app needs a connection to open this page for the first time.</p>
        <div className="mt-5 flex w-full flex-col gap-3">
          {/* Full page loads, not client navigations: the service worker can answer those from
              the saved /go and map pages, while a client navigation would need the missing code. */}
          <a href="/go?urgent=1" className={buttonClass("urgent", "lg")}>
            <Siren className="size-5" aria-hidden /> I need to go now
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={buttonClass("secondary", "lg")}>
            <MapIcon className="size-5" aria-hidden /> Back to the map
          </a>
          <Button variant="ghost" size="lg" onClick={() => (online ? window.location.reload() : retry())}>
            <RefreshCw className="size-5" aria-hidden /> Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div role="alert" className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 pb-10 pt-14 text-center">
      <Mascot mood="worried" className="size-28" />
      <h1 className="mt-3 text-3xl leading-tight sm:text-4xl">Aiyo, something went wrong</h1>
      <p className="max-w-sm text-muted">It&apos;s us, not you. Try again, or head back to the map.</p>
      {digest ? <p className="text-sm text-muted">Reference: {digest}</p> : null}
      <div className="mt-5 flex w-full flex-col gap-3">
        {/* Urgency first: even a broken page keeps the way to a toilet one tap away. */}
        <Link href="/go?urgent=1" className={buttonClass("urgent", "lg")}>
          <Siren className="size-5" aria-hidden /> I need to go now
        </Link>
        <Link href="/" className={buttonClass("secondary", "lg")}>
          <MapIcon className="size-5" aria-hidden /> Back to the map
        </Link>
        <Button variant="ghost" size="lg" onClick={() => retry()}>
          <RefreshCw className="size-5" aria-hidden /> Try again
        </Button>
      </div>
    </div>
  );
}
