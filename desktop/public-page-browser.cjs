"use strict";
const { chromium } = require("playwright-core");
const { chromePath } = require("./browser.cjs");
const { safeUrl } = require("./discovery.cjs");
class PublicPageBrowser {
  constructor(runtime = {}) {
    this.browser = runtime.browser || null;
    this.forceHeadless = runtime.forceHeadless === true;
    this.validateUrl = runtime.validateUrl || safeUrl;
    this.launch = runtime.launch || ((options) => chromium.launch(options));
  }
  async inspectRenderedPage(page, url, signal, methodLabel) {
    const abort = () => page.close().catch(() => {});
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
        method: methodLabel,
      };
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }
  async attachRouteFilter(target, signal) {
    await target.route("**/*", async (route) => {
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
  }
  async read(url, signal) {
    await this.validateUrl(url);
    signal?.throwIfAborted();
    if (this.browser && !this.forceHeadless) {
      const context = await this.browser.launch();
      const page = await context.newPage();
      try {
        await this.attachRouteFilter(page, signal);
        return await this.inspectRenderedPage(page, url, signal, "real_chrome");
      } finally {
        await page.unrouteAll?.({ behavior: "ignoreErrors" }).catch(() => {});
        await page.close().catch(() => {});
      }
    }
    const executablePath = chromePath();
    if (!executablePath)
      throw new Error(
        "Google Chrome is required for JavaScript vacancy rendering.",
      );
    if (!this.launching)
      this.launching = this.launch({
        executablePath,
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
        ignoreDefaultArgs: ["--enable-automation"],
      });
    const browser = await this.launching;
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
    });
    try {
      await this.attachRouteFilter(context, signal);
      const page = await context.newPage();
      return await this.inspectRenderedPage(
        page,
        url,
        signal,
        "headless_chrome",
      );
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
