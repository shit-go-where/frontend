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
    await expect(question).toHaveCount(0);
    await expect(page.getByText("Counting floors from L1")).toBeVisible();
  });
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
              { id: "t-dhoby-l1", label: "Concourse", level: "L1", levelOrder: 1, status: "ACTIVE" },
              { id: "t-dhoby-b2", label: "NEL platform", level: "B2", levelOrder: -2, status: "ACTIVE" },
              { id: "t-dhoby-x", label: "Near Exit E", level: null, levelOrder: null, status: "ACTIVE" },
            ],
          },
        }),
        [`GET /toilets/${ID}/status`]: () => ({ body: { items: [] } }),
      },
    });
    await page.goto(`/toilets/${ID}`);
    const floors = page.getByRole("navigation", { name: "3 other toilets in this building" });
    await expect(floors).toBeVisible();
    // Lowest floor first, unknown last; this toilet (B1) is lit and not a link.
    await expect(floors.getByRole("listitem")).toHaveText([/B2$/, "B1 (this one)", /L1$/, "Near Exit E"]);
    await expect(floors.getByText("B1")).toHaveAttribute("aria-current", "page");
    await expect(floors.getByRole("link", { name: "Toilet on L1" })).toHaveAttribute("href", "/toilets/t-dhoby-l1");
    await expect(floors.getByRole("link", { name: "Near Exit E" })).toHaveAttribute("href", "/toilets/t-dhoby-x");
  });
});
