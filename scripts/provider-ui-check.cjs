const { _electron: electron } = require("playwright-core");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
async function invoke(page, method, args = {}) {
  const result = await page.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.equal(result.ok, true, result.error);
  return result.result;
}
(async () => {
  const app = await electron.launch({
    ...(process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]) }
      : {}),
    args: process.argv[2] ? [] : ["."],
    env: {
      ...process.env,
      ACADEMICAPPLY_DATA_DIR: path.resolve(".test-data/provider-ui"),
    },
    timeout: 60000,
  });
  const errors = [];
  let terminalPid;
  let terminalHostPid;
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("h1");
    await page
      .locator("nav")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await invoke(page, "settings.save", {
      settings: {
        cloudConsent: false,
        effort: "medium",
        models: { codex: "", antigravity: "gemini-3.8-flash-medium" },
      },
    });
    const result = await invoke(page, "provider.test", {
      provider: "antigravity",
      inference: true,
    });
    assert.equal(result.status, "ready", result.message);
    assert.equal(result.models.length > 0, true);
    await page
      .getByText(
        "Service verified. Enable AI processing above before running AI workflows.",
        { exact: true },
      )
      .waitFor();
    const cached = await invoke(page, "provider.login", {
      provider: "antigravity",
    });
    assert.match(cached.message, /already signed in/);
    assert.equal(cached.terminalPid, undefined);
    // This test explicitly requests the visible provider-owned sign-in terminal.
    if (process.env.CHECK_SIGNIN_TERMINAL === "1") {
      const terminal = await invoke(page, "provider.login", {
        provider: "antigravity",
        forceTerminal: true,
      });
      terminalPid = terminal.terminalPid;
      terminalHostPid = terminal.terminalHostPid;
      assert.ok(Number.isInteger(terminalPid));
      assert.equal(terminal.terminalVisible, true);
      const window = JSON.parse(
        execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            `Get-Process -Id ${terminalHostPid} | Select-Object Id,MainWindowHandle,MainWindowTitle | ConvertTo-Json -Compress`,
          ],
          { encoding: "utf8", windowsHide: true },
        ),
      );
      assert.ok(
        window.MainWindowTitle.includes("AcademicApply - Antigravity sign-in"),
      );
      console.log("Visible sign-in terminal confirmed", window.Id);
    }
    const saved = await invoke(page, "settings.save", {
      settings: { effort: "high" },
    });
    const snapshot = await invoke(page, "snapshot");
    assert.equal(
      snapshot.providers.find((p) => p.id === "antigravity").status,
      "not_tested",
    );
    assert.equal(saved.cloudConsent, false);
    await page
      .getByText(
        "Connection settings changed. Run Test service for this model and reasoning effort.",
        { exact: true },
      )
      .waitFor();
    await page.screenshot({ path: "qa/provider-settings.png", fullPage: true });
    assert.deepEqual(errors, []);
    const resultData = {
      packaged: !!process.argv[2],
      modelsPopulated: true,
      liveInference: true,
      cachedSignIn: true,
      staleTestInvalidation: true,
      aiRemainsOff: true,
      visibleTerminal: !!terminalPid,
      rendererErrors: errors,
    };
    fs.writeFileSync(
      `qa/provider-ui${process.argv[2] ? "-packaged" : ""}-results.json`,
      JSON.stringify(resultData, null, 2),
    );
    console.log(JSON.stringify(resultData));
  } finally {
    // Closing the console process may already close its delegated terminal host.
    try {
      if (terminalPid)
        execFileSync(
          "taskkill.exe",
          ["/PID", String(terminalPid), "/T", "/F"],
          { windowsHide: true },
        );
    } catch {}
    try {
      if (terminalHostPid)
        execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            `Stop-Process -Id ${terminalHostPid} -ErrorAction SilentlyContinue; exit 0`,
          ],
          { windowsHide: true },
        );
    } catch {}
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
