// HTTP page driver: drives server-rendered destinations (the fake portal)
// over plain HTTP with a cookie jar, producing the same page-model
// observations the Playwright driver produces from a real browser. Used by
// the automated test suite so no browser download is required in CI.

import { parsePage } from "../page-model.js";

export class HttpPageDriver {
  #cookies = new Map();
  #current = null;

  #cookieHeader() {
    return [...this.#cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  #storeCookies(response) {
    const header = response.headers.getSetCookie?.() ?? [];
    for (const cookie of header) {
      const [pair] = cookie.split(";");
      const [name, value] = pair.split("=");
      if (name && value !== undefined) this.#cookies.set(name.trim(), value.trim());
    }
  }

  async #request(url, options = {}) {
    let currentUrl = url;
    let response;
    for (let hop = 0; hop < 5; hop += 1) {
      response = await fetch(currentUrl, {
        ...options,
        headers: { ...(options.headers ?? {}), cookie: this.#cookieHeader() },
        redirect: "manual"
      });
      this.#storeCookies(response);
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        currentUrl = new URL(response.headers.get("location"), currentUrl).href;
        options = { method: "GET" };
        continue;
      }
      break;
    }
    const html = await response.text();
    this.#current = { page: parsePage({ url: currentUrl, html }), html, status: response.status };
    return this.#current;
  }

  async open(url) {
    return this.#request(url, { method: "GET" });
  }

  async submitForm(action, fields) {
    if (this.#current === null) throw new Error("No page is open.");
    const target = new URL(action, this.#current.page.url).href;
    return this.#request(target, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString()
    });
  }

  currentPage() {
    return this.#current?.page ?? null;
  }

  currentHtml() {
    return this.#current?.html ?? null;
  }

  currentStatus() {
    return this.#current?.status ?? null;
  }

  // Highlighting is a no-op over HTTP; a browser driver draws an outline.
  async highlight(controlName) {
    return { highlighted: controlName };
  }
}
