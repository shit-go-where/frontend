import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./mock-api";

/**
 * Reduced motion (the device setting): nothing slides, rises, bounces or resizes. Fades are allowed.
 * Samples every running CSS animation and transition for a second after an action and checks none
 * of them moves or resizes something, and that no view transition starts on the leaderboard.
 */
test.use({ reducedMotion: "reduce" });

/** Properties and keyframes that move or resize things. */
const MOVES = /^(transform|translate|scale|rotate|bottom|top|left|right|height|width|grid-template-rows|margin.*|padding.*)$/;
const MOVING_KEYFRAMES = /^sgw-(rise|podium-rise|crown-land|lb-in|lb-out|lb-panel-in|lb-panel-out|pop|puddle|plop.*|squish.*)$/;

async function watch(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: number; __seen: Set<string>; __watch: () => void };
    w.__vt = 0;
    w.__seen = new Set();
    const orig = document.startViewTransition?.bind(document);
    if (orig) document.startViewTransition = ((...a: Parameters<typeof orig>) => (w.__vt++, orig(...a))) as typeof orig;
    let raf = 0;
    const sample = () => {
      for (const a of document.getAnimations()) {
        const t = a as CSSTransition & CSSAnimation;
        w.__seen.add(t.transitionProperty ? `transition:${t.transitionProperty}` : `animation:${t.animationName}`);
      }
      raf = requestAnimationFrame(sample);
    };
    w.__watch = () => {
      w.__seen.clear();
      w.__vt = 0;
      cancelAnimationFrame(raf);
      sample();
    };
  });
}

async function result(page: Page) {
  await page.waitForTimeout(1000);
  return page.evaluate(() => {
    const w = window as unknown as { __vt: number; __seen: Set<string> };
    return { views: w.__vt, seen: [...w.__seen] };
  });
}

const moving = (seen: string[]) =>
  seen.filter((s) => {
    const [kind, name] = [s.slice(0, s.indexOf(":")), s.slice(s.indexOf(":") + 1)];
    return kind === "transition" ? MOVES.test(name) : MOVING_KEYFRAMES.test(name);
  });

test("the leaderboard tab change holds still", async ({ page }) => {
  await mockApi(page);
  await watch(page);
  await page.goto("/leaderboard");
  const tab = page.getByRole("tab", { name: /Cleanest/ });
  await tab.waitFor();
  await page.waitForTimeout(600);
  await page.evaluate(() => (window as unknown as { __watch: () => void }).__watch());
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  const { views, seen } = await result(page);
  expect(views, "no view transition on a tab change").toBe(0);
  expect(moving(seen)).toEqual([]);
});

test("the bottom sheet snaps without travelling", async ({ page }) => {
  await mockApi(page);
  await watch(page);
  await page.goto("/");
  const handle = page.getByRole("region", { name: "Nearby toilets" }).getByRole("button", { name: "Expand list" });
  await handle.waitFor();
  await page.waitForTimeout(600);
  await page.evaluate(() => (window as unknown as { __watch: () => void }).__watch());
  await handle.click();
  const { seen } = await result(page);
  expect(moving(seen)).toEqual([]);
});

test("a route change crossfades without travel", async ({ page }) => {
  await mockApi(page);
  await watch(page);
  await page.goto("/");
  await page.getByTestId("toilet-card").first().waitFor();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--route-shift").trim())).toBe("0px");
  await page.evaluate(() => (window as unknown as { __watch: () => void }).__watch());
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Ranks" }).click();
  await expect(page).toHaveURL(/\/leaderboard/);
  const { seen } = await result(page);
  expect(moving(seen)).toEqual([]);
});

test("a dialog opens without sliding up", async ({ page }) => {
  await mockApi(page);
  await watch(page);
  await page.goto("/");
  await page.getByTestId("toilet-card").first().waitFor();
  await page.waitForTimeout(600);
  await page.evaluate(() => (window as unknown as { __watch: () => void }).__watch());
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  const { seen } = await result(page);
  expect(moving(seen)).toEqual([]);
});
