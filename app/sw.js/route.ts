import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Serves the service worker at /sw.js with this deploy's build id baked in. Browsers only
 * install a new worker when the script's bytes change, so a fixed cache version would leave
 * phones on an old shell after a deploy. The source lives in service-worker/sw.js (not
 * public/, which would shadow this route); nothing here reads the request, so Next prerenders
 * it at build time.
 */
export function GET() {
  const source = readFileSync(join(process.cwd(), "service-worker", "sw.js"), "utf8");
  const build = (process.env.SGW_BUILD_ID ?? "dev").replace(/[^\w.-]/g, "");
  return new Response(source.replaceAll("__SGW_BUILD__", build), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Same as next.config.ts headers(): always revalidate so updates roll out.
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
