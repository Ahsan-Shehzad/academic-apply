const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Store } = require("../desktop/store.cjs"),
  { Discovery, extractListing } = require("../desktop/discovery.cjs"),
  { Connectors } = require("../desktop/connectors.cjs"),
  {
    SOURCES,
    searchUrl,
    sourceMatches,
  } = require("../desktop/source-catalog.cjs"),
  { removeListings } = require("../desktop/job-management.cjs"),
  { readBoards, endpoint } = require("../desktop/employer-feeds.cjs");
async function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-manage-")),
    store = await Store.open(root);
  try {
    await run(store);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test("source catalog has unique identifiers, encoded search routes, guides and country eligibility", () => {
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length);
  for (const source of SOURCES) {
    const url = new URL(
      searchUrl(source, { query: "speech & NLP", countries: ["Australia"] }),
    );
    assert.equal(url.protocol, "https:");
    assert.ok(!url.href.includes("{q}"));
    assert.equal(new URL(source.guideUrl).protocol, "https:");
    assert.ok(source.setupSteps.length > 30);
  }
  for (const id of [
    "linkedin",
    "indeed",
    "seek",
    "interfolio",
    "greenhouse",
    "lever",
    "ashby",
    "bayt",
    "academictransfer",
    "cv_ee",
  ])
    assert.ok(SOURCES.some((s) => s.id === id));
  assert.equal(
    sourceMatches(
      SOURCES.find((s) => s.id === "cv_ee"),
      { countries: ["Australia"] },
    ),
    false,
  );
  assert.ok(
    searchUrl(
      SOURCES.find((s) => s.id === "indeed"),
      { query: "speech & NLP", countries: ["Australia"] },
    ).includes("q=speech%20%26%20NLP"),
  );
});
test("personal ratings, notes, pins and shortlist survive refreshed source records", () =>
  fixture((store) => {
    const d = new Discovery(store, {}),
      job = {
        title: "Lecturer in AI",
        institution: "Test University",
        country: "Australia",
        url: "https://example.edu/job/123",
        description: "AI teaching",
      };
    const first = d.save(job).job;
    store.put("jobs", {
      ...first,
      personalRating: 5,
      personalNotes: "My first choice",
      pinned: true,
      status: "shortlisted",
    });
    const result = d.save({
      ...job,
      description: "Updated",
      personalRating: 1,
      pinned: false,
      personalNotes: "untrusted",
    }).job;
    assert.equal(result.id, first.id);
    assert.equal(result.personalRating, 5);
    assert.equal(result.personalNotes, "My first choice");
    assert.equal(result.pinned, true);
    assert.equal(result.status, "shortlisted");
  }));
test("delete/reset remove active listings atomically, back up data and retain linked application context", () =>
  fixture((store) => {
    for (const id of ["a", "b", "c"])
      store.put("jobs", { id, title: "Lecturer " + id, institution: "Test" });
    store.put("packages", { id: "p", jobId: "a", path: "preserve-file" });
    store.put("applications", { id: "app", jobId: "a" });
    store.put("tasks", { id: "running", kind: "import", status: "running" });
    assert.throws(() => removeListings(store, ["a"]), /cancel/);
    assert.equal(store.list("jobs").length, 3);
    store.remove("tasks", "running");
    assert.equal(removeListings(store, ["a"]).removed, 1);
    assert.equal(store.get("jobs", "a"), null);
    assert.equal(store.getJob("a").title, "Lecturer a");
    assert.equal(store.get("packages", "p").path, "preserve-file");
    assert.equal(removeListings(store, null).removed, 2);
    assert.equal(store.list("jobs").length, 0);
    assert.equal(store.list("jobHistory").length, 1);
    assert.ok(fs.readdirSync(path.join(store.root, "backups")).length);
    assert.throws(
      () =>
        store.transaction(() => {
          store.put("jobs", { id: "rollback" });
          throw new Error("rollback");
        }),
      /rollback/,
    );
    assert.equal(store.get("jobs", "rollback"), null);
  }));
