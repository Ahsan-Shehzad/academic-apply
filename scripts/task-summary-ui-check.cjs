const { _electron: electron } = require("playwright-core"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { Store } = require("../desktop/store.cjs"),
  { Discovery } = require("../desktop/discovery.cjs");
const { defaultSearch } = require("../desktop/core.cjs");
async function invoke(p, method, args = {}) {
  const r = await p.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.ok(r.ok, r.error);
  return r.result;
}
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/task-summary-")),
    store = await Store.open(root);
  for (const s of store.list("searches"))
    store.put("searches", { ...s, enabled: false });
  const job = {
    title: "Lecturer in Speech AI",
    institution: "Example University",
    country: "Netherlands",
    url: "https://www.academictransfer.com/en/jobs/801/lecturer",
    description:
      "Research and teach speech AI in a university environment. Submit an academic CV and research statement. A PhD and relevant teaching experience are required.",
    deadline: "2099-12-31",
  };
  new Discovery(store, {}).save(job, "Fixture");
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
      Discovery.prototype.fetchPage = async (url) => {
        await new Promise((r) => setTimeout(r, 350));
        if (url.includes("indeed.com") || url.includes("/803/"))
          throw new Error("Source returned HTTP 403");
        const match = url.match(/\/80([12])\//);
        if (match)
          return {
            url,
            html:
              '<script type="application/ld+json">' +
              JSON.stringify({
                "@type": "JobPosting",
                title:
                  match[1] === "1"
                    ? "Lecturer in Speech AI"
                    : "Lecturer in Natural Language Processing",
                hiringOrganization: { name: "Example University" },
                jobLocation: { address: { addressCountry: "NL" } },
                description:
                  "Research and teach speech AI and natural language processing in a university environment. Submit an academic CV and research statement. A PhD and relevant teaching experience are required.",
                validThrough: "2099-12-31",
              }) +
              "</script>",
          };
        return {
          url,
          html: '<a href="/en/jobs/801/lecturer">Lecturer in Speech AI</a><a href="/en/jobs/802/lecturer">Lecturer in Natural Language Processing</a><a href="/en/jobs/803/lecturer">Lecturer in Machine Learning</a>',
        };
      };
    });
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("h1");
    await page
      .locator("nav")
      .getByRole("button", { name: "Discover", exact: true })
      .click();
    const search = {
      ...defaultSearch(),
      name: "Summary fixture",
      countries: ["Netherlands"],
      roles: ["Lecturer"],
      keywords: "speech AI",
      sources: ["academictransfer", "indeed"],
      strategy: "sources",
      maxResults: 10,
    };
    const task = await invoke(page, "search.execute", { search });
    await page.getByRole("status", { name: "Task finished" }).waitFor();
    const notice = page.getByRole("status", { name: "Task finished" });
    await notice.getByRole("button", { name: "View full summary" }).click();
    const summary = page
      .getByRole("region", { name: "Task completion summary" })
      .last();
    assert.match(
      await summary.innerText(),
      /2 distinct listings saved: 1 new, 1 updated/,
    );
    await summary.locator("summary").click();
    assert.ok(await summary.locator(".source-report-scroll").evaluate(el=>el.scrollWidth<=el.clientWidth+1),"Source actions must fit in the Activity drawer");
    assert.match(await summary.innerText(), /HTTP 403/);
    assert.equal(
      await summary
        .getByRole("button", { name: "Setup guide", exact: true })
        .count(),
      2,
    );
    assert.ok(
      await page
        .getByRole("button", { name: "View listings", exact: true })
        .isVisible(),
    );
    const snapshot = await invoke(page, "snapshot"),
      record = snapshot.tasks.find((t) => t.id === task.id);
    assert.equal(record.summary.sourceReport.length, 2);
    assert.equal(record.result.updated, 1);
    await page.screenshot({ path: "qa/task-summary-details.png" });
    await page.keyboard.press("Escape");
    await notice.getByRole("button", { name: "Dismiss task summary" }).click();
    // A failed import also needs a terminal summary and a retry action.
    const failed = await invoke(page, "jobs.import", {
      url: "https://www.indeed.com/viewjob?jk=fixture",
    });
    await page.getByRole("status", { name: "Task finished" }).waitFor();
    await page
      .getByRole("status", { name: "Task finished" })
      .getByRole("button", { name: "View full summary" })
      .click();
    assert.ok(
      await page
        .getByRole("button", { name: "Retry task", exact: true })
        .isVisible(),
    );
    assert.match(
      await page
        .getByRole("region", { name: "Task completion summary" })
        .last()
        .innerText(),
      /HTTP 403/,
    );
    assert.deepEqual(errors, []);
    await app.close();
    app = await electron.launch(options);
    const p2 = await app.firstWindow();
    await p2.waitForSelector("h1");
    const after = await invoke(p2, "snapshot");
    assert.deepEqual(
      after.tasks.find((t) => t.id === task.id).summary,
      record.summary,
    );
    assert.equal(
      after.tasks.find((t) => t.id === failed.id).summary.outcome,
      "failed",
    );
    assert.equal(
      await p2.getByRole("status", { name: "Task finished" }).count(),
      0,
    );
    console.log(
      JSON.stringify({
        version: after.version,
        packaged: !!process.argv[2],
        automaticCompletionNotice: true,
        distinctCounts: true,
        sourceActions: true,
        failureAndRetry: true,
        summaryPersistsAfterRestart: true,
        noOldNotificationReplay: true,
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
