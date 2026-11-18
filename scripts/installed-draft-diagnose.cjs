const fs = require("node:fs");
const path = require("node:path");
const { Store } = require("../desktop/store.cjs");
const { Documents } = require("../desktop/documents.cjs");
const { Providers } = require("../desktop/providers.cjs");
(async () => {
  const SQL = await require("sql.js")();
  const db = new SQL.Database(
    fs.readFileSync(
      path.join(process.env.APPDATA, "AcademicApply", "academicapply.sqlite"),
    ),
  );
  const get = (bucket, id) => {
    const stmt = db.prepare("SELECT data FROM records WHERE bucket=? AND id=?");
    stmt.bind([bucket, id]);
    const record = stmt.step() ? JSON.parse(stmt.getAsObject().data) : null;
    stmt.free();
    return record;
  };
  const query = db.prepare(
    "SELECT data FROM records WHERE bucket='tasks' AND json_extract(data,'$.kind')='documents' ORDER BY updated DESC LIMIT 1",
  );
  query.step();
  const task = JSON.parse(query.getAsObject().data);
  query.free();
  const provider = process.argv[2] === "codex" ? "codex" : "antigravity";
  const root = path.resolve(
    ".test-data",
    "installed-draft-diagnosis-" + provider,
  );
  const store = await Store.open(root);
  const profile = get("profile", "main");
  const job = get(
    "jobs",
    task.payload?.jobId || get("packages", task.packageId)?.jobId,
  );
  if (!profile?.verified || !job)
    throw new Error(
      "An approved profile and the failed task's job are required.",
    );
  store.put("profile", profile);
  store.put("jobs", job);
  const bibliography = get("bibliography", "main");
  if (bibliography) store.put("bibliography", bibliography);
  store.put("settings", {
    ...store.settings(),
    ...get("settings", "main"),
    documentRoot: path.join(root, "packages"),
    cloudConsent: true,
  });
  if (process.argv[2] === "codex")
    store.put("settings", {
      ...store.settings(),
      effort: "medium",
      providerPaths: { ...store.settings().providerPaths, codex: "" },
      workflowProviders: {
        ...store.settings().workflowProviders,
        documents: "codex",
      },
      models: { ...store.settings().models, codex: "gpt-6.1-sol" },
    });
  db.close();
  let lastProgress = 0;
  const providers = new Providers(store, (type, data) => {
    if (type === "ai-progress" && Date.now() - lastProgress > 5000) {
      console.log(
        data.phase || `AI response progress: ${data.characters} characters`,
      );
      lastProgress = Date.now();
    }
  });
  try {
    const documents = new Documents(store, providers);
    let latest;
    const result = await documents.draft(
      job.id,
      ["Cover letter"],
      (patch) => {
        latest = patch;
        console.log(patch.message);
      },
      new AbortController().signal,
    );
    console.log(
      JSON.stringify({
        completed: true,
        documents: result.documents.length,
        words: result.documents[0].audit.words,
        packageId: result.id,
      }),
    );
    fs.writeFileSync(
      `qa/installed-draft-diagnosis-${provider}.json`,
      JSON.stringify(
        { provider, completed: true, words: result.documents[0].audit.words },
        null,
        2,
      ),
    );
  } finally {
    providers.close();
    store.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
