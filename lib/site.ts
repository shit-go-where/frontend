/**
 * The public origin for canonical URLs, the sitemap and robots.txt. Set NEXT_PUBLIC_SITE_URL once a
 * domain is bought; until then Vercel's production domain, then localhost for dev.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/+$/, "");
