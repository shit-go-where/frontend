import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorState, Skeleton } from "@/components/ui";
import { getAreasServer } from "@/lib/api/server";
import { AreaDirectory } from "./area-directory";

export const metadata: Metadata = {
  title: "Toilets by area",
  description:
    "Public toilets in every part of Singapore, area by area: MRT stations, malls, hawker centres and parks, with how many someone has checked in person.",
  alternates: { canonical: "/areas" },
};

async function Areas() {
  const r = await getAreasServer();
  if (r.kind !== "ok") {
    return <ErrorState message={`Aiyo, couldn't load the areas. ${r.kind === "error" ? r.message : ""} Refresh to try again.`} />;
  }
  // Grouped by region, with a search that also knows MRT stations and neighbourhoods (area-directory.tsx).
  return <AreaDirectory areas={r.data.items} />;
}

function AreasSkeleton() {
  return (
    <div aria-busy>
      <span className="sr-only">Loading areas…</span>
      <Skeleton className="mt-6 h-5 w-28" />
      <Skeleton className="mt-1.5 h-12" />
      <Skeleton className="mt-10 h-8 w-32" />
      <Skeleton className="mt-3 h-72 rounded-3xl" />
      <Skeleton className="mt-10 h-8 w-24" />
      <Skeleton className="mt-3 h-40 rounded-3xl" />
    </div>
  );
}

export default function AreasPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6">
      <h1 className="text-3xl leading-tight sm:text-4xl">Toilets by area</h1>
      <p className="mt-2 text-muted">
        Going somewhere later? Pick the part of Singapore you&apos;re heading to and see every public toilet we know there, best
        first. Areas follow URA&apos;s planning areas.
      </p>
      <Suspense fallback={<AreasSkeleton />}>
        <Areas />
      </Suspense>
    </article>
  );
}
