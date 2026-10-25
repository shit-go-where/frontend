import { expect, test } from "@playwright/test";
import { normalizeLevel, levelOrder } from "../lib/level";
import { NEARBY_VENUES, RECOMMEND, TOILETS, TOILET_DETAIL } from "./fixtures";
import { mockApi } from "./mock-api";

/*
 * Toilets on several floors of one building: the level mirror, level chips in the add flow, the other
 * floors on a toilet's page, and the floor question in /go. The map's side is in map-levels.spec.ts.
 */

test.describe("level normalisation (mirror of backend/src/common/level.ts)", () => {
  // The same cases as backend/src/common/level.spec.ts: the two copies must agree.
  const cases: [string, string | null][] = [
    ["basement 1", "B1"],
    ["Basement 2", "B2"],
    ["b1", "B1"],
    ["B01", "B1"],
    ["-1", "B1"],
    ["basement", "B1"],
    ["level 3", "L3"],
    ["l3", "L3"],
    ["lvl 3", "L3"],
    ["3", "L3"],
    ["03", "L3"],
    ["#03", "L3"],
    ["#03-12", "L3"],
    ["#B1-05", "B1"],
    ["3rd floor", "L3"],
    ["ground", "L1"],
    ["g", "L1"],
    ["GF", "L1"],
    ["ground floor", "L1"],
    ["0", "L1"],
    ["mezzanine", "M"],
    ["m", "M"],
    ["B1; L3", "B1; L3"],
    ["b1;l3", "B1; L3"],
    ["B1, L3", "B1; L3"],
    ["B1/L3", "B1; L3"],
    ["b1 & 3", "B1; L3"],
    ["basement 1 and level 3", "B1; L3"],
    ["L1, 1, ground", "L1"],
    ["  Roof garden ", "Roof garden"],
    ["Block 2/3A", "Block 2/3A"],
    ["B1; Concourse", "B1; Concourse"],
    ["", null],
    [" ; ", null],
  ];
  for (const [input, out] of cases) {
    test(`${JSON.stringify(input)} → ${JSON.stringify(out)}`, () => {
      expect(normalizeLevel(input)).toBe(out);
    });
  }
  test("levelOrder", () => {
    expect(levelOrder("B2")).toBe(-2);
    expect(levelOrder("L1")).toBe(1);
    expect(levelOrder("M")).toBe(1.5);
    expect(levelOrder("B1; L3")).toBe(-1);
    expect(levelOrder("basement 2")).toBe(-2);
    expect(levelOrder("Concourse")).toBeNull();
    expect(levelOrder(null)).toBeNull();
  });
});

