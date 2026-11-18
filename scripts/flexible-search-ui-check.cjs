const { _electron: electron } = require("playwright-core"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { Store } = require("../desktop/store.cjs");
async function invoke(p, method, args = {}) {
  const r = await p.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.ok(r.ok, r.error);
  return r.result;
}
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/flexible-search-")),
    store = await Store.open(root);
  for (const s of store.list("searches"))
    store.put("searches", { ...s, enabled: false });
  store.put("profile", {
    id: "main",
    verified: true,
    data: {
      personal: {
        name: "Example Candidate",
        summary:
          "Speech AI and natural language processing for cognitive impairment detection. Machine learning research, university computing teaching and curriculum development.",
      },
      education: [],
      experience: [],
      skills: ["Python"],
    },
  });
  store.close();
  const options = {
    ...(process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]) }
      : {}),
    args: process.argv[2] ? [] : ["."],
    env: { ...process.env, ACADEMICAPPLY_DATA_DIR: root },
    timeout: 60000,
  };
  let app = await electron.launch(options);
  try {
    await app.evaluate(({ app }) => {
      const require = process
          .getBuiltinModule("module")
          .createRequire(app.getAppPath() + "/package.json"),
        { Discovery } = require(app.getAppPath() + "/desktop/discovery.cjs");
      Discovery.prototype.fetchPage = async (url) =>
        url.includes("/en/jobs/999/")
          ? {
              url,
              html:
                '<script type="application/ld+json">' +
                JSON.stringify({
                  "@type": "JobPosting",
                  title: url.endsWith("scientist")
                    ? "Senior Research Scientist in Speech AI"
                    : "Lecturer in Speech AI",
                  hiringOrganization: { name: "Example University" },
                  jobLocation: { address: { addressCountry: "Netherlands" } },
                  description:
                    "Research in speech AI, natural language processing and cognitive impairment detection with machine learning. A PhD and relevant research experience are required. Submit a CV and research statement.",
                  validThrough: "2099-12-31",
                }) +
                "</script>",
            }
          : {
              url,
              html: '<a href="https://www.academictransfer.com/en/jobs/999/scientist">Senior Research Scientist in Speech AI</a><a href="https://www.academictransfer.com/en/jobs/999/lecturer">Lecturer in Speech AI</a>',
            };
    });
    const p = await app.firstWindow(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(15000);
    await p.waitForSelector("h1");
    const changed = await p.evaluate(async () => {
      let n = 0;
      const off = window.academic.onEvent(() => n++);
      for (let i = 0; i < 3; i++)
        await window.academic.call("search.suggestions", {
          roles: ["Research Scientist"],
        });
      off();
      return n;
    });
    assert.equal(changed, 0, "Keyword suggestions must be read-only");
    await p
      .locator("nav")
      .getByRole("button", { name: "Discover", exact: true })
      .click();
    await p.getByRole("button", { name: "New search", exact: true }).click();
    let d = p.locator(".MuiDialog-paper");
    await d
      .getByLabel("Search name", { exact: true })
      .fill("Profile and role search");
    for (const role of ["Lecturer", "Assistant Professor", "Postdoctoral"])
      assert.equal(
        await d.getByRole("checkbox", { name: role, exact: true }).isChecked(),
        true,
      );
    for (const role of ["Lecturer", "Assistant Professor", "Postdoctoral"])
      await d.getByRole("checkbox", { name: role, exact: true }).uncheck();
    let roleInput = d.getByRole("combobox", {
      name: "Additional job roles",
      exact: true,
    });
    await roleInput.fill("Research Scientist");
    await p
      .getByRole("option", { name: "Research Scientist", exact: true })
      .click();
    await roleInput.fill("Principal Research Scientist");
    await roleInput.press("Enter");
    if (await p.getByRole("listbox").count()) await p.keyboard.press("Escape");
    const suggestionPanel = d.locator(".keyword-suggestions");
    await suggestionPanel
      .getByRole("button", { name: "speech AI", exact: true })
      .waitFor();
    await p.waitForTimeout(150);
    assert.equal(
      await suggestionPanel
        .getByRole("button", { name: "higher education teaching", exact: true })
        .count(),
      0,
    );
    await d
      .getByRole("button", { name: "Use recommended keywords", exact: true })
      .click();
    await suggestionPanel
      .getByRole("button", { name: "NLP", exact: true })
      .click();
    const input = d.getByRole("combobox", {
      name: "Research and teaching topics",
      exact: true,
    });
    await input.fill("computational linguistics");
    await input.press("Enter");
    if (await p.getByRole("listbox").count()) await p.keyboard.press("Escape");
    await suggestionPanel.screenshot({
      path: "qa/profile-keyword-suggestions.png",
    });
    await d
      .getByRole("tab", { name: "Sources & AI tools", exact: true })
      .click();
    await d.getByRole("combobox", { name: /^Search method/ }).click();
    await p
      .getByRole("option", {
        name: "Public sources and connected MCP tools",
        exact: true,
      })
      .click();
    await d.getByRole("button", { name: "Clear sources", exact: true }).click();
    await d
      .getByRole("combobox", { name: "Job listing sources", exact: true })
      .fill("AcademicTransfer");
    await p
      .getByRole("option", { name: "AcademicTransfer", exact: true })
      .click();
    if (await p.getByRole("listbox").count()) await p.keyboard.press("Escape");
    await d.getByRole("button", { name: "Save search", exact: true }).click();
    await d.waitFor({ state: "hidden" });
    let snap = await invoke(p, "snapshot"),
      saved = snap.searches.find((s) => s.name === "Profile and role search");
    assert.deepEqual(saved.roles, [
      "Research Scientist",
      "Principal Research Scientist",
    ]);
    for (const term of [
      "speech AI",
      "cognitive impairment",
      "NLP",
      "computational linguistics",
    ])
      assert.ok(saved.keywords.includes(term), term);
    const task = await invoke(p, "search.run", { id: saved.id });
    let finished;
    for (let i = 0; i < 150; i++) {
      snap = await invoke(p, "snapshot");
      finished = snap.tasks.find((t) => t.id === task.id);
      if (finished && ["completed", "failed"].includes(finished.status)) break;
      await p.waitForTimeout(100);
    }
    assert.equal(finished?.status, "completed", finished?.message);
    assert.equal(finished.result.added, 1);
    assert.ok(snap.jobs[0].title.includes("Research Scientist"));
    assert.equal(
      snap.jobs.length,
      1,
      "Nonselected lecturer roles must not be imported",
    );
    await p
      .locator("nav")
      .getByRole("button", { name: "Scheduler", exact: true })
      .click();
    await p
      .locator(".search-card")
      .filter({ hasText: "Profile and role search" })
      .getByRole("button", { name: "Edit search", exact: true })
      .click();
    d = p.locator(".MuiDialog-paper");
    await d
      .getByRole("combobox", { name: "Additional job roles", exact: true })
      .waitFor();
    assert.ok((await d.innerText()).includes("Principal Research Scientist"));
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    for (const search of snap.searches)
      await invoke(p, "search.delete", { id: search.id });
    assert.deepEqual(errors, []);
    await app.close();
    app = await electron.launch(options);
    const restarted = await app.firstWindow();
    await restarted.waitForSelector("h1");
    assert.equal((await invoke(restarted, "snapshot")).searches.length, 0);
    const report = {
      version: snap.version,
      packaged: !!process.argv[2],
      threePresetsRetained: true,
      customRoleEntryAndPersistence: true,
      profileAndRoleKeywordSuggestions: true,
      customKeywordsPersisted: true,
      customRoleImportFiltering: true,
      schedulerCriteriaRetained: true,
      suggestionsEmitNoChanges: true,
      emptySearchListPersistsAfterRestart: true,
      rendererErrors: errors,
    };
    fs.writeFileSync(
      `qa/flexible-search-ui${process.argv[2] ? "-packaged" : ""}-results.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
