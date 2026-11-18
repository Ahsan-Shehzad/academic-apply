"use strict";
const { hash } = require("./core.cjs");
function packageName(job) {
  return `${job.institution || "Institution"} - ${job.title || "Academic position"}`;
}
function applicationContext(store, appId) {
  const application = store.get("applications", appId);
  if (!application) throw new Error("Application not found");
  const job = store.getJob(application.jobId);
  if (!job) throw new Error("The selected job listing is unavailable");
  const pkg = application.packageId
    ? store.get("packages", application.packageId)
    : null;
  if (application.packageId && (!pkg || pkg.jobId !== job.id))
    throw new Error(
      "Choose a submission package prepared for this exact listing",
    );
  const listing = {
    id: job.id,
    title: job.title,
    institution: job.institution,
    country: job.country,
    url: job.url,
    applicationUrl: job.applicationUrl,
    deadline: job.deadline,
    deadlineText: job.deadlineText,
    focus: job.focus,
    eligibility: job.eligibility,
    requiredDocuments: job.requiredDocuments || [],
    description: String(job.description || "").slice(0, 45000),
  };
  const context = {
    applicationId: appId,
    listing,
    package: pkg
      ? {
          id: pkg.id,
          name: packageName(job),
          version: pkg.version,
          status: pkg.status,
          listingCurrent:
            !pkg.listingHash || pkg.listingHash === hash(job.description || ""),
          profileCurrent:
            !pkg.profileHash ||
            pkg.profileHash === hash(store.get("profile", "main")?.data || {}),
          requirements: pkg.requirements || [],
          missingRequirements: require("./document-requirements.cjs")
            .packageCoverage(pkg)
            .filter((r) => r.required && !r.fulfilled)
            .map((r) => r.label),
          externalSubmissions: pkg.externalSubmissions || [],
          documents: (pkg.documents || [])
            .filter((d) => d.submissionEligible !== false)
            .map((d) => ({
              id: d.id,
              label: d.label || d.type,
              type: d.type,
              reviewed: !!d.reviewed,
              sections: d.reviewed ? d.content?.sections : undefined,
            })),
          attachments: (pkg.attachments || []).map((a) => ({
            name: a.name,
            requirementId: a.requirementId,
          })),
        }
      : null,
  };
  return {
    ...context,
    fingerprint: hash([
      context,
      hash(store.get("profile", "main")?.data || {}),
      store.get("profile", "main")?.verified,
      (pkg?.documents || []).map((d) => [d.id, d.approvedFiles]),
      (pkg?.attachments || []).map((a) => [a.name, a.hash]),
    ]),
  };
}
function assertContext(store, appId, fingerprint) {
  if (applicationContext(store, appId).fingerprint !== fingerprint)
    throw new Error(
      "The selected listing or package changed. Inspect the application and restart the assistant with the current selection.",
    );
}
function preferredPackage(packages, jobId) {
  return packages
    .filter((p) => p.jobId === jobId)
    .sort(
      (a, b) =>
        Number(b.status === "ready") - Number(a.status === "ready") ||
        Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0),
    )[0];
}
module.exports = {
  packageName,
  applicationContext,
  assertContext,
  preferredPackage,
};
