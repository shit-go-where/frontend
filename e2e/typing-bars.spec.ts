import { expect, test } from "@playwright/test";
import { NEARBY_VENUES } from "./fixtures";
import { mockApi } from "./mock-api";

/*
 * Android shrinks the page for the keyboard, so the bars docked at the bottom ride up on top of it and cover
 * the field being typed in. While a text field has the keyboard up on a phone they step aside (nav.tsx, data-typing).
 */
test.describe("bottom bars while typing", () => {
  test.beforeEach(({ isMobile }) => test.skip(!isMobile, "the bars only dock at the bottom on phones"));

  test("add flow: the tab bar and Next bar step aside for a text field, not for a chip or a closed keyboard", async ({ page }) => {
    await mockApi(page, {
      signedIn: true,
      overrides: {
        "GET /venues/nearby": () => ({ body: { items: [{ ...NEARBY_VENUES[0], toiletCount: 0 }] } }),
        [`GET /venues/${NEARBY_VENUES[0].id}`]: () => ({ body: { ...NEARBY_VENUES[0], address: null, planningArea: null, toilets: [] } }),
      },
    });
    await page.goto("/add");
    const next = page.getByTestId("add-next");
    await next.click();
    await page.getByTestId("venue-option").filter({ hasText: "Plaza Singapura" }).click();
    await next.click();

    const tabs = page.getByRole("navigation", { name: "Main" });
    await expect(tabs).toBeVisible();
    await expect(next).toBeVisible();
    // Android's keyboard shrinks the page (interactive-widget=resizes-content): do the same here.
    const full = page.viewportSize()!;
    const keyboard = (up: boolean) => page.setViewportSize(up ? { width: full.width, height: full.height - 300 } : full);

    const label = page.getByLabel("Label (optional)");
    await label.focus();
    // Focus with no keyboard (a hardware one, or not up yet): nothing moves.
    await expect(tabs).toBeVisible();
    await keyboard(true);
    await expect(tabs).toBeHidden();
    await expect(next).toBeHidden();
    await expect(label).toBeInViewport();

    // Straight on to the next field: they stay away.
    await page.getByLabel("Access note (optional)").focus();
    await expect(tabs).toBeHidden();

    // Back button: the keyboard goes, the field keeps focus, and the bars come back.
    await keyboard(false);
    await expect(tabs).toBeVisible();
    await expect(next).toBeVisible();

    // A chip brings no keyboard: they stay.
    await keyboard(true);
    await page.getByRole("group", { name: "Level (optional)" }).getByRole("button", { name: "L2", exact: true }).focus();
    await expect(tabs).toBeVisible();
    await expect(next).toBeVisible();
  });
});
