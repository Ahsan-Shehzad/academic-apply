"use strict";
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { id, now, hash } = require("./core.cjs");
function profileWarnings(p) {
  const warnings = [];
  if (!p.personal?.name) warnings.push("Candidate name is missing.");
  if (!p.personal?.contact?.emails?.length)
    warnings.push("Contact email is missing.");
  if (p.personal?.scholar_metrics?.checked_date)
    warnings.push(
      "Scholar metrics are a dated snapshot; verify before including.",
    );
  if (
    p.personal?.contact?.location?.city &&
    p.personal?.contact?.addresses?.some(
      (a) => a.type === "work" && a.city !== p.personal.contact.location.city,
    )
  )
    warnings.push(
      "Home and work locations differ. Choose the contact location to use in documents.",
    );
  warnings.push(
    "Confirm current appointments, degree completion and publication status before approving the profile.",
  );
  return warnings;
}
function scanLibrary(root) {
  const files = [];
  const walk = (dir, depth) => {
    if (depth > 4 || files.length >= 1000) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (/^(node_modules|tmp|\.git|\.cache)$/i.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (
        /\.(pdf|docx?|bib|ya?ml|tex|html)$/i.test(entry.name) &&
        !/(passport|europass-profile-raw)/i.test(entry.name)
      )
        files.push({
          id: hash(full),
          name: entry.name,
          path: full,
          relative: path.relative(root, full),
          size: fs.statSync(full).size,
          addedAt: now(),
          category: /publication/i.test(full)
            ? "Publication"
            : /degree|educat/i.test(full)
              ? "Qualification"
              : /syllabus/i.test(full)
                ? "Teaching"
                : "Supporting material",
        });
    }
  };
  walk(root, 0);
  return files;
}
function importProfile(store, root) {
  const filename = path.join(root, "data", "profile.yaml");
  if (!fs.existsSync(filename))
    throw new Error(
      "Choose the Job-application-related-data folder containing data/profile.yaml.",
    );
  const p = YAML.parse(fs.readFileSync(filename, "utf8"));
  if (!p?.personal?.name)
    throw new Error("The profile YAML is missing personal.name.");
  const record = {
    id: "main",
    data: p,
    source: filename,
    importedAt: now(),
    verified: false,
    warnings: profileWarnings(p),
  };
  store.put("profile", record);
  for (const file of scanLibrary(root)) store.put("library", file);
  const bib = path.join(root, "selected-publications", "publications.bib");
  if (fs.existsSync(bib))
    store.put("bibliography", {
      id: "main",
      text: fs.readFileSync(bib, "utf8"),
      source: bib,
    });
  store.put("settings", {
    ...store.settings(),
    sourceRoot: root,
    profileVerified: false,
  });
  store.audit("profile.imported", {
    source: filename,
    libraryFiles: store.list("library").length,
  });
  return record;
}
function publicFacts(p) {
  const data = structuredClone(p);
  if (data.personal) {
    delete data.personal.private_information;
    delete data.personal.contact?.addresses;
    delete data.personal.contact?.instant_messengers;
    delete data.personal.scholar_metrics;
    delete data.personal.contact?.phones;
  }
  delete data.references;
  delete data.metadata;
  return data;
}
function primaryEmail(profile, settings) {
  return (
    settings.contactEmail ||
    profile?.personal?.contact?.emails?.find((e) => e.use === "primary")
      ?.value ||
    profile?.personal?.contact?.emails?.[0]?.value ||
    ""
  );
}
module.exports = {
  profileWarnings,
  scanLibrary,
  importProfile,
  publicFacts,
  primaryEmail,
};
