"use strict";
const { z } = require("zod");
const { now } = require("./core.cjs");
const { WebDiscovery, collectLinks } = require("./web-discovery.cjs");
const { searchPreview } = require("./search-plan.cjs");
function scopedEngine(discovery, providers, criteria) {
  const engine = Object.create(discovery);
  engine.providers = {
    run: (prompt, options = {}) =>
      providers.run(prompt, {
        ...options,
        ...(criteria.aiProvider ? { provider: criteria.aiProvider } : {}),
        ...(criteria.aiModel ? { model: criteria.aiModel } : {}),
      }),
  };
  return engine;
}
function createWebHandlers(dependencies) {
  const candidateContext = (args) => {
    const { store } = dependencies(),
      candidate = store.get("jobCandidates", z.string().parse(args.id));
    if (!candidate) throw new Error("Candidate not found");
    const coverage = store.get("searchCoverage", candidate.searchKeys[0]);
    if (!coverage?.criteria)
      throw new Error(
        "Original search criteria are unavailable. Run a new search to review this link.",
      );
    return { candidate, coverage };
  };
  const requireAI = (store) => {
    if (
      !store.settings().cloudConsent ||
      store.settings().providerWebResearch === false
    )
      throw new Error(
        "Enable AI processing and provider web research for official-employer detail research.",
      );
  };
  const assertNotQueued = (store, key, value) => {
    if (
      store
        .list("tasks")
        .some(
          (t) =>
            ["running", "queued"].includes(t.status) &&
            t.payload?.[key] === value,
        )
    )
      throw new Error(
        "This detail task is already active. Follow it in Activity.",
      );
  };
  return {
    "search.preview": (args) => {
      const { store, validateSearch } = dependencies();
      return searchPreview(validateSearch(args.search), store);
    },
    "candidate.ignore": (args) => {
      const { store } = dependencies(),
        { candidate } = candidateContext(args);
      return store.put("jobCandidates", {
        ...candidate,
        status: z.boolean().parse(args.restore ?? false)
          ? "pending"
          : "ignored",
        reason: args.restore ? "" : "Ignored manually",
        updatedAt: now(),
      });
    },
    "candidate.verify": (args) => {
      const { store, providers, discovery, tasks } = dependencies(),
        { candidate, coverage } = candidateContext(args);
      requireAI(store);
      assertNotQueued(store, "candidateId", candidate.id);
      return tasks.start(
        "candidate-details",
        "Complete vacancy details",
        async (update, signal) => {
          const criteria = { ...coverage.criteria, depth: "quick" },
            engine = scopedEngine(discovery, providers, criteria);
          const result = await new WebDiscovery(
            store,
            engine,
            engine.providers,
          ).run(criteria, update, signal, {
            detailsOnly: true,
            ids: [candidate.id],
            searchKey: coverage.id,
          });
          return {
            ...result,
            ...(result.jobIds.length === 1 ? { jobId: result.jobIds[0] } : {}),
          };
        },
        { candidateId: candidate.id },
      );
    },
    "candidate.complete": (args) => {
      const { store, providers, discovery, tasks } = dependencies();
      const coverage = store.get(
        "searchCoverage",
        z.string().parse(args.searchKey),
      );
      if (!coverage?.criteria) throw new Error("Search criteria not found");
      requireAI(store);
      assertNotQueued(store, "searchKey", coverage.id);
      const criteria = {
        ...coverage.criteria,
        depth: z
          .enum(["quick", "balanced", "thorough"])
          .parse(args.depth || "thorough"),
      };
      return tasks.start(
        "candidate-details",
        "Complete pending vacancy details",
        async (update, signal) => {
          const engine = scopedEngine(discovery, providers, criteria);
          return new WebDiscovery(store, engine, engine.providers).run(
            criteria,
            update,
            signal,
            { detailsOnly: true, searchKey: coverage.id },
          );
        },
        { searchKey: args.searchKey, depth: criteria.depth },
      );
    },
    "candidate.browserOpen": async (args) => {
      const { store, browserWorkspace } = dependencies(),
        { candidate } = candidateContext(args);
      const opened = await browserWorkspace.open(candidate.url);
      const current = store.get("jobCandidates", candidate.id);
      if (current)
        store.put("jobCandidates", { ...current, browserTabId: opened.tabId });
      return {
        ...opened,
        message:
          "Chrome opened for this vacancy. Complete any verification, then use Import visible page in Discover.",
      };
    },
    "candidate.browserImport": (args) => {
      const { store, discovery, tasks, browserWorkspace } = dependencies(),
        { candidate, coverage } = candidateContext(args);
      if (!candidate.browserTabId)
        throw new Error("Open this candidate in Chrome first");
      assertNotQueued(store, "candidateId", candidate.id);
      return tasks.start(
        "candidate-browser",
        "Read visible vacancy details",
        async (update, signal) => {
          const inspection = await browserWorkspace.listingPage(
            candidate.browserTabId,
          );
          signal.throwIfAborted();
          const source =
            require("./core.cjs").SOURCES.find(
              (s) =>
                new URL(s.base).hostname.replace(/^www\./, "") ===
                new URL(inspection.url).hostname.replace(/^www\./, ""),
            ) || {};
          const job = require("./discovery.cjs").extractListing(
            inspection.html,
            inspection.url,
            source,
          );
          const id = new WebDiscovery(store, discovery).promote(
            candidate,
            job,
            coverage.criteria,
            "visible_chrome",
          );
          if (!id)
            throw new Error(
              store.get("jobCandidates", candidate.id)?.reason ||
                "The browser page is not a complete matching vacancy.",
            );
          return {
            jobId: id,
            message:
              "Full visible vacancy imported. Review the extracted requirements and deadline.",
          };
        },
        { candidateId: candidate.id },
      );
    },
    "provider.webTest": (args) => {
      const { store, providers, tasks } = dependencies(),
        provider = z.enum(["codex", "antigravity"]).parse(args.provider);
      return tasks.start(
        "web-test",
        "Test " + provider + " internet search",
        async (update, signal) => {
          const model = z
            .string()
            .max(200)
            .parse(args.model || store.settings().models?.[provider] || "");
          const result = await collectLinks(
            {
              run: (prompt, options) =>
                providers.run(prompt, { ...options, provider, model }),
            },
            [
              {
                id: "service-check",
                country: "Netherlands",
                role: "Lecturer",
                area: "computing",
                query:
                  "site:academictransfer.com lecturer computer science Netherlands jobs",
              },
            ],
            { task: update, signal, skipConsent: true },
          );
          const actions = result.activities.filter(
              (a) => a.type === "search",
            ).length,
            status = actions
              ? "ready"
              : result.candidates.length
                ? "limited"
                : "unavailable";
          const message =
            status === "ready"
              ? `Internet search observed: ${actions} native search actions, ${result.candidates.length} candidate links returned.`
              : status === "limited"
                ? "Links were returned, but native web-search execution was not observed. Full listing verification remains required."
                : "The provider did not demonstrate working internet search. Try another model/provider.";
          store.put("providers", {
            ...store.get("providers", provider),
            webSearchHealth: {
              status,
              model,
              actions,
              candidates: result.candidates.length,
              at: now(),
              message,
            },
          });
          return {
            provider,
            status,
            observedSearchActions: actions,
            candidateCount: result.candidates.length,
            message,
          };
        },
        { provider, model: args.model },
      );
    },
  };
}
module.exports = { createWebHandlers };
