import { expect, test } from "@playwright/test";
import { levelOrder } from "../lib/level";
import { TOILET_DETAIL, WATERWAY_TOILETS } from "./fixtures";
import { mockApi } from "./mock-api";

/**
 * A mall's toilet page lists a dozen sibling chips in a row that scrolls sideways. The chips hold
 * screen-reader-only text (position: absolute), which once escaped the row and widened the whole
 * document, so phones zoomed the page out to fit (Waterway Point, 2026-10-25). The page must never
 * be wider than the screen, however long that row gets.
 */
test("a toilet page with a dozen sibling chips never widens past the screen", async ({ page }) => {
  const ID = TOILET_DETAIL.id;
  const siblings = WATERWAY_TOILETS.filter((t) => t.id !== "ww-osm").map((t) => ({
    id: t.id,
    label: t.label,
    level: t.level,
    levelOrder: levelOrder(t.level),
    status: "ACTIVE" as const,
    sex: t.sex,
  }));
  await mockApi(page, {
    overrides: {
      [`GET /toilets/${ID}`]: () => ({ body: { ...TOILET_DETAIL, siblings } }),
      [`GET /toilets/${ID}/status`]: () => ({ body: { items: [] } }),
    },
  });
  await page.goto(`/toilets/${ID}`);
  const floors = page.getByRole("navigation", { name: `${siblings.length} other toilets in this building` });
  await expect(floors).toBeVisible();

  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.screen);

  // The row itself is what scrolls.
  const row = floors.locator("[class*='overflow-x-auto']").first();
  const scroll = await row.evaluate((el) => ({ content: el.scrollWidth, box: el.clientWidth }));
  expect(scroll.content).toBeGreaterThan(scroll.box);
});
