const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { Store } = require("../desktop/store.cjs");
const { Providers } = require("../desktop/providers.cjs");
const { parseJson } = require("../desktop/core.cjs");
(async () => {
  const store = await Store.open(path.resolve(".test-data/provider-live"));
  store.put("settings", {
    ...store.settings(),
    cloudConsent: false,
    effort: "medium",
    providerPaths: { codex: "", antigravity: "" },
    models: { codex: "gpt-6.1-sol", antigravity: "gemini-3.8-flash-medium" },
  });
  const providers = new Providers(store);
  const results = [];
  try {
    await assert.rejects(providers.run("test"), /Enable AI processing/);
    const checked = await Promise.allSettled(
      ["codex", "antigravity"].map(async (provider) => {
        const result = await providers.health(provider, true);
        console.log(provider, result.status, result.models?.length, "models");
        assert.equal(result.status, "ready", result.message);
        assert.ok(result.inferenceAt);
        return {
          provider,
          status: result.status,
          models: result.models.length,
          selectedModel: result.selectedModel,
          version: result.version,
          inferencePassed: true,
        };
      }),
    );
    for (const result of checked) {
      if (result.status === "rejected") throw result.reason;
      results.push(result.value);
    }
    store.put("settings", { ...store.settings(), cloudConsent: true });
    const drafted = await Promise.allSettled(
      results.map(async (result) => {
        const output = await providers.run(
          'Return only valid JSON with keys "subject" and "paragraph". Draft one formal academic cover-letter paragraph for Example Candidate, applying for Lecturer in Computing at Example University. Verified facts: teaches Python and software engineering; researches speech machine learning. Use only these facts. No tools are needed.',
          { provider: result.provider, workflow: "documents", timeout: 120000 },
        );
        const content = parseJson(output);
        assert.ok(content.subject && content.paragraph?.length > 80);
        result.structuredDraftPassed = true;
        console.log(result.provider, "structured document draft passed");
      }),
    );
    for (const result of drafted)
      if (result.status === "rejected") throw result.reason;
    fs.mkdirSync("qa", { recursive: true });
    fs.writeFileSync(
      "qa/provider-results.json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          aiOffGuardPassed: true,
          providers: results,
        },
        null,
        2,
      ),
    );
  } finally {
    providers.close();
    store.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
