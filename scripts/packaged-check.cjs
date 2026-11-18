const { _electron: electron } = require("playwright-core");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const executablePath = path.resolve(
    process.argv[2] || "release-delivery/win-unpacked/AcademicApply.exe",
  );
  const app = await electron.launch({
    executablePath,
    args: [],
    env: {
      ...process.env,
      ACADEMICAPPLY_DATA_DIR: path.resolve(".test-data/packaged-final"),
    },
    timeout: 60000,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("h1", { timeout: 60000 });
    for (const screen of [
      "Discover",
      "Scheduler",
      "Documents",
      "Apply",
      "Profile",
      "Reports",
      "Settings",
    ]) {
      await page
        .locator("nav")
        .getByRole("button", { name: screen === "Apply" ? /^Apply/ : screen, exact: screen !== "Apply" })
        .click();
      await page.locator("h1").waitFor();
    }
    const snapshot = await page.evaluate(() =>
      window.academic.call("snapshot"),
    );
    assert.ok(snapshot.ok);
    assert.equal(
      snapshot.result.sources.length,
      require("../desktop/core.cjs").SOURCES.length,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({ path: "qa/packaged-settings.png", fullPage: true });
    const result = {
      at: new Date().toISOString(),
      executablePath,
      packaged: true,
      screens: 8,
      database: true,
      sources: snapshot.result.sources.length,
      rendererErrors: errors,
    };
    fs.writeFileSync(
      "qa/packaged-results.json",
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
