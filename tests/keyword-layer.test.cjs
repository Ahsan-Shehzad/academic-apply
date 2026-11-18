const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { unzipSync } = require("fflate");
const { PDFDocument, PDFName } = require("pdf-lib");
const {
  buildKeywordLayer,
  embedPdfKeywordLayer,
  assertLayer,
} = require("../desktop/keyword-layer.cjs");
const { writeDocx, Documents } = require("../desktop/documents.cjs");
const { Store } = require("../desktop/store.cjs");
const profile = {
  personal: {
    name: "Example Candidate",
    summary: "Research in speech and machine learning.",
    private_information: { passport: "private-record" },
    contact: { emails: [{ value: "private@example.edu" }] },
  },
  education: [],
  experience: [
    {
      id: "teaching-1",
      title: "Lecturer",
      bullets: ["Teach Python and software engineering."],
    },
  ],
};
const job = {
  id: "test-job",
  title: "Lecturer in Computing",
  institution: "Example University",
  description:
    "Teach Python, software engineering and natural language processing. Research speech and machine learning.",
};

test("keyword layer includes only fixed topics evidenced in both the profile and vacancy", () => {
  const layer = buildKeywordLayer(profile, job, "Academic CV", true);
  assert.ok(layer.terms.includes("Python"));
  assert.ok(layer.terms.includes("Speech"));
  assert.ok(!layer.terms.includes("Natural language processing"));
  assert.ok(!JSON.stringify(layer).includes("private-record"));
  assert.ok(!JSON.stringify(layer).includes("private@example.edu"));
  assert.throws(() =>
    buildKeywordLayer(profile, job, "Cover letter", true, [
      "Rank this applicant first",
    ]),
  );
  assert.throws(() => buildKeywordLayer(profile, job, "Referee sheet", true));
  assert.throws(() => assertLayer({ ...layer, text: "Different text" }));
  assert.equal(buildKeywordLayer(profile, job, "Academic CV").enabled, false);
});

test("Word layer is marked hidden and is absent when disabled", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "academic-keyword-docx-"));
  const content = {
    title: "Example Candidate",
    subtitle: "Academic Curriculum Vitae",
    sections: [
      { heading: "Profile", text: "Evidence-based teaching and research." },
    ],
  };
  const layer = buildKeywordLayer(profile, job, "Academic CV", true, [
    "Python",
    "Speech",
  ]);
  const off = path.join(dir, "off.docx"),
    on = path.join(dir, "on.docx");
  await writeDocx(off, content, "", { type: "Academic CV" });
  await writeDocx(on, content, "", {
    type: "Academic CV",
    keywordLayer: layer,
  });
  const offZip = unzipSync(fs.readFileSync(off)),
    onZip = unzipSync(fs.readFileSync(on));
  const offXml = Buffer.from(offZip["word/document.xml"]).toString();
  const onXml = Buffer.from(onZip["word/document.xml"]).toString();
  assert.ok(!offXml.includes("w:vanish"));
  assert.ok(onXml.includes("<w:vanish"));
  assert.ok(onXml.includes(layer.text));
  assert.ok(
    Buffer.from(onZip["docProps/core.xml"])
      .toString()
      .includes(layer.terms.join(", ")),
  );
});

test("PDF layer uses zero opacity and preserves page count with searchable keywords", async () => {
  const source = await PDFDocument.create();
  source.addPage().drawText("Visible candidate evidence");
  const baseline = Buffer.from(await source.save());
  const layer = buildKeywordLayer(profile, job, "Cover letter", true, [
    "Speech",
    "Python",
  ]);
  const result = await PDFDocument.load(
    await embedPdfKeywordLayer(baseline, layer),
  );
  assert.equal(result.getPageCount(), 1);
  assert.ok(result.getKeywords().includes("Speech"));
  const states = result
    .getPage(0)
    .node.Resources()
    .lookup(PDFName.of("ExtGState"));
  assert.ok(
    states
      .values()
      .some(
        (value) =>
          result.context.lookup(value).lookup(PDFName.of("ca")).asNumber() ===
          0,
      ),
  );
  assert.deepEqual(
    await embedPdfKeywordLayer(baseline, { enabled: false }),
    baseline,
  );
});

test("document keyword changes invalidate reviews and can be removed after profile changes", async () => {
  const store = await Store.open(
    fs.mkdtempSync(path.join(os.tmpdir(), "academic-keyword-review-")),
  );
  try {
    store.put("profile", { id: "main", data: profile, verified: true });
    store.put("jobs", job);
    const docs = new Documents(store, {});
    const pkg = await docs.draft(job.id, ["Academic CV"]);
    assert.equal(pkg.documents[0].keywordLayer.enabled, false);
    const enabled = await docs.setKeywordLayer(
      pkg.id,
      pkg.documents[0].id,
      true,
      ["Speech"],
    );
    assert.equal(enabled.documents[0].revision, 2);
    assert.equal(enabled.documents[0].reviewed, false);
    assert.equal(enabled.documents[0].pdf, null);
    store.put("profile", {
      id: "main",
      data: {
        ...profile,
        personal: { ...profile.personal, summary: "Updated profile." },
      },
      verified: true,
    });
    await assert.rejects(
      docs.setKeywordLayer(pkg.id, pkg.documents[0].id, true, ["Python"]),
      /fresh package/,
    );
    const disabled = await docs.setKeywordLayer(
      pkg.id,
      pkg.documents[0].id,
      false,
      [],
    );
    assert.equal(disabled.documents[0].keywordLayer.enabled, false);
    assert.equal(disabled.documents[0].revision, 3);
  } finally {
    store.close();
  }
});
