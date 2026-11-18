const { _electron: electron } = require("playwright-core");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { candidates } = require("../desktop/providers.cjs");
const installed = path.join(
  process.env.LOCALAPPDATA,
  "Programs",
  "AcademicApply",
  "AcademicApply.exe",
);
async function invoke(page, method, args = {}) {
  const response = await page.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  if (!response.ok) throw new Error(response.error);
  return response.result;
}
async function waitTask(page, taskId, timeout = 620000) {
  const started = Date.now();
  let message;
  while (Date.now() - started < timeout) {
    const snapshot = await invoke(page, "snapshot");
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (task.message !== message) {
      message = task.message;
      console.log(task.kind, task.status, message);
    }
    if (
      ["completed", "failed", "cancelled", "interrupted"].includes(task.status)
    )
      return { task, snapshot };
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Installed task verification timed out");
}
(async () => {
  const app = await electron.launch({
    executablePath: installed,
    args: [],
    env: {
      ...process.env,
      ACADEMICAPPLY_DATA_DIR: path.join(process.env.APPDATA, "AcademicApply"),
    },
    timeout: 60000,
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForSelector("h1");
    let snapshot = await invoke(page, "snapshot");
    assert.equal(snapshot.version, "1.1.1");
    assert.equal(snapshot.settings.cloudConsent, true);
    assert.equal(snapshot.profile?.verified, true);
    const native = candidates("codex").find((file) =>
      file.endsWith("codex.exe"),
    );
    if (!native) throw new Error("Native Codex executable not found");
    await invoke(page, "settings.save", {
      settings: {
        providerPaths: { ...snapshot.settings.providerPaths, codex: "" },
        provider: "codex",
        effort: "medium",
        models: { ...snapshot.settings.models, codex: "gpt-6.1-sol" },
        workflowProviders: {
          discovery: "codex",
          documents: "codex",
          portal: "codex",
        },
        workflowModels: { discovery: "", documents: "", portal: "" },
      },
    });
    console.log(
      "Repaired native Codex detection and selected the verified model for all AI workflows",
    );
    const services = [];
    for (const provider of ["codex"]) {
      const result = await invoke(page, "provider.test", {
        provider,
        inference: true,
      });
      assert.equal(result.status, "ready", result.message);
      services.push({
        provider,
        status: result.status,
        adapterVersion: result.adapterVersion,
      });
      console.log(provider, "structured drafting service test passed");
    }
    snapshot = await invoke(page, "snapshot");
    const interrupted = snapshot.tasks.find(
      (task) =>
        task.kind === "documents" &&
        ["interrupted", "failed"].includes(task.status) &&
        task.payload?.jobId &&
        task.payload?.types?.includes("Cover letter"),
    );
    if (!interrupted)
      throw new Error("No original document task is available to retry");
    const retry = await invoke(page, "task.retry", { id: interrupted.id });
    const drafted = await waitTask(page, retry.id);
    assert.equal(drafted.task.status, "completed", drafted.task.message);
    const pkg = drafted.snapshot.packages.find(
      (pkg) => pkg.id === drafted.task.result.packageId,
    );
    assert.ok(
      pkg.documents.some((document) => document.type === "Cover letter"),
    );
    const pdfTask = await invoke(page, "package.export", { id: pkg.id });
    const exported = await waitTask(page, pdfTask.id, 240000);
    assert.equal(exported.task.status, "completed", exported.task.message);
    const finalPackage = exported.snapshot.packages.find(
      (record) => record.id === pkg.id,
    );
    assert.ok(
      finalPackage.documents.every(
        (document) => document.pdf && fs.existsSync(document.pdf),
      ),
    );
    const template = exported.snapshot.searches[0];
    const temporarySearch = await invoke(page, "search.save", {
      search: {
        ...template,
        id: undefined,
        name: "AI connection verification",
        countries: ["Netherlands"],
        sources: ["academictransfer"],
        enabled: false,
      },
    });
    let discoveryResult;
    try {
      const searchTask = await invoke(page, "search.run", {
        id: temporarySearch.id,
        ai: true,
      });
      discoveryResult = await waitTask(page, searchTask.id, 300000);
      assert.equal(
        discoveryResult.task.status,
        "completed",
        discoveryResult.task.message,
      );
      assert.ok(
        discoveryResult.task.result.jobIds.length > 0,
        "AI search must verify at least one real vacancy",
      );
    } finally {
      await invoke(page, "search.delete", { id: temporarySearch.id });
    }
    await page
      .locator("nav")
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      "qa/installed-repair-results.json",
      JSON.stringify(
        {
          installedVersion: exported.snapshot.version,
          services,
          originalTaskRetried: true,
          packageId: pkg.id,
          aiDiscoveryVerifiedJobs: discoveryResult.task.result.jobIds.length,
          documents: finalPackage.documents.map((document) => ({
            type: document.type,
            words: document.audit?.words,
            docx: document.docx,
            pdf: document.pdf,
          })),
          rendererErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        installedVersion: exported.snapshot.version,
        originalTaskRetried: true,
        documents: finalPackage.documents.length,
        pdfsExported: true,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
