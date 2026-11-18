const { _electron: electron } = require("playwright-core"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { Store } = require("../desktop/store.cjs");
async function invoke(p, method, args = {}) {
  const r = await p.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.equal(r.ok, true, r.error);
  return r.result;
}
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/source-management-ui-")),
    store = await Store.open(root);
  for (const search of store.list("searches"))
    store.put("searches", { ...search, enabled: false });
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
    const p = await app.firstWindow(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.waitForSelector("h1");
    for (const [title, institution] of [
      ["Lecturer in Speech AI", "Alpha University"],
      ["Postdoctoral NLP Researcher", "Beta University"],
    ])
      await invoke(p, "jobs.add", {
        job: {
          title,
          institution,
          country: "Australia",
          url: "https://example.edu/job/" + institution[0],
          description: "Speech artificial intelligence and NLP",
          deadline: "2027-06-01",
        },
      });
    await p
      .locator("nav")
      .getByRole("button", { name: "Discover", exact: true })
      .click();
    await p.getByText("2 opportunities", { exact: true }).waitFor();
    const row = p
      .locator(".job-listing")
      .filter({ hasText: "Postdoctoral NLP Researcher" });
    await row.locator("label").nth(4).click();
    await p.waitForTimeout(300);
    let snap = await invoke(p, "snapshot");
    assert.equal(
      snap.jobs.find((j) => j.title.startsWith("Postdoctoral")).personalRating,
      5,
    );
    await p.getByRole("combobox", { name: "Sort", exact: true }).click();
    await p
      .getByRole("option", { name: "My highest rating", exact: true })
      .click();
    assert.ok(
      (await p.locator(".job-row-title b").first().innerText()).startsWith(
        "Postdoctoral",
      ),
    );
    await row.getByRole("button", { name: "Shortlist", exact: true }).click();
    await row
      .getByRole("button", { name: "Unshortlist", exact: true })
      .waitFor();
    await row.getByRole("button", { name: "Pin", exact: true }).click();
    await row.getByRole("button", { name: "Unpin", exact: true }).waitFor();
    await p.screenshot({ path: "qa/source-management-discover.png" });
    const first = p
      .locator(".job-listing")
      .filter({ hasText: "Lecturer in Speech AI" });
    await first.getByRole("button", { name: "Delete", exact: true }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    assert.equal((await invoke(p, "snapshot")).jobs.length, 2);
    await first.getByRole("button", { name: "Delete", exact: true }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Delete listing", exact: true })
      .click();
    await p.getByText("1 opportunities", { exact: true }).waitFor();
    assert.equal((await invoke(p, "snapshot")).jobs.length, 1);
    await p
      .getByRole("button", { name: "Reset all listings (1)", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Delete all listings", exact: true })
      .click();
    await p.getByText("0 opportunities", { exact: true }).waitFor();
    assert.equal((await invoke(p, "snapshot")).jobs.length, 0);
    await p
      .locator("nav")
      .getByRole("button", { name: "Connectors", exact: true })
      .click();
    const sourceCount = (await invoke(p, "snapshot")).sources.length;
    assert.equal(await p.locator(".connector-card").count(), sourceCount);
    await p
      .getByRole("button", { name: "Test all connectors", exact: true })
      .waitFor();
    await p
      .getByRole("textbox", { name: "Find connector", exact: true })
      .fill("greenhouse");
    const card = p.locator(".connector-card");
    await card
      .getByRole("button", { name: "Configure employer boards", exact: true })
      .click();
    await p
      .getByRole("textbox", { name: "Employer board identifiers", exact: true })
      .fill("fixture-university");
    await p.getByRole("button", { name: "Save boards", exact: true }).click();
    await p
      .getByText("Employer boards: fixture-university", { exact: true })
      .waitFor();
    assert.deepEqual(
      (await invoke(p, "snapshot")).connectors.find(
        (c) => c.id === "greenhouse",
      ).boards,
      ["fixture-university"],
    );
    await card.locator("summary").click();
    await card
      .getByRole("button", { name: "Official site / guide", exact: true })
      .waitFor();
    await p.screenshot({ path: "qa/source-management-connectors.png" });
    assert.deepEqual(errors, []);
    const report = {
      version: (await invoke(p, "snapshot")).version,
      sources: sourceCount,
      personalRating: true,
      sorting: true,
      pinning: true,
      shortlist: true,
      deleteConfirmation: true,
      deleteSingle: true,
      resetAll: true,
      employerConfiguration: true,
      guideLinks: true,
      rendererErrors: errors,
    };
    fs.writeFileSync(
      "qa/source-management-ui-results.json",
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
