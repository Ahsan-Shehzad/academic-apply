const { _electron: electron } = require("playwright-core"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { Store } = require("../desktop/store.cjs");
const { hash, JobSchema } = require("../desktop/core.cjs");
async function invoke(page, method, args = {}) {
  const r = await page.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.equal(r.ok, true, r.error);
  return r.result;
}
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/advanced-ui-"));
  const store = await Store.open(root);
  for (const s of store.list("searches"))
    store.put("searches", { ...s, enabled: false });
  const provider = process.env.CHECK_LIVE_BROWSER || "codex";
  store.put("settings", {
    ...store.settings(),
    provider,
    cloudConsent: false,
    models: { codex: "gpt-6.1-sol", antigravity: "gemini-3.8-flash" },
  });
  const profile = {
    personal: {
      name: "Example Candidate",
      summary: "I teach computing and research speech AI.",
      contact: { emails: [{ value: "candidate@example.edu", use: "primary" }] },
    },
    education: [],
    experience: [],
  };
  store.put("profile", { id: "main", verified: true, data: profile });
  for (const [id, country, institution] of [
    ["qatar", "Qatar", "Gulf University"],
    ["job", "Netherlands", "Example University"],
    ["aus", "Australia", "Australian University"],
  ])
    store.put("jobs", {
      ...JobSchema.parse({
        title: "Lecturer in Computing",
        country,
        institution,
        url: "https://example.com/advanced-apply",
        description:
          "A lecturer vacancy teaching computing and researching speech AI. Submit an Academic CV and cover letter. A PhD and relevant teaching experience are required.",
      }),
      id,
      status: "shortlisted",
      match: { score: 80, reasons: [], gaps: [] },
    });
  const folder = path.join(root, "packages", "fixture");
  fs.mkdirSync(folder, { recursive: true });
  const docs = ["cv", "cover"].map((name, i) => {
    const pdf = path.join(folder, name + ".pdf");
    fs.writeFileSync(pdf, "Fixture PDF bytes " + name);
    return {
      id: name,
      type: i ? "Cover letter" : "Academic CV",
      pdf,
      reviewed: true,
      revision: 1,
      content: {
        sections: [
          { heading: "", text: "I teach computing and research speech AI." },
        ],
      },
      audit: { words: 9 },
      approvedFiles: { pdf: hash(fs.readFileSync(pdf)) },
    };
  });
  store.put("packages", {
    id: "package",
    jobId: "job",
    folder,
    documents: docs,
    attachments: [],
    version: 1,
    status: "ready",
    profileHash: hash(profile),
    listingHash: hash(store.get("jobs", "job").description),
  });
  store.put("applications", {
    id: "application",
    jobId: "job",
    packageId: "package",
    status: "preparing",
    uploads: [],
    createdAt: new Date().toISOString(),
  });
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
        .createRequire(app.getAppPath() + "/package.json");
      const path = require("node:path");
      const { chromium } = require("playwright-core");
      const { Browser, chromePath } = require(
        path.join(app.getAppPath(), "desktop/browser.cjs"),
      );
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
        await this.context.route("https://example.com/**", (route) =>
          route.fulfill({
            contentType: "text/html",
            body: '<title>Academic application fixture</title><h1>Lecturer application</h1><form><label>Full name<input name="fullName" required></label><label>Email<input type="email" name="email" required></label><label>Password<input type="password" name="password" value="fixture-secret"></label><div style="padding:20px"><label>Academic CV<input style="display:none" type="file" name="cv" accept=".pdf"></label></div><div style="padding:20px"><label>Cover letter<input type="file" name="cover" accept=".pdf"></label></div><label><input type="checkbox" name="declaration">I certify this application</label><button type="submit">Submit application</button></form><script>window.sends=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.sends++}</script>',
          }),
        );
        return this.context;
      };
      if (!process.env.CHECK_LIVE_BROWSER) {
        const { Providers } = require(
          path.join(app.getAppPath(), "desktop/providers.cjs"),
        );
        Providers.prototype.run = async function (_prompt, options) {
          if (!options.tools)
            throw new Error("Fixture only supports browser tools");
          const tool = options.tools.tools[0].name;
          let s = await options.tools.execute(tool, { action: "inspect" });
          globalThis.__bridgeData = JSON.stringify(s);
          s = await options.tools.execute(tool, {
            action: "fill_contacts",
            snapshotHash: s.snapshotHash,
          });
          for (const [fieldName, type] of [
            ["cv", "Academic CV"],
            ["cover", "Cover letter"],
          ]) {
            const f = s.snapshot.fields.find((f) => f.name === fieldName);
            const file = s.files.find(
              (f) => f.type === type && f.format === "PDF",
            );
            s = await options.tools.execute(tool, {
              action: "upload",
              fieldKey: f.key,
              fileIds: [file.id],
              snapshotHash: s.snapshotHash,
            });
          }
          return "Filled verified contact details and uploaded the reviewed CV and cover letter. The declaration and final submission require your review.";
        };
      }
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Renderer:", e.message);
    });
    await page.waitForSelector("h1");
    const nav = (name) =>
      page
        .locator("nav")
        .getByRole("button", {
          name: name === "Apply" ? /^Apply/ : name,
          exact: name !== "Apply",
        })
        .click();
    assert.equal(
      await page
        .locator("nav")
        .getByRole("button", { name: "Browser", exact: true })
        .count(),
      0,
    );
    await nav("Discover");
    await page
      .getByRole("combobox", { name: "Country group", exact: true })
      .click();
    await page.getByRole("option", { name: /Gulf · GCC countries/ }).click();
    await page.getByText(/Gulf University/).waitFor();
    assert.equal(await page.getByText(/Australian University/).count(), 0);
    await page
      .getByRole("button", { name: "Save countries to search", exact: true })
      .click();
    assert.equal(
      (await invoke(page, "snapshot")).searches[0].countries.length,
      6,
    );
    await page.screenshot({
      path: "qa/advanced-country-groups.png",
      fullPage: true,
    });
    await nav("Apply");
    await page
      .getByRole("heading", { name: "Lecturer in Computing", exact: true })
      .waitFor();
    assert.equal(
      await app.evaluate(() => globalThis.__launches),
      0,
      "Applications should not open an extra Chrome tab automatically",
    );
    await page
      .getByRole("button", { name: "Inspect / resume portal", exact: true })
      .click();
    await page.getByLabel("Full name value", { exact: true }).waitFor();
    await invoke(page, "settings.save", { settings: { cloudConsent: true } });
    await page
      .getByRole("button", {
        name: `Run ${provider === "antigravity" ? "Antigravity" : "Codex"} assistant`,
        exact: true,
      })
      .click();
    let task;
    for (let i = 0; i < 360; i++) {
      task = (await invoke(page, "snapshot")).tasks.find(
        (t) => t.kind === "browser-agent",
      );
      if (task && ["completed", "failed", "cancelled"].includes(task.status))
        break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.equal(task?.status, "completed", task?.message);
    assert.ok(task.result.actions >= 3);
    let snapshot = await invoke(page, "snapshot");
    const application = snapshot.applications[0];
    assert.equal(
      application.snapshot.fields.find((f) => f.name === "email").value,
      "candidate@example.edu",
    );
    assert.equal(application.uploads.length, 2);
    assert.equal(
      application.snapshot.fields.find((f) => f.name === "declaration").value,
      "false",
    );
    await page.keyboard.press("Escape");
    await invoke(page, "application.start", {
      jobId: "job",
      packageId: "package",
    });
    assert.equal(await app.evaluate(() => globalThis.__launches), 1);
    assert.equal(
      await app.evaluate(
        () => globalThis.__fixtureEngine.contexts()[0].pages().length,
      ),
      1,
    );
    assert.equal(
      await app.evaluate(() =>
        globalThis.__fixtureEngine
          .contexts()[0]
          .pages()[0]
          .evaluate(() => window.sends),
      ),
      0,
    );
    if (!process.env.CHECK_LIVE_BROWSER)
      assert.ok(
        !(await app.evaluate(() => globalThis.__bridgeData)).includes(
          "fixture-secret",
        ),
      );
    await page.screenshot({
      path: `qa/advanced-application${process.env.CHECK_LIVE_BROWSER ? "-" + provider : ""}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Page preview", exact: true })
      .click();
    await page
      .getByAltText("Application page with private fields masked")
      .waitFor();
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    const report = {
      version: snapshot.version,
      packaged: !!process.argv[2],
      provider,
      live: !!process.env.CHECK_LIVE_BROWSER,
      countryGroups: true,
      savedSchedulerCountries: true,
      integratedBrowser: true,
      noExtraTab: true,
      filledContacts: true,
      uploadedFiles: application.uploads.length,
      agentActions: task.result.actions,
      finalSubmissionUntouched: true,
      rendererErrors: errors,
    };
    fs.writeFileSync(
      `qa/advanced-ui${process.env.CHECK_LIVE_BROWSER ? "-" + provider : process.argv[2] ? "-packaged" : ""}-results.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
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
