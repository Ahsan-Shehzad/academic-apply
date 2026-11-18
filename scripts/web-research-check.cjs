const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { Store } = require("../desktop/store.cjs");
const { Providers } = require("../desktop/providers.cjs");
const { Discovery } = require("../desktop/discovery.cjs");
const { SOURCES } = require("../desktop/core.cjs");
if (process.env.DEBUG_WEB_TOOLS) {
  const { AntigravityACP } = require("../desktop/antigravity-acp.cjs");
  const old = AntigravityACP.prototype.newSession;
  AntigravityACP.prototype.newSession = async function (options) {
    this.on("notification", (m) => {
      if (
        m.method === "session/update" &&
        /tool_call/.test(m.params?.update?.sessionUpdate)
      ) {
        const u = m.params.update;
        console.log(
          "TOOL",
          JSON.stringify({
            title: u.title,
            kind: u.kind,
            status: u.status,
            rawInput: u.rawInput,
            content: u.content,
          }).slice(0, 1400),
        );
      }
    });
    const authorize = this.authorize.bind(this);
    this.authorize = async (params) => {
      console.log("PERMISSION", JSON.stringify(params).slice(0, 1200));
      return authorize(params);
    };
    return old.call(this, options);
  };
}
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/web-research-"));
  const store = await Store.open(root);
  store.put("settings", {
    ...store.settings(),
    cloudConsent: true,
    effort: "medium",
    models: { codex: "gpt-6.1-sol", antigravity: "gemini-3.8-flash" },
  });
  const providers = new Providers(store, (_name, e) => {
    if (e.phase) console.log(e.phase);
  });
  const discovery = new Discovery(store, providers);
  const results = [];
  try {
    for (const provider of process.argv[2]
      ? [process.argv[2]]
      : ["codex", "antigravity"]) {
      store.put("settings", { ...store.settings(), provider });
      const task = (u) => console.log(u.message || "");
      const jobs = await discovery.research(
        {
          ...(process.env.TEST_LISTING_URL
            ? { url: process.env.TEST_LISTING_URL }
            : {}),
          countries: ["Netherlands"],
          roles: ["Lecturer", "Assistant Professor", "Postdoctoral"],
          keywords: "machine learning, speech AI, NLP",
          sourceHints: [
            {
              name: "AcademicTransfer",
              url: "https://www.academictransfer.com/en/jobs/",
            },
          ],
          maximum: 1,
          request: process.env.TEST_LISTING_URL
            ? "Read exactly this official vacancy URL with the native public URL reader. Use at most one read and one search, then return the facts or an empty jobs array. Do not search for other vacancies."
            : "Find one current academic vacancy; use native internet search and cite actual official evidence.",
        },
        task,
        new AbortController().signal,
      );
      assert.ok(Array.isArray(jobs));
      results.push({
        provider,
        structuredWebResearch: true,
        jobs: jobs.map((j) => ({
          title: j.title,
          url: j.url,
          sources: j.retrieval.sources.map((s) => s.url),
          verification: j.verification.status,
        })),
      });
      console.log(provider, JSON.stringify(results.at(-1)));
    }
    fs.writeFileSync(
      "qa/web-research-" + (process.argv[2] || "both") + "-results.json",
      JSON.stringify(results, null, 2),
    );
  } finally {
    providers.close();
    store.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
