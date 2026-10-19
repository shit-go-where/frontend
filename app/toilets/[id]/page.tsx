import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getToiletServer } from "@/lib/api/server";
import { TIER_LABELS, VENUE_TYPE_LABELS } from "@/lib/format";
import { isUnnamed, toiletDisplayTitle } from "@/lib/unnamed-toilet";
import { DetailSkeleton, ToiletDetailView } from "./detail-client";

export async function generateMetadata({ params }: PageProps<"/toilets/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = await getToiletServer(id);
  if (r.kind !== "ok") return { title: "Toilet" };
  const t = r.data;
  // Unnamed imports ("Public toilet") say where they are, so a shared link isn't one of hundreds alike.
  const title = toiletDisplayTitle(t);
  const bits = [
    t.venue.type !== "OTHER" ? VENUE_TYPE_LABELS[t.venue.type] : null,
    t.near,
    t.level ? `Level ${t.level}` : null,
    `${TIER_LABELS[t.tier]} toilet`,
    t.scoreCleanliness !== null ? `cleanliness ${t.scoreCleanliness.toFixed(1)}/10` : null,
    t.venue.address,
  ].filter(Boolean);
  const description = `${isUnnamed(t) ? title : `Toilet at ${title}`}: ${bits.join(" · ")}.`;
  return {
    title,
    description,
    openGraph: {
      title: `${title} · Shit Go Where`,
      description,
      // A real photo when there is one, else this toilet's own card (opengraph-image.tsx). Set either
      // way: a page's openGraph replaces the parent's whole, so leaving images out would drop them.
      images: t.photos[0]?.url
        ? [{ url: t.photos[0].url }]
        : [{ url: `/toilets/${encodeURIComponent(t.id)}/opengraph-image`, width: 1200, height: 630, alt: title }],
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
