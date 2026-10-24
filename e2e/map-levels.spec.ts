import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ToiletSummary } from "../lib/api/types";
import { BIG_MALL_TOILETS, COFFEESHOP_TOILETS, MALL_TOILETS, TOWER_TOILETS, WATERWAY_TOILETS, pinOf } from "./fixtures";
import { mockApi } from "./mock-api";

/*
 * A building's toilets on the home map: same-building clusters open as a list by floor, floors stack past
 * clustering, a tall stack fans out (by floor when it spans several), and the floor picker narrows stacks
 * and the sheet's list to one floor.
 */

const BUILDING = [...MALL_TOILETS, ...TOWER_TOILETS];

/**
 * The map shows only these toilets (the mall and the tower by default); each opens from GET /toilets/:id,
 * and each building from GET /venues/:id.
 */
async function mockBuildings(page: Page, toilets: ToiletSummary[] = BUILDING) {
  const venues = new Map(toilets.map((t) => [t.venue.id, t.venue]));
  return mockApi(page, {
    overrides: {
      "GET /toilets/in-bounds": () => ({ body: { items: toilets.map(pinOf) } }),
      ...Object.fromEntries(toilets.map((t) => [`GET /toilets/${t.id}`, () => ({ body: { ...t, siblings: [] } })] as const)),
      ...Object.fromEntries(
        [...venues.values()].map(
          (v) =>
            [
              `GET /venues/${v.id}`,
              () => ({ body: { ...v, address: null, planningArea: null, toilets: toilets.filter((t) => t.venue.id === v.id) } }),
            ] as const,
        ),
      ),
    },
  });
}

const mapOf = (page: Page) => page.getByRole("region", { name: "Map of toilets" });

/**
 * The home map has landed on you: the first fix's flight (if any) is over and a building's cluster is
 * on screen. ToiletMap says where its camera settled (data-zoom, data-moving) for exactly this.
 */
async function mapReady(page: Page) {
  await expect(page.getByTestId("pin-cluster").first()).toBeInViewport({ timeout: 15_000 });
  await expect(mapOf(page)).toHaveAttribute("data-moving", "false");
}

/**
 * Zooms the home map with the keyboard (+ / -), one whole zoom per press, each step waiting for the
 * camera to settle at the next zoom. A press that lands while MapLibre is still busy is pressed again.
 */
async function zoomMap(page: Page, steps: number) {
  const map = mapOf(page);
  await expect(map).toHaveAttribute("data-moving", "false");
  const zoomNow = async () => Number(await map.getAttribute("data-zoom"));
  const canvas = page.locator(".maplibregl-canvas");
  const target = Math.round(await zoomNow()) + steps;
  const off = async () => Math.abs((await zoomNow()) - target);
  await expect(async () => {
    const z = await zoomNow();
    if (Math.abs(z - target) >= 0.5) {
      await canvas.focus();
      await page.keyboard.press(z < target ? "Equal" : "Minus");
      // Settled one zoom on; if not, the next try reads where it is and presses again from there.
      await expect.poll(off, { timeout: 3_000 }).toBeLessThan(0.5);
    }
    await expect(map).toHaveAttribute("data-moving", "false", { timeout: 3_000 });
    expect(await off()).toBeLessThan(0.5);
  }).toPass({ timeout: 30_000 });
}

/** Corners (1 px in) and centre of a box. */
function pointsOf(b: { x: number; y: number; width: number; height: number }) {
  const [l, t, r, btm] = [b.x + 1, b.y + 1, b.x + b.width - 1, b.y + b.height - 1];
  return [
    [l, t],
    [r, t],
    [l, btm],
    [r, btm],
    [(l + r) / 2, (t + btm) / 2],
  ];
}

/**
 * Pans the map until `target` sits in the middle of the open part of the map, on screen and clear of the
 * search bar above and the sheet below: small phones start with a tall stack half under the search bar.
 */
