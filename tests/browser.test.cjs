const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright-core");
const {
  Browser,
  chromePath,
  snapshotPage,
  snapshotHash,
  deterministicAnswers,
} = require("../desktop/browser.cjs");
const { Store } = require("../desktop/store.cjs");
const { hash } = require("../desktop/core.cjs");
test("portal flow protects private fields, requires current review and never retries uncertain submission", async () => {
  const chrome = chromePath();
  assert.ok(chrome, "Installed Chrome is required for this integration test");
  const engine = await chromium.launch({
    executablePath: chrome,
    headless: true,
  });
  const context = await engine.newContext();
  const page = await context.newPage();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-portal-"));
  const store = await Store.open(root);
  try {
    await page.setContent(
      '<form id="form"><label>Full name<input name="fullName" required></label><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" value="never-log-me"></label><label>CV<input type="file" name="cv"></label><label><input name="declaration" type="checkbox" required>I confirm these facts</label><button type="submit">Submit application</button></form><script>window.sends=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.sends++;document.body.innerHTML="<h1>Thank you for your application</h1>"}</script>',
    );
    const snapshot = await snapshotPage(page);
    assert.equal(
      snapshot.fields.find((f) => f.name === "password").value,
      "[private]",
    );
    assert.ok(!JSON.stringify(snapshot).includes("never-log-me"));
    const profile = {
      personal: {
        name: "Example Candidate",
        contact: {
          emails: [{ value: "candidate@example.org", use: "primary" }],
        },
      },
      education: [],
      experience: [],
    };
    const answers = deterministicAnswers(snapshot, profile, {});
    assert.equal(answers.length, 2);
    assert.ok(
      !answers.some(
        (a) => a.key === snapshot.fields.find((f) => f.type === "password").key,
      ),
    );
    store.put("profile", { id: "main", data: profile, verified: true });
    store.put("jobs", { id: "job", description: "Verified listing" });
    const pdf = path.join(root, "cv.pdf");
    fs.writeFileSync(pdf, "fixture document bytes");
    const pkg = {
      id: "pkg",
      jobId: "job",
      version: 1,
      status: "ready",
      profileHash: hash(profile),
      listingHash: hash("Verified listing"),
      folder: root,
      documents: [{ id: "doc", revision: 1, pdf, reviewed: true }],
      attachments: [],
    };
    store.put("packages", pkg);
    store.put("applications", {
      id: "application",
      jobId: "job",
      packageId: "pkg",
      status: "preparing",
      uploads: [],
    });
    const browser = new Browser(store, {});
    browser.context = context;
    browser.sessions.set("application", page);
    await browser.autoFill("application");
    const checks = {
      documents: true,
      answers: true,
      uploads: true,
      declarations: true,
    };
    const terminal = (
      await browser.inspect("application")
    ).snapshot.buttons.find((b) => b.terminal);
    await assert.rejects(
      () => browser.approve("application", terminal.key, checks),
      /validation errors/,
    );
    await page.locator('[name="declaration"]').check();
    store.put("applications", {
      ...store.get("applications", "application"),
      uploads: [{ path: path.join(root, "previous-package.pdf"), hash: "old" }],
    });
    await assert.rejects(
      () => browser.approve("application", terminal.key, checks),
      /previous package/,
    );
    store.put("applications", {
      ...store.get("applications", "application"),
      uploads: [],
    });
    await browser.approve("application", terminal.key, checks);
    await page.locator('[name="fullName"]').fill("Changed name");
    await assert.rejects(
      () => browser.submit("application"),
      /form or package changed/,
    );
    assert.equal(await page.evaluate(() => window.sends), 0);
    await browser.approve("application", terminal.key, checks);
    const sent = await browser.submit("application");
    assert.equal(sent.status, "submitted");
    assert.ok(fs.existsSync(sent.receipt));
    assert.equal(await page.evaluate(() => window.sends), 1);
    await assert.rejects(
      () => browser.submit("application"),
      /Review and approve/,
    );
  } finally {
    store.close();
    await engine.close();
  }
});
