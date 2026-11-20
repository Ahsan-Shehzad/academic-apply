"use strict";
const { id, now, nextRun } = require("./core.cjs");
const { taskSummary } = require("./task-summary.cjs");
class Tasks {
  constructor(store, emit = () => {}) {
    this.store = store;
    this.emit = emit;
    this.controllers = new Map();
    this.chain = Promise.resolve();
    this.interactiveChain = Promise.resolve();
    this.completions = new Map();
  }
  start(kind, label, run, payload = {}) {
    const record = {
      id: id(),
      kind,
      label,
      payload,
      status: "queued",
      progress: 0,
      message: "Waiting to start",
      createdAt: now(),
      logs: [
        { at: now(), level: "info", message: "Queued — waiting to start" },
      ],
    };
    this.store.put("tasks", record);
    this.emit("task", record);
    const controller = new AbortController();
    this.controllers.set(record.id, controller);
    const update = (patch) => {
      const current = this.store.get("tasks", record.id);
      const logs = [...(current.logs || [])];
      if (
        patch.message &&
        (patch.message !== current.message || patch.status !== current.status)
      )
        logs.push({
          at: now(),
          level: patch.level || (patch.status === "failed" ? "error" : "info"),
          message: patch.message,
          ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
        });
      const changed = {
        ...current,
        ...patch,
        logs: logs.slice(-400),
        updatedAt: now(),
      };
      if (
        ["completed", "failed", "cancelled", "interrupted"].includes(
          changed.status,
        )
      )
        changed.summary = taskSummary(changed, this.store);
      this.store.put("tasks", changed);
      this.emit("task", this.store.get("tasks", record.id));
    };
    update.id = record.id;
    const lane =
      kind === "browser" ||
      kind === "browser-import" ||
      kind === "candidate-browser"
        ? "interactiveChain"
        : "chain";
    const completion = (this[lane] = this[lane]
      .catch(() => {})
      .then(async () => {
        if (controller.signal.aborted) {
          update({
            status: "cancelled",
            message: "Cancelled before starting",
            finishedAt: now(),
          });
          this.controllers.delete(record.id);
          return;
        }
        update({ status: "running", message: "Starting", startedAt: now() });
        try {
          const result = await run(update, controller.signal);
          if (controller.signal.aborted)
            update({
              status: "cancelled",
              message: "Cancelled",
              result,
              finishedAt: now(),
            });
          else
            update({
              status: "completed",
              progress: 100,
              message: result?.message || "Completed",
              result,
              finishedAt: now(),
            });
        } catch (e) {
          update({
            status: controller.signal.aborted ? "cancelled" : "failed",
            message: e.message,
            finishedAt: now(),
          });
        } finally {
          this.controllers.delete(record.id);
        }
      }));
    this.completions.set(record.id, completion);
    completion.finally(() => this.completions.delete(record.id));
    return record;
  }
  cancel(taskId) {
    this.controllers.get(taskId)?.abort();
    this.log(
      taskId,
      "Cancellation requested. Waiting for the current operation to stop.",
      "warning",
    );
  }
  log(taskId, message, level = "info") {
    const task = this.store.get("tasks", taskId);
    if (!task || !["running", "queued"].includes(task.status)) return;
    const updated = {
      ...task,
      message,
      updatedAt: now(),
      logs: [...(task.logs || []), { at: now(), level, message }].slice(-400),
    };
    this.store.put("tasks", updated);
    this.emit("task", updated);
  }
  aiProgress({ taskId, characters, phase }) {
    const task = this.store.get("tasks", taskId);
    if (
      !task ||
      (!characters && !phase) ||
      Date.now() - (task.lastAiLog || 0) < 2500
    )
      return;
    this.store.put("tasks", { ...task, lastAiLog: Date.now() });
    this.log(
      taskId,
      phase ||
        `AI response in progress · ${characters.toLocaleString()} characters received`,
    );
  }
  async track(kind, label, run, payload = {}) {
    const task = this.start(kind, label, run, payload);
    const completion = this.completions.get(task.id);
    await completion;
    const finished = this.store.get("tasks", task.id);
    if (finished.status !== "completed") throw new Error(finished.message);
    return finished.result;
  }
  async idle() {
    await Promise.all([this.chain, this.interactiveChain]);
  }
}
function dueSearches(store, at = new Date()) {
  return store
    .list("searches")
    .filter(
      (s) => s.enabled && s.nextRun && Date.parse(s.nextRun) <= at.getTime(),
    );
}
function scheduleAfterRun(store, searchId) {
  const search = store.get("searches", searchId);
  if (!search) return null;
  const updated = { ...search, lastRun: now(), nextRun: nextRun(search) };
  store.put("searches", updated);
  return updated;
}
module.exports = { Tasks, dueSearches, scheduleAfterRun };
