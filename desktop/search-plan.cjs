"use strict";
const { COUNTRIES, hash } = require("./core.cjs");
const { splitKeywords } = require("./search-intelligence.cjs");
const { SOURCES, sourceMatches } = require("./source-catalog.cjs");
const SEARCH_BUDGETS = {
  quick: {
    queries: 8,
    candidates: 100,
    details: 24,
    recovery: 2,
    results: 100,
    minutes: 10,
  },
  balanced: {
    queries: 24,
    candidates: 350,
    details: 100,
    recovery: 12,
    results: 300,
    minutes: 25,
  },
  thorough: {
    queries: 80,
    candidates: 1500,
    details: 300,
    recovery: 40,
    results: 1000,
    minutes: 35,
  },
};
const quote = (value) =>
  '"' +
  String(value)
    .replace(/["\r\n]/g, " ")
    .trim() +
  '"';
function roleTerms(role) {
  if (/^lecturer$/i.test(role))
    return ["lecturer", "lectureship", '"teaching fellow"'];
  if (/^assistant professor$/i.test(role))
    return ['"assistant professor"', '"junior professor"', '"tenure track"'];
  if (/^postdoctoral$/i.test(role))
    return [
      "postdoctoral",
      "postdoc",
      '"research fellow"',
      '"research associate"',
    ];
  return [quote(role)];
}
function fairCountries(countries) {
  const groups = Object.values(COUNTRIES).map((group) =>
    group.filter((c) => countries.includes(c)),
  );
  const result = [];
  for (let i = 0; result.length < countries.length; i++) {
    let found = false;
    for (const group of groups)
      if (group[i]) {
        result.push(group[i]);
        found = true;
      }
    if (!found) break;
  }
  return result;
}
function searchPlan(search) {
  const countries = fairCountries([...new Set(search.countries || [])].sort());
  const roles = [...new Set(search.roles || [])].sort();
  const topics = splitKeywords(search.keywords).sort();
  const computing =
    /speech|cognitiv|dementia|alzheimer|natural language|\bNLP\b|machine learning|artificial intelligence|\bAI\b|graph learn|interpretab|multimodal/i.test(
      topics.join(" "),
    );
  const broad = computing
    ? '("computer science" OR computing OR "artificial intelligence" OR "machine learning")'
    : topics.length
      ? "(" + topics.slice(0, 4).map(quote).join(" OR ") + ")"
      : "";
  const allRoles =
    "(" + [...new Set(roles.flatMap(roleTerms))].join(" OR ") + ")";
  const queries = [],
    seen = new Set();
  const add = (country, role, area, query, kind) => {
    query = query.replace(/\s+/g, " ").trim();
    if (seen.has(query)) return;
    seen.add(query);
    queries.push({
      id: hash(query).slice(0, 24),
      country,
      role,
      area,
      query,
      kind,
    });
  };
  // Cover countries before spending the budget on narrower role/topic combinations.
  for (const country of countries)
    add(
      country,
      roles.join(" / "),
      broad,
      `${allRoles} ${broad} ${quote(country)} vacancies`,
      "country",
    );
  for (const role of roles)
    for (const country of countries)
      add(
        country,
        role,
        broad,
        `(${roleTerms(role).join(" OR ")}) ${broad} ${quote(country)} jobs`,
        "role",
      );
  for (const area of topics)
    for (const role of roles)
      for (const country of countries)
        add(
          country,
          role,
          area,
          `(${roleTerms(role).join(" OR ")}) ${quote(area)} ${quote(country)}`,
          "specialist",
        );
  const local = {
    Germany: ["Juniorprofessor", "wissenschaftlicher Mitarbeiter"],
    France: ["maître de conférences", "post-doctorant"],
    Netherlands: ["universitair docent", "postdoc"],
    Sweden: ["biträdande lektor", "postdoktor"],
    Norway: ["førsteamanuensis", "postdoktor"],
  };
  for (const country of countries)
    if (local[country])
      add(
        country,
        roles.join(" / "),
        broad,
        `(${local[country].map(quote).join(" OR ")}) ${broad} ${quote(country)}`,
        "local titles",
      );
  for (const country of countries)
    for (const source of SOURCES.filter(
      (s) =>
        (search.sources || []).includes(s.id) &&
        sourceMatches(s, { countries: [country] }),
    ).slice(0, 8)) {
      add(
        country,
        roles.join(" / "),
        broad,
        `site:${new URL(source.base).hostname} ${allRoles} ${broad} ${quote(country)}`,
        "portal",
      );
    }
  const fingerprint = hash({
    planVersion: 1,
    year: new Date().getUTCFullYear(),
    countries: [...countries].sort(),
    roles,
    topics,
    sources: [...(search.sources || [])].sort(),
    filters: Object.fromEntries(
      Object.entries(search.filters || {}).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    ),
  }).slice(0, 32);
  const depth = search.depth || "thorough";
  return {
    fingerprint,
    queries,
    budget: { ...SEARCH_BUDGETS[depth] },
    depth,
    countries,
    roles,
    topics,
  };
}
function searchPreview(search, store) {
  const plan = searchPlan(search),
    saved = store?.get("searchCoverage", plan.fingerprint);
  const done = new Set(saved?.completedQueryIds || []);
  const cycleComplete = done.size >= plan.queries.length;
  return {
    fingerprint: plan.fingerprint,
    totalQueries: plan.queries.length,
    previouslyCovered: cycleComplete ? 0 : done.size,
    queriesThisRun: Math.min(
      plan.budget.queries,
      plan.queries.length - (cycleComplete ? 0 : done.size),
    ),
    budget: plan.budget,
    depth: plan.depth,
    countries: plan.countries,
    examples: plan.queries.slice(0, 5),
  };
}
module.exports = {
  SEARCH_BUDGETS,
  searchPlan,
  searchPreview,
  roleTerms,
  fairCountries,
};
