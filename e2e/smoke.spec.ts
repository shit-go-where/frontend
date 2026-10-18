import { expect, test } from "@playwright/test";
import { PNG_BYTES, TOILETS } from "./fixtures";
import { mockApi } from "./mock-api";

test.describe("find", () => {
  test("map and list show nearby toilets, filters refetch", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/");

    const list = page.getByRole("list", { name: "Toilets sorted by distance" });
    await expect(list.getByTestId("toilet-card")).toHaveCount(TOILETS.length);
    await expect(page.getByRole("heading", { name: "3 toilets within 1 km" })).toBeVisible();
    await expect(list.getByText("Dhoby Ghaut")).toBeVisible();
    await expect(list.getByText("Long queue ×2")).toBeVisible();

    // Nearby was asked for the GPS position.
    const nearby = api.find("GET", "/toilets/nearby");
    expect(nearby.length).toBeGreaterThan(0);
    expect(nearby[0].search).toContain("lat=1.2993");
    expect(nearby[0].search).toContain("lng=103.8455");

    // Map region is mounted (client-only) and the big button is reachable.
    await expect(page.getByRole("region", { name: "Map of toilets" })).toBeVisible();
    await expect(page.getByTestId("need-to-go").filter({ visible: true })).toBeVisible();

    // Filter chips feed the query.
    await page.getByRole("button", { name: "Bidet", exact: true }).click();
    await expect.poll(() => api.find("GET", "/toilets/nearby").some((c) => c.search.includes("features=BIDET"))).toBe(true);

    // Imported toilets carry OSM attribution.
    await expect(page.getByText("© OpenStreetMap contributors (ODbL)")).toBeVisible();
  });
});

test.describe("route", () => {
  test("urgent mode shows 3 results immediately and routes", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/");
    await page.getByTestId("need-to-go").filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/go\?urgent=1/);

    await expect(page.getByRole("heading", { name: "Quick, go here!" })).toBeVisible();
    const results = page.getByTestId("recommendation");
    await expect(results).toHaveCount(3);
    await expect(results.first()).toContainText("Dhoby Ghaut");
    await expect(results.first()).toContainText("bidet");
    await expect(page.getByText("Bishan CCL has no toilet — use the NSL side")).toBeVisible();

    const rec = api.find("POST", "/routing/recommend");
    expect(rec.length).toBeGreaterThan(0);
    expect(rec[0].body).toMatchObject({ urgent: true, lat: 1.2993, lng: 103.8455 });

    // Only the best option gets the big button; the route lives in the URL so Back works.
    await results.first().getByRole("link", { name: "Take me there" }).click();
    await expect(page).toHaveURL(/\/go\?urgent=1&to=/);
    const takeMe = page.getByTestId("take-me");
    await expect(takeMe).toBeVisible();
    await expect(takeMe.getByRole("link", { name: /I'm here, check in/ })).toHaveAttribute("href", /\?checkin=1$/);
    const gmaps = takeMe.getByRole("link", { name: "Step by step in Google Maps" });
    await expect(gmaps).toHaveAttribute("href", /travelmode=walking/);
    await expect(gmaps).toHaveAttribute("href", /destination=1\.2989%2C103\.8457/);

    await takeMe.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "Quick, go here!" })).toBeVisible();
  });
});

test.describe("submit", () => {
  test("add wizard goes from pin to success, handling a duplicate", async ({ page }) => {
    let submissions = 0;
    const api = await mockApi(page, {
      signedIn: true,
      overrides: {
        "POST /submissions": (req) => {
          submissions += 1;
          if (submissions === 1) {
            return {
              status: 409,
              body: { statusCode: 409, message: "Possible duplicate", candidates: [TOILETS[1]] },
            };
          }
          const body = req.postDataJSON() as { payload: unknown };
          return { body: { id: "sub-1", kind: "NEW_TOILET", state: "PENDING", payload: body.payload } };
        },
      },
    });
    await page.goto("/add");

    await expect(page.getByRole("heading", { name: /Step 1 of 6/ })).toBeVisible();
    const next = page.getByTestId("add-next");
    await expect(next).toBeEnabled();
    await next.click();

    // 2. venue
    await expect(page.getByRole("heading", { name: /Step 2 of 6/ })).toBeVisible();
    await page.getByTestId("venue-option").filter({ hasText: "Plaza Singapura" }).click();
    await next.click();

    // 3. details
    await page.getByLabel("Label (optional)").fill("Level 4, near Food Republic");
    await page.getByLabel("Level (optional)").fill("L4");
    await page.getByLabel("Outside the fare gates").check();
    await next.click();

    // 4. features
    await page.getByRole("radio", { name: "Bidet: Yes", exact: true }).check({ force: true });
    await page.getByRole("radio", { name: "Squat: No", exact: true }).check({ force: true });
    await next.click();

    // 5. photo (required)
    await expect(next).toBeDisabled();
    await page.getByTestId("photo-input").setInputFiles({ name: "toilet.png", mimeType: "image/png", buffer: PNG_BYTES });
    await expect(page.getByAltText("Your uploaded photo")).toBeVisible();
    await next.click();

    // 6. submit → 409 → force
    await page.getByTestId("add-submit").click();
    await expect(page.getByRole("heading", { name: "Is it one of these?" })).toBeVisible();
    await page.getByRole("button", { name: "No, it's a different toilet" }).click();
    await expect(page.getByTestId("add-success")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Steady lah! Submitted." })).toBeVisible();

    // Upload pipeline ran in order and the submission carried everything.
    const presign = api.find("POST", "/media/presign")[0];
    expect(presign.body).toMatchObject({ contentType: "image/jpeg" });
    expect(api.find("PUT", "/media/photo-1/upload")).toHaveLength(1);
    expect(api.find("POST", "/media/photo-1/confirm")).toHaveLength(1);

    const [first, second] = api.find("POST", "/submissions");
    expect(first.body).not.toHaveProperty("force");
    expect(second.body).toMatchObject({
      kind: "NEW_TOILET",
      force: true,
      lat: 1.2993,
      lng: 103.8455,
      payload: {
        venueId: "venue-plaza-sing",
        label: "Level 4, near Food Republic",
        level: "L4",
        areaType: "UNPAID_AREA",
        features: { BIDET: true, SQUAT: false },
        photoIds: ["photo-1"],
      },
    });
  });
});
