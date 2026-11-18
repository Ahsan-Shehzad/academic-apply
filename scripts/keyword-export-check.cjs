const fs = require("node:fs");
const path = require("node:path");
const { Store } = require("../desktop/store.cjs");
const { Documents } = require("../desktop/documents.cjs");
const { importProfile } = require("../desktop/profile.cjs");
(async () => {
  const root = path.resolve(".test-data/keyword-export");
  const store = await Store.open(root);
  try {
    const profile = importProfile(
      store,
      path.resolve("../Job-application-related-data"),
    );
    store.put("profile", { ...profile, verified: true });
    store.put("jobs", {
      id: "keyword-qa",
      title: "Lecturer in Computing",
      institution: "Keyword Layer QA",
      description:
        "Local QA fixture. Teach Python and software engineering. Research speech, graph transformers and machine learning.",
    });
    const docs = new Documents(store, {});
    const pkg = await docs.draft("keyword-qa", ["Academic CV"]);
    const docId = pkg.documents[0].id;
    const out = path.join(root, "comparison");
    fs.mkdirSync(out, { recursive: true });
    const save = (name) => {
      const doc = store.get("packages", pkg.id).documents[0];
      const pdf = path.join(out, name + ".pdf");
      const docx = path.join(out, name + ".docx");
      fs.copyFileSync(doc.pdf, pdf);
      fs.copyFileSync(doc.docx, docx);
      return { pdf, docx, pages: doc.pdfAudit.pages, layer: doc.keywordLayer };
    };
    await docs.exportPdf(pkg.id);
    const baseline = save("baseline");
    await docs.setKeywordLayer(pkg.id, docId, true, [
      "Speech",
      "Python",
      "Graph transformers",
    ]);
    await docs.exportPdf(pkg.id);
    const enabled = save("enabled");
    await docs.setKeywordLayer(pkg.id, docId, false, []);
    await docs.exportPdf(pkg.id);
    const disabled = save("disabled");
    const result = { baseline, enabled, disabled };
    fs.writeFileSync("qa/keyword-export.json", JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        pages: [baseline.pages, enabled.pages, disabled.pages],
        terms: enabled.layer.terms,
      }),
    );
  } finally {
    store.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
