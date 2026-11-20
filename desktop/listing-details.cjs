"use strict";
const { deadlineInfo } = require("./core.cjs");
const { roleMatches } = require("./search-intelligence.cjs");
const { advancedMatch } = require("./search-options.cjs");
const { planFromJob } = require("./document-requirements.cjs");
const normalized = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
function sameVacancy(candidate, job) {
  const words = normalized(candidate.title)
    .split(" ")
    .filter(
      (w) =>
        w.length >= 3 &&
        ![
          "the",
          "and",
          "for",
          "with",
          "position",
          "vacancy",
          "job",
          "jobs",
          "university",
        ].includes(w),
    );
  const text = normalized(job.title);
  if (
    !words.length ||
    words.filter((w) => (" " + text + " ").includes(" " + w + " ")).length <
      Math.min(2, words.length)
  )
    return false;
  if (
    candidate.institution &&
    !/unknown|not (?:identified|stated)/i.test(candidate.institution)
  ) {
    const organization = normalized(candidate.institution)
      .split(" ")
      .filter(
        (w) =>
          w.length >= 3 &&
          ![
            "the",
            "and",
            "for",
            "university",
            "institute",
            "school",
            "department",
            "college",
          ].includes(w),
      );
    const evidence = normalized(job.institution + " " + job.description);
    if (
      organization.length &&
      !organization.some((w) => (" " + evidence + " ").includes(" " + w + " "))
    )
      return false;
  }
  return true;
}
function listingDetails(job, candidate = {}) {
  const copy = { ...job };
  // Search-result hints are used only when corroborated by the actual page text.
  if (
    (!copy.institution || /not identified|unknown/i.test(copy.institution)) &&
    candidate.institution &&
    normalized(copy.description).includes(normalized(candidate.institution))
  )
    copy.institution = candidate.institution;
  const plan = planFromJob(copy);
  if (!plan.warning)
    copy.requiredDocuments = plan.requirements.map((r) => r.label);
  const notes = [];
  if (copy.verification?.providerSupplementedFields?.length)
    notes.push(
      "Provider-reported fields require review: " +
        copy.verification.providerSupplementedFields.join(", ") +
        ".",
    );
  if (!copy.deadline)
    notes.push("Application deadline not stated or not unambiguously parsed.");
  if (!copy.country || copy.country === "Unknown")
    notes.push("Country not established from the listing.");
  if (
    !copy.eligibility ||
    /Read the official listing to confirm eligibility/i.test(copy.eligibility)
  ) {
    const sentences = String(copy.description || "")
      .split(/(?<=[.;])\s+|\n/)
      .filter((s) =>
        /\bPh\.?D\b|doctorat|qualifications?|requirements?|essential|experience|eligible|eligibility|must have|you (?:will|should|must)|degree in/i.test(
          s,
        ),
      );
    copy.eligibility = sentences.length
      ? sentences.join("\n").slice(0, 10000)
      : "Eligibility requirements not identified; review the full listing text.";
  }
  if (/not identified|review the full listing/i.test(copy.eligibility))
    notes.push("Eligibility requires manual review.");
  if (plan.warning) {
    copy.requiredDocuments = [];
    notes.push("Required documents not explicitly identified.");
  }
  copy.detailCoverage = {
    fullTextRead: true,
    deadline: copy.deadline ? "stated" : "not_established",
    documents: copy.requiredDocuments.length ? "identified" : "not_stated",
    eligibility: /not identified|review the full listing/i.test(
      copy.eligibility,
    )
      ? "needs_review"
      : "identified",
    notes,
  };
  return copy;
}
function exclusionReasons(job, search, profile) {
  const reasons = [];
  if (deadlineInfo(job).kind === "expired")
    reasons.push("Application deadline has passed");
  if (!roleMatches(job.title, search.roles || []))
    reasons.push("Outside selected role titles");
  if (job.country !== "Unknown" && !search.countries.includes(job.country))
    reasons.push("Outside selected countries");
  if (!advancedMatch(job, search, profile))
    reasons.push("Does not meet the explicit advanced filters");
  return reasons;
}
function readableVacancy(job, candidate) {
  return (
    String(job.description || "").length >= 200 &&
    !!job.title &&
    !!job.institution &&
    !/not identified|unknown/i.test(job.institution) &&
    sameVacancy(candidate, job)
  );
}
module.exports = {
  sameVacancy,
  listingDetails,
  exclusionReasons,
  readableVacancy,
  normalized,
};
