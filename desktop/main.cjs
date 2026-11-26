"use strict";
const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  shell,
  protocol,
  net,
  Notification,
  safeStorage,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { z } = require("zod");
const {
  suggestKeywords,
  normalizeRoles,
} = require("./search-intelligence.cjs");
const { advancedSearchShape } = require("./search-options.cjs");
const { runSearch } = require("./search-runner.cjs");
const { createWebHandlers } = require("./web-handlers.cjs");
const { packageName } = require("./application-context.cjs");
const { Store } = require("./store.cjs");
const { Providers } = require("./providers.cjs");
const { Discovery, safeUrl } = require("./discovery.cjs");
const { SupportingFiles, refereeRecords } = require("./supporting-files.cjs");
const { packageCoverage } = require("./document-requirements.cjs");
const { Documents, DOCUMENT_TYPES } = require("./documents.cjs");
const {
  Browser,
  chromePath,
  detectChromeProfiles,
} = require("./browser.cjs");
const { Tasks, dueSearches, scheduleAfterRun } = require("./tasks.cjs");
const { taskSummary } = require("./task-summary.cjs");
const { installScheduler, removeScheduler } = require("./scheduler.cjs");
const { Connectors } = require("./connectors.cjs");
const { PortalMcpServer } = require("./portal-mcp.cjs");
const { PublicPageBrowser } = require("./public-page-browser.cjs");
const { BrowserWorkspace } = require("./browser-workspace.cjs");
const { ApplicationBrowser } = require("./application-browser.cjs");
const { COUNTRY_GROUPS } = require("./country-groups.cjs");
const { importProfile, profileWarnings } = require("./profile.cjs");
const {
  id,
  now,
  hash,
  inside,
  COUNTRIES,
  SOURCES,
  defaultSearch,
  JobSchema,
  matchJob,
  nextRun,
  escape,
} = require("./core.cjs");
if (process.env.ACADEMICAPPLY_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.ACADEMICAPPLY_DATA_DIR));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "academic",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let window = null,
  store,
  providers,
  discovery,
  documents,
  browser,
  tasks,
  connectors,
  portalMcp,
  publicRenderer,
  browserWorkspace,
  applicationBrowser,
  quitting = false;
