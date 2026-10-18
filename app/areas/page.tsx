import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ErrorState, Skeleton } from "@/components/ui";
import { getAreasServer } from "@/lib/api/server";
import type { AreaSummary, Region } from "@/lib/api/types";
import { REGION_LABELS, plural } from "@/lib/format";

export const metadata: Metadata = {
  title: "Toilets by area",
  description:
    "Public toilets in every part of Singapore, area by area: MRT stations, malls, hawker centres and parks, with how many someone has checked in person.",
  alternates: { canonical: "/areas" },
};

const REGION_ORDER: (Region | null)[] = ["CENTRAL", "EAST", "NORTH", "NORTH_EAST", "WEST", null];

function AreaRow({ a }: { a: AreaSummary }) {
  return (
    <li>
      <Link
        href={`/areas/${a.slug}`}
        className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold leading-snug">{a.name}</span>
          <span className="block text-sm text-muted tabular-nums">
            {plural(a.toiletCount, "toilet")}
            {a.verifiedCount ? ` · ${a.verifiedCount} checked in person` : ""}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted transition-colors group-hover:text-primary" aria-hidden />
      </Link>
    </li>
  );
}

async function Areas() {
  const r = await getAreasServer();
  if (r.kind !== "ok") {
    return <ErrorState message={`Aiyo, couldn't load the areas. ${r.kind === "error" ? r.message : ""} Refresh to try again.`} />;
  }
  const groups = REGION_ORDER.map((region) => ({
    region,
    areas: r.data.items.filter((a) => a.region === region),
  })).filter((g) => g.areas.length);
  return (
    <>
      {groups.map((g) => {
        const id = `region-${(g.region ?? "other").toLowerCase()}`;
        return (
          <section key={id} aria-labelledby={id} className="mt-10 first:mt-6">
            <h2 id={id} className="flex items-baseline gap-3 text-2xl leading-tight">
              {g.region ? REGION_LABELS[g.region] : "Elsewhere"}
              <span className="ml-auto font-sans text-sm font-bold text-muted tabular-nums">{plural(g.areas.length, "area")}</span>
            </h2>
            <ul className="mt-3 divide-y divide-border/70 overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-rest">
              {g.areas.map((a) => (
                <AreaRow key={a.slug} a={a} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function AreasSkeleton() {
  return (
    <div aria-busy>
      <span className="sr-only">Loading areas…</span>
      <Skeleton className="mt-6 h-8 w-32" />
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
