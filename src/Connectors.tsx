import { useState } from "react";
import {
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
} from "@mui/material";
import type { Snapshot, RecordData, Call } from "./types";
export default function Connectors({
  data,
  call,
  busy,
}: {
  data: Snapshot;
  call: Call;
  busy: string;
}) {
  const [boardSource, setBoardSource] = useState<RecordData | null>(null),
    [boards, setBoards] = useState("");
  const [query, setQuery] = useState(""),
    [region, setRegion] = useState("all"),
    [category, setCategory] = useState("all"),
    [health, setHealth] = useState("all"),
    [configure, setConfigure] = useState(false),
    [editing, setEditing] = useState<string | undefined>(),
    [sourceSearch, setSourceSearch] = useState<RecordData | null>(null),
    [searchId, setSearchId] = useState(data.searches[0]?.id || ""),
    [name, setName] = useState(""),
    [endpoint, setEndpoint] = useState(""),
    [protocol, setProtocol] = useState("2026-07-28"),
    [token, setToken] = useState(""),
    [run, setRun] = useState<RecordData | null>(null),
    [tool, setTool] = useState(""),
    [args, setArgs] = useState('{\n  "query": "speech AI lecturer"\n}'),
    [error, setError] = useState("");
  const connectors = (data.connectors || []).filter(
    (c) =>
      (category === "all" ||
        c.category === category ||
        (category === "MCP" && c.type === "mcp")) &&
      (health === "all" ||
        (c.status || c.releaseCheck?.status || "not_tested") === health) &&
      (region === "all" ||
        c.region === region ||
        c.region === "All" ||
        c.type === "mcp") &&
      `${c.name} ${c.countries?.join(" ") || ""} ${c.type}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const missing = connectors
    .filter((c) => c.type === "bundled" && !c.installed)
    .map((c) => c.id);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Connectors</h1>
          <p>
            Install and manage job-source adapters, test access, and connect MCP
            research services.
          </p>
        </div>
        <div className="tag-row">
          <Button
            variant="outlined"
            disabled={!!busy}
            onClick={() => call("connector.openPortals", {})}
          >
            Sign in to portals (Chrome)
          </Button>
          <Button
            variant="outlined"
            disabled={!!busy}
            onClick={() => call("connector.testAll")}
          >
            Test all connectors
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setEditing(undefined);
              setName("");
              setEndpoint("");
              setToken("");
              setConfigure(true);
            }}
          >
            Add MCP connection
          </Button>
          <Button
            variant="contained"
            disabled={!!busy || !missing.length}
            onClick={() => call("connector.install", { ids: missing })}
          >
            Install visible connectors ({missing.length})
          </Button>
        </div>
      </div>
      <Alert severity="info">
        Source adapters are installed automatically. Access depends on each
        provider. Browser-only pages open in Apply; import official vacancy URLs
        in Discover. Remote MCP servers are configured separately and are not
        official integrations unless their provider says so.
      </Alert>
      <div className="activity-filters">
        <TextField
          size="small"
          label="Find connector"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <TextField
          size="small"
          select
          label="Region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          {["all", "Europe", "Australia", "Gulf"].map((value) => (
            <MenuItem value={value} key={value}>
              {value === "all" ? "All regions" : value}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {[
            "all",
            "Academic",
            "Institution",
            "National & general",
            "Employer platforms",
            "MCP",
          ].map((value) => (
            <MenuItem key={value} value={value}>
              {value === "all" ? "All categories" : value}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          select
          label="Access result"
          value={health}
          onChange={(e) => setHealth(e.target.value)}
        >
          {[
            "all",
            "available",
            "needs_browser",
            "unavailable",
            "restricted",
            "temporary_error",
            "partial",
            "not_found",
            "empty",
            "configuration_required",
            "manual",
            "not_tested",
          ].map((value) => (
            <MenuItem key={value} value={value}>
              {value === "all" ? "All results" : value.replaceAll("_", " ")}
            </MenuItem>
          ))}
        </TextField>
        <small>
          {connectors.length} of {data.connectors.length} source connections
        </small>
      </div>
      <div className="connector-grid">
        {connectors.map((c) => (
          <section key={c.id} className="panel padded connector-card">
            <div className="flex-between">
              <h2>{c.name}</h2>
              <span
                className={
                  "tag " + (c.installed && c.enabled ? "teal" : "neutral")
                }
              >
                {c.installed
                  ? c.enabled
                    ? "Enabled"
                    : "Disabled"
                  : "Not installed"}
              </span>
            </div>
            <p>
              {c.type === "mcp"
                ? (c.local ? "Built-in Chrome MCP · " : "Remote MCP · ") +
                  c.protocol
                : "Bundled adapter · " +
                  c.region +
                  (c.countries ? " · " + c.countries.join(", ") : "")}
            </p>
            {c.access && (
              <div className="tag-row">
                <span className="tag neutral">{c.category}</span>
                <span className="tag neutral">
                  {c.access.replaceAll("-", " ")}
                </span>
              </div>
            )}
            <small className="portal-url">{c.endpoint || c.base}</small>
            <p className="provider-message">
              {c.message ||
                c.sourceHealth?.message ||
                (c.installed
                  ? "Installed. Test access to check this source."
                  : "Install to make this source available for discovery.")}
            </p>
            {c.action && <p>{c.action}</p>}
            {c.nextRetryAt && Date.parse(c.nextRetryAt) > Date.now() && (
              <small>
                Automatic public retry after{" "}
                {new Date(c.nextRetryAt).toLocaleTimeString()}. Test connector
                retries immediately.
              </small>
            )}
            {(c.status || c.sourceHealth?.status) && (
              <p>
                <b>
                  {(c.status || c.sourceHealth.status).replaceAll("_", " ")}
                </b>
                {c.checkedAt && (
                  <small>
                    {" "}
                    · checked {new Date(c.checkedAt).toLocaleString()}
                  </small>
                )}
              </p>
            )}
            {c.releaseCheck && !c.checkedAt && (
              <p>
                <b>
                  Release check: {c.releaseCheck.status.replaceAll("_", " ")}
                </b>
                <br />
                <small>
                  {new Date(c.releaseCheck.checkedAt).toLocaleString()} -{" "}
                  {c.releaseCheck.message}
                </small>
              </p>
            )}
            {c.setupSteps && (
              <details>
                <summary>Setup and access guide</summary>
                <p>{c.setupSteps}</p>
                <Button onClick={() => call("url.open", { url: c.guideUrl })}>
                  Official site / guide
                </Button>
              </details>
            )}
            {c.boards?.length > 0 && (
              <p>Employer boards: {c.boards.join(", ")}</p>
            )}
            {c.installed && (
              <FormControlLabel
                label="Use this connector"
                control={
                  <Switch
                    checked={!!c.enabled}
                    onChange={(_, enabled) =>
                      call("connector.enable", { id: c.id, enabled })
                    }
                  />
                }
              />
            )}
            <div className="tag-row">
              {c.access === "employer-api" && (
                <Button
                  onClick={() => {
                    setBoardSource(c);
                    setBoards((c.boards || []).join("\n"));
                  }}
                >
                  Configure employer boards
                </Button>
              )}
              {!c.installed && (
                <Button
                  variant="contained"
                  disabled={!!busy}
                  onClick={() => call("connector.install", { ids: [c.id] })}
                >
                  Install automatically
                </Button>
              )}
              {c.installed && (
                <Button
                  variant="outlined"
                  disabled={!!busy}
                  onClick={() => call("connector.test", { id: c.id })}
                >
                  Test connector
                </Button>
              )}
              {c.type === "bundled" && (
                <Button
                  disabled={!!busy || !c.enabled}
                  onClick={() => setSourceSearch(c)}
                >
                  Search source
                </Button>
              )}
              {c.type === "bundled" && (
                <Button
                  onClick={() =>
                    ["manual", "needs_browser", "restricted"].includes(
                      c.status || c.access || "",
                    )
                      ? call("connector.openPortals", { portals: [c.id] })
                      : call("browser.open", { url: c.base + "/" })
                  }
                >
                  {["manual", "needs_browser"].includes(c.status || c.access || "")
                    ? "Sign in / Open in Chrome"
                    : "Open in browser"}
                </Button>
              )}
              {c.type === "mcp" && c.local && (
                <Button
                  variant="outlined"
                  disabled={!!busy}
                  onClick={() => call("connector.openPortals", {})}
                >
                  Sign in to portals (Chrome)
                </Button>
              )}
              {c.type === "mcp" && !c.local && (
                <Button
                  onClick={() => {
                    setEditing(c.id);
                    setName(c.name);
                    setEndpoint(c.endpoint);
                    setProtocol(c.protocol);
                    setToken("");
                    setConfigure(true);
                  }}
                >
                  Configure
                </Button>
              )}
              {c.type === "mcp" && (
                <Button
                  variant="contained"
                  disabled={!!busy || !c.enabled || !c.tools?.length}
                  onClick={() => {
                    setRun(c);
                    setTool(c.tools[0]?.name || "");
                    setError("");
                  }}
                >
                  Search jobs
                </Button>
              )}
            </div>
          </section>
        ))}
      </div>
      <Dialog
        open={!!boardSource}
        onClose={() => setBoardSource(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{boardSource?.name}: employer boards</DialogTitle>
        <DialogContent>
          <p>
            Enter employer board identifiers, one per line. Use the identifier
            from the employer's public careers URL (for example
            jobs.lever.co/identifier). These APIs publish each configured
            employer's vacancies, not a global search index. Saving adds this
            feed to your saved searches; source selection can be changed in
            Scheduler.
          </p>
          <TextField
            fullWidth
            multiline
            minRows={5}
            label="Employer board identifiers"
            value={boards}
            onChange={(e) => setBoards(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBoardSource(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!!busy}
            onClick={async () => {
              const result = await call("connector.boards", {
                id: boardSource?.id,
                boards: boards.split(/[\s,]+/).filter(Boolean),
              });
              if (result) setBoardSource(null);
            }}
          >
            Save boards
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={configure}
        onClose={() => setConfigure(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {editing ? "Configure MCP connector" : "Add remote MCP connector"}
        </DialogTitle>
        <DialogContent>
          <p>
            Enter the HTTPS MCP endpoint supplied by your provider. Test
            discovers research tools; searching imports and verifies returned
            vacancy URLs. OAuth-only servers require a provider-issued token
            supported by this connection.
          </p>
          <div className="form-stack">
            <TextField
              label="Connector name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="MCP endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://provider.example/mcp"
            />
            <TextField
              select
              label="Protocol"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
            >
              <MenuItem value="2026-07-28">
                2026-07-28 · per-request metadata
              </MenuItem>
              <MenuItem value="2025-11-25">
                2025-11-25 · initialize/session
              </MenuItem>
            </TextField>
            <TextField
              label="Bearer token (optional)"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              helperText="Encrypted with Windows secure storage. Never included in task logs or AI prompts."
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigure(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={
              !!busy || name.length < 2 || !endpoint.startsWith("https://")
            }
            onClick={async () => {
              const result = await call("connector.configure", {
                config: { id: editing, name, endpoint, protocol },
                token: token || undefined,
              });
              if (result) {
                setConfigure(false);
                setToken("");
                setEndpoint("");
                setName("");
              }
            }}
          >
            {editing ? "Save connection" : "Add connection"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!sourceSearch}
        onClose={() => setSourceSearch(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Search {sourceSearch?.name}</DialogTitle>
        <DialogContent>
          <p>
            Choose the saved countries, roles and keywords to use for this
            source. Edit search profiles in Scheduler.
          </p>
          <TextField
            fullWidth
            select
            label="Search profile"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
          >
            {data.searches.map((s) => (
              <MenuItem value={s.id} key={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSourceSearch(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!!busy || !searchId}
            onClick={async () => {
              const result = await call("connector.search", {
                id: sourceSearch!.id,
                searchId,
              });
              if (result) setSourceSearch(null);
            }}
          >
            Search this source
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!run} onClose={() => setRun(null)} fullWidth maxWidth="md">
        <DialogTitle>Search with {run?.name}</DialogTitle>
        <DialogContent>
          <p>
            Use this provider's research tool schema below. Only these search
            arguments are sent. Your candidate profile and documents are
            excluded.
          </p>
          <div className="form-stack">
            <TextField
              select
              label="Research tool"
              value={tool}
              onChange={(e) => setTool(e.target.value)}
            >
              {run?.tools?.map((t: RecordData) => (
                <MenuItem key={t.name} value={t.name}>
                  {t.name}
                </MenuItem>
              ))}
            </TextField>
            <details>
              <summary>Tool description and argument schema</summary>
              <p>
                {
                  run?.tools?.find((t: RecordData) => t.name === tool)
                    ?.description
                }
              </p>
              <pre className="connector-schema">
                {JSON.stringify(
                  run?.tools?.find((t: RecordData) => t.name === tool)
                    ?.inputSchema,
                  null,
                  2,
                )}
              </pre>
            </details>
            <TextField
              label="Search arguments (JSON)"
              multiline
              minRows={6}
              value={args}
              onChange={(e) => setArgs(e.target.value)}
            />
          </div>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRun(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!!busy || !tool}
            onClick={async () => {
              try {
                const arguments_ = JSON.parse(args);
                if (
                  !arguments_ ||
                  typeof arguments_ !== "object" ||
                  Array.isArray(arguments_)
                )
                  throw new Error("Enter a JSON object.");
                const result = await call("connector.run", {
                  id: run!.id,
                  tool,
                  arguments: arguments_,
                });
                if (result) setRun(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Search and import
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
