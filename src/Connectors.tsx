import { useMemo, useState } from "react";
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
  Chip,
  Checkbox,
} from "@mui/material";
import type { Snapshot, RecordData, Call } from "./types";

const ATTENTION_STATUSES = new Set([
  "needs_browser",
  "manual",
  "restricted",
  "unavailable",
  "temporary_error",
  "partial",
  "configuration_required",
  "error",
  "not_found",
]);

function connectorStatus(c: RecordData): string {
  return c.status || c.sourceHealth?.status || c.releaseCheck?.status || "not_tested";
}

function needsAttention(c: RecordData): boolean {
  const status = connectorStatus(c);
  if (ATTENTION_STATUSES.has(status)) return true;
  if (c.access === "employer-api" && (!c.boards || !c.boards.length)) return true;
  return false;
}

function needsBrowserAuth(c: RecordData): boolean {
  const status = connectorStatus(c);
  return (
    (c.type === "mcp" && !!c.local) ||
    ["manual", "needs_browser", "restricted"].includes(status) ||
    ["manual", "browser"].includes(c.access || "")
  );
}

type GroupMode = "logical" | "status" | "region" | "flat";
type QuickFilter =
  | "all"
  | "attention"
  | "ready"
  | "browser"
  | "enabled"
  | "disabled"
  | "setup"
  | "not_tested";

const LOGICAL_GROUP_ORDER = [
  {
    id: "mcp",
    title: "Chrome & AI MCP Connectors",
    subtitle: "Built-in persistent Chrome Portal MCP and remote MCP integrations",
  },
  {
    id: "Academic",
    title: "Academic & Research Portals",
    subtitle: "Dedicated academic, faculty, postdoc, and university research job boards",
  },
  {
    id: "National & general",
    title: "Major Job Portals & Regional Boards",
    subtitle: "Global portals (LinkedIn, Indeed, Glassdoor) and national employment boards",
  },
  {
    id: "Institution",
    title: "University & Institution Career Sites",
    subtitle: "Direct university and research-center recruitment portals",
  },
  {
    id: "Employer platforms",
    title: "Employer ATS & Feed Integrations",
    subtitle: "Configurable Greenhouse, Lever, and Ashby employer boards",
  },
];

