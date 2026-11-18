"use strict";
const BASE_ROLES = ["Lecturer", "Assistant Professor", "Postdoctoral"];
const EXTRA_ROLES = [
  "Senior Lecturer",
  "Associate Professor",
  "Professor",
  "Research Fellow",
  "Senior Research Fellow",
  "Research Associate",
  "Research Assistant",
  "Research Scientist",
  "Research Engineer",
  "Teaching Fellow",
  "Assistant Lecturer",
  "Visiting Professor",
  "Machine Learning Engineer",
];
const normalize = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const unique = (values) => [
  ...new Map(
    values.map((v) => [normalize(v), String(v).trim()]).filter(([key]) => key),
  ).values(),
];
function normalizeRoles(values) {
  return unique(
    values.map(
      (v) => BASE_ROLES.find((r) => normalize(r) === normalize(v)) || v,
    ),
  );
}
function roleMatches(title, roles) {
  const text = normalize(title);
  return roles.some((role) => {
    const r = normalize(role);
    if (r === "postdoctoral")
      return /postdoc|post doc|research fellow|research associate/.test(text);
    if (r === "assistant professor")
      return /assistant professor|lecturer|junior professor|tenure track|førsteamanuensis/.test(
        text,
      );
    if (r === "lecturer")
      return /lecturer|lectureship|teaching fellow|instructor|docent/.test(
        text,
      );
    return r && ` ${text} `.includes(` ${r} `);
  });
}
function splitKeywords(value) {
  return unique(
    String(value || "")
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 120),
  ).slice(0, 40);
}
function keywordMatches(text, keywords) {
  const haystack = ` ${normalize(text)} `;
  return splitKeywords(keywords).some((term) =>
    haystack.includes(` ${normalize(term)} `),
  );
}
function searchTerms(search) {
  const topics = splitKeywords(search.keywords);
  return topics.length
    ? topics
    : unique(search.roles || []).slice(0, 10).length
      ? unique(search.roles).slice(0, 10)
      : ["academic research"];
}
function keywordQueries(search, index, sourceCount, offset = 0) {
  const terms = searchTerms(search),
    count = Math.min(
      3,
      Math.max(1, Math.ceil(terms.length / Math.max(1, sourceCount))),
    );
  return Array.from(
    { length: Math.min(count, terms.length) },
    (_, i) => terms[(offset + index * count + i) % terms.length],
  );
}
function keywordStep(search, sourceCount) {
  return keywordQueries(search, 0, sourceCount).length;
}
const CATALOG = [
  [
    "speech AI",
    /speech|spoken language/i,
    108,
    "Research area",
    ["speech processing", "automatic speech recognition", "ASR"],
  ],
  [
    "cognitive impairment",
    /cognitive impairment|alzheimer|dementia/i,
    106,
    "Research area",
    ["dementia", "digital biomarkers", "speech biomarkers"],
  ],
  [
    "natural language processing",
    /natural language|\bNLP\b|neurolinguist/i,
    99,
    "Research area",
    ["NLP", "language models"],
  ],
  [
    "graph neural networks",
    /graph neural|graph learn|brain.graph|brain connectiv/i,
    96,
    "Research method",
    ["GNN", "graph learning"],
  ],
  [
    "graph transformers",
    /graph transformer/i,
    95,
    "Research method",
    ["graph representation learning"],
  ],
  [
    "interpretable AI",
    /interpretab|explainab/i,
    94,
    "Research method",
    ["explainable AI", "XAI"],
  ],
  [
    "multimodal machine learning",
    /multimodal|multi.modal|multi.view/i,
    93,
    "Research method",
    ["multimodal learning", "multimodal AI"],
  ],
  [
    "machine learning",
    /machine learning|\bML\b/i,
    86,
    "Research method",
    ["deep learning"],
  ],
  [
    "artificial intelligence",
    /artificial intelligence|\bAI\b/i,
    80,
    "Research field",
    [],
  ],
  [
    "computer science",
    /computer science|computing|informatics/i,
    82,
    "Teaching / discipline",
    ["computing"],
  ],
  [
    "software engineering",
    /software engineering|software development/i,
    79,
    "Teaching / discipline",
    [],
  ],
  [
    "data science",
    /data science|data analytics|data mining/i,
    78,
    "Teaching / discipline",
    ["data analytics"],
  ],
  [
    "health informatics",
    /health informatics|medical informatics|healthcare/i,
    81,
    "Research area",
    ["medical AI"],
  ],
  [
    "computational neuroscience",
    /neuroscien|brain|neuroimaging/i,
    84,
    "Research area",
    ["neuroimaging"],
  ],
  [
    "computer vision",
    /computer vision|image process|visual recognition/i,
    79,
    "Research area",
    [],
  ],
  ["robotics", /robotics|robot control/i, 80, "Research area", []],
  [
    "cybersecurity",
    /cybersecurity|cyber security|information security/i,
    80,
    "Research area",
    ["information security"],
  ],
  [
    "reinforcement learning",
    /reinforcement learning/i,
    85,
    "Research method",
    [],
  ],
  [
    "signal processing",
    /signal processing|electroencephal|\bEEG\b/i,
    82,
    "Research method",
    [],
  ],
  [
    "human computer interaction",
    /human.computer interaction|\bHCI\b/i,
    81,
    "Research area",
    ["HCI"],
  ],
  ["bioinformatics", /bioinformatics|genomics/i, 81, "Research area", []],
  [
    "education technology",
    /educational technology|education technology|learning analytics/i,
    78,
    "Research area",
    ["learning analytics"],
  ],
  ["statistics", /statistics|statistical learn/i, 72, "Discipline", []],
  ["Python", /\bpython\b/i, 49, "Technical skill", []],
  ["PyTorch", /\bpytorch\b/i, 48, "Technical skill", []],
];
function collect(value, depth = 0) {
  if (depth > 4 || value == null) return [];
  if (typeof value === "string") return [value.slice(0, 1500)];
  if (Array.isArray(value))
    return value.slice(0, 100).flatMap((v) => collect(v, depth + 1));
  if (typeof value === "object")
    return Object.entries(value)
      .filter(
        ([k]) =>
          !/(?:^|_)(id|name|source|url|email|phone|contact|private|institution|organization|location|date|start|end|authors?|doi|bib)(?:_|$)/i.test(
            k,
          ),
      )
      .flatMap(([, v]) => collect(v, depth + 1));
  return [];
}
const list = (value) =>
  Array.isArray(value) ? value : Array.isArray(value?.index) ? value.index : [];