async function intoOpen(page: Page, target: Locator) {
  const map = mapOf(page);
  await expect(async () => {
    const box = (await target.boundingBox())!;
    const x = box.x + box.width / 2;
    // The longest run of the map showing (nothing of the page over it) straight up and down through the target.
    const run = await page.evaluate((x) => {
      let best = { from: 0, to: 0 };
      let from = -1;
      for (let y = 0; y <= window.innerHeight; y += 4) {
        const el = y < window.innerHeight ? document.elementFromPoint(x, y) : null;
        // The map itself or a pin on it; not the search, the sheet, or a hint floating over the map.
        const open = !!el && (!!el.closest(".maplibregl-marker") || el.classList.contains("maplibregl-canvas"));
        if (open && from < 0) from = y;
        if (!open && from >= 0) {
          if (y - from > best.to - best.from) best = { from, to: y };
          from = -1;
        }
      }
      return best;
    }, x);
    const dy = Math.round((run.from + run.to) / 2 - (box.y + box.height / 2));
    if (box.y >= run.from + 4 && box.y + box.height <= run.to - 4) return;
    // The arrow keys pan 100 px a press: ArrowUp moves the map's content down, ArrowDown up.
    await page.locator(".maplibregl-canvas").focus();
    await page.keyboard.press(dy > 0 ? "ArrowUp" : "ArrowDown");
    await expect(map).toHaveAttribute("data-moving", "false", { timeout: 3_000 });
    throw new Error("moved the map; look again");
  }).toPass({ timeout: 20_000 });
}

/**
 * Every point of a target's box (corners, 1 px in, and centre) lands on the target itself: it is a whole
 * 44 px target, not a sliver under a neighbouring roll or leg. The hit is the topmost pin at each point;
 * the search bar, the sheet and the off-screen hint float over the map and aren't what this is about.
 */
async function expectWholeTarget(target: Locator) {
  const box = (await target.boundingBox())!;
  // 44 px, give or take float noise from the marker's sub-pixel transform (43.99999).
  expect(box.width).toBeGreaterThanOrEqual(44 - 0.01);
  expect(box.height).toBeGreaterThanOrEqual(44 - 0.01);
  const hits = await target.evaluate(
    (el, pts) =>
      pts.map(([x, y]) => {
        const hit = document.elementsFromPoint(x, y).find((h) => h.closest(".maplibregl-marker"));
        return hit === el || el.contains(hit ?? null) ? "self" : (hit?.outerHTML.slice(0, 120) ?? "nothing");
      }),
    pointsOf(box),
  );
  expect(hits).toEqual(["self", "self", "self", "self", "self"]);
}

