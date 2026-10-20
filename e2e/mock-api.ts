import type { Page, Request, Route } from "@playwright/test";
import { ME, NEARBY_VENUES, PHOTO, PINS, PNG_BYTES, PRESIGN, RECOMMEND, TOILETS, submissionView } from "./fixtures";

type Handler = (req: Request, url: URL) => { status?: number; body?: unknown } | undefined;

export interface MockOptions {
  signedIn?: boolean;
  /** Override or add handlers keyed by "METHOD /path" (path without /api). */
  overrides?: Record<string, Handler>;
}

export interface ApiLog {
  calls: { method: string; path: string; search: string; body: unknown }[];
  find(method: string, path: string): { method: string; path: string; search: string; body: unknown }[];
}

/**
 * Mocks every /api/** request. Unknown endpoints answer 404 and are recorded,
 * so a test can assert nothing unexpected was called.
 */
export async function mockApi(page: Page, opts: MockOptions = {}): Promise<ApiLog> {
  const calls: ApiLog["calls"] = [];
  const signedIn = opts.signedIn ?? false;

  const routes: Record<string, Handler> = {
    "GET /me": () => (signedIn ? { body: ME } : { status: 401, body: { statusCode: 401, message: "Unauthorized" } }),
    "GET /toilets/nearby": () => ({ body: { items: TOILETS } }),
    "GET /toilets/in-bounds": () => ({ body: { items: PINS } }),
    "POST /routing/recommend": () => ({ body: RECOMMEND }),
    "GET /routing/walk": () => ({ body: { distanceM: 300, durationS: 240, polyline: [], source: "estimate" } }),
    "GET /geo/search": () => ({ body: { items: [] } }),
    "GET /venues/nearby": () => ({ body: { items: NEARBY_VENUES } }),
    "GET /venues/search": () => ({ body: { items: NEARBY_VENUES } }),
    "POST /media/presign": () => ({ body: PRESIGN }),
    "PUT /media/photo-1/upload": () => ({ status: 200, body: "" }),
    "POST /media/photo-1/confirm": () => ({ body: PHOTO }),
    "POST /submissions": (req) => ({ body: submissionView((req.postDataJSON() as { payload: never }).payload) }),
    "GET /badges": () => ({ body: { items: [] } }),
    ...opts.overrides,
  };

  await page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, "");
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    calls.push({ method: req.method(), path, search: url.search, body });
    const handler = routes[`${req.method()} ${path}`];
    const res = handler?.(req, url) ?? { status: 404, body: { statusCode: 404, message: `Not mocked: ${req.method()} ${path}` } };
    await route.fulfill({
      status: res.status ?? 200,
      contentType: "application/json",
      body: typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? null),
    });
  });

  // Keep tests offline: every basemap tile is one small PNG. Aborted tiles would keep MapLibre from ever
  // firing "load", and the map only asks for pins (in-bounds) once it has.
  await page.route("https://www.onemap.gov.sg/**", (route) =>
    route.request().url().endsWith(".png")
      ? route.fulfill({ status: 200, contentType: "image/png", body: PNG_BYTES })
      : route.abort(),
  );

  return {
    calls,
    find: (method, path) => calls.filter((c) => c.method === method && c.path === path),
  };
}
