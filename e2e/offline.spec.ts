import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { blockTiles } from "./live";

/**
 * The service worker for real (the offline project: serviceWorkers "allow"). page.route cannot see
 * the worker's requests, so the app runs against the stub API (e2e/stub-api.mjs) behind a proxy that
 * can lose the signal per browser context (e2e/flaky-proxy.mjs): install and precache, the shell and
 * urgent mode with no signal, a saved toilet list with its label, "no signal" arriving fast instead
 * of a long spinner, lie-fi. A last test uses Playwright's own airplane mode (context.setOffline).
 */

/** Tunnel: every request is dropped, but navigator.onLine still says online, as it often does underground. */
const loseSignal = (context: BrowserContext, baseURL: string) =>
  context.addCookies([{ name: "sgw_stub_down", value: "1", url: baseURL }]);

/** Lie-fi: connected, and nothing arrives for `ms`. */
const stallSignal = (context: BrowserContext, baseURL: string, ms: number) =>
  context.addCookies([{ name: "sgw_stub_delay", value: String(ms), url: baseURL }]);

/** The worker has installed, precached the shell pages and their assets, and controls this page. */
async function workerReady(page: Page) {
  await page.waitForFunction(
    async () => {
      if (!navigator.serviceWorker.controller) return false;
      const names = (await caches.keys()).filter((k) => k.endsWith("-shell"));
      if (!names.length) return false;
      const shell = await caches.open(names[0]);
      const have = await Promise.all(["/", "/go", "/about"].map((u) => shell.match(u)));
      const statics = (await caches.keys()).find((k) => k.endsWith("-static"));
      const assets = statics ? (await (await caches.open(statics)).keys()).length : 0;
      return have.every(Boolean) && assets > 3;
    },
    undefined,
    { timeout: 20_000 },
  );
  // The worker keeps adding assets after the shell pages land, and a reload during that left the page
  // uncontrolled (nothing stored) in about one run in four on this Chromium: let the precache finish.
  await page.waitForTimeout(2_000);
}

/**
 * A phone's second visit: the first one installs the worker (its own requests never went through
 * it), so reload and the page, its scripts and the toilet list get stored by the worker. Reloads
 * until the worker really controls the page: in this Chromium a reload right after activation is
 * now and then left uncontrolled (nothing is stored), which a phone cures by simply opening it again.
 */
async function secondVisit(page: Page, withList: boolean) {
  await workerReady(page);
  for (let i = 0; i < 4; i++) {
    await page.reload();
    // A navigation started within ~300 ms of a reload's load event skips the worker in this Chromium
    // (the dropped connection surfaces as ERR_EMPTY_RESPONSE), so let it settle, as a real visit would.
    await page.waitForTimeout(800);
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) continue;
    if (!withList) return;
    await expect(page.getByTestId("toilet-card")).toHaveCount(3);
    const stored = await page
      .waitForFunction(
        async () => (await (await caches.open("sgw-api-1")).keys()).some((r) => r.url.includes("/api/toilets/nearby")),
        undefined,
        { timeout: 3_000 },
      )
      .then(() => true, () => false);
    if (stored) return;
  }
  throw new Error("the service worker never took control of the reloaded page");
}

test.beforeEach(async ({ page }) => {
  await blockTiles(page);
});

const noSignal = (page: Page) => page.getByRole("heading", { name: "No signal leh" });
const offlineBanner = (page: Page) => page.getByRole("status").filter({ hasText: /^Offline/ });

test("the worker installs and precaches the shell pages, manifest, icons and assets", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("toilet-card").first()).toBeVisible();
  await workerReady(page);
  const cached = await page.evaluate(async () => {
    const shell = await caches.open((await caches.keys()).find((k) => k.endsWith("-shell"))!);
    return (await shell.keys()).map((r) => new URL(r.url).pathname).sort();
  });
  expect(cached).toEqual(["/", "/about", "/go", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"].sort());
});

