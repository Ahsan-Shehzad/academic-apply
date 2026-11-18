"use strict";
const fs = require("node:fs");
const path = require("node:path");
function removeListings(store, ids) {
  if (
    store
      .list("tasks")
      .some(
        (t) =>
          ["running", "queued"].includes(t.status) &&
          [
            "search",
            "ai-search",
            "search-once",
            "ai-search-once",
            "import",
            "connector-discovery",
            "connector-search",
            "enrich",
            "documents",
            "document-add",
            "cv-format",
            "supporting-draft",
            "browser-import",
          ].includes(t.kind),
      )
  )
    throw new Error(
      "Wait for listing searches/imports to finish, or cancel them in Activity, before deleting listings.",
    );
  const selected =
    ids === null
      ? store.list("jobs")
      : ids.map((id) => store.get("jobs", id)).filter(Boolean);
  if (!selected.length)
    return { removed: 0, message: "No listings to delete." };
  const backupFolder = path.join(store.root, "backups");
  fs.mkdirSync(backupFolder, { recursive: true });
  const backup = path.join(
    backupFolder,
    `before-listing-delete-${Date.now()}-${require("node:crypto").randomBytes(4).toString("hex")}.sqlite`,
  );
  fs.writeFileSync(backup, Buffer.from(store.db.export()));
  const linked = new Set(
    [...store.list("packages"), ...store.list("applications")].map(
      (x) => x.jobId,
    ),
  );
  store.transaction(() => {
    for (const job of selected) {
      if (linked.has(job.id))
        store.put("jobHistory", {
          ...job,
          removedFromDiscoverAt: new Date().toISOString(),
        });
      store.remove("jobs", job.id);
    }
    store.audit("jobs.deleted", { count: selected.length, backup });
  });
  return {
    removed: selected.length,
    message: `${selected.length} listings deleted from Discover. Submission packages and application history retained.`,
  };
}
module.exports = { removeListings };
