import { expect, test, type Locator, type Page } from "@playwright/test";
import { HAWKER_TOILETS, TOILETS } from "./fixtures";
import { mockApi } from "./mock-api";

/*
 * Lists show one card per place and floor (lib/toilet-groups.ts): the toilet someone would walk into leads,
 * the others on that floor are "here too" rows inside it. The near list stays in walking order, by each
 * card's lead.
 */

const [hawkerMen, hawkerAccessible] = HAWKER_TOILETS;
/** In walking order: the hawker centre's accessible toilet is the nearest, its men's comes after Dhoby Ghaut. */
const NEAR = [hawkerAccessible, TOILETS[0], hawkerMen, TOILETS[1], TOILETS[2]];

async function nearList(page: Page, opts: { accessible?: boolean; sex?: "MALE" | "FEMALE" } = {}) {
  if (opts.accessible) await page.addInitScript(() => localStorage.setItem("sgw:filters", JSON.stringify(["ACCESSIBLE"])));
  if (opts.sex) {
    await page.addInitScript((sex) => {
      localStorage.setItem("sgw:sex-pref", JSON.stringify({ sex, accessible: false, askedAt: "2026-01-01T00:00:00.000Z" }));
    }, opts.sex);
  }
  await mockApi(page, { overrides: { "GET /toilets/nearby": () => ({ body: { items: NEAR } }) } });
  await page.goto("/");
  return page.getByRole("list", { name: "Toilets sorted by walking time" });
}

/** The list's own rows (a card's feature chips are list items too). */
const rows = (list: Locator) => list.locator(":scope > li");

test.describe("one card per place and floor", () => {
  test("a hawker centre's men's and accessible toilets are one card, men's leading, at the men's place in the walk order", async ({
    page,
  }) => {
    const list = await nearList(page);
    const cards = list.getByTestId("toilet-card");
    // Five toilets, four cards; the pair sits where its lead (the men's) walks, after Dhoby Ghaut.
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText("Dhoby Ghaut");
    await expect(cards.nth(1)).toContainText("Punggol Test Hawker Centre · Men's");
    await expect(cards.nth(1)).not.toContainText("Accessible / unisex");
    // Walk there goes on the nearest lead, which is Dhoby Ghaut's, not on the hawker centre's nearer accessible one.
    await expect(list.getByTestId("walk-there")).toHaveCount(1);
    await expect(rows(list).nth(0).getByTestId("walk-there")).toBeVisible();

    // The accessible toilet is a row in the men's card, a link of its own with a name of its own.
    const hawker = rows(list).nth(1);
    const row = hawker.getByTestId("also-here");
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAccessibleName("Accessible toilet here too, Punggol Test Hawker Centre, Level 1");
    expect((await row.boundingBox())!.height).toBeCloseTo(44, 0);
    await row.click();
    await expect(page).toHaveURL(/\/toilets\/hk-access$/);
  });

  test("with the Accessible filter on, the accessible toilet leads the card and gets Walk there", async ({ page }) => {
    const list = await nearList(page, { accessible: true });
    const cards = list.getByTestId("toilet-card");
    await expect(cards).toHaveCount(4);
    // Led by the accessible one, the pair now walks first.
    await expect(cards.nth(0)).toContainText("Punggol Test Hawker Centre · Accessible / unisex");
    const first = rows(list).nth(0);
    await expect(first.getByRole("link", { name: "Walk to Punggol Test Hawker Centre, Accessible / unisex" })).toBeVisible();
    await expect(first.getByTestId("also-here")).toHaveText(/^Men's toilet here too/);
    await expect(list.getByTestId("walk-there")).toHaveCount(1);
  });

  test("Women's: with no women's toilet there, the accessible one is a plain card of its own", async ({ page }) => {
    const list = await nearList(page, { sex: "FEMALE" });
    const cards = list.getByTestId("toilet-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toContainText("Punggol Test Hawker Centre · Accessible / unisex");
    await expect(list.getByTestId("also-here")).toHaveCount(0);
    await expect(rows(list).nth(0).getByTestId("walk-there")).toBeVisible();
  });
});

test("the sheet's list stops above the tab bar's bump, so its last links are never under the bar", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByTestId("toilet-card").first()).toBeVisible();
  const sheet = page.getByRole("region", { name: "Nearby toilets" });
  const handle = sheet.getByRole("button", { name: "Expand list" });
  await handle.click();
  await handle.click();
  await expect(sheet.getByRole("button", { name: "Collapse list" })).toBeVisible();
  // At rest: while it glides the sheet is held taller and moved by a transform (bottom-sheet.tsx).
  await expect.poll(() => sheet.evaluate((el) => el.style.transform)).toBe("");

  const { listBottom, bumpTop } = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('section[aria-label="Nearby toilets"] [data-sheet-list]')!;
    list.scrollTop = list.scrollHeight;
    return {
      listBottom: list.getBoundingClientRect().bottom,
      bumpTop: document.querySelector("nav[aria-label=Main] svg.nav-bump")!.getBoundingClientRect().top,
    };
  });
  expect(listBottom).toBeLessThanOrEqual(bumpTop + 0.5);

  // Scrolled to its end, each footer link is the thing under its own middle.
  for (const name of ["Privacy", "Terms"]) {
    const link = sheet.getByRole("link", { name, exact: true });
    await link.scrollIntoViewIfNeeded();
    const hit = await link.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!at && (el === at || el.contains(at));
    });
    expect(hit, `${name} is covered`).toBe(true);
  }
});
