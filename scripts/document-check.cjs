const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { Store } = require("../desktop/store.cjs");
const { Documents } = require("../desktop/documents.cjs");
const { importProfile } = require("../desktop/profile.cjs");
(async () => {
  const store = await Store.open(path.resolve(".test-data/documents"));
  try {
    const profile = importProfile(
      store,
      path.resolve("../Job-application-related-data"),
    );
    store.put("profile", { ...profile, verified: true });
    store.put("jobs", {
      id: "qa-only",
      institution: "Document QA",
      title: "Academic CV layout verification",
      description: "Local document rendering check",
      requiredDocuments: ["Academic CV"],
    });
    const documents = new Documents(store, {});
    const pkg = await documents.draft("qa-only", ["Academic CV"]);
    await documents.exportPdf(pkg.id);
    const current = store.get("packages", pkg.id);
    fs.mkdirSync("qa", { recursive: true });
    fs.writeFileSync(
      "qa/document-results.json",
      JSON.stringify(
        current.documents.map((d) => ({
          type: d.type,
          docx: d.docx,
          pdf: d.pdf,
          words: d.audit.words,
          pages: d.pdfAudit.pages,
          sections: d.content.sections.map((s) => s.heading),
        })),
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify(
        current.documents.map((d) => ({
          type: d.type,
          words: d.audit.words,
          pages: d.pdfAudit.pages,
          pdf: d.pdf,
        })),
      ),
    );
  } finally {
    store.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
