import type { MetadataRoute } from "next";
import { getAreasServer, getSitemapToiletsServer, getStationsServer } from "@/lib/api/server";
import { SITE_URL } from "@/lib/site";

/** Public pages only. Thin areas and unchecked stations (`indexable: false`) are noindex, so they stay out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [areas, stations, toilets] = await Promise.all([getAreasServer(), getStationsServer(), getSitemapToiletsServer()]);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/areas`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/stations`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/leaderboard`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    ...(areas.kind === "ok"
      ? areas.data.items
          .filter((a) => a.indexable)
          .map((a) => ({ url: `${SITE_URL}/areas/${a.slug}`, changeFrequency: "weekly" as const, priority: 0.7 }))
      : []),
    ...(stations.kind === "ok"
      ? stations.data.items
          .filter((s) => s.indexable)
          .map((s) => ({ url: `${SITE_URL}/stations/${s.slug}`, changeFrequency: "weekly" as const, priority: 0.7 }))
      : []),
    ...(toilets.kind === "ok"
      ? toilets.data.items.map((t) => ({
          url: `${SITE_URL}/toilets/${t.id}`,
          lastModified: t.updatedAt,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        }))
      : []),
  ];
}
