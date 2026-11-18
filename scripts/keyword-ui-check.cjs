const { _electron: electron } = require("playwright-core");
const path = require("node:path");
const assert = require("node:assert/strict");
const fs = require("node:fs");
async function invoke(page, method, args = {}) {
  const r = await page.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  if (!r.ok) throw new Error(r.error);
  return r.result;
}
(async () => {
  const app = await electron.launch({
    ...(process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]) }
      : {}),
    args: process.argv[2] ? [] : ["."],
    env: {
      ...process.env,
      ACADEMICAPPLY_DATA_DIR: path.resolve(".test-data/keyword-ui"),
    },
    timeout: 60000,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("h1");
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await invoke(page, "profile.save", {
      data: {
        personal: {
          name: "Example Candidate",
          summary: "Research in speech and machine learning.",
          contact: { emails: [{ value: "candidate@example.edu" }] },
        },
        education: [],
        experience: [
          {
            id: "exp-1",
            title: "Lecturer",
            organization: "Example University",
            start: "2020-01-01",
            ongoing: true,
            bullets: ["Teach Python and software engineering."],
          },
        ],
      },
    });
    await invoke(page, "profile.approve");
    const job = await invoke(page, "jobs.add", {
      job: {
        title: "Lecturer in Computing",
        institution: "Keyword UI fixture",
        country: "Ireland",
        url: "https://example.edu/jobs/keyword-ui",
        description:
          "Local UI test. Teach Python and software engineering. Research speech and machine learning.",
        official: true,
      },
    });
    const task = await invoke(page, "package.draft", {
      jobId: job.id,
      types: ["Academic CV"],
    });
    for (let i = 0; i < 45; i++) {
      const s = await invoke(page, "snapshot");
      const t = s.tasks.find((t) => t.id === task.id);
      if (t.status === "completed") break;
      if (t.status === "failed") throw new Error(t.message);
      await page.waitForTimeout(300);
    }
    await page
      .locator("nav")
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Hidden keywords · off", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Enable hidden keyword layer for this document", {
        exact: true,
      })
      .check();
    await page.getByLabel("Python", { exact: true }).uncheck();
    await page.screenshot({ path: "qa/keyword-dialog.png", fullPage: true });
    await page
      .getByRole("button", { name: "Save keyword settings", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    let snapshot = await invoke(page, "snapshot");
    let pkg = snapshot.packages.find((p) => p.jobId === job.id);
    assert.ok(pkg.documents[0].keywordLayer.enabled);
    assert.ok(!pkg.documents[0].keywordLayer.terms.includes("Python"));
    let packagedPdfExport = false;
    if (process.argv[2]) {
      const exportTask = await invoke(page, "package.export", { id: pkg.id });
      for (let i = 0; i < 120; i++) {
        const state = await invoke(page, "snapshot");
        const task = state.tasks.find((t) => t.id === exportTask.id);
        if (task.status === "completed") {
          packagedPdfExport = true;
          break;
        }
        if (["failed", "cancelled"].includes(task.status))
          throw new Error(task.message);
        await page.waitForTimeout(1000);
      }
      assert.ok(packagedPdfExport, "Packaged PDF export did not complete");
      const state = await invoke(page, "snapshot");
      const current = state.packages.find((p) => p.id === pkg.id).documents[0];
      assert.equal(current.pdfAudit.keywordLayerEmbedded, true);
      fs.copyFileSync(current.pdf, "qa/packaged-keyword-enabled.pdf");
    }
    await page
      .getByRole("button", { name: "Hidden keywords · on", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Enable hidden keyword layer for this document", {
        exact: true,
      })
      .uncheck();
    await page
      .getByRole("button", { name: "Save keyword settings", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    snapshot = await invoke(page, "snapshot");
    pkg = snapshot.packages.find((p) => p.jobId === job.id);
    assert.equal(pkg.documents[0].keywordLayer.enabled, false);
    assert.deepEqual(errors, []);
    const result = {
      at: new Date().toISOString(),
      defaultDisabled: !snapshot.settings.hiddenKeywordLayer,
      enable: true,
      termSelection: true,
      remove: true,
      packagedPdfExport,
      rendererErrors: errors,
    };
    fs.writeFileSync(
      "qa/keyword-ui-results.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
