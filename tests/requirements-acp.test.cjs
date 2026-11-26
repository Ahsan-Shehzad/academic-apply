const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { unzipSync } = require("fflate");
const {
  AntigravityACP,
  sessionModels,
} = require("../desktop/antigravity-acp.cjs");
const {
  planFromJob,
  packageCoverage,
} = require("../desktop/document-requirements.cjs");
const {
  contactFromHtml,
  candidateContact,
} = require("../desktop/candidate-contact.cjs");
const { Store } = require("../desktop/store.cjs");
const { Documents, writeDocx } = require("../desktop/documents.cjs");
test("listing planning distinguishes applicant narratives, original records, optional files and recommendation letters", () => {
  const p = planFromJob({
    description:
      "Submit a CV, cover letter, research proposal and teaching portfolio. Provide names and contact details of three referees. Supply transcripts and two recommendation letters. A diversity statement is optional. Teaching evaluations are not required.",
    requiredDocuments: ["Referee sheet"],
  });
  for (const label of [
    "Academic CV",
    "Cover letter",
    "Research proposal",
    "Teaching portfolio",
    "Referee sheet",
    "Academic transcripts",
    "Recommendation letters",
  ])
    assert.ok(
      p.requirements.some((r) => r.label === label && r.required),
      label,
    );
  assert.equal(
    p.requirements.find((r) => r.label === "Diversity statement").required,
    false,
  );
  assert.ok(!p.requirements.some((r) => r.label === "Teaching evaluations"));
  assert.equal(
    p.requirements.find((r) => r.label === "Recommendation letters").kind,
    "attachment",
  );
});
test("automatic package creates the full extracted set and remains incomplete until required attachments are supplied", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-plan-"));
  const store = await Store.open(root);
  try {
    store.put("settings", { ...store.settings(), cloudConsent: true });
    store.put("profile", {
      id: "main",
      verified: true,
      data: {
        personal: {
          name: "Example Candidate",
          summary: "I teach computing.",
          contact: { emails: [{ value: "example@example.edu" }] },
        },
        education: [],
        experience: [],
      },
    });
    store.put("jobs", {
      id: "job",
      title: "Lecturer",
      institution: "Example University",
      description:
        "Submit CV, teaching statement, research proposal and transcripts.",
    });
    const requirements = [
      ...["Academic CV", "Teaching statement", "Research proposal"].map(
        (type) => ({
          label: type,
          type,
          kind: "generated",
          required: true,
          instructions: "Two pages maximum",
        }),
      ),
      {
        label: "Transcript",
        type: null,
        kind: "attachment",
        required: true,
        instructions: "Official copy",
      },
    ];
    let drafts = 0;
    const docs = new Documents(store, {
      run: async (prompt) => {
        if (prompt.startsWith("Extract EVERY"))
          return JSON.stringify({ requirements });
        drafts++;
        assert.ok(prompt.includes("Two pages maximum"));
        return JSON.stringify({
          title: "Example Candidate",
          subtitle: "Statement",
          sections: [
            {
              heading: "Academic work",
              text: "I teach computing using structured practical work.",
            },
          ],
          evidence: ["personal-summary"],
        });
      },
    });
    const pkg = await docs.draft("job", null);
    assert.equal(drafts, 2);
    assert.deepEqual(
      pkg.documents.map((d) => d.type),
      ["Academic CV", "Teaching statement", "Research proposal"],
    );
    assert.deepEqual(pkg.missingRequirements, ["Transcript"]);
    const sample = path.join(root, "transcript.pdf");
    fs.writeFileSync(sample, "existing official file");
    store.put("library", {
      id: "transcript",
      name: "transcript.pdf",
      path: sample,
    });
    assert.throws(
      () => docs.attach(pkg.id, ["transcript"], "unknown"),
      /requirement/,
    );
    docs.attach(pkg.id, ["transcript"], pkg.requirements[3].id);
    const updated = store.get("packages", pkg.id);
    assert.ok(packageCoverage(updated).every((r) => r.fulfilled));
    assert.equal(updated.status, "draft");
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(pkg.folder, "package-manifest.json")),
      ).missingRequirements.length,
      0,
    );
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("candidate contacts use only the HTML identity header and retain clickable academic network links", async () => {
  const html =
    '<header><div class="identity"><div class="contact-stack"><a href="mailto:me@example.edu">me@example.edu</a><a href="https://orcid.org/0000-example">ORCID</a><span class="contact-item">+861234567890</span></div></div></header><a href="mailto:referee@example.edu">Referee</a>';
  const extracted = contactFromHtml(html);
  assert.equal(extracted.entries.length, 2);
  assert.ok(!JSON.stringify(extracted).includes("referee"));
  const contact = candidateContact({
    personal: {
      contact: {
        emails: [{ value: "me@example.edu" }],
        phones: [{ formatted: "+86 1234567890" }],
        links: [{ label: "orcid", url: "https://orcid.org/0000-example" }],
      },
    },
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-contact-"));
  try {
    const file = path.join(root, "cv.docx");
    await writeDocx(
      file,
      {
        title: "Example",
        subtitle: "Academic Curriculum Vitae",
        sections: [{ heading: "Education", text: "PhD in Computing" }],
      },
      "",
      { type: "Academic CV", contact },
    );
    const zip = unzipSync(fs.readFileSync(file));
    const xml = Buffer.from(zip["word/document.xml"]).toString();
    const rels = Buffer.from(zip["word/_rels/document.xml.rels"]).toString();
    assert.ok(
      xml.includes("me@example.edu") &&
        xml.includes("ORCID") &&
        xml.includes("+86 1234567890"),
    );
    assert.ok(rels.includes("https://orcid.org/0000-example"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
function fakeACP() {
  let processes = 0;
  const calls = [];
  const sessions = [];
  const launch = (_file, args) => {
    processes++;
    assert.ok(args.includes("acp"));
    assert.ok(!args.includes("--dangerously-skip-permissions"));
    const c = new EventEmitter();
    c.stdin = new PassThrough();
    c.stdout = new PassThrough();
    c.stderr = new PassThrough();
    c.kill = () => c.emit("exit", 0);
    c.stdin.on("data", (data) => {
      for (const line of data.toString().trim().split("\n")) {
        const m = JSON.parse(line);
        calls.push(m);
        if (!m.method) continue;
        let result = {};
        if (m.method === "initialize")
          result = { protocolVersion: 1, agentInfo: { version: "fixture" } };
        if (m.method === "session/new") {
          const id = `s-${sessions.length}`;
          sessions.push(id);
          result = {
            sessionId: id,
            configOptions: [
              {
                id: "model",
                category: "model",
                options: [{ value: "gemini-example", name: "Example" }],
              },
              {
                id: "thought_level",
                category: "thought_level",
                options: [{ value: "medium", name: "Medium" }],
              },
            ],
          };
        }
        if (m.method === "session/prompt") {
          if (m.params.prompt[0].text === "WAIT") continue;
          c.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "session/update",
              params: {
                sessionId: "other",
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: "wrong" },
                },
              },
            }) + "\n",
          );
          for (const update of [
            {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: "private thought" },
            },
            {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: '{"answer":"done"}' },
            },
          ])
            c.stdout.write(
              JSON.stringify({
                jsonrpc: "2.0",
                method: "session/update",
                params: { sessionId: m.params.sessionId, update },
              }) + "\n",
            );
          c.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: "permission",
              method: "session/request_permission",
              params: {
                sessionId: m.params.sessionId,
                options: [{ kind: "allow_once", optionId: "allow" }],
              },
            }) + "\n",
          );
          result = { stopReason: "end_turn" };
        }
        if (m.id !== undefined)
          setImmediate(() =>
            c.stdout.write(
              JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\n",
            ),
          );
      }
    });
    return c;
  };
  return {
    launch,
    calls,
    sessions,
    get processes() {
      return processes;
    },
  };
}
test("persistent ACP reuses one server, isolates sessions, applies model and thinking level and denies tool permissions", async () => {
  const fixture = fakeACP();
  const rpc = new AntigravityACP("fixture", os.tmpdir(), fixture.launch);
  try {
    await Promise.all([rpc.init(), rpc.init()]);
    for (let i = 0; i < 2; i++) {
      const s = await rpc.newSession();
      assert.equal(sessionModels(s)[0].id, "gemini-example");
      await rpc.configure(s, "gemini-example-medium", "medium");
      assert.equal(
        await rpc.prompt(
          s,
          "test",
          { outputSchema: { type: "object" }, timeout: 1000 },
          () => {},
          () => {},
        ),
        '{"answer":"done"}',
      );
    }
    assert.equal(fixture.processes, 1);
    assert.equal(new Set(fixture.sessions).size, 2);
    assert.equal(
      fixture.calls.filter((c) => c.method === "initialize").length,
      1,
    );
    assert.ok(
      fixture.calls.some(
        (c) =>
          c.id === "permission" && c.result.outcome.outcome === "cancelled",
      ),
    );
    assert.ok(
      fixture.calls.some(
        (c) =>
          c.method === "session/set_config_option" &&
          c.params.configId === "thought_level",
      ),
    );
  } finally {
    rpc.close();
  }
});
test("ACP cancellation clears the pending prompt promptly without shutting down the shared server", async () => {
  const fixture = fakeACP();
  const rpc = new AntigravityACP("fixture", os.tmpdir(), fixture.launch);
  try {
    await rpc.init();
    const s = await rpc.newSession();
    let cancel;
    const answer = rpc.prompt(
      s,
      "WAIT",
      { timeout: 30000 },
      () => {},
      (c) => (cancel = c),
    );
    cancel();
    await assert.rejects(answer, (e) => e.code === "AI_CANCELLED");
    assert.equal(rpc.pending.size, 0);
    assert.equal(rpc.closed, false);
    assert.ok(fixture.calls.some((c) => c.method === "session/cancel"));
    assert.ok((await rpc.newSession()).sessionId);
  } finally {
    rpc.close();
  }
});
test("ACP skips redundant configuration when defaults match, deduplicates toolCallId limits, permits queries/portal tools, and marks timeout unhealthy", async () => {
  const fixture = fakeACP();
  const rpc = new AntigravityACP("fixture", os.tmpdir(), fixture.launch);
  try {
    await rpc.init();
    const session = {
      sessionId: "s-preconfigured",
      configOptions: [
        {
          id: "model",
          category: "model",
          currentValue: "gemini-example",
          options: [{ value: "gemini-example", name: "Example" }],
        },
        {
          id: "thought_level",
          category: "thought_level",
          currentValue: "medium",
          options: [{ value: "medium", name: "Medium" }],
        },
      ],
    };
    await rpc.configure(session, "gemini-example", "medium");
    assert.equal(
      fixture.calls.filter((c) => c.method === "session/set_config_option")
        .length,
      0,
    );

    const bridge = { mcpServers: [] };
    rpc.sessionPolicies.set("s-preconfigured", {
      tools: bridge,
      webSearch: true,
    });
    const portalAllowed = await rpc.authorize({
      sessionId: "s-preconfigured",
      toolCall: {
        title: "Run mcp_academicapply_portal_read_public_page",
        rawInput: { url: "http://example.com/non-https" },
      },
      options: [{ kind: "allow_always", optionId: "always" }],
    });
    assert.equal(portalAllowed, "always");

    const queriesAllowed = await rpc.authorize({
      sessionId: "s-preconfigured",
      toolCall: {
        kind: "search",
        title: "Search Web",
        rawInput: { queries: ["academic positions"] },
      },
      options: [{ kind: "allow_once", optionId: "once" }],
    });
    assert.equal(queriesAllowed, "once");

    await assert.rejects(
      rpc.prompt(session, "WAIT", { timeout: 20 }, () => {}, () => {}),
      /timed out/,
    );
    assert.equal(rpc.unhealthy, true);
  } finally {
    rpc.close();
  }
});
test("ACP prompt deduplicates repeated toolCallId updates against webActionLimit", async () => {
  const launch = () => {
    const c = new EventEmitter();
    c.stdin = new PassThrough();
    c.stdout = new PassThrough();
    c.stderr = new PassThrough();
    c.kill = () => c.emit("exit", 0);
    c.stdin.on("data", (data) => {
      for (const line of data.toString().trim().split("\n")) {
        const m = JSON.parse(line);
        if (m.method === "initialize")
          setImmediate(() =>
            c.stdout.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: m.id,
                result: { protocolVersion: 1 },
              }) + "\n",
            ),
          );
        if (m.method === "session/new")
          setImmediate(() =>
            c.stdout.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: m.id,
                result: { sessionId: "s-dedup" },
              }) + "\n",
            ),
          );
        if (m.method === "session/prompt") {
          for (let i = 0; i < 20; i++)
            c.stdout.write(
              JSON.stringify({
                jsonrpc: "2.0",
                method: "session/update",
                params: {
                  sessionId: "s-dedup",
                  update: {
                    sessionUpdate: "tool_call",
                    toolCallId: "same-call-id",
                    title: "Search",
                  },
                },
              }) + "\n",
            );
          c.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "session/update",
              params: {
                sessionId: "s-dedup",
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: "OK" },
                },
              },
            }) + "\n",
          );
          setImmediate(() =>
            c.stdout.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: m.id,
                result: { stopReason: "end_turn" },
              }) + "\n",
            ),
          );
        }
      }
    });
    return c;
  };
  const rpc = new AntigravityACP("fixture", os.tmpdir(), launch);
  try {
    await rpc.init();
    const s = await rpc.newSession({ webSearch: true });
    const out = await rpc.prompt(
      s,
      "go",
      { webSearch: true, webActionLimit: 12, timeout: 1000 },
      () => {},
      () => {},
    );
    assert.equal(out, "OK");
  } finally {
    rpc.close();
  }
});
test("separate requested recommendation letters require distinct supplied files", () => {
  const pkg = {
    requirements: [
      {
        id: "r",
        label: "Recommendation letters",
        kind: "attachment",
        required: true,
        instructions: "Submit two recommendation letters.",
      },
    ],
    documents: [],
    attachments: [{ requirementId: "r", hash: "same" }],
  };
  assert.equal(packageCoverage(pkg)[0].fulfilled, false);
  pkg.attachments.push({ requirementId: "r", hash: "same" });
  assert.equal(packageCoverage(pkg)[0].fulfilled, false);
  pkg.attachments.push({ requirementId: "r", hash: "another" });
  assert.equal(packageCoverage(pkg)[0].fulfilled, true);
});
test("temporary Windows replacement locks do not prevent saving the database", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "academic-lock-"));
  const store = await Store.open(root);
  const rename = fs.renameSync;
  let attempts = 0;
  try {
    fs.renameSync = (from, to) => {
      if (to === store.file && attempts++ < 3)
        throw Object.assign(new Error("temporary scanner lock"), {
          code: "EPERM",
        });
      return rename(from, to);
    };
    store.put("events", {
      id: "saved",
      message: "Saved after the lock cleared",
    });
    assert.equal(attempts, 4);
    assert.equal(
      store.get("events", "saved").message,
      "Saved after the lock cleared",
    );
    assert.ok(fs.existsSync(store.file + ".bak"));
  } finally {
    fs.renameSync = rename;
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