test("catalog migration preserves existing disabled sources and installs the expanded catalog once", () =>
  fixture((store) => {
    store.put("metadata", { id: "connectors-v1" });
    store.put("connectors", { id: "seek", enabled: false, type: "bundled" });
    const c = new Connectors(store);
    assert.equal(c.catalog().length, SOURCES.length);
    assert.equal(c.isEnabled("seek"), false);
    const search = store.list("searches")[0];
    assert.ok(search.sources.includes("interfolio"));
    store.put("searches", { ...search, sources: ["seek"] });
    new Connectors(store);
    assert.deepEqual(store.get("searches", search.id).sources, ["seek"]);
  }));
test("documented employer feeds parse all three formats and reject unsafe identifiers", async () => {
  for (const provider of ["greenhouse", "lever", "ashby"]) {
    assert.throws(() => endpoint(provider, "../evil"), /identifier/);
    const row = {
      title: "Lecturer in NLP",
      text: "Lecturer in NLP",
      absolute_url: "https://example.edu/job/1",
      hostedUrl: "https://example.edu/job/1",
      jobUrl: "https://example.edu/job/1",
      content: "Natural language processing",
      location: { name: "Australia" },
    };
    const feed = await readBoards(provider, ["university"], async (url) => ({
      html: JSON.stringify(provider === "lever" ? [row] : { jobs: [row] }),
    }));
    assert.equal(feed.jobs.length, 1);
    assert.equal(
      extractListing(feed.jobs[0].html, feed.jobs[0].url, {
        base: "https://example.edu",
        kind: "board",
      }).title,
      "Lecturer in NLP",
    );
  }
});
test("batch tests finish every connector and distinguish manual, setup, unreadable and real vacancy access", () =>
  fixture(async (store) => {
    const c = new Connectors(store, {
      fetchPage: async () => ({
        url: "https://example.edu",
        html: '<a href="/job/123">Lecturer in Artificial Intelligence</a>',
      }),
    });
    const result = await c.testAll(() => {}, new AbortController().signal);
    assert.equal(result.results.length, SOURCES.length);
    assert.equal(
      result.results.find((r) => r.connectorId === "linkedin").status,
      "manual",
    );
    assert.equal(
      result.results.find((r) => r.connectorId === "greenhouse").status,
      "configuration_required",
    );
    assert.equal(
      result.results.find((r) => r.connectorId === "indeed").status,
      "available",
    );
    c.configureBoards("greenhouse", ["university"]);
    assert.deepEqual(store.get("connectors", "greenhouse").boards, [
      "university",
    ]);
  }));

test("discovery uses provider query templates and configured public APIs, saving all results centrally", () =>
  fixture(async (store) => {
    const c = new Connectors(store, {
      fetchApi: async () => ({
        html: JSON.stringify({
          jobs: [
            {
              title: "Lecturer in Speech AI",
              absolute_url: "https://example.edu/job/api",
              content: "Research and teaching in speech AI in Australia",
              location: { name: "Australia" },
            },
          ],
        }),
      }),
    });
    c.configureBoards("greenhouse", ["fixture-university"]);
    const d = new Discovery(store, {}, c),
      requests = [];
    d.fetchPage = async (url) => {
      requests.push(url);
      return {
        url,
        html: url.includes("/job/test")
          ? '<script type="application/ld+json">' +
            JSON.stringify({
              "@type": "JobPosting",
              title: "Lecturer in NLP",
              description: "Teaching natural language processing in Australia",
              hiringOrganization: { name: "Test University" },
              jobLocation: { address: { addressCountry: "AU" } },
            }) +
            "</script>"
          : '<a href="/job/test">Lecturer in Natural Language Processing</a>',
      };
    };
    const result = await d.search(
      {
        id: "fixture",
        sources: ["indeed", "greenhouse"],
        countries: ["Australia"],
        roles: ["Lecturer"],
        keywords: "speech & NLP",
      },
      () => {},
      new AbortController().signal,
    );
    assert.ok(
      requests.some(
        (url) =>
          url.includes("q=speech%20%26%20NLP") && url.includes("l=Australia"),
      ),
    );
    assert.equal(result.sourcesChecked, 2);
    assert.equal(result.added, 2);
    assert.equal(store.list("jobs").length, 2);
    assert.ok(store.list("jobs").every((j) => j.personalRating === 0));
  }));
