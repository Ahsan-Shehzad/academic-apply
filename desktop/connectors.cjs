"use strict";

const fs = require("node:fs");

const path = require("node:path");

const { SOURCES, id, now } = require("./core.cjs");

const { fetchPage, listingLinks, safeUrl } = require("./discovery.cjs");

const { searchUrl } = require("./source-catalog.cjs");

const releaseChecks = (() => {
  try {
    return require("../resources/source-access-report.json").results;
  } catch {
    return [];
  }
})();

const { readBoards } = require("./employer-feeds.cjs");

const { rawFetch } = require("./discovery.cjs");

const { McpClient } = require("./mcp-client.cjs");
const { accessIssue } = require("./source-access.cjs");

const readTool = (tool) =>
  tool &&
  typeof tool.name === "string" &&
  tool.name.length <= 128 &&
  !/submit|apply|create|delete|send|update|register|login|write/i.test(
    tool.name,
  ) &&
  (tool.annotations?.readOnlyHint === true ||
    /^(search|find|list|fetch|get|read)(?:[_./-]|[A-Z]|$)/.test(tool.name));

function resultRecords(result) {
  if (!result || typeof result !== "object")
    throw new Error("MCP returned no tool result");

  if (result.isError) {
    const detail = (result.content || [])
      .map((item) => (item?.type === "text" ? String(item.text || "") : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
    throw new Error(
      detail
        ? `The MCP tool reported an error: ${detail}`
        : "The MCP tool reported an error. Check its configuration and arguments.",
    );
  }

  const blocks = [];

  if (result.structuredContent) blocks.push(result.structuredContent);

  for (const item of result.content || [])
    if (item.type === "text") {
      try {
        blocks.push(
          JSON.parse(item.text.replace(/^```(?:json)?\s*|\s*```$/g, "")),
        );
      } catch {}
    }

  const byUrl = new Map();

  function walk(value, depth = 0) {
    if (!value || depth > 6 || byUrl.size >= 60) return;

    if (Array.isArray(value)) {
      for (const item of value.slice(0, 120)) walk(item, depth + 1);

      return;
    }

    if (typeof value !== "object") return;

    let url = "";
    for (const key of [
      "url",

      "applicationUrl",

      "application_url",

      "job_url",

      "official_url",

      "link",
    ])
      if (typeof value[key] === "string" && value[key].startsWith("https://")) {
        url = value[key];
        break;
      }

    if (url && !byUrl.has(url)) {
      byUrl.set(url, {
        url,
        ...(typeof value.title === "string" ? { title: value.title } : {}),
        ...(typeof value.institution === "string"
          ? { institution: value.institution }
          : typeof value.company === "string"
            ? { institution: value.company }
            : {}),
        ...(typeof value.country === "string"
          ? { country: value.country }
          : {}),
        ...(typeof value.description === "string"
          ? { description: value.description }
          : {}),
        ...(typeof value.deadline === "string" || value.deadline === null
          ? { deadline: value.deadline }
          : {}),
        ...(typeof value.applicationUrl === "string"
          ? { applicationUrl: value.applicationUrl }
          : {}),
        ...(typeof value.official === "boolean"
          ? { official: value.official }
          : {}),
        ...(value.browserVerified ? { browserVerified: true } : {}),
      });
    }

    for (const key of [
      "jobs",

      "results",

      "listings",

      "positions",

      "data",

      "items",
    ])
      walk(value[key], depth + 1);
  }

  blocks.forEach((block) => walk(block));

  return [...byUrl.values()].slice(0, 60);
}

function resultLinks(result) {
  return resultRecords(result).map((r) => r.url);
}

class Connectors {
  constructor(store, options = {}) {
    this.store = store;

    this.fetchPage = options.fetchPage || fetchPage;

    this.fetchApi = options.fetchApi || rawFetch;

    this.validateUrl = options.validateUrl || safeUrl;

    this.encrypt = options.encrypt;

    this.decrypt = options.decrypt;

    this.portalMcp = options.portalMcp || null;

    this.createClient =
      options.createClient ||
      ((record, token) =>
        new McpClient(record, { token, allowLocal: !!record.local }));

    if (!store.get("metadata", "connectors-v1")) {
      const selected = new Set(
        store.list("searches").flatMap((s) => s.sources || []),
      );

      for (const source of SOURCES)
        if (selected.has(source.id)) this.install(source.id);

      store.put("metadata", { id: "connectors-v1", migratedAt: now() });
    }

    if (!store.get("metadata", "source-catalog-v2")) {
      for (const source of SOURCES)
        if (!store.get("connectors", source.id)) this.install(source.id);

      for (const search of store.list("searches"))
        store.put("searches", {
          ...search,
          sources: [
            ...new Set([
              ...(search.sources || []),
              ...SOURCES.filter((s) => !s.access.startsWith("employer")).map(
                (s) => s.id,
              ),
            ]),
          ],
        });

      store.put("metadata", { id: "source-catalog-v2", migratedAt: now() });
    }

    if (this.portalMcp) this.ensurePortalMcp();
  }

  ensurePortalMcp() {
    const id = "mcp-portal-browser";
    const existing = this.store.get("connectors", id);
    const tools = this.portalMcp.tools().map((t) => ({
      name: t.name,
      description: String(t.description || "").slice(0, 1000),
      inputSchema: t.inputSchema || { type: "object" },
    }));
    this.store.put("connectors", {
      ...existing,
      id,
      name: "AcademicApply Portal Browser MCP (LinkedIn, Indeed, Glassdoor & Academic Portals)",
      endpoint: existing?.endpoint || "http://127.0.0.1:0/mcp",
      protocol: "2025-11-25",
      type: "mcp",
      local: true,
      enabled: existing ? existing.enabled !== false : true,
      installedAt: existing?.installedAt || now(),
      tools,
      status: existing?.status === "error" ? "error" : "available",
      message:
        existing?.message ||
        "Built-in Chrome MCP ready for LinkedIn, Indeed, Glassdoor, HigherEdJobs, THE, AcademicPositions, Interfolio, ResearchGate and Seek. Sign in once in Chrome for gated portals.",
    });
    if (!this.store.get("metadata", "portal-mcp-v1")) {
      for (const search of this.store.list("searches")) {
        const mcpTools = [...(search.mcpTools || [])];
        if (!mcpTools.some((t) => t.connectorId === id)) {
          mcpTools.push({
            connectorId: id,
            tool: "search_all_major_portals",
            arguments: {
              query: "{{keywords}}",
              location: "{{countries}}",
              maxResults: 25,
            },
          });
          this.store.put("searches", { ...search, mcpTools });
        }
      }
      this.store.put("metadata", { id: "portal-mcp-v1", migratedAt: now() });
    }
  }

  configureBoards(connectorId, boards) {
    const record = this.store.get("connectors", connectorId);

    if (!record || !["greenhouse", "lever", "ashby"].includes(connectorId))
      throw new Error("Unknown employer feed");

    for (const board of boards)
      require("./employer-feeds.cjs").endpoint(connectorId, board);

    this.store.put("connectors", {
      ...record,
      boards: [...new Set(boards)],
      status: "not_tested",
      message: "Configuration saved. Test the public employer feeds.",
    });

    if (boards.length)
      for (const search of this.store.list("searches"))
        this.store.put("searches", {
          ...search,
          sources: [...new Set([...(search.sources || []), connectorId])],
        });
    return {
      message:
        "Employer boards saved and added to saved searches. You can change source selection in Scheduler.",
    };
  }

  async testAll(task, signal) {
    const records = this.catalog().filter((c) => c.installed),
      results = [];

    let next = 0;

    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < records.length) {
          if (signal?.aborted) throw new Error("Connector tests cancelled");

          const record = records[next++];

          try {
            results.push(await this.test(record.id, null, signal));
          } catch (error) {
            results.push({
              connectorId: record.id,
              ...accessIssue(error),
            });
          }

          task?.({
            progress: Math.round((results.length / records.length) * 95),
            message: `Tested ${results.length}/${records.length}: ${record.name} · ${results.at(-1).status}`,
          });
        }
      }),
    );

    return {
      results,
      message: `Tested ${results.length} connectors. ${results.filter((r) => r.status === "available").length} returned vacancy links/feed records. Review per-source results in Connectors.`,
    };
  }

  catalog() {
    return [
      ...SOURCES.map((source) => ({
        ...source,

        type: "bundled",

        bundledVersion: "1",

        ...(this.store.get("connectors", source.id) || {}),

        installed: !!this.store.get("connectors", source.id),

        ...((this.store.get("sources", source.id)?.checkedAt || "") >
        (this.store.get("connectors", source.id)?.checkedAt || "")
          ? this.store.get("sources", source.id)
          : {}),
        sourceHealth: this.store.get("sources", source.id),

        releaseCheck: releaseChecks.find((c) => c.connectorId === source.id),
      })),

      ...this.store

        .list("connectors")

        .filter((c) => c.type === "mcp")

        .map((c) => ({
          ...c,

          hasToken: !!this.store.get("connectorSecrets", c.id),

          installed: true,
        })),
    ];
  }

  isEnabled(sourceId) {
    return !!this.store.get("connectors", sourceId)?.enabled;
  }

  install(sourceId) {
    const source = SOURCES.find((s) => s.id === sourceId);

    if (!source) throw new Error("Unknown bundled connector");

    const folder = path.join(this.store.root, "connectors", sourceId);

    fs.mkdirSync(folder, { recursive: true });

    fs.writeFileSync(
      path.join(folder, "connector.json"),

      JSON.stringify(
        { ...source, adapter: "public-vacancies", version: 1 },

        null,

        2,
      ),
    );

    const record = {
      ...this.store.get("connectors", sourceId),

      id: sourceId,

      type: "bundled",

      enabled: true,

      installedAt: now(),
    };

    this.store.put("connectors", record);

    return record;
  }

  enable(connectorId, enabled) {
    const record = this.store.get("connectors", connectorId);

    if (!record) throw new Error("Install the connector first");

    this.store.put("connectors", { ...record, enabled });

    return { message: enabled ? "Connector enabled." : "Connector disabled." };
  }

  async configure(config, token) {
    await this.validateUrl(config.endpoint);

    const previous = config.id ? this.store.get("connectors", config.id) : null;

    if (previous && previous.type !== "mcp")
      throw new Error("A bundled connector cannot be replaced");

    const record = {
      id: previous?.id || "mcp-" + id(),

      name: config.name,

      endpoint: config.endpoint,

      protocol: config.protocol || "2026-07-28",

      type: "mcp",

      enabled: true,

      installedAt: previous?.installedAt || now(),

      tools: [],

      status: "not_tested",
    };

    if (token) {
      if (!this.encrypt) throw new Error("Secure token storage is unavailable");

      this.store.put("connectorSecrets", {
        id: record.id,

        encrypted: this.encrypt(token),
      });
    } else if (previous && previous.endpoint !== record.endpoint)
      this.store.remove("connectorSecrets", record.id);

    this.store.put("connectors", record);

    return {
      id: record.id,

      message: "MCP connection added. Test it to discover its tools.",
    };
  }

  async client(record) {
    if (record.local && this.portalMcp) {
      const started = await this.portalMcp.start();
      const updated = { ...record, endpoint: started.endpoint };
      this.store.put("connectors", updated);
      return this.createClient(updated, started.token);
    }
    const secret = this.store.get("connectorSecrets", record.id);

    const token = secret ? this.decrypt(secret.encrypted) : "";

    return this.createClient(record, token);
  }

  async test(connectorId, task, signal) {
    const record = this.store.get("connectors", connectorId);

    if (!record) throw new Error("Install the connector first");

    try {
      let result;

      if (record.type === "mcp") {
        task?.({ message: "Connecting to the MCP endpoint", progress: 15 });

        const client = await this.client(record);

        try {
          await client.connect(signal);

          const tools = await client.tools(signal);

          result = {
            status: "available",

            tools: tools.filter(readTool).map((t) => ({
              name: t.name,

              description: String(t.description || "").slice(0, 1000),

              inputSchema: t.inputSchema || { type: "object" },
            })),

            message: `${tools.length} tools discovered; ${tools.filter(readTool).length} research tools available.`,
          };
        } finally {
          await client.close();
        }
      } else {
        const source = SOURCES.find((s) => s.id === connectorId);

        task?.({
          message: `Checking ${source.name} and its published access rules`,

          progress: 20,
        });

        if (source.access === "employer-api") {
          if (!record.boards?.length)
            result = {
              status: "configuration_required",
              message:
                "Add employer board identifiers. This platform has no global job index.",
            };
          else {
            const feed = await readBoards(
              source.id,
              record.boards,
              this.fetchApi,
              signal,
            );
            result = {
              status: feed.failures.length
                ? "partial"
                : feed.jobs.length
                  ? "available"
                  : "empty",
              linksCount: feed.jobs.length,
              message: `${feed.jobs.length} published vacancies returned by public API. ${feed.failures.length} boards unavailable.`,
              failures: feed.failures,
            };
          }
        } else if (source.access === "employer-browser")
          result = {
            status: "configuration_required",
            message:
              "Use an institution's career-board URL in Discover > Add a job. The platform homepage is not a vacancy index.",
          };
        else if (source.access === "manual")
          result = {
            status: "manual",
            message:
              "Manual search required by provider access rules. Use the official search and import employer vacancy links; no scraping test attempted.",
          };
        else {
          const page = await this.fetchPage(
            searchUrl(source),
            signal
              ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
              : AbortSignal.timeout(30000),
          );

          const links = listingLinks(page.html, page.url);

          result = {
            status: links.length ? "available" : "needs_browser",
            linksCount: links.length,
            testedUrl: page.url,
            message: links.length
              ? `${links.length} candidate vacancy links found on the tested page. Search relevance and individual pages are checked during discovery.`
              : "Page opened but no vacancy links extracted. Use provider research or open in Chrome.",
          };
        }
      }

      this.store.put("connectors", { ...record, ...result, checkedAt: now() });
      if (record.type !== "mcp")
        this.store.put("sources", {
          id: record.id,
          ...result,
          checkedAt: now(),
        });

      return { connectorId, ...result };
    } catch (error) {
      this.store.put("connectors", {
        ...record,

        ...accessIssue(error),

        checkedAt: now(),
      });
      if (record.type !== "mcp")
        this.store.put("sources", {
          id: record.id,
          ...accessIssue(error),
          checkedAt: now(),
        });

      throw error;
    }
  }

  async run(connectorId, toolName, args, discovery, task, signal) {
    const record = this.store.get("connectors", connectorId);

    if (!record?.enabled || record.type !== "mcp")
      throw new Error("Enable an MCP connector first");

    const client = await this.client(record);

    try {
      task?.({ message: "Checking current MCP research tools", progress: 5 });

      await client.connect(signal);

      const tools = await client.tools(signal);

      if (!tools.some((t) => t.name === toolName && readTool(t)))
        throw new Error("This research tool is no longer available");

      task?.({ message: `Running ${toolName}`, progress: 15 });

      const result = await client.rpc(
        "tools/call",

        { name: toolName, arguments: args },

        signal,
      );

      const records = resultRecords(result);

      if (!records.length)
        throw new Error(
          "No structured vacancy URLs were returned. The tool must return jobs/results with HTTPS url fields.",
        );

      const jobIds = [];

      let failed = 0,
        skipped = 0;

      for (const [index, entry] of records.entries()) {
        if (signal?.aborted) throw new Error("Connector search cancelled");

        task?.({
          message: `Verifying vacancy ${index + 1} of ${records.length}`,

          progress: 30 + Math.round((index / records.length) * 60),
        });

        try {
          const job = await discovery.import(entry.url, signal, task, {
            mcpRecord: entry,
          });

          if (job) jobIds.push(job.id);
          else skipped++;
        } catch (error) {
          failed++;

          task?.({
            message: `Vacancy could not be imported: ${error.message}`,

            level: "warning",
          });
        }
      }

      if (!jobIds.length && !skipped)
        throw new Error(
          `None of ${records.length} returned pages could be imported. Review the log and try browser import.`,
        );

      return {
        jobIds,

        connectorId,

        failed,
        skipped,

        message: `${jobIds.length} listings imported · ${failed} pages unavailable.`,
      };
    } finally {
      await client.close();
    }
  }
}

module.exports = { Connectors, resultLinks, resultRecords, readTool };