test.describe("a building on the map", () => {
  test("a same-building cluster opens the sheet with its floors instead of zooming", async ({ page }) => {
    await mockBuildings(page);
    await page.goto("/");
    const mall = page.getByRole("button", { name: "4 toilets in this building, see levels" });
    await mapReady(page);
    await expect(mall).toBeVisible();
    // The tower's six share one spot: also a list.
    await expect(page.getByRole("button", { name: "6 toilets in this building, see levels" })).toBeVisible();
    await mall.click();

    const group = page.getByTestId("map-group");
    await expect(group.getByRole("heading", { name: "4 toilets in Level Test Mall" })).toBeVisible();
    // Under floor headers, top floor first.
    await expect(group.getByRole("heading", { level: 4 })).toHaveText(["Level 3", "Level 2", "Level 1", "Basement 1"]);
    const cards = group.getByTestId("toilet-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText("Level 3");
    await expect(cards.nth(1)).toContainText("Level 2");
    await expect(cards.nth(2)).toContainText("Level 1");
    await expect(cards.nth(3)).toContainText("Basement 1");
    await expect(group.getByRole("list", { name: "Basement 1" }).getByTestId("toilet-card")).toHaveCount(1);
    // It didn't zoom: the cluster is still there.
    await expect(mall).toBeVisible();
    await group.getByRole("button", { name: "Close this list" }).click();
    await expect(group).toHaveCount(0);
  });

  test("zoomed in, a building's floors stack, and each roll picks its own toilet", async ({ page }) => {
    await mockBuildings(page);
    await page.goto("/");
    await mapReady(page);
    await zoomMap(page, 1);

    // Three toilets within 15 m: one stack, lowest floor at the bottom. The fourth, 40 m away, stays a pin.
    const stack = page.getByRole("group", { name: "3 toilets stacked here, one per level" });
    await expect(stack).toBeVisible();
    const rolls = stack.getByRole("button");
    await expect(rolls).toHaveCount(3);
    await expect(rolls.nth(0)).toHaveAccessibleName("Toilet on B1");
    await expect(rolls.nth(1)).toHaveAccessibleName("Toilet on L1");
    await expect(rolls.nth(2)).toHaveAccessibleName("Toilet on L3");
    const b1Box = (await rolls.nth(0).boundingBox())!;
    const l3Box = (await rolls.nth(2).boundingBox())!;
    expect(l3Box.y).toBeLessThan(b1Box.y);
    // The reported issue on L1 still shows on its roll.
    await expect(rolls.nth(1).locator(".bg-danger")).toHaveCount(1);

    // Each roll with its tag is a whole 44 px target: none is a sliver under the roll above.
    await intoOpen(page, stack);
    for (let i = 0; i < 3; i++) await expectWholeTarget(rolls.nth(i));

    // The bottom roll is reachable under the others.
    await rolls.nth(0).click();
    const picked = page.getByTestId("toilet-card").filter({ hasText: "Basement 1" }).first();
    await expect(page.getByText("Selected on map")).toBeVisible();
    await expect(picked).toContainText("Level Test Mall");
    await expect(rolls.nth(0)).toHaveAttribute("aria-pressed", "true");

    await stack.getByRole("button", { name: "Toilet on L3" }).click();
    await expect(page.getByTestId("toilet-card").filter({ hasText: "Level 3" }).first()).toBeVisible();
    await expect(stack.getByRole("button", { name: "Toilet on L3" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a tall stack folds into one roll that fans out by level", async ({ page }) => {
    await mockBuildings(page);
    await page.goto("/");
    await mapReady(page);
    await zoomMap(page, 1);

    const folded = page.getByRole("button", { name: "6 toilets stacked here on 6 levels, show them" });
    await expect(folded).toBeVisible();
    await intoOpen(page, folded);
    await folded.click();
    const ring = page.getByRole("group", { name: "6 toilets at this spot, by level" });
    await expect(ring.getByRole("button")).toHaveCount(6);
    // The fan has landed (it may pan the map to make room), and each leg is a whole 44 px target.
    await expect(mapOf(page)).toHaveAttribute("data-moving", "false");
    for (let i = 0; i < 6; i++) await expectWholeTarget(ring.getByRole("button").nth(i));
    await expectWholeTarget(page.getByRole("button", { name: "Hide the 6 toilets stacked here" }));
    await expect(ring.getByRole("button", { name: "Toilet on B2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide the 6 toilets stacked here" })).toHaveAttribute("aria-expanded", "true");

    // Escape folds it back.
    await page.keyboard.press("Escape");
    await expect(ring).toHaveCount(0);

    await folded.click();
    await ring.getByRole("button", { name: "Toilet on L5" }).click();
    await expect(page.getByText("Selected on map")).toBeVisible();
    await expect(page.getByTestId("toilet-card").filter({ hasText: "Tall Tower" }).first()).toContainText("Level 5");
  });

  test("the floor picker narrows stacks to its floor and goes back to All when it leaves", async ({ page }) => {
    await mockBuildings(page);
    await page.goto("/");
    await mapReady(page);
    // Not at building zoom yet: no picker.
    await expect(page.getByTestId("floor-picker")).toHaveCount(0);
    await zoomMap(page, 1);

    const picker = page.getByRole("group", { name: "Floor" });
    await expect(picker).toBeVisible();
    // Top floor first, then All.
    const floors = picker.getByRole("button");
    await expect(floors.first()).toHaveText("L9");
    await expect(floors.last()).toHaveText("All");
    await expect(picker.getByRole("button", { name: "Show toilets on all floors" })).toHaveAttribute("aria-pressed", "true");

    await picker.getByRole("button", { name: "Show toilets on B1" }).click();
    await expect(picker.getByRole("button", { name: "Show toilets on B1" })).toHaveAttribute("aria-pressed", "true");
    // The mall's stack is now only its B1 toilet; the other floors' rolls are gone, not just faded.
    const stack = page.getByRole("group", { name: "3 toilets stacked here, one per level" });
    // The tower's stack likewise: each is now one roll, B1's.
    const onB1 = page.getByRole("group", { name: "1 toilet on B1", exact: true });
    await expect(onB1).toHaveCount(2);
    for (const one of await onB1.all()) {
      await expect(one.getByRole("button")).toHaveCount(1);
      await expect(one.getByRole("button", { name: "Toilet on B1" })).not.toHaveClass(/opacity-35/);
    }
    await expect(stack).toHaveCount(0);

    // Keyboard: arrow keys move through the floors.
    await picker.getByRole("button", { name: "Show toilets on B1" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(picker.getByRole("button", { name: "Show toilets on B2" })).toHaveAttribute("aria-pressed", "true");
    // Nothing of the mall's stack is on B2: all of it is back, dimmed like a single pin on another floor.
    await expect(stack.getByRole("button")).toHaveCount(3);
    await expect(stack.getByRole("button", { name: "Toilet on L3" })).toHaveClass(/opacity-35/);

    // Zoomed back out the picker goes, and with it the floor.
    await zoomMap(page, -1);
    await expect(page.getByTestId("floor-picker")).toHaveCount(0);
    await zoomMap(page, 1);
    await expect(picker.getByRole("button", { name: "Show toilets on all floors" })).toHaveAttribute("aria-pressed", "true");
    await expect(stack.getByRole("button", { name: "Toilet on L3" })).not.toHaveClass(/opacity-35/);
  });

  test("a 20-toilet building cluster opens with one request", async ({ page }) => {
    const api = await mockBuildings(page, BIG_MALL_TOILETS);
    await page.goto("/");
    await mapReady(page);
    await page.getByRole("button", { name: "20 toilets in this building, see levels" }).click();

    const group = page.getByTestId("map-group");
    await expect(group.getByRole("heading", { name: "20 toilets in Big Test Mall" })).toBeVisible();
    const cards = group.getByTestId("toilet-card");
    await expect(cards).toHaveCount(20);
    // Top floor first.
    await expect(cards.nth(0)).toContainText("Level 17");
    await expect(cards.nth(19)).toContainText("Basement 3");
    expect(api.find("GET", "/venues/venue-big")).toHaveLength(1);
    expect(api.calls.filter((c) => c.method === "GET" && /^\/toilets\/big-/.test(c.path))).toEqual([]);
  });

  test("a stack too big to fan out opens as the building's list", async ({ page }) => {
    const api = await mockBuildings(page, BIG_MALL_TOILETS);
    await page.goto("/");
    await mapReady(page);
    await zoomMap(page, 1);
    const folded = page.getByRole("button", { name: "20 toilets stacked here on 20 levels, show them" });
    await intoOpen(page, folded);
    await folded.click();

    const group = page.getByTestId("map-group");
    await expect(group.getByRole("heading", { name: "20 toilets in Big Test Mall" })).toBeVisible();
    await expect(group.getByTestId("toilet-card")).toHaveCount(20);
    await expect(page.getByRole("group", { name: "20 toilets at this spot, by level" })).toHaveCount(0);
    expect(api.find("GET", "/venues/venue-big")).toHaveLength(1);
    expect(api.calls.filter((c) => c.method === "GET" && /^\/toilets\/big-/.test(c.path))).toEqual([]);
  });
});

/** Saves "Which toilets do you use?" before the page loads (mockApi only fills it in when nothing is saved). */
async function preferSex(page: Page, sex: "MALE" | "FEMALE") {
  await page.addInitScript((sex) => {
    localStorage.setItem("sgw:sex-pref", JSON.stringify({ sex, accessible: false, askedAt: "2026-01-01T00:00:00.000Z" }));
  }, sex);
}

/**
 * Taps a folded stack until its fan is open with `legs` legs and the map has settled. A camera move that
 * lands just after the tap (the sheet easing the map's padding as the list arrives) folds a fan again.
 */
async function openFan(page: Page, folded: Locator, ring: Locator, legs: number) {
  await intoOpen(page, folded);
  await expect(async () => {
    if (!(await ring.isVisible())) await folded.click();
    await expect(ring.getByRole("button")).toHaveCount(legs, { timeout: 2_000 });
    await expect(mapOf(page)).toHaveAttribute("data-moving", "false", { timeout: 2_000 });
    await expect(ring.getByRole("button")).toHaveCount(legs, { timeout: 500 });
  }).toPass({ timeout: 20_000 });
}

const WATERWAY_FLOORS = ["Level 2", "Level 1", "Basement 1", "Basement 2", "Basement 3", "Floor unknown"];

test.describe("a 13-toilet building at one spot (Waterway Point)", () => {
  /** At building zoom: the folded stack of all thirteen. */
  async function zoomedIn(page: Page) {
    await mockBuildings(page, WATERWAY_TOILETS);
    await page.goto("/");
    await mapReady(page);
    await zoomMap(page, 1);
  }

  test("the stack fans out by floor, top floor first; a floor's leg picks that floor", async ({ page }) => {
    await zoomedIn(page);
    const folded = page.getByRole("button", { name: "13 toilets stacked here on 5 levels, show them" });
    // Six legs, not thirteen and not a list: five floors and "Floor unknown", top floor first, unknown last.
    const ring = page.getByRole("group", { name: "13 toilets at this spot, by level" });
    await openFan(page, folded, ring, 6);
    const legs = ring.getByRole("button");
    await expect(legs.nth(0)).toHaveAccessibleName("2 toilets on L2");
    await expect(legs.nth(1)).toHaveAccessibleName("4 toilets on L1");
    await expect(legs.nth(2)).toHaveAccessibleName("4 toilets on B1");
    await expect(legs.nth(3)).toHaveAccessibleName("Men's toilet on B2");
    await expect(legs.nth(4)).toHaveAccessibleName("Unisex toilet on B3");
    await expect(legs.nth(5)).toHaveAccessibleName("Toilet, level unknown");
    await expect(legs.nth(2)).toContainText("B1 · 4");
    for (let i = 0; i < 6; i++) await expectWholeTarget(legs.nth(i));
    await expect(page.getByTestId("map-group")).toHaveCount(0);

    // B1 holds more than a stack draws: the picker goes to B1 and the sheet lists B1's four.
    await ring.getByRole("button", { name: "4 toilets on B1" }).click();
    const picker = page.getByRole("group", { name: "Floor" });
    await expect(picker.getByRole("button", { name: "Show toilets on B1" })).toHaveAttribute("aria-pressed", "true");
    const group = page.getByTestId("map-group");
    await expect(group.getByRole("heading", { name: "4 of 13 toilets in Waterway Test Point" })).toBeVisible();
    await expect(group.getByTestId("map-group-floor")).toContainText("Showing B1");
    // B1's four are one card: the lead (men's, with no preference) and the other three as "here too" rows.
    await expect(group.getByTestId("toilet-card")).toHaveCount(1);
    await expect(group.getByTestId("toilet-card")).toContainText("Basement 1");
    await expect(group.getByTestId("also-here")).toHaveCount(3);
    // On the map, the stack is now B1's four.
    await expect(page.getByRole("button", { name: "4 toilets on B1 stacked here, show them" })).toBeAttached();

    // "Show all floors" puts every floor back, in the list and on the picker.
    await group.getByRole("button", { name: "Show all floors" }).click();
    await expect(picker.getByRole("button", { name: "Show toilets on all floors" })).toHaveAttribute("aria-pressed", "true");
    // One card per floor; the other seven toilets are rows inside them.
    await expect(group.getByTestId("toilet-card")).toHaveCount(6);
    await expect(group.getByTestId("also-here")).toHaveCount(7);
    await expect(group.getByRole("heading", { level: 4 })).toHaveText(WATERWAY_FLOORS);
  });

  test("a floor with few enough toilets shows as rolls; picking L1 narrows the stack to its four", async ({ page }) => {
    await zoomedIn(page);
    const folded = page.getByRole("button", { name: "13 toilets stacked here on 5 levels, show them" });
    const all = page.getByRole("group", { name: "13 toilets at this spot, by level" });
    await openFan(page, folded, all, 6);
    await all.getByRole("button", { name: "2 toilets on L2" }).click();

    // L2's two fit as a stack of rolls, and the picker says L2.
    const picker = page.getByRole("group", { name: "Floor" });
    await expect(picker.getByRole("button", { name: "Show toilets on L2" })).toHaveAttribute("aria-pressed", "true");
    const l2 = page.getByRole("group", { name: "2 toilets on L2" });
    await expect(l2.getByTestId("stack-roll")).toHaveCount(2);
    await expect(page.getByTestId("map-group")).toHaveCount(0);

    // Picking L1 on the picker: the stack folds to L1's four and fans out one leg per toilet.
    await picker.getByRole("button", { name: "Show toilets on L1" }).click();
    const l1 = page.getByRole("button", { name: "4 toilets on L1 stacked here, show them" });
    await expect(l1).toBeVisible();
    const ring = page.getByRole("group", { name: "4 toilets on L1", exact: true });
    await openFan(page, l1, ring, 4);
    for (let i = 0; i < 4; i++) await expectWholeTarget(ring.getByRole("button").nth(i));

    // Moving the map yourself folds it (the keys, like a drag).
    await page.locator(".maplibregl-canvas").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(ring).toHaveCount(0);
  });

  test("the sheet's list is grouped by floor, then follows the floor picker", async ({ page }) => {
    await mockBuildings(page, WATERWAY_TOILETS);
    await page.goto("/");
    await mapReady(page);
    await page.getByRole("button", { name: "13 toilets in this building, see levels" }).click();

    const group = page.getByTestId("map-group");
    await expect(group.getByRole("heading", { name: "13 toilets in Waterway Test Point" })).toBeVisible();
    await expect(group.getByRole("heading", { level: 4 })).toHaveText(WATERWAY_FLOORS);
    // A floor is one card: L1's four toilets are its lead and three "here too" rows.
    const l1 = group.getByRole("list", { name: "Level 1" });
    await expect(l1.getByTestId("toilet-card")).toHaveCount(1);
    await expect(l1.getByTestId("also-here")).toHaveCount(3);
    await expect(group.getByRole("list", { name: "Floor unknown" }).getByTestId("toilet-card")).toHaveCount(1);
    await expect(group.getByTestId("map-group-floor")).toHaveCount(0);

    // Zoomed in with the list still open, the floor picker narrows it.
    await zoomMap(page, 1);
    await page.getByRole("group", { name: "Floor" }).getByRole("button", { name: "Show toilets on L1" }).click();
    await expect(group.getByRole("heading", { name: "4 of 13 toilets in Waterway Test Point" })).toBeVisible();
    await expect(group.getByTestId("map-group-floor")).toContainText("Showing L1");
    await expect(group.getByTestId("toilet-card")).toHaveCount(1);
    await expect(group.getByTestId("also-here")).toHaveCount(3);
    await expect(group.getByRole("heading", { level: 4 })).toHaveCount(0);
  });

  test("Men's: men's toilets come first in the fan and the list", async ({ page }) => {
    await preferSex(page, "MALE");
    await zoomedIn(page);
    await page.getByRole("group", { name: "Floor" }).getByRole("button", { name: "Show toilets on B1" }).click();
    const folded = page.getByRole("button", { name: "4 toilets on B1 stacked here, show them" });
    const ring = page.getByRole("group", { name: "4 toilets on B1", exact: true });
    await openFan(page, folded, ring, 4);
    const legs = ring.getByRole("button");
    await expect(legs.nth(0)).toHaveAccessibleName("Men's toilet on B1");
    await expect(legs.nth(1)).toHaveAccessibleName("Men's toilet on B1");
    await expect(legs.nth(2)).toHaveAccessibleName("Unisex toilet on B1");
    await expect(legs.nth(3)).toHaveAccessibleName("Unisex toilet on B1");

    // The building's list: each floor's card is led by a men's toilet; its twin, then the accessible ones, follow.
    await page.keyboard.press("Escape");
    await zoomMap(page, -1);
    await page.getByRole("button", { name: "13 toilets in this building, see levels" }).click();
    const l1 = page.getByTestId("map-group").getByRole("list", { name: "Level 1" });
    await expect(l1.getByTestId("toilet-card")).toHaveCount(1);
    await expect(l1.getByTestId("toilet-card")).toContainText("Men's");
    await expect(l1.getByTestId("also-here")).toHaveText([/^Men's/, /^Accessible toilet here too/, /^Accessible toilet here too/]);
  });

  test("Women's: with no women's toilet here, accessible/unisex come before men's", async ({ page }) => {
    await preferSex(page, "FEMALE");
    await mockBuildings(page, WATERWAY_TOILETS);
    await page.goto("/");
    await mapReady(page);
    await page.getByRole("button", { name: "13 toilets in this building, see levels" }).click();
    const b1 = page.getByTestId("map-group").getByRole("list", { name: "Basement 1" });
    await expect(b1.getByTestId("toilet-card")).toHaveCount(1);
    await expect(b1.getByTestId("toilet-card")).toContainText("Accessible / unisex");
    await expect(b1.getByTestId("also-here")).toHaveText([/^Accessible \/ unisex/, /^Men's toilet here too/, /^Men's toilet here too/]);
  });
});

test.describe("two places at one spot (a block's coffee shops)", () => {
  test("their toilets stack as one, each roll naming its place", async ({ page }) => {
    await mockBuildings(page, COFFEESHOP_TOILETS);
    await page.goto("/");
    await mapReady(page);
    await zoomMap(page, 1);

    // Three toilets, two places, one coordinate: one stack of rolls, not pins on top of each other.
    const stack = page.getByRole("group", { name: "3 toilets stacked here at 2 places" });
    await expect(stack).toBeVisible();
    const rolls = stack.getByTestId("stack-roll");
    await expect(rolls).toHaveCount(3);
    // Each roll says whose it is, aloud and on its tag, once the places' names have loaded.
    await expect(stack.getByRole("button", { name: "Unisex toilet at Kopi Test One, Blk 101 Yishun Ave 5", exact: true })).toBeVisible();
    await expect(stack.getByRole("button", { name: "Men's toilet at Kopi Test Two, Blk 101 Yishun Ave 5", exact: true })).toBeVisible();
    await expect(stack.getByRole("button", { name: "Women's toilet at Kopi Test Two, Blk 101 Yishun Ave 5", exact: true })).toBeVisible();
    await expect(stack.getByRole("button", { name: /^Men's toilet/ })).toContainText("Men's · Kopi Test Two, Blk 101");
    await intoOpen(page, stack);
    for (let i = 0; i < 3; i++) await expectWholeTarget(rolls.nth(i));

    await stack.getByRole("button", { name: /^Women's toilet/ }).click();
    await expect(page.getByText("Selected on map")).toBeVisible();
    await expect(page.getByTestId("toilet-card").first()).toContainText("Kopi Test Two");
  });

  test("the spot's list goes place by place, a card per place and floor", async ({ page }) => {
    await mockBuildings(page, COFFEESHOP_TOILETS);
    await page.goto("/");
    await mapReady(page);
    await page.getByRole("button", { name: "3 toilets at this spot, see the list" }).click();

    const group = page.getByTestId("map-group");
    await expect(group.getByRole("heading", { name: "3 toilets at this spot" })).toBeVisible();
    await expect(group.getByRole("heading", { level: 4 })).toHaveText([
      "Kopi Test One, Blk 101 Yishun Ave 5",
      "Kopi Test Two, Blk 101 Yishun Ave 5",
    ]);
    const one = group.getByRole("list", { name: "Kopi Test One, Blk 101 Yishun Ave 5" });
    await expect(one.getByTestId("toilet-card")).toHaveCount(1);
    await expect(one.getByTestId("also-here")).toHaveCount(0);
    // The other shop's men's and women's are one card: men's leads (no preference), women's is a row in it.
    const two = group.getByRole("list", { name: "Kopi Test Two, Blk 101 Yishun Ave 5" });
    await expect(two.getByTestId("toilet-card")).toHaveCount(1);
    await expect(two.getByTestId("toilet-card")).toContainText("Men's");
    await expect(two.getByRole("link", { name: "Women's toilet here too, Kopi Test Two, Blk 101 Yishun Ave 5" })).toBeVisible();
  });
});
