const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { Store } = require("../desktop/store.cjs"),
  { Discovery } = require("../desktop/discovery.cjs"),
  {
    searchPlan,
    searchPreview,
    fairCountries,
  } = require("../desktop/search-plan.cjs"),
  {
    WebDiscovery,
    parseLinks,
    publicLink,
  } = require("../desktop/web-discovery.cjs"),
  { runSearch } = require("../desktop/search-runner.cjs"),
  { roleMatches } = require("../desktop/search-intelligence.cjs");
const search = (patch = {}) => ({
  name: "Fixture",
  countries: ["Netherlands"],
  roles: ["Lecturer"],
  keywords: "speech AI",
  sources: [],
  depth: "quick",
  browserMode: "http",
  strategy: "ai",
  filters: { includeUnknownCountry: true, includeUnknownDates: true },
  ...patch,
});
const body =
  "Teach and research computer science, speech AI and natural language processing. Essential qualifications include a PhD in computer science and university teaching experience. Submit an academic CV, a teaching statement, degree certificates and academic transcripts. Applications close on the advertised deadline. This is a full-time academic role with research and teaching duties.";
const title = "Lecturer in Speech AI";
const job = (id = "one", patch = {}) => ({
  title,
  institution: "Example University",
  country: "Netherlands",
  url: "https://example.edu/job/" + id,
  applicationUrl: "https://example.edu/apply/" + id,
  description: body,
  eligibility:
    "A PhD in computer science and university teaching experience are essential.",
  requiredDocuments: [
    "Academic CV",
    "Teaching statement",
    "Degree certificates",
    "Academic transcripts",
  ],
  deadline: "2099-12-31",
  deadlineText: "2099-12-31",
  ...patch,
});
function page(url, patch = {}) {
  const j = job(url.split("/").pop(), patch);
  return {
    url,
    html:
      "<h1>" +
      j.title +
      '</h1><script type="application/ld+json">' +
      JSON.stringify({
        "@type": "JobPosting",
        title: j.title,
        hiringOrganization: { name: j.institution },
        jobLocation: {
          address: {
            addressCountry: j.country === "Netherlands" ? "NL" : j.country,
          },
        },
        description: j.description,
        validThrough: j.deadline,
      }) +
      '</script><a href="' +
      j.applicationUrl +
      '">Apply now</a>',
  };
}
const link = (q, id = "one", patch = {}) => ({
  queryId: q.id,
  url: "https://example.edu/job/" + id,
  title,
  institution: "Example University",
  country: "Netherlands",
  snippet: "Research and teach speech AI with a PhD in computing.",
  evidenceUrl: "https://example.edu/job/" + id,
  alternateUrls: [],
  ...patch,
});
function fakeProvider(make) {
  return {
    run: async (prompt, options) => {
      assert.equal(options.researchMode, "links");
      assert.equal(options.webSearch, true);
      const batch = JSON.parse(prompt.split("Query data:\n")[1]);
      options.onWebActivity?.({
        type: "search",
        queries: batch.map((q) => q.query),
        stage: "completed",
      });
      return JSON.stringify({
        queries: batch.map((q) => ({
          id: q.id,
          status: "searched",
          note: "Fixture search completed",
        })),
        candidates: make(batch),
      });
    },
  };
}
async function fixture(work) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-web-")),
    store = await Store.open(root);
  store.put("settings", { ...store.settings(), cloudConsent: true });
  try {
    await work(store);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test("query plans cover countries fairly, broaden faculty searches, and retain specialist and local role searches", () => {
  const plan = searchPlan(
    search({
      countries: ["Germany", "Australia", "Qatar", "Netherlands"],
      roles: ["Lecturer", "Assistant Professor", "Postdoctoral"],
      keywords: "speech AI, cognitive impairment",
    }),
  );
  assert.deepEqual(
    plan.queries.slice(0, 4).map((q) => q.country),
    fairCountries(["Australia", "Germany", "Netherlands", "Qatar"].sort()),
  );
  assert.ok(plan.queries[0].query.includes("computer science"));
  assert.ok(
    plan.queries.some(
      (q) =>
        q.kind === "specialist" && q.query.includes("cognitive impairment"),
    ),
  );
  assert.ok(
    plan.queries.some(
      (q) =>
        q.kind === "local titles" && q.query.includes("universitair docent"),
    ),
  );
  for (const alias of [
    "Universitair docent",
    "Maître de conférences",
    "Biträdande lektor",
    "Juniorprofessur",
  ])
    assert.ok(roleMatches(alias, ["Assistant Professor"]), alias);
});
test("coverage fingerprints survive ordering, one-off ids and depth changes while changed criteria get a new plan", () => {
  const a = search({
      id: "first",
      countries: ["Germany", "Netherlands"],
      filters: { minimumMatch: 0, officialOnly: false },
    }),
    b = {
      ...a,
      id: "second",
      depth: "thorough",
      countries: ["Netherlands", "Germany"],
      filters: { officialOnly: false, minimumMatch: 0 },
    };
  assert.equal(searchPlan(a).fingerprint, searchPlan(b).fingerprint);
  assert.notEqual(
    searchPlan(a).fingerprint,
    searchPlan({ ...b, keywords: "robotics" }).fingerprint,
  );
  assert.ok(searchPlan(b).budget.queries > searchPlan(a).budget.queries);
});
test("candidate discovery retains short snippets and more than six links while rejecting unsafe URLs and foreign query ids", () => {
  const q = { id: "one" };
  const links = Array.from({ length: 30 }, (_, i) =>
    link(q, String(i), {
      snippet: i ? "Ad" : "",
      title: i ? "Lecturer in AI" : "Postdoc",
    }),
  );
  links.push(
    link({ id: "invented" }, "foreign"),
    link(q, "private", { url: "https://127.0.0.1/private" }),
  );
  const found = parseLinks(
    { queries: [{ id: q.id, status: "searched" }], candidates: links },
    [q],
  );
  assert.equal(found.candidates.length, 30);
  for (const u of [
    "http://example.edu/job",
    "https://localhost/job",
    "https://10.0.0.1/job",
    "https://user:password@example.edu/job",
    "https://example.edu/login",
  ])
    assert.equal(publicLink(u), null);
});
test("URL discovery produces full source-verified records including required documents, eligibility and application links", () =>
  fixture(async (store) => {
    const providers = fakeProvider((batch) => [
        link(batch[0], "one"),
        link(batch[0], "two"),
      ]),
      discovery = new Discovery(store, providers);
    discovery.fetchPage = async (url) => page(url);
    const result = await new WebDiscovery(store, discovery, providers).run(
      search(),
      () => {},
      new AbortController().signal,
    );
    assert.equal(result.fullListings, 2);
    assert.ok(result.observedSearchActions > 0);
    const jobs = store.list("jobs");
    assert.equal(jobs.length, 2); // Same title/institution, distinct posting URLs.
    for (const j of jobs) {
      assert.ok(j.description.length > 200);
      assert.match(j.eligibility, /PhD/);
      assert.ok(j.requiredDocuments.includes("Degree certificates"));
      assert.ok(j.requiredDocuments.includes("Teaching statement"));
      assert.match(j.applicationUrl, /\/apply\//);
      assert.equal(j.verification.status, "source_verified");
    }
    assert.ok(
      store
        .list("jobCandidates")
        .every((c) => c.status === "imported" && c.provenance.length),
    );
  }));
test("blocked portals recover full official employer equivalents without claiming independent verification", () =>
  fixture(async (store) => {
    const providers = fakeProvider((batch) => [link(batch[0])]),
      discovery = new Discovery(store, providers);
    let rendererCalls = 0;
    discovery.fetchPage = async () => {
      throw new Error("Source returned HTTP 403");
    };
    discovery.renderPage = async () => {
      rendererCalls++;
      throw new Error("Must not bypass a 403");
    };
    discovery.research = async () => [
      job("official", {
        verification: { status: "ai_reported" },
        retrieval: {
          sources: [
            { url: "https://example.edu/job/official", evidence: body },
          ],
        },
      }),
    ];
    const result = await new WebDiscovery(store, discovery, providers).run(
      search({ browserMode: "auto" }),
      () => {},
      new AbortController().signal,
    );
    assert.equal(result.fullListings, 1);
    assert.equal(rendererCalls, 0);
    assert.equal(store.list("jobs")[0].verification.status, "ai_reported");
    assert.equal(store.list("jobCandidates")[0].status, "imported");
    assert.equal(result.recoveredCount, 1);
  }));
test("unreadable ads remain actionable and a detail-only pass imports them without issuing another broad query", () =>
  fixture(async (store) => {
    let broadCalls = 0;
    const base = fakeProvider((batch) => [link(batch[0])]),
      providers = {
        run: async (...args) => {
          broadCalls++;
          return base.run(...args);
        },
      },
      discovery = new Discovery(store, providers);
    discovery.fetchPage = async () => {
      throw new Error("HTTP 403");
    };
    discovery.research = async () => [];
    const engine = new WebDiscovery(store, discovery, providers),
      first = await engine.run(
        search(),
        () => {},
        new AbortController().signal,
      );
    assert.equal(first.fullListings, 0);
    assert.equal(first.pendingCandidates, 1);
    const before = broadCalls;
    discovery.fetchPage = async (url) => page(url);
    const second = await engine.run(
      search(),
      () => {},
      new AbortController().signal,
      { detailsOnly: true },
    );
    assert.equal(second.fullListings, 1);
    assert.equal(broadCalls, before);
    assert.equal(second.pendingCandidates, 0);
  }));
test("full-page reading excludes expired and wrong-country ads with retained reasons while broad faculty roles remain eligible", () =>
  fixture(async (store) => {
    const providers = fakeProvider((batch) =>
        ["expired", "abroad", "broad"].map((id) => link(batch[0], id)),
      ),
      discovery = new Discovery(store, providers);
    discovery.fetchPage = async (url) =>
      page(
        url,
        url.endsWith("expired")
          ? { deadline: "2000-01-01" }
          : url.endsWith("abroad")
            ? { country: "Australia" }
            : {
                title: "Lecturer in Speech AI",
                description: body.replaceAll(
                  "speech AI",
                  "software engineering",
                ),
              },
      );
    discovery.research = async () => [];
    const r = await new WebDiscovery(store, discovery, providers).run(
      search({ keywords: "cognitive impairment" }),
      () => {},
      new AbortController().signal,
    );
    assert.equal(r.fullListings, 1);
    assert.equal(r.excludedCandidates, 2);
    assert.ok(
      store
        .list("jobCandidates")
        .some((c) => /deadline has passed/.test(c.reason)),
    );
    assert.ok(
      store
        .list("jobCandidates")
        .some((c) => /selected countries/.test(c.reason)),
    );
  }));
test("a quick pass retains candidate overflow and does not repeatedly read the same blocked pages", () =>
  fixture(async (store) => {
    const providers = fakeProvider((batch) =>
        Array.from({ length: 50 }, (_, i) => link(batch[0], String(i))),
      ),
      discovery = new Discovery(store, providers),
      reads = new Set();
    discovery.fetchPage = async (url) => {
      assert.ok(
        !reads.has(url),
        "Same pending page read repeatedly in one pass",
      );
      reads.add(url);
      throw new Error("HTTP 403");
    };
    discovery.research = async () => [];
    const r = await new WebDiscovery(store, discovery, providers).run(
      search(),
      () => {},
      new AbortController().signal,
    );
    assert.equal(store.list("jobCandidates").length, 50);
    assert.equal(r.detailsAttempted, 24);
    assert.equal(r.pendingCandidates, 50);
    assert.equal(r.fullListings, 0);
  }));
test("subsequent saved or one-off runs resume remaining country/role/topic queries", () =>
  fixture(async (store) => {
    const seen = [],
      providers = fakeProvider((batch) => {
        seen.push(...batch.map((q) => q.id));
        return [];
      }),
      discovery = new Discovery(store, providers),
      criteria = search({
        countries: ["Germany", "Australia", "Qatar", "Netherlands"],
        roles: ["Lecturer", "Assistant Professor", "Postdoctoral"],
      });
    const first = await new WebDiscovery(store, discovery, providers).run(
      { ...criteria, id: "one" },
      () => {},
      new AbortController().signal,
    );
    const initial = [...seen];
    const preview = searchPreview(criteria, store);
    assert.equal(preview.previouslyCovered, 8);
    assert.ok(first.queriesRemaining > 0);
    await new WebDiscovery(store, discovery, providers).run(
      { ...criteria, id: "two" },
      () => {},
      new AbortController().signal,
    );
    assert.equal(seen.length, 16);
    assert.ok(seen.slice(8).every((id) => !initial.includes(id)));
  }));
test("cancellation retains discovered candidates and query coverage for resuming", () =>
  fixture(async (store) => {
    const controller = new AbortController(),
      providers = fakeProvider((batch) => [
        link(batch[0], "one"),
        link(batch[0], "two"),
      ]),
      discovery = new Discovery(store, providers);
    let partial;
    discovery.fetchPage = async () => {
      controller.abort();
      controller.signal.throwIfAborted();
    };
    await assert.rejects(
      new WebDiscovery(store, discovery, providers).run(
        search(),
        (p) => {
          if (p.partialResult) partial = p.partialResult;
        },
        controller.signal,
      ),
      /abort/i,
    );
    assert.equal(store.list("jobCandidates").length, 2);
    assert.ok(partial.candidateIds.length);
    assert.ok(store.list("searchCoverage")[0].completedQueryIds.length);
  }));
test("parallel detail reads respect the listing cap without persisting extra jobs", () =>
  fixture(async (store) => {
    const providers = fakeProvider((batch) =>
        Array.from({ length: 8 }, (_, i) => link(batch[0], String(i))),
      ),
      discovery = new Discovery(store, providers);
    discovery.fetchPage = async (url) => page(url);
    const r = await new WebDiscovery(store, discovery, providers).run(
      search({ maxResults: 1 }),
      () => {},
      new AbortController().signal,
    );
    assert.equal(r.fullListings, 1);
    assert.equal(store.list("jobs").length, 1);
    assert.equal(store.list("jobCandidates").length, 8);
  }));
test("JavaScript rendering supplements permitted short HTML pages and preserves full extracted facts", () =>
  fixture(async (store) => {
    let rendered = 0;
    const providers = fakeProvider((batch) => [link(batch[0])]),
      discovery = new Discovery(store, providers);
    discovery.fetchPage = async (url) => ({
      url,
      html: "<h1>Lecturer in Speech AI</h1><main>Loading</main>",
    });
    discovery.renderPage = async (url) => {
      rendered++;
      return { ...page(url), method: "headless_chrome" };
    };
    const r = await new WebDiscovery(store, discovery, providers).run(
      search({ browserMode: "auto" }),
      () => {},
      new AbortController().signal,
    );
    assert.equal(rendered, 1);
    assert.equal(r.fullListings, 1);
    assert.equal(store.list("jobs")[0].retrieval.method, "headless_chrome");
  }));
test("search-engine discovery runs without requiring any portal connector", () =>
  fixture(async (store) => {
    const providers = fakeProvider((batch) => [link(batch[0])]),
      discovery = new Discovery(store, providers);
    discovery.fetchPage = async (url) => page(url);
    const r = await runSearch(
      { store, discovery, connectors: {} },
      search({ strategy: "hybrid" }),
      () => {},
      new AbortController().signal,
    );
    assert.equal(r.fullListings, 1);
    assert.equal(r.sourceVerifiedListings, 1);
    assert.equal(r.sourcesChecked, 0);
    assert.ok(r.webSearchEnabled);
  }));

test("retained candidates resume by stored coverage key without issuing new queries", () =>
  fixture(async (store) => {
    const criteria = search(),
      plan = searchPlan(criteria),
      providers = {
        run: async () => {
          throw new Error("Broad search must not run");
        },
      },
      discovery = new Discovery(store, providers),
      engine = new WebDiscovery(store, discovery, providers);
    const oldKey = "previous-plan-fingerprint";
    store.put("searchCoverage", {
      id: oldKey,
      criteria,
      completedQueryIds: [],
      cycle: 1,
    });
    const candidate = engine.keepCandidate(
      link(plan.queries[0]),
      { ...plan, fingerprint: oldKey },
      plan.queries[0],
    );
    discovery.fetchPage = async (url) => page(url);
    const r = await engine.run(
      criteria,
      () => {},
      new AbortController().signal,
      { detailsOnly: true, searchKey: oldKey, ids: [candidate.id] },
    );
    assert.equal(r.queriesRequested, 0);
    assert.equal(r.fullListings, 1);
    assert.equal(r.searchKey, oldKey);
    assert.equal(store.get("jobCandidates", candidate.id).status, "imported");
  }));

test("full visible-page promotion works independently of a running search budget", () =>
  fixture(async (store) => {
    const criteria = search(),
      plan = searchPlan(criteria),
      engine = new WebDiscovery(store, new Discovery(store, {}));
    const candidate = engine.keepCandidate(
      link(plan.queries[0]),
      plan,
      plan.queries[0],
    );
    const id = engine.promote(candidate, job(), criteria, "visible_chrome");
    assert.ok(id);
    assert.equal(store.get("jobs", id).detailCoverage.fullTextRead, true);
  }));

test("permitted JavaScript placeholders without any title render before extraction", () =>
  fixture(async (store) => {
    const providers = fakeProvider((batch) => [link(batch[0])]),
      discovery = new Discovery(store, providers);
    discovery.fetchPage = async (url) => ({
      url,
      html: "<main>Loading</main>",
    });
    discovery.renderPage = async (url) => ({
      ...page(url),
      method: "headless_chrome",
    });
    const r = await new WebDiscovery(store, discovery, providers).run(
      search({ browserMode: "auto" }),
      () => {},
      new AbortController().signal,
    );
    assert.equal(r.fullListings, 1);
  }));

test("deadline extraction retains unambiguous dates and rejects missing years or ambiguous numeric dates", () => {
  const { deadlineValue, extractListing } = require("../desktop/discovery.cjs");
  assert.equal(deadlineValue("on 21st December 2099, at noon"), "2099-12-21");
  assert.equal(deadlineValue("December 21, 2099 (local time)"), "2099-12-21");
  assert.equal(
    deadlineValue("by 2099-12-21T23:00:00+01:00"),
    "2099-12-21T23:00:00+01:00",
  );
  for (const text of ["21 December", "12/11/2099", "2099-02-31", "Not stated"])
    assert.equal(deadlineValue(text), null, text);
  const j = extractListing(
    "<h1>Lecturer in AI</h1><main>Applications close on 21 December 2099, at noon. " +
      body +
      "</main>",
    "https://example.edu/job",
  );
  assert.equal(j.deadline, "2099-12-21");
  const unknown = extractListing(
    "<h1>Lecturer</h1><main>" + body + "</main>",
    "https://example.edu/job",
    { countries: ["Germany", "France"] },
  );
  assert.equal(unknown.country, "Unknown");
});

test("search progress wrappers preserve task identity for native provider logs and cancellation", () =>
  fixture(async (store) => {
    const base = fakeProvider((batch) => [link(batch[0])]),
      providers = {
        run: (prompt, options) => {
          assert.equal(options.taskId, "search-fixture-task");
          return base.run(prompt, options);
        },
      },
      discovery = new Discovery(store, providers),
      update = () => {};
    update.id = "search-fixture-task";
    discovery.fetchPage = async (url) => page(url);
    const r = await runSearch(
      { store, discovery, connectors: {} },
      search(),
      update,
      new AbortController().signal,
    );
    assert.equal(r.fullListings, 1);
  }));

test("complete ad extraction recognizes employer deadline wording and explicitly requested doctoral-thesis attachments", () => {
  const { extractListing } = require("../desktop/discovery.cjs"),
    { listingDetails } = require("../desktop/listing-details.cjs");
  for (const wording of [
    "Applying is possible up to and including: 11 December 2099",
    "Only applications received no later than December 11, 2099 can be considered",
  ]) {
    const j = extractListing(
      "<h1>Lecturer</h1><main>" +
        wording +
        ". Please attach the following additional documents: Curriculum vitae; Motivation letter; (Draft of) PhD Thesis; Contact information for two references. " +
        body +
        "</main>",
      "https://example.edu/job",
    );
    assert.equal(j.deadline, "2099-12-11");
    assert.ok(listingDetails(j).requiredDocuments.includes("Doctoral thesis"));
  }
  const { planFromJob } = require("../desktop/document-requirements.cjs");
  assert.ok(
    !planFromJob({
      description: "The successful applicant will supervise a doctoral thesis.",
    }).requirements.some((r) => r.label === "Doctoral thesis"),
  );
});
