import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ErrorState } from "@/components/ui";
import { getStationServer } from "@/lib/api/server";
import type { StationDetail } from "@/lib/api/types";
import { formatDate, formatDistance, placeName, plural, scoreNumber } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { isUnnamed, toiletDisplayTitle } from "@/lib/unnamed-toilet";
import { sortLines, stationLabel } from "../station-bits";
import { StationSkeleton, StationView } from "./station-view";

function listText(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? "");
}

/** Plain-English facts for the search snippet: the answer first, then the nearest fallback. */
function describe(s: StationDetail): string {
  const label = stationLabel(s);
  const lines = listText(sortLines(s.lines).map((l) => l.name));
  const on = lines ? ` (${lines})` : "";
  const open = s.toilets.filter((t) => t.status === "ACTIVE");
  const nearest = s.nearby[0];
  const nearestText = nearest
    ? ` The nearest other toilet is ${isUnnamed(nearest.toilet) ? "a public toilet" : placeName(nearest.toilet.venue)}, ${formatDistance(nearest.distanceM)} away.`
    : "";
  if (s.toiletStatus === "HAS_TOILETS" && open.length) {
    const surveyed =
      s.verifiedCount === 0
        ? ""
        : s.verifiedCount >= open.length
          ? open.length === 1
            ? ", surveyed in person"
            : ", all surveyed in person"
          : `, ${s.verifiedCount} of them surveyed in person`;
    const score = s.bestScore !== null ? ` The cleanest scores ${scoreNumber(s.bestScore)}/10 for cleanliness.` : "";
    const verified = s.lastVerifiedAt ? ` Last verified ${formatDate(s.lastVerifiedAt)}.` : "";
    const more = s.nearby.length ? ` ${plural(s.nearby.length, "more toilet")} within a 400 m walk.` : "";
    return `${label}${on} has ${plural(open.length, "toilet")} in the station${surveyed}.${score}${verified}${more}`;
  }
  if (s.toiletStatus === "NONE") return `${label}${on} has no toilet in the station.${nearestText}`;
  if (s.toiletStatus === "USES_NEARBY") {
    return `${label}${on} has no toilet of its own and uses the one next door.${s.note ? ` ${s.note.replace(/\.?$/, ".")}` : ""}${nearestText}`;
  }
  if (s.toiletStatus === "UNKNOWN") return `Nobody has checked yet whether ${label}${on} has a toilet inside.${nearestText}`;
  return `${label}${on} has no open toilet on record.${nearestText}`;
}

export async function generateMetadata({ params }: PageProps<"/stations/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const r = await getStationServer(slug);
  if (r.kind !== "ok") return { title: "Toilets at every MRT station" };
  const s = r.data;
  const title = `Toilets at ${stationLabel(s)}`;
  const description = describe(s);
  return {
    title,
    description,
    alternates: { canonical: `/stations/${s.slug}` },
    // Unchecked stations with nothing nearby still render for people, but aren't worth a search result.
    robots: s.indexable ? undefined : { index: false, follow: true },
    // Images named here: a page's openGraph replaces the root's whole, so the default card would be lost.
    openGraph: {
      title: `${title} · Shit Go Where`,
      description,
      url: `/stations/${s.slug}`,
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
    },
  };
}

/** schema.org ItemList of the toilet pages in and around the station. Names and URLs only: no ratings we can't back with real reviews. */
function JsonLd({ s }: { s: StationDetail }) {
  const label = stationLabel(s);
  const items = [
    ...s.toilets
      .filter((t) => t.status === "ACTIVE")
      .map((t) => ({ name: t.label ? `${label} (${t.label})` : label, url: `${SITE_URL}/toilets/${t.id}` })),
    ...s.nearby.map(({ toilet: t }) => ({
      name: toiletDisplayTitle({ ...t, venue: { ...t.venue, name: placeName(t.venue) }, near: label }),
      url: `${SITE_URL}/toilets/${t.id}`,
    })),
  ];
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Toilets at and near ${label}, Singapore`,
    url: `${SITE_URL}/stations/${s.slug}`,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, ...it })),
  };
  // Escape "<" so a place name can never close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />;
}

async function Station({ params }: Pick<PageProps<"/stations/[slug]">, "params">) {
  const { slug } = await params;
  const r = await getStationServer(slug);
  if (r.kind === "not-found") notFound();
  if (r.kind === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6">
        <ErrorState message={`Aiyo, couldn't load this station. ${r.message} Refresh to try again.`} />
      </div>
    );
  }
  return (
    <>
      {r.data.indexable ? <JsonLd s={r.data} /> : null}
      <StationView station={r.data} />
    </>
  );
}

export default function StationPage({ params }: PageProps<"/stations/[slug]">) {
  return (
    <Suspense fallback={<StationSkeleton />}>
      <Station params={params} />
    </Suspense>
  );
}
