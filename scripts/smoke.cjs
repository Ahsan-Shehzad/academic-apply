const { _electron: electron } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  fs.mkdirSync("qa", { recursive: true });
  const app = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      ACADEMICAPPLY_DATA_DIR: path.resolve(".test-data/ui"),
    },
    timeout: 60000,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("h1", { timeout: 60000 });
    await page.screenshot({ path: "qa/dashboard.png", fullPage: true });
    for (const screen of [
      "Discover",
      "Scheduler",
      "Documents",
      "Apply",
      "Activity",
      "Connectors",
      "Profile",
      "Reports",
      "Settings",
    ]) {
      await page
        .locator("nav")
        .getByRole("button", { name: screen === "Apply" ? /^Apply/ : screen, exact: screen !== "Apply" })
        .click();
      await page.waitForTimeout(250);
      if (!(await page.locator("h1").isVisible()))
        throw new Error(screen + " heading is missing");
      await page.screenshot({
        path: "qa/" + screen.toLowerCase() + ".png",
        fullPage: true,
      });
    }
    const snapshot = await page.evaluate(async () => {
      const result = await window.academic.call("snapshot");
      return {
        ok: result.ok,
        jobs: result.result.jobs.length,
        sources: result.result.sources.length,
      };
    });
    if (!snapshot.ok || errors.length)
      throw new Error(errors.join("\n") || "IPC failed");
    console.log(
      JSON.stringify({ screens: 10, rendererErrors: errors, snapshot }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
