import type { Page, Request, Route } from "@playwright/test";
import { fixtureReply } from "./api-data";

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

  const who = opts.signedIn ? "user" : "anon";
  const routes: Record<string, Handler> = { ...opts.overrides };

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
    const res = handler?.(req, url) ?? fixtureReply(req.method(), path, url, who, body) ?? { status: 404, body: { statusCode: 404, message: `Not mocked: ${req.method()} ${path}` } };
    await route.fulfill({
      status: res.status ?? 200,
      contentType: "application/json",
      body: typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? null),
    });
  });

  // Keep tests offline: no basemap tiles.
  await page.route("https://www.onemap.gov.sg/**", (route) => route.abort());

  return {
    calls,
    find: (method, path) => calls.filter((c) => c.method === method && c.path === path),
  };
}
