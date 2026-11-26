"use strict";
const { z } = require("zod");
const { searchPlan } = require("./search-plan.cjs");
const {
  canonicalUrl,
  hash,
  now,
  parseJson,
  matchJob,
  ALL_COUNTRIES,
  SOURCES,
} = require("./core.cjs");
const {
  safeUrl,
  privateAddress,
  fetchPage,
  extractListing,
} = require("./discovery.cjs");
const {
  listingDetails,
  readableVacancy,
  exclusionReasons,
  normalized,
} = require("./listing-details.cjs");
const { accessIssue } = require("./source-access.cjs");
const net = require("node:net");
const linkProperties = {
  queryId: { type: "string" },
  url: { type: "string" },
  title: { type: "string" },
  institution: { type: "string" },
  country: { type: "string" },
  snippet: { type: "string", maxLength: 360 },
  evidenceUrl: { type: "string" },
  alternateUrls: { type: "array", maxItems: 3, items: { type: "string" } },
};
const LINK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["queries", "candidates"],
  properties: {
    queries: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "status", "note"],
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["searched", "unavailable"] },
          note: { type: "string" },
        },
      },
    },
    candidates: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(linkProperties),
        properties: linkProperties,
      },
    },
  },
};
function publicLink(raw) {
  try {
    const url = new URL(raw),
      host = url.hostname.replace(/^\[|\]$/g, "");
    if (
      (/(^|\.)google\.[a-z.]+$/.test(host) ||
        /(^|\.)bing\.com$/.test(host) ||
        /(^|\.)duckduckgo\.com$/.test(host)) &&
      /^\/(?:search|url)?\/?$/.test(url.pathname)
    )
      return null;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      host === "localhost" ||
      host.endsWith(".local") ||
      (net.isIP(host) && privateAddress(host))
    )
      return null;
    if (
      /\/login|\/signin|\/sign-in|\/auth(?:\/|\?)|mail\.google|outlook\./i.test(
        url.href,
      )
    )
      return null;
    return canonicalUrl(url.href);
  } catch {
    return null;
  }
}
const Candidate = z.object({
  queryId: z.string(),
  url: z.string().max(4000),
  title: z.string().min(2).max(400),
  institution: z.string().max(400),
  country: z.string().max(100),
  snippet: z.string().max(2400),
  evidenceUrl: z.string().max(4000),
  alternateUrls: z.array(z.string().max(4000)).max(3),
});
function parseLinks(value, batch) {
  if (
    !value ||
    !Array.isArray(value.queries) ||
    !Array.isArray(value.candidates)
  )
    throw new Error(
      "Web search did not return query outcomes and candidate links.",
    );
  const ids = new Set(batch.map((q) => q.id));
  const queries = value.queries
    .filter(
      (q) => ids.has(q?.id) && ["searched", "unavailable"].includes(q.status),
    )
    .map((q) => ({
      id: q.id,
      status: q.status,
      note: String(q.note || "").slice(0, 1000),
    }));
  const candidates = [];
  for (const raw of value.candidates.slice(0, 80)) {
    const parsed = Candidate.safeParse(raw);
    if (!parsed.success || !ids.has(raw.queryId)) continue;
    const c = parsed.data,
      url = publicLink(c.url),
      evidenceUrl = publicLink(c.evidenceUrl);
    if (
      !url ||
      !evidenceUrl ||
      /^(?:search|browse|all|find) (?:jobs|vacancies)|^careers$/i.test(
        c.title.trim(),
      )
    )
      continue;
    candidates.push({
      ...c,
      url,
      evidenceUrl,
      country: ALL_COUNTRIES.includes(c.country) ? c.country : "Unknown",
      alternateUrls: [
        ...new Set(c.alternateUrls.map(publicLink).filter(Boolean)),
      ],
    });
  }
  return { queries, candidates };
}
const WEB_BATCH_SIZE = 2;

