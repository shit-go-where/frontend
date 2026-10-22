import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./mock-api";

/*
 * The add flow's pin step: a place search that moves the map (the pin is the map centre, so it asks for a
 * fine-tune after), and the note that a pin away from you goes up as a pending one.
 */

/** About 1.1 km east of the test's GPS fix (fixtures ORIGIN): well past the 150 m on-site distance. */
const BUGIS = {
  name: "BUGIS JUNCTION",
  address: "200 VICTORIA STREET BUGIS JUNCTION SINGAPORE 188021",
  lat: 1.2995,
  lng: 103.8555,
};
/** Plaza Singapura, where the fixtures list a venue of the same name (NEARBY_VENUES). */
const PLAZA = { name: "PLAZA SINGAPURA", address: "68 ORCHARD ROAD PLAZA SINGAPURA SINGAPORE 238839", lat: 1.3006, lng: 103.8452 };

const OFF_SITE = "You're not near it, so it goes up as a pending pin until a couple of people nearby confirm it.";
const NO_FIX = "If you're not there, it goes up as a pending pin until a couple of people nearby confirm it.";
const NUDGE = /Now drag the map so the pin sits on the toilet's entrance/;

const mapOf = (page: Page) => page.getByRole("region", { name: "Pick the toilet location" });

/** Signed in, with OneMap's answer for every search. */
function mockWithSearch(page: Page, items: object[]) {
  return mockApi(page, { signedIn: true, overrides: { "GET /geo/search": () => ({ body: { items } }) } });
}

/** The last bounds the map asked pins for, i.e. where it settled. */
function lastBounds(api: Awaited<ReturnType<typeof mockApi>>) {
  const last = api.find("GET", "/toilets/in-bounds").at(-1);
  if (!last) return null;
  const q = new URLSearchParams(last.search);
  return { minLat: Number(q.get("minLat")), maxLat: Number(q.get("maxLat")), minLng: Number(q.get("minLng")), maxLng: Number(q.get("maxLng")) };
}

const contains = (b: ReturnType<typeof lastBounds>, p: { lat: number; lng: number }) =>
  !!b && b.minLat < p.lat && p.lat < b.maxLat && b.minLng < p.lng && p.lng < b.maxLng;

