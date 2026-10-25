import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getToiletServer } from "@/lib/api/server";
import { TIER_LABELS, VENUE_TYPE_LABELS } from "@/lib/format";
import { levelText } from "@/lib/level";
import { isUnnamed, toiletDisplayTitle, toiletPageTitle } from "@/lib/unnamed-toilet";
import { DetailSkeleton, ToiletDetailView } from "./detail-client";

export async function generateMetadata({ params }: PageProps<"/toilets/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = await getToiletServer(id);
  if (r.kind !== "ok") return { title: "Toilet" };
  const t = r.data;
  // Unnamed imports ("Public toilet") say where they are, so a shared link isn't one of hundreds alike;
  // a building with toilets on several floors says which floor this one is, and the others.
  const name = toiletDisplayTitle(t);
  const title = toiletPageTitle(t);
  const bits = [
    t.venue.type !== "OTHER" ? VENUE_TYPE_LABELS[t.venue.type] : null,
    t.near,
    levelText(t.level),
    `${TIER_LABELS[t.tier]} toilet`,
    t.scoreCleanliness !== null ? `cleanliness ${t.scoreCleanliness.toFixed(1)}/10` : null,
    t.venue.address,
  ].filter(Boolean);
  const description = `${isUnnamed(t) ? name : `Toilet at ${name}`}: ${bits.join(" · ")}.`;
  return {
    title,
    description,
    // One URL per toilet, whatever query (utm_source, ?do=) or trailing slash a shared link carries.
    alternates: { canonical: `/toilets/${encodeURIComponent(t.id)}` },
    openGraph: {
      title: `${title} · Shit Go Where`,
      description,
      // Always this toilet's own card (opengraph-image.tsx), even when it has photos: the card carries
      // the tier, score and last-verified age that every appearance of a toilet must show (PRODUCT.md
      // principle 2), and a toilet photo makes a poor chat preview. Set explicitly: a page's openGraph
      // replaces the parent's whole, so leaving images out would drop them.
      images: [{ url: `/toilets/${encodeURIComponent(t.id)}/opengraph-image`, width: 1200, height: 630, alt: title }],
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