async function collectLinks(
  providers,
  batch,
  { task, signal, skipConsent = false } = {},
) {
  signal?.throwIfAborted();
  const activities = [];
  const output = await providers.run(
    `Today is ${new Date().toISOString().slice(0, 10)}. Find current open or newly advertised vacancies. Exclude announcements explicitly closed, expired or archived; keep plausible ads with unclear dates for later verification. Use native internet search efficiently (at most 3-4 concise searches per query) to run EACH of the ${batch.length} queries below. This is URL discovery, not full listing drafting. Collect up to 12 distinct vacancy detail links per query (24 total). Prefer original employer announcements; include relevant academic portals too. Use the supplied query id for every result. Keep exact advertised titles, institutions, location and a concise evidence excerpt under 220 characters; use Unknown / Institution not identified when not stated. Do not guess URLs or details. Include only links actually returned by your search tools, not invented links or generic search homepages. alternateUrls may contain an official employer equivalent ONLY if retrieved. Do not discard a plausible role merely because its full page is blocked or because it lacks the exact specialist keyword. Broad computing/AI faculty roles are intentionally relevant alongside specialist research. Report unavailable if your internet search tool cannot run. Do not pretend a query was executed. Search snippets are provisional, not verified listing text. No shell, local files, email, form actions, scraping Google HTML or bypassing site restrictions. Return ONLY concise JSON without extra prose. Query data:\n${JSON.stringify(batch)}`,
    {
      workflow: "discovery",
      taskId: task?.id,
      webSearch: true,
      researchMode: "links",
      readOnlyTools: true,
      skipConsent,
      outputSchema: LINK_SCHEMA,
      timeout: 300000,
      webActionLimit: 40,
      signal,
      onWebActivity: (event) => activities.push(event),
    },
  );
  signal?.throwIfAborted();
  return { ...parseLinks(parseJson(output), batch), activities };
}
function candidateKey(url) {
  return hash(canonicalUrl(url));
}
function candidatePriority(link, search, profile) {
  const text = `${link.title} ${link.snippet || ""}`.toLowerCase();
  const keywords = String(search.keywords || "")
    .split(/[,;\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  return (
    matchJob(
      { ...link, description: link.snippet, focus: link.snippet },
      profile,
    ).score +
    Math.min(30, keywords.filter((k) => text.includes(k)).length * 10) +
    (/\bclosed\b|expired|archived/i.test(link.snippet || "") ? -60 : 0)
  );
}
class WebDiscovery {
  constructor(store, discovery, providers = discovery.providers) {
    Object.assign(this, { store, discovery, providers });
  }
  keepCandidate(link, plan, query) {
    const id = candidateKey(link.url),
      previous = this.store.get("jobCandidates", id);
    const history = [
      ...(previous?.provenance || []),
      {
        queryId: query.id,
        query: query.query,
        evidenceUrl: link.evidenceUrl,
        snippet: link.snippet,
        at: now(),
      },
    ];
    const stale =
      previous?.status === "imported" &&
      Date.now() - Date.parse(previous.lastVerifiedAt || 0) > 7 * 86400000;
    const record = {
      ...previous,
      ...link,
      id,
      firstSeen: previous?.firstSeen || now(),
      lastSeen: now(),
      status: stale ? "pending" : previous?.status || "pending",
      priority: candidatePriority(
        link,
        plan.criteria || {},
        this.store.get("profile", "main")?.data,
      ),
      searchKeys: [
        ...new Set([...(previous?.searchKeys || []), plan.fingerprint]),
      ],
      provenance: history.slice(-12),
    };
    this.store.put("jobCandidates", record);
    return record;
  }
  update(candidate, patch) {
    const current = this.store.get("jobCandidates", candidate.id);
    if (!current || current.status === "ignored") return current;
    return this.store.put("jobCandidates", {
      ...current,
      ...patch,
      updatedAt: now(),
    });
  }
  promote(candidate, job, search, method) {
    if (this.store.get("jobCandidates", candidate.id)?.status === "ignored")
      return null;
    let complete = listingDetails(job, candidate);
    if (!readableVacancy(complete, candidate)) {
      this.update(candidate, {
        status: "needs_review",
        reason:
          "The page did not establish a full matching vacancy with an identified employer.",
      });
      return null;
    }
    const reasons = exclusionReasons(
      complete,
      search,
      this.store.get("profile", "main")?.data,
    );
    if (reasons.length) {
      this.update(candidate, {
        status: "excluded",
        reason: reasons.join("; "),
        exclusionReasons: reasons,
        lastVerifiedAt: now(),
      });
      return null;
    }
    complete = {
      ...complete,
      retrieval: {
        ...complete.retrieval,
        method,
        aliases: [
          ...new Set([candidate.url, ...candidate.alternateUrls, complete.url]),
        ],
        sources:
          complete.retrieval?.sources ||
          candidate.provenance
            .map((p) => ({ url: p.evidenceUrl, evidence: p.snippet }))
            .slice(-5),
        at: now(),
      },
      verification: complete.verification || {
        status: "source_verified",
        url: complete.url,
        at: now(),
      },
    };
    if (this.activeRun && this.activeRun.jobIds.size >= this.activeRun.cap) {
      this.update(candidate, {
        status: "needs_review",
        reason:
          "Listing budget reached; details are retained for the next pass.",
      });
      return null;
    }
    const saved = this.discovery.save(complete, "Web search · " + method, {
      strictIdentity: true,
      aliases: complete.retrieval.aliases,
    });
    this.activeRun?.jobIds.add(saved.job.id);
    this.update(candidate, {
      status: "imported",
      jobId: saved.job.id,
      lastVerifiedAt: now(),
      reason: saved.job.detailCoverage.notes.join(" "),
      verification: saved.job.verification,
    });
    return saved.job.id;
  }
  async readCandidate(candidate, search, task, signal) {
    for (const url of [
      ...new Set([...candidate.alternateUrls, candidate.url]),
    ].slice(0, 4)) {
      signal?.throwIfAborted();
      try {
        let page = await (this.discovery.fetchPage || fetchPage)(url, signal);
        const source =
          SOURCES.find(
            (s) =>
              new URL(s.base).hostname.replace(/^www\./, "") ===
              new URL(page.url).hostname.replace(/^www\./, ""),
          ) || {};
        let job, parseError;
        try {
          job = extractListing(page.html, page.url, source);
        } catch (error) {
          parseError = error;
        }
        // Render only pages already allowed/read by the public reader. This is
        // for JavaScript content, never a CAPTCHA or robots/403 bypass.
        if (
          search.browserMode !== "http" &&
          (search.browserMode === "headless" ||
            !job ||
            job.description.length < 200)
        ) {
          if (!this.renderer)
            this.renderer =
              new (require("./public-page-browser.cjs").PublicPageBrowser)();
          if (
            (this.browserReads || 0) <
            Math.min(60, this.activeBudget?.details || 24)
          ) {
            this.browserReads = (this.browserReads || 0) + 1;
            page = await (this.discovery.renderPage?.(page.url, signal) ||
              this.renderer.read(page.url, signal));
            job = extractListing(page.html, page.url, source);
          }
        }
        if (!job)
          throw (
            parseError || new Error("No readable vacancy after page rendering")
          );
        const id = this.promote(
          candidate,
          job,
          search,
          page.method || "public_page",
        );
        if (id) return id;
        if (
          this.store.get("jobCandidates", candidate.id)?.status === "excluded"
        )
          return null;
      } catch (error) {
        if (signal?.aborted) throw error;
        this.update(candidate, {
          status: "needs_review",
          reason: error.message,
          access: accessIssue(error),
        });
      }
    }
    return null;
  }
  async recoverCandidates(candidates, search, task, signal) {
    const targets = candidates
      .filter(
        (c) => this.store.get("jobCandidates", c.id)?.status !== "excluded",
      )
      .slice(0, 5);
    if (!targets.length) return [];
    task?.({
      message: `Retrieving full requirements and official employer equivalents for ${targets.length} unresolved vacancies`,
    });
    try {
      const jobs = await this.discovery.research(
        {
          targets: targets.map((c) => ({
            url: c.url,
            title: c.title,
            institution: c.institution,
          })),
          maximum: 5,
          queryLimit: 6,
          pageReadLimit: 8,
          request:
            "Retrieve the FULL exact vacancies listed in targets, including all advertised eligibility, required documents, deadline text and official application links. Search each title and institution for an official employer equivalent if the portal is blocked. Do not substitute a different vacancy. Do not return a search snippet as a full description.",
        },
        task,
        signal,
      );
      const ids = [];
      for (const job of jobs) {
        for (const target of targets) {
          if (this.store.get("jobCandidates", target.id)?.status === "imported")
            continue;
          if (!readableVacancy(listingDetails(job, target), target)) continue;
          const id = this.promote(
            target,
            job,
            search,
            "provider_official_research",
          );
          if (id) ids.push(id);
          break;
        }
      }
      return ids;
    } catch (error) {
      if (signal?.aborted) throw error;
      task?.({
        message:
          "Full-detail research could not finish: " +
          error.message +
          ". Candidate links are retained.",
        level: "warning",
      });
      return [];
    }
  }
  async run(
    search,
    task,
    signal,
    { detailsOnly = false, ids = null, searchKey = null } = {},
  ) {
    try {
      const plan = searchPlan(search),
        budget = plan.budget,
        started = Date.now(),
        deadline = started + budget.minutes * 60000;
      if (
        detailsOnly &&
        searchKey &&
        this.store.get("searchCoverage", searchKey)
      )
        plan.fingerprint = searchKey;
      this.activeBudget = budget;
      let coverage = this.store.get("searchCoverage", plan.fingerprint);
      if (
        !coverage ||
        (!detailsOnly &&
          coverage.completedQueryIds.length >= plan.queries.length)
      )
        coverage = {
          id: plan.fingerprint,
          completedQueryIds: [],
          cycle: (coverage?.cycle || 0) + 1,
        };
      const completed = new Set(coverage.completedQueryIds),
        pending = plan.queries.filter((q) => !completed.has(q.id));
      const selected = detailsOnly ? [] : pending.slice(0, budget.queries),
        jobIds = new Set(),
        candidateIds = new Set();
      const result = {
        jobIds: [],
        candidateIds: [],
        sourcesChecked: 0,
        failed: 0,
        sourceReport: [],
        queriesPlanned: plan.queries.length,
        queriesRequested: 0,
        queriesReported: 0,
        observedSearchActions: 0,
        queriesRemaining: pending.length,
        detailsAttempted: 0,
        recoveredCount: 0,
        searchKey: plan.fingerprint,
        depth: plan.depth,
        queryOutcomes: [],
        coverageCycle: coverage.cycle,
      };
      const cap = Math.min(2000, search.maxResults || budget.results);
      let recoveryCalls = 0;
      this.activeRun = { jobIds, cap };
      const attemptedDetails = new Set();
      const pendingCandidates = () =>
        this.store
          .list("jobCandidates")
          .filter(
            (c) =>
              c.searchKeys?.includes(plan.fingerprint) &&
              (!ids || ids.includes(c.id)) &&
              ["pending", "needs_review"].includes(c.status),
          )
          .sort(
            (a, b) =>
              candidatePriority(
                b,
                search,
                this.store.get("profile", "main")?.data,
              ) -
                candidatePriority(
                  a,
                  search,
                  this.store.get("profile", "main")?.data,
                ) || Date.parse(a.firstSeen) - Date.parse(b.firstSeen),
          );
      const checkpoint = () => {
        result.jobIds = [...jobIds];
        result.candidateIds = [...candidateIds];
        result.queriesRemaining = plan.queries.length - completed.size;
        result.pendingCandidates = pendingCandidates().length;
        result.fullListings = jobIds.size;
        result.excludedCandidates = this.store
          .list("jobCandidates")
          .filter(
            (c) =>
              c.searchKeys?.includes(plan.fingerprint) &&
              c.status === "excluded",
          ).length;
        task?.({ partialResult: { ...result } });
      };
      const details = async (count) => {
        const candidates = pendingCandidates()
          .filter((c) => !attemptedDetails.has(c.id))
          .slice(0, Math.min(count, budget.details - result.detailsAttempted));
        let index = 0;
        await Promise.all(
          Array.from({ length: Math.min(4, candidates.length) }, async () => {
            while (
              index < candidates.length &&
              Date.now() < deadline &&
              jobIds.size < cap
            ) {
              signal?.throwIfAborted();
              const c = candidates[index++];
              candidateIds.add(c.id);
              attemptedDetails.add(c.id);
              result.detailsAttempted++;
              task?.({
                message: `Reading full vacancy ${result.detailsAttempted}/${budget.details}: ${c.title}`,
                progress:
                  20 +
                  Math.min(
                    65,
                    Math.round((result.detailsAttempted / budget.details) * 65),
                  ),
              });
              const id = await this.readCandidate(c, search, task, signal);
              if (id) jobIds.add(id);
              checkpoint();
            }
          }),
        );
        const unresolved = candidates
          .map((c) => this.store.get("jobCandidates", c.id))
          .filter((c) => c && c.status === "needs_review");
        for (
          let i = 0;
          i < unresolved.length &&
          recoveryCalls < budget.recovery &&
          Date.now() < deadline &&
          jobIds.size < cap;
          i += 5
        ) {
          signal?.throwIfAborted();
          recoveryCalls++;
          const recovered = await this.recoverCandidates(
            unresolved.slice(i, i + Math.min(5, cap - jobIds.size)),
            search,
            task,
            signal,
          );
          for (const id of recovered) jobIds.add(id);
          result.recoveredCount += new Set(recovered).size;
          checkpoint();
        }
      };
      // Revisit retained unresolved candidates before issuing another broad search.
      if (pendingCandidates().length)
        await details(Math.min(12, Math.ceil(budget.details / 3)));
      for (
        let offset = 0;
        offset < selected.length &&
        candidateIds.size < budget.candidates &&
        jobIds.size < cap &&
        Date.now() < deadline;
        offset += WEB_BATCH_SIZE
      ) {
        signal?.throwIfAborted();
        const batch = selected.slice(offset, offset + WEB_BATCH_SIZE);
        result.queriesRequested += batch.length;
        task?.({
          message: `Web discovery: query batch ${Math.floor(offset / WEB_BATCH_SIZE) + 1}/${Math.ceil(selected.length / WEB_BATCH_SIZE)} · ${batch.map((q) => q.country).join(", ")}`,
          progress:
            5 + Math.round((offset / Math.max(1, selected.length)) * 25),
        });
        try {
          const found = await collectLinks(this.providers, batch, {
            task,
            signal,
          });
          const actions = found.activities.filter((a) => a.type === "search");
          result.observedSearchActions += actions.length;
          const outcomes = batch.map((q) => {
            const response = found.queries.find((r) => r.id === q.id);
            return {
              ...q,
              status:
                response?.status === "searched"
                  ? "provider_reported"
                  : "unavailable",
              note: response?.note || "No query outcome returned",
              observedSearchActions: actions.length,
            };
          });
          result.queryOutcomes.push(...outcomes);
          result.queriesReported += outcomes.filter(
            (q) => q.status === "provider_reported",
          ).length;
          this.store.transaction(() => {
            for (const q of outcomes) {
              if (q.status === "provider_reported") completed.add(q.id);
              this.store.put("searchQueries", {
                ...q,
                id: plan.fingerprint + ":" + q.id,
                searchKey: plan.fingerprint,
                cycle: coverage.cycle,
                at: now(),
              });
            }
            for (const link of found.candidates) {
              if (candidateIds.size >= budget.candidates) break;
              const candidate = this.keepCandidate(
                link,
                plan,
                batch.find((q) => q.id === link.queryId),
              );
              candidateIds.add(candidate.id);
            }
            this.store.put("searchCoverage", {
              ...coverage,
              criteria: { ...search, id: undefined },
              totalQueries: plan.queries.length,
              completedQueryIds: [...completed],
              lastRun: now(),
            });
          });
          if (!actions.length)
            task?.({
              message:
                "The provider returned search outcomes, but native search activity was not observed. Links remain provisional until full details are read.",
              level: "warning",
            });
          task?.({
            message: `${found.candidates.length} candidate links retained from this batch; retrieving full listing details next`,
          });
        } catch (error) {
          if (signal?.aborted) throw error;
          result.failed++;
          result.queryOutcomes.push(
            ...batch.map((q) => ({
              ...q,
              status: "failed",
              note: error.message,
            })),
          );
          task?.({
            message: "Web query batch failed: " + error.message,
            level: "warning",
          });
        }
        checkpoint();
        await details(
          Math.max(
            4,
            Math.ceil(
              budget.details /
                Math.max(1, Math.ceil(selected.length / WEB_BATCH_SIZE)),
            ),
          ),
        );
      }
      if (Date.now() < deadline && jobIds.size < cap)
        await details(budget.details - result.detailsAttempted);
      checkpoint();
      result.budgetReached =
        Date.now() >= deadline ||
        result.queriesRemaining > 0 ||
        result.pendingCandidates > 0;
      result.sourceReport.push({
        id: "web-search",
        name: "Provider internet search",
        status: result.observedSearchActions
          ? "available"
          : result.queriesReported
            ? "limited"
            : "unavailable",
        message: `${result.queriesReported} query outcomes reported; ${result.observedSearchActions} completed native search actions observed.`,
        action: result.observedSearchActions
          ? ""
          : "Run Test web search in Settings to check this provider and model.",
      });
      result.message = `${jobIds.size} full listings saved; ${candidateIds.size} candidate links considered; ${result.pendingCandidates} need detail review. ${result.queriesReported}/${result.queriesRequested} requested queries reported searched, ${result.observedSearchActions} native search actions observed. ${result.queriesRemaining} planned queries remain for subsequent runs.`;
      return result;
    } finally {
      await this.renderer?.close();
    }
  }
}
module.exports = {
  WebDiscovery,
  collectLinks,
  parseLinks,
  publicLink,
  candidateKey,
  LINK_SCHEMA,
};