test.describe("add: pin step search", () => {
  test("a search result moves the map, asks for a fine-tune, and an off-site pin says it'll be pending", async ({ page }) => {
    const api = await mockWithSearch(page, [BUGIS, PLAZA]);
    await page.goto("/add");
    await expect(page.getByRole("heading", { name: /Step 1 of 4/ })).toBeVisible();
    // GPS stays the default: the pin starts on you, so there's nothing to warn about.
    await expect(page.getByText("Pin is right where you are")).toBeVisible();
    await expect(page.getByTestId("off-site-note")).toHaveCount(0);
    await expect(mapOf(page)).toHaveAttribute("data-moving", "false");
    expect(contains(lastBounds(api), BUGIS)).toBe(false);

    await page.getByRole("button", { name: "Search a place, building or postal code" }).click();
    const box = page.getByRole("combobox", { name: "Search a place, building or postal code" });
    await expect(box).toBeFocused();
    await box.fill("bugis");
    const results = page.getByRole("listbox", { name: "Places" });
    // OneMap's capitals tidied, and the address without the repeated name.
    await expect(results.getByRole("option", { name: /Bugis Junction/ })).toBeVisible();
    await expect(results.getByText("200 Victoria Street · 188021")).toBeVisible();
    expect(api.find("GET", "/geo/search").at(-1)?.search).toContain("q=bugis");

    // Keyboard: down to the first result, Enter picks it.
    await box.press("ArrowDown");
    await expect(results.getByRole("option", { name: /Bugis Junction/ })).toHaveAttribute("aria-selected", "true");
    await box.press("Enter");
    await expect(box).toHaveCount(0);

    // The map flies there and asks pins for the new area.
    await expect(page.getByTestId("pin-instruction")).toHaveText(/^Showing Bugis Junction\./);
    await expect(page.getByTestId("pin-instruction")).toHaveText(NUDGE);
    await expect.poll(() => contains(lastBounds(api), BUGIS), { timeout: 10_000 }).toBe(true);
    await expect(mapOf(page)).toHaveAttribute("data-moving", "false");

    // About 1.1 km from your fix: the step says it goes up as a pending pin.
    await expect(page.getByText(/Pin is 1\.\d km from you/)).toBeVisible();
    await expect(page.getByTestId("off-site-note")).toHaveText(OFF_SITE);

    // Moving the map by hand (the keyboard pans it) is the fine-tune: the ask goes back to the usual line.
    await page.locator(".maplibregl-canvas").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("pin-instruction")).toHaveText("Drag the map so the pin sits on the toilet entrance.", { timeout: 10_000 });
    await expect(page.getByTestId("off-site-note")).toHaveText(OFF_SITE);

    // "Use my location" brings the pin back to you, and the note goes.
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText("Pin is right where you are")).toBeVisible();
    await expect(page.getByTestId("off-site-note")).toHaveCount(0);
  });

  test("Escape closes the search and puts focus back on its button; nothing found says so", async ({ page }) => {
    await mockWithSearch(page, []);
    await page.goto("/add");
    const open = page.getByRole("button", { name: "Search a place, building or postal code" });
    await open.click();
    const box = page.getByRole("combobox", { name: "Search a place, building or postal code" });
    await box.fill("zzzz");
    // The panel says it (a hidden live region says it to screen readers too).
    await expect(page.locator("p:not(.sr-only)", { hasText: "No places found. Try the building's name or postal code." })).toBeVisible();
    await box.press("Escape");
    await expect(box).toHaveCount(0);
    await expect(open).toBeFocused();
    // Nothing picked: the pin hasn't moved.
    await expect(page.getByText("Pin is right where you are")).toBeVisible();
  });

  test("the open search with results passes axe", async ({ page }) => {
    await mockWithSearch(page, [BUGIS, PLAZA]);
    await page.goto("/add");
    await page.getByRole("button", { name: "Search a place, building or postal code" }).click();
    const box = page.getByRole("combobox", { name: "Search a place, building or postal code" });
    await box.fill("bugis");
    await expect(page.getByRole("option")).toHaveCount(2);
    await box.press("ArrowDown");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("a searched place we list nearby starts out chosen on the place step", async ({ page }) => {
    const api = await mockWithSearch(page, [PLAZA]);
    await page.goto("/add");
    await expect(page.getByText("Pin is right where you are")).toBeVisible();
    await page.getByRole("button", { name: "Search a place, building or postal code" }).click();
    await page.getByRole("combobox", { name: "Search a place, building or postal code" }).fill("plaza sing");
    await page.getByRole("option", { name: /Plaza Singapura/ }).click();
    await expect(page.getByTestId("pin-instruction")).toHaveText(/^Showing Plaza Singapura\./);
    // The pin step's "Near …" line has looked up places around the new pin (the place step's own query).
    await expect
      .poll(() => api.find("GET", "/venues/nearby").some((c) => c.search.includes(`lat=${PLAZA.lat}`)), { timeout: 10_000 })
      .toBe(true);
    await expect(mapOf(page)).toHaveAttribute("data-moving", "false");

    await page.getByTestId("add-next").click();
    await expect(page.getByRole("heading", { name: /Step 2 of 4/ })).toBeVisible();
    await expect(page.getByTestId("venue-option").filter({ hasText: "Plaza Singapura" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("venue-option").filter({ hasText: "Dhoby Ghaut" })).toHaveAttribute("aria-checked", "false");
  });
});

test.describe("add: pin step without a fix", () => {
  test.use({ permissions: [] });

  test("with no location, the note says an off-site pin goes up as pending", async ({ page }) => {
    await mockWithSearch(page, []);
    await page.goto("/add");
    await expect(page.getByRole("heading", { name: /Step 1 of 4/ })).toBeVisible();
    await expect(page.getByText("Tap “Use my location” to see how far it is from you.")).toBeVisible();
    await expect(page.getByTestId("off-site-note")).toHaveText(NO_FIX);
  });
});