const STATUS_GROUP_ORDER = [
  {
    id: "ready",
    title: "Ready & Available",
    subtitle: "Tested or active sources ready for automated discovery",
  },
  {
    id: "browser",
    title: "Sign-in or Chrome Verification Needed",
    subtitle: "Portals requiring browser login, JavaScript rendering, or anti-bot verification",
  },
  {
    id: "setup",
    title: "Configuration Required",
    subtitle: "Employer APIs or connectors awaiting board IDs or settings",
  },
  {
    id: "issues",
    title: "Unavailable / Partial / Errors",
    subtitle: "Temporarily blocked, timed out, or partially readable sources",
  },
  {
    id: "other",
    title: "Not Tested / Disabled",
    subtitle: "Unchecked or currently disabled adapters",
  },
];

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
    [quickFilter, setQuickFilter] = useState<QuickFilter>("all"),
    [groupBy, setGroupBy] = useState<GroupMode>("logical"),
    [collapsed, setCollapsed] = useState<Record<string, boolean>>({}),
    [selectedIds, setSelectedIds] = useState<string[]>([]),
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

  const allConnectors = data.connectors || [];
  const counts = useMemo(
    () => ({
      all: allConnectors.length,
      attention: allConnectors.filter(needsAttention).length,
      ready: allConnectors.filter((c) => connectorStatus(c) === "available").length,
      browser: allConnectors.filter(needsBrowserAuth).length,
      enabled: allConnectors.filter((c) => c.installed && c.enabled).length,
      disabled: allConnectors.filter((c) => c.installed && !c.enabled).length,
      setup: allConnectors.filter(
        (c) =>
          connectorStatus(c) === "configuration_required" ||
          (c.access === "employer-api" && (!c.boards || !c.boards.length)),
      ).length,
      not_tested: allConnectors.filter((c) => connectorStatus(c) === "not_tested")
        .length,
    }),
    [allConnectors],
  );

  const connectors = allConnectors.filter((c) => {
    const status = connectorStatus(c);
    if (
      quickFilter === "attention" &&
      !needsAttention(c)
    )
      return false;
    if (quickFilter === "ready" && status !== "available") return false;
    if (quickFilter === "browser" && !needsBrowserAuth(c)) return false;
    if (quickFilter === "enabled" && !(c.installed && c.enabled)) return false;
    if (quickFilter === "disabled" && !(c.installed && !c.enabled)) return false;
    if (
      quickFilter === "setup" &&
      status !== "configuration_required" &&
      !(c.access === "employer-api" && (!c.boards || !c.boards.length))
    )
      return false;
    if (quickFilter === "not_tested" && status !== "not_tested") return false;
    if (
      category !== "all" &&
      c.category !== category &&
      !(category === "MCP" && c.type === "mcp")
    )
      return false;
    if (health === "attention" && !needsAttention(c)) return false;
    if (health === "enabled" && !(c.installed && c.enabled)) return false;
    if (health === "disabled" && !(c.installed && !c.enabled)) return false;
    if (
      !["all", "attention", "enabled", "disabled"].includes(health) &&
      status !== health
    )
      return false;
    if (
      region !== "all" &&
      c.region !== region &&
      c.region !== "All" &&
      c.type !== "mcp"
    )
      return false;
    if (
      query &&
      !`${c.name} ${c.id} ${c.countries?.join(" ") || ""} ${c.category || ""} ${c.type} ${status}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  const groups = useMemo(() => {
    if (groupBy === "flat") {
      return [
        {
          id: "all",
          title: "All Matching Connectors",
          subtitle: "Sorted alphabetically",
          items: [...connectors].sort((a, b) => a.name.localeCompare(b.name)),
        },
      ].filter((g) => g.items.length > 0);
    }
    if (groupBy === "logical") {
      const buckets = new Map<string, RecordData[]>();
      for (const c of connectors) {
        const key = c.type === "mcp" ? "mcp" : c.category || "National & general";
        const arr = buckets.get(key) || [];
        arr.push(c);
        buckets.set(key, arr);
      }
      const ordered = LOGICAL_GROUP_ORDER.map((meta) => ({
        ...meta,
        items: (buckets.get(meta.id) || []).sort(
          (a, b) =>
            Number(b.enabled) - Number(a.enabled) ||
            a.name.localeCompare(b.name),
        ),
      })).filter((g) => g.items.length > 0);
      const known = new Set(LOGICAL_GROUP_ORDER.map((g) => g.id));
      for (const [k, items] of buckets.entries()) {
        if (!known.has(k) && items.length) {
          ordered.push({ id: k, title: k, subtitle: "", items });
        }
      }
      return ordered;
    }
    if (groupBy === "status") {
      const buckets = new Map<string, RecordData[]>();
      for (const c of connectors) {
        const s = connectorStatus(c);
        const key =
          !c.enabled || s === "not_tested"
            ? "other"
            : s === "available"
              ? "ready"
              : ["needs_browser", "manual", "restricted"].includes(s)
                ? "browser"
                : s === "configuration_required" ||
                    (c.access === "employer-api" && (!c.boards || !c.boards.length))
                  ? "setup"
                  : "issues";
        const arr = buckets.get(key) || [];
        arr.push(c);
        buckets.set(key, arr);
      }
      return STATUS_GROUP_ORDER.map((meta) => ({
        ...meta,
        items: (buckets.get(meta.id) || []).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      })).filter((g) => g.items.length > 0);
    }
    // region grouping
    const buckets = new Map<string, RecordData[]>();
    for (const c of connectors) {
      const key =
        c.type === "mcp"
          ? "Global & MCP Integrations"
          : c.region === "All"
            ? "Global Portals"
            : c.region || "Other";
      const arr = buckets.get(key) || [];
      arr.push(c);
      buckets.set(key, arr);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, items]) => ({
        id: title,
        title,
        subtitle: "",
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [connectors, groupBy]);

  const visibleIds = connectors.map((c) => c.id);
  const selectedSet = new Set(selectedIds);
  const activeSelectedIds = selectedIds.filter((id) =>
    allConnectors.some((c) => c.id === id && c.installed),
  );
  const hasFilters =
    quickFilter !== "all" ||
    query !== "" ||
    region !== "all" ||
    category !== "all" ||
    health !== "all";
  const missing = connectors
    .filter((c) => c.type === "bundled" && !c.installed)
    .map((c) => c.id);

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const renderCard = (c: RecordData) => {
    const status = connectorStatus(c);
    const attention = needsAttention(c);
    return (
      <section key={c.id} className="panel padded connector-card">
        <div className="flex-between">
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {c.installed && (
              <Checkbox
                size="small"
                checked={selectedSet.has(c.id)}
                onChange={() => toggleSelected(c.id)}
                inputProps={{ "aria-label": `Select ${c.name}` }}
              />
            )}
            <h2 style={{ margin: 0 }}>{c.name}</h2>
          </div>
          <div className="tag-row">
            {attention && <span className="tag warn">Attention needed</span>}
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
            <b>{(c.status || c.sourceHealth.status).replaceAll("_", " ")}</b>
            {c.checkedAt && (
              <small> · checked {new Date(c.checkedAt).toLocaleString()}</small>
            )}
          </p>
        )}
        {c.releaseCheck && !c.checkedAt && (
          <p>
            <b>Release check: {c.releaseCheck.status.replaceAll("_", " ")}</b>
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
        {c.boards?.length > 0 && <p>Employer boards: {c.boards.join(", ")}</p>}
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
                  c.status || c.access || status,
                )
                  ? call("connector.openPortals", { portals: [c.id] })
                  : call("browser.open", { url: c.base + "/" })
              }
            >
              {["manual", "needs_browser"].includes(
                c.status || c.access || status,
              )
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
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Connectors</h1>
          <p>
            Organize, filter, and manage job-source adapters, Chrome portal
            logins, and MCP research services.
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
        Source adapters are grouped by role and access status. Use{" "}
        <b>Attention needed</b> or <b>Sign-in / Chrome</b> filters to quickly
        locate blocked portals, sign in once via Chrome, or disable unresponsive
        sources in bulk.
      </Alert>

      <div className="connector-filter-chips">
        {(
          [
            ["all", `All (${counts.all})`],
            ["attention", `Attention needed (${counts.attention})`],
            ["ready", `Ready (${counts.ready})`],
            ["browser", `Sign-in / Chrome (${counts.browser})`],
            ["setup", `Needs setup (${counts.setup})`],
            ["enabled", `Enabled (${counts.enabled})`],
            ["disabled", `Disabled (${counts.disabled})`],
            ["not_tested", `Not tested (${counts.not_tested})`],
          ] as [QuickFilter, string][]
        ).map(([key, label]) => (
          <Chip
            key={key}
            label={label}
            color={
              quickFilter === key
                ? key === "attention"
                  ? "warning"
                  : "primary"
                : "default"
            }
            variant={quickFilter === key ? "filled" : "outlined"}
            onClick={() => setQuickFilter(key)}
          />
        ))}
        {hasFilters && (
          <Button
            size="small"
            onClick={() => {
              setQuickFilter("all");
              setQuery("");
              setRegion("all");
              setCategory("all");
              setHealth("all");
            }}
          >
            Reset filters
          </Button>
        )}
      </div>

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
          label="Group by"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupMode)}
        >
          <MenuItem value="logical">Logical category</MenuItem>
          <MenuItem value="status">Status &amp; attention</MenuItem>
          <MenuItem value="region">Region</MenuItem>
          <MenuItem value="flat">Single list</MenuItem>
        </TextField>
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
            "MCP",
            "Academic",
            "Institution",
            "National & general",
            "Employer platforms",
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
            ["all", "All results"],
            ["attention", "Attention needed"],
            ["available", "Ready / available"],
            ["needs_browser", "Needs browser"],
            ["manual", "Manual"],
            ["restricted", "Restricted"],
            ["unavailable", "Unavailable"],
            ["temporary_error", "Temporary error"],
            ["partial", "Partial"],
            ["configuration_required", "Configuration required"],
            ["empty", "Empty"],
            ["not_found", "Not found"],
            ["not_tested", "Not tested"],
            ["enabled", "Enabled"],
            ["disabled", "Disabled"],
          ].map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <small>
          {connectors.length} of {allConnectors.length} connectors
        </small>
      </div>

      <div className="connector-bulk-bar">
        <div className="tag-row">
          <Button
            size="small"
            disabled={!connectors.length}
            onClick={() =>
              setSelectedIds(
                connectors.filter((c) => c.installed).map((c) => c.id),
              )
            }
          >
            Select visible ({connectors.filter((c) => c.installed).length})
          </Button>
          <Button
            size="small"
            disabled={!activeSelectedIds.length}
            onClick={() => setSelectedIds([])}
          >
            Clear selection ({activeSelectedIds.length})
          </Button>
        </div>
        <div className="tag-row">
          <Button
            size="small"
            variant="outlined"
            disabled={!!busy || !(activeSelectedIds.length || visibleIds.length)}
            onClick={() =>
              call("connector.enableMany", {
                ids: activeSelectedIds.length ? activeSelectedIds : visibleIds,
                enabled: true,
              })
            }
          >
            {activeSelectedIds.length
              ? `Enable selected (${activeSelectedIds.length})`
              : `Enable visible (${connectors.filter((c) => c.installed).length})`}
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!!busy || !(activeSelectedIds.length || visibleIds.length)}
            onClick={() =>
              call("connector.enableMany", {
                ids: activeSelectedIds.length ? activeSelectedIds : visibleIds,
                enabled: false,
              })
            }
          >
            {activeSelectedIds.length
              ? `Disable selected (${activeSelectedIds.length})`
              : `Disable visible (${connectors.filter((c) => c.installed).length})`}
          </Button>
        </div>
      </div>

      {!groups.length ? (
        <Alert severity="info">
          No connectors match the selected filters. Click <b>Reset filters</b>{" "}
          to view all connectors.
        </Alert>
      ) : (
        groups.map((g) => {
          const isCollapsed = !!collapsed[g.id];
          const readyCount = g.items.filter(
            (c) => connectorStatus(c) === "available",
          ).length;
          const attnCount = g.items.filter(needsAttention).length;
          return (
            <section key={g.id} className="connector-group">
              <div
                className="connector-group-header"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [g.id]: !prev[g.id] }))
                }
              >
                <div>
                  <h2>
                    {isCollapsed ? "▸ " : "▾ "}
                    {g.title} ({g.items.length})
                  </h2>
                  {g.subtitle && <small>{g.subtitle}</small>}
                </div>
                <div className="tag-row">
                  <span className="tag teal">{readyCount} ready</span>
                  {attnCount > 0 && (
                    <span className="tag warn">{attnCount} attention</span>
                  )}
                </div>
              </div>
              {!isCollapsed && (
                <div className="connector-grid">{g.items.map(renderCard)}</div>
              )}
            </section>
          );
        })
      )}
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
