import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ErrorState } from "@/components/ui";
import { getAreaServer } from "@/lib/api/server";
import type { AreaDetail } from "@/lib/api/types";
import { placeName, plural } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { AreaSkeleton, AreaView } from "./area-view";

function describe(a: AreaDetail): string {
  const checked = a.verifiedCount ? `, ${a.verifiedCount} of them surveyed in person` : "";
  return `${plural(a.toiletCount, "public toilet")} in ${a.name}, Singapore${checked}. See where each one is, how clean it is, and whether it has a bidet, an accessible cubicle or baby change.`;
}

export async function generateMetadata({ params }: PageProps<"/areas/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const r = await getAreaServer(slug);
  if (r.kind !== "ok") return { title: "Toilets by area" };
  const a = r.data;
  const title = `Toilets in ${a.name}`;
  const description = describe(a);
  return {
    title,
    description,
    alternates: { canonical: `/areas/${a.slug}` },
    // Thin areas still render for people, but aren't worth a search result.
    robots: a.indexable ? undefined : { index: false, follow: true },
    openGraph: { title: `${title} · Shit Go Where`, description, url: `/areas/${a.slug}` },
  };
}

/** schema.org ItemList of the area's toilet pages. Names and URLs only: no ratings we can't back with real reviews. */
function JsonLd({ a }: { a: AreaDetail }) {
  const items = a.venues.flatMap((v) =>
    v.toilets
      .filter((t) => t.status === "ACTIVE")
      .map((t) => ({ name: t.label ? `${placeName(v)} (${t.label})` : placeName(v), url: `${SITE_URL}/toilets/${t.id}` })),
  );
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Public toilets in ${a.name}, Singapore`,
    url: `${SITE_URL}/areas/${a.slug}`,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, ...it })),
  };
  // Escape "<" so a place name can never close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />;
}

async function Area({ params }: Pick<PageProps<"/areas/[slug]">, "params">) {
  const { slug } = await params;
  const r = await getAreaServer(slug);
  if (r.kind === "not-found") notFound();
  if (r.kind === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6">
        <ErrorState message={`Aiyo, couldn't load this area. ${r.message} Refresh to try again.`} />
      </div>
    );
  }
  return (
    <>
      {r.data.indexable ? <JsonLd a={r.data} /> : null}
      <AreaView area={r.data} />
    </>
  );
}

export default function AreaPage({ params }: PageProps<"/areas/[slug]">) {
  return (
    <Suspense fallback={<AreaSkeleton />}>
      <Area params={params} />
    </Suspense>
  );
}