test.describe("the signal drops", () => {
  test("/ and /go?urgent=1 still render, from the worker's saved copies", async ({ page, context, baseURL }) => {
    await page.goto("/");
    await secondVisit(page, true);

    await loseSignal(context, baseURL!);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Map of toilets" })).toBeVisible();
    await expect(page.getByTestId("need-to-go").filter({ visible: true })).toBeVisible();
    // The list the worker saved a moment ago is still fresh (under 10 min), so it shows as a normal list.
    await expect(page.getByTestId("toilet-card")).toHaveCount(3);

    await page.goto("/go?urgent=1");
    await expect(page.getByRole("heading", { name: "Quick, go here!" })).toBeVisible();
    // Urgent mode ranks the saved list on the phone, nearest first.
    await expect(page.getByTestId("recommendation").first()).toContainText("Dhoby Ghaut");
    await expect(page.getByRole("status").filter({ hasText: "Offline estimate" })).toBeVisible();
  });

  test("a list saved for another spot is served, and says where and how old it is", async ({ page, context, baseURL }) => {
    await page.goto("/");
    await secondVisit(page, true);

    // The phone has moved ~300 m since: that exact request was never saved, the nearest one was.
    await loseSignal(context, baseURL!);
    await context.setGeolocation({ latitude: 1.3025, longitude: 103.8455 });
    await page.goto("/");
    await expect(page.getByTestId("toilet-card")).toHaveCount(3);
    await expect(page.getByRole("heading", { name: /from your saved list/ })).toBeVisible();
    await expect(offlineBanner(page)).toContainText(/Offline · saved .* ago, near /);
  });

  test("with nothing saved, 'no signal' shows quickly, with a way to retry", async ({ page, context, baseURL }) => {
    // /about is precached but asks the API for nothing, so no toilet list gets saved.
    await page.goto("/about");
    await secondVisit(page, false);

    await loseSignal(context, baseURL!);
    const t0 = Date.now();
    await page.goto("/");
    await expect(noSignal(page)).toBeVisible({ timeout: 8_000 });
    const took = Date.now() - t0;
    test.info().annotations.push({ type: "no-signal-ms", description: String(took) });
    expect(took).toBeLessThan(4_000);
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("with nothing saved, urgent mode says so instead of spinning", async ({ page, context, baseURL }) => {
    await page.goto("/about");
    await secondVisit(page, false);

    await loseSignal(context, baseURL!);
    const t0 = Date.now();
    await page.goto("/go?urgent=1");
    await expect(noSignal(page)).toBeVisible({ timeout: 15_000 });
    const took = Date.now() - t0;
    test.info().annotations.push({ type: "no-signal-urgent-ms", description: String(took) });
    expect(took).toBeLessThan(8_000);
  });

  test("coming back online, the list refreshes without a reload", async ({ page, context, baseURL }) => {
    await page.goto("/about");
    await secondVisit(page, false);
    await loseSignal(context, baseURL!);
    await page.goto("/");
    await expect(noSignal(page)).toBeVisible({ timeout: 8_000 });

    await context.addCookies([{ name: "sgw_stub_down", value: "", url: baseURL!, expires: 1 }]);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("toilet-card")).toHaveCount(3);
    await expect(noSignal(page)).toHaveCount(0);
  });
});

test.describe("lie-fi: connected, but nothing arrives", () => {
  test("the saved list shows after the 2.5 s race", async ({ page, context, baseURL }) => {
    await page.goto("/");
    await secondVisit(page, true);

    await stallSignal(context, baseURL!, 30_000);
    await context.setGeolocation({ latitude: 1.3025, longitude: 103.8455 });
    const t0 = Date.now();
    // The page itself is stalled too: the worker serves its saved copy after the race.
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.getByTestId("toilet-card")).toHaveCount(3, { timeout: 12_000 });
    const took = Date.now() - t0;
    test.info().annotations.push({ type: "lie-fi-saved-ms", description: String(took) });
    // 2.5 s for the page, 2.5 s for the list, and some slack.
    expect(took).toBeLessThan(9_000);
    await expect(offlineBanner(page)).toContainText(/saved .* ago/);
  });

  test("with nothing saved, the screen gives up within one request timeout, not two", async ({ page, context, baseURL }) => {
    await page.goto("/about");
    await secondVisit(page, false);

    await stallSignal(context, baseURL!, 60_000);
    const t0 = Date.now();
    await page.goto("/", { waitUntil: "commit" });
    // Either wording of a connection failure counts, as long as the skeleton is gone.
    await expect(page.getByText(/No signal leh|too slow|No signal right now/).first()).toBeVisible({ timeout: 40_000 });
    const took = Date.now() - t0;
    test.info().annotations.push({ type: "lie-fi-nothing-saved-ms", description: String(took) });
    // 2.5 s for the worker's page race plus the client's 10 s request timeout, and slack. No retry on top.
    expect(took).toBeLessThan(15_000);
  });
});

test.describe("airplane mode (context.setOffline)", () => {
  test("/ and /go?urgent=1 render from the worker, the list says it may be out of date", async ({ page, context }) => {
    await page.goto("/");
    await secondVisit(page, true);

    await context.setOffline(true);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Map of toilets" })).toBeVisible();
    await expect(page.getByTestId("toilet-card")).toHaveCount(3);
    await expect(offlineBanner(page)).toBeVisible();

    await page.goto("/go?urgent=1");
    await expect(page.getByRole("heading", { name: "Quick, go here!" })).toBeVisible();
    await expect(page.getByTestId("recommendation").first()).toContainText("Dhoby Ghaut");
  });
});
