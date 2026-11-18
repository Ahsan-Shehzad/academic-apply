import { useState, useEffect } from "react";
import {
  Button,
  LinearProgress,
  TextField,
  MenuItem,
  Alert,
} from "@mui/material";
import type { Snapshot, RecordData, Call } from "./types";
import { TaskSummary } from "./TaskSummary";
const active = (task: RecordData) =>
  ["queued", "running"].includes(task.status);
const date = (value: string) => new Date(value).toLocaleString();
function elapsed(task: RecordData) {
  const seconds = Math.max(
    0,
    Math.floor(
      ((task.finishedAt ? Date.parse(task.finishedAt) : Date.now()) -
        Date.parse(task.startedAt || task.createdAt)) /
        1000,
    ),
  );
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
export function WorkflowProgress({
  data,
  kinds,
  open,
}: {
  data: Snapshot;
  kinds: string[];
  open: () => void;
}) {
  const tasks = data.tasks.filter((t) => kinds.includes(t.kind));
  const task =
    tasks.find((t) => t.status === "running") || tasks.find(active) || tasks[0];
  if (!task) return null;
  return (
    <section className="workflow-progress panel" aria-live="polite">
      <div>
        <b>
          {task.label} · {task.status.replaceAll("_", " ")}
        </b>
        <p>{task.message}</p>
        {active(task) && (
          <LinearProgress
            variant={task.progress ? "determinate" : "indeterminate"}
            value={task.progress || 0}
          />
        )}
      </div>
      <Button onClick={open}>View Activity</Button>
    </section>
  );
}
export default function Activity({
  data,
  call,
  openResult,
  initialTask,
  compact = false,
}: {
  data: Snapshot;
  call: Call;
  openResult: (task: RecordData) => void;
  initialTask?: string;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState(initialTask || ""),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    if (initialTask) setSelected(initialTask);
  }, [initialTask]);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const tasks = data.tasks.filter(
    (t) =>
      (filter === "all" ||
        (filter === "active" ? active(t) : t.status === filter)) &&
      `${t.label} ${t.message} ${t.kind}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const task = tasks.find((t) => t.id === selected) || tasks[0];
  const retryable =
    task &&
    ["failed", "cancelled", "interrupted"].includes(task.status) &&
    [
      "import",
      "browser-import",
      "documents",
      "pdf",
      "enrich",
      "search",
      "ai-search",
      "connector-test",
      "connector-discovery",
      "search-once",
      "ai-search-once",
      "connector-test-all",
      "document-add",
      "supporting-draft",
      "cv-format",
    ].includes(task.kind);
  return (
    <div className={compact ? "activity compact" : "activity"}>
      {!compact && (
        <div className="page-heading">
          <div>
            <h1>Activity</h1>
            <p>
              Live work logs, completed results and errors across your
              workspace.
            </p>
          </div>
          <span>
            {data.tasks.filter(active).length} active ·{" "}
            {data.tasks.filter((t) => t.status === "failed").length} failed
          </span>
        </div>
      )}
      <div className="activity-filters">
        <TextField
          size="small"
          label="Find task"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            "all",
            "active",
            "completed",
            "failed",
            "cancelled",
            "interrupted",
          ].map((value) => (
            <MenuItem value={value} key={value}>
              {value === "all" ? "All tasks" : value}
            </MenuItem>
          ))}
        </TextField>
      </div>
      {!tasks.length ? (
        <section className="panel padded">
          <h2>No tasks yet</h2>
          <p>
            Import a listing, run discovery or prepare a document package. Each
            task will appear here with its work log.
          </p>
        </section>
      ) : (
        <div className="activity-layout">
          <div className="activity-list panel">
            {tasks.map((t) => (
              <button
                className={
                  "activity-item " + (task?.id === t.id ? "selected" : "")
                }
                onClick={() => setSelected(t.id)}
                key={t.id}
              >
                <span className={"task-status " + t.status}>
                  {t.status.replaceAll("_", " ")}
                </span>
                <b>{t.label}</b>
                <small>{t.message}</small>
                <small>
                  {date(t.createdAt)} · {elapsed(t)}
                </small>
              </button>
            ))}
          </div>
          {task && (
            <section className="activity-detail panel padded">
              <div className="flex-between">
                <div>
                  <h2>{task.label}</h2>
                  <p>
                    {task.status.replaceAll("_", " ")} · {elapsed(task)}
                  </p>
                </div>
                {active(task) && (
                  <Button
                    color="warning"
                    onClick={() => call("task.cancel", { id: task.id })}
                  >
                    Cancel task
                  </Button>
                )}
              </div>
              {active(task) && (
                <>
                  <LinearProgress
                    variant={task.progress ? "determinate" : "indeterminate"}
                    value={task.progress || 0}
                  />
                  <p className="muted">
                    {task.progress ? `${Math.round(task.progress)}% · ` : ""}
                    {task.message}
                  </p>
                </>
              )}
              {["failed", "interrupted", "cancelled"].includes(task.status) && (
                <Alert
                  severity={task.status === "failed" ? "error" : "warning"}
                >
                  {task.message}
                </Alert>
              )}
              <div className="tag-row">
                {task.status === "failed" && task.payload?.url && (
                  <Button
                    onClick={() =>
                      call("browser.open", { url: task.payload.url })
                    }
                  >
                    Open source in browser
                  </Button>
                )}
                {retryable && (
                  <Button
                    variant="outlined"
                    onClick={() => call("task.retry", { id: task.id })}
                  >
                    Retry task
                  </Button>
                )}
                {(task.result?.jobId ||
                  task.result?.jobIds?.length ||
                  task.result?.packageId ||
                  task.packageId ||
                  task.payload?.packageId ||
                  task.payload?.applicationId ||
                  task.result?.connectorId ||
                  [
                    "search",
                    "ai-search",
                    "search-once",
                    "ai-search-once",
                    "connector-discovery",
                    "connector-search",
                    "connector-install",
                    "connector-test",
                  ].includes(task.kind)) && (
                  <Button variant="contained" onClick={() => openResult(task)}>
                    {task.result?.packageId ||
                    task.packageId ||
                    task.payload?.packageId
                      ? "Open package"
                      : task.result?.jobId
                        ? "Open imported listing"
                        : task.payload?.applicationId
                          ? "Open application"
                          : task.kind.startsWith("connector") &&
                              !task.result?.jobIds?.length
                            ? "Open connectors"
                            : "View listings"}
                  </Button>
                )}
              </div>
              {task.payload?.url && (
                <p className="portal-url">Source: {task.payload.url}</p>
              )}
              <TaskSummary task={task} call={call} />
              <h3>Work log</h3>
              <div
                className="work-log"
                role="log"
                aria-label="Task work log"
                aria-live="polite"
              >
                {(task.logs?.length
                  ? task.logs
                  : [
                      {
                        at: task.updatedAt || task.createdAt,
                        message: task.message,
                        level: task.status === "failed" ? "error" : "info",
                      },
                    ]
                ).map((line: RecordData, i: number) => (
                  <div className={"log-line " + (line.level || "info")} key={i}>
                    <time>{new Date(line.at).toLocaleTimeString()}</time>
                    <span>{line.message}</span>
                  </div>
                ))}
              </div>
              <small>
                Task {task.id} · logs are stored locally. Older tasks may only
                retain their final status.
              </small>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
