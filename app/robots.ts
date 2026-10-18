import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in and moderation pages, and the raw API behind the rewrite.
      disallow: ["/api/", "/admin", "/me", "/login", "/add", "/review"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
