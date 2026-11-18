const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { Providers, candidates } = require("../desktop/providers.cjs");
const {
  parseModels,
  connectionKey,
  psLiteral,
} = require("../desktop/provider-tools.cjs");

test("explicit provider override uses its own default model rather than another workflow provider's model", async () => {
  const f = fixture();
  try {
    f.set({
      ...f.settings,
      cloudConsent: true,
      provider: "codex",
      workflowProviders: { discovery: "codex" },
      workflowModels: { discovery: "codex-workflow-model" },
      models: { codex: "codex-default", antigravity: "antigravity-default" },
    });
    let result;
    f.p.runProvider = async (provider, _prompt, options) => (
      (result = { provider, model: options.model }),
      "ok"
    );
    await f.p.run("Task", { workflow: "discovery", provider: "antigravity" });
    assert.deepEqual(result, {
      provider: "antigravity",
      model: "antigravity-default",
    });
  } finally {
    f.cleanup();
  }
});
function fixture(runtime = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-provider-"));
  let settings = {
    provider: "antigravity",
    effort: "medium",
    models: {},
    providerPaths: {},
    cloudConsent: false,
  };
  const records = new Map();
  const store = {
    root,
    settings: () => settings,
    put: (bucket, record) => records.set(bucket + record.id, record),
    get: (bucket, id) => records.get(bucket + id),
  };
  const p = new Providers(store, () => {}, {
    exec: async () => ({
      stdout: "gemini-example\tExample model\n",
      stderr: "",
    }),
    ...runtime,
  });
  p.detect = async () => ({
    provider: "antigravity",
    file: "fixture.exe",
    status: "installed",
    version: "1",
  });
  p.getACP = async () => ({
    info: { agentInfo: { version: "fixture" } },
    newSession: async () => ({
      sessionId: "fixture",
      models: {
        availableModels: parseModels((await p.exec()).stdout).map((m) => ({
          modelId: m.id,
          name: m.label,
        })),
      },
    }),
    release: async () => {},
  });
  return {
    p,
    store,
    settings,
    set: (s) => (settings = s),
    cleanup: () => {
      p.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
test("Antigravity model parser accepts CLI tabs and legacy columns without treating prose as models", () => {
  const models = parseModels(
    "Fetching available models...\ngemini-example\tGemini Example\nclaude-example  Claude Example\ngemini-example\tDuplicate\n",
  );
  assert.deepEqual(
    models.map((m) => m.id),
    ["gemini-example", "claude-example"],
  );
});
test("an explicit invalid executable path cannot silently test a different installation", () => {
  assert.deepEqual(
    candidates("codex", path.join(os.tmpdir(), "missing-cli-executable.exe")),
    [],
  );
  assert.equal(
    psLiteral("C:\\A's folder\\agy.exe"),
    "'C:\\A''s folder\\agy.exe'",
  );
});
test("sign-in availability is distinct from a verified selected-model inference", async () => {
  const f = fixture();
  try {
    let received;
    f.p.runProvider = async (provider, prompt, options) => {
      received = options;
      return JSON.stringify({
        status: "ACADEMICAPPLY_OK",
        sample:
          "I teach computing through clear explanations and practical assessment.",
      });
    };
    const signed = await f.p.health("antigravity", false);
    assert.equal(signed.status, "signed_in");
    assert.equal(signed.inferenceAt, undefined);
    f.settings.models.antigravity = "gemini-example";
    const ready = await f.p.health("antigravity", true);
    assert.equal(ready.status, "ready");
    assert.ok(ready.inferenceAt);
    assert.equal(received.model, "gemini-example");
    assert.equal(received.effort, "medium");
    assert.equal(f.settings.cloudConsent, false);
    assert.equal(ready.checks.length, 4);
  } finally {
    f.cleanup();
  }
});
test("cached sign-in opens no terminal and terminal startup errors never claim success", async () => {
  let terminals = 0;
  const f = fixture({
    openTerminal: async () => {
      terminals++;
      throw new Error("terminal startup failed");
    },
  });
  try {
    assert.match((await f.p.login("antigravity")).message, /already signed in/);
    assert.equal(terminals, 0);
    await assert.rejects(
      f.p.login("antigravity", true),
      /terminal startup failed/,
    );
    assert.equal(terminals, 1);
  } finally {
    f.cleanup();
  }
});
test("failed inference and empty model lists cannot become ready", async () => {
  const f = fixture();
  try {
    f.p.runProvider = async () =>
      "some logs containing ACADEMICAPPLY_OK but no answer";
    assert.equal((await f.p.health("antigravity", true)).status, "error");
    f.p.exec = async () => ({ stdout: "No available models", stderr: "" });
    assert.equal((await f.p.health("antigravity", true)).status, "error");
  } finally {
    f.cleanup();
  }
});
test("model, effort and executable changes invalidate prior success while privacy changes do not", async () => {
  const f = fixture();
  try {
    const original = structuredClone(f.settings);
    f.store.put("providers", {
      id: "antigravity",
      status: "ready",
      inferenceAt: "yesterday",
    });
    f.p.invalidateChanged(original, { ...original, cloudConsent: true });
    assert.equal(f.store.get("providers", "antigravity").status, "ready");
    for (const patch of [
      { models: { antigravity: "other" } },
      { effort: "high" },
      { providerPaths: { antigravity: "different.exe" } },
    ]) {
      const next = { ...original, ...patch };
      assert.notEqual(
        connectionKey(original, "antigravity"),
        connectionKey(next, "antigravity"),
      );
      f.p.invalidateChanged(original, next);
      assert.equal(f.store.get("providers", "antigravity").inferenceAt, null);
    }
    f.p.runProvider = async () => {
      f.set({ ...original, effort: "high" });
      return JSON.stringify({
        status: "ACADEMICAPPLY_OK",
        sample:
          "I teach computing through clear explanations and practical assessment.",
      });
    };
    assert.equal((await f.p.health("antigravity", true)).status, "not_tested");
  } finally {
    f.cleanup();
  }
});
test("empty or malformed output retries once, while quota and cancellation do not retry", async () => {
  const f = fixture();
  try {
    for (const [code, expectedAttempts] of [
      ["AI_EMPTY_RESPONSE", 2],
      ["AI_INVALID_JSON", 2],
      ["QUOTA", 1],
      ["AI_CANCELLED", 1],
    ]) {
      let attempts = 0;
      f.p.runProviderOnce = async () => {
        attempts++;
        throw Object.assign(new Error("fixture"), { code });
      };
      await assert.rejects(
        f.p.runProvider("antigravity", "test", {}),
        /fixture/,
      );
      assert.equal(attempts, expectedAttempts);
    }
  } finally {
    f.cleanup();
  }
});

test("large native browser handoffs retain complete context without exceeding Windows command-line limits", async () => {
  let captured;
  const f = fixture({
    openTerminal: async (spec) => (
      (captured = spec),
      { pid: 123, visible: true }
    ),
  });
  try {
    f.set({
      ...f.settings,
      cloudConsent: true,
      models: { antigravity: "example" },
    });
    const prompt =
      "Selected listing and reviewed package. " + "Context ".repeat(10000);
    await f.p.nativeBrowser(prompt);
    const folder = path.join(f.p.workspace, "native-handoffs"),
      files = fs.readdirSync(folder);
    assert.equal(files.length, 1);
    assert.equal(fs.readFileSync(path.join(folder, files[0]), "utf8"), prompt);
    assert.ok(JSON.stringify(captured).length < 4000);
    assert.ok(JSON.stringify(captured).includes(files[0]));
    assert.ok(!JSON.stringify(captured).includes(prompt));
  } finally {
    f.cleanup();
  }
});
