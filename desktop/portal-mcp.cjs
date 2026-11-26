"use strict";
const http = require("node:http");
const crypto = require("node:crypto");
const { SOURCES, canonicalUrl } = require("./core.cjs");
const { extractListing, safeUrl } = require("./discovery.cjs");
const { searchUrl } = require("./source-catalog.cjs");

const MAJOR_PORTALS = [
  "linkedin",
  "indeed",
  "the",
  "higheredjobs",
  "researchgatejobs",
  "academicpositions",
  "glassdoor",
  "seek",
  "interfolio",
];

const PORTAL_TOOL_MAP = {
  search_linkedin_jobs: "linkedin",
  search_indeed_jobs: "indeed",
  search_glassdoor_jobs: "glassdoor",
  search_higheredjobs: "higheredjobs",
  search_times_higher_education: "the",
  search_academic_positions: "academicpositions",
  search_interfolio_jobs: "interfolio",
  search_researchgate_jobs: "researchgatejobs",
  search_seek_jobs: "seek",
};

const LOGIN_PATTERNS =
  /sign in to view|join now|log in or sign up|authwall|checkpoint\/challenge|verify you are human|just a moment\.\.\.|enable javascript and cookies|^forbidden$|access denied|accept only necessary cookies/i;

function firstQueryTerms(query) {
  const parts = String(query || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts.slice(0, 3) : ["computer science"];
}

function firstLocation(location) {
  const parts = String(location || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[0] || "";
}

function portalSearchTarget(portalId, query, location) {
  const source = SOURCES.find((s) => s.id === portalId);
  if (!source) throw new Error(`Unknown portal: ${portalId}`);
  if (portalId === "interfolio") {
    const q = encodeURIComponent(query || "computer science");
    return {
      source,
      url: `https://apply.interfolio.com/search?q=${q}`,
    };
  }
  if (portalId === "researchgatejobs") {
    const q = encodeURIComponent(firstQueryTerms(query)[0] || "computer science");
    return {
      source,
      url: `https://www.researchgate.net/jobs?query=${q}`,
    };
  }
  return {
    source,
    url: searchUrl(source, {
      query,
      countries: location ? [location] : [],
    }),
  };
}

function portalLoginUrl(portalId) {
  switch (portalId) {
    case "linkedin":
      return "https://www.linkedin.com/login";
    case "indeed":
      return "https://secure.indeed.com/auth";
    case "glassdoor":
      return "https://www.glassdoor.com/profile/login_input.htm";
    case "researchgatejobs":
      return "https://www.researchgate.net/login";
    case "interfolio":
      return "https://account.interfolio.com/login";
    default: {
      const source = SOURCES.find((s) => s.id === portalId);
      return source ? source.base + "/" : "https://www.google.com";
    }
  }
}

async function extractPortalCardsFromPage(page, portalId, maxResults = 25) {
  const url = page.url();
  const bodyText = await page
    .evaluate(() => (document.body?.innerText || "").slice(0, 8000))
    .catch(() => "");
  const title = await page.title().catch(() => "");
  const trimmedBody = bodyText.trim();
  const gated =
    trimmedBody.length < 4000 &&
    !/jobs|results|posting/i.test(title) &&
    LOGIN_PATTERNS.test(title + "\n" + trimmedBody.slice(0, 3000));

  const cards = await page.evaluate(
    ({ portalId, maxResults }) => {
      const clean = (v) =>
        String(v || "")
          .replace(/\s+/g, " ")
          .trim();
      const absUrl = (href) => {
        try {
          const u = new URL(href, location.href);
          if (u.protocol !== "https:") return "";
          return u.toString();
        } catch {
          return "";
        }
      };
      const out = [];
      const seen = new Set();
      const push = (item) => {
        if (!item?.url || seen.has(item.url) || out.length >= maxResults) return;
        seen.add(item.url);
        out.push({
          url: item.url,
          title: clean(item.title).slice(0, 300),
          institution: clean(item.institution).slice(0, 250),
          location: clean(item.location).slice(0, 200),
          snippet: clean(item.snippet).slice(0, 1200),
        });
      };

      // 1. JSON-LD JobPosting entries if embedded on the search page
      for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const walk = (node) => {
            if (!node || typeof node !== "object") return;
            if (Array.isArray(node)) return node.forEach(walk);
            if (
              node["@type"] === "JobPosting" ||
              (Array.isArray(node["@type"]) && node["@type"].includes("JobPosting"))
            ) {
              const u = absUrl(node.url || location.href);
              if (u)
                push({
                  url: u,
                  title: node.title,
                  institution: node.hiringOrganization?.name || "",
                  location:
                    node.jobLocation?.address?.addressCountry ||
                    node.jobLocation?.address?.addressLocality ||
                    "",
                  snippet: node.description || "",
                });
            }
            if (node["@graph"]) walk(node["@graph"]);
            if (node.itemListElement) walk(node.itemListElement);
            if (node.item) walk(node.item);
          };
          walk(JSON.parse(el.textContent || "{}"));
        } catch {}
      }

      // 2. Portal-specific selectors
      if (portalId === "linkedin") {
        // 2a. Classic LinkedIn DOM with /jobs/view/ anchors
        for (const card of document.querySelectorAll(
          ".jobs-search-results__list-item, .scaffold-layout__list-item, .base-card, [data-job-id], li.ember-view",
        )) {
          const link = card.querySelector(
            'a[href*="/jobs/view/"], a.job-card-list__title--link, a.base-card__full-link',
          );
          if (!link) continue;
          const u = absUrl(link.getAttribute("href"));
          if (!u || !/\/jobs\/view\//i.test(u)) continue;
          const cleanU = u.split("?")[0];
          const t =
            card.querySelector(
              ".job-card-list__title, .base-search-card__title, strong, h3",
            )?.textContent || link.textContent;
          const inst = card.querySelector(
            ".job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .base-search-card__subtitle, h4",
          )?.textContent;
          const loc = card.querySelector(
            ".job-card-container__metadata-wrapper, .job-search-card__location",
          )?.textContent;
          push({ url: cleanU, title: t, institution: inst, location: loc });
        }
        // 2b. Modern 2026 signed-in LinkedIn SDUI job cards (`componentkey="job-card-component-ref-<id>"`)
        for (const card of document.querySelectorAll(
          '[componentkey^="job-card-component-ref-"]',
        )) {
          const key = card.getAttribute("componentkey") || "";
          const m = key.match(/(\d{7,})/);
          if (!m) continue;
          const jobUrl = `https://www.linkedin.com/jobs/view/${m[1]}/`;
          const rawLines = (card.innerText || card.textContent || "")
            .split(/\r?\n+/)
            .map((s) => clean(s))
            .filter(
              (s) =>
                s &&
                !/^(actively reviewing applicants|be an early applicant|promoted|easy apply|applied|saved|verified job)$/i.test(
                  s,
                ),
            );
          const first = (rawLines[0] || "").replace(/\s*\(Verified job\)\s*/i, "").trim();
          const second = (rawLines[1] || "").replace(/\s*\(Verified job\)\s*/i, "").trim();
          const titleLine =
            first && second && first === second
              ? first
              : first || second;
          const rest = rawLines.filter((s) => s.replace(/\s*\(Verified job\)\s*/i, "").trim() !== titleLine);
          const instLine = rest[0] || "";
          const locLine = rest[1] || "";
          if (!titleLine) continue;
          push({
            url: jobUrl,
            title: titleLine,
            institution: instLine,
            location: locLine,
            snippet: rawLines.join(" · "),
          });
        }
      } else if (portalId === "indeed") {
        for (const card of document.querySelectorAll(
          ".job_seen_beacon, [data-jk], .resultContent, .tapItem",
        )) {
          const link =
            card.querySelector('a[data-jk], a.jcs-JobTitle, h2 a[href]') ||
            (card.matches("a[href]") ? card : null);
          const jk =
            link?.getAttribute("data-jk") || card.getAttribute("data-jk");
          const rawHref = link?.getAttribute("href");
          const u = jk
            ? `https://www.indeed.com/viewjob?jk=${encodeURIComponent(jk)}`
            : absUrl(rawHref);
          if (!u) continue;
          const t =
            card.querySelector("h2, .jobTitle, a.jcs-JobTitle")?.textContent ||
            link?.textContent;
          const inst = card.querySelector(
            '[data-testid="company-name"], .companyName',
          )?.textContent;
          const loc = card.querySelector(
            '[data-testid="text-location"], .companyLocation',
          )?.textContent;
          const snip = card.querySelector(
            '.job-snippet, [data-testid="jobsnippet_footer"]',
          )?.textContent;
          push({
            url: u,
            title: t,
            institution: inst,
            location: loc,
            snippet: snip,
          });
        }
      } else if (portalId === "glassdoor") {
        for (const card of document.querySelectorAll(
          '[data-test="jobListing"], .JobCard_jobCardContainer__arQlW, li.react-job-listing',
        )) {
          const link = card.querySelector(
            'a[data-test="job-title"], a[href*="job-listing"], a[href*="jobListing"]',
          );
          if (!link) continue;
          const u = absUrl(link.getAttribute("href"));
          if (!u) continue;
          const inst = card.querySelector(
            '[data-test="employer-short-name"], .EmployerProfile_compactEmployerName__LE242',
          )?.textContent;
          const loc = card.querySelector(
            '[data-test="emp-location"]',
          )?.textContent;
          push({
            url: u,
            title: link.textContent,
            institution: inst,
            location: loc,
          });
        }
      } else if (portalId === "researchgatejobs") {
        const byHref = new Map();
        for (const a of document.querySelectorAll('a[href*="/job/"], a[href^="job/"]')) {
          const u = absUrl(a.getAttribute("href"));
          if (!u || !/\/job\/\d+/i.test(u)) continue;
          const txt = clean(a.textContent);
          const card = a.closest("article, li, div[class*='item'], div[class*='job'], div");
          const prev = byHref.get(u);
          if (!prev || (txt && !/^view$/i.test(txt) && txt.length > prev.title.length)) {
            byHref.set(u, {
              url: u,
              title: txt && !/^view$/i.test(txt) ? txt : prev?.title || "",
              snippet: card ? clean(card.innerText || card.textContent).slice(0, 700) : "",
            });
          }
        }
        for (const item of byHref.values()) {
          if (item.title && item.title.length >= 6) push(item);
        }
      }

      // 3. Generic anchor extraction for academic & regional portals
      if (
        ![
          "linkedin",
          "indeed",
          "glassdoor",
          "researchgatejobs",
        ].includes(portalId)
      ) {
        const jobLinkRe =
          portalId === "academicpositions"
            ? /\/ad\/[^/]+/i
            : /(?:\/jobs?\/[^/]+|\/viewjob|\/rc\/clk|\/jobs\/view\/|\/job-listing\/|\/partner\/jobListing|\/unijobs\/listing\/|\/ad\/[^/]+|\/vacanc[^/]*\/|\/position[s]?\/|\/display-job\/|\/ledige-stillinger\/|\/Offres\/|\/en\/jobs\/\d|\/available-jobs\/job|\/details\.cfm|\/job-detail\/|\/stellenangebote--|\/stellenangebot\/|\/offre[^/]*\/|\/lediga-jobb\/|\/annonser\/\d|\/ajo\/jobs\/\d|^\/\d{5,}\/?$)/i;
        const skipTextRe =
          /privacy|cookie|contact|sign in|register|job alert|search jobs|browse jobs|all jobs|terms|help/i;
        for (const a of document.querySelectorAll("a[href]")) {
          if (out.length >= maxResults) break;
          const u = absUrl(a.getAttribute("href"));
          if (!u) continue;
          let parsed;
          try {
            parsed = new URL(u);
          } catch {
            continue;
          }
          const pathAndQuery = parsed.pathname + parsed.search;
          if (!jobLinkRe.test(pathAndQuery) && !jobLinkRe.test(parsed.pathname))
            continue;
          const card = a.closest(
            "article, li, .job, .vacancy, .result, .card, tr, div[class*='job'], div[class*='result']",
          );
          const heading =
            card?.querySelector("h1, h2, h3, h4")?.textContent || a.textContent;
          const label = clean(
            heading ||
              a.getAttribute("aria-label") ||
              a.getAttribute("title") ||
              a.textContent,
          );
          if (label.length < 6 || skipTextRe.test(label)) continue;
          const inst =
            card?.querySelector(
              "[class*='company'], [class*='employer'], [class*='org'], [class*='institution'], [data-testid='company-name']",
            )?.textContent || "";
          const loc =
            card?.querySelector("[class*='location'], [class*='country']")
              ?.textContent || "";
          push({
            url: u,
            title: label,
            institution: inst,
            location: loc,
            snippet: card ? clean(card.innerText || card.textContent).slice(0, 700) : "",
          });
        }
      }
      return out;
    },
    { portalId, maxResults },
  );

  return {
    url,
    title,
    gated: gated && cards.length === 0,
    cards,
  };
}

class PortalMcpServer {
  constructor(options = {}) {
    this.browser = options.browser || null;
    this.validateUrl = options.validateUrl || safeUrl;
    this.searchFn = options.searchFn || null;
    this.server = null;
    this.token = crypto.randomBytes(24).toString("hex");
    this.port = 0;
    this.sessions = new Set();
    this.chain = Promise.resolve();
  }

  tools() {
    const portalSchema = {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keywords (e.g. 'speech AI', 'assistant professor computer science')",
        },
        location: {
          type: "string",
          description: "Country, city, or region filter",
        },
        maxResults: {
          type: "integer",
          description: "Maximum vacancy records to collect (default 20, max 50)",
        },
      },
      required: ["query"],
    };
    const list = [
      {
        name: "search_all_major_portals",
        description:
          "Search major authenticated & JS-rendered portals (LinkedIn, Indeed, Glassdoor, HigherEdJobs, Times Higher Education, AcademicPositions, Interfolio, ResearchGate, Seek) in Chrome and extract structured vacancies.",
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            location: { type: "string" },
            portals: {
              type: "array",
              items: { type: "string" },
              description: "Optional subset of portal IDs",
            },
            maxResults: { type: "integer" },
          },
          required: ["query"],
        },
      },
      {
        name: "search_portal_jobs",
        description:
          "Search any AcademicApply portal adapter using the persistent Chrome browser.",
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: "object",
          properties: {
            portal: { type: "string", description: "Connector ID (e.g. indeed, linkedin, glassdoor, the, higheredjobs)" },
            query: { type: "string" },
            location: { type: "string" },
            maxResults: { type: "integer" },
          },
          required: ["portal", "query"],
        },
      },
    ];
    for (const [name, portal] of Object.entries(PORTAL_TOOL_MAP)) {
      const source = SOURCES.find((s) => s.id === portal);
      list.push({
        name,
        description: `Search ${source?.name || portal} via AcademicApply's persistent Chrome session and extract vacancy URLs and descriptions.`,
        annotations: { readOnlyHint: true },
        inputSchema: portalSchema,
      });
    }
    return list;
  }

  async scrapePortal(portalId, query, location, maxResults = 20, signal, opts = {}) {
    if (this.searchFn)
      return this.searchFn(portalId, { query, location, maxResults }, signal);
    if (!this.browser)
      throw new Error("Browser service is unavailable for portal search.");
    const queries = firstQueryTerms(query);
    const loc = firstLocation(location);
    const context = await this.browser.launch();
    const page = await context.newPage();
    const collected = new Map();
    const warnings = [];
    let gated = false;
    try {
      for (const q of queries) {
        if (signal?.aborted) throw new Error("Portal search cancelled");
        if (collected.size >= maxResults) break;
        const { source, url } = portalSearchTarget(portalId, q, loc);
        try {
          await this.validateUrl(url);
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(2200);
          await page
            .evaluate(() => {
              window.scrollBy(0, Math.min(1800, document.body.scrollHeight));
              const scroller = document.querySelector(
                ".jobs-search-results-list, .scaffold-layout__list, [role='main']",
              );
              if (scroller && scroller.scrollHeight > scroller.clientHeight) {
                scroller.scrollTop = Math.min(1800, scroller.scrollHeight);
              }
            })
            .catch(() => {});
          await page.waitForTimeout(900);
          const extracted = await extractPortalCardsFromPage(
            page,
            portalId,
            maxResults - collected.size,
          );
          if (extracted.gated) {
            gated = true;
            warnings.push(
              `${source.name} requires sign-in or human verification in Chrome. Use Sign in to portals in Connectors.`,
            );
            break;
          }
          for (const card of extracted.cards) {
            let cleanUrl = card.url;
            try {
              cleanUrl = canonicalUrl(cleanUrl);
            } catch {}
            if (!collected.has(cleanUrl)) {
              collected.set(cleanUrl, {
                ...card,
                url: cleanUrl,
                portal: portalId,
                sourceName: source.name,
                country:
                  card.location ||
                  loc ||
                  (source.countries?.length === 1 ? source.countries[0] : "Unknown"),
              });
            }
          }
        } catch (error) {
          if (signal?.aborted) throw error;
          warnings.push(`${source.name}: ${error.message}`);
        }
      }

      // Enrich top cards with full listing pages in the same authenticated Chrome tab
      const jobs = [];
      const detailLimit = Math.min(maxResults, Number(opts?.detailLimit) || 8);
      let enriched = 0;
      for (const item of collected.values()) {
        if (signal?.aborted) throw new Error("Portal search cancelled");
        const cardDesc = [
          item.title,
          item.institution ? `Institution: ${item.institution}` : "",
          item.location || item.country ? `Location: ${item.location || item.country}` : "",
          item.snippet || "",
        ]
          .filter(Boolean)
          .join("\n");
        let record = {
          url: item.url,
          title: item.title,
          institution: item.institution || "Institution not identified",
          country: item.country || "Unknown",
          description:
            (item.snippet || "").length >= 150
              ? item.snippet
              : cardDesc.length >= 150
                ? cardDesc
                : item.snippet || cardDesc,
          applicationUrl: item.url,
          browserVerified: false,
        };
        if (enriched < detailLimit) {
          enriched++;
          try {
            await this.validateUrl(item.url);
            await page.goto(item.url, {
              waitUntil: "domcontentloaded",
              timeout: 22000,
            });
            await page.waitForTimeout(1600);
            const html = await page.content();
            const source = SOURCES.find((s) => s.id === portalId) || {};
            const parsed = extractListing(html, page.url(), source);
            let bestDesc = parsed.description || "";
            const blockedTitle = /access restricted|just a moment|verify you are human|forbidden|access denied|attention required/i.test(
              parsed.title || "",
            );
            if (!blockedTitle && bestDesc.length < 150) {
              const renderedText = await page
                .evaluate(() => {
                  const box = document.querySelector(
                    "#jobDescriptionText, .jobs-description__content, .jobs-box__html-content, main, article",
                  );
                  return (box?.innerText || document.body?.innerText || "")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 6000);
                })
                .catch(() => "");
              if (renderedText.length >= 150 && !LOGIN_PATTERNS.test(renderedText.slice(0, 600))) {
                bestDesc = renderedText;
              }
            }
            if (
              !blockedTitle &&
              bestDesc.length >= 150 &&
              !/access restricted|just a moment|verify you are human|enable cookies/i.test(
                bestDesc.slice(0, 400),
              )
            ) {
              const cleanParsedTitle =
                portalId === "linkedin"
                  ? item.title
                  : parsed.title && !/^jobs \| linkedin$/i.test(parsed.title)
                    ? parsed.title
                    : item.title;
              record = {
                ...parsed,
                url: item.url,
                title: cleanParsedTitle,
                institution:
                  parsed.institution && parsed.institution !== "Institution not identified"
                    ? parsed.institution
                    : item.institution || "Institution not identified",
                country:
                  parsed.country && parsed.country !== "Unknown"
                    ? parsed.country
                    : item.country || "Unknown",
                description: bestDesc,
                browserVerified: true,
              };
            }
          } catch {}
        }
        jobs.push(record);
      }
      return {
        portal: portalId,
        gated,
        warnings,
        jobs,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async callTool(name, args = {}, signal) {
    const query = String(args.query || "").trim() || "computer science";
    const location = String(args.location || "").trim();
    const maxResults = Math.min(50, Math.max(5, Number(args.maxResults) || 20));
    if (name === "search_all_major_portals") {
      const targetPortals = Array.isArray(args.portals) && args.portals.length
        ? args.portals.filter((p) => SOURCES.some((s) => s.id === p))
        : MAJOR_PORTALS;
      const perPortal = Math.max(4, Math.ceil(maxResults / Math.max(1, targetPortals.length)) + 2);
      const startedAt = Date.now();
      const allJobs = [];
      const gatedPortals = [];
      const warnings = [];
      const seen = new Set();
      for (const portalId of targetPortals) {
        if (signal?.aborted) throw new Error("Portal search cancelled");
        if (allJobs.length >= maxResults || Date.now() - startedAt > 240000) break;
        try {
          const res = await this.scrapePortal(
            portalId,
            query,
            location,
            perPortal,
            signal,
            { detailLimit: Math.min(3, perPortal) },
          );
          if (res.gated) gatedPortals.push(portalId);
          warnings.push(...(res.warnings || []));
          for (const job of res.jobs || []) {
            if (seen.has(job.url) || allJobs.length >= maxResults) continue;
            seen.add(job.url);
            allJobs.push(job);
          }
        } catch (error) {
          if (signal?.aborted) throw error;
          warnings.push(`${portalId}: ${error.message}`);
        }
      }
      return {
        jobs: allJobs,
        gatedPortals,
        warnings,
      };
    }
    const portalId =
      PORTAL_TOOL_MAP[name] ||
      (name === "search_portal_jobs" ? String(args.portal || "").trim() : "");
    if (!portalId) throw new Error(`Unknown MCP portal tool: ${name}`);
    return this.scrapePortal(portalId, query, location, maxResults, signal);
  }

  async start() {
    if (this.server) return { endpoint: this.endpoint, token: this.token };
    this.server = http.createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.headers.authorization !== `Bearer ${this.token}`) {
        res.writeHead(403);
        res.end('{"error":"Unauthorized"}');
        return;
      }
      if (req.method === "DELETE") {
        const sid = req.headers["mcp-session-id"];
        if (sid) this.sessions.delete(sid);
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 200000) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      let msg;
      try {
        msg = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      if (msg.id === undefined) {
        res.writeHead(202);
        res.end();
        return;
      }
      const send = (result, extraHeaders = {}) => {
        for (const [k, v] of Object.entries(extraHeaders))
          res.setHeader(k, v);
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
      };
      if (msg.method === "initialize") {
        const sid = crypto.randomUUID();
        this.sessions.add(sid);
        return send(
          {
            protocolVersion: msg.params?.protocolVersion || "2025-11-25",
            capabilities: { tools: {} },
            serverInfo: {
              name: "academicapply-portal-mcp",
              version: "1.0.0",
            },
          },
          { "Mcp-Session-Id": sid },
        );
      }
      if (msg.method === "tools/list") return send({ tools: this.tools() });
      if (msg.method !== "tools/call") {
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: -32601, message: "Method not found" },
          }),
        );
        return;
      }
      try {
        const operation = this.chain.then(() =>
          this.callTool(msg.params?.name, msg.params?.arguments || {}),
        );
        this.chain = operation.catch(() => {});
        const payload = await operation;
        send({
          structuredContent: payload,
          content: [{ type: "text", text: JSON.stringify(payload) }],
        });
      } catch (error) {
        send({
          isError: true,
          content: [{ type: "text", text: error.message }],
        });
      }
    });
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", resolve);
    });
    this.port = this.server.address().port;
    this.endpoint = `http://127.0.0.1:${this.port}/mcp`;
    return { endpoint: this.endpoint, token: this.token };
  }

  async openPortalsForLogin(portalIds = ["linkedin", "indeed", "glassdoor"]) {
    if (!this.browser)
      throw new Error("Chrome browser service is unavailable.");
    const context = await this.browser.launch();
    const opened = [];
    for (const id of portalIds) {
      const target = portalLoginUrl(id);
      const page = await context.newPage();
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
      await page.bringToFront().catch(() => {});
      opened.push({ id, url: target });
    }
    return {
      opened,
      message:
        "Opened portal sign-in tabs in AcademicApply's persistent Chrome window. Sign in to the portals you use, then run search or Test connector.",
    };
  }

  async close() {
    if (this.server) {
      this.server.closeAllConnections?.();
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = {
  PortalMcpServer,
  MAJOR_PORTALS,
  PORTAL_TOOL_MAP,
  portalSearchTarget,
  portalLoginUrl,
  extractPortalCardsFromPage,
};
