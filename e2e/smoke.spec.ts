import { expect, test, type Locator } from "@playwright/test";
import { CHECK_IN, PNG_BYTES, TOILETS, TOILET_DETAIL } from "./fixtures";
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

test.describe("what's inside", () => {
  const ID = TOILET_DETAIL.id;
  /** Clicks the visible Yes / No / Not sure segment that wraps the named radio. */
  const pick = (scope: Locator, name: string) => scope.getByRole("radio", { name, exact: true }).locator("xpath=..").click();
  const detailRoutes = {
    [`GET /toilets/${ID}`]: () => ({ body: TOILET_DETAIL }),
    [`GET /toilets/${ID}/status`]: () => ({ body: { items: [] } }),
    [`POST /toilets/${ID}/check-ins`]: () => ({ body: CHECK_IN }),
    [`POST /toilets/${ID}/verify`]: () => ({ body: { ok: true } }),
  };

  test("check-in leads into the form and sends only what changed", async ({ page }) => {
    const api = await mockApi(page, { signedIn: true, overrides: detailRoutes });
    await page.goto(`/toilets/${ID}`);

    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("heading", { name: "Shiok! Checked in" })).toBeVisible();
    await page.getByRole("button", { name: "Quick check: what's inside?" }).click();

    const dialog = page.getByRole("dialog", { name: "What's inside?" });
    // Recorded features start from the listing; level and fare gates are known, so not asked.
    await expect(dialog.getByRole("radio", { name: "Bidet: Yes", exact: true })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "Hand soap: Not sure", exact: true })).toBeChecked();
    await expect(dialog.getByLabel("Level")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "All correct" })).toBeVisible();

    await pick(dialog, "Bidet: No");
    await pick(dialog, "Hand soap: Yes");
    // Not sure on a recorded feature is not a change.
    await pick(dialog, "Accessible: Not sure");
    await dialog.getByRole("button", { name: "Send 2 changes for review" }).click();
    await expect(dialog.getByRole("heading", { name: "Sent for review" })).toBeVisible();

    expect(api.find("POST", "/toilets/" + ID + "/verify")).toHaveLength(0);
    const [sub] = api.find("POST", "/submissions");
    expect(sub.body).toEqual({
      kind: "EDIT_TOILET",
      toiletId: ID,
      lat: 1.2993,
      lng: 103.8455,
      payload: { changes: { features: { BIDET: false, HAND_SOAP: true } } },
    });
  });

  test("no changes after a check-in confirms the listing", async ({ page }) => {
    const api = await mockApi(page, { signedIn: true, overrides: detailRoutes });
    await page.goto(`/toilets/${ID}`);
    await page.getByRole("button", { name: "Check in" }).click();
    await page.getByRole("button", { name: "Quick check: what's inside?" }).click();
    await page.getByRole("button", { name: "All correct" }).click();
    await expect(page.getByRole("heading", { name: "Thanks, legend!" })).toBeVisible();
    expect(api.find("POST", "/toilets/" + ID + "/verify")[0].body).toEqual({ lat: 1.2993, lng: 103.8455, accurate: true });
    expect(api.find("POST", "/submissions")).toHaveLength(0);
  });

  test("checked in recently: no points, but the form is still there, level and fare gates included", async ({ page }) => {
    const api = await mockApi(page, {
      signedIn: true,
      overrides: {
        ...detailRoutes,
        [`GET /toilets/${ID}`]: () => ({ body: { ...TOILET_DETAIL, level: null, areaType: "UNKNOWN" } }),
        [`POST /toilets/${ID}/check-ins`]: () => ({
          status: 429,
          body: { statusCode: 429, message: "You already checked in here in the last 2 hours" },
        }),
      },
    });
    await page.goto(`/toilets/${ID}`);

    // The fold points at check-in rather than offering its own way in.
    await page.getByText("What's inside", { exact: true }).click();
    await expect(page.getByText("Been here? Check in to update what's inside.")).toBeVisible();

    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("heading", { name: "Already checked in" })).toBeVisible();
    await page.getByRole("button", { name: "Update what's inside" }).click();

    const dialog = page.getByRole("dialog", { name: "What's inside?" });
    await dialog.getByLabel("Level").fill("B2");
    await dialog.getByText("Inside the fare gates", { exact: true }).click();
    await pick(dialog, "Baby change: Yes");
    await dialog.getByLabel("Anything else? (optional)").fill("Moved after the renovation");
    await dialog.getByRole("button", { name: "Send 3 changes for review" }).click();
    await expect(dialog.getByRole("heading", { name: "Sent for review" })).toBeVisible();

    const [sub] = api.find("POST", "/submissions");
    expect(sub.body).toEqual({
      kind: "EDIT_TOILET",
      toiletId: ID,
      lat: 1.2993,
      lng: 103.8455,
      payload: {
        changes: { features: { BABY_CHANGE: true }, level: "B2", areaType: "PAID_AREA" },
        note: "Moved after the renovation",
      },
    });
  });
});
