const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { PDFDocument } = require("pdf-lib"),
  { unzipSync } = require("fflate");
const { Store } = require("../desktop/store.cjs"),
  { Documents } = require("../desktop/documents.cjs"),
  {
    SupportingFiles,
    eligibleAttachments,
  } = require("../desktop/supporting-files.cjs");
const {
    planFromJob,
    normalizeRequirement,
    packageCoverage,
  } = require("../desktop/document-requirements.cjs"),
  { hash } = require("../desktop/core.cjs"),
  { packageFiles } = require("../desktop/application-browser.cjs"),
  { Browser } = require("../desktop/browser.cjs");
async function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-support-")),
    store = await Store.open(root);
  try {
    const profile = {
      personal: {
        name: "Example Candidate",
        summary: "Research in speech AI and university teaching.",
        contact: { emails: [{ value: "candidate@example.edu" }] },
      },
      education: [],
      experience: [],
      references: [
        {
          name: "Professor Example",
          title: "Professor",
          institution: "Example Institute",
          relationship: "Doctoral supervisor",
          email: "private-ref@example.edu",
          phone: "private-phone",
        },
      ],
    };
    store.put("profile", { id: "main", verified: true, data: profile });
    store.put("settings", { ...store.settings(), cloudConsent: true });
    store.put("jobs", {
      id: "job",
      title: "Lecturer in Speech AI",
      institution: "Example University",
      description:
        "Submit a CV, two transcripts, three research papers and two signed reference letters.",
    });
    store.put("packages", {
      id: "pkg",
      jobId: "job",
      folder: root,
      name: "Fixture",
      documents: [],
      attachments: [],
      requirements: planFromJob(store.getJob("job")).requirements,
      status: "draft",
      version: 1,
      profileHash: hash(profile),
      listingHash: hash(store.getJob("job").description),
    });
    const docs = new Documents(store, {
        run: async () =>
          JSON.stringify({
            title: "Example Candidate",
            subtitle: "Statement",
            sections: [
              {
                heading: "",
                text: "Dear Selection Committee,\n\nExample Candidate researches speech AI and teaches university computing. This work aligns with the advertised academic role.\n\nYours sincerely,\nProfessor Example",
              },
            ],
            evidence: ["personal-summary"],
          }),
      }),
      support = new SupportingFiles(docs);
    await fn({ root, store, docs, support, profile });
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
async function pdf(file, label) {
  const p = await PDFDocument.create();
  p.addPage().drawText(label);
  fs.writeFileSync(file, await p.save());
}
test("supporting counts follow the matching requirement and official records remain attachments", () => {
  const p = planFromJob({
    description:
      "Submit a CV, two academic transcripts, three research papers and two signed reference letters.",
  });
  for (const [label, count] of [
    ["Academic CV", 1],
    ["Academic transcripts", 2],
    ["Published writing sample", 3],
    ["Recommendation letters", 2],
  ])
    assert.equal(
      p.requirements.find((r) => r.label === label)?.minFiles,
      count,
      label,
    );
  assert.equal(
    normalizeRequirement({
      label: "Academic transcripts",
      kind: "generated",
      type: "Application statement",
      instructions: "two transcripts",
    }).kind,
    "attachment",
  );
  assert.equal(
    normalizeRequirement({
      label: "Reference letters",
      kind: "attachment",
      instructions: "Upload two reference letters directly to the portal.",
    }).submissionMethod,
    "applicant",
  );
  assert.equal(
    normalizeRequirement({
      label: "Reference letters",
      kind: "attachment",
      instructions:
        "Two confidential letters submitted directly by the referees.",
    }).submissionMethod,
    "referee_direct",
  );
});
test("multiple distinct files, shared assignments, removal and source preservation update readiness and invalidate approvals", () =>
  fixture(async ({ root, store, support }) => {
    const pkg = store.get("packages", "pkg");
    pkg.requirements = [
      {
        id: "a",
        label: "Academic transcripts",
        kind: "attachment",
        required: true,
        minFiles: 2,
      },
      {
        id: "b",
        label: "Degree certificates",
        kind: "attachment",
        required: true,
        minFiles: 1,
      },
    ];
    store.put("packages", pkg);
    store.put("applications", {
      id: "app",
      packageId: "pkg",
      approval: { id: "old" },
    });
    for (const id of ["one", "two"]) {
      const file = path.join(root, id + ".pdf");
      await pdf(file, id);
      store.put("library", { id, name: id + ".pdf", path: file });
    }
    support.attach("pkg", ["one", "two"], "a");
    let current = store.get("packages", "pkg");
    assert.equal(current.status, "draft");
    assert.equal(packageCoverage(current)[0].count, 2);
    support.assign("pkg", current.attachments[0].id, ["a", "b"]);
    current = store.get("packages", "pkg");
    assert.equal(current.status, "ready");
    assert.equal(store.get("applications", "app").approval, null);
    const first = current.attachments[0],
      original = path.join(root, "one.pdf");
    support.remove("pkg", first.id);
    current = store.get("packages", "pkg");
    assert.equal(current.status, "draft");
    assert.ok(fs.existsSync(original));
    assert.ok(fs.existsSync(first.path));
    const copy = path.join(root, "same.pdf");
    fs.copyFileSync(path.join(root, "two.pdf"), copy);
    store.put("library", { id: "duplicate", name: "copy.pdf", path: copy });
    support.attach("pkg", ["duplicate"], "a");
    assert.equal(packageCoverage(store.get("packages", "pkg"))[0].count, 1);
    const before = store.get("packages", "pkg");
    assert.throws(
      () => support.attach("pkg", ["one", "missing"], "a"),
      /unavailable/,
    );
    assert.deepEqual(store.get("packages", "pkg"), before);
  }));
test("local file import copies several originals into the library and package without changing sources", () =>
  fixture(async ({ root, store, support }) => {
    const file = path.join(root, "degree.pdf");
    await pdf(file, "degree");
    const bytes = fs.readFileSync(file),
      r = store
        .get("packages", "pkg")
        .requirements.find((r) => r.kind === "attachment");
    support.importFiles("pkg", [file], r.id);
    const attachment = store.get("packages", "pkg").attachments[0];
    assert.ok(fs.existsSync(attachment.path));
    assert.notEqual(attachment.path, file);
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.equal(store.list("library").length, 1);
  }));
test("missing and optional narratives can be created in place without losing supporting files", () =>
  fixture(async ({ root, store, docs, support }) => {
    support.addRequirement("pkg", {
      label: "Research fit narrative",
      kind: "generated",
      type: "Research statement",
      required: false,
      minFiles: 1,
      instructions: "One page",
    });
    const req = store.get("packages", "pkg").requirements.at(-1);
    const file = path.join(root, "paper.pdf");
    await pdf(file, "paper");
    store.put("library", { id: "paper", name: "paper.pdf", path: file });
    support.attach("pkg", ["paper"]);
    await docs.addDocument("pkg", req.id);
    const pkg = store.get("packages", "pkg");
    assert.equal(pkg.attachments.length, 1);
    assert.equal(pkg.documents.length, 1);
    assert.equal(pkg.documents[0].requirementId, req.id);
    assert.ok(fs.existsSync(pkg.documents[0].docx));
    await assert.rejects(docs.addDocument("pkg", req.id), /already exists/);
    store.put("settings", { ...store.settings(), cloudConsent: false });
    support.addRequirement("pkg", {
      label: "Additional statement",
      kind: "generated",
      type: "Application statement",
      required: true,
      minFiles: 1,
      instructions: "",
    });
    await assert.rejects(
      docs.addDocument(
        "pkg",
        store.get("packages", "pkg").requirements.at(-1).id,
      ),
      /Enable AI/,
    );
  }));
test("reference drafts use the chosen referee identity and are excluded from coverage, every upload mode and merged packets", () =>
  fixture(async ({ root, store, docs, support }) => {
    const r = store
      .get("packages", "pkg")
      .requirements.find((r) => r.draftable === "reference");
    let prompt;
    const run = docs.providers.run;
    docs.providers.run = async (p) => ((prompt = p), run());
    await support.draftReferences("pkg", r.id, ["referee-0"]);
    let pkg = store.get("packages", "pkg"),
      doc = pkg.documents[0];
    assert.equal(doc.purpose, "referee_review");
    assert.equal(doc.content.title, "Professor Example");
    assert.ok(prompt.includes("Doctoral supervisor"));
    assert.ok(!prompt.includes("private-ref@example.edu"));
    assert.ok(!prompt.includes("private-phone"));
    assert.equal(packageCoverage(pkg).find((x) => x.id === r.id).count, 0);
    const xml = Buffer.from(
      unzipSync(fs.readFileSync(doc.docx))["word/document.xml"],
    ).toString();
    assert.ok(xml.includes("Reference Letter"));
    assert.ok(!xml.includes("Cover Letter"));
    assert.ok(!xml.includes("candidate@example.edu"));
    const fake = path.join(root, "draft.pdf");
    await pdf(fake, "Draft");
    doc.pdf = fake;
    doc.reviewed = true;
    store.put("packages", pkg);
    assert.deepEqual(packageFiles(pkg), []);
    assert.deepEqual(packageFiles(pkg, true), []);
    await assert.rejects(docs.combine("pkg", [doc.id]), /Referee-review/);
    store.put("applications", {
      id: "app",
      packageId: "pkg",
      status: "preparing",
      snapshot: { fields: [] },
    });
    const browser = new Browser(store, {});
    browser.inspect = async () => store.get("applications", "app");
    await assert.rejects(
      browser.upload("app", "field", fake),
      /current submission package/,
    );
    await support.draftReferences("pkg", r.id, ["referee-0"]);
    assert.equal(store.get("packages", "pkg").documents.length, 1);
    pkg = store.get("packages", "pkg");
    pkg.requirements = [r];
    pkg.status = "ready";
    pkg.documents[0].pdf = null;
    pkg.documents[0].approvedFiles = { docx: "stale", pdf: "stale" };
    for (const name of ["signed-one", "signed-two"]) {
      const file = path.join(root, name + ".pdf");
      await pdf(file, name);
      pkg.attachments.push({
        path: file,
        name,
        hash: hash(fs.readFileSync(file)),
        requirementId: r.id,
      });
    }
    store.put("packages", pkg);
    store.put("applications", {
      id: "app",
      jobId: "job",
      packageId: "pkg",
      status: "preparing",
      uploads: [],
      snapshot: {
        url: "https://example.edu/apply",
        fields: [],
        validation: [],
        buttons: [{ key: "submit", terminal: true, disabled: false }],
      },
    });
    const approved = await browser.approve("app", "submit", {
      documents: true,
      answers: true,
      uploads: true,
      declarations: true,
    });
    assert.ok(approved.approval);
  }));
test("separate referee submissions require manual confirmation counts instead of draft or uploaded files", () =>
  fixture(async ({ store, support, docs }) => {
    const pkg = store.get("packages", "pkg");
    pkg.requirements = [
      normalizeRequirement({
        id: "letters",
        label: "Recommendation letters",
        kind: "attachment",
        required: true,
        instructions:
          "Two confidential letters submitted directly by referees.",
      }),
    ];
    store.put("packages", pkg);
    assert.throws(
      () => support.attach("pkg", [], "letters"),
      /separate referee/,
    );
    support.external("pkg", "letters", 1, "One referee confirmed");
    assert.equal(store.get("packages", "pkg").status, "draft");
    support.external(
      "pkg",
      "letters",
      2,
      "Both referees confirmed direct submission",
    );
    assert.equal(store.get("packages", "pkg").status, "ready");
    assert.equal(docs.review("pkg", []).status, "ready");
  }));
test("combined supporting PDFs include selected originals and become unavailable after source changes", () =>
  fixture(async ({ root, store, docs, support }) => {
    for (const id of ["paper1", "paper2"]) {
      const file = path.join(root, id + ".pdf");
      await pdf(file, id);
      store.put("library", { id, name: id + ".pdf", path: file });
    }
    support.attach("pkg", ["paper1", "paper2"]);
    const pkg = store.get("packages", "pkg");
    await docs.combine(
      "pkg",
      [],
      pkg.attachments.map((a) => a.path),
    );
    const current = store.get("packages", "pkg"),
      combined = current.attachments.find((a) => a.derived);
    assert.equal(
      (await PDFDocument.load(fs.readFileSync(combined.path))).getPageCount(),
      2,
    );
    assert.ok(eligibleAttachments(current).includes(combined));
    await pdf(current.attachments[0].path, "changed");
    assert.ok(!eligibleAttachments(current).includes(combined));
  }));
