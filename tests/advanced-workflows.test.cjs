const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { chromium } = require("playwright-core");
const { Store } = require("../desktop/store.cjs");
const { Browser, chromePath } = require("../desktop/browser.cjs");
const { ApplicationBrowser } = require("../desktop/application-browser.cjs");
const { Discovery } = require("../desktop/discovery.cjs");
const { defaultSearch, hash, ALL_COUNTRIES } = require("../desktop/core.cjs");
const { COUNTRY_GROUPS } = require("../desktop/country-groups.cjs");
const { createToolBridge } = require("../desktop/agent-tools.cjs");
test("country presets contain only supported unique countries and distinguish Gulf, EU, EEA and UK/Ireland", () => {
  for (const g of COUNTRY_GROUPS) {
    assert.equal(new Set(g.countries).size, g.countries.length);
    assert.ok(g.countries.every((c) => ALL_COUNTRIES.includes(c)));
  }
  assert.equal(COUNTRY_GROUPS.find((g) => g.id === "gulf").countries.length, 6);
  assert.ok(
    !COUNTRY_GROUPS.find((g) => g.id === "eu").countries.includes(
      "United Kingdom",
    ),
  );
  assert.ok(
    COUNTRY_GROUPS.find((g) => g.id === "eea").countries.includes("Norway"),
  );
  assert.deepEqual(
    COUNTRY_GROUPS.find((g) => g.id === "uk-ireland").countries,
    ["United Kingdom", "Ireland"],
  );
});
test("advanced application controls fill, upload hidden multiple-file inputs, reject stale steps and preserve final review", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-advanced-"));
  const store = await Store.open(root);
  const engine = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
  });
  const context = await engine.newContext();
  const page = await context.newPage();
  try {
    const profile = {
      personal: {
        name: "Example Candidate",
        summary: "Teach computing.",
        contact: {
          emails: [{ value: "candidate@example.edu", use: "primary" }],
        },
      },
      education: [],
      experience: [],
    };
    store.put("profile", { id: "main", verified: true, data: profile });
    store.put("jobs", {
      id: "job",
      description: "A verified academic listing.",
    });
    const files = ["cv", "letter"].map((name, index) => {
      const file = path.join(root, name + ".pdf");
      fs.writeFileSync(file, "fixture " + name);
      return {
        id: name,
        type: index ? "Cover letter" : "Academic CV",
        pdf: file,
        reviewed: true,
        approvedFiles: { pdf: hash(fs.readFileSync(file)) },
      };
    });
    store.put("packages", {
      id: "pkg",
      jobId: "job",
      folder: root,
      documents: files,
      attachments: [],
      status: "ready",
    });
    store.put("applications", {
      id: "app",
      jobId: "job",
      packageId: "pkg",
      status: "preparing",
      uploads: [],
    });
    await page.setContent(
      '<form><label>Full name<input name="fullName"></label><label>Email<input type="email" name="email"></label><label>Password<input type="password" value="secret-password" name="password"></label><label><input type="checkbox" name="agreement">I agree to declarations</label><div style="padding:20px"><label>Supporting documents<input type="file" name="files" multiple accept=".pdf" style="display:none"></label></div><button type="button" id="next">Next</button><button type="submit">Submit application</button></form><script>window.sends=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.sends++};document.querySelector("#next").onclick=()=>{document.querySelector("[name=fullName]").name="researchTitle";document.querySelector("label").firstChild.textContent="Research title"}</script>',
    );
    const browser = new Browser(store, {});
    browser.context = context;
    browser.sessions.set("app", page);
    const controls = new ApplicationBrowser(
      browser,
      store,
      {},
      { validateUrl: async (u) => new URL(u) },
    );
    let state = await controls.inspect("app", true);
    assert.ok(!JSON.stringify(state).includes("secret-password"));
    assert.ok(state.snapshot.fields.find((f) => f.name === "files"));
    state = await controls.action(
      "app",
      { action: "fill_contacts", snapshotHash: state.snapshotHash },
      { agent: true },
    );
    assert.equal(
      await page.locator('[name="email"]').inputValue(),
      "candidate@example.edu",
    );
    const legal = state.snapshot.fields.find((f) => f.name === "agreement");
    await assert.rejects(
      controls.action(
        "app",
        {
          action: "fill",
          fieldKey: legal.key,
          value: true,
          evidence: ["profile.contact"],
          snapshotHash: state.snapshotHash,
        },
        { agent: true },
      ),
      /manual review/,
    );
    assert.equal(await page.locator('[name="agreement"]').isChecked(), false);
    const upload = state.snapshot.fields.find((f) => f.type === "file");
    state = await controls.action(
      "app",
      {
        action: "upload",
        fieldKey: upload.key,
        fileIds: ["cv:pdf", "letter:pdf"],
        snapshotHash: state.snapshotHash,
      },
      { agent: true },
    );
    assert.equal(
      await page.locator('[name="files"]').evaluate((el) => el.files.length),
      2,
    );
    assert.equal(store.get("applications", "app").uploads.length, 2);
    const terminal = state.snapshot.buttons.find((b) => b.terminal);
    await assert.rejects(
      controls.action(
        "app",
        {
          action: "click",
          buttonKey: terminal.key,
          snapshotHash: state.snapshotHash,
        },
        { agent: true },
      ),
      /final submission/,
    );
    assert.equal(await page.evaluate(() => window.sends), 0);
    const oldHash = state.snapshotHash;
    const next = state.snapshot.buttons.find((b) => b.text === "Next");
    await controls.action(
      "app",
      { action: "next", buttonKey: next.key, snapshotHash: oldHash },
      { agent: true },
    );
    await assert.rejects(
      controls.action(
        "app",
        { action: "fill_contacts", snapshotHash: oldHash },
        { agent: true },
      ),
      /form changed/,
    );
    const popup = await context.newPage();
    await popup.setContent("<title>Additional application tab</title>");
    browser.trackTab("app", popup);
    state = await controls.inspect("app");
    assert.equal(state.tabs.length, 2);
    await controls.action("app", {
      action: "select_tab",
      tabId: state.tabs.find((t) => !t.selected).id,
    });
    assert.equal(await browser.pageFor("app"), popup);
  } finally {
    store.close();
    await engine.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
function vacancy() {
  return {
    title: "Postdoctoral Researcher in Speech AI",
    institution: "Example University",
    country: "Netherlands",
    url: "https://example.com/jobs/speech",
    applicationUrl: "https://example.com/jobs/speech/apply",
    description:
      "Example University seeks a postdoctoral researcher in speech AI, natural language processing and machine learning for cognitive impairment detection. A completed PhD in computing and relevant published research are required. Submit a CV and research proposal.",
    focus: "Speech AI and cognitive impairment",
    eligibility: "PhD in computing",
    requiredDocuments: ["Academic CV", "Research proposal"],
    deadline: "2099-12-01",
    deadlineText: "1 December 2099",
    deadlineTimezone: "Not stated",
    sources: [
      {
        url: "https://example.com/jobs/speech",
        evidence:
          "Example University seeks a postdoctoral researcher in speech AI.",
      },
    ],
  };
}
test("AI-first import and scheduled-source recovery retain provenance without bypassing blocked page access", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-recovery-"));
  const store = await Store.open(root);
  let requests = 0,
    fetches = 0;
  try {
    store.put("settings", { ...store.settings(), cloudConsent: true });
    const providers = {
      run: async (prompt, options) => {
        requests++;
        assert.equal(options.webSearch, true);
        assert.ok(!prompt.includes("candidate@example"));
        return JSON.stringify({ jobs: [vacancy()] });
      },
    };
    const discovery = new Discovery(store, providers);
    discovery.fetchPage = async () => {
      fetches++;
      throw new Error("Automated access is disallowed by this source");
    };
    const signal = new AbortController().signal;
    const imported = await discovery.import(vacancy().url, signal, () => {});
    assert.equal(requests, 1);
    assert.equal(imported.verification.status, "ai_reported");
    assert.equal(imported.retrieval.sources.length, 1);
    assert.ok(fetches > 0);
    const result = await discovery.search(
      {
        ...defaultSearch(),
        sources: ["academictransfer"],
        countries: ["Netherlands"],
      },
      () => {},
      signal,
    );
    assert.equal(result.updated, 1);
    assert.equal(result.failed, 1);
    assert.ok(requests >= 2);
    providers.run = async () =>
      JSON.stringify({ jobs: [{ ...vacancy(), deadline: "2000-01-01" }] });
    assert.deepEqual(
      await discovery.research({ url: vacancy().url }, () => {}, signal),
      [],
    );
    providers.run = async () =>
      JSON.stringify({
        jobs: [{ ...vacancy(), url: "https://127.0.0.1/private" }],
      });
    await assert.rejects(
      discovery.research({ url: vacancy().url }, () => {}, signal),
      /public HTTPS|Private network/,
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("AI-retrieved details become source verified only after matching official page evidence is fetched", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-evidence-"));
  const store = await Store.open(root);
  try {
    const job = vacancy();
    const discovery = new Discovery(store, {
      run: async () => JSON.stringify({ jobs: [job] }),
    });
    discovery.fetchPage = async (url) => ({
      url,
      html: `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: job.title, hiringOrganization: { name: job.institution }, jobLocation: { address: { addressCountry: "NL" } }, description: job.description, validThrough: "2099-12-01" })}</script>`,
    });
    const [result] = await discovery.research(
      { url: job.url },
      () => {},
      new AbortController().signal,
    );
    assert.equal(result.verification.status, "source_verified");
    assert.equal(result.institution, job.institution);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("MCP browser bridge rejects unauthenticated callers and serializes authorized tool actions", async () => {
  let active = 0,
    max = 0,
    count = 0;
  const bridge = await createToolBridge(
    [
      {
        name: "academicapply_portal",
        description: "Fixture",
        inputSchema: { type: "object" },
      },
    ],
    async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return { count: ++count };
    },
  );
  try {
    assert.equal(
      (await fetch(bridge.endpoint, { method: "POST", body: "{}" })).status,
      403,
    );
    const call = (id) =>
      fetch(bridge.endpoint, {
        method: "POST",
        headers: { Authorization: "Bearer " + bridge.token },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: "academicapply_portal", arguments: {} },
        }),
      }).then((r) => r.json());
    await Promise.all([call(1), call(2)]);
    assert.equal(max, 1);
    assert.equal(count, 2);
  } finally {
    bridge.close();
  }
});
test("combined submission packets include original PDF attachments and reject files outside the package", async () => {
  const { PDFDocument } = require("pdf-lib");
  const { Documents } = require("../desktop/documents.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-combine-"));
  const store = await Store.open(root);
  try {
    const make = async (file, pages) => {
      const d = await PDFDocument.create();
      for (let i = 0; i < pages; i++) d.addPage();
      fs.writeFileSync(file, await d.save());
    };
    const cv = path.join(root, "cv.pdf"),
      transcript = path.join(root, "transcript.pdf");
    await make(cv, 1);
    await make(transcript, 2);
    store.put("packages", {
      id: "pkg",
      folder: root,
      version: 1,
      status: "ready",
      documents: [{ id: "cv", pdf: cv, reviewed: true }],
      attachments: [
        {
          name: "transcript.pdf",
          path: transcript,
          hash: hash(fs.readFileSync(transcript)),
        },
      ],
    });
    const docs = new Documents(store, {});
    await assert.rejects(
      docs.combine("pkg", ["cv"], [path.join(os.tmpdir(), "outside.pdf")]),
      /original PDF attachments/,
    );
    const pkg = await docs.combine("pkg", ["cv"], [transcript]);
    const merged = await PDFDocument.load(
      fs.readFileSync(
        pkg.attachments.find((a) => a.name === "Combined-Supporting-Packet.pdf")
          .path,
      ),
    );
    assert.equal(merged.getPageCount(), 3);
    assert.equal(
      pkg.attachments.filter((a) => a.name === "transcript.pdf").length,
      1,
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
