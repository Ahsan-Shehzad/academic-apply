"use strict";
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { publicFacts } = require("./profile.cjs");
const { hash, now } = require("./core.cjs");

// Fixed factual topic labels. Neither vacancy text nor model output can supply
// arbitrary hidden content or screening instructions.
const TOPICS = [
  ["Speech", /\bspeech\b/i],
  ["Natural language processing", /\bnatural language processing\b|\bNLP\b/i],
  ["Multimodal learning", /\bmultimodal\b|\bmulti-modal\b/i],
  ["Cognitive impairment", /\bcognitive impairment\b/i],
  ["Alzheimer's disease", /\balzheimer['’]?s?(?: disease)?\b/i],
  ["Dementia", /\bdementia\b/i],
  ["Interpretable AI", /\binterpretab\w*\b/i],
  ["Explainable AI", /\bexplainab\w*\b|\bXAI\b/i],
  ["Graph neural networks", /\bgraph neural networks?\b|\bGNNs?\b/i],
  ["Graph transformers", /\bgraph transformers?\b/i],
  ["Machine learning", /\bmachine learning\b/i],
  ["Deep learning", /\bdeep learning\b/i],
  ["Artificial intelligence", /\bartificial intelligence\b|\bAI\b/i],
  ["Health informatics", /\bhealth informatics\b/i],
  ["Brain connectivity", /\bbrain connectivity\b/i],
  ["Python", /\bPython\b/i],
  ["PyTorch", /\bPyTorch\b/i],
  ["Data science", /\bdata scien(?:ce|tist)\b/i],
  ["Data analytics", /\bdata analy(?:tics|sis)\b/i],
  ["Computer science", /\bcomputer science\b/i],
  ["Software engineering", /\bsoftware engineering\b/i],
  ["Full-stack development", /\bfull[ -]stack\b/i],
  ["Curriculum development", /\bcurriculum (?:development|design)\b/i],
  ["Assessment design", /\bassessment (?:design|development)\b/i],
  [
    "Project supervision",
    /\bproject supervision\b|\bsupervised.{0,30}projects?\b/i,
  ],
  ["Higher education", /\bhigher[ -]education\b/i],
];
const SUPPORTED_TYPES = ["Academic CV", "Cover letter"];
function readable(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map(readable).filter(Boolean).join(" ");
  if (!value || typeof value !== "object") return "";
  return Object.entries(value)
    .filter(
      ([key]) =>
        !/^(id|key|doi|url|link|email|phone|private_information)$/i.test(key),
    )
    .map(([, entry]) => readable(entry))
    .filter(Boolean)
    .join(" ");
}
function evidenceRecords(profile) {
  const safe = publicFacts(profile);
  const records = [
    {
      id: "personal-summary",
      section: "Academic profile",
      text: [
        safe.personal?.summary,
        safe.personal?.headline,
        ...(safe.personal?.research_interests || []),
      ]
        .filter(Boolean)
        .join(" "),
    },
  ];
  for (const section of ["education", "experience", "projects", "skills"]) {
    const items = Array.isArray(safe[section])
      ? safe[section]
      : safe[section]?.structured_skill_records ||
        (safe[section] ? [safe[section]] : []);
    for (const [index, item] of items.entries())
      records.push({
        id: item.id || item.key || `${section}-${index}`,
        section,
        text: readable(item),
      });
  }
  return records;
}
function keywordCandidates(profile, job) {
  const records = evidenceRecords(profile);
  const vacancy = [job.title, job.focus, job.description, job.eligibility]
    .filter(Boolean)
    .join(" ");
  return TOPICS.flatMap(([term, pattern]) => {
    if (!pattern.test(vacancy)) return [];
    const source = records.find((record) => pattern.test(record.text));
    if (!source) return [];
    const offset = source.text.search(pattern);
    return [
      {
        term,
        evidenceId: source.id,
        section: source.section,
        evidence: source.text.slice(
          Math.max(0, offset - 55),
          Math.max(0, offset - 55) + 220,
        ),
      },
    ];
  }).slice(0, 24);
}
function buildKeywordLayer(profile, job, type, enabled = false, selectedTerms) {
  const supported = SUPPORTED_TYPES.includes(type);
  if (enabled && !supported)
    throw new Error(
      "Hidden keyword layers are available only for CVs and cover letters.",
    );
  const candidates = supported ? keywordCandidates(profile, job) : [];
  if (
    enabled &&
    selectedTerms &&
    selectedTerms.some((term) => !candidates.some((c) => c.term === term))
  )
    throw new Error(
      "Choose only terms supported by the verified profile and vacancy. Refresh the available terms after profile changes.",
    );
  const selected = selectedTerms
    ? candidates.filter((c) => selectedTerms.includes(c.term))
    : candidates;
  const terms = enabled ? selected.map((c) => c.term) : [];
  return {
    version: 1,
    enabled: !!enabled,
    terms,
    candidates,
    text: terms.join("; "),
    profileHash: hash(profile),
    listingHash: hash(job.description || ""),
    updatedAt: now(),
    method:
      "Verified keyword index; DOCX hidden text and keywords; PDF transparent text and keywords",
    notice:
      "Experimental. ATS benefit is unproven. Hidden text may be ignored, exposed, or flagged by screening tools.",
  };
}
function assertLayer(layer) {
  if (!layer?.enabled || !layer.terms?.length) return false;
  const allowed = new Set(TOPICS.map(([term]) => term));
  if (
    layer.terms.length > 24 ||
    layer.terms.some((term) => !allowed.has(term)) ||
    layer.text !== layer.terms.join("; ")
  )
    throw new Error(
      "Invalid keyword layer. Rebuild it from the profile and vacancy.",
    );
  return true;
}
async function embedPdfKeywordLayer(bytes, layer) {
  if (!assertLayer(layer)) return bytes;
  const pdf = await PDFDocument.load(bytes);
  if (!pdf.getPageCount())
    throw new Error("Cannot add a keyword layer to an empty PDF.");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .getPages()[0]
    .drawText(layer.text, { font, size: 1, x: 20, y: 20, opacity: 0 });
  pdf.setKeywords(layer.terms);
  return Buffer.from(await pdf.save());
}
module.exports = {
  buildKeywordLayer,
  keywordCandidates,
  assertLayer,
  embedPdfKeywordLayer,
  SUPPORTED_TYPES,
};
