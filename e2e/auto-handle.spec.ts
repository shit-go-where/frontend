import { expect, test } from "@playwright/test";
import { ME } from "./fixtures";
import { mockApi } from "./mock-api";

// Every account starts on the leaderboard under a random handle; /me says so and offers the way out.
const AUTO = { ...ME, handle: "kopi_otter_42", handleAuto: true };

test.describe("random sign-up handle", () => {
  test("shows the handle, opens the handle form and jumps to the leaderboard switch", async ({ page }) => {
    await mockApi(page, { signedIn: true, overrides: { "GET /me": () => ({ body: AUTO }) } });
    await page.goto("/me");
    await expect(page.getByRole("heading", { name: "You're @kopi_otter_42 on the leaderboard" })).toBeVisible();

    await page.getByRole("button", { name: "Change handle" }).click();
    await expect(page.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
    const input = page.getByLabel("New handle");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("kopi_otter_42");
    await expect(page.getByText("Picked at random. Changing it is free.")).toBeVisible();

    await page.getByRole("button", { name: "Leaderboard settings" }).click();
    await expect(page.getByRole("switch", { name: /Show me on the leaderboard/ })).toBeInViewport();
  });

  test("Keep it saves the same handle and retires the card", async ({ page }) => {
    const api = await mockApi(page, {
      signedIn: true,
      overrides: {
        "GET /me": () => ({ body: AUTO }),
        "PATCH /me": () => ({ body: { ...AUTO, handleAuto: false } }),
      },
    });
    await page.goto("/me");
    await page.getByRole("button", { name: "Keep it" }).click();
    await expect(page.getByRole("heading", { name: /You're @kopi_otter_42/ })).toBeHidden();
    expect(api.find("PATCH", "/me")[0].body).toEqual({ handle: "kopi_otter_42" });
  });

  test("an account that picked its own handle sees no card", async ({ page }) => {
    await mockApi(page, { signedIn: true });
    await page.goto("/me");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: /on the leaderboard/ })).toHaveCount(0);
  });
});
