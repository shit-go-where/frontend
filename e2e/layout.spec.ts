import { expect, test, type Page } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TOILET_DETAIL } from "./fixtures";
import { blockTiles, signInAs, type Who } from "./live";

/**
 * Layout sanity on every route at three phone widths (the layout-* projects): nothing makes the
 * page scroll sideways, nothing visible sticks out past the screen edge, and no control is hidden
 * under another element (the fixed nav, a sheet) at the top or bottom of the page.
 *
 * LAYOUT_SHOTS=/dir saves a screenshot of each state; LAYOUT_REPORT=/file.jsonl records problems
 * and does not fail the run (how the audit report was produced).
 */
const SHOTS = process.env.LAYOUT_SHOTS;
const REPORT = process.env.LAYOUT_REPORT;
const ID = TOILET_DETAIL.id;
/** LAYOUT_TEXT=200 simulates the system font size at 200 % (the root font size everything is rem-based on). */
const TEXT = process.env.LAYOUT_TEXT;

interface State {
  name: string;
  path: string;
  who?: Who;
  ready: string;
  /** Extra steps after load (open a dialog, move the sheet). */
  act?: (page: Page) => Promise<void>;
}

const STATES: State[] = [
  { name: "home", path: "/", ready: '[data-testid="toilet-card"]' },
  {
    name: "home-sheet-top",
    path: "/",
    ready: '[data-testid="toilet-card"]',
    act: async (page) => {
      const handle = page.getByRole("region", { name: "Nearby toilets" }).getByRole("button", { name: "Expand list" });
      await handle.click();
      await handle.click();
      await page.waitForTimeout(600);
    },
  },
  {
    name: "home-filters",
    path: "/",
    ready: '[data-testid="toilet-card"]',
    act: async (page) => {
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(500);
    },
  },
  { name: "go", path: "/go", ready: "h1" },
  { name: "go-urgent", path: "/go?urgent=1", ready: '[data-testid="recommendation"]' },
  { name: "go-route", path: "/go?urgent=1&to=t-dhoby-nsl", ready: '[data-testid="take-me"]' },
  { name: "add", path: "/add", who: "user", ready: '[data-testid="add-next"]' },
  { name: "toilet", path: `/toilets/${ID}`, ready: "h1" },
  {
    name: "toilet-report",
    path: `/toilets/${ID}`,
    ready: "h1",
    act: async (page) => {
      await page.getByRole("button", { name: "Report", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(500);
    },
  },
  { name: "leaderboard", path: "/leaderboard", ready: "h1" },
  { name: "me-signed-out", path: "/me", ready: "h1" },
  { name: "me", path: "/me", who: "user", ready: "h1" },
  { name: "login", path: "/login", ready: "h1" },
  { name: "about", path: "/about", ready: "h1" },
  { name: "privacy", path: "/privacy", ready: "h1" },
  { name: "stations", path: "/stations", ready: "h1" },
  { name: "station", path: "/stations/dhoby-ghaut", ready: "h1" },
  { name: "areas", path: "/areas", ready: "h1" },
  { name: "area", path: "/areas/museum", ready: "h1" },
  { name: "review", path: "/review", who: "user", ready: "h1" },
  { name: "admin", path: "/admin", who: "admin", ready: "h1" },
];

interface Problem {
  kind: string;
  what: string;
  detail: string;
}

/** Runs in the page. Returns what is wrong with the layout as it stands now. */
function inspect(checkObscured: boolean): Problem[] {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const out: Problem[] = [];
  const describe = (el: Element) => {
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${t}"`;
  };
  /** Inside a closed <details>, only its own <summary> is on screen. */
  const inClosedFold = (el: Element) => {
    for (let a = el.closest("details"); a; a = a.parentElement?.closest("details") ?? null) {
      if (!a.open && !(el.matches("summary") && el.parentElement === a)) return true;
    }
    return false;
  };
  const skip = (el: Element) =>
    inClosedFold(el) ||
    !!el.closest(".maplibregl-map, .maplibregl-canvas-container, [inert], [hidden], [aria-hidden=true], .sr-only") ||
    getComputedStyle(el).visibility === "hidden" ||
    getComputedStyle(el).display === "none";

  if (document.documentElement.scrollWidth > vw + 1) {
    out.push({ kind: "page-scrolls-sideways", what: "html", detail: `scrollWidth ${document.documentElement.scrollWidth} > ${vw}` });
  }

  /** True if some ancestor clips or scrolls this element horizontally, so sticking out is not visible. */
  const clipped = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o !== "visible") {
        const r = p.getBoundingClientRect();
        if (r.left >= -1 && r.right <= vw + 1) return true;
      }
    }
    return false;
  };

  for (const el of document.querySelectorAll("body *")) {
    if (skip(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      if (clipped(el)) continue;
      // Hidden off-screen on purpose (a closed drawer) is still translated, never in the flow.
      const fixed = getComputedStyle(el).position === "fixed";
      out.push({
        kind: fixed ? "fixed-off-screen" : "sticks-out",
        what: describe(el),
        detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} (viewport ${vw})`,
      });
    }
  }

  // A modal dialog on top is meant to cover the page; a fold that is closed clips its contents.
  if (!checkObscured || document.querySelector("dialog[open], [role=dialog]")) return out;
  const cutOff = (el: Element, x: number, y: number) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflow === "visible") continue;
      const r = p.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return true;
    }
    return false;
  };

  const interactive = document.querySelectorAll(
    'a[href], button, input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, textarea, summary, [role=button], [role=tab]',
  );
  for (const el of interactive) {
    if (skip(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Fully on screen right now? Otherwise it is scrolled out of view, not obscured.
    if (r.left < 0 || r.right > vw || r.top < 0 || r.bottom > vh) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cutOff(el, cx, cy)) continue;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || el.contains(hit) || hit.contains(el)) continue;
    // A label wrapping a hidden input, or a pseudo-overlay with pointer-events none, is fine.
    if (getComputedStyle(hit).pointerEvents === "none") continue;
    out.push({ kind: "obscured-control", what: describe(el), detail: `covered by ${describe(hit)}` });
  }
  return out;
}

for (const s of STATES) {
  test(s.name, async ({ page }, info) => {
    const base = info.project.use.baseURL as string;
    await signInAs(page.context(), base, s.who ?? "anon");
    await blockTiles(page);
    await page.addInitScript(() => localStorage.setItem("sgw:theme", "light"));
    if (TEXT) await page.addInitScript((pct) => { document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.fontSize = `${pct}%`; }); }, TEXT);
    await page.goto(s.path);
    await page.locator(s.ready).first().waitFor({ timeout: 15_000 });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await s.act?.(page);
    await page.waitForTimeout(500);

    const problems: Problem[] = [];
    // At the top, content scrolling under the fixed nav is normal: only check sideways overflow there.
    const top = await page.evaluate(inspect, false);
    problems.push(...top.map((p) => ({ ...p, detail: `${p.detail} [top]` })));
    // The end of the page, where the fixed nav must not sit on top of the last control.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const bottom = await page.evaluate(inspect, true);
    problems.push(...bottom.filter((b) => !top.some((t) => t.kind === b.kind && t.what === b.what)).map((p) => ({ ...p, detail: `${p.detail} [bottom]` })));

    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      const w = info.project.name.replace("layout-", "");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(SHOTS, `${w}-${s.name}.png`) });
      await page.screenshot({ path: join(SHOTS, `${w}-${s.name}-full.png`), fullPage: true });
    }
    if (REPORT) {
      appendFileSync(REPORT, JSON.stringify({ state: s.name, project: info.project.name, problems }) + "\n");
      return;
    }
    expect(problems, JSON.stringify(problems, null, 2)).toEqual([]);
  });
}
