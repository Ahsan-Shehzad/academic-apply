const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { Store } = require("../desktop/store.cjs");
const { importProfile } = require("../desktop/profile.cjs");
const { Documents } = require("../desktop/documents.cjs");
const { Providers } = require("../desktop/providers.cjs");
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/document-upgrade-"));
  const store = await Store.open(root);
  const providers = new Providers(store, (_event, update) => {
    if (update.phase) console.log(update.phase);
  });
  try {
    const source = path.resolve("../Job-application-related-data");
    const p = importProfile(store, source);
    p.verified = true;
    store.put("profile", p);
    store.put("jobs", {
      id: "cv-fixture",
      title: "Lecturer in Computing",
      institution: "Layout Review",
      description: "Submit an academic CV.",
      requiredDocuments: ["Academic CV"],
    });
    const docs = new Documents(store, providers);
    const cv = await docs.draft("cv-fixture", ["Academic CV"]);
    await docs.exportPdf(cv.id);
    const result = {
      realProfileCv: {
        folder: cv.folder,
        documents: store
          .get("packages", cv.id)
          .documents.map((d) => ({
            docx: d.docx,
            pdf: d.pdf,
            pages: d.pdfAudit.pages,
          })),
      },
    };
    console.log("CV", JSON.stringify(result.realProfileCv));
    if (process.argv.includes("--live")) {
      store.put("profile", {
        id: "main",
        verified: true,
        data: {
          personal: {
            name: "Example Candidate",
            summary:
              "I teach Python and machine learning and research speech classification.",
            contact: { emails: [{ value: "example@example.edu" }] },
          },
          education: [
            {
              id: "phd",
              degree: "PhD in Computing",
              institution: "Example University",
              end: "2024",
            },
          ],
          experience: [
            {
              id: "lecturer",
              title: "Lecturer in Computing",
              organization: "Example University",
              start: "2024",
              ongoing: true,
              bullets: ["Teach Python and machine learning."],
            },
          ],
        },
      });
      store.put("settings", {
        ...store.settings(),
        sourceRoot: "",
        cloudConsent: true,
        provider: "antigravity",
        workflowProviders: {},
        workflowModels: {},
        models: { antigravity: "gemini-3.8-flash" },
        effort: "medium",
      });
      store.put("jobs", {
        id: "auto-fixture",
        title: "Lecturer in Computing",
        institution: "Example University",
        description:
          "Applications must contain: (1) an academic CV; (2) a cover letter of no more than 300 words addressing teaching Python; (3) a teaching statement of no more than 300 words about practical teaching and assessment; (4) an official academic transcript supplied by the applicant. No research statement is required.",
      });
      const pkg = await docs.draft("auto-fixture", null, (u) =>
        console.log(u.message),
      );
      assert.deepEqual(
        pkg.documents.map((d) => d.type).sort(),
        ["Academic CV", "Cover letter", "Teaching statement"].sort(),
      );
      assert.ok(pkg.missingRequirements.some((r) => /transcript/i.test(r)));
      await docs.exportPdf(pkg.id);
      result.automaticPackage = {
        folder: pkg.folder,
        requirements: pkg.requirements,
        missing: pkg.missingRequirements,
        documents: store
          .get("packages", pkg.id)
          .documents.map((d) => ({
            type: d.type,
            words: d.audit.words,
            pages: d.pdfAudit.pages,
            pdf: d.pdf,
          })),
      };
      console.log(
        "Automatic package passed",
        pkg.documents.length,
        "documents",
        pkg.missingRequirements,
      );
    }
    fs.writeFileSync(
      "qa/document-upgrade-results.json",
      JSON.stringify(result, null, 2),
    );
  } finally {
    providers.close();
    store.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
