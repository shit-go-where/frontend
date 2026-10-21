import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { TOILET_DETAIL } from "./fixtures";
import { blockTiles, pinTheme, signInAs, type Who } from "./live";

/**
 * axe on every route at 390 px wide (iPhone 14), in both colour themes, against the stub API
 * (e2e/stub-api.mjs) so server-rendered pages have real content. Also: tap targets under 44 px
 * and controls without an accessible name.
 *
 * A11Y_REPORT=/path/file.jsonl writes every finding as a JSON line and does not fail the run,
 * which is how the audit report was produced.
 */
const REPORT = process.env.A11Y_REPORT;

interface Route {
  path: string;
  who?: Who;
  /** Something that exists once the page has rendered its data. */
  ready: string;
  /** Names a state of the page beyond its first render (a dialog, a tab, a wizard step). */
  state?: string;
  act?: (page: Page) => Promise<void>;
}

const ID = TOILET_DETAIL.id;
const ROUTES: Route[] = [
  { path: "/", ready: '[data-testid="toilet-card"]' },
  { path: "/go", ready: "h1" },
  { path: "/go?urgent=1", ready: '[data-testid="recommendation"]' },
  { path: "/add", who: "user", ready: "h1, h2" },
  { path: `/toilets/${ID}`, ready: "h1" },
  { path: "/leaderboard", ready: "h1" },
  { path: "/me", ready: "h1" },
  { path: "/me", who: "user", ready: "h1" },
  { path: "/login", ready: "h1" },
  { path: "/about", ready: "h1" },
  { path: "/creator", ready: "h1" },
  { path: "/privacy", ready: "h1" },
  { path: "/stations", ready: "h1" },
  { path: "/stations/dhoby-ghaut", ready: "h1" },
  { path: "/areas", ready: "h1" },
  { path: "/areas/museum", ready: "h1" },
  { path: "/review", who: "user", ready: "h1" },
  { path: "/admin", who: "admin", ready: "h1" },
  // States past the first render: dialogs, sheets, tabs, wizard steps and folds.
  {
    path: "/",
    state: "sheet expanded",
    ready: '[data-testid="toilet-card"]',
    act: async (page) => {
      const handle = page.getByRole("region", { name: "Nearby toilets" }).getByRole("button", { name: "Expand list" });
      await handle.click();
      await handle.click();
    },
  },
  {
    path: "/",
    state: "filters dialog",
    ready: '[data-testid="toilet-card"]',
    act: async (page) => {
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await page.getByRole("dialog").waitFor();
    },
  },
  { path: "/go?urgent=1&to=t-dhoby-nsl", state: "route", ready: '[data-testid="take-me"]' },
  {
    path: `/toilets/${ID}`,
    state: "report dialog",
    ready: "h1",
    act: async (page) => {
      await page.getByRole("button", { name: "Report", exact: true }).click();
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    path: `/toilets/${ID}`,
    state: "checked in",
    who: "user",
    ready: "h1",
    act: async (page) => {
      await page.getByRole("button", { name: "Check in" }).click();
      await page.getByRole("heading", { name: "Shiok! Checked in" }).waitFor();
    },
  },
  {
    path: `/toilets/${ID}`,
    state: "folds open",
    ready: "h1",
    act: async (page) => {
      for (const name of ["Live status", "What's inside", "Survey", "Reviews"]) {
        await page.getByText(name, { exact: true }).first().click().catch(() => {});
      }
    },
  },
  {
    path: "/add",
    state: "step 2",
    who: "user",
    ready: '[data-testid="add-next"]',
    act: async (page) => {
      await page.getByTestId("add-next").click();
      await page.getByTestId("venue-option").first().waitFor();
    },
  },
  {
    path: "/add",
    state: "step 4",
    who: "user",
    ready: '[data-testid="add-next"]',
    act: async (page) => {
      const next = page.getByTestId("add-next");
      await next.click();
      await page.getByTestId("venue-option").first().click();
      await next.click();
      // The place already has toilets listed, so the level is needed before Next.
      await page.getByRole("group", { name: /^Level/ }).getByRole("button", { name: "L1", exact: true }).click();
      await next.click();
      await page.getByRole("heading", { name: /Step 4 of 4/ }).waitFor();
    },
  },
  {
    path: "/leaderboard",
    state: "cleanest toilets tab",
    ready: "h1",
    act: async (page) => {
      await page.getByRole("tab", { name: /Cleanest/ }).click();
      await page.waitForTimeout(300);
    },
  },
  {
    path: "/me",
    state: "settings tab",
    who: "user",
    ready: "h1",
    act: async (page) => {
      await page.getByRole("tab", { name: "Settings" }).click();
      await page.waitForTimeout(300);
    },
  },
  {
    path: "/me",
    state: "activity tab",
    who: "user",
    ready: "h1",
    act: async (page) => {
      await page.getByRole("tab", { name: "Activity" }).click();
      await page.waitForTimeout(300);
    },
  },
];
const THEMES = ["light", "dark"] as const;

async function open(page: Page, route: Route, theme: (typeof THEMES)[number]) {
  await signInAs(page.context(), test.info().project.use.baseURL as string, route.who ?? "anon");
  await pinTheme(page, theme);
  await blockTiles(page);
  await page.goto(route.path);
  await page.locator(route.ready).first().waitFor({ timeout: 15_000 });
  // Let queries settle and the map style fail fast; animations are off (reduced motion) so colours are final.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  await route.act?.(page);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.documentElement.dataset.scheme)).toBe(theme);
}

function label(route: Route, theme: string) {
  const who = route.who && route.who !== "anon" ? ` (${route.who})` : route.path === "/me" && !route.state ? " (signed out)" : "";
  return `${route.path}${who}${route.state ? ` [${route.state}]` : ""} ${theme}`;
}

test.use({ reducedMotion: "reduce", colorScheme: "light" });

test.describe("axe", () => {
  for (const route of ROUTES) {
    for (const theme of THEMES) {
      test(label(route, theme), async ({ page }, info) => {
        await open(page, route, theme);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
          .analyze();
        const found = results.violations.map((v) => ({
          rule: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => ({
            target: n.target.join(" "),
            html: n.html.slice(0, 160),
            why: n.any.concat(n.all, n.none).map((c) => c.message).join(" | ").slice(0, 300),
          })),
        }));
        if (REPORT) {
          appendFileSync(REPORT, JSON.stringify({ route: label(route, theme), project: info.project.name, found }) + "\n");
          return;
        }
        expect(found, JSON.stringify(found, null, 2)).toEqual([]);
      });
    }
  }
});

