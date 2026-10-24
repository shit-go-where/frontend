import { expect, test } from "@playwright/test";
import { EXPANDED_DETAIL, FEMALE_TOILET, MALE_TOILET, PILOT_SURVEY, TOILETS, TOILET_DETAIL } from "./fixtures";
import { mockApi } from "./mock-api";

test.describe("which toilets do you use", () => {
  test("asked once on the map: Women's narrows the list and the pins, and stays after a reload", async ({ page }) => {
    const api = await mockApi(page, {
      askSex: true,
      overrides: {
        // As a saved copy might: a men's toilet nearest, whatever was asked for. The list must still leave it out.
        "GET /toilets/nearby": () => ({ body: { items: [MALE_TOILET, FEMALE_TOILET, ...TOILETS] } }),
      },
    });
    await page.goto("/");

    const ask = page.getByTestId("sex-ask");
    await expect(ask.getByText("Which toilets do you use?")).toBeVisible();
    await ask.getByRole("button", { name: "Women's", exact: true }).click();
    await expect(ask).toBeHidden();

    // Both the list and the map's pins ask for toilets usable by women.
    await expect.poll(() => api.find("GET", "/toilets/nearby").some((c) => c.search.includes("sex=FEMALE"))).toBe(true);
    await expect.poll(() => api.find("GET", "/toilets/in-bounds").some((c) => c.search.includes("sex=FEMALE"))).toBe(true);

    // The choice rides under the search on phones, like a filter that's on.
    const chip = page.getByTestId("sex-chip").filter({ visible: true }).first();
    await expect(chip).toContainText("Women's");

    // Strict walking order is kept; the men's one is left out, and "Walk there" goes on the nearest usable one.
    const list = page.getByRole("list", { name: "Toilets sorted by walking time" });
    const cards = list.getByTestId("toilet-card");
    await expect(cards).toHaveCount(1 + TOILETS.length);
    await expect(cards.first()).toContainText("Women's · NEL side");
    await expect(list.getByRole("link", { name: /^Walk to Dhoby Ghaut, Women's/ })).toBeVisible();

    const before = api.calls.length;
    await page.reload();
    await expect(page.getByTestId("sex-chip").filter({ visible: true }).first()).toContainText("Women's");
    await expect(page.getByTestId("sex-ask")).toHaveCount(0);
    // The first list request after the reload already carries it (no unfiltered request first).
    await expect.poll(() => api.calls.slice(before).filter((c) => c.path === "/toilets/nearby").length).toBeGreaterThan(0);
    expect(api.calls.slice(before).find((c) => c.path === "/toilets/nearby")!.search).toContain("sex=FEMALE");
  });

  test("Show all toilets answers with no filter, and it isn't asked again", async ({ page }) => {
    const api = await mockApi(page, { askSex: true });
    await page.goto("/");
    const ask = page.getByTestId("sex-ask");
    await ask.getByRole("button", { name: "Show all toilets", exact: true }).click();
    await expect(ask).toBeHidden();
    await page.reload();
    await expect(page.getByRole("list", { name: "Toilets sorted by walking time" }).getByTestId("toilet-card")).toHaveCount(TOILETS.length);
    await expect(page.getByTestId("sex-ask")).toHaveCount(0);
    expect(api.find("GET", "/toilets/nearby").every((c) => !c.search.includes("sex="))).toBe(true);
  });

  test("closing the question shows all toilets, and it isn't asked again", async ({ page }) => {
    const api = await mockApi(page, { askSex: true });
    await page.goto("/");
    const ask = page.getByTestId("sex-ask");
    await ask.getByRole("button", { name: "Not now, show every toilet" }).click();
    await expect(ask).toBeHidden();
    await page.reload();
    await expect(page.getByRole("list", { name: "Toilets sorted by walking time" }).getByTestId("toilet-card")).toHaveCount(TOILETS.length);
    await expect(page.getByTestId("sex-ask")).toHaveCount(0);
    expect(api.find("GET", "/toilets/nearby").every((c) => !c.search.includes("sex="))).toBe(true);
  });

  test("the chip opens the same picker, and Accessible turns on the Accessible filter", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/");
    // Phones: the choice is made in Filters, then rides as a chip in "Filters on" (the sheet has no room for it).
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const filters = page.getByRole("dialog", { name: "Filters" });
    await filters.getByRole("radio", { name: "Women's", exact: true }).click();
    await filters.getByRole("button", { name: /^Show [0-9]+ toilets?$/ }).click();
    const chip = page.getByRole("group", { name: "Filters on" }).getByTestId("sex-chip");
    await expect(chip).toContainText("Women's");
    await chip.click();

    const dialog = page.getByRole("dialog", { name: "Which toilets do you use?" });
    const all = dialog.getByRole("radio", { name: "Show all toilets", exact: true });
    // One radio group: arrow keys go Men's, Women's, then Show all toilets and round again.
    await dialog.getByRole("radio", { name: "Women's", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(all).toBeFocused();
    await expect(all).toBeChecked();
    // "Show all toilets" takes the chip out of "Filters on", but not while its picker is open.
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByRole("radio", { name: "Men's", exact: true })).toBeFocused();
    await expect(all).not.toBeChecked();
    await dialog.getByRole("switch").check();
    await dialog.getByRole("button", { name: "Done" }).click();

    await expect.poll(() => api.find("GET", "/toilets/nearby").some((c) => c.search.includes("sex=MALE") && c.search.includes("ACCESSIBLE"))).toBe(
      true,
    );
    await expect(page.getByRole("group", { name: "Filters on" }).getByRole("button", { name: "Accessible" })).toBeVisible();
    await expect(page.getByTestId("sex-chip").filter({ visible: true }).first()).toContainText("Men's");
  });

  test("urgent results ask for the saved choice too", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("sgw:sex-pref", JSON.stringify({ sex: "FEMALE", accessible: false, askedAt: "2026-01-01T00:00:00.000Z" })),
    );
    const api = await mockApi(page);
    await page.goto("/go?urgent=1");
    await expect(page.getByTestId("recommendation").first()).toBeVisible();
    expect(api.find("POST", "/routing/recommend")[0].body).toMatchObject({ urgent: true, sex: "FEMALE" });
  });
});

test.describe("survey breakdown", () => {
  test("the expanded 2024 survey reads as rated, never out of 50", async ({ page }) => {
    await mockApi(page);
    await page.goto(`/toilets/${EXPANDED_DETAIL.id}`);

    // Who it's for is named under the place.
    await expect(page.getByRole("heading", { level: 1, name: "Dhoby Ghaut" })).toBeVisible();
    await expect(page.getByText("Women's · NEL side", { exact: true })).toBeVisible();

    await page.getByText("Survey", { exact: true }).first().click();
    await expect(page.getByText("+2 cleanliness, 0 scent", { exact: true })).toBeVisible();
    const fold = page.locator("details", { hasText: "+2 cleanliness, 0 scent" });
    await expect(fold).toContainText("surveyed in person by u/eggmayosandwich in September 2024");
    await expect(fold).toContainText(/2 surveys on record \(Mar and Sept? 2024\); this is the latest\./);
    await expect(fold).not.toContainText("/50");

    const clean = page.getByRole("meter", { name: "Cleanliness" });
    await expect(clean).toHaveAttribute("aria-valuemin", "-3");
    await expect(clean).toHaveAttribute("aria-valuemax", "3");
    await expect(clean).toHaveAttribute("aria-valuenow", "2");
    await expect(clean).toHaveAttribute("aria-valuetext", "+2 on a scale of −3 to +3");
    await expect(page.getByRole("meter", { name: "Scent" })).toHaveAttribute("aria-valuenow", "0");

    // Checklists: how many boxes were ticked, and which.
    await expect(fold).toContainText("3 of 5");
    const ticked = page.getByRole("list", { name: "Toiletries: ticked" });
    await expect(ticked.getByRole("listitem")).toHaveText(["Toilet Paper", "Hand Soap", "Hand Dryer"]);
    await expect(fold).toContainText("0 of 11");
    await expect(fold).toContainText("None ticked");
  });

  test("the March 2024 pilot keeps its 50-point total", async ({ page }) => {
    await mockApi(page, {
      overrides: {
        [`GET /toilets/${TOILET_DETAIL.id}`]: () => ({ body: { ...TOILET_DETAIL, latestSurvey: PILOT_SURVEY, surveyCount: 1 } }),
      },
    });
    await page.goto(`/toilets/${TOILET_DETAIL.id}`);
    await page.getByText("Survey", { exact: true }).first().click();
    const fold = page.locator("details", { hasText: "on the 50-point rubric" });
    await expect(fold).toContainText("33/50 on the 50-point rubric, surveyed in person by u/eggmayosandwich in March 2024.");
    await expect(page.getByRole("meter", { name: "Facilities" })).toHaveAttribute("aria-valuemax", "20");
    await expect(fold).not.toContainText("surveys on record");
  });
});
