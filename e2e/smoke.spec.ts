import { expect, test, type Locator } from "@playwright/test";
import { CHECK_IN, PNG_BYTES, TOILETS, TOILET_DETAIL } from "./fixtures";
import { mockApi } from "./mock-api";

test.describe("find", () => {
  test("map and list show nearby toilets, filters refetch", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/");

    const list = page.getByRole("list", { name: "Toilets sorted by walking time" });
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

    // Filter chips (in the Filters dialog on phones) feed the query, and a filter that's on stays in view on the map.
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Bidet", exact: true }).click();
    await expect.poll(() => api.find("GET", "/toilets/nearby").some((c) => c.search.includes("features=BIDET"))).toBe(true);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("group", { name: "Filters on" }).getByRole("button", { name: "Bidet" })).toBeVisible();

    // Imported toilets carry OSM attribution.
    await expect(page.getByText("© OpenStreetMap contributors (ODbL)")).toBeVisible();
  });

  test("a map that didn't download offers a reload, with no unhandled errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mockApi(page);
    await page.route("**/maplibre/**", (r) => r.abort("connectionreset"));
    await page.goto("/");
    await expect(page.getByText("The map didn't load. The list still works.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    // The list re-renders after the failure; that must not start an import nobody listens to (SGW-FRONTEND-A).
    await expect(page.getByRole("list", { name: "Toilets sorted by walking time" }).getByTestId("toilet-card")).toHaveCount(TOILETS.length);
    expect(errors).toEqual([]);

    await page.unroute("**/maplibre/**");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("region", { name: "Map of toilets" })).toBeVisible();
  });

  test("the list sheet stops below the search", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const sheet = page.getByRole("region", { name: "Nearby toilets" });
    const handle = sheet.getByRole("button", { name: "Expand list" });
    await expect(handle).toBeVisible();
    // Tapping the grabber cycles up: peek → middle → top.
    await handle.click();
    await handle.click();
    await expect(sheet.getByRole("button", { name: "Collapse list" })).toBeVisible();

    const search = page.getByRole("combobox", { name: /Search a place/ });
    await expect
      .poll(async () => {
        const [s, f] = await Promise.all([sheet.boundingBox(), search.boundingBox()]);
        return s && f ? Math.round(s.y - (f.y + f.height)) : -1;
      })
      .toBeGreaterThanOrEqual(0);
  });

  test("dragging down from the peek leaves just the count, and a tap brings the nearest back", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const sheet = page.getByRole("region", { name: "Nearby toilets" });
    const count = sheet.getByRole("heading", { name: "3 toilets within 1 km" });
    await expect(sheet.getByTestId("toilet-card").first()).toBeVisible();

    // The sheet is still settling after its entrance (it measures its peek over a few frames, and the count
    // shifts by a few px): a drag that starts in that window can be dropped, so the drag is retried from
    // wherever the count is until the sheet follows (about one run in fifty needed a second go under load).
    await page.waitForTimeout(600);
    await expect(async () => {
      const box = (await count.boundingBox())!;
      await page.mouse.move(box.x + 20, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + 20, box.y + 200, { steps: 40 });
      await page.mouse.up();
      await expect(sheet.getByRole("button", { name: "Show nearest toilet" })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await expect(count).toBeVisible();
    // The list is out of reach (inert) while only the count shows.
    await expect(sheet.getByTestId("toilet-card").first().locator("xpath=ancestor::*[@inert]")).toHaveCount(1);

    await count.click();
    await expect(sheet.getByRole("button", { name: "Expand list" })).toBeVisible();
    await expect(sheet.getByTestId("toilet-card").first()).toBeVisible();
  });
});

