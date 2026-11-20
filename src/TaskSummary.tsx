import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "@mui/material";
import { CloseRounded, TaskAltRounded } from "@mui/icons-material";
import type { Call, RecordData, Snapshot } from "./types";

export function TaskSummary({
  task,
  call,
  compact = false,
}: {
  task: RecordData;
  call?: Call;
  compact?: boolean;
}) {
  const summary = task.summary;
  if (!summary) return null;
  return (
    <section className="task-summary" aria-label="Task completion summary">
      <h3>{summary.title}</h3>
      <p>{summary.message}</p>
      {!!summary.metrics?.length && (
        <dl className="summary-metrics">
          {summary.metrics
            .slice(0, compact ? 4 : summary.metrics.length)
            .map((m: RecordData) => (
              <div key={m.label}>
                <dt>{m.label}</dt>
                <dd>{m.value.toLocaleString()}</dd>
              </div>
            ))}
        </dl>
      )}
      {!compact && <p className="muted">{summary.nextStep}</p>}
      {!compact && !!summary.queryReport?.length && (
        <details className="source-report">
          <summary>
            Query coverage and outcomes ({summary.queryReport.length})
          </summary>
          <p>
            Reported query outcomes and observed native search actions are
            separate. A search result is provisional until its vacancy details
            are read.
          </p>
          <div className="query-report">
            {summary.queryReport.map((q: RecordData, i: number) => (
              <article key={q.id + "-" + i}>
                <b>
                  {q.country} · {q.role} ·{" "}
                  {String(q.status).replaceAll("_", " ")}
                </b>
                <p>{q.query}</p>
                {q.note && <small>{q.note}</small>}
              </article>
            ))}
          </div>
        </details>
      )}
      {!compact && !!summary.sourceReport?.length && (
        <details className="source-report">
          <summary>
            Source access and recovery ({summary.sourceReport.length})
          </summary>
          <p>
            Public access and provider recovery are reported separately.
            Research hints do not confirm that a blocked portal was read.
          </p>
          <div className="source-report-scroll">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Public access</th>
                  <th>Result and next step</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {summary.sourceReport.map((s: RecordData, i: number) => (
                  <tr key={s.id + "-" + i}>
                    <td>{s.name}</td>
                    <td>
                      {String(s.status).replaceAll("_", " ")}
                      {s.statusCode ? ` (HTTP ${s.statusCode})` : ""}
                      {s.recovery && <small>Provider recovery attempted</small>}
                    </td>
                    <td>
                      {s.message}
                      {s.action && <p>{s.action}</p>}
                    </td>
                    <td>
                      {call && s.url && (
                        <Button
                          size="small"
                          onClick={() => call("url.open", { url: s.url })}
                        >
                          Open source
                        </Button>
                      )}
                      {call && s.guideUrl && (
                        <Button
                          size="small"
                          onClick={() => call("connector.test", { id: s.id })}
                        >
                          Test source
                        </Button>
                      )}
                      {call && s.guideUrl && (
                        <Button
                          size="small"
                          onClick={() => call("url.open", { url: s.guideUrl })}
                        >
                          Setup guide
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
export function CompletionNotices({
  data,
  open,
}: {
  data: Snapshot;
  open: (task: RecordData) => void;
}) {
  const seen = useRef<Map<string, string> | null>(null),
    mounted = useRef(Date.now());
  const [queue, setQueue] = useState<RecordData[]>([]);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Map(data.tasks.map((t) => [t.id, t.status]));
      return;
    }
    const finished = data.tasks.filter(
      (t) =>
        !["running", "queued"].includes(t.status) &&
        seen.current!.get(t.id) !== t.status &&
        (seen.current!.has(t.id) || Date.parse(t.createdAt) >= mounted.current),
    );
    for (const t of data.tasks) seen.current.set(t.id, t.status);
    if (finished.length)
      setQueue((q) => [...q, ...finished.reverse()].slice(-10));
  }, [data.tasks]);
  const task = queue[0];
  if (!task) return null;
  const dismiss = () => setQueue((q) => q.slice(1));
  return (
    <section
      className={"completion-notice panel " + task.status}
      role="status"
      aria-label="Task finished"
    >
      <div className="flex-between">
        <b>
          <TaskAltRounded fontSize="small" /> {task.label} · {task.status}
          {queue.length > 1 ? ` (${queue.length} summaries)` : ""}
        </b>
        <IconButton aria-label="Dismiss task summary" onClick={dismiss}>
          <CloseRounded fontSize="small" />
        </IconButton>
      </div>
      <TaskSummary task={task} compact />
      <Button onClick={() => open(task)}>View full summary</Button>
    </section>
  );
}
