import { useState, useEffect } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  MenuItem,
  Switch,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import {
  AutoAwesomeOutlined,
  SearchRounded,
  SaveOutlined,
} from "@mui/icons-material";
import type { Call, RecordData, Snapshot } from "./types";
export function newSearch(data: Snapshot, scheduled = false): RecordData {
  return {
    name: "New academic search",
    countries: Object.values(data.countries).flat(),
    roles: ["Lecturer", "Assistant Professor", "Postdoctoral"],
    keywords: data.searchSuggestions?.recommended?.join(", ") || "",
    sources: data.sources
      .filter(
        (s) =>
          !s.access?.startsWith("employer") &&
          data.connectors.some((c) => c.id === s.id && c.enabled),
      )
      .map((s) => s.id),
    enabled: scheduled,
    day: 1,
    time: "09:00",
    timezone: "Asia/Shanghai",
    strategy: "hybrid",
    depth: "thorough",
    browserMode: "auto",
    maxResults: 1000,
    filters: { includeUnknownDates: true, includeUnknownCountry: true },
    mcpTools: [],
  };
}
export default function AdvancedSearch({
  search,
  data,
  close,
  submit,
  call,
  busy,
}: {
  search: RecordData;
  data: Snapshot;
  close: () => void;
  submit: (
    search: RecordData,
    action: "save" | "run" | "save-run",
  ) => Promise<void>;
  call: Call;
  busy: string;
}) {
  const [form, setForm] = useState<RecordData>({
      ...search,
      filters: search.filters || {},
      strategy: search.strategy || "hybrid",
      depth: search.depth || "thorough",
      browserMode: search.browserMode || "auto",
      maxResults: search.maxResults || 1000,
      mcpTools: search.mcpTools || [],
    }),
    [tab, setTab] = useState(0),
    [error, setError] = useState(""),
    [mcpErrors, setMcpErrors] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<RecordData>(
    data.searchSuggestions || {
      keywords: [],
      recommended: [],
      roleOptions: [],
    },
  );
  const roleKey = form.roles.join("|");
  const [preview, setPreview] = useState<RecordData | null>(null);
  const previewKey = JSON.stringify(form);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      window.academic
        .call("search.preview", { search: form })
        .then((r) => {
          if (active) setPreview(r.ok ? r.result : null);
        })
        .catch(() => {});
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [previewKey, data.searchCoverage?.[0]?.lastRun]);
  useEffect(() => {
    let active = true;
    window.academic
      .call("search.suggestions", { roles: form.roles })
      .then((r) => {
        if (active && r.ok) setSuggestions(r.result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [roleKey, data.profile?.updatedAt, data.profile?.importedAt]);
  const selectedKeywords = String(form.keywords || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const change = (patch: RecordData) => setForm((f) => ({ ...f, ...patch }));
  const filter = (patch: RecordData) =>
    change({ filters: { ...form.filters, ...patch } });
  const provider =
    form.aiProvider ||
    data.settings.workflowProviders?.discovery ||
    data.settings.provider;
  const models =
    data.providers
      .find((p) => p.id === provider)
      ?.models?.map((m: RecordData) => m.id) || [];
  const mcp = data.connectors.filter((c) => c.type === "mcp");
  const inactive = form.sources.filter(
    (id: string) => !data.connectors.some((c) => c.id === id && c.enabled),
  );
  const valid =
    form.mcpTools.every((t: RecordData) => !mcpErrors[t.connectorId]) &&
    form.name.trim() &&
    form.countries.length &&
    form.roles.length &&
    (form.strategy !== "sources" ||
      form.sources.length ||
      form.mcpTools.length);
  const run = async (action: "save" | "run" | "save-run") => {
    setError("");
    if (!valid) return;
    try {
      await submit(form, action);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog open onClose={close} fullWidth maxWidth="lg">
      <DialogTitle>
        {search.id ? "Edit advanced search" : "New advanced search"}
      </DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Search name"
          value={form.name}
          onChange={(e) => change({ name: e.target.value })}
          sx={{ mt: 1 }}
        />
        <div className="two-fields" style={{ marginTop: 16 }}>
          <TextField
            select
            label="Search depth"
            value={form.depth}
            onChange={(e) => change({ depth: e.target.value })}
          >
            {[
              ["quick", "Quick — short focused pass"],
              ["balanced", "Balanced — wider search"],
              ["thorough", "Thorough — broad coverage"],
            ].map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Public page reader"
            value={form.browserMode}
            onChange={(e) => change({ browserMode: e.target.value })}
          >
            {[
              ["auto", "Automatic — public HTML, Chrome for JavaScript"],
              ["http", "Public HTML only"],
              ["headless", "Headless Chrome after public access check"],
            ].map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        </div>
        {form.strategy !== "sources" && preview && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <b>
              {preview.countries.length} countries · {preview.totalQueries}{" "}
              planned query combinations.
            </b>{" "}
            This pass can run {preview.queriesThisRun} queries, consider up to{" "}
            {preview.budget.candidates} links and read up to{" "}
            {preview.budget.details} detail pages, with additional employer
            research. Remaining queries and unresolved links are retained for
            another pass. Visible Chrome assistance is available in Discover for
            verification or sign-in.
          </Alert>
        )}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          aria-label="Advanced search sections"
          sx={{ mb: 2 }}
        >
          <Tab label="Criteria & filters" />
          <Tab label="Sources & AI tools" />
          <Tab label="Weekly schedule" />
        </Tabs>
        {tab === 0 && (
          <div className="form-stack">
            <div>
              <p className="field-caption">COUNTRY GROUPS</p>
              <div className="tag-row">
                {data.countryGroups?.map((g) => (
                  <Button
                    key={g.id}
                    size="small"
                    variant="outlined"
                    onClick={() => change({ countries: g.countries })}
                  >
                    {g.label}
                  </Button>
                ))}
                <Button size="small" onClick={() => change({ countries: [] })}>
                  Clear countries
                </Button>
              </div>
            </div>
            <Autocomplete
              multiple
              options={Object.values(data.countries).flat()}
              value={form.countries}
              onChange={(_, countries) => change({ countries })}
              limitTags={5}
              renderInput={(params) => (
                <TextField {...params} label="Countries" />
              )}
            />
            <div>
              {["Lecturer", "Assistant Professor", "Postdoctoral"].map(
                (role) => (
                  <FormControlLabel
                    key={role}
                    label={role}
                    control={
                      <Checkbox
                        checked={form.roles.includes(role)}
                        onChange={(_, checked) =>
                          change({
                            roles: checked
                              ? [...form.roles, role]
                              : form.roles.filter((r: string) => r !== role),
                          })
                        }
                      />
                    }
                  />
                ),
              )}
            </div>
            <Autocomplete
              multiple
              freeSolo
              options={suggestions.roleOptions || []}
              value={form.roles.filter(
                (r: string) =>
                  !["Lecturer", "Assistant Professor", "Postdoctoral"].includes(
                    r,
                  ),
              )}
              onChange={(_, values) =>
                change({
                  roles: [
                    ...form.roles.filter((r: string) =>
                      [
                        "Lecturer",
                        "Assistant Professor",
                        "Postdoctoral",
                      ].includes(r),
                    ),
                    ...values
                      .map((v) => v.trim())
                      .filter((v) => v.length >= 2)
                      .filter(
                        (v, i, all) =>
                          all.findIndex(
                            (x) => x.toLowerCase() === v.toLowerCase(),
                          ) === i,
                      ),
                  ],
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Additional job roles"
                  helperText="Choose more roles or type a custom job title and press Enter. The three quick choices above remain available."
                />
              )}
            />
            <Autocomplete
              multiple
              freeSolo
              options={(suggestions.keywords || []).map(
                (k: RecordData) => k.term,
              )}
              value={selectedKeywords}
              onChange={(_, values) =>
                change({
                  keywords: [
                    ...new Set(
                      values
                        .flatMap((v) => v.split(/[,;\n]+/))
                        .map((v) => v.trim())
                        .filter(Boolean),
                    ),
                  ].join(", "),
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Research and teaching topics"
                  helperText="Select suggested keywords or type your own and press Enter. For strict matching use Required terms below."
                />
              )}
            />
            <section className="keyword-suggestions">
              <div className="flex-between">
                <h3>Suggested search keywords</h3>
                <Button
                  startIcon={<AutoAwesomeOutlined />}
                  disabled={!suggestions.recommended?.length}
                  onClick={() =>
                    change({ keywords: suggestions.recommended.join(", ") })
                  }
                >
                  Use recommended keywords
                </Button>
              </div>
              <p className="muted">
                {suggestions.hasProfile
                  ? "Matched to your profile and selected roles. Choose focused phrases and useful search variants."
                  : "Import a profile for personal research suggestions. Role-related terms are available now."}
              </p>
              <div className="tag-row">
                {(suggestions.keywords || [])
                  .slice(0, 24)
                  .map((k: RecordData) => {
                    const selected = selectedKeywords.some(
                      (v) => v.toLowerCase() === k.term.toLowerCase(),
                    );
                    return (
                      <Tooltip key={k.term} title={k.reason} describeChild>
                        <Chip
                          label={k.term}
                          aria-pressed={selected}
                          color={selected ? "primary" : "default"}
                          variant={selected ? "filled" : "outlined"}
                          onClick={() =>
                            change({
                              keywords: selected
                                ? selectedKeywords
                                    .filter(
                                      (v) =>
                                        v.toLowerCase() !==
                                        k.term.toLowerCase(),
                                    )
                                    .join(", ")
                                : [...selectedKeywords, k.term].join(", "),
                            })
                          }
                        />
                      </Tooltip>
                    );
                  })}
              </div>
              <small>
                Suggestions refresh when roles change; your chosen keywords stay
                selected. Only selected terms are used in the search.
              </small>
            </section>
            <div className="two-fields">
              <TextField
                label="Job title contains any"
                value={form.filters.title || ""}
                onChange={(e) => filter({ title: e.target.value })}
                helperText="Comma-separated words or phrases"
              />
              <TextField
                label="Institution contains any"
                value={form.filters.institutions || ""}
                onChange={(e) => filter({ institutions: e.target.value })}
                helperText="Comma-separated institution names"
              />
            </div>
            <div className="two-fields">
              <TextField
                label="Required terms (all)"
                value={form.filters.requiredTerms || ""}
                onChange={(e) => filter({ requiredTerms: e.target.value })}
                helperText="Comma-separated exact phrases"
              />
              <TextField
                label="Exclude terms (any)"
                value={form.filters.excludedTerms || ""}
                onChange={(e) => filter({ excludedTerms: e.target.value })}
                helperText="For example: PhD studentship, internship"
              />
            </div>
            <div className="three-fields">
              <TextField
                type="number"
                label="Minimum research match (%)"
                value={form.filters.minimumMatch || 0}
                onChange={(e) =>
                  filter({
                    minimumMatch: Math.max(
                      0,
                      Math.min(100, Number(e.target.value)),
                    ),
                  })
                }
                inputProps={{ min: 0, max: 100 }}
              />
              <TextField
                select
                label="Advertised within"
                value={form.filters.postedWithinDays || 0}
                onChange={(e) =>
                  filter({ postedWithinDays: Number(e.target.value) })
                }
              >
                {[0, 7, 14, 30, 60, 90].map((d) => (
                  <MenuItem key={d} value={d}>
                    {d ? `${d} days` : "Any publication date"}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Closing within"
                value={form.filters.closingWithinDays || 0}
                onChange={(e) =>
                  filter({ closingWithinDays: Number(e.target.value) })
                }
              >
                {[0, 7, 14, 30, 60, 90].map((d) => (
                  <MenuItem key={d} value={d}>
                    {d ? `${d} days` : "Any future deadline"}
                  </MenuItem>
                ))}
              </TextField>
            </div>
            <div className="tag-row">
              {[
                ["includeUnknownDates", "Include unstated dates", true],
                ["includeUnknownCountry", "Include unknown country", true],
                ["officialOnly", "Official employer listings only", false],
                ["remoteOnly", "Remote explicitly mentioned", false],
              ].map(([key, label, fallback]) => (
                <FormControlLabel
                  key={String(key)}
                  label={String(label)}
                  control={
                    <Checkbox
                      checked={form.filters[String(key)] ?? fallback}
                      onChange={(_, checked) =>
                        filter({ [String(key)]: checked })
                      }
                    />
                  }
                />
              ))}
            </div>
            <Alert severity="info">
              Expired positions are excluded. Filters apply before new results
              are saved; your existing Discover listings remain available.
              Unknown dates/countries are included only when selected.
            </Alert>
          </div>
        )}
        {tab === 1 && (
          <div className="form-stack">
            <div className="three-fields">
              <TextField
                select
                label="Search method"
                value={form.strategy}
                onChange={(e) => change({ strategy: e.target.value })}
              >
                <MenuItem value="hybrid">
                  Web search + reliable connectors
                </MenuItem>
                <MenuItem value="sources">Connectors only</MenuItem>
                <MenuItem value="ai">Web search only</MenuItem>
              </TextField>
              <TextField
                select
                label="AI provider"
                InputLabelProps={{ shrink: true }}
                SelectProps={{ displayEmpty: true }}
                value={form.aiProvider || ""}
                onChange={(e) =>
                  change({ aiProvider: e.target.value, aiModel: "" })
                }
              >
                <MenuItem value="">Discovery workflow default</MenuItem>
                <MenuItem value="codex">Codex</MenuItem>
                <MenuItem value="antigravity">Antigravity</MenuItem>
              </TextField>
              <Autocomplete
                freeSolo
                options={models}
                value={form.aiModel || ""}
                onChange={(_, v) => change({ aiModel: v || "" })}
                onInputChange={(_, v, reason) => {
                  if (reason === "input") change({ aiModel: v });
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="AI model"
                    helperText="Empty uses the selected provider's default"
                  />
                )}
              />
            </div>
            {!data.settings.cloudConsent && form.strategy !== "sources" && (
              <Alert severity="warning">
                AI processing is off in Settings. Public discovery remains
                available; web search waits until you enable it. Web-only
                searches require AI processing.
              </Alert>
            )}
            <TextField
              label="Maximum full listings"
              type="number"
              value={form.maxResults || 1000}
              onChange={(e) =>
                change({
                  maxResults: Math.max(
                    5,
                    Math.min(2000, Number(e.target.value)),
                  ),
                })
              }
              inputProps={{ min: 5, max: 2000 }}
            />
            <Autocomplete
              multiple
              limitTags={4}
              options={[...data.sources].sort(
                (a, b) =>
                  a.region.localeCompare(b.region) ||
                  a.name.localeCompare(b.name),
              )}
              getOptionLabel={(s) => s.name}
              groupBy={(s) => s.region}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              value={data.sources.filter((s) => form.sources.includes(s.id))}
              onChange={(_, sources) =>
                change({ sources: sources.map((s) => s.id) })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Supplemental connectors and portal hints"
                />
              )}
            />
            <div className="tag-row">
              <Button
                onClick={() =>
                  change({
                    sources: data.sources
                      .filter(
                        (s) =>
                          (s.region === "All" ||
                            (
                              s.countries ||
                              data.countries[s.region] ||
                              []
                            ).some((c: string) =>
                              form.countries.includes(c),
                            )) &&
                          data.connectors.some(
                            (c) => c.id === s.id && c.enabled,
                          ) &&
                          (!s.access?.startsWith("employer") ||
                            data.connectors.find((c) => c.id === s.id)?.boards
                              ?.length),
                      )
                      .map((s) => s.id),
                  })
                }
              >
                Select enabled sources for these countries
              </Button>
              <Button
                onClick={() =>
                  change({
                    sources: data.sources
                      .filter((s) => {
                        const c = data.connectors.find((x) => x.id === s.id);
                        const status = c?.status || s.status || "";
                        const countryOk =
                          s.region === "All" ||
                          (
                            s.countries ||
                            data.countries[s.region] ||
                            []
                          ).some((country: string) =>
                            form.countries.includes(country),
                          );
                        const employerOk =
                          !s.access?.startsWith("employer") ||
                          !!c?.boards?.length;
                        return (
                          countryOk &&
                          c?.enabled &&
                          employerOk &&
                          !["unavailable", "restricted", "manual", "not_found"].includes(
                            status,
                          )
                        );
                      })
                      .map((s) => s.id),
                  })
                }
              >
                Select healthy sources (exclude blocked)
              </Button>
              <Button onClick={() => change({ sources: [] })}>
                Clear sources
              </Button>
            </div>
            {!!inactive.length && (
              <Alert severity="warning">
                {inactive.length} selected sources are disabled or uninstalled.
                Enable them in Connectors before running this search.
              </Alert>
            )}
            <p className="muted">
              {form.sources.length} sources selected. Each source's public
              access rules and browser/setup requirements still apply. Manual
              sources can be opened from Connectors or researched in Apply.
            </p>
            <h3>Connected MCP research tools</h3>
            {!mcp.length && (
              <Alert severity="info">
                Add and test a remote research connection in Connectors to
                include its tools here.
              </Alert>
            )}
            {mcp.map((c) => {
              const config = form.mcpTools.find(
                (t: RecordData) => t.connectorId === c.id,
              );
              const update = (patch: RecordData) =>
                change({
                  mcpTools: form.mcpTools.map((t: RecordData) =>
                    t.connectorId === c.id ? { ...t, ...patch } : t,
                  ),
                });
              return (
                <section className="advanced-mcp" key={c.id}>
                  <FormControlLabel
                    label={`${c.name}${!c.enabled ? " (disabled)" : ""}`}
                    control={
                      <Checkbox
                        disabled={!c.enabled || !c.tools?.length}
                        checked={!!config}
                        onChange={(_, checked) => {
                          setMcpErrors((errors) => ({
                            ...errors,
                            [c.id]: false,
                          }));
                          change({
                            mcpTools: checked
                              ? [
                                  ...form.mcpTools,
                                  {
                                    connectorId: c.id,
                                    tool: c.tools[0].name,
                                    arguments: { query: "{{keywords}}" },
                                  },
                                ]
                              : form.mcpTools.filter(
                                  (t: RecordData) => t.connectorId !== c.id,
                                ),
                          });
                        }}
                      />
                    }
                  />
                  {config && (
                    <>
                      <TextField
                        select
                        fullWidth
                        label={`${c.name} research tool`}
                        value={config.tool}
                        onChange={(e) => {
                          setMcpErrors((errors) => ({
                            ...errors,
                            [c.id]: false,
                          }));
                          update({ tool: e.target.value });
                        }}
                      >
                        {c.tools.map((t: RecordData) => (
                          <MenuItem key={t.name} value={t.name}>
                            {t.name}
                          </MenuItem>
                        ))}
                      </TextField>
                      <McpArguments
                        key={c.id + config.tool}
                        value={config.arguments}
                        onChange={(value) => update({ arguments: value })}
                        validate={(valid) =>
                          setMcpErrors((errors) => ({
                            ...errors,
                            [c.id]: !valid,
                          }))
                        }
                      />
                      <details>
                        <summary>Tool input schema</summary>
                        <pre className="connector-schema">
                          {JSON.stringify(
                            c.tools.find(
                              (t: RecordData) => t.name === config.tool,
                            )?.inputSchema,
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </>
                  )}
                </section>
              );
            })}
            <small>
              MCP argument templates support {"{{keywords}}"}, {"{{countries}}"}
              , and {"{{roles}}"}. Only search criteria are sent. Returned
              vacancies are checked against the same filters before saving.
            </small>
          </div>
        )}
        {tab === 2 && (
          <div className="form-stack">
            <FormControlLabel
              label="Enable weekly discovery"
              control={
                <Switch
                  checked={form.enabled}
                  onChange={(_, enabled) => change({ enabled })}
                />
              }
            />
            <div className="three-fields">
              <TextField
                select
                label="Every week on"
                value={form.day}
                onChange={(e) => change({ day: Number(e.target.value) })}
              >
                {[
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((name, index) => (
                  <MenuItem key={name} value={index}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                type="time"
                label="Time"
                value={form.time}
                onChange={(e) => change({ time: e.target.value })}
              />
              <TextField
                label="Timezone"
                value={form.timezone}
                onChange={(e) => change({ timezone: e.target.value })}
              />
            </div>
            <Alert severity="info">
              Save this search to reuse its full criteria, provider/model,
              source selection and MCP tools in Discover and Scheduler. Search
              now runs once; a weekly schedule is created only when you save and
              enable it.
            </Alert>
          </div>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
        <Button onClick={close}>Cancel</Button>
        <Button
          startIcon={<SaveOutlined />}
          disabled={!!busy || !valid}
          onClick={() => run("save")}
        >
          Save search
        </Button>
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeOutlined />}
          disabled={!!busy || !valid}
          onClick={() => run("save-run")}
        >
          Save & search
        </Button>
        <Button
          variant="contained"
          startIcon={<SearchRounded />}
          disabled={!!busy || !valid}
          onClick={() => run("run")}
        >
          Search now
        </Button>
      </DialogActions>
    </Dialog>
  );
}
function McpArguments({
  value,
  onChange,
  validate,
}: {
  value: RecordData;
  onChange: (value: RecordData) => void;
  validate: (valid: boolean) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2)),
    [error, setError] = useState("");
  return (
    <TextField
      fullWidth
      multiline
      minRows={3}
      label="MCP search arguments (JSON)"
      value={text}
      error={!!error}
      helperText={
        error ||
        "Use the provider's input schema. Do not enter credentials here."
      }
      onChange={(e) => {
        setText(e.target.value);
        try {
          const parsed = JSON.parse(e.target.value);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error("Enter a JSON object");
          onChange(parsed);
          setError("");
          validate(true);
        } catch (err) {
          setError((err as Error).message);
          validate(false);
        }
      }}
    />
  );
}
