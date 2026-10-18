import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getToiletServer } from "@/lib/api/server";
import { TIER_LABELS, VENUE_TYPE_LABELS } from "@/lib/format";
import { DetailSkeleton, ToiletDetailView } from "./detail-client";

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
