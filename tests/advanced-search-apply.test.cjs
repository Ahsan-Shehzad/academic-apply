const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Store } = require("../desktop/store.cjs"),
  { Discovery } = require("../desktop/discovery.cjs"),
  { Browser } = require("../desktop/browser.cjs"),
  { ApplicationBrowser } = require("../desktop/application-browser.cjs");
const {
    advancedMatch,
    expandArguments,
    FilterSchema,
  } = require("../desktop/search-options.cjs"),
  { runSearch } = require("../desktop/search-runner.cjs"),
  {
    applicationContext,
    assertContext,
    preferredPackage,
  } = require("../desktop/application-context.cjs");
async function fixture(work) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-advanced-")),
    store = await Store.open(root);
  try {
    await work(store, root);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const vacancy = () => ({
  id: "job",
  title: "Lecturer in Speech AI",
  institution: "Example University",
  country: "Australia",
  url: "https://example.edu/job/speech",
  description:
    "Teach speech AI and natural language processing. Remote work is possible. A completed PhD is required.",
  focus: "Speech AI",
  eligibility: "Completed PhD and teaching experience",
  requiredDocuments: ["Academic CV", "Teaching statement"],
  deadline: "2026-11-23",
  publishedAt: "2026-11-15",
  official: true,
});
test("advanced filters consistently constrain titles, institutions, strict terms, dates and unknown values", () => {
  const job = vacancy(),
    search = {
      filters: FilterSchema.parse({
        title: "Lecturer, Postdoctoral",
        institutions: "Example",
        requiredTerms: "speech AI, PhD",
        excludedTerms: "studentship",
        minimumMatch: 0,
        postedWithinDays: 7,
        closingWithinDays: 14,
        includeUnknownDates: false,
        includeUnknownCountry: false,
        officialOnly: true,
        remoteOnly: true,
      }),
    },
    at = new Date("2026-11-17T08:00:00Z");
  assert.equal(advancedMatch(job, search, {}, at), true);
  for (const changes of [
    { title: "PhD studentship" },
    { institution: "Other Institute" },
    { description: "Speech AI without the required topic" },
    { publishedAt: null },
    { deadline: "2027-12-01" },
    { country: "Unknown" },
    { official: false },
  ])
    assert.equal(
      advancedMatch({ ...job, ...changes }, search, {}, at),
      false,
      JSON.stringify(changes),
    );
  assert.equal(
    advancedMatch(
      { ...job, publishedAt: null, deadline: null },
      {
        filters: {
          postedWithinDays: 7,
          closingWithinDays: 14,
          includeUnknownDates: true,
        },
      },
      {},
      at,
    ),
    true,
  );
  assert.equal(
    advancedMatch(job, { filters: { minimumMatch: 100 } }, {}, at),
    false,
  );
  assert.throws(() => FilterSchema.parse({ minimumMatch: 101 }));
});
test("MCP criteria substitution preserves JSON structure and only matching returned listings are persisted", () =>
  fixture(async (store) => {
    store.put("settings", { ...store.settings(), cloudConsent: true });
    const search = {
      name: "Custom",
      sources: [],
      countries: ["Australia"],
      roles: ["Lecturer"],
      keywords: 'speech "AI"',
      strategy: "sources",
      filters: { institutions: "Example" },
      mcpTools: [
        {
          connectorId: "mcp-fixture",
          tool: "search_jobs",
          arguments: {
            query: "{{keywords}}",
            locations: ["{{countries}}"],
            roles: "{{roles}}",
            count: 5,
          },
        },
      ],
    };
    assert.deepEqual(expandArguments(search.mcpTools[0].arguments, search), {
      query: 'speech "AI"',
      locations: ["Australia"],
      roles: "Lecturer",
      count: 5,
    });
    store.put("connectors", { id: "mcp-fixture", name: "Fixture" });
    const d = new Discovery(store, {
      run: async () => {
        throw new Error("Public-only mode must not invoke AI");
      },
    });
    const calls = [];
    d.import = async (url, _signal, _task, options) => {
      assert.equal(options.persist, false);
      assert.equal(options.providerResearch, false);
      return {
        ...vacancy(),
        url,
        institution: url.endsWith("bad")
          ? "Other Institute"
          : "Example University",
      };
    };
    const connectors = {
      run: async (_id, _tool, args, reader, _task, signal) => {
        calls.push(args);
        const a = await reader.import("https://example.edu/good", signal),
          b = await reader.import("https://example.edu/bad", signal);
        assert.ok(a);
        assert.equal(b, null);
        return { jobIds: [a.id] };
      },
    };
    const result = await runSearch(
      { store, discovery: d, connectors },
      search,
      () => {},
      new AbortController().signal,
    );
    assert.equal(result.added, 1);
    assert.equal(store.list("jobs").length, 1);
    assert.equal(calls[0].query, 'speech "AI"');
  }));
test("saved provider/model overrides are scoped to each search without changing global preferences", () =>
  fixture(async (store) => {
    store.put("settings", { ...store.settings(), cloudConsent: true });
    let received;
    const d = {
      providers: {
        run: async (_prompt, options) => ((received = options), "fixture"),
      },
      search: async function (search) {
        assert.equal(search.providerResearch, true);
        await this.providers.run("task", { workflow: "discovery" });
        return { jobIds: [], added: 0, updated: 0, message: "checked" };
      },
    };
    const settings = store.settings();
    await runSearch(
      { store, discovery: d, connectors: {} },
      {
        sources: ["jobsac"],
        countries: ["Australia"],
        roles: ["Lecturer"],
        keywords: "AI",
        strategy: "hybrid",
        aiProvider: "antigravity",
        aiModel: "chosen-model",
      },
      () => {},
      new AbortController().signal,
    );
    assert.equal(received.provider, "antigravity");
    assert.equal(received.model, "chosen-model");
    assert.deepEqual(store.settings(), settings);
  }));
function seed(store, root) {
  const job = vacancy();
  store.put("jobs", job);
  store.put("profile", {
    id: "main",
    verified: true,
    data: {
      personal: { name: "Candidate", summary: "Teaching speech AI" },
      education: [],
      experience: [],
    },
  });
  const file = path.join(root, "cv.pdf");
  fs.writeFileSync(file, "fixture");
  store.put("packages", {
    id: "pkg",
    jobId: job.id,
    status: "ready",
    version: 1,
    name: "Legacy date-only name",
    documents: [
      {
        id: "cv",
        type: "Academic CV",
        reviewed: true,
        pdf: file,
        content: {
          sections: [{ heading: "Research", text: "REVIEWED EVIDENCE" }],
        },
      },
      {
        id: "draft",
        type: "Teaching statement",
        reviewed: false,
        content: { sections: [{ text: "UNREVIEWED SECRET" }] },
      },
    ],
    attachments: [],
  });
  store.put("applications", {
    id: "app",
    jobId: job.id,
    packageId: "pkg",
    snapshot: { url: "https://example.edu/apply", fields: [] },
  });
}
test("application context binds the exact listing/package, excludes unreviewed text and detects changed selections", () =>
  fixture((store, root) => {
    seed(store, root);
    const context = applicationContext(store, "app"),
      text = JSON.stringify(context);
    assert.equal(
      context.package.name,
      "Example University - Lecturer in Speech AI",
    );
    assert.ok(text.includes("Completed PhD"));
    assert.ok(text.includes("REVIEWED EVIDENCE"));
    assert.ok(!text.includes("UNREVIEWED SECRET"));
    assert.equal(context.listing.requiredDocuments.length, 2);
    store.put("jobs", {
      ...store.getJob("job"),
      eligibility: "Changed requirements",
    });
    assert.throws(
      () => assertContext(store, "app", context.fingerprint),
      /changed/,
    );
    store.put("packages", {
      ...store.get("packages", "pkg"),
      jobId: "another-job",
    });
    assert.throws(() => applicationContext(store, "app"), /exact listing/);
    assert.equal(
      preferredPackage(
        [
          { id: "other", jobId: "other", status: "ready" },
          {
            id: "draft",
            jobId: "job",
            status: "draft",
            createdAt: "2026-11-17",
          },
          {
            id: "ready",
            jobId: "job",
            status: "ready",
            createdAt: "2026-11-16",
          },
        ],
        "job",
      ).id,
      "ready",
    );
  }));
test("browser agent, portal answer suggestions and native handoff receive the selected listing and matching package", () =>
  fixture(async (store, root) => {
    seed(store, root);
    const app = store.get("applications", "app"),
      prompts = [];
    const browser = new Browser(store, {
      run: async (prompt) => {
        prompts.push(prompt);
        return JSON.stringify({ answers: [], questions: [] });
      },
    });
    browser.inspect = async () => app;
    await browser.suggest("app");
    assert.ok(prompts[0].includes(vacancy().eligibility));
    assert.ok(prompts[0].includes("Teaching statement"));
    const providers = {
      run: async (prompt, options) => {
        prompts.push(prompt);
        await options.tools.execute(options.tools.tools[0].name, {
          action: "inspect",
        });
        return "Inspected application";
      },
      nativeBrowser: async (prompt) => (
        prompts.push(prompt),
        { message: "handoff" }
      ),
    };
    const controls = new ApplicationBrowser(browser, store, providers);
    controls.inspect = async () => ({
      manualPage: false,
      snapshot: { url: app.snapshot.url },
      snapshotHash: "fixture",
    });
    controls.action = async () => ({ ok: true });
    await controls.agent(
      "app",
      "Inspect and fill",
      () => {},
      new AbortController().signal,
    );
    await controls.native("app", "Inspect");
    for (const prompt of prompts) {
      assert.ok(prompt.includes("Example University"));
      assert.ok(prompt.includes("Completed PhD"));
      assert.ok(prompt.includes("REVIEWED EVIDENCE"));
      assert.ok(!prompt.includes("UNREVIEWED SECRET"));
    }
    providers.run = async (_prompt, options) => {
      store.put("packages", { ...store.get("packages", "pkg"), version: 2 });
      await options.tools.execute(options.tools.tools[0].name, {
        action: "inspect",
      });
      return "invalid";
    };
    await assert.rejects(
      controls.agent("app", "Inspect", () => {}, new AbortController().signal),
      /changed/,
    );
    providers.run = async (_prompt, options) => {
      await options.tools.execute(options.tools.tools[0].name, {
        action: "inspect",
      });
      store.put("packages", { ...store.get("packages", "pkg"), version: 3 });
      return "late stale report";
    };
    await assert.rejects(
      controls.agent("app", "Inspect", () => {}, new AbortController().signal),
      /changed/,
    );
  }));
