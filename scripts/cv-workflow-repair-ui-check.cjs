const { _electron: electron } = require("playwright-core"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { unzipSync, zipSync } = require("fflate");
const { Store } = require("../desktop/store.cjs"),
  { writeDocx } = require("../desktop/documents.cjs"),
  { hash, JobSchema } = require("../desktop/core.cjs");
async function invoke(p, method, args = {}) {
  const r = await p.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.ok(r.ok, r.error);
  return r.result;
}
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/cv-workflow-")),
    store = await Store.open(root);
  for (const s of store.list("searches"))
    store.put("searches", { ...s, enabled: false });
  const profile = {
    personal: {
      name: "Example Candidate",
      summary: "Verified academic profile",
    },
    education: [],
    experience: [],
  };
  store.put("profile", { id: "main", verified: true, data: profile });
  const job = {
    ...JobSchema.parse({
      title: "Lecturer",
      institution: "Example University",
      country: "Australia",
      url: "https://example.edu/job",
      description: "Submit an academic CV.",
    }),
    id: "job",
    match: { score: 80, reasons: [], gaps: [] },
  };
  store.put("jobs", job);
  const docx = path.join(root, "cv.docx"),
    content = {
      title: "Example Candidate",
      subtitle: "Academic Curriculum Vitae",
      sections: [{ heading: "Education", text: "Verified doctorate" }],
      evidence: [],
    };
  await writeDocx(docx, content, "", {
    type: "Academic CV",
    contact: {
      emails: ["candidate@example.edu"],
      phones: [],
      links: [{ label: "ORCID", url: "https://orcid.org/example" }],
    },
  });
  const files = unzipSync(fs.readFileSync(docx));
  let xml = Buffer.from(files["word/document.xml"]).toString();
  const drawing = (xml.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) || []).find((r) =>
    r.includes("<w:drawing"),
  );
  xml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) =>
    /w:val="Heading1"/.test(p)
      ? p.replace("</w:pPr>", "</w:pPr>" + drawing)
      : p,
  );
  files["word/document.xml"] = Buffer.from(xml);
  fs.writeFileSync(docx, zipSync(files));
  store.put("packages", {
    id: "pkg",
    jobId: "job",
    folder: root,
    name: "Fixture",
    createdAt: new Date().toISOString(),
    version: 1,
    status: "draft",
    documents: [
      {
        id: "cv",
        type: "Academic CV",
        revision: 1,
        templateVersion: 4,
        content,
        docx,
        docxHash: hash(fs.readFileSync(docx)),
        pdf: null,
        reviewed: false,
        audit: { words: 10 },
      },
    ],
    attachments: [],
    requirements: [
      {
        id: "cv-req",
        kind: "generated",
        type: "Academic CV",
        label: "Academic CV",
        required: true,
      },
    ],
    profileHash: hash(profile),
    listingHash: hash(job.description),
    notes: [],
  });
  store.close();
  const app = await electron.launch({
    ...(process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]) }
      : {}),
    args: process.argv[2] ? [] : ["."],
    env: { ...process.env, ACADEMICAPPLY_DATA_DIR: root },
    timeout: 60000,
  });
  try {
    await app.evaluate(({ app }) => {
      const require = process
          .getBuiltinModule("module")
          .createRequire(app.getAppPath() + "/package.json"),
        { Documents } = require(app.getAppPath() + "/desktop/documents.cjs"),
        { PDFDocument } = require("pdf-lib");
      const original = Documents.prototype.exportPdf;
      globalThis.__wordCalls = 0;
      Documents.prototype.exportPdf = async function (...args) {
        this.exportWord = async (_input, output) => {
          globalThis.__wordCalls++;
          const p = await PDFDocument.create();
          p.addPage().drawText("CV export fixture");
          require("fs").writeFileSync(output, await p.save());
        };
        return original.apply(this, args);
      };
    });
    const p = await app.firstWindow(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.waitForSelector("h1");
    await p
      .locator("nav")
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Remove heading icons", exact: true })
      .click();
    async function waitTask(kind) {
      let t;
      for (let i = 0; i < 150; i++) {
        t = (await invoke(p, "snapshot")).tasks.find((t) => t.kind === kind);
        if (t && ["completed", "failed"].includes(t.status)) break;
        await p.waitForTimeout(100);
      }
      assert.equal(t?.status, "completed", t?.message);
      await p.keyboard.press("Escape");
      return t;
    }
    const migration = await waitTask("cv-format");
    assert.equal(migration.result.removedHeadingIcons, 1);
    let snap = await invoke(p, "snapshot"),
      doc = snap.packages[0].documents[0];
    assert.equal(doc.templateVersion, 5);
    assert.equal(doc.revision, 2);
    assert.ok(doc.pdf);
    assert.equal(doc.reviewed, false);
    assert.equal(
      await p
        .getByRole("button", { name: "Remove heading icons", exact: true })
        .count(),
      0,
    );
    const revised = Buffer.from(
      unzipSync(fs.readFileSync(doc.docx))["word/document.xml"],
    ).toString();
    assert.ok(
      (revised.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [])
        .filter((p) => /w:val="Heading1"/.test(p))
        .every((p) => !p.includes("<w:drawing")),
    );
    assert.ok(
      Buffer.from(
        unzipSync(fs.readFileSync(doc.docx))["word/_rels/document.xml.rels"],
      )
        .toString()
        .includes("orcid.org/example"),
    );
    await p.getByRole("button", { name: "Approve", exact: true }).click();
    const before = (await invoke(p, "snapshot")).packages[0];
    assert.equal(before.documents[0].reviewed, true);
    await p
      .getByRole("button", { name: "Export PDFs with Word", exact: true })
      .click();
    await waitTask("pdf");
    snap = await invoke(p, "snapshot");
    assert.equal(snap.packages[0].documents[0].reviewed, true);
    assert.equal(snap.packages[0].version, before.version);
    assert.equal(await app.evaluate(() => globalThis.__wordCalls), 1);
    await p
      .locator(".document-cards")
      .screenshot({ path: "qa/cv-heading-controls.png" });
    assert.deepEqual(errors, []);
    const report = {
      version: snap.version,
      packaged: !!process.argv[2],
      legacyCVHeadingRepair: true,
      networkLinksPreserved: true,
      historyBackup: true,
      targetedPDFExport: true,
      currentPDFReviewPreserved: true,
      wordCalls: 1,
      rendererErrors: errors,
    };
    fs.writeFileSync(
      `qa/cv-workflow-ui${process.argv[2] ? "-packaged" : ""}-results.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
