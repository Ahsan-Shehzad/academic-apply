"use strict";
const { deadlineInfo } = require("./core.cjs");
const { SOURCES } = require("./source-catalog.cjs"),
  { accessIssue, sourceOutcome } = require("./source-access.cjs");
function retainedSourceIssues(task) {
  const report = new Map();
  for (const line of task.logs || []) {
    if (line.level !== "warning" && line.level !== "error") continue;
    const source = SOURCES.find((s) => line.message.startsWith(s.name + ":"));
    if (source)
      report.set(
        source.id,
        sourceOutcome(
          source,
          accessIssue(line.message.slice(source.name.length + 1).trim()),
        ),
      );
  }
  return [...report.values()];
}
const searches = new Set([
  "search",
  "search-once",
  "ai-search",
  "ai-search-once",
  "connector-discovery",
  "connector-search",
]);
function taskSummary(task, store) {
  const r = task.result || {},
    metrics = [];
  const add = (label, value) => {
    if (Number.isFinite(value)) metrics.push({ label, value });
  };
  const report = r.sourceReport || retainedSourceIssues(task);
  let title =
    task.status === "completed"
      ? "Task completed"
      : task.status === "failed"
        ? "Task could not finish"
        : task.status === "interrupted"
          ? "Task interrupted"
          : "Task cancelled";
  let nextStep = "Open the result to review the completed work.";
  if (searches.has(task.kind)) {
    title = "Job search summary";
    add("New listings", r.added);
    add("Updated listings", r.updated);
    add("Distinct listings", r.jobIds ? new Set(r.jobIds).size : undefined);
    add("Candidate links", r.candidateCount);
    add("Sources attempted", r.sourcesChecked);
    const jobs = (r.jobIds || [])
      .map((id) => store?.get("jobs", id))
      .filter(Boolean);
    if (store && r.jobIds) {
      add("Strong matches", jobs.filter((j) => j.match?.score >= 70).length);
      add(
        "Closing within 14 days",
        jobs.filter((j) => {
          const d = deadlineInfo(j);
          return d.days !== null && d.days >= 0 && d.days <= 14;
        }).length,
      );
    }
    if (r.sourceReport)
      add(
        "Sources needing attention",
        report.filter((s) => !["available", "empty"].includes(s.status)).length,
      );
    else add("Reported source/page issues", r.failed);
    add("Listings saved by AI recovery", r.recoveredCount);
    nextStep = r.jobIds?.length
      ? "Review the listings, match explanations and official deadlines before preparing a package."
      : "No matching listings were saved. Broaden roles, keywords or countries, and review source access below.";
    if (r.researchSourcesDeferred)
      nextStep += ` ${r.researchSourcesDeferred} source hints were deferred to keep this run bounded.`;
  } else if (r.packageId || task.packageId || task.payload?.packageId) {
    const pkg = store?.get(
      "packages",
      r.packageId || task.packageId || task.payload?.packageId,
    );
    add("Documents", pkg?.documents?.length);
    add("Supporting files", pkg?.attachments?.length);
    add("PDFs exported", r.exportedCount);
    add("Still required", pkg?.missingRequirements?.length);
    nextStep =
      "Review document content, supporting-file coverage and PDF layout before approval.";
  } else if (task.kind === "connector-test-all") {
    add("Connectors tested", r.results?.length);
    add("Available", r.results?.filter((c) => c.status === "available").length);
    add(
      "Need attention",
      r.results?.filter((c) => !["available", "empty"].includes(c.status))
        .length,
    );
    nextStep = "Review source details and setup guides in Connectors.";
  } else if (task.kind === "import" || task.kind === "browser-import") {
    add("Listings imported", r.jobId ? 1 : 0);
    nextStep =
      "Review the institution, eligibility, required documents and deadline against the official listing.";
  } else {
    add(
      "Actions completed",
      Array.isArray(r.actions) ? r.actions.length : r.actions,
    );
    add("Available models", r.models?.length);
    add("Research tools", r.tools?.length);
    if (task.kind === "provider")
      nextStep = "Choose a detected model for the workflows you want to use.";
  }
  if (task.status !== "completed")
    nextStep =
      "Review the work log. Saved results are retained; retry from this workflow when the issue is resolved.";
  return {
    title,
    outcome: task.status,
    message: r.message || task.message || "Completed",
    metrics,
    nextStep,
    sourceReport: report,
  };
}
module.exports = { taskSummary };
