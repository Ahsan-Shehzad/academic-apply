const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright-core");
const { chromePath } = require("../desktop/browser.cjs");
const { BrowserWorkspace } = require("../desktop/browser-workspace.cjs");
const { Discovery } = require("../desktop/discovery.cjs");
const { Store } = require("../desktop/store.cjs");
test("Chrome research controls import visible listings and constrain prompt plans to reviewed research steps", async () => {
  const engine = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
  });
  const context = await engine.newContext();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-browser-"));
  const store = await Store.open(root);
  try {
    const description =
      "Teach Python and software engineering. Research speech AI and interpretable machine learning. Applicants must have a PhD and university teaching experience. Submit a CV and cover letter by the deadline.";
    await context.route("https://example.edu/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<html><title>Lecturer in Computing</title><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Lecturer in Computing", description, hiringOrganization: { name: "Example University" }, jobLocation: { address: { addressCountry: "IE" } } })}</script><main><h1>Lecturer in Computing</h1><p>${description}</p><form><input type="password" value="never-share"><textarea>private-draft-text</textarea></form></main></html>`,
      }),
    );
    let receivedPrompt;
    const provider = {
      run: async (prompt) => {
        receivedPrompt = prompt;
        return JSON.stringify({
          summary: "Inspect and import",
          steps: [
            { action: "inspect", description: "Inspect the listing" },
            { action: "import", description: "Import it" },
          ],
        });
      },
    };
    const workspace = new BrowserWorkspace(
      { launch: async () => context },
      new Discovery(store, {}),
      provider,
      store,
      {
        validateUrl: async (url) => {
          if (!url.startsWith("https://example.edu/"))
            throw new Error("Unsafe URL");
        },
      },
    );
    const opened = await workspace.open(
      "https://example.edu/jobs/1?session=private-query",
    );
    const inspection = await workspace.inspect(opened.tabId);
    assert.ok(!inspection.text.includes("private-draft-text"));
    assert.ok(!inspection.text.includes("never-share"));
    const imported = await workspace.import(opened.tabId);
    assert.equal(
      store.get("jobs", imported.jobId).institution,
      "Example University",
    );
    assert.equal(
      (await workspace.plan("Inspect the current lecturer job", opened.tabId))
        .steps.length,
      2,
    );
    assert.ok(!receivedPrompt.includes("private-query"));
    assert.ok(!receivedPrompt.includes(description));
    provider.run = async () =>
      JSON.stringify({
        summary: "bad",
        steps: [{ action: "submit", description: "Send application" }],
      });
    await assert.rejects(
      workspace.plan("Submit now", opened.tabId),
      /Unsupported plan/,
    );
    await assert.rejects(
      workspace.control(opened.tabId, "submit"),
      /Unsupported browser/,
    );
    await workspace.control(opened.tabId, "reload");
    await workspace.control(opened.tabId, "close");
    assert.equal((await workspace.tabs()).length, 0);
  } finally {
    await engine.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
