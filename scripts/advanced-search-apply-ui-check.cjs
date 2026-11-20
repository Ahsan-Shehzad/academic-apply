const { _electron: electron } = require("playwright-core");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { Store } = require("../desktop/store.cjs");
const { JobSchema, hash } = require("../desktop/core.cjs");
async function invoke(p, method, args = {}) {
  const r = await p.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.equal(r.ok, true, r.error);
  return r.result;
}
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/search-apply-ui-")),
    store = await Store.open(root);
  for (const s of store.list("searches"))
    store.put("searches", { ...s, enabled: false });
  const profile = {
    personal: { name: "Example Candidate", summary: "Research in speech AI" },
    education: [],
    experience: [],
  };
  store.put("profile", { id: "main", verified: true, data: profile });
  for (const [id, institution, title] of [
    ["a", "Alpha University", "Lecturer in Speech AI"],
    ["b", "Beta University", "Postdoctoral NLP Researcher"],
  ]) {
    const job = {
      ...JobSchema.parse({
        title,
        institution,
        country: "Netherlands",
        url: "https://example.edu/" + id,
        description:
          "Speech AI and natural language processing research and teaching. PhD required. Submit an academic CV and research statement.",
        requiredDocuments: ["Academic CV", "Research statement"],
      }),
      id,
      status: "shortlisted",
      match: { score: 80, reasons: [], gaps: [] },
    };
    store.put(id === "b" ? "jobHistory" : "jobs", job);
    store.put("packages", {
      id: "pkg-" + id,
      jobId: id,
      name: "Legacy package name",
      status: "ready",
      createdAt: "2026-11-17T00:00:00Z",
      version: 1,
      folder: root,
      documents: [],
      attachments: [],
      notes: [],
      profileHash: hash(profile),
      listingHash: hash(job.description),
    });
  }
  store.put("applications", {
    id: "app-a",
    jobId: "a",
    packageId: "pkg-a",
    status: "preparing",
    uploads: [],
    createdAt: "2026-11-17T00:00:00Z",
  });
  store.put("connectors", {
    id: "mcp-fixture",
    name: "Fixture Research",
    type: "mcp",
    enabled: true,
    tools: [
      {
        name: "search_jobs",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
        },
      },
    ],
  });
  store.put("providers", { id: "codex", models: [{ id: "fixture-model" }] });
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
    await app.evaluate(async ({ app }) => {
      const require = process
          .getBuiltinModule("module")
          .createRequire(app.getAppPath() + "/package.json"),
        path = require("node:path");
      const { Discovery } = require(
        path.join(app.getAppPath(), "desktop/discovery.cjs"),
      );
      Discovery.prototype.fetchPage = async function (url) {
        if (url.includes("/fixture/"))
          return {
            url,
            html:
              '<script type="application/ld+json">' +
              JSON.stringify({
                "@type": "JobPosting",
                title: "Lecturer in Speech AI",
                hiringOrganization: {
                  name: url.endsWith("good")
                    ? "Search University"
                    : "Rejected Institute",
                },
                jobLocation: { address: { addressCountry: "Netherlands" } },
                description:
                  "Speech AI research and teaching. A PhD is required. Submit an academic CV and cover letter. This role develops speech-based cognitive impairment detection methods and teaches undergraduate computing.",
                validThrough: "2027-12-31",
              }) +
              "</script>",
          };
        return {
          url,
          html: '<a href="https://www.academictransfer.com/en/jobs/fixture/good">Lecturer in Speech AI</a><a href="https://www.academictransfer.com/en/jobs/fixture/bad">Lecturer in Speech AI</a>',
        };
      };
      const { Browser, chromePath } = require(
          path.join(app.getAppPath(), "desktop/browser.cjs"),
        ),
        { chromium } = require("playwright-core");
      globalThis.__launches = 0;
      Browser.prototype.launch = async function () {
        if (this.context) return this.context;
        globalThis.__launches++;
        const engine = await chromium.launch({
          executablePath: chromePath(),
          headless: true,
        });
        globalThis.__fixtureEngine = engine;
        this.context = await engine.newContext();
        await this.context.route("https://example.edu/**", (r) =>
          r.fulfill({
            contentType: "text/html",
            body: '<h1>Fixture application</h1><form><label>Name<input name="name"></label><button type="submit">Submit application</button></form>',
          }),
        );
        return this.context;
      };
    });
    const p = await app.firstWindow(),
      errors = [];
    p.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Renderer", e.message);
    });
    p.setDefaultTimeout(15000);
    await p.waitForSelector("h1", { timeout: 60000 }).catch(async (e) => {
      console.log(await p.locator("body").innerText());
      await p.screenshot({ path: "qa/search-apply-failure.png" });
      throw e;
    });
    const nav = (name) =>
      p
        .locator("nav")
        .getByRole("button", {
          name: name === "Apply" ? /^Apply/ : name,
          exact: name !== "Apply",
        })
        .click();
    await nav("Discover");
    await p.getByRole("button", { name: "New search", exact: true }).click();
    let d = p.locator(".MuiDialog-paper");
    await d
      .getByLabel("Search name", { exact: true })
      .fill("Precision speech search");
    await d
      .getByRole("button", { name: "Clear countries", exact: true })
      .click();
    const countries = d.getByRole("combobox", {
      name: "Countries",
      exact: true,
    });
    await countries.fill("Netherlands");
    await p.getByRole("option", { name: "Netherlands", exact: true }).click();
    if (await p.getByRole("listbox").count()) await p.keyboard.press("Escape");
    await d
      .getByLabel("Required terms (all)", { exact: true })
      .fill("speech AI, PhD");
    await d
      .getByLabel("Institution contains any", { exact: true })
      .fill("Search University");
    await d
      .getByLabel("Exclude terms (any)", { exact: true })
      .fill("studentship");
    await p.screenshot({ path: "qa/advanced-search-criteria.png" });
    await d
      .getByRole("tab", { name: "Sources & AI tools", exact: true })
      .click();
    await d.getByRole("combobox", { name: /^Search method/ }).click();
    await p
      .getByRole("option", {
        name: "Connectors only",
        exact: true,
      })
      .click();
    await d.getByRole("combobox", { name: /^AI provider/ }).click();
    await p.getByRole("option", { name: "Codex", exact: true }).click();
    await d
      .getByRole("combobox", { name: "AI model", exact: true })
      .fill("fixture-model");
    await p.keyboard.press("Tab");
    await d.getByRole("button", { name: "Clear sources", exact: true }).click();
    await d
      .getByRole("combobox", { name: "Supplemental connectors and portal hints", exact: true })
      .fill("AcademicTransfer");
    await p
      .getByRole("option", { name: "AcademicTransfer", exact: true })
      .click();
    if (await p.getByRole("listbox").count()) await p.keyboard.press("Escape");
    await d
      .getByRole("checkbox", { name: "Fixture Research", exact: true })
      .check();
    await d
      .getByLabel("MCP search arguments (JSON)", { exact: true })
      .fill("{bad json");
    assert.equal(
      await d
        .getByRole("button", { name: "Search now", exact: true })
        .isEnabled(),
      false,
    );
    await d
      .getByRole("checkbox", { name: "Fixture Research", exact: true })
      .uncheck();
    await d
      .getByRole("checkbox", { name: "Fixture Research", exact: true })
      .check();
    assert.equal(
      await d
        .getByRole("button", { name: "Search now", exact: true })
        .isEnabled(),
      true,
    );
    await d
      .getByRole("checkbox", { name: "Fixture Research", exact: true })
      .uncheck();
    await p.screenshot({ path: "qa/advanced-search-tools.png" });
    await d.getByRole("button", { name: "Save search", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    let snap = await invoke(p, "snapshot"),
      saved = snap.searches.find((s) => s.name === "Precision speech search");
    assert.equal(saved.filters.requiredTerms, "speech AI, PhD");
    assert.equal(saved.aiModel, "fixture-model");
    assert.equal(saved.aiProvider, "codex");
    assert.equal(saved.enabled, false);
    assert.deepEqual(saved.sources, ["academictransfer"]);
    const count = snap.searches.length;
    await nav("Scheduler");
    const card = p
      .locator(".search-card")
      .filter({ hasText: "Precision speech search" });
    await card
      .getByRole("button", { name: "Edit search", exact: true })
      .click();
    d = p.locator(".MuiDialog-paper");
    assert.equal(
      await d.getByLabel("Required terms (all)", { exact: true }).inputValue(),
      "speech AI, PhD",
    );
    await d.getByRole("button", { name: "Search now", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    let task;
    for (let i = 0; i < 100; i++) {
      snap = await invoke(p, "snapshot");
      task = snap.tasks.find((t) => t.kind === "search-once");
      if (task && ["completed", "failed"].includes(task.status)) break;
      await p.waitForTimeout(200);
    }
    assert.equal(task?.status, "completed", task?.message);
    assert.equal(snap.searches.length, count);
    assert.equal(task.result.added, 1);
    assert.ok(snap.jobs.some((j) => j.institution === "Search University"));
    assert.ok(!snap.jobs.some((j) => j.institution === "Rejected Institute"));
    await p.keyboard.press("Escape");
    await nav("Apply");
    assert.equal(
      await p
        .locator("nav")
        .getByRole("button", { name: "Applications", exact: true })
        .count(),
      0,
    );
    assert.equal(await app.evaluate(() => globalThis.__launches), 0);
    assert.equal(
      await p
        .locator(".apply-context b")
        .getByText("Alpha University - Lecturer in Speech AI", { exact: true })
        .count(),
      1,
    );
    const opportunity = p.getByRole("combobox", {
      name: "Opportunity to apply for",
      exact: true,
    });
    await opportunity.fill("Beta");
    await p.getByRole("option", { name: /Beta University/ }).click();
    await p
      .getByRole("combobox", { name: /^Matching submission package/ })
      .click();
    assert.equal(await p.getByRole("option").count(), 1);
    assert.ok(
      (await p.getByRole("option").innerText()).includes(
        "Beta University - Postdoctoral",
      ),
    );
    await p.keyboard.press("Escape");
    await p
      .getByRole("button", { name: "Prepare / review package", exact: true })
      .click();
    await p
      .locator(".package-detail")
      .getByRole("heading", {
        name: "Beta University - Postdoctoral NLP Researcher",
        exact: true,
      })
      .waitFor();
    await p
      .getByRole("combobox", { name: "Target opportunity", exact: true })
      .click();
    await p.getByRole("option", { name: /Alpha University/ }).click();
    await p
      .locator(".package-detail")
      .getByRole("heading", {
        name: "Alpha University - Lecturer in Speech AI",
        exact: true,
      })
      .waitFor();
    await p.locator(".package-detail").scrollIntoViewIfNeeded();
    await p
      .locator(".package-detail")
      .screenshot({ path: "qa/listing-named-packages.png" });
    await p
      .getByRole("button", { name: "Use this package in Apply", exact: true })
      .click();
    await p.locator(".apply-context").waitFor();
    snap = await invoke(p, "snapshot");
    assert.equal(
      snap.applications.find((a) => a.id === "app-a").packageId,
      "pkg-a",
    );
    assert.equal(await app.evaluate(() => globalThis.__launches), 1);
    await p.locator(".apply-context").scrollIntoViewIfNeeded();
    await p
      .locator(".apply-context")
      .screenshot({ path: "qa/apply-listing-context.png" });
    await p.locator(".apply-start").scrollIntoViewIfNeeded();
    await p.screenshot({ path: "qa/apply-start.png" });
    assert.deepEqual(errors, []);
    const result = {
      version: snap.version,
      packaged: !!process.argv[2],
      advancedSearchSaved: true,
      oneOffSearchSavedOneMatchingListing: true,
      mcpJsonValidation: true,
      providerModelPersisted: true,
      listingNamedPackages: true,
      documentSelectionAligned: true,
      applyContextAndPackage: true,
      noAutomaticBrowserLaunch: true,
      rendererErrors: errors,
    };
    fs.writeFileSync(
      `qa/advanced-search-apply-ui${process.argv[2] ? "-packaged" : ""}-results.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
  } finally {
    await app
      .evaluate(async () => globalThis.__fixtureEngine?.close())
      .catch(() => {});
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
