import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { getToiletServer } from "@/lib/api/server";
import { TIER_LABELS, VENUE_TYPE_LABELS } from "@/lib/format";
import { ToiletDetailView } from "./detail-client";

export async function generateMetadata({ params }: PageProps<"/toilets/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = await getToiletServer(id);
  if (r.kind !== "ok") return { title: "Toilet" };
  const t = r.data;
  const title = t.label ? `${t.venue.name} (${t.label})` : t.venue.name;
  const bits = [
    VENUE_TYPE_LABELS[t.venue.type],
    t.level ? `Level ${t.level}` : null,
    `${TIER_LABELS[t.tier]} toilet`,
    t.scoreCleanliness !== null ? `cleanliness ${t.scoreCleanliness.toFixed(1)}/10` : null,
    t.venue.address,
  ].filter(Boolean);
  const description = `Toilet at ${title}: ${bits.join(" · ")}.`;
  return {
    title,
    description,
    openGraph: {
      title: `${title} · Shit Go Where`,
      description,
      images: t.photos[0]?.url ? [{ url: t.photos[0].url }] : undefined,
    },
  };
}

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-2" aria-busy>
      <span className="sr-only">Loading toilet…</span>
      <Skeleton className="h-11 w-20 rounded-full" />
      <Skeleton className="mt-1 h-10 w-2/3" />
      <Skeleton className="mt-3 h-5 w-1/3" />
      <Skeleton className="mt-4 h-7 w-44 rounded-full" />
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-14 rounded-full sm:flex-1" />
        <Skeleton className="h-14 rounded-full sm:flex-1" />
      </div>
      <Skeleton className="mt-5 h-40 rounded-3xl" />
      <Skeleton className="mt-10 h-56 rounded-3xl" />
    </div>
  );
}

async function Detail({ params }: Pick<PageProps<"/toilets/[id]">, "params">) {
  const { id } = await params;
  const r = await getToiletServer(id);
  if (r.kind === "not-found") notFound();
  return (
    <ToiletDetailView
      id={id}
      initial={r.kind === "ok" ? r.data : null}
      serverError={r.kind === "error" ? r.message : null}
    />
  );
}

export default function ToiletPage({ params }: PageProps<"/toilets/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}