const background = process.argv.includes("--background");
function emit(type, data) {
  if (type === "ai-progress") tasks?.aiProgress(data);
  if (type === "provider-progress" && tasks) {
    const task = store
      .list("tasks")
      .find(
        (t) =>
          t.kind === "provider" &&
          t.status === "running" &&
          t.payload?.provider === data.provider,
      );
    if (task) tasks.log(task.id, data.message);
  }
  if (window && !window.isDestroyed())
    window.webContents.send("academic:event", { type, data });
}
function installAppMenu() {
  const version = app.getVersion();
  const showAbout = () => {
    if (window && !window.isDestroyed()) {
      window.show();
      window.focus();
      emit("about", { version });
      return;
    }
    dialog.showMessageBox({
      type: "info",
      title: "About AcademicApply",
      message: `AcademicApply v${version}`,
      detail: `Electron ${process.versions.electron}\nChromium ${process.versions.chrome}\nNode.js ${process.versions.node}\nPlatform ${process.platform} (${process.arch})`,
    });
  };
  const template = [
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        {
          label: `About AcademicApply (v${version})`,
          click: showAbout,
        },
        { type: "separator" },
        {
          label: "View Releases on GitHub",
          click: () =>
            shell.openExternal(
              "https://github.com/Ahsan-Shehzad/academic-apply/releases",
            ),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  if (window && !window.isDestroyed()) {
    window.show();
    window.focus();
    return;
  }
  window = new BrowserWindow({
    width: 1450,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    title: "AcademicApply",
    icon: path.join(__dirname, "..", "resources", "icon.png"),
    backgroundColor: "#f5f7fa",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("academic://app/")) e.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    window = null;
  });
  window.loadURL("academic://app/index.html");
}
function assertPath(file) {
  const settings = store.settings();
  const roots = [store.root, documents.root(), settings.sourceRoot].filter(
    Boolean,
  );
  if (!roots.some((root) => inside(root, file)) || !fs.existsSync(file))
    throw new Error(
      "This file is outside the application library or no longer exists.",
    );
  return file;
}
function startSearch(searchId, ai, countries) {
  let search = store.get("searches", searchId);
  if (!search) throw new Error("Search profile not found");
  if (countries)
    search = {
      ...search,
      countries: z
        .array(z.enum(Object.values(COUNTRIES).flat()))
        .min(1)
        .max(80)
        .parse(countries),
    };
  if (
    store
      .list("tasks")
      .some(
        (t) =>
          ["running", "queued"].includes(t.status) &&
          t.payload?.searchId === searchId,
      )
  )
    throw new Error("This search is already running.");
  return tasks.start(
    ai ? "ai-search" : "search",
    search.name,
    async (update, signal) => {
      let result;
      try {
        result = await runSearch(
          { store, discovery, connectors },
          search,
          update,
          signal,
          ai,
        );
      } finally {
        // A failed scheduled run must not enqueue itself again every minute.
        scheduleAfterRun(store, searchId);
      }
      if (!result.failed || result.added)
        store.audit("search.completed", { searchId, ...result });
      if (Notification.isSupported())
        new Notification({
          title: "AcademicApply discovery complete",
          body: result.message,
        }).show();
      return result;
    },
    { searchId, ai, countries },
  );
}
async function runDue() {
  for (const search of dueSearches(store)) {
    try {
      startSearch(search.id);
    } catch {}
  }
  await tasks.idle();
}
const SearchSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(160),
  countries: z.array(z.enum(Object.values(COUNTRIES).flat())).min(1),
  roles: z
    .array(z.string().trim().min(2).max(120))
    .min(1)
    .max(30)
    .transform(normalizeRoles)
    .refine(
      (roles) => roles.length > 0,
      "Enter at least one job role with letters or numbers.",
    ),
  keywords: z.string().max(3000),
  sources: z.array(z.enum(SOURCES.map((s) => s.id))).max(SOURCES.length),
  ...advancedSearchShape,
  enabled: z.boolean(),
  day: z.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
});
const validateSearch = (value) => {
  const search = SearchSchema.parse(value);
  if (
    search.strategy === "sources" &&
    !search.sources.length &&
    !search.mcpTools?.length
  )
    throw new Error("Select at least one source or MCP research tool.");
  return search;
};
const SettingsSchema = z.object({
  provider: z.enum(["codex", "antigravity"]).optional(),
  fallback: z.boolean().optional(),
  cloudConsent: z.boolean().optional(),
  hiddenKeywordLayer: z.boolean().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  providerPaths: z
    .object({ codex: z.string().max(1500), antigravity: z.string().max(1500) })
    .optional(),
  models: z
    .object({ codex: z.string().max(200), antigravity: z.string().max(200) })
    .optional(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  workflowProviders: z
    .record(z.string(), z.enum(["", "codex", "antigravity"]))
    .optional(),
  workflowModels: z.record(z.string(), z.string().max(200)).optional(),
  mailProvider: z.enum(["outlook", "gmail"]).optional(),
  contactEmail: z.union([z.email(), z.literal("")]).optional(),
  maxResults: z.number().int().min(5).max(100).optional(),
  providerWebResearch: z.boolean().optional(),
  chromeProfileMode: z.enum(["dedicated", "google"]).optional(),
  chromeProfileDirectory: z.string().max(120).optional(),
  chromeUserDataDir: z.string().max(1500).optional(),
});
const handlers = {
  ...createWebHandlers(() => ({
    store,
    providers,
    discovery,
    tasks,
    browserWorkspace,
    validateSearch,
  })),
  snapshot: () => ({
    settings: store.settings(),
    profile: store.get("profile", "main"),
    jobs: store.list("jobs"),
    candidates: store
      .list("jobCandidates")
      .map((c) => ({
        ...c,
        browserConnected:
          !!browserWorkspace.pages.get(c.browserTabId) &&
          !browserWorkspace.pages.get(c.browserTabId).isClosed(),
      })),
    searchCoverage: store
      .list("searchCoverage")
      .map((c) => ({
        id: c.id,
        name: c.criteria?.name || "Web search",
        totalQueries: c.totalQueries,
        covered: c.completedQueryIds?.length || 0,
        cycle: c.cycle,
        lastRun: c.lastRun,
        countries: c.criteria?.countries || [],
        depth: c.criteria?.depth || "thorough",
      })),
    jobHistory: store.list("jobHistory"),
    searches: store.list("searches"),
    packages: store.list("packages").map((p) => {
      const job = store.getJob(p.jobId);
      const coverage = packageCoverage(p);
      return {
        ...p,
        name: job ? packageName(job) : p.name,
        coverage,
        status:
          p.status === "ready" &&
          coverage.some((r) => r.required && !r.fulfilled)
            ? "draft"
            : p.status,
        missingRequirements: coverage
          .filter((r) => r.required && !r.fulfilled)
          .map((r) => r.label),
      };
    }),
    applications: store.list("applications").map((a) => ({
      ...a,
      browserConnected:
        !!browser?.sessions.get(a.id) && !browser.sessions.get(a.id).isClosed(),
    })),
    tasks: store
      .list("tasks")
      .slice(0, 100)
      .map((t) => ({
        ...t,
        summary:
          t.summary ||
          (!["running", "queued"].includes(t.status)
            ? taskSummary(t, store)
            : null),
      })),
    events: store.list("events").slice(0, 100),
    library: store.list("library"),
    referees: refereeRecords(store.get("profile", "main")?.data),
    providers: store.list("providers"),
    connectors: connectors.catalog(),
    sources: SOURCES.map((s) => ({ ...s, ...store.get("sources", s.id) })),
    countries: COUNTRIES,
    countryGroups: COUNTRY_GROUPS,
    documentTypes: DOCUMENT_TYPES,
    searchSuggestions: suggestKeywords(store.get("profile", "main")?.data),
    documentPlans: Object.fromEntries(
      store
        .list("jobs")
        .map((job) => [
          job.id,
          require("./document-requirements.cjs").planFromJob(job),
        ]),
    ),
    dataRoot: store.root,
    version: app.getVersion(),
    appInfo: {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: `${process.platform} (${process.arch})`,
    },
    chromeInstalled: !!chromePath(),
    chromeProfiles: detectChromeProfiles(store.settings().chromeUserDataDir),
    chromeProfileTarget: browser.profileTarget(store.settings()),
  }),
  "profile.import": async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Choose Job-application-related-data",
      properties: ["openDirectory"],
      defaultPath: store.settings().sourceRoot || app.getPath("documents"),
    });
    if (result.canceled) return null;
    return importProfile(store, result.filePaths[0]);
  },
  "profile.save": (args) => {
    const data = z.record(z.string(), z.unknown()).parse(args.data);
    if (!data.personal?.name)
      throw new Error("Profile must contain personal.name");
    const profile = store.get("profile", "main");
    const updated = {
      ...profile,
      id: "main",
      data,
      verified: false,
      warnings: profileWarnings(data),
      updatedAt: now(),
    };
    store.put("profile", updated);
    store.put("settings", { ...store.settings(), profileVerified: false });
    for (const a of store.list("applications").filter((a) => a.approval))
      store.put("applications", { ...a, approval: null });
    return updated;
  },
  "profile.approve": () => {
    const p = store.get("profile", "main");
    if (!p) throw new Error("Import your profile first");
    const updated = { ...p, verified: true, verifiedAt: now() };
    store.put("profile", updated);
    store.put("settings", { ...store.settings(), profileVerified: true });
    store.audit("profile.approved");
    return updated;
  },
  "jobs.add": (args) =>
    discovery.save(JobSchema.parse(args.job), "Manual listing").job,
  "jobs.import": (args) => {
    const url = z.url().parse(args.url);
    return tasks.start(
      "import",
      "Import job listing",
      async (update, signal) => {
        const job = await discovery.import(url, signal, update);
        return {
          jobId: job.id,
          message: "Listing imported. Review extracted facts before applying.",
        };
      },
      { url },
    );
  },
  "jobs.update": (args) => {
    const job = store.get("jobs", args.id);
    if (!job) throw new Error("Job not found");
    const changes = z
      .object({
        status: z
          .enum([
            "discovered",
            "shortlisted",
            "dismissed",
            "preparing",
            "closed",
          ])
          .optional(),
        personalRating: z.number().int().min(0).max(5).optional(),
        personalNotes: z.string().max(5000).optional(),
        pinned: z.boolean().optional(),
        official: z.boolean().optional(),
        institution: z.string().min(2).max(400).optional(),
        country: z.string().max(100).optional(),
        deadline: z.string().nullable().optional(),
        deadlineText: z.string().max(200).optional(),
        applicationUrl: z.url().optional(),
        eligibility: z.string().max(10000).optional(),
        requiredDocuments: z.array(z.string().max(200)).max(30).optional(),
      })
      .parse(args.changes);
    const updated = { ...job, ...changes };
    updated.match = matchJob(updated, store.get("profile", "main")?.data);
    store.put("jobs", updated);
    return updated;
  },
  "jobs.delete": (args) =>
    require("./job-management.cjs").removeListings(store, [
      z.string().parse(args.id),
    ]),
  "jobs.reset": () =>
    require("./job-management.cjs").removeListings(store, null),
  "jobs.enrich": (args) =>
    tasks.start(
      "enrich",
      "Extract listing requirements with AI",
      async (update) => {
        update({
          message:
            "Asking the selected AI provider to extract listing requirements",
          progress: 10,
        });
        await discovery.enrich(z.string().parse(args.id), update);
        return {
          jobId: args.id,
          message:
            "Listing requirements updated. Review against the official page.",
        };
      },
      { jobId: args.id },
    ),
  "search.suggestions": (args) =>
    suggestKeywords(
      store.get("profile", "main")?.data,
      normalizeRoles(
        z
          .array(z.string().trim().min(2).max(120))
          .max(30)
          .parse(args.roles || []),
      ),
    ),
  "search.save": (args) => {
    const parsed = validateSearch(args.search);
    const previous = parsed.id ? store.get("searches", parsed.id) : null;
    const record = {
      ...defaultSearch(),
      ...previous,
      ...parsed,
      id: parsed.id || id(),
    };
    record.nextRun = nextRun(record);
    store.put("searches", record);
    return record;
  },
  "search.delete": (args) => {
    store.remove("searches", z.string().parse(args.id));
    return true;
  },
  "search.run": (args) =>
    startSearch(
      z.string().parse(args.id),
      args.ai === undefined ? undefined : z.boolean().parse(args.ai),
      args.countries,
    ),
  "search.execute": (args) => {
    const search = {
      ...defaultSearch(),
      ...validateSearch(args.search),
      id: id(),
      enabled: false,
    };
    return tasks.start(
      search.strategy === "ai" ? "ai-search-once" : "search-once",
      search.name,
      (update, signal) =>
        runSearch({ store, discovery, connectors }, search, update, signal),
      { search },
    );
  },
  "task.cancel": (args) => {
    tasks.cancel(args.id);
    providers.cancel(args.id);
    return true;
  },
  "task.retry": (args) => {
    const task = store.get("tasks", args.id);
    if (!task || !["failed", "interrupted", "cancelled"].includes(task.status))
      throw new Error("This task cannot be retried");
    if (["search-once", "ai-search-once"].includes(task.kind))
      return handlers["search.execute"]({ search: task.payload.search });
    if (["search", "ai-search"].includes(task.kind))
      return startSearch(
        task.payload.searchId,
        task.payload?.ai,
        task.payload.countries,
      );
    if (task.kind === "import" && task.payload?.url)
      return handlers["jobs.import"](task.payload);
    if (task.kind === "documents" && task.payload?.jobId)
      return handlers["package.draft"](task.payload);
    if (task.kind === "document-add")
      return handlers["package.addDocument"]({
        id: task.payload.packageId,
        requirementId: task.payload.requirementId,
      });
    if (task.kind === "supporting-draft")
      return handlers["package.referenceDrafts"]({
        id: task.payload.packageId,
        requirementId: task.payload.requirementId,
        refereeIds: task.payload.refereeIds,
      });
    if (task.kind === "cv-format")
      return handlers["package.refreshCV"]({
        id: task.payload.packageId,
        documentId: task.payload.documentId,
        exportPdf: task.payload.exportPdf,
      });
    if (task.kind === "pdf" && task.payload?.packageId)
      return handlers["package.export"]({ id: task.payload.packageId });
    if (task.kind === "enrich" && task.payload?.jobId)
      return handlers["jobs.enrich"]({ id: task.payload.jobId });
    if (task.kind === "connector-test-all")
      return handlers["connector.testAll"]();
    if (task.kind === "connector-test")
      return handlers["connector.test"]({ id: task.payload.connectorId });
    if (task.kind === "connector-discovery")
      return handlers["connector.search"]({
        id: task.payload.connectorId,
        searchId: task.payload.searchId,
      });
    if (task.kind === "browser-import")
      return handlers["browser.import"]({ tabId: task.payload.tabId });
    if (task.kind === "candidate-browser")
      return handlers["candidate.browserImport"]({ id: task.payload.candidateId });
    if (task.kind === "candidate-details")
      return task.payload.candidateId
        ? handlers["candidate.verify"]({ id: task.payload.candidateId })
        : handlers["candidate.complete"](task.payload);
    if (task.kind === "web-test")
      return handlers["provider.webTest"](task.payload);
    throw new Error("Repeat the action from its workflow screen.");
  },
  "package.draft": (args) =>
    tasks.start(
      "documents",
      "Prepare submission package",
      async (update, signal) => {
        const pkg = await documents.draft(
          z.string().parse(args.jobId),
          args.automatic === true || args.types == null
            ? null
            : z.array(z.string()).parse(args.types),
          update,
          signal,
        );
        return {
          packageId: pkg.id,
          documentsCreated: pkg.documents.length,
          message: `${pkg.documents.length} documents drafted. ${pkg.missingRequirements?.length ? "Still required: " + pkg.missingRequirements.join(", ") + ". " : ""}Review the content, export PDFs, and inspect the layout.`,
        };
      },
      { jobId: args.jobId, types: args.types, automatic: args.automatic },
    ),
  "package.edit": (args) =>
    documents.edit(
      z.string().parse(args.packageId),
      z.string().parse(args.documentId),
      args.content,
    ),
  "package.export": (args) =>
    tasks.start(
      "pdf",
      "Export Word documents to PDF",
      async (update, signal) => {
        const exported = await documents.exportPdf(
          z.string().parse(args.id),
          update,
          signal,
        );
        return {
          packageId: args.id,
          exportedCount: exported.exportedCount,
          message: exported.exportedCount
            ? `${exported.exportedCount} PDFs exported. Open and inspect them before approval.`
            : "Existing PDFs are current. Their review status is preserved.",
        };
      },
      { packageId: args.id },
    ),
  "package.refreshCV": (args) =>
    tasks.start(
      "cv-format",
      "Remove CV heading icons",
      async (update, signal) => {
        const packageId = z.string().parse(args.id),
          documentId = z.string().parse(args.documentId);
        update({
          packageId,
          message:
            "Updating CV headings while preserving its text and network links",
        });
        const result = documents.refreshCVFormatting(packageId, documentId);
        const exported =
          args.exportPdf === false
            ? result
            : await documents.exportPdf(packageId, update, signal, {
                documentIds: [documentId],
              });
        return {
          packageId,
          removedHeadingIcons: result.removedHeadingIcons,
          message: result.removedHeadingIcons
            ? `Removed ${result.removedHeadingIcons} heading icons. Network icons and text retained. Review the updated CV.`
            : exported.exportedCount
              ? "CV already has text-only headings. Its PDF was exported for review."
              : "This CV already has text-only headings. No document changes were needed.",
        };
      },
      {
        packageId: args.id,
        documentId: args.documentId,
        exportPdf: args.exportPdf,
      },
    ),
  "package.keywordLayer": (args) =>
    documents.setKeywordLayer(
      z.string().parse(args.packageId),
      z.string().parse(args.documentId),
      z.boolean().parse(args.enabled),
      args.terms === undefined
        ? undefined
        : z.array(z.string().max(100)).max(24).parse(args.terms),
    ),
  "package.keywordPreview": (args) =>
    documents.keywordPreview(
      z.string().parse(args.packageId),
      z.string().parse(args.documentId),
    ),
  "package.review": (args) =>
    documents.review(
      z.string().parse(args.id),
      z.array(z.string()).parse(args.documentIds),
    ),
  "package.attach": (args) =>
    documents.attach(
      z.string().parse(args.id),
      z.array(z.string()).parse(args.libraryIds),
      z.string().optional().parse(args.requirementId),
    ),
  "package.addFiles": async (args) => {
    const packageId = z.string().parse(args.id),
      requirementId = z.string().optional().parse(args.requirementId);
    const supporting = new SupportingFiles(documents);
    supporting.requirement(supporting.package(packageId), requirementId);
    const result = await dialog.showOpenDialog(window, {
      title: "Add supporting files",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Supporting documents",
          extensions: [
            "pdf",
            "docx",
            "doc",
            "png",
            "jpg",
            "jpeg",
            "rtf",
            "odt",
            "txt",
          ],
        },
      ],
    });
    if (result.canceled) return null;
    return supporting.importFiles(packageId, result.filePaths, requirementId);
  },
  "package.assignAttachment": (args) =>
    new SupportingFiles(documents).assign(
      z.string().parse(args.id),
      z.string().parse(args.attachmentId),
      z.array(z.string()).max(40).parse(args.requirementIds),
    ),
  "package.removeAttachment": (args) =>
    new SupportingFiles(documents).remove(
      z.string().parse(args.id),
      z.string().parse(args.attachmentId),
    ),
  "package.addRequirement": (args) =>
    new SupportingFiles(documents).addRequirement(
      z.string().parse(args.id),
      args.requirement,
    ),
  "package.requirementCount": (args) =>
    new SupportingFiles(documents).count(
      z.string().parse(args.id),
      z.string().parse(args.requirementId),
      z.number().parse(args.count),
    ),
  "package.externalSubmission": (args) =>
    new SupportingFiles(documents).external(
      z.string().parse(args.id),
      z.string().parse(args.requirementId),
      z.number().parse(args.count),
      z
        .string()
        .max(2000)
        .parse(args.notes || ""),
    ),
  "package.addDocument": (args) =>
    tasks.start(
      "document-add",
      "Create required document",
      async (update, signal) => {
        const p = await documents.addDocument(
          z.string().parse(args.id),
          z.string().parse(args.requirementId),
          update,
          signal,
        );
        return {
          packageId: p.id,
          message: "Required document added. Export and review its PDF.",
        };
      },
      { packageId: args.id, requirementId: args.requirementId },
    ),
  "package.referenceDrafts": (args) =>
    tasks.start(
      "supporting-draft",
      "Prepare referee-review letters",
      async (update, signal) => {
        const p = await new SupportingFiles(documents).draftReferences(
          z.string().parse(args.id),
          z.string().parse(args.requirementId),
          z.array(z.string()).max(20).parse(args.refereeIds),
          update,
          signal,
        );
        return {
          packageId: p.id,
          message:
            "Referee-review drafts saved. Obtain referee approval and signed letters before any applicant upload.",
        };
      },
      {
        packageId: args.id,
        requirementId: args.requirementId,
        refereeIds: args.refereeIds,
      },
    ),
  "package.combine": (args) =>
    documents.combine(
      z.string().parse(args.id),
      z.array(z.string()).parse(args.documentIds),
      z.array(z.string()).max(30).optional().parse(args.attachmentPaths),
    ),
  "application.start": (args) =>
    tasks.track("browser", "Open application portal", () =>
      browser.start(
        z.string().parse(args.jobId),
        args.packageId ? z.string().parse(args.packageId) : null,
      ),
    ),
  "application.inspect": (args) =>
    tasks.track(
      "browser",
      "Inspect application form",
      () => browser.inspect(z.string().parse(args.id)),
      { applicationId: args.id },
    ),
  "application.browserInspect": (args) =>
    applicationBrowser.inspect(z.string().parse(args.id)),
  "application.browserAction": (args) =>
    tasks.track(
      "browser",
      "Application browser control",
      () => applicationBrowser.action(z.string().parse(args.id), args.action),
      { applicationId: args.id },
    ),
  "application.agent": (args) =>
    tasks.start(
      "browser-agent",
      "AI application browser assistant",
      (update, signal) =>
        applicationBrowser.agent(
          z.string().parse(args.id),
          z.string().min(3).max(6000).parse(args.prompt),
          update,
          signal,
        ),
      { applicationId: args.id },
    ),
  "application.nativeBrowser": (args) =>
    tasks.track(
      "browser",
      "Open native Antigravity browser assistant",
      () =>
        applicationBrowser.native(
          z.string().parse(args.id),
          z.string().max(1800).parse(args.prompt),
        ),
      { applicationId: args.id },
    ),
  "jobs.verify": (args) => {
    const job = store.get("jobs", z.string().parse(args.id));
    if (!job) throw new Error("Listing not found");
    return store.put("jobs", {
      ...job,
      verification: {
        status: "manually_verified",
        at: now(),
        listingHash: hash(job.description),
      },
    });
  },
  "application.focus": (args) =>
    tasks.track(
      "browser",
      "Show application Chrome window",
      async () => {
        await (await browser.pageFor(z.string().parse(args.id))).bringToFront();
        return { message: "Application Chrome window shown." };
      },
      { applicationId: args.id },
    ),
  "application.fill": (args) =>
    tasks.track(
      "browser",
      "Fill verified contact details",
      () => browser.autoFill(z.string().parse(args.id)),
      { applicationId: args.id },
    ),
  "application.suggest": (args) =>
    tasks.track(
      "browser",
      "Suggest portal answers",
      (update) => browser.suggest(z.string().parse(args.id), update),
      { applicationId: args.id },
    ),
  "application.fillSuggestions": (args) =>
    tasks.track(
      "browser",
      "Fill reviewed portal answers",
      () =>
        browser.fill(
          z.string().parse(args.id),
          z
            .array(z.object({ key: z.string(), value: z.string().max(20000) }))
            .max(300)
            .parse(args.answers),
        ),
      { applicationId: args.id },
    ),
  "application.upload": (args) =>
    tasks.track(
      "browser",
      "Upload application document",
      () =>
        browser.upload(
          z.string().parse(args.id),
          z.string().parse(args.fieldKey),
          z.string().parse(args.file),
        ),
      { applicationId: args.id },
    ),
  "application.next": (args) =>
    tasks.track(
      "browser",
      "Continue application form",
      () =>
        browser.next(
          z.string().parse(args.id),
          z.string().parse(args.buttonKey),
        ),
      { applicationId: args.id },
    ),
  "application.mail": (args) =>
    tasks.track(
      "browser",
      "Open application email",
      () => browser.openMail(z.string().parse(args.id)),
      { applicationId: args.id },
    ),
  "application.readMail": (args) =>
    tasks.track(
      "browser",
      "Read opened application message",
      () => browser.readMail(z.string().parse(args.id)),
      { applicationId: args.id },
    ),
  "application.approve": (args) =>
    browser.approve(
      z.string().parse(args.id),
      z.string().parse(args.buttonKey),
      args.confirmations,
    ),
  "application.submit": (args) => browser.submit(z.string().parse(args.id)),
  "application.update": (args) => {
    const previous = store.get("applications", args.id);
    if (!previous) throw new Error("Application not found");
    const patch = z
      .object({
        status: z
          .enum([
            "preparing",
            "paused",
            "submitted",
            "interview",
            "offer",
            "rejected",
            "withdrawn",
            "submission_uncertain",
          ])
          .optional(),
        notes: z.string().max(20000).optional(),
        packageId: z.string().nullable().optional(),
        confirmationText: z.string().max(5000).optional(),
      })
      .parse(args.changes);
    if (
      patch.packageId &&
      store.get("packages", patch.packageId)?.jobId !== previous.jobId
    )
      throw new Error("Package belongs to another job");
    if (
      patch.status === "submitted" &&
      !previous.submittedAt &&
      !patch.confirmationText
    )
      throw new Error(
        "Enter the confirmation evidence when manually recording a submission.",
      );
    const packageChanged =
      patch.packageId !== undefined && patch.packageId !== previous.packageId;
    if (
      packageChanged &&
      store
        .list("tasks")
        .some(
          (t) =>
            t.kind === "browser-agent" &&
            t.payload?.applicationId === previous.id &&
            ["queued", "running"].includes(t.status),
        )
    )
      throw new Error(
        "Stop the active assistant before changing its submission package.",
      );
    const record = {
      ...previous,
      ...patch,
      ...(packageChanged
        ? {
            suggestions: null,
            agentReport: null,
            message:
              "Package changed. Replace any previous portal uploads with the selected package files before final review.",
            status: ["ready_for_review", "preparing"].includes(previous.status)
              ? "preparing"
              : previous.status,
          }
        : {}),
      approval: null,
      updatedAt: now(),
    };
    store.put("applications", record);
    store.audit("application.updated", {
      applicationId: record.id,
      status: record.status,
    });
    return record;
  },
  "provider.test": (args) =>
    tasks.track(
      "provider",
      "Test " + args.provider + " service",
      async (update) => {
        const result = await providers.health(
          z.enum(["codex", "antigravity"]).parse(args.provider),
          !!args.inference,
          update.id,
        );
        if (!["ready", "signed_in"].includes(result.status))
          throw new Error(result.message);
        return result;
      },
      { provider: args.provider },
    ),
  "browser.tabs": () => browserWorkspace.tabs(),
  "browser.open": (args) =>
    tasks.track("browser", "Open Chrome research tab", (update) =>
      browserWorkspace.open(z.url().parse(args.url), update),
    ),
  "browser.openCleanLogin": (args = {}) =>
    tasks.track("browser", "Open clean Chrome window for sign-in", () =>
      browser.openCleanChrome(
        Array.isArray(args.urls)
          ? z.array(z.url()).max(12).parse(args.urls)
          : undefined,
      ),
    ),
  "browser.importChromeProfile": (args = {}) =>
    tasks.track("browser", "Import sessions from Google Chrome profile", () =>
      browser.importFromChromeProfile(
        args.profileDirectory
          ? z.string().max(120).parse(args.profileDirectory)
          : store.settings().chromeProfileDirectory || "Default",
        args.userDataDir
          ? z.string().max(1500).parse(args.userDataDir)
          : store.settings().chromeUserDataDir || "",
      ),
    ),
  "browser.control": (args) =>
    tasks.track("browser", "Browser: " + args.action, () =>
      browserWorkspace.control(
        z.string().parse(args.tabId),
        z
          .enum(["navigate", "back", "forward", "reload", "focus", "close"])
          .parse(args.action),
        args.url,
      ),
    ),
  "browser.inspect": (args) =>
    tasks.track("browser", "Inspect public browser page", () =>
      browserWorkspace.inspect(z.string().parse(args.tabId)),
    ),
  "browser.import": (args) =>
    tasks.start(
      "browser-import",
      "Import visible browser listing",
      (update, signal) =>
        browserWorkspace.import(z.string().parse(args.tabId), update, signal),
      { tabId: args.tabId },
    ),
  "browser.plan": (args) =>
    tasks.track("browser", "Plan browser research", (update) =>
      browserWorkspace.plan(
        z.string().min(5).max(5000).parse(args.prompt),
        args.tabId,
        update,
      ),
    ),
  "connector.install": (args) =>
    tasks.start(
      "connector-install",
      "Install bundled connectors",
      async (update) => {
        const ids = z
          .array(z.enum(SOURCES.map((s) => s.id)))
          .min(1)
          .max(SOURCES.length)
          .parse(args.ids);
        for (const [index, connectorId] of ids.entries()) {
          update({
            message:
              "Installing " + SOURCES.find((s) => s.id === connectorId).name,
            progress: Math.round((index / ids.length) * 90),
          });
          connectors.install(connectorId);
        }
        return {
          connectorId: ids.length === 1 ? ids[0] : null,
          message: `${ids.length} bundled connectors installed and enabled.`,
        };
      },
    ),
  "connector.enable": (args) =>
    connectors.enable(
      z.string().parse(args.id),
      z.boolean().parse(args.enabled),
    ),
  "connector.enableMany": (args) =>
    connectors.enableMany(
      z.array(z.string()).max(200).parse(args.ids),
      z.boolean().parse(args.enabled),
    ),
  "connector.configure": (args) =>
    connectors.configure(
      z
        .object({
          id: z.string().optional(),
          name: z.string().min(2).max(120),
          endpoint: z.url(),
          protocol: z.enum(["2026-07-28", "2025-11-25"]),
        })
        .parse(args.config),
      args.token === undefined
        ? undefined
        : z.string().max(10000).parse(args.token),
    ),
  "connector.boards": (args) =>
    connectors.configureBoards(
      z.enum(["greenhouse", "lever", "ashby"]).parse(args.id),
      z
        .array(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/))
        .max(30)
        .parse(args.boards),
    ),
  "connector.testAll": () =>
    tasks.start(
      "connector-test-all",
      "Test all job sources",
      (update, signal) => connectors.testAll(update, signal),
    ),
  "connector.test": (args) =>
    tasks.start(
      "connector-test",
      "Test connector",
      (update, signal) =>
        connectors.test(z.string().parse(args.id), update, signal),
      { connectorId: args.id },
    ),
  "connector.search": (args) => {
    const connectorId = z.enum(SOURCES.map((s) => s.id)).parse(args.id);
    const search = store.get("searches", z.string().parse(args.searchId));
    if (!search) throw new Error("Choose a saved search profile");
    return tasks.start(
      "connector-discovery",
      "Search " + SOURCES.find((s) => s.id === connectorId).name,
      (update, signal) =>
        discovery.search({ ...search, sources: [connectorId] }, update, signal),
      { connectorId, searchId: search.id },
    );
  },
  "connector.openPortals": (args) =>
    tasks.track("browser", "Open portal sign-in tabs in Chrome", () =>
      portalMcp.openPortalsForLogin(
        Array.isArray(args.portals) && args.portals.length
          ? z.array(z.string().max(80)).max(12).parse(args.portals)
          : undefined,
      ),
    ),
  "connector.run": (args) =>
    tasks.start(
      "connector-search",
      "Search through MCP connector",
      (update, signal) =>
        connectors.run(
          z.string().parse(args.id),
          z.string().max(128).parse(args.tool),
          z.record(z.string(), z.unknown()).parse(args.arguments),
          discovery,
          update,
          signal,
        ),
      { connectorId: args.id },
    ),
  "provider.login": async (args) => {
    const result = await providers.login(
      z.enum(["codex", "antigravity"]).parse(args.provider),
      args.forceTerminal === true,
    );
    if (result.url) {
      await safeUrl(result.url);
      await shell.openExternal(result.url);
    }
    return result;
  },
  "provider.pick": async (args) => {
    const provider = z.enum(["codex", "antigravity"]).parse(args.provider);
    const result = await dialog.showOpenDialog(window, {
      title: "Choose " + provider + " CLI executable",
      properties: ["openFile"],
      filters: [{ name: "Executable", extensions: ["exe", "cmd"] }],
    });
    if (result.canceled) return null;
    const previous = store.settings();
    const updated = {
      ...store.settings(),
      providerPaths: {
        ...store.settings().providerPaths,
        [provider]: result.filePaths[0],
      },
    };
    store.put("settings", updated);
    providers.invalidateChanged(previous, updated);
    return result.filePaths[0];
  },
  "settings.save": async (args) => {
    const previous = store.settings();
    const settings = {
      ...store.settings(),
      ...SettingsSchema.parse(args.settings),
    };
    if (
      previous.provider !== settings.provider &&
      !args.settings.workflowModels
    ) {
      settings.workflowModels = { ...settings.workflowModels };
      for (const key of ["discovery", "documents", "portal"])
        if (!settings.workflowProviders?.[key])
          settings.workflowModels[key] = "";
    }
    store.put("settings", settings);
    providers.invalidateChanged(previous, settings);
    if (
      previous.chromeProfileMode !== settings.chromeProfileMode ||
      previous.chromeProfileDirectory !== settings.chromeProfileDirectory ||
      previous.chromeUserDataDir !== settings.chromeUserDataDir
    ) {
      await browser.close().catch(() => {});
    }
    return settings;
  },
  "settings.documentRoot": async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Choose submission package storage",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return null;
    const dir = result.filePaths[0];
    store.put("settings", { ...store.settings(), documentRoot: dir });
    return dir;
  },
  "scheduler.install": async () => {
    const result = await installScheduler(
      process.execPath,
      app.getAppPath(),
      app.isPackaged,
    );
    store.put("settings", { ...store.settings(), schedulerInstalled: true });
    store.audit("scheduler.installed");
    return result;
  },
  "scheduler.remove": async () => {
    const result = await removeScheduler();
    store.put("settings", { ...store.settings(), schedulerInstalled: false });
    return result;
  },
  "file.open": async (args) => {
    const error = await shell.openPath(assertPath(z.string().parse(args.path)));
    if (error) throw new Error(error);
    return true;
  },
  "file.reveal": (args) => {
    shell.showItemInFolder(assertPath(z.string().parse(args.path)));
    return true;
  },
  "url.open": async (args) => {
    await safeUrl(z.url().parse(args.url));
    await shell.openExternal(args.url);
    return true;
  },
  "report.csv": async () => {
    const result = await dialog.showSaveDialog(window, {
      defaultPath: "AcademicApply-shortlist.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (result.canceled) return null;
    const cell = (v) =>
      '"' +
      String(v ?? "")
        .replace(/"/g, '""')
        .replace(/^[=+@-]/, "'$&") +
      '"';
    const rows = [
      [
        "Institution",
        "Title",
        "Country",
        "Match",
        "Status",
        "Deadline",
        "Official link",
      ],
      ...store
        .list("jobs")
        .filter((j) => j.status !== "dismissed")
        .map((j) => [
          j.institution,
          j.title,
          j.country,
          j.match.score,
          j.status,
          j.deadline || j.deadlineText,
          j.applicationUrl,
        ]),
    ];
    fs.writeFileSync(
      result.filePath,
      "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n"),
    );
    return result.filePath;
  },
  "report.pdf": async () => {
    const result = await dialog.showSaveDialog(window, {
      defaultPath: "AcademicApply-report.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled) return null;
    const jobs = store
      .list("jobs")
      .filter((j) => j.status === "shortlisted" || j.match.score >= 70);
    const report = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    try {
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:11pt Arial;color:#17263b;padding:24px}h1{font-size:24pt}article{break-inside:avoid;border-bottom:1px solid #ddd;padding:12px 0}a{word-break:break-all;color:#126b6b}small{color:#526174}</style></head><body><h1>Academic Job Search Report</h1><p>Prepared ${escape(now().slice(0, 10))} · ${store.list("applications").length} tracked applications · ${jobs.length} shortlisted or strong matches</p>${jobs.map((j) => `<article><h2>${escape(j.title)}</h2><p>${escape(j.institution)} · ${escape(j.country)} · Match ${j.match.score}/100</p><p>${escape(j.focus)}</p><p><b>Eligibility</b> ${escape(j.eligibility.slice(0, 900))}</p><p><b>Deadline</b> ${escape(j.deadline || j.deadlineText)} · ${escape(j.deadlineTimezone)}</p><a href="${escape(j.applicationUrl)}">${escape(j.applicationUrl)}</a></article>`).join("")}</body></html>`;
      await report.loadURL(
        "data:text/html;charset=utf-8," + encodeURIComponent(html),
      );
      fs.writeFileSync(
        result.filePath,
        await report.webContents.printToPDF({
          printBackground: true,
          pageSize: "A4",
          margins: { top: 0.5, bottom: 0.5, left: 0.4, right: 0.4 },
        }),
      );
      return result.filePath;
    } finally {
      report.destroy();
    }
  },
  backup: async () => {
    const result = await dialog.showSaveDialog(window, {
      defaultPath: "AcademicApply-backup.sqlite",
      filters: [{ name: "SQLite backup", extensions: ["sqlite"] }],
    });
    if (result.canceled) return null;
    store.flush();
    fs.copyFileSync(store.file, result.filePath);
    return {
      message:
        "Database backup saved. Submission packages and supporting files are separate; back up their folders too.",
      path: result.filePath,
    };
  },
};
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", async (_e, argv) => {
    if (argv.includes("--run-schedules")) await runDue();
    else createWindow();
  });
  app
    .whenReady()
    .then(async () => {
      store = await Store.open(app.getPath("userData"));
      providers = new Providers(store, emit);
      browser = new Browser(store, providers, emit);
      portalMcp = new PortalMcpServer({ browser });
      publicRenderer = new PublicPageBrowser();
      connectors = new Connectors(store, {
        portalMcp,
        encrypt: (token) => {
          if (!safeStorage.isEncryptionAvailable())
            throw new Error("Windows secure token storage is unavailable");
          return safeStorage.encryptString(token).toString("base64");
        },
        decrypt: (value) =>
          safeStorage.decryptString(Buffer.from(value, "base64")),
      });
      discovery = new Discovery(store, providers, connectors);
      discovery.renderPage = (url, signal) => publicRenderer.read(url, signal);
      documents = new Documents(store, providers);
      applicationBrowser = new ApplicationBrowser(browser, store, providers);
      browserWorkspace = new BrowserWorkspace(
        browser,
        discovery,
        providers,
        store,
      );
      tasks = new Tasks(store, emit);
      for (const search of store.list("searches"))
        if (!search.nextRun)
          store.put("searches", { ...search, nextRun: nextRun(search) });
      protocol.handle("academic", (request) => {
        const u = new URL(request.url);
        if (u.hostname !== "app")
          return new Response("Forbidden", { status: 403 });
        const file = path.resolve(
          __dirname,
          "..",
          "dist",
          decodeURIComponent(u.pathname).slice(1) || "index.html",
        );
        if (
          !inside(path.join(__dirname, "..", "dist"), file) ||
          !fs.existsSync(file)
        )
          return new Response("Not found", { status: 404 });
        return net.fetch(pathToFileURL(file).toString());
      });
      app.on("web-contents-created", (_event, contents) => {
        contents.session.setPermissionRequestHandler(
          (_wc, _permission, callback) => callback(false),
        );
      });
      ipcMain.handle("academic:call", async (event, request) => {
        try {
          const sender = event.senderFrame?.url || "";
          if (!sender.startsWith("academic://app/"))
            throw new Error("Untrusted IPC sender");
          const { method, args } = z
            .object({
              method: z.string().max(100),
              args: z.record(z.string(), z.unknown()),
            })
            .parse(request);
          if (!Object.hasOwn(handlers, method))
            throw new Error("Unknown application operation");
          const result = await handlers[method](args);
          // Snapshot reads must not notify the renderer to fetch another snapshot.
          if (
            ![
              "snapshot",
              "browser.tabs",
              "application.browserInspect",
              "package.keywordPreview",
              "search.suggestions",
              "search.preview",
            ].includes(method)
          )
            emit("changed", { method });
          return { ok: true, result };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      });
      installAppMenu();
      if (!background) createWindow();
      if (process.argv.includes("--run-schedules")) {
        await runDue();
        if (background && !window) {
          quitting = true;
          app.quit();
        }
      } else await runDue();
      setInterval(
        () =>
          runDue().catch((e) =>
            store.audit("schedule.error", { message: e.message }),
          ),
        60000,
      ).unref();
    })
    .catch((error) => {
      dialog.showErrorBox("AcademicApply could not start", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => {
    if (!background) app.quit();
  });
  app.on("before-quit", () => {
    if (quitting) return;
    quitting = true;
    providers?.close();
    portalMcp?.close().catch(() => {});
    publicRenderer?.close().catch(() => {});
    browser?.close().catch(() => {});
    store?.close();
  });
}
