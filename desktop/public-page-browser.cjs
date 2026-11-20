"use strict";
const { chromium } = require("playwright-core");
const { chromePath } = require("./browser.cjs");
const { safeUrl } = require("./discovery.cjs");
class PublicPageBrowser {
  constructor(runtime = {}) {
    this.validateUrl = runtime.validateUrl || safeUrl;
    this.launch = runtime.launch || ((options) => chromium.launch(options));
  }
  async read(url, signal) {
    await this.validateUrl(url);
    signal?.throwIfAborted();
    const executablePath = chromePath();
    if (!executablePath)
      throw new Error(
        "Google Chrome is required for JavaScript vacancy rendering.",
      );
    if (!this.launching)
      this.launching = this.launch({
        executablePath,
        headless: true,
      });
    const browser = await this.launching;
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
    });
    try {
      await context.route("**/*", async (route) => {
        const request = route.request();
        try {
          if (
            request.method() !== "GET" ||
            ["image", "media", "font", "stylesheet"].includes(
              request.resourceType(),
            )
          )
            return route.abort();
          await this.validateUrl(request.url());
          if (signal?.aborted) return route.abort();
          await route.continue();
        } catch {
          await route.abort().catch(() => {});
        }
      });
      const page = await context.newPage(),
        abort = () => page.close().catch(() => {});
      signal?.addEventListener("abort", abort, { once: true });
      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        });
        if (!response?.ok())
          throw new Error(
            "Chrome public page returned HTTP " + response?.status(),
          );
        await page
          .waitForFunction(
            () =>
              document
                .querySelector("main,article,[role=main]")
                ?.textContent?.trim().length > 400,
            null,
            { timeout: 5000 },
          )
          .catch(() => {});
        signal?.throwIfAborted();
        await this.validateUrl(page.url());
        const html = await page.content();
        if (
          /captcha|verify you are human|just a moment\.\.\.|access denied/i.test(
            html.slice(0, 18000),
          ) &&
          html.length < 100000
        )
          throw new Error(
            "Chrome needs manual verification. Open this candidate visibly and complete it yourself.",
          );
        return {
          url: page.url(),
          html,
          type: "text/html",
          method: "headless_chrome",
        };
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    } finally {
      await context.close();
    }
  }
  async close() {
    if (this.launching) {
      const browser = await this.launching.catch(() => null);
      await browser?.close();
      this.launching = null;
    }
  }
}
module.exports = { PublicPageBrowser };
