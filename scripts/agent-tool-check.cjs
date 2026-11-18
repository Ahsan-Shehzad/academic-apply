const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { Store } = require("../desktop/store.cjs");
const { Providers } = require("../desktop/providers.cjs");
const { createToolBridge } = require("../desktop/agent-tools.cjs");
(async () => {
  const root = fs.mkdtempSync(path.resolve(".test-data/agent-tool-"));
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
  const results = [];
  try {
    for (const provider of process.argv[2]
      ? [process.argv[2]]
      : ["codex", "antigravity"]) {
      let calls = 0;
      const bridge = await createToolBridge(
        [
          {
            name: "academicapply_portal",
            description:
              "Return the fixture ticket from the current application browser. Call this to obtain the ticket.",
            inputSchema: {
              type: "object",
              properties: { action: { type: "string", enum: ["inspect"] } },
              required: ["action"],
              additionalProperties: false,
            },
          },
        ],
        async (_name, args) => {
          assert.equal(args.action, "inspect");
          calls++;
          return {
            ticket: "ACADEMICAPPLY_BROWSER_OK",
            fields: [],
            note: "This is a read-only local fixture.",
          };
        },
      );
      try {
        const output = await providers.run(
          "Call the academicapply_portal tool with action inspect. Return the ticket string it gives you. The task is complete only after you call the tool. No other tools are needed.",
          { provider, workflow: "portal", tools: bridge, timeout: 120000 },
        );
        assert.ok(
          calls > 0,
          "The provider did not use the browser tool: " + output,
        );
        assert.ok(output.includes("ACADEMICAPPLY_BROWSER_OK"), output);
        results.push({ provider, toolCalls: calls, passed: true });
        console.log(provider, "tool bridge passed", calls);
      } finally {
        bridge.close();
      }
    }
    fs.writeFileSync(
      "qa/agent-tool-results.json",
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
