const { _electron: electron } = require("playwright-core"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib"),
  { Store } = require("../desktop/store.cjs"),
  { hash, JobSchema } = require("../desktop/core.cjs"),
  { planFromJob } = require("../desktop/document-requirements.cjs");
async function invoke(p, method, args = {}) {
  const r = await p.evaluate(
    ({ method, args }) => window.academic.call(method, args),
    { method, args },
  );
  assert.equal(r.ok, true, r.error);
  return r.result;
}
async function pdf(file, label) {
  const p = await PDFDocument.create();
  p.addPage().drawText(label);
  fs.writeFileSync(file, await p.save());
}
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/support-ui-")),
    store = await Store.open(root);
  for (const s of store.list("searches"))
    store.put("searches", { ...s, enabled: false });
  store.put("settings", { ...store.settings(), cloudConsent: true });
  const profile = {
    personal: {
      name: "Example Candidate",
      summary: "Speech AI research and university teaching.",
    },
    education: [],
    experience: [],
    references: [
      { name: "Professor One", relationship: "Doctoral supervisor" },
      { name: "Professor Two", relationship: "Research collaborator" },
    ],
  };
  store.put("profile", { id: "main", verified: true, data: profile });
  const job = {
    ...JobSchema.parse({
      title: "Lecturer in Speech AI",
      institution: "Example University",
      country: "Australia",
      url: "https://example.edu/job",
      description:
        "Submit a research statement. Supply two academic transcripts, three research papers and two signed reference letters. Upload signed letters with the application.",
    }),
    id: "job",
    match: { score: 90, reasons: [], gaps: [] },
  };
  store.put("jobs", job);
  store.put("packages", {
    id: "pkg",
    jobId: "job",
    folder: root,
    createdAt: new Date().toISOString(),
    version: 1,
    status: "draft",
    documents: [],
    attachments: [],
    notes: [],
    requirements: planFromJob(job).requirements,
    profileHash: hash(profile),
    listingHash: hash(job.description),
    requirementSource: "Listing fixture",
  });
  const originals = {};
  for (const name of [
    "MSc transcript",
    "PhD degree and transcript",
    "Research paper 1",
    "Research paper 2",
    "Research paper 3",
    "Signed reference One",
    "Signed reference Two",
  ]) {
    const file = path.join(root, name + ".pdf");
    await pdf(file, name);
    originals[name] = file;
    if (name.includes("transcript"))
      store.put("library", { id: name, name: name + ".pdf", path: file });
  }
  store.put("library", {
    id: "bibliography",
    name: "publications.bib",
    path: path.join(root, "publications.bib"),
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
    await app.evaluate(
      ({ app }, files) => {
        const require = process
            .getBuiltinModule("module")
            .createRequire(app.getAppPath() + "/package.json"),
          path = require("node:path"),
          { Providers } = require(
            path.join(app.getAppPath(), "desktop/providers.cjs"),
          );
        Providers.prototype.run = async () =>
          JSON.stringify({
            title: "Example Candidate",
            subtitle: "Statement",
            sections: [
              {
                heading: "",
                text: "Dear Selection Committee,\n\nExample Candidate conducts research in speech AI and contributes to university teaching.\n\nYours sincerely,\nProfessor Example",
              },
            ],
            evidence: ["personal-summary"],
          });
        let calls = 0;
        require("electron").dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: ++calls === 1 ? files.papers : files.letters,
        });
      },
      {
        papers: [1, 2, 3].map((n) => originals["Research paper " + n]),
        letters: [
          originals["Signed reference One"],
          originals["Signed reference Two"],
        ],
      },
    );
    const p = await app.firstWindow(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(15000);
    await p.waitForSelector("h1");
    await p
      .locator("nav")
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    const card = (label) =>
      p.getByRole("group", { name: label + " requirement", exact: true });
    async function selectRequirement(label) {
      await p
        .getByRole("combobox", { name: /^Assign new files to requirement/ })
        .click();
      await p.getByRole("option", { name: new RegExp("^" + label) }).click();
    }
    await selectRequirement("Academic transcripts");
    for (const name of ["MSc transcript", "PhD degree and transcript"]) {
      await p
        .getByRole("combobox", {
          name: "Select multiple files from evidence library",
          exact: true,
        })
        .fill(name);
      await p.getByRole("option", { name: name + ".pdf", exact: true }).click();
    }
    await p
      .getByRole("button", { name: "Add 2 library files", exact: true })
      .click();
    await card("Academic transcripts")
      .getByText("Required · 2 / 2 files", { exact: true })
      .waitFor();
    await selectRequirement("Published writing sample");
    await p
      .getByRole("button", { name: "Suggest library matches", exact: true })
      .click();
    assert.equal(
      await p
        .getByRole("button", { name: "Add library files", exact: true })
        .isEnabled(),
      false,
    );
    await p
      .getByRole("button", { name: "Add files from computer", exact: true })
      .click();
    await card("Published writing sample")
      .getByText("Required · 3 / 3 files", { exact: true })
      .waitFor();
    await card("Recommendation letters")
      .getByRole("button", {
        name: "Prepare referee-review letters",
        exact: true,
      })
      .click();
    let d = p.locator(".MuiDialog-paper");
    await d
      .getByRole("button", { name: "Create 2 review drafts", exact: true })
      .click();
    async function waitTask(kind) {
      let t;
      for (let i = 0; i < 150; i++) {
        const s = await invoke(p, "snapshot");
        t = s.tasks.find((t) => t.kind === kind);
        if (t && ["completed", "failed"].includes(t.status)) break;
        await p.waitForTimeout(200);
      }
      assert.equal(t?.status, "completed", t?.message);
      await p.keyboard.press("Escape");
      return t;
    }
    await waitTask("supporting-draft");
    let snap = await invoke(p, "snapshot");
    assert.equal(snap.packages[0].documents.length, 2);
    assert.ok(
      snap.packages[0].documents.every((d) => d.submissionEligible === false),
    );
    assert.equal(
      snap.packages[0].coverage.find(
        (r) => r.label === "Recommendation letters",
      ).count,
      0,
    );
    await selectRequirement("Recommendation letters");
    await p
      .getByRole("button", { name: "Add files from computer", exact: true })
      .click();
    await card("Recommendation letters")
      .getByText("Required · 2 / 2 files", { exact: true })
      .waitFor();
    await card("Research statement")
      .getByRole("button", { name: "Create required document", exact: true })
      .click();
    await waitTask("document-add");
    snap = await invoke(p, "snapshot");
    assert.equal(snap.packages[0].documents.length, 3);
    assert.equal(snap.packages[0].attachments.length, 7);
    await p
      .getByRole("button", { name: "Add requirement", exact: true })
      .click();
    d = p.locator(".MuiDialog-paper");
    await d
      .getByLabel("Document or file requirement", { exact: true })
      .fill("Degree certificates");
    await d
      .getByRole("button", { name: "Add requirement", exact: true })
      .click();
    await d.waitFor({ state: "hidden" });
    const file = p
      .locator(".support-file-card")
      .filter({ hasText: "PhD degree and transcript.pdf" });
    await file.getByRole("combobox").click();
    await p
      .getByRole("option", { name: "Degree certificates", exact: true })
      .click();
    await p.keyboard.press("Escape");
    await card("Degree certificates")
      .getByText("Required · 1 / 1 files", { exact: true })
      .waitFor();
    await p
      .getByRole("button", { name: "Build a combined PDF", exact: true })
      .click();
    d = p.locator(".MuiDialog-paper");
    assert.equal(await d.getByLabel(/Professor One/).count(), 0);
    for (const n of [1, 2, 3])
      await d
        .getByRole("checkbox", {
          name: "Research paper " + n + ".pdf",
          exact: true,
        })
        .check();
    await d
      .getByRole("button", { name: "Create combined PDF", exact: true })
      .click();
    await d.waitFor({ state: "hidden" });
    snap = await invoke(p, "snapshot");
    const combined = snap.packages[0].attachments.find((a) => a.derived);
    assert.ok(combined);
    assert.equal(
      (await PDFDocument.load(fs.readFileSync(combined.path))).getPageCount(),
      3,
    );
    await p
      .getByRole("button", {
        name: "Remove MSc transcript.pdf from package",
        exact: true,
      })
      .click();
    await card("Academic transcripts")
      .getByText("Required · 1 / 2 files", { exact: true })
      .waitFor();
    assert.ok(fs.existsSync(originals["MSc transcript"]));
    snap = await invoke(p, "snapshot");
    assert.ok(!snap.packages[0].attachments.some((a) => a.derived));
    await p
      .locator(".package-requirements")
      .screenshot({ path: "qa/supporting-requirements.png" });
    await p
      .locator(".attachment-section")
      .screenshot({ path: "qa/supporting-files.png" });
    await p
      .locator(".document-cards")
      .screenshot({ path: "qa/supporting-reference-drafts.png" });
    assert.deepEqual(errors, []);
    const report = {
      version: snap.version,
      packaged: !!process.argv[2],
      multiLibraryFiles: true,
      localMultiFileImport: true,
      countsAndMultiAssignments: true,
      refereeDrafts: 2,
      draftsExcludedFromSubmission: true,
      signedLettersTracked: true,
      narrativeAddedInPlace: true,
      selectedCombinedPages: 3,
      removalPreservesOriginals: true,
      rendererErrors: errors,
    };
    fs.writeFileSync(
      `qa/supporting-ui${process.argv[2] ? "-packaged" : ""}-results.json`,
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
