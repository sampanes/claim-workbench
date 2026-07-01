// Playwright page driver: the production driver for visible, user-controlled
// browser sessions. It adapts a Playwright page to the same observation and
// interaction surface as the HTTP driver, so worker logic and tests do not
// depend on a browser being installed.
//
// Playwright is intentionally not a package dependency: it is imported
// lazily so environments without browsers (CI page-logic tests, the
// portable core) never download one. See docs/adr/0008.

import { parsePage } from "../page-model.js";

export async function createPlaywrightDriver({ headless = false } = {}) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed. The browser worker's automated tests use the HTTP driver; " +
      "to drive a real browser, install playwright and its browsers first (pnpm add -w playwright && pnpm exec playwright install chromium)."
    );
  }
  // A visible browser is the default: assistance must not hide the browser.
  const browser = await playwright.chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  let currentModel = null;
  let currentHtml = null;

  async function snapshot() {
    currentHtml = await page.content();
    currentModel = parsePage({ url: page.url(), html: currentHtml });
    return { page: currentModel, html: currentHtml, status: 200 };
  }

  return {
    async open(url) {
      await page.goto(url, { waitUntil: "load" });
      return snapshot();
    },
    async submitForm(action, fields) {
      // Fill visible fields, then submit the form that posts to `action`.
      for (const [name, value] of Object.entries(fields)) {
        const locator = page.locator(`[name="${name}"]:not([type="hidden"])`);
        if (await locator.count()) await locator.first().fill(String(value));
      }
      await Promise.all([
        page.waitForLoadState("load"),
        page.locator(`form[action="${action}"] [type=submit], form[action="${action}"] button`).first().click()
      ]);
      return snapshot();
    },
    currentPage() {
      return currentModel;
    },
    currentHtml() {
      return currentHtml;
    },
    currentStatus() {
      return 200;
    },
    async highlight(controlName) {
      await page.locator(`[name="${controlName}"]`).first().evaluate((element) => {
        element.style.outline = "3px solid #f90";
      });
      return { highlighted: controlName };
    },
    async close() {
      await browser.close();
    }
  };
}
