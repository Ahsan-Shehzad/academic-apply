const fs = require("node:fs");
const path = require("node:path");
const { Store } = require("../desktop/store.cjs");
const { Providers } = require("../desktop/providers.cjs");
const { parseJson } = require("../desktop/core.cjs");
(async () => {
  const store = await Store.open(
    path.resolve(".test-data", "ai-search-diagnose"),
  );
  store.put("settings", {
    ...store.settings(),
    cloudConsent: true,
    provider: "antigravity",
    effort: "high",
    models: { codex: "", antigravity: "gemini-3.8-flash-high" },
  });
  if (process.argv[2] === "codex")
    store.put("settings", {
      ...store.settings(),
      provider: "codex",
      effort: "medium",
      models: { ...store.settings().models, codex: "gpt-6.1-sol" },
    });
  let lastLog = 0;
  const providers = new Providers(store, (type, data) => {
    if (type === "ai-progress" && Date.now() - lastLog > 5000) {
      console.log(data.phase || `${data.characters} response characters`);
      lastLog = Date.now();
    }
  });
  try {
    const { Discovery } = require("../desktop/discovery.cjs");
    const { defaultSearch } = require("../desktop/core.cjs");
    const discovery = new Discovery(store, providers);
    const result = await discovery.aiSearch(
      {
        ...defaultSearch(),
        countries: ["Netherlands"],
        sources: ["academictransfer"],
      },
      (update) => {
        if (update.message) console.log(update.message);
      },
      new AbortController().signal,
    );
    console.log(
      JSON.stringify({
        completed: true,
        candidates: result.candidateCount,
        imported: result.jobIds.length,
      }),
    );
    fs.writeFileSync(
      "qa/ai-search-diagnosis.json",
      JSON.stringify({ completed: true, ...result }, null, 2),
    );
  } finally {
    providers.close();
    store.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
