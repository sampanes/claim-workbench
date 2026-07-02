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
  let lastStatus = 200;

  // The worker relies on real HTTP status to detect rejections (>=400) and
  // duplicate submissions (409). Record the status of each top-level document
  // navigation so currentStatus() reports fact, not a hardcoded 200.
  page.on("response", (response) => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
      lastStatus = response.status();
    }
  });

  async function snapshot() {
    currentHtml = await page.content();
    currentModel = parsePage({ url: page.url(), html: currentHtml });
    return { page: currentModel, html: currentHtml, status: lastStatus };
  }

  return {
    async open(url) {
      const response = await page.goto(url, { waitUntil: "load" });
      if (response) lastStatus = response.status();
      return snapshot();
    },
    async submitForm(action, fields) {
      const forms = page.locator(`form[action="${action}"]`);
      const formCount = await forms.count();
      // When several forms post to the same action (e.g. a per-row Remove
      // button), submit the one whose hidden inputs match the discriminator
      // fields. `.first()` would always act on the first row on the page and
      // silently remove the wrong — possibly operator-entered — row.
      let form = forms.first();
      for (let i = 0; formCount > 1 && i < formCount; i += 1) {
        const candidate = forms.nth(i);
        let matches = true;
        for (const [name, value] of Object.entries(fields)) {
          const hidden = candidate.locator(`input[type="hidden"][name="${name}"]`);
          if (await hidden.count()) {
            if ((await hidden.first().getAttribute("value")) !== String(value)) { matches = false; break; }
          }
        }
        if (matches) { form = candidate; break; }
      }
      // Apply each field to its control within the chosen form. Checkboxes and
      // radios are toggled (fill() throws on them); buttons are left for the
      // submit click below.
      for (const [name, value] of Object.entries(fields)) {
        const control = form.locator(`[name="${name}"]:not([type="hidden"])`);
        if (!(await control.count())) continue;
        const first = control.first();
        const info = await first.evaluate((el) => ({
          tag: el.tagName.toLowerCase(),
          type: (el.getAttribute("type") || "").toLowerCase()
        }));
        if (info.tag === "button") continue;
        if (info.type === "checkbox" || info.type === "radio") {
          if (value === false || value === "" || value === "off" || value === "no") await first.uncheck();
          else await first.check();
        } else {
          await first.fill(String(value));
        }
      }
      await Promise.all([
        page.waitForLoadState("load"),
        form.locator("[type=submit], button").first().click()
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
      return lastStatus;
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