test.describe("level chips", () => {
  test("add flow: chips for common floors, Other… for the rest, tidied on blur", async ({ page }) => {
    const api = await mockApi(page, {
      signedIn: true,
      overrides: {
        // Somewhere with no toilets yet: the level stays optional.
        "GET /venues/nearby": () => ({ body: { items: [{ ...NEARBY_VENUES[0], toiletCount: 0 }] } }),
        [`GET /venues/${NEARBY_VENUES[0].id}`]: () => ({ body: { ...NEARBY_VENUES[0], address: null, planningArea: null, toilets: [] } }),
        "POST /submissions": (req) => {
          const body = req.postDataJSON() as { payload: unknown };
          return { body: { id: "sub-9", kind: "NEW_TOILET", state: "PENDING", payload: body.payload } };
        },
      },
    });
    await page.goto("/add");
    const next = page.getByTestId("add-next");
    await next.click();
    await page.getByTestId("venue-option").filter({ hasText: "Plaza Singapura" }).click();
    await next.click();

    const levels = page.getByRole("group", { name: "Level (optional)" });
    for (const l of ["B3", "B2", "B1", "L1", "L2", "L3", "L4", "L5", "L6", "Other…"]) {
      await expect(levels.getByRole("button", { name: l, exact: true })).toBeVisible();
    }
    // Optional here: Next works without one.
    await expect(next).toBeEnabled();

    // A chip, then a second tap clears it.
    const l2 = levels.getByRole("button", { name: "L2", exact: true });
    await l2.click();
    await expect(l2).toHaveAttribute("aria-pressed", "true");
    await l2.click();
    await expect(l2).toHaveAttribute("aria-pressed", "false");

    // Other…: typed the long way, normalised when the field is left.
    await levels.getByRole("button", { name: "Other…" }).click();
    const other = page.getByLabel("Level (optional): another floor");
    await other.fill("level 12");
    await other.blur();
    await expect(other).toHaveValue("L12");
    // A chip's floor typed out becomes that chip.
    await other.fill("basement 2");
    await other.blur();
    await expect(levels.getByRole("button", { name: "B2", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Level (optional): another floor")).toHaveCount(0);

    await next.click();
    await page.getByTestId("add-submit").click();
    await expect(page.getByTestId("add-success")).toBeVisible();
    expect(api.find("POST", "/submissions")[0].body).toMatchObject({ payload: { level: "B2" } });
  });
});

test.describe("a level the place needs", () => {
  const plaza = NEARBY_VENUES[0];
  const venueBody = (toilets: unknown[]) => ({ body: { ...plaza, address: null, planningArea: null, toilets } });

  test("the API's level_needed sends you back to the level, marked needed, with the reason", async ({ page }) => {
    let posts = 0;
    const message = "This place already has a toilet listed. Add the level (for example B1 or L3) so people can tell them apart.";
    const api = await mockApi(page, {
      signedIn: true,
      overrides: {
        // Nothing listed as far as this phone knows; someone else's pending toilet landed meanwhile.
        "GET /venues/nearby": () => ({ body: { items: [{ ...plaza, toiletCount: 0 }] } }),
        [`GET /venues/${plaza.id}`]: () => venueBody([]),
        "POST /submissions": (req) => {
          posts++;
          if (posts === 1) return { status: 400, body: { statusCode: 400, error: "Bad Request", message, code: "level_needed" } };
          const body = req.postDataJSON() as { payload: unknown };
          return { body: { id: "sub-9", kind: "NEW_TOILET", state: "PENDING", payload: body.payload } };
        },
      },
    });
    await page.goto("/add");
    const next = page.getByTestId("add-next");
    await next.click();
    await page.getByTestId("venue-option").filter({ hasText: "Plaza Singapura" }).click();
    await next.click();
    await expect(page.getByRole("group", { name: "Level (optional)" })).toBeVisible();
    await next.click();
    await page.getByTestId("add-submit").click();

    // Back on the details step, not a dead end on the last one.
    await expect(page.getByRole("heading", { name: /Step 3 of 4/ })).toBeVisible();
    const levels = page.getByRole("group", { name: "Level (needed here)" });
    await expect(levels.getByRole("alert")).toHaveText(message);
    await expect(levels.getByRole("button", { name: "B3", exact: true })).toBeFocused();
    await expect(next).toBeDisabled();

    await levels.getByRole("button", { name: "L2", exact: true }).click();
    await expect(levels.getByRole("alert")).toHaveCount(0);
    await next.click();
    await page.getByTestId("add-submit").click();
    await expect(page.getByTestId("add-success")).toBeVisible();
    expect(api.find("POST", "/submissions")[1].body).toMatchObject({ payload: { venueId: plaza.id, level: "L2" } });
  });

  test("a place found by search with only a pending toilet needs a level too", async ({ page }) => {
    const searched = { ...plaza, id: "venue-searched", name: "Searched Mall" };
    const pending = { ...TOILETS[1], id: "t-pending-here", status: "PENDING" as const, venue: searched };
    await mockApi(page, {
      signedIn: true,
      overrides: {
        "GET /venues/search": () => ({ body: { items: [searched] } }),
        [`GET /venues/${searched.id}`]: () => ({ body: { ...searched, address: null, planningArea: null, toilets: [pending] } }),
      },
    });
    await page.goto("/add");
    const next = page.getByTestId("add-next");
    await next.click();
    await page.getByLabel("Search places").fill("Searched");
    await page.getByTestId("venue-option").filter({ hasText: "Searched Mall" }).click();
    await next.click();

    const levels = page.getByRole("group", { name: "Level (needed here)" });
    await expect(levels).toBeVisible();
    await expect(page.getByText("Searched Mall already has a toilet listed, so say which floor this one is on.")).toBeVisible();
    await expect(next).toBeDisabled();
    await levels.getByRole("button", { name: "B1", exact: true }).click();
    await expect(next).toBeEnabled();
  });
});

test.describe("level-aware routing", () => {
  test("urgent: asks which floor once, when the nearest building has toilets on two floors", async ({ page }) => {
    const dhoby = TOILETS[0];
    const upstairs = { ...dhoby, id: "t-dhoby-l1", level: "L1", label: "Concourse" };
    const api = await mockApi(page, {
      overrides: {
        "GET /toilets/nearby": () => ({ body: { items: [...TOILETS, upstairs] } }),
        "POST /routing/recommend": () => ({ body: RECOMMEND }),
      },
    });
    await page.goto("/go?urgent=1");
    await expect(page.getByTestId("recommendation").first()).toContainText("Dhoby Ghaut");

    const question = page.getByTestId("floor-question");
    await expect(question.getByRole("heading", { name: "Which level are you on?" })).toBeVisible();
    await expect(question.getByRole("button", { name: "B1", exact: true })).toBeVisible();
    await expect(question.getByRole("button", { name: "L1", exact: true })).toBeVisible();
    await expect(question.getByRole("button", { name: "Not sure" })).toBeVisible();
    // The first ask went out without a floor.
    expect(api.find("POST", "/routing/recommend")[0].body).not.toHaveProperty("level");

    await question.getByRole("button", { name: "L1", exact: true }).click();
    await expect.poll(() => api.find("POST", "/routing/recommend").some((c) => (c.body as { level?: string }).level === "L1")).toBe(true);
    await expect(question).toBeHidden();
    await expect(page.getByText("Counting floors from L1")).toBeVisible();
    // Change asks again, in the same place.
    await page.getByRole("button", { name: "Change your level" }).click();
    await expect(question).toBeVisible();
  });

  /*
   * The question lands after the results and is answered while they're up, so it must not move them:
   * it sits under the best option, and its answer keeps its height. Layout shifts are counted the way CLS
   * counts them (none within 0.5 s of a tap), with the re-ranked answer held back past that window.
   */
  for (const path of ["/go?urgent=1", "/go?fussy=5"]) {
    test(`${path}: the floor question moves nothing (CLS under 0.1)`, async ({ page }) => {
      const dhoby = TOILETS[0];
      const upstairs = { ...dhoby, id: "t-dhoby-l1", level: "L1", label: "Concourse" };
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number };
        w.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (e.hadRecentInput) continue;
            w.__cls += e.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await mockApi(page, {
        overrides: {
          "GET /toilets/nearby": () => ({ body: { items: [...TOILETS, upstairs] } }),
          "POST /routing/recommend": () => ({ body: RECOMMEND }),
        },
      });
      // The answer with a floor comes back late, as a real re-rank would over a phone network.
      await page.route("**/api/routing/recommend", async (route) => {
        const level = (route.request().postDataJSON() as { level?: string }).level;
        if (level) await new Promise((r) => setTimeout(r, 900));
        await route.fallback();
      });
      await page.goto(path);
      const hero = page.getByTestId("recommendation").first();
      await expect(hero).toContainText("Dhoby Ghaut");
      const slot = page.getByTestId("floor-slot");
      const question = page.getByTestId("floor-question");
      await expect(question).toBeVisible();

      // Where on the page (not the screen: tapping a chip may scroll it into view).
      const onPage = (l: typeof slot) =>
        l.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { y: r.top + window.scrollY, height: r.height };
        });
      // Under the best option, never above it.
      const heroBox = await onPage(hero);
      const asked = await onPage(slot);
      expect(asked.y).toBeGreaterThanOrEqual(heroBox.y + heroBox.height);

      const reranked = page.waitForResponse(
        (r) => r.url().endsWith("/api/routing/recommend") && !!(r.request().postDataJSON() as { level?: string }).level,
      );
      await question.getByRole("button", { name: "B1", exact: true }).click();
      await expect(page.getByText("Counting floors from B1")).toBeVisible();
      const answered = await onPage(slot);
      expect(answered.height).toBeCloseTo(asked.height, 0);
      expect(answered.y).toBeCloseTo(asked.y, 0);
      // The late re-rank has landed and painted.
      await reranked;
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const { cls } = await page.evaluate(() => ({ cls: (window as unknown as { __cls: number }).__cls }));
      expect(cls).toBeLessThan(0.1);
      expect((await onPage(hero)).y).toBeCloseTo(heroBox.y, 0);
    });
  }
});

