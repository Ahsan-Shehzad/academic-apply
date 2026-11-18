const fs = require("node:fs");
const path = require("node:path");
const { Store } = require("../desktop/store.cjs");
const { Providers } = require("../desktop/providers.cjs");
const { Documents } = require("../desktop/documents.cjs");
const { importProfile } = require("../desktop/profile.cjs");

(async () => {
  const store = await Store.open(path.resolve(".test-data/document-style-v2"));
  const providers = new Providers(store);
  try {
    const profile = importProfile(
      store,
      path.resolve("../Job-application-related-data"),
    );
    store.put("profile", { ...profile, verified: true });
    store.put("settings", {
      ...store.settings(),
      cloudConsent: process.argv.includes("--with-ai"),
    });
    store.put("jobs", {
      id: "style-faculty",
      title: "Lecturer in Computing",
      institution: "Document Layout Review",
      description:
        "Local layout verification fixture. Teach computing, software engineering, AI and data analytics, assess student work and supervise projects. PhD and higher education teaching experience required. A cover letter of at most 400 words is requested. This fixture does not represent a real vacancy.",
      requiredDocuments: ["Academic CV", "Cover letter"],
    });
    store.put("jobs", {
      id: "style-research",
      title: "Postdoctoral Researcher in Speech AI",
      institution: "Research Layout Review",
      description:
        "Local verification fixture for research-led ordering. Speech-based cognitive impairment detection, interpretable AI and graph learning.",
      requiredDocuments: ["Academic CV"],
    });
    const docs = new Documents(store, providers);
    const types = process.argv.includes("--with-ai")
      ? ["Academic CV", "Cover letter"]
      : ["Academic CV"];
    const results = [];
    for (const [jobId, selected] of [
      ["style-faculty", types],
      ["style-research", ["Academic CV"]],
    ]) {
      const pkg = await docs.draft(jobId, selected);
      await docs.exportPdf(pkg.id);
      results.push(
        ...store
          .get("packages", pkg.id)
          .documents.map((d) => ({
            type: d.type,
            track: jobId,
            docx: d.docx,
            pdf: d.pdf,
            words: d.audit.words,
            pages: d.pdfAudit.pages,
            sections: d.content.sections.map((s) => s.heading),
            templateVersion: d.templateVersion,
          })),
      );
    }
    fs.mkdirSync("qa", { recursive: true });
    fs.writeFileSync(
      "qa/document-style-v2.json",
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results));
  } finally {
    providers.close();
    store.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
