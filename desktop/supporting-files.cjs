"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const { z } = require("zod");
const { id, hash, now, slug } = require("./core.cjs");
const {
  normalizeRequirement,
  attachmentRequirements,
  packageCoverage,
  packageReady,
  DOCUMENT_TYPES,
} = require("./document-requirements.cjs");
function refereeRecords(profile) {
  const records = profile?.references || profile?.recommendations || [];
  return (Array.isArray(records) ? records : [])
    .map((r, i) => ({
      id: `referee-${i}`,
      name: r.name || r.full_name || "",
      title: r.title || r.position || r.role || "",
      institution: r.organization || r.institution || "",
      relationship: r.relationship || "",
    }))
    .filter((r) => r.name);
}
function eligibleAttachments(pkg) {
  const originals = (pkg.attachments || []).filter(
    (a) => !a.derived && a.submissionEligible !== false,
  );
  const sources = new Set([
    ...originals.map((a) => a.path),
    ...(pkg.documents || [])
      .filter((d) => d.submissionEligible !== false && d.reviewed)
      .map((d) => d.pdf),
  ]);
  return (pkg.attachments || []).filter(
    (a) =>
      a.submissionEligible !== false &&
      (!a.derived ||
        (a.sourceFiles?.length &&
          a.sourceFiles.every(
            (f) =>
              sources.has(f.path) &&
              fs.existsSync(f.path) &&
              hash(fs.readFileSync(f.path)) === f.hash,
          ))),
  );
}
class SupportingFiles {
  constructor(documents) {
    this.documents = documents;
    this.store = documents.store;
  }
  package(packageId) {
    const p = this.store.get("packages", packageId);
    if (!p) throw new Error("Package not found");
    p.requirements = (p.requirements || []).map(normalizeRequirement);
    return p;
  }
  save(pkg, { clearCombined = true } = {}) {
    if (clearCombined)
      pkg.attachments = pkg.attachments.filter((a) => !a.derived);
    pkg.version++;
    pkg.status = packageReady(pkg) ? "ready" : "draft";
    this.documents.invalidateApprovals(pkg.id);
    this.documents.manifest(pkg);
    return pkg;
  }
  requirement(pkg, requirementId) {
    if (!requirementId) return null;
    const r = pkg.requirements?.find((r) => r.id === requirementId);
    if (!r || r.kind === "generated")
      throw new Error(
        "Select a supporting-file requirement from this package.",
      );
    if (normalizeRequirement(r).submissionMethod === "referee_direct")
      throw new Error(
        "This listing requires separate referee submission. Track the referee's confirmed submission instead of uploading a letter.",
      );
    return r;
  }
  attach(packageId, libraryIds, requirementId) {
    const pkg = this.package(packageId);
    this.requirement(pkg, requirementId);
    const items = libraryIds.map((libraryId) => {
      const item = this.store.get("library", libraryId);
      if (
        !item ||
        !fs.existsSync(item.path) ||
        !fs.statSync(item.path).isFile()
      )
        throw new Error("Supporting file is unavailable");
      return item;
    });
    for (const item of items) {
      const existing = pkg.attachments.find((a) => a.libraryId === item.id);
      const target =
        existing?.path ||
        path.join(
          pkg.folder,
          "supporting",
          `${slug(item.id).slice(0, 16)}-${path.basename(item.path)}`,
        );
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(item.path, target);
      const requirementIds = [
        ...new Set([
          ...(existing ? attachmentRequirements(existing) : []),
          ...(requirementId ? [requirementId] : []),
        ]),
      ];
      const record = {
        ...existing,
        id: existing?.id || id(),
        libraryId: item.id,
        requirementId: requirementIds[0] || null,
        requirementIds,
        name: item.name,
        path: target,
        hash: hash(fs.readFileSync(target)),
        addedAt: now(),
      };
      pkg.attachments = pkg.attachments.filter((a) => a !== existing);
      pkg.attachments.push(record);
    }
    return this.save(pkg);
  }
  importFiles(packageId, files, requirementId) {
    const pkg = this.package(packageId);
    this.requirement(pkg, requirementId);
    for (const file of files)
      if (
        !/\.(pdf|docx?|png|jpe?g|rtf|odt|txt)$/i.test(file) ||
        !fs.statSync(file).isFile()
      )
        throw new Error(
          "Choose PDF, Word, image, RTF, ODT or text supporting files.",
        );
    const libraryIds = files.map((file) => {
      const libraryId = hash(file),
        target = path.join(
          this.store.root,
          "evidence",
          `${libraryId.slice(0, 16)}-${path.basename(file)}`,
        );
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file, target);
      this.store.put("library", {
        id: libraryId,
        name: path.basename(file),
        path: target,
        relative: path.basename(file),
        size: fs.statSync(target).size,
        addedAt: now(),
      });
      return libraryId;
    });
    return this.attach(pkg.id, libraryIds, requirementId);
  }
  assign(packageId, attachmentId, requirementIds) {
    const pkg = this.package(packageId),
      a = pkg.attachments.find((a) => (a.id || a.path) === attachmentId);
    if (!a || a.derived) throw new Error("Select an original supporting file.");
    requirementIds.forEach((r) => this.requirement(pkg, r));
    a.requirementIds = [...new Set(requirementIds)];
    a.requirementId = a.requirementIds[0] || null;
    return this.save(pkg);
  }
  remove(packageId, attachmentId) {
    const pkg = this.package(packageId);
    if (!pkg.attachments.some((a) => (a.id || a.path) === attachmentId))
      throw new Error("Supporting file not found");
    pkg.attachments = pkg.attachments.filter(
      (a) => (a.id || a.path) !== attachmentId,
    );
    return this.save(pkg);
  }
  addRequirement(packageId, input) {
    const value = z
      .object({
        label: z.string().trim().min(2).max(160),
        kind: z.enum(["generated", "attachment", "form"]),
        type: z.enum(DOCUMENT_TYPES).nullable(),
        required: z.boolean(),
        instructions: z.string().max(3000),
        minFiles: z.number().int().min(1).max(20),
      })
      .parse(input);
    if (value.kind === "generated" && !value.type)
      throw new Error("Choose a narrative document type.");
    if (
      value.kind === "generated" &&
      /transcript|certificate|degree|diploma|published paper|research paper|signed|official record/i.test(
        value.label,
      )
    )
      throw new Error(
        "Official records and existing papers must be supplied as supporting files.",
      );
    const pkg = this.package(packageId);
    pkg.requirements = [
      ...(pkg.requirements || []),
      normalizeRequirement({ ...value, id: id() }),
    ];
    return this.save(pkg);
  }
  count(packageId, requirementId, count) {
    const pkg = this.package(packageId),
      r = pkg.requirements?.find((r) => r.id === requirementId);
    if (!r || r.kind === "generated")
      throw new Error("Select a supporting-file requirement.");
    r.minFiles = z.number().int().min(1).max(20).parse(count);
    return this.save(pkg);
  }
  external(packageId, requirementId, count, notes = "") {
    const pkg = this.package(packageId),
      r = pkg.requirements?.find((r) => r.id === requirementId);
    if (!r || normalizeRequirement(r).submissionMethod !== "referee_direct")
      throw new Error("Select a separate referee-submission requirement.");
    z.number().int().min(0).max(20).parse(count);
    z.string().max(2000).parse(notes);
    pkg.externalSubmissions = [
      ...(pkg.externalSubmissions || []).filter(
        (e) => e.requirementId !== r.id,
      ),
      { requirementId: r.id, count, notes, confirmedAt: now() },
    ];
    return this.save(pkg);
  }
  async draftReferences(packageId, requirementId, refereeIds, task, signal) {
    const pkg = this.package(packageId),
      raw = pkg.requirements?.find((r) => r.id === requirementId),
      r = raw && normalizeRequirement(raw);
    if (r?.draftable !== "reference")
      throw new Error("Select a reference-letter requirement.");
    const records = refereeRecords(this.store.get("profile", "main")?.data),
      refs = refereeIds.map((rid) => {
        const ref = records.find((r) => r.id === rid);
        if (!ref)
          throw new Error("Choose an existing verified profile referee.");
        return ref;
      });
    if (!refs.length || new Set(refereeIds).size !== refs.length)
      throw new Error("Select one or more distinct referees.");
    for (const [index, referee] of refs.entries()) {
      if (signal?.aborted) throw new Error("Drafting cancelled");
      let current = this.package(packageId);
      if (
        current.documents.some(
          (d) =>
            d.purpose === "referee_review" &&
            d.requirementId === requirementId &&
            d.referee?.id === referee.id,
        )
      )
        continue;
      task?.({
        message: `Preparing review draft for ${referee.name}`,
        progress: Math.round((index / refs.length) * 90),
        packageId,
      });
      const doc = await this.documents.createDocument(
        current,
        {
          ...r,
          label: `Reference letter — ${referee.name}`,
          type: "Reference letter",
          referee,
        },
        current.documents.length,
        task,
        signal,
      );
      current = this.package(packageId);
      if (
        current.documents.some(
          (d) =>
            d.purpose === "referee_review" &&
            d.requirementId === requirementId &&
            d.referee?.id === referee.id,
        )
      )
        continue;
      current.documents.push(doc);
      this.save(current, { clearCombined: false });
    }
    return this.package(packageId);
  }
}
module.exports = { SupportingFiles, refereeRecords, eligibleAttachments };
