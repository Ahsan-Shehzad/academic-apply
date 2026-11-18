const { _electron: electron } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { Store } = require("../desktop/store.cjs");
async function invoke(page, method, args = {}) {
  const r = await page.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.equal(r.ok, true, r.error);
  return r.result;
}
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/upgrade-ui-"));
  const store = await Store.open(root);
  store.put("settings", {
    ...store.settings(),
    provider: "codex",
    cloudConsent: false,
    workflowProviders: {},
    workflowModels: {},
    models: { codex: "codex-fixture", antigravity: "gemini-fixture" },
  });
  for (const s of store.list("searches"))
    store.put("searches", { ...s, enabled: false });
  for (const provider of ["codex", "antigravity"])
    store.put("providers", {
      id: provider,
      status: "not_tested",
      models: [
        {
          id: provider === "codex" ? "codex-fixture" : "gemini-fixture",
          label: "Fixture model",
        },
      ],
    });
  store.put("profile", {
    id: "main",
    verified: true,
    data: {
      personal: { name: "Example Candidate", summary: "I teach computing." },
      education: [],
      experience: [],
    },
  });
  store.put("jobs", {
    id: "fixture-job",
    institution: "Example University",
    title: "Lecturer in Computing",
    description:
      "Please submit a CV, publication list, research proposal and two recommendation letters.",
    requiredDocuments: ["Academic CV", "Publication list", "Research proposal"],
    status: "shortlisted",
    country: "Australia",
    url: "https://example.edu/jobs/fixture",
    applicationUrl: "https://example.edu/jobs/fixture",
    focus: "Computing",
    eligibility: "PhD in Computing",
    deadline: null,
    deadlineText: "Not stated",
    match: { score: 78, reasons: [], gaps: [] },
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
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.waitForSelector("h1");
    const nav = (name) =>
      page.locator("nav").getByRole("button", { name, exact: true }).click();
    await nav("Documents");
    await page
      .getByLabel("Automatically select documents required by this listing", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByLabel("Automatically select documents required by this listing", {
          exact: true,
        })
        .isChecked(),
      true,
    );
    await page
      .getByText("Publication list · Create document", { exact: true })
      .waitFor();
    await page
      .getByText("Recommendation letters · Supply file", { exact: true })
      .waitFor();
    await page.screenshot({ path: "qa/upgrade-documents.png", fullPage: true });
    await nav("Settings");
    const routing = page.locator("section.panel").filter({
      has: page.getByRole("heading", {
        name: "Workflow routing",
        exact: true,
      }),
    });
    const models = routing.getByRole("combobox", {
      name: "Workflow model",
      exact: true,
    });
    assert.equal(await models.count(), 3);
    await models.nth(0).click();
    await page
      .getByRole("option", { name: "codex-fixture", exact: true })
      .click();
    assert.equal(
      (await invoke(page, "snapshot")).settings.workflowModels.discovery,
      "codex-fixture",
    );
    const providers = routing.getByRole("combobox", {
      name: "Provider",
      exact: true,
    });
    await providers.nth(0).click();
    await page
      .getByRole("option", { name: "Antigravity", exact: true })
      .click();
    assert.equal(
      (await invoke(page, "snapshot")).settings.workflowModels.discovery,
      "",
    );
    await models.nth(0).click();
    await page
      .getByRole("option", { name: "gemini-fixture", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("option", { name: "codex-fixture", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("option", { name: "gemini-fixture", exact: true })
      .click();
    assert.equal(
      (await invoke(page, "snapshot")).settings.workflowModels.discovery,
      "gemini-fixture",
    );
    await routing.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "qa/upgrade-routing.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        automaticRequirementsVisible: true,
        workflowModelDropdowns: 3,
        effectiveProviderModels: true,
        providerChangeClearsOverride: true,
        rendererErrors: errors,
        version: (await invoke(page, "snapshot")).version,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
