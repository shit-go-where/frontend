import type { BrowserContext, Page } from "@playwright/test";

/** The stub API (e2e/stub-api.mjs) reads who is calling from this cookie. */
export type Who = "anon" | "user" | "admin";

export async function signInAs(context: BrowserContext, baseURL: string, who: Who) {
  await context.clearCookies();
  if (who !== "anon") await context.addCookies([{ name: "sgw_session", value: who, url: baseURL }]);
}

/** No basemap tiles: the run stays offline and the map style fails fast. */
export async function blockTiles(page: Page) {
  await page.route("https://www.onemap.gov.sg/**", (r) => r.abort());
}

export async function pinTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => localStorage.setItem("sgw:theme", t), theme);
}
