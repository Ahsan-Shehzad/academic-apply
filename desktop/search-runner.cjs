"use strict";
const { suitable } = require("./discovery.cjs");
const { expandArguments, advancedMatch } = require("./search-options.cjs");
const { accessIssue, sourceOutcome } = require("./source-access.cjs");
async function runSearch(
  { store, discovery, connectors },
  search,
  task,
  signal,
  forceAI,
) {
  const beforeIds = new Set(store.list("jobs").map((j) => j.id));
  const strategy =
    forceAI === undefined
      ? search.strategy || "hybrid"
      : forceAI
        ? "ai"
        : "sources";
  const engine = Object.create(discovery);
  engine.providers = {
    run: (prompt, options = {}) =>
      discovery.providers.run(prompt, {
        ...options,
        ...(search.aiProvider ? { provider: search.aiProvider } : {}),
        ...(search.aiModel ? { model: search.aiModel } : {}),
      }),
  };
  const scoped = { ...search, providerResearch: strategy !== "sources" };
  if (strategy === "ai" && !store.settings().cloudConsent)
    throw new Error(
      "Enable AI processing in Settings or choose public sources.",
    );
  let result = {
    jobIds: [],
    added: 0,
    updated: 0,
    failed: 0,
    message: "",
    sourcesChecked: 0,
  };
  if (search.sources.length) {
    try {
      result = await (strategy === "ai"
        ? engine.aiSearch(scoped, task, signal)
        : engine.search(scoped, task, signal));
    } catch (error) {
      if (signal?.aborted || !search.mcpTools?.length) throw error;
      result.failed++;
      result.sourceReport = [
        { id: "built-in", name: "Built-in discovery", ...accessIssue(error) },
      ];
      task?.({
        message: `Built-in discovery could not complete: ${error.message}. Continuing with connected MCP research tools.`,
        level: "warning",
      });
    }
  }
  const mcpResults = [];
  for (const config of search.mcpTools || []) {
    if (signal?.aborted) throw new Error("Search cancelled");
    if (
      result.jobIds.length >=
      (search.maxResults || store.settings().maxResults || 30)
    ) {
      task?.({
        message: "Result budget reached. Remaining MCP tools were not run.",
      });
      break;
    }
    task?.({
      message: `Searching connected MCP source: ${store.get("connectors", config.connectorId)?.name || config.connectorId}`,
    });
    try {
      const reader = {
        import: async (url, sig) => {
          const job = await engine.import(url, sig, task, {
            persist: false,
            providerResearch: strategy !== "sources",
          });
          if (
            !suitable(job, search) ||
            !advancedMatch(job, search, store.get("profile", "main")?.data)
          )
            return null;
          if (
            new Set(result.jobIds).size >=
            (search.maxResults || store.settings().maxResults || 30)
          )
            return null;
          const saved = discovery.save(
            job,
            "MCP search: " + store.get("connectors", config.connectorId)?.name,
          );
          result.jobIds.push(saved.job.id);
          saved.isNew ? result.added++ : result.updated++;
          return saved.job;
        },
      };
      const response = await connectors.run(
        config.connectorId,
        config.tool,
        expandArguments(config.arguments, search),
        reader,
        task,
        signal,
      );
      mcpResults.push({ connectorId: config.connectorId, ...response });
      (result.sourceReport ||= []).push(
        sourceOutcome(
          {
            id: config.connectorId,
            name:
              store.get("connectors", config.connectorId)?.name ||
              config.connectorId,
          },
          {
            status: response.failed ? "partial" : "available",
            candidateCount: response.jobIds?.length,
            message: response.message,
          },
        ),
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      result.failed++;
      (result.sourceReport ||= []).push(
        sourceOutcome(
          {
            id: config.connectorId,
            name:
              store.get("connectors", config.connectorId)?.name ||
              config.connectorId,
          },
          accessIssue(error),
        ),
      );
      mcpResults.push({
        connectorId: config.connectorId,
        message: error.message,
      });
      task?.({ message: error.message, level: "warning" });
    }
  }
  const distinctIds = [...new Set(result.jobIds)];
  const added = distinctIds.filter((id) => !beforeIds.has(id)).length,
    updated = distinctIds.length - added;
  const attention =
    result.sourceReport?.filter(
      (s) => !["available", "empty"].includes(s.status),
    ).length ?? result.failed;
  return {
    ...result,
    jobIds: distinctIds,
    added,
    updated,
    mcpResults,
    strategy,
    message: `${distinctIds.length} distinct listings saved: ${added} new, ${updated} updated. ${result.sourcesChecked || 0} built-in sources and ${mcpResults.length} MCP tools attempted. ${attention || 0} sources need attention.${result.recoveredCount ? ` ${result.recoveredCount} listings saved through provider recovery.` : ""}`,
  };
}
module.exports = { runSearch };
