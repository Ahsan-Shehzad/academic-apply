import { useState, useEffect, useRef } from "react";
import { Alert, Button, MenuItem, TextField } from "@mui/material";
import type { Snapshot, Call, RecordData } from "./types";
export default function SearchCandidates({
  data,
  call,
  openJob,
  query = "",
  countries = null,
}: {
  data: Snapshot;
  call: Call;
  openJob: (job: RecordData) => void;
  query?: string;
  countries?: string[] | null;
}) {
  const [searchKey, setSearchKey] = useState(
      data.searchCoverage?.[0]?.id || "",
    ),
    [status, setStatus] = useState("review"),
    [depth, setDepth] = useState("thorough"),
    [limit, setLimit] = useState(25);
  const initialized = useRef(!!data.searchCoverage?.length);
  useEffect(() => {
    if (!initialized.current && data.searchCoverage?.length) {
      initialized.current = true;
      setSearchKey(data.searchCoverage[0].id);
    }
  }, [data.searchCoverage]);
  const candidates = (data.candidates || []).filter(
    (c) =>
      (!searchKey || c.searchKeys.includes(searchKey)) &&
      (status === "all" ||
        (status === "review"
          ? ["pending", "needs_review"].includes(c.status)
          : c.status === status)) &&
      (!countries ||
        c.country === "Unknown" ||
        countries.includes(c.country)) &&
      `${c.title} ${c.institution} ${c.snippet}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const coverage = data.searchCoverage?.find((c) => c.id === searchKey);
  const working = data.tasks.some(
    (t) =>
      ["running", "queued"].includes(t.status) &&
      [
        "search",
        "search-once",
        "ai-search",
        "ai-search-once",
        "candidate-details",
        "candidate-browser",
      ].includes(t.kind),
  );
  return (
    <section
      className="panel padded candidate-review"
      aria-label="Candidate detail review"
    >
      <h2>Complete vacancy details</h2>
      <p>
        These search-result links are provisional. Full descriptions,
        eligibility, document requirements, deadlines and application links
        appear under Full listings after their details are retrieved. Missing
        advertised facts remain marked for review.
      </p>
      <div className="candidate-filters">
        <TextField
          select
          label="Search coverage"
          value={searchKey}
          onChange={(e) => {
            setSearchKey(e.target.value);
            setLimit(25);
          }}
        >
          <MenuItem value="">All searches</MenuItem>
          {data.searchCoverage?.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name} · {c.countries.length} countries
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Candidate status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setLimit(25);
          }}
        >
          {[
            ["review", "Needs detail review"],
            ["imported", "Full listing retrieved"],
            ["excluded", "Excluded by filters"],
            ["ignored", "Ignored manually"],
            ["all", "All candidates"],
          ].map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Detail pass depth"
          value={depth}
          onChange={(e) => setDepth(e.target.value)}
        >
          {["quick", "balanced", "thorough"].map((v) => (
            <MenuItem key={v} value={v}>
              {v[0].toUpperCase() + v.slice(1)}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          disabled={
            !searchKey ||
            working ||
            !data.settings.cloudConsent ||
            !candidates.some((c) =>
              ["pending", "needs_review"].includes(c.status),
            )
          }
          onClick={() => call("candidate.complete", { searchKey, depth })}
        >
          Complete pending details
        </Button>
      </div>
      {coverage && (
        <Alert severity="info">
          Coverage cycle {coverage.cycle}: {coverage.covered} of{" "}
          {coverage.totalQueries} query combinations reported searched.
          Remaining combinations resume on subsequent runs; coverage counts do
          not guarantee every available vacancy.
        </Alert>
      )}
      {!data.settings.cloudConsent && (
        <Alert severity="warning">
          Enable AI processing for official-employer research. You can still
          open a candidate in Chrome and import its visible details.
        </Alert>
      )}
      <p>{candidates.length} candidates in this view</p>
      {candidates.slice(0, limit).map((c) => (
        <article key={c.id} className="candidate-card">
          <div className="flex-between">
            <h3>{c.title}</h3>
            <span className="tag neutral">
              {c.status === "imported"
                ? "Full listing retrieved"
                : c.status.replaceAll("_", " ")}
            </span>
          </div>
          <p>
            <b>{c.institution}</b> · {c.country}{" "}
            <small>(search-result metadata)</small>
          </p>
          <p>{c.snippet}</p>
          {c.reason && <p className="candidate-reason">{c.reason}</p>}
          <div className="tag-row">
            {c.status === "imported" && c.jobId ? (
              <Button
                variant="contained"
                onClick={() => {
                  const job = [...data.jobs, ...(data.jobHistory || [])].find(
                    (j) => j.id === c.jobId,
                  );
                  if (job) openJob(job);
                }}
              >
                Open full listing
              </Button>
            ) : (
              <Button
                variant="contained"
                disabled={
                  working ||
                  !data.settings.cloudConsent ||
                  c.status === "ignored"
                }
                onClick={() => call("candidate.verify", { id: c.id })}
              >
                Get full listing
              </Button>
            )}
            <Button
              variant="outlined"
              onClick={() => call("candidate.browserOpen", { id: c.id })}
            >
              Open in Chrome
            </Button>
            {c.browserConnected && (
              <Button
                disabled={working}
                onClick={() => call("candidate.browserImport", { id: c.id })}
              >
                Import visible page
              </Button>
            )}
            {c.status !== "imported" && (
              <Button
                onClick={() =>
                  call("candidate.ignore", {
                    id: c.id,
                    restore: c.status === "ignored",
                  })
                }
              >
                {c.status === "ignored" ? "Restore candidate" : "Ignore"}
              </Button>
            )}
          </div>
          <details>
            <summary>Search provenance and source links</summary>
            <Button
              size="small"
              onClick={() => call("url.open", { url: c.url })}
            >
              Original vacancy link
            </Button>
            {c.provenance?.map((p: RecordData, i: number) => (
              <div key={i}>
                <p>
                  <b>Query:</b> {p.query}
                </p>
                <p>{p.snippet}</p>
                <Button
                  size="small"
                  onClick={() => call("url.open", { url: p.evidenceUrl })}
                >
                  Evidence link
                </Button>
              </div>
            ))}
          </details>
        </article>
      ))}
      {candidates.length > limit && (
        <Button onClick={() => setLimit((v) => v + 25)}>
          Show more candidates
        </Button>
      )}
      {!candidates.length && (
        <p>
          No candidates match this view. Run a web search or select another
          coverage cycle/status.
        </p>
      )}
    </section>
  );
}
