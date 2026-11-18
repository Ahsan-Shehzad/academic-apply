const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { unzipSync, zipSync } = require("fflate"),
  { PDFDocument } = require("pdf-lib");
const { Store } = require("../desktop/store.cjs"),
  { Documents, writeDocx } = require("../desktop/documents.cjs"),
  { SupportingFiles } = require("../desktop/supporting-files.cjs"),
  { removeCvHeadingIcons } = require("../desktop/cv-format.cjs"),
  { hash } = require("../desktop/core.cjs"),
  { runSearch } = require("../desktop/search-runner.cjs"),
  { Discovery } = require("../desktop/discovery.cjs");
async function fixture(work) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-repair-")),
    store = await Store.open(root);
  try {
    await work(store, root);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
async function makePDF(file, text = "PDF fixture") {
  const p = await PDFDocument.create();
  p.addPage().drawText(text);
  fs.writeFileSync(file, await p.save());
}
async function seed(store, root) {
  const docx = path.join(root, "cv.docx"),
    content = {
      title: "Example Candidate",
      subtitle: "Academic Curriculum Vitae",
      sections: [
        { heading: "Education", text: "Verified doctoral qualification." },
      ],
      evidence: [],
    };
  await writeDocx(docx, content, "", {
    type: "Academic CV",
    contact: {
      emails: ["candidate@example.edu"],
      phones: [],
      links: [
        { label: "LinkedIn", url: "https://www.linkedin.com/in/example/" },
      ],
    },
  });
  store.put("profile", {
    id: "main",
    verified: true,
    data: {
      personal: { name: "Example Candidate" },
      education: [],
      experience: [],
    },
  });
  store.put("jobs", {
    id: "job",
    title: "Lecturer",
    institution: "Example University",
    description: "A lecturer vacancy.",
  });
  store.put("packages", {
    id: "pkg",
    jobId: "job",
    folder: root,
    name: "Example",
    version: 1,
    status: "draft",
    documents: [
      {
        id: "cv",
        type: "Academic CV",
        templateVersion: 4,
        revision: 1,
        content,
        docx,
        docxHash: hash(fs.readFileSync(docx)),
        pdf: null,
        reviewed: false,
      },
    ],
    attachments: [],
    requirements: [],
    notes: [],
  });
  const supplied = path.join(root, "degree.pdf");
  await makePDF(supplied, "degree");
  store.put("library", { id: "degree", name: "degree.pdf", path: supplied });
  return store.get("packages", "pkg");
}
test("deleting the last saved search persists across restart without changing settings", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-empty-search-"));
  let store = await Store.open(root);
  try {
    assert.equal(store.list("searches").length, 1);
    for (const s of store.list("searches")) store.remove("searches", s.id);
    const settings = store.settings();
    store.close();
    store = await Store.open(root);
    assert.equal(store.list("searches").length, 0);
    assert.deepEqual(store.settings(), settings);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("a failed built-in search does not prevent configured MCP tools from finding matching listings", () =>
  fixture(async (store) => {
    const discovery = new Discovery(store, {
      run: async () => {
        throw new Error("AI is not needed");
      },
    });
    discovery.search = async () => {
      throw new Error("No enabled connectors match this search");
    };
    discovery.import = async (url) => ({
      title: "Lecturer in Speech AI",
      institution: "Example University",
      country: "Australia",
      url,
      description: "Research and teach speech AI.",
      deadline: "2099-12-31",
    });
    let called = false;
    const connectors = {
      run: async (_id, _tool, _args, reader, _task, signal) => {
        called = true;
        await reader.import("https://example.edu/lecturer", signal);
        return { message: "Checked fixture" };
      },
    };
    const result = await runSearch(
      { store, discovery, connectors },
      {
        sources: ["disabled-source"],
        countries: ["Australia"],
        roles: ["Lecturer"],
        keywords: "speech",
        strategy: "sources",
        mcpTools: [{ connectorId: "fixture", tool: "search", arguments: {} }],
      },
      () => {},
      new AbortController().signal,
    );
    assert.equal(called, true);
    assert.equal(result.added, 1);
    assert.equal(result.failed, 1);
    assert.equal(store.list("jobs").length, 1);
  }));
test("heading-only CV repair preserves all text, network drawings and every other Word package part", () =>
  fixture(async (store, root) => {
    const pkg = await seed(store, root),
      doc = pkg.documents[0],
      entries = unzipSync(fs.readFileSync(doc.docx));
    let xml = Buffer.from(entries["word/document.xml"]).toString();
    const drawing = (xml.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) || []).find(
      (r) => r.includes("<w:drawing"),
    );
    let injected = false;
    xml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
      if (injected || !/w:val="Heading1"/.test(p)) return p;
      injected = true;
      return p.replace("</w:pPr>", "</w:pPr>" + drawing);
    });
    entries["word/document.xml"] = Buffer.from(xml);
    const original = Buffer.from(zipSync(entries));
    fs.writeFileSync(doc.docx, original);
    const result = removeCvHeadingIcons(original),
      output = unzipSync(result.buffer),
      revised = Buffer.from(output["word/document.xml"]).toString();
    assert.equal(result.removed, 1);
    const texts = (x) =>
      [...x.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((m) => m[1])
        .filter((s) => s.trim());
    assert.deepEqual(texts(xml), texts(revised));
    for (const name of Object.keys(entries))
      if (name !== "word/document.xml")
        assert.deepEqual(output[name], entries[name], name);
    assert.equal(
      (revised.match(/<w:drawing\b/g) || []).length,
      (xml.match(/<w:drawing\b/g) || []).length - 1,
    );
    const docs = new Documents(store, {}),
      updated = docs.refreshCVFormatting("pkg", "cv");
    assert.equal(updated.removedHeadingIcons, 1);
    assert.deepEqual(updated.documents[0].content, doc.content);
    assert.equal(updated.documents[0].revision, 2);
    assert.ok(fs.existsSync(path.join(root, "history", "cv-r1.docx")));
    assert.equal(docs.refreshCVFormatting("pkg", "cv").removedHeadingIcons, 0);
  }));
test("PDF export retains supporting files added while Word is working and skips current reviewed PDFs", () =>
  fixture(async (store, root) => {
    await seed(store, root);
    let calls = 0;
    const docs = new Documents(
      store,
      {},
      {
        exportWord: async (_input, output) => {
          calls++;
          new SupportingFiles(docs).attach("pkg", ["degree"]);
          await makePDF(output);
        },
      },
    );
    const exported = await docs.exportPdf("pkg");
    assert.equal(exported.attachments.length, 1);
    assert.equal(exported.exportedCount, 1);
    docs.review("pkg", ["cv"]);
    const before = store.get("packages", "pkg");
    const reused = await docs.exportPdf("pkg");
    assert.equal(reused.exportedCount, 0);
    assert.equal(calls, 1);
    assert.equal(reused.documents[0].reviewed, true);
    assert.equal(reused.version, before.version);
    assert.deepEqual(
      reused.documents[0].approvedFiles,
      before.documents[0].approvedFiles,
    );
  }));
test("an in-flight PDF export cannot be approved and detects an external Word change without replacing the old PDF", () =>
  fixture(async (store, root) => {
    let pkg = await seed(store, root),
      release,
      started;
    const waiting = new Promise((r) => (release = r)),
      start = new Promise((r) => (started = r));
    const oldPDF = path.join(root, "cv.pdf");
    await makePDF(oldPDF, "Previous PDF");
    pkg.documents[0].pdf = oldPDF;
    pkg.documents[0].pdfHash = hash(fs.readFileSync(oldPDF));
    store.put("packages", pkg);
    const previous = fs.readFileSync(oldPDF);
    const docs = new Documents(
      store,
      {},
      {
        exportWord: async (input, output) => {
          started();
          await waiting;
          fs.appendFileSync(input, Buffer.from("Changed externally"));
          await makePDF(output, "Stale output");
        },
      },
    );
    const exportRun = docs.exportPdf("pkg", undefined, undefined, {
      force: true,
    });
    await start;
    assert.throws(
      () => docs.review("pkg", ["cv"]),
      /current document operation/,
    );
    await assert.rejects(
      docs.edit("pkg", "cv", pkg.documents[0].content),
      /current document operation/,
    );
    release();
    await assert.rejects(exportRun, /changed during export/);
    assert.deepEqual(fs.readFileSync(oldPDF), previous);
    assert.equal(docs.exporting.size, 0);
    assert.throws(() => docs.review("pkg", ["cv"]), /changed after export/);
    assert.ok(!fs.readdirSync(root).some((n) => n.startsWith(".export-")));
  }));
test("saving an edited document merges current package attachments instead of overwriting them", () =>
  fixture(async (store, root) => {
    const pkg = await seed(store, root),
      docs = new Documents(store, {});
    const content = {
      ...pkg.documents[0].content,
      sections: [
        { heading: "Education", text: "Updated verified qualification text." },
      ],
    };
    const pending = docs.edit("pkg", "cv", content);
    new SupportingFiles(docs).attach("pkg", ["degree"]);
    await pending;
    const updated = store.get("packages", "pkg");
    assert.equal(updated.attachments.length, 1);
    assert.deepEqual(updated.documents[0].content.sections, content.sections);
    assert.equal(docs.editing.size, 0);
  }));

test("a package change during PDF merging is preserved and cannot produce a stale combined packet", () =>
  fixture(async (store, root) => {
    await seed(store, root);
    const docs = new Documents(store, {}),
      support = new SupportingFiles(docs);
    support.attach("pkg", ["degree"]);
    const originalLoad = PDFDocument.load;
    let changed = false;
    try {
      PDFDocument.load = async (...args) => {
        const pdf = await originalLoad.apply(PDFDocument, args);
        if (!changed) {
          changed = true;
          const p = store.get("packages", "pkg");
          support.assign("pkg", p.attachments[0].id, []);
        }
        return pdf;
      };
      const file = store.get("packages", "pkg").attachments[0].path;
      await assert.rejects(
        docs.combine("pkg", [], [file]),
        /package changed while combining/,
      );
      assert.equal(store.get("packages", "pkg").attachments.length, 1);
      assert.ok(
        !fs.existsSync(path.join(root, "Combined-Supporting-Packet.pdf")),
      );
    } finally {
      PDFDocument.load = originalLoad;
    }
  }));

test("new default schedules have a due time and a deleted in-flight search is not recreated on completion", () =>
  fixture(async (store) => {
    const search = store.list("searches")[0];
    assert.ok(Number.isFinite(Date.parse(search.nextRun)));
    assert.ok(Date.parse(search.nextRun) > Date.now());
    store.remove("searches", search.id);
    assert.equal(
      require("../desktop/tasks.cjs").scheduleAfterRun(store, search.id),
      null,
    );
    assert.equal(store.list("searches").length, 0);
  }));
