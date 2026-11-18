"use strict";
const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");
const {
  id,
  now,
  defaultSearch,
  defaultSettings,
  nextRun,
} = require("./core.cjs");
class Store {
  static async open(root) {
    root = path.resolve(root);
    fs.mkdirSync(root, { recursive: true });
    const SQL = await initSqlJs({
      wasmBinary: fs.readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm")),
    });
    const file = path.join(root, "academicapply.sqlite");
    let db;
    try {
      db = new SQL.Database(
        fs.existsSync(file) ? fs.readFileSync(file) : undefined,
      );
    } catch (error) {
      throw new Error(
        "Database could not be opened. Preserve the file and restore its .bak backup: " +
          error.message,
      );
    }
    const store = new Store(db, root, file);
    store.init();
    return store;
  }
  constructor(db, root, file) {
    Object.assign(this, { db, root, file });
  }
  init() {
    this.db.run(
      "CREATE TABLE IF NOT EXISTS records (bucket TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(bucket,id)); CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL)",
    );
    const firstRun = !this.get("settings", "main");
    if (firstRun) this.put("settings", { id: "main", ...defaultSettings() });
    if (firstRun && !this.list("searches").length) {
      const initial = defaultSearch();
      this.put("searches", { ...initial, nextRun: nextRun(initial) });
    }
    this.db.run("INSERT OR IGNORE INTO metadata VALUES ('schemaVersion','1')");
    for (const task of this.list("tasks").filter((t) =>
      ["running", "queued"].includes(t.status),
    ))
      this.put("tasks", {
        ...task,
        status: "interrupted",
        message: "Interrupted by application restart. Retry to continue.",
        finishedAt: now(),
        logs: [
          ...(task.logs || []),
          {
            at: now(),
            level: "warning",
            message: "Interrupted by application restart. Retry to continue.",
          },
        ].slice(-400),
      });
    this.flush();
  }
  get(bucket, key) {
    const stmt = this.db.prepare(
      "SELECT data FROM records WHERE bucket=? AND id=?",
    );
    try {
      stmt.bind([bucket, key]);
      return stmt.step() ? JSON.parse(stmt.getAsObject().data) : null;
    } finally {
      stmt.free();
    }
  }
  list(bucket) {
    const stmt = this.db.prepare(
      "SELECT data FROM records WHERE bucket=? ORDER BY updated DESC",
    );
    try {
      stmt.bind([bucket]);
      const values = [];
      while (stmt.step()) values.push(JSON.parse(stmt.getAsObject().data));
      return values;
    } finally {
      stmt.free();
    }
  }
  put(bucket, data) {
    if (!data.id) throw new Error("Missing record ID");
    this.db.run(
      "INSERT INTO records(bucket,id,data,updated) VALUES(?,?,?,?) ON CONFLICT(bucket,id) DO UPDATE SET data=excluded.data,updated=excluded.updated",
      [bucket, data.id, JSON.stringify(data), now()],
    );
    this.flush();
    return data;
  }
  remove(bucket, key) {
    this.db.run("DELETE FROM records WHERE bucket=? AND id=?", [bucket, key]);
    this.flush();
  }
  getJob(key) {
    return this.get("jobs", key) || this.get("jobHistory", key);
  }
  putJob(job) {
    return this.put(
      this.get("jobs", job.id)
        ? "jobs"
        : this.get("jobHistory", job.id)
          ? "jobHistory"
          : "jobs",
      job,
    );
  }
  transaction(work) {
    if (this.inTransaction) return work();
    this.db.run("BEGIN");
    this.inTransaction = true;
    let result;
    try {
      result = work();
      this.db.run("COMMIT");
    } catch (error) {
      try {
        this.db.run("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      this.inTransaction = false;
    }
    this.flush();
    return result;
  }
  flush() {
    if (this.inTransaction) return;
    const temp = this.file + ".tmp";
    fs.writeFileSync(temp, Buffer.from(this.db.export()));
    if (fs.existsSync(this.file))
      fs.copyFileSync(this.file, this.file + ".bak");
    // Windows scanners can briefly hold the destination during replacement.
    // Keep the existing database intact and retry the atomic rename only.
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(temp, this.file);
        break;
      } catch (error) {
        if (attempt >= 9 || !["EPERM", "EACCES", "EBUSY"].includes(error.code))
          throw error;
        Atomics.wait(
          new Int32Array(new SharedArrayBuffer(4)),
          0,
          0,
          20 * (attempt + 1),
        );
      }
    }
  }
  settings() {
    return this.get("settings", "main");
  }
  audit(action, detail = {}) {
    return this.put("events", { id: id(), action, detail, at: now() });
  }
  close() {
    this.flush();
    this.db.close();
  }
}
module.exports = { Store };
