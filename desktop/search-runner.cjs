"use strict";
const { suitable } = require("./discovery.cjs");
const { WebDiscovery } = require("./web-discovery.cjs");
const { SOURCES } = require("./core.cjs");
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
  const webAllowed =
    strategy !== "sources" &&
    store.settings().cloudConsent &&
    store.settings().providerWebResearch !== false;
  const selectedSources = search.sources || [];
  const catalog = connectors?.catalog?.() || [];
  const reliable = selectedSources.filter((id) => {
    const source = SOURCES.find((s) => s.id === id),
      record = catalog.find((c) => c.id === id);
    if (!source) return false;
    if (source.access === "employer-api")
      return !!store.get("connectors", id)?.boards?.length;
    const health = store.get("sources", id) || record?.releaseCheck;
    return (
      health?.status === "available" ||
      (!health && ["academictransfer", "uniroles"].includes(id))
    );
  });
  const publicSources =
    strategy === "ai" ? [] : webAllowed ? reliable : selectedSources;
  const operations = [];
  let latestProgress = 0;
  const progress = (lane) => {
    const update = (patch) => {
      if (!task) return;
      const mapped =
        patch.progress === undefined
          ? undefined
          : lane === "web"
            ? 10 + patch.progress * 0.8
            : patch.progress * 0.2;
      if (mapped !== undefined)
        latestProgress = Math.max(latestProgress, mapped);
      task({
        ...patch,
        ...(mapped === undefined ? {} : { progress: latestProgress }),
      });
    };
    update.id = task?.id;
    return update;
  };
  if (webAllowed)
    operations.push({
      name: "Internet search",
      run: () =>
        new WebDiscovery(store, engine, engine.providers).run(
          scoped,
          progress("web"),
          signal,
        ),
    });
  else if (strategy !== "sources")
    task?.({
      message:
        "Internet research is disabled. Running the selected public connectors only; enable AI processing and provider web research for search-engine discovery.",
      level: "warning",
    });
  if (publicSources.length)
    operations.push({
      name: "Public connectors",
      run: () =>
        engine.search(
          { ...scoped, sources: publicSources, providerResearch: false },
          progress("sources"),
          signal,
        ),
    });
  const mcpResults = [];
  if (search.mcpTools?.length) {
    operations.push({
      name: "Connected MCP sources",
      run: async () => {
        const mcpCap = Math.max(
          50,
          search.maxResults || store.settings().maxResults || 30,
        );
        const mcpJobIds = [];
        const mcpReports = [];
        let mcpFailed = 0;
        let mcpAdded = 0;
        let mcpUpdated = 0;
        for (const config of search.mcpTools || []) {
          if (signal?.aborted) throw new Error("Search cancelled");
          if (mcpJobIds.length >= mcpCap) {
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
              import: async (url, sig, _task, { mcpRecord } = {}) => {
                let job = null;
                try {
                  job = await engine.import(url, sig, task, {
                    persist: false,
                    providerResearch: false,
                  });
                } catch (error) {
                  if (sig?.aborted) throw error;
                  if (
                    mcpRecord?.description &&
                    mcpRecord.description.length >= 150 &&
                    mcpRecord.title
                  ) {
                    await require("./discovery.cjs").safeUrl(url);
                    job = require("./core.cjs").JobSchema.parse({
                      title: mcpRecord.title,
                      institution:
                        mcpRecord.institution || "Institution not identified",
                      country: mcpRecord.country || "Unknown",
                      url,
                      applicationUrl: mcpRecord.applicationUrl || url,
                      description: mcpRecord.description,
                      focus: mcpRecord.description.slice(0, 700),
                      deadline: mcpRecord.deadline ?? null,
                      official: !!mcpRecord.official,
                    });
                    job.verification = {
                      status: mcpRecord.browserVerified
                        ? "browser_verified"
                        : "mcp_reported",
                      url,
                      at: require("./core.cjs").now(),
                    };
                  } else throw error;
                }
                if (
                  !suitable(job, search) ||
                  !advancedMatch(job, search, store.get("profile", "main")?.data)
                )
                  return null;
                if (new Set(mcpJobIds).size >= mcpCap) return null;
                const saved = discovery.save(
                  job,
                  "MCP search: " + store.get("connectors", config.connectorId)?.name,
                );
                mcpJobIds.push(saved.job.id);
                saved.isNew ? mcpAdded++ : mcpUpdated++;
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
            mcpReports.push(
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
            mcpFailed++;
            mcpReports.push(
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
        return {
          jobIds: mcpJobIds,
          added: mcpAdded,
          updated: mcpUpdated,
          failed: mcpFailed,
          sourcesChecked: 0,
          sourceReport: mcpReports,
          candidateCount: 0,
        };
      },
    });
  }
  const outcomes = await Promise.allSettled(operations.map((o) => o.run()));
  signal?.throwIfAborted();
  let succeeded = 0;
  for (const [index, outcome] of outcomes.entries()) {
    if (outcome.status === "rejected") {
      result.failed++;
      (result.sourceReport ||= []).push({
        id: index === 0 && webAllowed ? "web-search" : "connectors",
        name: operations[index].name,
        ...accessIssue(outcome.reason),
      });
      task?.({
        message:
          operations[index].name +
          " could not finish: " +
          outcome.reason.message +
          ". Other discovery results are retained.",
        level: "warning",
      });
      continue;
    }
    succeeded++;
    const value = outcome.value;
    result.jobIds.push(...value.jobIds);
    result.failed += value.failed || 0;
    result.sourcesChecked += value.sourcesChecked || 0;
    (result.sourceReport ||= []).push(...(value.sourceReport || []));
    if (value.searchKey) {
      for (const key of [
        "searchKey",
        "depth",
        "queriesPlanned",
        "queriesRequested",
        "queriesReported",
        "observedSearchActions",
        "queriesRemaining",
        "queryOutcomes",
        "coverageCycle",
        "candidateIds",
        "pendingCandidates",
        "excludedCandidates",
        "detailsAttempted",
        "budgetReached",
        "recoveredCount",
      ])
        result[key] = value[key];
      result.candidateCount = value.candidateIds.length;
    } else
      result.connectorCandidates =
        (result.connectorCandidates || 0) + (value.candidateCount || 0);
  }
  if (!succeeded && outcomes.length && !search.mcpTools?.length)
    throw outcomes[0].reason || new Error("Discovery could not run");
  result.webSearchEnabled = !!webAllowed;
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
    fullListings: distinctIds.filter((id) => {
      const j = store.get("jobs", id);
      return (
        j?.description?.length >= 200 &&
        j.institution &&
        !/not identified|unknown/i.test(j.institution)
      );
    }).length,
    sourceVerifiedListings: distinctIds.filter(
      (id) => store.get("jobs", id)?.verification?.status === "source_verified",
    ).length,
    added,
    updated,
    mcpResults,
    strategy,
    message: `${distinctIds.length} distinct listings saved: ${added} new, ${updated} updated.${result.webSearchEnabled ? ` ${result.candidateIds?.length || 0} candidate links considered; ${result.pendingCandidates || 0} await full details. ${result.queriesReported || 0}/${result.queriesRequested || 0} queries reported searched; ${result.queriesRemaining || 0} planned queries remain.` : ""} ${result.sourcesChecked || 0} built-in sources and ${mcpResults.length} MCP tools attempted. ${attention || 0} sources need attention.${result.recoveredCount ? ` ${result.recoveredCount} listings saved through provider recovery.` : ""}`,
  };
}
module.exports = { runSearch };