test.describe("first visit, location never asked", () => {
  // Playwright refuses what it wasn't given, like "Don't allow". Headless Chromium reports that as "denied"
  // up front, so the permission says "prompt" here, as it does for someone the browser has never asked.
  test.use({ permissions: [] });

  test("the map explains before the browser asks, and a refusal offers a way back", async ({ page }) => {
    const api = await mockApi(page);
    await page.addInitScript(() => {
      const query = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (d: PermissionDescriptor) =>
        d.name === "geolocation" ? Promise.resolve({ state: "prompt", onchange: null } as PermissionStatus) : query(d);
    });
    await page.goto("/");

    const ask = page.getByRole("group", { name: "Your location" });
    await expect(ask.getByText("See the toilets nearest you")).toBeVisible();
    // No prompt on arrival: the list starts around the fallback place.
    await expect.poll(() => api.find("GET", "/toilets/nearby").length).toBeGreaterThan(0);
    expect(api.find("GET", "/toilets/nearby")[0].search).toContain("lat=1.2839");

    await ask.getByRole("button", { name: "Use my location" }).click();
    await expect(ask).toBeHidden();
    const failed = page.getByRole("alert");
    await expect(failed.getByText("Location is off for this site.")).toBeVisible();
    // Chromium 144+ offers its own location button, which can ask again.
    await expect(failed.locator("geolocation")).toBeVisible();
  });

  test("refused before: the sheet offers the browser's location button", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const sheet = page.getByRole("region", { name: "Nearby toilets" });
    await expect(sheet.getByText("Location permission is off.")).toBeVisible();
    await expect(sheet.locator("geolocation")).toBeVisible();
    await expect(page.getByRole("group", { name: "Your location" })).toHaveCount(0);
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
    await expect(results.first()).toContainText(/bidet/i);
    await expect(page.getByText("Bishan CCL has no toilet — use the NSL side")).toBeVisible();

    const rec = api.find("POST", "/routing/recommend");
    expect(rec.length).toBeGreaterThan(0);
    expect(rec[0].body).toMatchObject({ urgent: true, lat: 1.2993, lng: 103.8455 });

    // Only the best option gets the big button; the route lives in the URL so Back works.
    await results.first().getByRole("link", { name: "Take me there" }).click();
    await expect(page).toHaveURL(/\/go\?urgent=1&to=/);
    const takeMe = page.getByTestId("take-me");
    await expect(takeMe).toBeVisible();
    await expect(takeMe.getByRole("link", { name: /I'm here, check in/ })).toHaveAttribute("href", /\?do=checkin$/);
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

    await expect(page.getByRole("heading", { name: /Step 1 of 4/ })).toBeVisible();
    const next = page.getByTestId("add-next");
    await expect(next).toBeEnabled();
    await next.click();

    // 2. venue
    await expect(page.getByRole("heading", { name: /Step 2 of 4/ })).toBeVisible();
    await page.getByTestId("venue-option").filter({ hasText: "Plaza Singapura" }).click();
    await next.click();

    // 3. details, with the optional photo
    await page.getByLabel("Label (optional)").fill("Level 4, near Food Republic");
    // Plaza Singapura already has toilets listed, so its level is needed before Next.
    await expect(next).toBeDisabled();
    await page.getByRole("group", { name: /^Level/ }).getByRole("button", { name: "L4", exact: true }).click();
    await page.getByLabel("Outside the fare gates").check();
    await page.getByTestId("photo-input").setInputFiles({ name: "toilet.png", mimeType: "image/png", buffer: PNG_BYTES });
    await expect(page.getByAltText("Your uploaded photo")).toBeVisible();
    await next.click();

    // 4. what's inside: the lead features, then one from under "Everything else"
    await expect(page.getByRole("heading", { name: /Step 4 of 4/ })).toBeVisible();
    await page.getByRole("radio", { name: "Bidet: Yes", exact: true }).check({ force: true });
    await page.getByText("Everything else").click();
    await page.getByRole("radio", { name: "Squat: No", exact: true }).check({ force: true });
    await expect(page.getByText("· 1 answered")).toBeVisible();

    // submit → 409 → force
    await page.getByTestId("add-submit").click();
    await expect(page.getByRole("heading", { name: "Is it one of these?" })).toBeVisible();
    // The candidates say their floor, so a different floor is easy to tell apart.
    await expect(page.getByText("There's already one on L3 right here.")).toBeVisible();
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

  test("a photo is optional, and a reload picks the draft up where it left off", async ({ page }) => {
    const api = await mockApi(page, {
      signedIn: true,
      overrides: {
        "POST /submissions": (req) => {
          const body = req.postDataJSON() as { payload: unknown };
          return { body: { id: "sub-2", kind: "NEW_TOILET", state: "PENDING", payload: body.payload } };
        },
      },
    });
    await page.goto("/add");
    const next = page.getByTestId("add-next");
    await next.click();
    await page.getByTestId("venue-option").filter({ hasText: "Plaza Singapura" }).click();
    await next.click();
    const levels = page.getByRole("group", { name: /^Level/ });
    await levels.getByRole("button", { name: "B1", exact: true }).click();

    // The tab is thrown away (as phones do while the camera is open) and comes back.
    await page.reload();
    await expect(page.getByText("Picked up where you left off.")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Step 3 of 4/ })).toBeVisible();
    await expect(levels.getByRole("button", { name: "B1", exact: true })).toHaveAttribute("aria-pressed", "true");

    // No photo: Next still works, and so does submitting.
    await expect(next).toBeEnabled();
    await next.click();
    await page.getByTestId("add-submit").click();
    await expect(page.getByTestId("add-success")).toBeVisible();
    expect(api.find("POST", "/submissions")[0].body).toMatchObject({
      payload: { venueId: "venue-plaza-sing", level: "B1", photoIds: [] },
    });

    // Submitted drafts are cleared, so the next add starts fresh.
    await page.goto("/add");
    await expect(page.getByRole("heading", { name: /Step 1 of 4/ })).toBeVisible();
    await expect(page.getByText("Picked up where you left off.")).toHaveCount(0);
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
    await expect(dialog.getByLabel("Nearest exit")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "All correct" })).toBeVisible();

    await pick(dialog, "Bidet: No");
    await pick(dialog, "Hand soap: Yes");
    // Not sure on a recorded feature is not a change.
    await pick(dialog, "Accessible: Not sure");
    // Hours aren't known yet, so they're asked; a half-filled time isn't a change.
    await dialog.getByText("Opens and closes", { exact: true }).click();
    await dialog.getByLabel("Opens", { exact: true }).fill("07:00");
    await expect(dialog.getByRole("button", { name: "Send 2 changes for review" })).toBeVisible();
    await dialog.getByLabel("Closes", { exact: true }).fill("23:00");
    await dialog.getByRole("button", { name: "Send 3 changes for review" }).click();
    await expect(dialog.getByRole("heading", { name: "Sent for review" })).toBeVisible();

    expect(api.find("POST", "/toilets/" + ID + "/verify")).toHaveLength(0);
    const [sub] = api.find("POST", "/submissions");
    expect(sub.body).toEqual({
      kind: "EDIT_TOILET",
      toiletId: ID,
      lat: 1.2993,
      lng: 103.8455,
      payload: {
        changes: {
          features: { BIDET: false, HAND_SOAP: true },
          openingHours: { type: "weekly", periods: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "07:00", close: "23:00" }] },
        },
      },
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
    await dialog.getByRole("group", { name: "Level" }).getByRole("button", { name: "B2", exact: true }).click();
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

test.describe("contributing without the extra taps", () => {
  const ID = TOILET_DETAIL.id;
  const detailRoutes = {
    [`GET /toilets/${ID}`]: () => ({ body: TOILET_DETAIL }),
    [`GET /toilets/${ID}/status`]: () => ({ body: { items: [] } }),
  };

  test("standing at a toilet, the map offers a check-in", async ({ page, context }) => {
    await context.setGeolocation({ latitude: TOILET_DETAIL.lat, longitude: TOILET_DETAIL.lng });
    await mockApi(page);
    await page.goto("/");
    const pill = page.getByTestId("checkin-here").filter({ visible: true });
    await expect(pill).toHaveAttribute("href", `/toilets/${ID}?do=checkin`);
  });

  test("standing at a toilet, its page says you can check in", async ({ page, context }) => {
    await context.setGeolocation({ latitude: TOILET_DETAIL.lat, longitude: TOILET_DETAIL.lng });
    await mockApi(page, { overrides: detailRoutes });
    await page.goto(`/toilets/${ID}`);
    await expect(page.getByRole("heading", { name: "You're here" })).toBeVisible();
    await expect(page.getByText("close enough to check in")).toBeVisible();
  });

  test("signed out, a status report needs no account", async ({ page }) => {
    await mockApi(page, { overrides: detailRoutes });
    await page.goto(`/toilets/${ID}`);
    await page.getByRole("button", { name: "Report", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "How is it right now?" })).toBeVisible();
  });

  test("signed out, Review goes to sign-in and comes back to the review", async ({ page }) => {
    await mockApi(page, { overrides: detailRoutes });
    await page.goto(`/toilets/${ID}`);
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?redirect=/);
    expect(decodeURIComponent(new URL(page.url()).searchParams.get("redirect") ?? "")).toBe(`/toilets/${ID}?do=review`);
  });

  test("signed in with ?do=report, the report dialog opens once", async ({ page }) => {
    await mockApi(page, { signedIn: true, overrides: detailRoutes });
    await page.goto(`/toilets/${ID}?do=report`);
    await expect(page.getByRole("dialog", { name: "How is it right now?" })).toBeVisible();
    await expect(page).not.toHaveURL(/do=report/);
  });
});
