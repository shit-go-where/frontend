import { expect, test, type Page } from "@playwright/test";
import { MALL_TOILETS, TOWER_TOILETS, pinOf } from "./fixtures";
import { mockApi } from "./mock-api";

/*
 * A building's toilets on the home map: same-building clusters open as a list, floors stack past
 * clustering, a tall stack fans out, and the floor picker dims the other floors.
 */

const BUILDING = [...MALL_TOILETS, ...TOWER_TOILETS];

/** The map shows only the mall and the tower; each toilet opens from GET /toilets/:id. */
async function mockBuildings(page: Page) {
  return mockApi(page, {
    overrides: {
      "GET /toilets/in-bounds": () => ({ body: { items: BUILDING.map(pinOf) } }),
      ...Object.fromEntries(
        BUILDING.map((t) => [`GET /toilets/${t.id}`, () => ({ body: { ...t, siblings: [] } })] as const),
      ),
    },
  });
}

/** Zooms the home map with the keyboard (+ / -), one whole zoom per press, and waits for it to settle. */
async function zoomMap(page: Page, steps: number) {
  // The first fix flies the map to you; let that land first.
  await page.waitForTimeout(1000);
  const canvas = page.locator(".maplibregl-canvas");
  await canvas.focus();
  for (let i = 0; i < Math.abs(steps); i++) {
    await page.keyboard.press(steps > 0 ? "Equal" : "Minus");
    // MapLibre eases each step; let it land before the next.
    await page.waitForTimeout(450);
  }
}

test.describe("a building on the map", () => {
  test("a same-building cluster opens the sheet with its floors instead of zooming", async ({ page }) => {
    await mockBuildings(page);
    await page.goto("/");
    const mall = page.getByRole("button", { name: "4 toilets in this building, see levels" });
    await expect(mall).toBeVisible();
    // The tower's six share one spot: also a list.
    await expect(page.getByRole("button", { name: "6 toilets in this building, see levels" })).toBeVisible();
    await mall.click();

    const group = page.getByTestId("map-group");
    await expect(group.getByRole("heading", { name: "4 toilets in Level Test Mall" })).toBeVisible();
    // Lowest floor first.
    const cards = group.getByTestId("toilet-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText("Basement 1");
    await expect(cards.nth(1)).toContainText("Level 1");
    await expect(cards.nth(2)).toContainText("Level 2");
    await expect(cards.nth(3)).toContainText("Level 3");
    // It didn't zoom: the cluster is still there.
    await expect(mall).toBeVisible();
    await group.getByRole("button", { name: "Close this list" }).click();
    await expect(group).toHaveCount(0);
  });

  test("zoomed in, a building's floors stack, and each roll picks its own toilet", async ({ page }) => {
    await mockBuildings(page);
    await page.goto("/");
    await expect(page.getByTestId("pin-cluster").first()).toBeVisible();
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
    await expect(page.getByTestId("pin-cluster").first()).toBeVisible();
    await zoomMap(page, 1);

    const folded = page.getByRole("button", { name: "6 toilets stacked here on 6 levels, show them" });
    await expect(folded).toBeVisible();
    await folded.click();
    const ring = page.getByRole("group", { name: "6 toilets at this spot, by level" });
    await expect(ring.getByRole("button")).toHaveCount(6);
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

  test("the floor picker dims other floors and goes back to All when it leaves", async ({ page }) => {
    await mockBuildings(page);
    await page.goto("/");
    await expect(page.getByTestId("pin-cluster").first()).toBeVisible();
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
    const stack = page.getByRole("group", { name: "3 toilets stacked here, one per level" });
    await expect(stack.getByRole("button", { name: "Toilet on B1" })).not.toHaveClass(/opacity-35/);
    await expect(stack.getByRole("button", { name: "Toilet on L3" })).toHaveClass(/opacity-35/);

    // Keyboard: arrow keys move through the floors.
    await picker.getByRole("button", { name: "Show toilets on B1" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(picker.getByRole("button", { name: "Show toilets on B2" })).toHaveAttribute("aria-pressed", "true");

    // Zoomed back out the picker goes, and with it the floor.
    await zoomMap(page, -1);
    await expect(page.getByTestId("floor-picker")).toHaveCount(0);
    await zoomMap(page, 1);
    await expect(picker.getByRole("button", { name: "Show toilets on all floors" })).toHaveAttribute("aria-pressed", "true");
    await expect(stack.getByRole("button", { name: "Toilet on L3" })).not.toHaveClass(/opacity-35/);
  });
});
