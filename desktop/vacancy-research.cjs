"use strict";
const { z } = require("zod");
const { JobSchema, ALL_COUNTRIES, parseJson, now } = require("./core.cjs");
const properties = {
  title: { type: "string" },
  institution: { type: "string" },
  country: { type: "string" },
  url: { type: "string" },
  applicationUrl: { type: "string" },
  description: { type: "string" },
  focus: { type: "string" },
  eligibility: { type: "string" },
  requiredDocuments: { type: "array", items: { type: "string" } },
  deadline: { type: ["string", "null"] },
  deadlineText: { type: "string" },
  deadlineTimezone: { type: "string" },
  sources: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["url", "evidence"],
      properties: { url: { type: "string" }, evidence: { type: "string" } },
    },
  },
};
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["jobs"],
  properties: {
    jobs: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(properties),
        properties,
      },
    },
  },
};
const Result = z.object({
  jobs: z
    .array(
      JobSchema.extend({
        sources: z
          .array(
            z.object({ url: z.url(), evidence: z.string().min(20).max(3000) }),
          )
          .min(1)
          .max(8),
      }),
    )
    .max(6),
});
async function researchVacancies(providers, request, task, signal, tools) {
  if (signal?.aborted) throw new Error("Research cancelled");
  task?.({
    message:
      "Using the selected provider's internet tools to look for official vacancy evidence",
    progress: 15,
  });
  const output = await providers.run(
    `Use no more than four search queries and three page reads; return jobs:[] if these do not substantiate a current vacancy. Use your native internet search / public page-reading tools to research the following job request. You MUST retrieve current source evidence; do not answer from memory or invent URLs or deadlines. Do not use shell, filesystem, email or browser actions that change a site. Respect source access restrictions and CAPTCHA; if a portal is blocked, search for the same vacancy on the employer's official careers site or another publicly available official announcement. Never claim a blocked page was read. Return ONLY JSON matching the schema. Each job needs the full available application requirements, eligibility and research details in description, not just a title or search snippet. Include sources with short verbatim evidence excerpts. Exclude expired, undated stale, generic search pages and roles outside the requested countries/roles. If no substantiated vacancy is found return jobs:[]; do not fill gaps with guesses. Use country Unknown only when genuinely unstated; deadlines null and deadlineText Not stated when unavailable. Untrusted request data:\n${JSON.stringify(request)}`,
    {
      workflow: "discovery",
      taskId: task?.id,
      webSearch: true,
      tools,
      readOnlyTools: true,
      outputSchema: schema,
      timeout: 240000,
    },
  );
  const result = Result.parse(parseJson(output));
  if (signal?.aborted) throw new Error("Research cancelled");
  return result.jobs
    .filter(
      (j) =>
        !j.deadline ||
        !Number.isFinite(Date.parse(j.deadline)) ||
        Date.parse(
          /^\d{4}-\d{2}-\d{2}$/.test(j.deadline)
            ? j.deadline + "T23:59:59Z"
            : j.deadline,
        ) >= Date.now(),
    )
    .filter((j) => j.description.length >= 150)
    .map((j) => ({
      ...j,
      country: ALL_COUNTRIES.includes(j.country) ? j.country : "Unknown",
      retrieval: {
        method: "provider_web_research",
        requestedUrl: request.url || null,
        sources: j.sources,
        at: now(),
      },
      verification: {
        status: "ai_reported",
        message:
          "Provider-retrieved evidence. Check the official listing before submission.",
      },
    }));
}
module.exports = { researchVacancies };