function suggestKeywords(profile, roles = BASE_ROLES) {
  const data = profile || {},
    research = collect([
      data.personal?.research_interests,
      data.research_interests,
    ]),
    text = collect([
      research,
      data.personal?.summary,
      data.personal?.headline,
      data.skills,
      list(data.projects).slice(0, 50),
      list(data.experience).slice(0, 50),
      list(data.publications).map((p) => ({
        title: p.title,
        abstract: p.abstract,
        keywords: p.keywords,
      })),
      list(data.education).map((e) => ({
        degree: e.degree,
        field: e.field,
        thesis: e.thesis,
      })),
    ])
      .join(" ")
      .slice(0, 100000);
  const faculty = roles.some((r) =>
      /lectur|professor|teach|instructor/i.test(r),
    ),
    researchRole = roles.some((r) =>
      /research|postdoc|scientist|fellow|engineer/i.test(r),
    );
  const suggestions = new Map();
  const add = (term, score, kind, reason) => {
    const key = normalize(term);
    if (!key) return;
    const old = suggestions.get(key);
    if (!old || score > old.score)
      suggestions.set(key, { term, score, kind, reason });
  };
  for (const [term, pattern, base, kind, aliases] of CATALOG) {
    if (!pattern.test(text)) continue;
    const score =
      base +
      (faculty && kind === "Teaching / discipline" ? 10 : 0) +
      (researchRole && kind.startsWith("Research") ? 3 : 0);
    add(term, score, "profile", `${kind} matched in your profile`);
    for (const alias of aliases) {
      if (alias === "speech biomarkers" && !/speech/i.test(text)) continue;
      add(alias, score - 25, "related", `Related search wording for ${term}`);
    }
  }
  for (const phrase of research) {
    const value = phrase.trim();
    if (
      value.length >= 3 &&
      value.length <= 90 &&
      value.split(/\s+/).length <= 10 &&
      !/@|https?:|\d{4}|ignore|instruction|university|professor/i.test(value)
    )
      add(value, 89, "profile", "Listed among your research interests");
  }
  const teachText = /teaching|curriculum|lecture|supervis/i.test(text);
  if (faculty && teachText) {
    add(
      "higher education teaching",
      76,
      "role",
      "Relevant to selected lecturer/professor roles and teaching profile",
    );
    if (/curriculum/i.test(text))
      add(
        "curriculum development",
        72,
        "role",
        "Teaching experience relevant to selected roles",
      );
    if (/supervis/i.test(text))
      add(
        "student supervision",
        69,
        "role",
        "Supervision experience relevant to selected roles",
      );
  }
  if (researchRole)
    add(
      "research position",
      60,
      "role",
      "Search terminology for selected research roles",
    );
  if (roles.some((r) => /postdoc/i.test(r)))
    add(
      "postdoctoral research",
      60,
      "role",
      "Search variant for selected postdoctoral roles",
    );
  if (roles.some((r) => /research fellow|research associate/i.test(r)))
    add(
      "research fellowship",
      60,
      "role",
      "Search variant for selected fellowship roles",
    );
  if (faculty) {
    if (roles.some((r) => /lectur|teach|instructor/i.test(r)))
      add("lectureship", 57, "role", "Common academic vacancy terminology");
    add(
      "faculty position",
      56,
      "role",
      "Search variant for lecturer/professor opportunities",
    );
  }
  if (/engineer|developer/i.test(roles.join(" "))) {
    if (/machine learning/i.test(text))
      add(
        "applied machine learning",
        84,
        "role",
        "Applied work relevant to the selected engineering role",
      );
    if (/software/i.test(text))
      add(
        "research software engineering",
        80,
        "role",
        "Software background relevant to selected roles",
      );
  }
  const keywords = [...suggestions.values()]
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term))
    .slice(0, 40);
  return {
    hasProfile: !!profile,
    roles: normalizeRoles(roles),
    roleOptions: EXTRA_ROLES,
    keywords,
    recommended: keywords
      .filter(
        (k) => k.kind === "profile" || (k.kind === "role" && k.score >= 80),
      )
      .slice(0, 8)
      .map((k) => k.term),
  };
}
module.exports = {
  BASE_ROLES,
  EXTRA_ROLES,
  normalizeRoles,
  roleMatches,
  splitKeywords,
  keywordMatches,
  searchTerms,
  suggestKeywords,
  keywordQueries,
  keywordStep,
};
