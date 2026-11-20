const { _electron: electron } = require("playwright-core"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { Store } = require("../desktop/store.cjs"),
  { defaultSearch } = require("../desktop/core.cjs");
async function invoke(page, method, args = {}) {
  const r = await page.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.ok(r.ok, r.error);
  return r.result;
}
async function finish(page, id) {
  for (let i = 0; i < 120; i++) {
    const s = await invoke(page, "snapshot"),
      t = s.tasks.find((t) => t.id === id);
    if (["completed", "failed", "cancelled"].includes(t?.status)) {
      assert.equal(t.status, "completed", t.message);
      return s;
    }
    await page.waitForTimeout(250);
  }
  throw new Error("Task did not finish");
}
(async () => {
  fs.mkdirSync(".test-data", { recursive: true });
  fs.mkdirSync("qa", { recursive: true });
  const root = fs.mkdtempSync(path.resolve(".test-data/web-ui-")),
    store = await Store.open(root);
  for (const s of store.list("searches"))
    store.put("searches", { ...s, enabled: false });
  store.put("settings", { ...store.settings(), cloudConsent: true });
  store.close();
  const app = await electron.launch({
    ...(process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]) }
      : {}),
    args: process.argv[2] ? [] : ["."],
    env: { ...process.env, ACADEMICAPPLY_DATA_DIR: root },
    timeout: 60000,
  });
  try {
    await app.evaluate(({ app }) => {
      const require = process
          .getBuiltinModule("module")
          .createRequire(app.getAppPath() + "/package.json"),
        { Providers } = require(app.getAppPath() + "/desktop/providers.cjs"),
        { Discovery } = require(app.getAppPath() + "/desktop/discovery.cjs"),
        { Browser, chromePath } = require(
          app.getAppPath() + "/desktop/browser.cjs",
        ),
        { chromium } = require("playwright-core"),
        path = require("node:path");
      const base = "https://www.academictransfer.com/en/jobs/";
      const body =
        "Research and teach speech AI, multimodal machine learning and natural language processing. Essential qualifications include a PhD in computer science and university teaching experience. Submit an academic CV, cover letter, research statement, degree certificates and academic transcripts. This full-time position combines independent research, supervision and undergraduate and postgraduate teaching. The employer welcomes applications from researchers in related areas of artificial intelligence.";
      const titles = {
        complete: "Lecturer in Speech AI",
        blocked: "Lecturer in Natural Language Processing",
        manual: "Lecturer in Multimodal AI",
        js: "Lecturer in Interpretable AI",
        expired: "Lecturer in Cognitive AI",
      };
      const job = (id) => ({
        title: titles[id],
        institution: "Example University",
        country: "Netherlands",
        url: base + id + "/vacancy",
        applicationUrl: base + id + "/apply",
        description: body,
        eligibility:
          "A PhD in computer science and university teaching experience are essential.",
        requiredDocuments: [
          "Academic CV",
          "Cover letter",
          "Research statement",
          "Degree certificates",
          "Academic transcripts",
        ],
        deadline: id === "expired" ? "2000-01-01" : "2099-12-31",
        deadlineText: "2099-12-31",
      });
      const html = (id) => {
        const j = job(id);
        return (
          "<main><h1>" +
          j.title +
          "</h1><p>" +
          body +
          '</p><form><textarea>PRIVATE_FORM_ANSWER</textarea><input value="PRIVATE_FORM_TOKEN"></form></main><script type="application/ld+json">' +
          JSON.stringify({
            "@type": "JobPosting",
            title: j.title,
            hiringOrganization: { name: j.institution },
            jobLocation: { address: { addressCountry: "NL" } },
            description: body,
            validThrough: j.deadline,
          }) +
          '</script><a href="' +
          j.applicationUrl +
          '">Apply now</a>'
        );
      };
      Providers.prototype.run = async function (prompt, options) {
        const batch = JSON.parse(prompt.split("Query data:\n")[1]);
        options.onWebActivity?.({
          type: "search",
          queries: batch.map((q) => q.query),
          stage: "completed",
        });
        return JSON.stringify({
          queries: batch.map((q) => ({
            id: q.id,
            status: "searched",
            note: "Controlled fixture",
          })),
          candidates: Object.keys(titles).map((id) => ({
            queryId: batch[0].id,
            url: base + id + "/vacancy",
            title: titles[id],
            institution: "Example University",
            country: "Netherlands",
            snippet:
              "A current university role in artificial intelligence and computing.",
            evidenceUrl: base + id + "/vacancy",
            alternateUrls: [],
          })),
        });
      };
      Discovery.prototype.fetchPage = async (url) => {
        await new Promise((r) => setTimeout(r, 100));
        const id = new URL(url).pathname.split("/")[3];
        if (["blocked", "manual"].includes(id))
          throw new Error("Source returned HTTP 403");
        return { url, html: id === "js" ? "<main>Loading</main>" : html(id) };
      };
      Discovery.prototype.renderPage = async (url) => ({
        url,
        html: html("js"),
        method: "headless_chrome",
      });
      Discovery.prototype.research = async () => [
        {
          ...job("blocked"),
          url: base + "official/blocked",
          verification: { status: "ai_reported" },
          retrieval: {
            sources: [{ url: base + "official/blocked", evidence: body }],
          },
        },
      ];
      Browser.prototype.openContext = async function () {
        this.context = await chromium.launchPersistentContext(
          path.join(process.env.ACADEMICAPPLY_DATA_DIR, "browser-fixture"),
          {
            executablePath: chromePath(),
            headless: false,
            viewport: { width: 1000, height: 760 },
          },
        );
        await this.context.route(
          "https://www.academictransfer.com/**",
          (route) =>
            route.fulfill({
              status: 200,
              contentType: "text/html",
              body: html("manual"),
            }),
        );
        this.context.on("close", () => {
          this.context = null;
          this.sessions.clear();
          this.applicationTabs.clear();
        });
        return this.context;
      };
    });
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Renderer error:", e.message);
    });
    page.setDefaultTimeout(20000);
    await page.waitForSelector("h1");
    await page
      .locator("nav")
      .getByRole("button", { name: "Discover", exact: true })
      .click();
    await page.getByRole("button", { name: "New search", exact: true }).click();
    await page.getByRole("combobox", { name: /^Search depth/ }).waitFor();
    await page.getByRole("combobox", { name: /^Public page reader/ }).waitFor();
    await page.keyboard.press("Escape");
    const criteria = {
      ...defaultSearch(),
      name: "Full detail fixture",
      countries: ["Netherlands"],
      roles: ["Lecturer"],
      keywords: "speech AI",
      sources: [],
      strategy: "ai",
      depth: "quick",
      browserMode: "auto",
      enabled: false,
      filters: { includeUnknownDates: true, includeUnknownCountry: true },
    };
    const preview = await invoke(page, "search.preview", { search: criteria });
    assert.ok(preview.totalQueries > 0);
    const task = await invoke(page, "search.execute", { search: criteria }),
      snapshot = await finish(page, task.id);
    assert.equal(snapshot.jobs.length, 3);
    assert.equal(snapshot.candidates.length, 5);
    assert.equal(
      snapshot.candidates.filter((c) => c.status === "excluded").length,
      1,
    );
    assert.equal(
      snapshot.candidates.filter((c) => c.status === "needs_review").length,
      1,
    );
    for (const j of snapshot.jobs) {
      assert.ok(j.description.length > 300);
      assert.ok(j.eligibility.includes("PhD"));
      assert.ok(j.requiredDocuments.includes("Academic transcripts"));
      assert.equal(j.deadline, "2099-12-31");
      assert.ok(j.applicationUrl.includes("/apply"));
    }
    const record = snapshot.tasks.find((t) => t.id === task.id);
    assert.equal(record.result.fullListings, 3);
    assert.ok(
      record.summary.metrics.some(
        (m) => m.label === "Observed native search actions" && m.value > 0,
      ),
    );
    await page.getByRole("tab", { name: /Needs detail review/ }).click();
    const review = page.getByRole("region", {
      name: "Candidate detail review",
    });
    assert.ok(
      await review
        .getByRole("heading", {
          name: "Lecturer in Multimodal AI",
          exact: true,
        })
        .isVisible(),
    );
    await page.screenshot({ path: "qa/web-discovery-candidates.png" });
    const card = review
      .locator("article")
      .filter({
        has: page.getByRole("heading", {
          name: "Lecturer in Multimodal AI",
          exact: true,
        }),
      });
    await card
      .getByRole("button", { name: "Open in Chrome", exact: true })
      .click();
    await card
      .getByRole("button", { name: "Import visible page", exact: true })
      .waitFor();
    await card
      .getByRole("button", { name: "Import visible page", exact: true })
      .click();
    let imported;
    for (let i = 0; i < 100; i++) {
      const s = await invoke(page, "snapshot");
      if (s.jobs.length === 4) {
        imported = s;
        break;
      }
      await page.waitForTimeout(250);
    }
    assert.ok(imported, "Visible Chrome import did not produce the full ad");
    assert.ok(
      imported.jobs.every((j) => !j.description.includes("PRIVATE_FORM_")),
    );
    assert.equal(
      imported.candidates.filter((c) => c.status === "imported").length,
      4,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: /Full listings/ }).click();
    assert.ok(
      await page.getByRole("tab", { name: /Full listings \(4\)/ }).isVisible(),
    );
    await page
      .locator("nav")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Test web search", exact: true })
        .count(),
      2,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        version: imported.version,
        packaged: !!process.argv[2],
        searchWithoutConnectors: true,
        queryPreview: true,
        fullListings: 4,
        requiredFieldsAndSupportingDocuments: true,
        officialEquivalent: true,
        expiredExcluded: true,
        unresolvedRetained: true,
        visibleChromeImport: true,
        privateFormValuesExcluded: true,
        nativeSearchMetrics: true,
        rendererErrors: errors,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
