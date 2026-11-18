const { _electron: electron } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
async function invoke(page, method, args = {}) {
  const result = await page.evaluate(
    async ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  if (!result.ok) throw new Error(method + ": " + result.error);
  return result.result;
}
async function waitTask(page, id) {
  for (let i = 0; i < 120; i++) {
    const snapshot = await invoke(page, "snapshot");
    const task = snapshot.tasks.find((t) => t.id === id);
    if (task.status === "completed") return task;
    if (["failed", "cancelled"].includes(task.status))
      throw new Error(task.message);
    await page.waitForTimeout(1000);
  }
  throw new Error("Task did not finish");
}
(async () => {
  fs.mkdirSync("qa", { recursive: true });
  const app = await electron.launch({
    ...(process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]) }
      : {}),
    args: process.argv[2] ? [] : ["."],
    env: {
      ...process.env,
      ACADEMICAPPLY_DATA_DIR: path.resolve(
        process.argv[2] ? ".test-data/packaged-journey" : ".test-data/journey",
      ),
    },
    timeout: 60000,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("h1");
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(({ dialog }, root) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [root],
      });
    }, path.resolve("../Job-application-related-data"));
    await page
      .locator("nav")
      .getByRole("button", { name: "Profile", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import profile folder", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "I reviewed these facts — approve profile",
        exact: true,
      })
      .click();
    let snapshot = await invoke(page, "snapshot");
    assert.ok(snapshot.profile.verified);
    assert.ok(snapshot.library.length > 20);
    const fixture = await invoke(page, "jobs.add", {
      job: {
        title: "Lecturer in Computing — QA fixture",
        institution: "QA University (test fixture)",
        country: "Ireland",
        url: "https://example.edu/jobs/fixture",
        description:
          "QA fixture for local UI verification only. A lecturer in computer science and software engineering. PhD required. Academic CV and cover letter requested. No real application is sent.",
        focus: "Computing teaching, machine learning and software engineering",
        eligibility: "Completed PhD and teaching experience",
        requiredDocuments: ["Academic CV"],
        official: true,
        deadline: null,
        deadlineText: "QA fixture — no application",
        deadlineTimezone: "Not stated",
      },
    });
    await page
      .locator("nav")
      .getByRole("button", { name: "Discover", exact: true })
      .click();
    await page
      .getByRole("button")
      .filter({ hasText: "Lecturer in Computing — QA fixture" })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Prepare documents", exact: true })
      .click();
    await page.getByLabel("Cover letter", { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "Create submission package", exact: true })
      .click();
    await page.waitForTimeout(400);
    snapshot = await invoke(page, "snapshot");
    const task = snapshot.tasks.find((t) => t.kind === "documents");
    assert.ok(task);
    await waitTask(page, task.id);
    snapshot = await invoke(page, "snapshot");
    const pkg = snapshot.packages.find((p) => p.jobId === fixture.id);
    assert.ok(pkg?.documents.length === 1);
    const exportTask = await invoke(page, "package.export", { id: pkg.id });
    await waitTask(page, exportTask.id);
    snapshot = await invoke(page, "snapshot");
    const rendered = snapshot.packages.find((p) => p.id === pkg.id);
    assert.ok(rendered.documents[0].pdfAudit.pages > 0);
    await invoke(page, "package.review", {
      id: pkg.id,
      documentIds: [rendered.documents[0].id],
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "qa/documents-populated.png",
      fullPage: true,
    });
    const csv = path.resolve("qa/journey-shortlist.csv");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, csv);
    await invoke(page, "report.csv");
    assert.ok(fs.readFileSync(csv, "utf8").includes("QA University"));
    const report = path.resolve("qa/journey-report.pdf");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, report);
    await invoke(page, "report.pdf");
    assert.ok(fs.statSync(report).size > 1000);
    await invoke(page, "settings.save", { settings: { theme: "dark" } });
    await page
      .locator("nav")
      .getByRole("button", { name: "Dashboard", exact: true })
      .click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "qa/dashboard-dark-populated.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        profileImported: true,
        libraryFiles: snapshot.library.length,
        cvPages: rendered.documents[0].pdfAudit.pages,
        wordPdfExport: true,
        packageReview: true,
        csvExport: true,
        pdfReport: true,
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