/** Interactive elements a thumb has to hit: at least 44x44 CSS px (the audit's bar; WCAG 2.5.8 asks for 24). */
const SMALL_TARGETS = () => {
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch], [role=link], [tabindex]:not([tabindex="-1"])';
  const out: { name: string; w: number; h: number; html: string }[] = [];
  const seen = new Set<Element>();
  for (const el of document.querySelectorAll(sel)) {
    if (seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || el.closest("[inert],[hidden],[aria-hidden=true]")) continue;
    if (el.matches(".sr-only") || el.closest(".maplibregl-map, .maplibregl-ctrl")) continue;
    let r = el.getBoundingClientRect();
    // A checkbox/radio is hit through its label or wrapper: use the largest labelled box.
    const lab = (el as HTMLInputElement).labels?.[0] ?? el.closest("label");
    if (lab) {
      const lr = lab.getBoundingClientRect();
      if (lr.width * lr.height > r.width * r.height) r = lr;
    }
    if (r.width === 0 || r.height === 0) continue;
    // Off-screen parts of scroll containers are not measured here; only elements with a box.
    // Inline links inside a sentence are exempt (WCAG 2.5.8 inline exception).
    if (el.tagName === "A" && cs.display === "inline" && el.parentElement && /\S/.test((el.parentElement.textContent ?? "").replace(el.textContent ?? "", ""))) continue;
    if (r.width < 43.5 || r.height < 43.5) {
      out.push({
        name: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().slice(0, 50),
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        html: el.outerHTML.slice(0, 140),
      });
    }
  }
  return out;
};

test.describe("tap targets", () => {
  for (const route of ROUTES) {
    test(label(route, "light"), async ({ page }, info) => {
      await open(page, route, "light");
      const small = await page.evaluate(SMALL_TARGETS);
      if (REPORT) {
        appendFileSync(REPORT, JSON.stringify({ route: label(route, "light"), project: info.project.name, tap: small }) + "\n");
        return;
      }
      expect(small, JSON.stringify(small, null, 2)).toEqual([]);
    });
  }
});
