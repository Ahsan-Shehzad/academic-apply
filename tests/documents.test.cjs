const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { unzipSync } = require("fflate");
const { writeDocx } = require("../desktop/documents.cjs");
const { factsFrom, documentOutputSchema } = require("../desktop/documents.cjs");
test("CV section headings are text-only while contact and network icons and labels are retained", async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "academic-icons-"));
  const file = path.join(folder, "cv.docx");
  try {
    await writeDocx(
      file,
      {
        title: "Example Candidate",
        subtitle: "Academic Curriculum Vitae",
        sections: [
          { heading: "Education", text: "PhD in Computing" },
          { heading: "Publications", text: "A verified publication." },
        ],
      },
      "",
      {
        type: "Academic CV",
        contact: {
          emails: ["candidate@example.edu"],
          phones: ["+441234567890"],
          location: "Example University",
          links: [
            { label: "LinkedIn", url: "https://www.linkedin.com/in/example/" },
            {
              label: "Google Scholar",
              url: "https://scholar.google.com/citations?user=example",
            },
            { label: "ORCID", url: "https://orcid.org/0000-example" },
          ],
        },
      },
    );
    const zip = unzipSync(fs.readFileSync(file));
    const xml = Buffer.from(zip["word/document.xml"]).toString();
    const rels = Buffer.from(zip["word/_rels/document.xml.rels"]).toString();
    for (const text of [
      "Education",
      "Publications",
      "LinkedIn",
      "Google Scholar",
      "ORCID",
      "candidate@example.edu",
    ])
      assert.ok(xml.includes(text), text);
    const headings = (xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || []).filter(
      (p) => /<w:pStyle\b[^>]*w:val="Heading1"/.test(p),
    );
    assert.equal(headings.length, 2);
    assert.ok(headings.every((p) => !p.includes("<w:drawing")));
    assert.equal((xml.match(/<w:drawing>/g) || []).length, 6);
    assert.ok(rels.includes("https://orcid.org/0000-example"));
    assert.ok(Object.keys(zip).some((f) => /word\/media\/.+\.png$/.test(f)));
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
test("document generation schema restricts evidence to real profile identifiers", () => {
  const facts = factsFrom({
    personal: { summary: "An approved summary." },
    education: [{ id: null, degree: "PhD" }],
    experience: [{ id: "lecturer-1", title: "Lecturer" }],
    publications: { index: [{ key: "paper-1", title: "Paper" }] },
  });
  assert.deepEqual(
    facts.map((f) => f.id),
    ["personal-summary", "education-0", "lecturer-1", "paper-1"],
  );
  const schema = documentOutputSchema(facts);
  assert.deepEqual(
    schema.properties.evidence.items.enum,
    facts.map((f) => f.id),
  );
  assert.equal(schema.additionalProperties, false);
  assert.ok(!schema.properties.evidence.items.enum.includes("invented-claim"));
});

test("letter body stays regular weight with single paragraph salutation and no CV record emphasis", async () => {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "academic-letter-")),
    "letter.docx",
  );
  await writeDocx(
    file,
    {
      title: "Example Candidate",
      subtitle: "Cover Letter",
      sections: [
        {
          heading: "",
          text: "Dear Selection Committee,\n\nI teach computing with practical assessment and project supervision.",
        },
      ],
      letter: {
        date: "16 November 2026",
        recipient: "Example University",
        subject: "Lecturer in Computing",
      },
    },
    "candidate@example.edu",
    { type: "Cover letter" },
  );
  const zip = unzipSync(fs.readFileSync(file));
  const xml = Buffer.from(zip["word/document.xml"]).toString();
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g);
  for (const needle of ["Dear Selection Committee", "I teach computing"]) {
    const paragraph = paragraphs.find((p) => p.includes(needle));
    assert.ok(paragraph);
    assert.match(paragraph, /<w:b w:val="false"\s*\/>/);
    assert.ok(!/<w:b\s*\/>/.test(paragraph));
  }
  assert.ok(xml.includes("Application for Lecturer in Computing"));
});
