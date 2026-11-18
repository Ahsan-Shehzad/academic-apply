const { _electron: electron } = require("playwright-core");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { Store } = require("../desktop/store.cjs");
async function invoke(page, method, args = {}) {
  const result = await page.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.equal(result.ok, true, result.error);
  return result.result;
}
async function waitTask(page, id) {
  for (let attempt = 0; attempt < 240; attempt++) {
    const task = (await invoke(page, "snapshot")).tasks.find(
      (t) => t.id === id,
    );
    if (["completed", "failed", "cancelled"].includes(task?.status))
      return task;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Task did not finish: " + id);
}
(async () => {
  fs.mkdirSync(path.resolve(".test-data"), { recursive: true });
  const root = fs.mkdtempSync(path.resolve(".test-data/workflow-ui-"));
  const store = await Store.open(root);
  for (const search of store.list("searches"))
    store.put("searches", {
      ...search,
      enabled: false,
      sources: search.sources.filter((id) => id !== "bahrain"),
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
  const errors = [];
  const outcome = {};
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Renderer:", e.message);
    });
    await page.waitForSelector("h1");
    const snapshotEvents = await page.evaluate(async () => {
      const events = [];
      const stop = window.academic.onEvent((event) => {
        if (event.type === "changed" && event.data?.method === "snapshot")
          events.push(event);
      });
      for (let index = 0; index < 3; index++)
        await window.academic.call("snapshot");
      await new Promise((resolve) => setTimeout(resolve, 200));
      stop();
      return events.length;
    });
    assert.equal(
      snapshotEvents,
      0,
      "Snapshot reads must not create a refresh loop",
    );
    outcome.snapshotReadsDoNotEmitChanges = true;
    await app.evaluate(({ app }) => {
      const nativeFetch = globalThis.fetch;
      globalThis.__mcpFixtureRequests = [];
      const description =
        "Example University invites applications for a Lecturer in Computing. Teach Python and software engineering and conduct research in speech AI and machine learning. A PhD and teaching experience are essential. Include a CV and cover letter.";
      globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        if (url === "https://example.com/robots.txt")
          return new Response("User-agent: *\nAllow: /", {
            headers: { "content-type": "text/plain" },
          });
        if (url === "https://example.com/jobs/unreadable")
          return new Response("<h1>Empty listing</h1>");
        if (url === "https://example.com/jobs/activity-test")
          return new Response(
            `<html><title>Lecturer in Computing</title><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Lecturer in Computing", description, hiringOrganization: { name: "Example University" }, jobLocation: { address: { addressCountry: "IE" } } })}</script><main><h1>Lecturer in Computing</h1><p>${description}</p></main></html>`,
            { headers: { "content-type": "text/html" } },
          );
        if (url === "https://example.com/mcp") {
          const request = JSON.parse(init.body);
          globalThis.__mcpFixtureRequests.push(request);
          return Response.json({
            jsonrpc: "2.0",
            id: request.id,
            result:
              request.method === "tools/list"
                ? {
                    tools: [
                      {
                        name: "search_jobs",
                        description: "Fixture job search",
                        inputSchema: {
                          type: "object",
                          properties: { query: { type: "string" } },
                        },
                      },
                    ],
                  }
                : {
                    structuredContent: {
                      jobs: [{ url: "https://example.com/jobs/activity-test" }],
                    },
                  },
          });
        }
        return nativeFetch(input, init);
      };
    });
    const nav = (name) =>
      page.locator("nav").getByRole("button", { name, exact: true }).click();
    await nav("Activity");
    await page
      .getByRole("heading", { name: "Activity", exact: true })
      .waitFor();
    const imported = await invoke(page, "jobs.import", {
      url: "https://example.com/jobs/activity-test",
    });
    const done = await waitTask(page, imported.id);
    assert.equal(done.status, "completed", done.message);
    assert.ok(done.logs.some((l) => /Extracting employer/.test(l.message)));
    await page
      .getByRole("button", { name: /Import job listing/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Open imported listing", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Lecturer in Computing", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    outcome.importResultLink = true;
    console.log("Import result link passed");
    const badImport = await invoke(page, "jobs.import", {
      url: "https://example.com/jobs/unreadable",
    });
    assert.equal((await waitTask(page, badImport.id)).status, "failed");
    await nav("Activity");
    await page
      .getByRole("button", { name: /Import job listing/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Retry task", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Open source in browser", exact: true })
      .waitFor();
    await page.screenshot({
      path: "qa/activity-import-error.png",
      fullPage: true,
    });
    outcome.importErrorAndRetry = true;
    console.log("Import failure controls passed");
    await invoke(page, "profile.save", {
      data: {
        personal: {
          name: "Example Candidate",
          summary: "Computing lecturer researching speech AI.",
        },
        education: [],
        experience: [],
        skills: [],
      },
    });
    await invoke(page, "profile.approve");
    const docTask = await invoke(page, "package.draft", {
      jobId: done.result.jobId,
      types: ["Academic CV", "Cover letter"],
    });
    const partial = await waitTask(page, docTask.id);
    assert.equal(partial.status, "failed");
    assert.ok(partial.packageId);
    await nav("Activity");
    await page
      .getByRole("button", { name: /Prepare submission package/ })
      .click();
    await page
      .getByRole("log", { name: "Task work log" })
      .getByText("Academic CV saved as Word document", { exact: true })
      .waitFor();
    await page.screenshot({
      path: "qa/activity-document-log.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Open package", exact: true })
      .click();
    console.log("Opened partial package");
    await page
      .getByRole("button", { name: "Export PDFs with Word", exact: true })
      .waitFor();
    outcome.partialPackageAndWorkLog = true;
    console.log("Partial package log passed");
    const exportTask = await invoke(page, "package.export", {
      id: partial.packageId,
    });
    const exported = await waitTask(page, exportTask.id);
    assert.equal(exported.status, "completed", exported.message);
    assert.ok(exported.logs.some((line) => /PDF verified/.test(line.message)));
    outcome.wordPdfProgress = true;
    await nav("Connectors");
    const bahrain = page.locator(".connector-card").filter({
      has: page.getByRole("heading", {
        name: "University of Bahrain careers",
        exact: true,
      }),
    });
    await bahrain
      .getByRole("button", { name: "Install automatically", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open full Activity screen", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await bahrain.getByText("Enabled", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Add MCP connection", exact: true })
      .click();
    await page
      .getByLabel("Connector name", { exact: true })
      .fill("Fixture MCP");
    await page
      .getByLabel("MCP endpoint", { exact: true })
      .fill("https://example.com/mcp");
    await page
      .getByRole("button", { name: "Add connection", exact: true })
      .click();
    const card = page.locator(".connector-card").filter({
      has: page.getByRole("heading", { name: "Fixture MCP", exact: true }),
    });
    await card
      .getByRole("button", { name: "Test connector", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open full Activity screen", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    await card
      .getByRole("button", { name: "Search jobs", exact: true })
      .click();
    await page
      .getByLabel("Search arguments (JSON)", { exact: true })
      .fill('{"query":"speech AI lecturer"}');
    await page
      .getByRole("button", { name: "Search and import", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open full Activity screen", exact: true })
      .waitFor();
    await page.keyboard.press("Escape");
    let connectorTask;
    for (let attempt = 0; attempt < 30 && !connectorTask; attempt++) {
      connectorTask = (await invoke(page, "snapshot")).tasks.find(
        (t) => t.kind === "connector-search",
      );
      if (!connectorTask)
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal((await waitTask(page, connectorTask.id)).status, "completed");
    console.log("MCP import completed");
    const requests = await app.evaluate(() => globalThis.__mcpFixtureRequests);
    assert.ok(requests.some((r) => r.method === "tools/call"));
    assert.ok(!JSON.stringify(requests).includes("Example Candidate"));
    outcome.connectorInstallAndMcpImport = true;
    await page.keyboard.press("Escape");
    console.log("MCP controls passed");
    await page.screenshot({
      path: "qa/connectors-catalog.png",
      fullPage: true,
    });
    await nav("Apply");
    await page
      .locator("summary")
      .filter({ hasText: "Research listings in Chrome" })
      .click();
    await page
      .getByRole("heading", { name: "Browser workspace", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Create browser plan", exact: true })
      .waitFor();
    outcome.browserControlsVisible = true;
    await page.screenshot({ path: "qa/browser-workspace.png", fullPage: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      `qa/workflow-ui${process.argv[2] ? "-packaged" : ""}-results.json`,
      JSON.stringify(
        { packaged: !!process.argv[2], ...outcome, rendererErrors: errors },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(outcome));
  } catch (error) {
    console.error("Workflow check failed:", error);
    throw error;
  } finally {
    const process = app.process();
    let timer;
    await Promise.race([
      app.close().catch(() => {}),
      new Promise((resolve) => {
        timer = setTimeout(resolve, 5000);
      }),
    ]);
    clearTimeout(timer);
    if (process.exitCode === null) process.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
