const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
    BASE_ROLES,
    normalizeRoles,
    roleMatches,
    suggestKeywords,
    keywordQueries,
    keywordStep,
    searchTerms,
  } = require("../desktop/search-intelligence.cjs"),
  { suitable, Discovery } = require("../desktop/discovery.cjs"),
  { Store } = require("../desktop/store.cjs");
test("the original roles remain available and custom titles match the actual vacancy title", () => {
  assert.deepEqual(BASE_ROLES, [
    "Lecturer",
    "Assistant Professor",
    "Postdoctoral",
  ]);
  assert.deepEqual(
    normalizeRoles([
      "lecturer",
      "Lecturer",
      "Research Scientist",
      "research scientist",
    ]),
    ["Lecturer", "research scientist"],
  );
  assert.ok(
    roleMatches("Senior Research Scientist in Speech AI", [
      "Research Scientist",
    ]),
  );
  assert.ok(
    roleMatches("Senior Lecturer / Associate Professor", [
      "Associate Professor",
    ]),
  );
  assert.equal(
    roleMatches("Lecturer in Computing", ["Research Scientist"]),
    false,
  );
  assert.ok(roleMatches("Research Fellow in NLP", ["Postdoctoral"]));
  assert.ok(
    suitable(
      {
        title: "Professor of Linguistics",
        description: "Academic linguistics teaching.",
        country: "Australia",
      },
      { roles: ["Professor"], countries: ["Australia"], keywords: "" },
    ),
  );
});
test("keyword suggestions are grounded in profile research and selected roles without exposing contact or reference fields", () => {
  const profile = {
    personal: {
      summary:
        "Speech AI, natural language processing, cognitive impairment detection and interpretable graph neural networks. Machine learning and higher education teaching with curriculum design.",
      research_interests: ["multimodal learning"],
      private_information: { note: "robotics" },
    },
    skills: { groups: ["Python"] },
    references: [
      {
        name: "private-referee",
        email: "private@example.edu",
        relationship: "cybersecurity",
      },
    ],
  };
  const faculty = suggestKeywords(profile, ["Lecturer"]),
    research = suggestKeywords(profile, ["Research Scientist"]),
    engineer = suggestKeywords(profile, ["Research Engineer"]);
  for (const term of [
    "speech AI",
    "cognitive impairment",
    "natural language processing",
    "graph neural networks",
  ])
    assert.ok(faculty.recommended.includes(term), term);
  assert.ok(
    faculty.keywords.some((k) => k.term === "higher education teaching"),
  );
  assert.ok(
    !research.keywords.some((k) => k.term === "higher education teaching"),
  );
  assert.ok(
    engineer.keywords.some((k) => k.term === "applied machine learning"),
  );
  assert.ok(
    faculty.keywords.some((k) => k.term === "NLP" && k.kind === "related"),
  );
  const text = JSON.stringify(faculty);
  for (const secret of [
    "private-referee",
    "private@example.edu",
    "robotics",
    "cybersecurity",
  ])
    assert.ok(!text.includes(secret));
});
test("suggestions tolerate incomplete structured profiles and preserve manual research phrases", () => {
  assert.doesNotThrow(() =>
    suggestKeywords(
      {
        education: { unexpected: true },
        publications: { index: {} },
        experience: {},
        skills: null,
      },
      ["Lecturer"],
    ),
  );
  assert.equal(suggestKeywords(null, ["Research Fellow"]).hasProfile, false);
  const terms = suggestKeywords(
    { personal: { research_interests: ["Quantum material characterization"] } },
    ["Professor"],
  );
  assert.ok(terms.recommended.includes("Quantum material characterization"));
  assert.deepEqual(
    searchTerms({ keywords: " NLP, speech AI, nlp ", roles: ["Lecturer"] }),
    ["nlp", "speech AI"],
  );
});
test("keyword queries cover multiple selections with bounded source work and rotate remaining terms", () => {
  const search = {
    keywords: "speech AI, NLP, graph learning, interpretable AI",
    roles: ["Research Scientist"],
  };
  assert.deepEqual(keywordQueries(search, 0, 1), [
    "speech AI",
    "NLP",
    "graph learning",
  ]);
  assert.deepEqual(keywordQueries(search, 0, 1, 3), [
    "interpretable AI",
    "speech AI",
    "NLP",
  ]);
  assert.equal(keywordQueries(search, 0, 10).length, 1);
  assert.deepEqual(searchTerms({ keywords: "", roles: ["Senior Lecturer"] }), [
    "Senior Lecturer",
  ]);
});
test("public discovery uses selected custom roles and multiple keyword queries, including on later saved runs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-topic-search-")),
    store = await Store.open(root);
  try {
    const discovery = new Discovery(store, {
        run: async () => {
          throw new Error("Public-only fixture");
        },
      }),
      queries = [];
    discovery.fetchPage = async (url) => {
      queries.push(new URL(url).searchParams.get("q"));
      return {
        url,
        html: "<html><p>No vacancies on this fixture index</p></html>",
      };
    };
    const search = {
      id: "keywords",
      roles: ["Research Scientist"],
      keywords: "speech AI, NLP, graph learning, interpretable AI",
      countries: ["Netherlands"],
      sources: ["academictransfer"],
      providerResearch: false,
    };
    await discovery.search(search, () => {}, new AbortController().signal);
    assert.deepEqual(queries, ["speech AI", "NLP", "graph learning"]);
    queries.length = 0;
    await discovery.search(search, () => {}, new AbortController().signal);
    assert.deepEqual(queries, ["interpretable AI", "speech AI", "NLP"]);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