test.describe("a toilet's page", () => {
  test("lists the other toilets in the building by floor, this one lit", async ({ page }) => {
    const ID = TOILET_DETAIL.id;
    await mockApi(page, {
      overrides: {
        [`GET /toilets/${ID}`]: () => ({
          body: {
            ...TOILET_DETAIL,
            siblings: [
              { id: "t-dhoby-l1", label: "Concourse", level: "L1", levelOrder: 1, status: "ACTIVE", sex: "FEMALE" },
              { id: "t-dhoby-b2", label: "NEL platform", level: "B2", levelOrder: -2, status: "ACTIVE", sex: null },
              { id: "t-dhoby-x", label: "Near Exit E", level: null, levelOrder: null, status: "ACTIVE", sex: null },
            ],
          },
        }),
        [`GET /toilets/${ID}/status`]: () => ({ body: { items: [] } }),
      },
    });
    await page.goto(`/toilets/${ID}`);
    const floors = page.getByRole("navigation", { name: "3 other toilets in this building" });
    await expect(floors).toBeVisible();
    // Lowest floor first, unknown last; this toilet (B1) is lit and not a link. Who a toilet is for
    // comes before its floor when known (the text also holds the screen-reader words: "toilet on").
    // Each chip carries what tells the toilet apart (sex, label) before its floor, so two on one floor never read the same.
    // (the text also holds the screen-reader words "toilet on" between the tag and the floor).
    await expect(floors.getByRole("listitem")).toHaveText([
      /^NEL platform · .*B2$/,
      /^NSL side, near Exit A · B1 \(this one\)$/,
      /^Women's · Concourse · .*L1$/,
      "Near Exit E",
    ]);
    await expect(floors.getByText("B1 (this one)")).toHaveAttribute("aria-current", "page");
    await expect(floors.getByRole("link", { name: "Women's · Concourse toilet on L1" })).toHaveAttribute("href", "/toilets/t-dhoby-l1");
    await expect(floors.getByRole("link", { name: "NEL platform toilet on B2" })).toHaveAttribute("href", "/toilets/t-dhoby-b2");
    await expect(floors.getByRole("link", { name: "Near Exit E" })).toHaveAttribute("href", "/toilets/t-dhoby-x");
  });

  test("a floor chip swaps that toilet in on the same page", async ({ page }) => {
    const ID = TOILET_DETAIL.id;
    const here = { id: ID, label: TOILET_DETAIL.label, level: "B1", levelOrder: -1, status: "ACTIVE", sex: TOILET_DETAIL.sex };
    const l1 = { id: "t-dhoby-l1", label: "Concourse", level: "L1", levelOrder: 1, status: "ACTIVE", sex: "FEMALE" };
    await mockApi(page, {
      overrides: {
        [`GET /toilets/${ID}`]: () => ({ body: { ...TOILET_DETAIL, level: "B1", siblings: [l1] } }),
        [`GET /toilets/${l1.id}`]: () => ({
          body: { ...TOILET_DETAIL, id: l1.id, label: l1.label, level: l1.level, sex: l1.sex, siblings: [here] },
        }),
        [`GET /toilets/${ID}/status`]: () => ({ body: { items: [] } }),
        [`GET /toilets/${l1.id}/status`]: () => ({ body: { items: [] } }),
      },
    });
    await page.goto(`/toilets/${ID}`);
    const detail = page.getByTestId("toilet-detail");
    await expect(detail).toBeVisible();
    // Marks this page, so a full navigation (which would remount it) shows up.
    await detail.evaluate((el) => el.setAttribute("data-same-page", ""));

    const floors = page.getByRole("navigation", { name: "1 other toilet in this building" });
    await floors.getByRole("link", { name: "Women's · Concourse toilet on L1" }).click();

    await expect(page).toHaveURL(`/toilets/${l1.id}`);
    await expect(floors.getByText("L1 (this one)")).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Women's · Concourse", { exact: true })).toBeVisible();
    await expect(detail).toHaveAttribute("data-same-page", "");
    await expect(page).toHaveTitle(/: L1 \(also B1\) · Shit Go Where$/);
  });
});
