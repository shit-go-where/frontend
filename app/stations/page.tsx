import { Map as MapIcon, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ErrorState, Skeleton } from "@/components/ui";
import { getLineBoardServer, getStationsServer } from "@/lib/api/server";
import { LineBoard } from "./line-board";
import { StationDirectory } from "./station-directory";

const description =
  "Every MRT and LRT station in Singapore, line by line: whether there's a toilet inside, how clean it is, when someone last checked, and where to go when there isn't one.";

export const metadata: Metadata = {
  title: "Toilets at every MRT station",
  description,
  alternates: { canonical: "/stations" },
  // Images named here: a page's openGraph replaces the root's whole, so the default card would be lost.
  openGraph: {
    title: "Toilets at every MRT station · Shit Go Where",
    description,
    url: "/stations",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
};

async function Stations() {
  const [r, lines] = await Promise.all([getStationsServer(), getLineBoardServer()]);
  if (r.kind !== "ok") {
    return (
      <div className="mt-6">
        <ErrorState message={`Aiyo, couldn't load the stations. ${r.kind === "error" ? r.message : ""} Refresh to try again.`} />
      </div>
    );
  }
  // Grouped by line, with a name search (station-directory.tsx). The line board is a bonus: if it
  // fails to load, the directory still shows.
  return (
    <>
      <StationDirectory stations={r.data.items} />
      {lines.kind === "ok" ? <LineBoard rows={lines.data.items} /> : null}
    </>
  );
}

function StationsSkeleton() {
  return (
    <div aria-busy>
      <span className="sr-only">Loading stations…</span>
      <Skeleton className="mt-2 h-5 w-3/4" />
      <Skeleton className="mt-6 h-5 w-28" />
      <Skeleton className="mt-1.5 h-12" />
      <Skeleton className="mt-4 h-11 w-2/3 rounded-full" />
      <Skeleton className="mt-6 h-8 w-48" />
      <Skeleton className="mt-3 h-96 rounded-3xl" />
    </div>
  );
}

export default function StationsPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6">
      <h1 className="text-3xl leading-tight text-balance sm:text-4xl">Toilets at every MRT station</h1>
      <p className="mt-2 text-muted text-pretty">
        Is there a toilet inside, is it inside the fare gates, and is it any good? Pick your station. Some have none, and we&apos;ll tell
        you where to go instead.
      </p>
      <div className="mt-1 flex flex-wrap gap-x-4">
        <Link
          href="/areas"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2"
        >
          <MapIcon className="size-5" aria-hidden />
          Or browse toilets by area
        </Link>
        <a
          href="#line-board"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-extrabold text-primary hover:bg-surface-2"
        >
          <Trophy className="size-5" aria-hidden />
          Which line has the cleanest toilets?
        </a>
      </div>
      <Suspense fallback={<StationsSkeleton />}>
        <Stations />
      </Suspense>
    </article>
  );
}
