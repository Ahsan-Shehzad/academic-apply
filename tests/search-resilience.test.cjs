const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Store } = require("../desktop/store.cjs"),
  { Tasks } = require("../desktop/tasks.cjs"),
  { taskSummary } = require("../desktop/task-summary.cjs"),
  { Discovery, robotsAllowed } = require("../desktop/discovery.cjs"),
  { runSearch } = require("../desktop/search-runner.cjs"),
  { defaultSearch } = require("../desktop/core.cjs"),
  { parseResearchResult } = require("../desktop/vacancy-research.cjs"),
  { accessIssue, requestWithRetry } = require("../desktop/source-access.cjs");
async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-resilience-")),
    store = await Store.open(root);
  try {
    await run(store);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const job = (url = "https://example.edu/jobs/lecturer") => ({
  title: "Lecturer in Speech AI",
  institution: "Example University",
  country: "Netherlands",
  url,
  description:
    "Research and teach speech AI and natural language processing. A doctorate and relevant research and teaching experience are required. Submit an academic CV, cover letter and research statement.",
  deadline: "2099-12-31",
  sources: [
    {
      url,
      evidence: "Research and teach speech AI and natural language processing.",
    },
  ],
});
test("temporary source failures retry once, but 403 and cancellation never retry", async () => {
  let calls = 0,
    waits = 0;
  const signal = new AbortController().signal,
    wait = async () => {
      waits++;
    };
  const response = await requestWithRetry(
    "https://example.edu",
    { signal },
    async () => new Response("", { status: ++calls === 1 ? 503 : 200 }),
    wait,
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal(waits, 1);
  calls = 0;
  await requestWithRetry(
    "https://example.edu",
    { signal },
    async () => {
      calls++;
      return new Response("", { status: 403 });
    },
    wait,
  );
  assert.equal(calls, 1);
  calls = 0;
  const deferred = await requestWithRetry(
    "https://example.edu",
    { signal },
    async () => {
      calls++;
      return new Response("", {
        status: 429,
        headers: { "Retry-After": "120" },
      });
    },
    wait,
  );
  assert.equal(deferred.status, 429);
  assert.equal(
    calls,
    1,
    "Long server retry windows must be deferred rather than shortened",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    requestWithRetry(
      "https://example.edu",
      { signal: controller.signal },
      async () => {
        throw new Error("must not request");
      },
      wait,
    ),
    /abort/i,
  );
});
test("access failures distinguish restrictions, human verification, setup and transient errors", () => {
  assert.equal(
    accessIssue(new Error("Source returned HTTP 403")).status,
    "needs_browser",
  );
  assert.equal(
    accessIssue(new Error("Automated access is disallowed")).status,
    "restricted",
  );
  assert.equal(
    accessIssue(new Error("Add employer board identifiers first")).status,
    "configuration_required",
  );
  assert.equal(
    accessIssue(new Error("Cannot check source crawl rules: fetch failed"))
      .status,
    "temporary_error",
  );
  assert.equal(accessIssue(new Error("HTTP 429")).status, "temporary_error");
});
test("robots groups honor consecutive user agents, specific groups and allow precedence", () => {
  assert.equal(
    robotsAllowed(
      "User-agent: *\nDisallow: /\nUser-agent: AcademicApply\nAllow: /jobs\nDisallow: /private",
      "/jobs/123",
    ),
    true,
  );
  assert.equal(
    robotsAllowed(
      "User-agent: OtherBot\nUser-agent: *\nDisallow: /jobs",
      "/jobs/123",
    ),
    false,
  );
  assert.equal(
    robotsAllowed(
      "User-agent: *\nDisallow: /jobs\nAllow: /jobs/public",
      "/jobs/public/123",
    ),
    true,
  );
  assert.equal(
    robotsAllowed("User-agent: *\nDisallow: /jobs$", "/jobs/123"),
    true,
  );
});
test("one short evidence excerpt or invalid candidate does not discard valid researched vacancies", () => {
  const good = job(),
    logs = [];
  good.sources.push({ url: good.url, evidence: "short" });
  const parsed = parseResearchResult(
    {
      jobs: [
        good,
        {
          ...job("https://example.edu/jobs/bad"),
          sources: [{ url: good.url, evidence: "short" }],
        },
      ],
    },
    (u) => logs.push(u),
  );
  assert.equal(parsed.jobs.length, 1);
  assert.equal(parsed.jobs[0].sources.length, 1);
  assert.equal(logs.length, 1);
  assert.throws(() => parseResearchResult({ jobs: "invalid" }), /jobs array/);
});
test("search totals count each saved listing once across public and MCP results", () =>
  fixture(async (store) => {
    const discovery = new Discovery(store, {}),
      saved = discovery.save(job(), "Fixture").job;
    discovery.search = async () => ({
      jobIds: [saved.id, saved.id],
      added: 0,
      updated: 2,
      failed: 0,
      sourcesChecked: 1,
    });
    discovery.import = async () => job();
    const connectors = {
      run: async (_id, _tool, _args, reader, _task, signal) => {
        await reader.import(saved.url, signal);
        return { jobIds: [saved.id], failed: 0 };
      },
    };
    const r = await runSearch(
      { store, discovery, connectors },
      {
        ...defaultSearch(),
        countries: ["Netherlands"],
        sources: ["academictransfer"],
        strategy: "sources",
        mcpTools: [{ connectorId: "fixture", tool: "search", arguments: {} }],
      },
      () => {},
      new AbortController().signal,
    );
    assert.equal(r.jobIds.length, 1);
    assert.equal(r.added, 0);
    assert.equal(r.updated, 1);
  }));
test("unreadable detail pages reach provider recovery and duplicate results do not consume its budget", () =>
  fixture(async (store) => {
    store.put("settings", { ...store.settings(), cloudConsent: true });
    const discovery = new Discovery(store, {}),
      search = {
        ...defaultSearch(),
        countries: ["Netherlands"],
        sources: ["academictransfer"],
        maxResults: 5,
      };
    discovery.fetchPage = async (url) => {
      if (url.includes("/jobs/123/")) throw new Error("HTTP 403");
      return {
        url,
        html: '<a href="/en/jobs/123/lecturer">Lecturer in Speech AI</a>',
      };
    };
    let calls = 0;
    discovery.research = async () => {
      calls++;
      return [job(), job()];
    };
    const result = await discovery.search(
      search,
      () => {},
      new AbortController().signal,
    );
    assert.equal(calls, 1);
    assert.equal(result.added, 1);
    assert.equal(result.updated, 0);
    assert.equal(result.recoveredCount, 1);
    assert.equal(result.sourceReport[0].status, "partial");
    assert.equal(result.sourceReport[0].recovery, "attempted");
  }));
test("blocked sources retain actionable results, use cooldown and allow explicit connector recheck", () =>
  fixture(async (store) => {
    const discovery = new Discovery(store, {}),
      search = {
        ...defaultSearch(),
        countries: ["Netherlands"],
        sources: ["academictransfer"],
        providerResearch: false,
      };
    let calls = 0;
    discovery.fetchPage = async () => {
      calls++;
      throw new Error("Source returned HTTP 403");
    };
    const first = await discovery.search(
      search,
      () => {},
      new AbortController().signal,
    );
    const second = await discovery.search(
      search,
      () => {},
      new AbortController().signal,
    );
    assert.equal(calls, 1);
    assert.equal(first.sourceReport[0].status, "needs_browser");
    assert.equal(second.sourceReport[0].statusCode, 403);
    assert.match(second.sourceReport[0].message, /recent access result/);
    const { Connectors } = require("../desktop/connectors.cjs"),
      connector = new Connectors(store, {
        fetchPage: async (url) => {
          calls++;
          return {
            url,
            html: '<a href="/en/jobs/123/lecturer">Lecturer in Speech AI</a>',
          };
        },
      });
    await connector.test("academictransfer");
    assert.equal(calls, 2);
    assert.equal(
      store.get("sources", "academictransfer").nextRetryAt,
      undefined,
    );
  }));
test("completed and failed tasks persist readable summaries and package coverage", () =>
  fixture(async (store) => {
    const tasks = new Tasks(store),
      t = tasks.start("search-once", "Fixture search", async () => ({
        jobIds: [],
        added: 0,
        updated: 0,
        sourcesChecked: 1,
        failed: 1,
        sourceReport: [
          { id: "one", name: "One", status: "needs_browser", statusCode: 403 },
        ],
        message: "No listings saved.",
      }));
    await tasks.idle();
    let record = store.get("tasks", t.id);
    assert.equal(record.summary.title, "Job search summary");
    assert.equal(
      record.summary.metrics.find(
        (m) => m.label === "Sources needing attention",
      ).value,
      1,
    );
    assert.match(record.summary.nextStep, /Broaden/);
    const failed = tasks.start(
      "documents",
      "Prepare package",
      async (update) => {
        update({ packageId: "pkg" });
        store.put("packages", {
          id: "pkg",
          documents: [{}],
          attachments: [{}, {}],
          missingRequirements: ["Transcript"],
        });
        throw new Error("Provider unavailable");
      },
    );
    await tasks.idle();
    record = store.get("tasks", failed.id);
    assert.equal(record.summary.outcome, "failed");
    assert.equal(
      record.summary.metrics.find((m) => m.label === "Supporting files").value,
      2,
    );
    assert.equal(record.summary.message, "Provider unavailable");
    assert.equal(
      taskSummary({
        kind: "browser",
        status: "completed",
        result: { actions: 4 },
      }).metrics[0].value,
      4,
    );
  }));
