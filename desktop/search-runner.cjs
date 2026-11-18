"use strict";
const { suitable } = require("./discovery.cjs");
const { expandArguments, advancedMatch } = require("./search-options.cjs");
async function runSearch(
  { store, discovery, connectors },
  search,
  task,
  signal,
  forceAI,
) {
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
            result.jobIds.length >=
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
    } catch (error) {
      if (signal?.aborted) throw error;
      result.failed++;
      mcpResults.push({
        connectorId: config.connectorId,
        message: error.message,
      });
      task?.({ message: error.message, level: "warning" });
    }
  }
  return {
    ...result,
    jobIds: [...new Set(result.jobIds)],
    mcpResults,
    strategy,
    message: `${result.added} new - ${result.updated} updated. ${result.sourcesChecked || 0} built-in source methods and ${mcpResults.length} MCP tools checked. ${result.failed || 0} unavailable or failed. Check Activity for coverage details.`,
  };
}
module.exports = { runSearch };
