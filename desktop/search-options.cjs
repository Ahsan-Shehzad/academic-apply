"use strict";
const { z } = require("zod");
const { matchJob, deadlineInfo } = require("./core.cjs");
const FilterSchema = z.object({
  title: z.string().max(300).optional(),
  institutions: z.string().max(1000).optional(),
  requiredTerms: z.string().max(1000).optional(),
  excludedTerms: z.string().max(1000).optional(),
  minimumMatch: z.number().int().min(0).max(100).optional(),
  postedWithinDays: z.number().int().min(0).max(365).optional(),
  closingWithinDays: z.number().int().min(0).max(365).optional(),
  includeUnknownDates: z.boolean().optional(),
  includeUnknownCountry: z.boolean().optional(),
  officialOnly: z.boolean().optional(),
  remoteOnly: z.boolean().optional(),
});
const advancedSearchShape = {
  aiProvider: z.enum(["", "codex", "antigravity"]).optional(),
  aiModel: z.string().max(200).optional(),
  filters: FilterSchema.optional(),
  maxResults: z.number().int().min(5).max(2000).optional(),
  strategy: z.enum(["sources", "ai", "hybrid"]).optional(),
  depth: z.enum(["quick", "balanced", "thorough"]).optional(),
  browserMode: z.enum(["auto", "http", "headless"]).optional(),
  mcpTools: z
    .array(
      z.object({
        connectorId: z.string().max(150),
        tool: z.string().max(128),
        arguments: z.record(z.string(), z.unknown()),
      }),
    )
    .max(20)
    .optional(),
};
const terms = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
function advancedMatch(job, search, profile, at = new Date()) {
  const f = search.filters || {},
    text =
      `${job.title} ${job.institution} ${job.focus || ""} ${job.description || ""}`.toLowerCase();
  if (
    f.title &&
    !terms(f.title).some((t) => String(job.title).toLowerCase().includes(t))
  )
    return false;
  if (
    f.institutions &&
    !terms(f.institutions).some((t) =>
      String(job.institution).toLowerCase().includes(t),
    )
  )
    return false;
  if (
    terms(f.requiredTerms).some((t) => !text.includes(t)) ||
    terms(f.excludedTerms).some((t) => text.includes(t))
  )
    return false;
  if (f.minimumMatch && matchJob(job, profile || {}).score < f.minimumMatch)
    return false;
  if (f.officialOnly && !job.official) return false;
  if (
    f.includeUnknownCountry === false &&
    (!job.country || job.country === "Unknown")
  )
    return false;
  if (f.remoteOnly && !/remote|work from home|home.based/i.test(text))
    return false;
  if (f.postedWithinDays) {
    const posted = Date.parse(job.publishedAt);
    if (!Number.isFinite(posted)) {
      if (f.includeUnknownDates === false) return false;
    } else if (
      at.getTime() - posted > f.postedWithinDays * 86400000 ||
      posted > at.getTime() + 86400000
    )
      return false;
  }
  if (f.closingWithinDays) {
    const info = deadlineInfo(job, at);
    if (info.days === null) {
      if (f.includeUnknownDates === false) return false;
    } else if (info.days < 0 || info.days > f.closingWithinDays) return false;
  }
  if (f.includeUnknownDates === false && !job.deadline && !job.publishedAt)
    return false;
  return true;
}
function expandArguments(value, search, depth = 0) {
  if (depth > 10) throw new Error("MCP argument structure is too deep");
  if (typeof value === "string")
    return value
      .replaceAll("{{keywords}}", search.keywords || "")
      .replaceAll("{{countries}}", search.countries.join(", "))
      .replaceAll("{{roles}}", search.roles.join(", "));
  if (Array.isArray(value))
    return value.map((v) => expandArguments(v, search, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        expandArguments(v, search, depth + 1),
      ]),
    );
  return value;
}
module.exports = {
  advancedSearchShape,
  FilterSchema,
  advancedMatch,
  expandArguments,
};
