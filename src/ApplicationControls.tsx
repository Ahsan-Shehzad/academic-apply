import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  TextField,
  MenuItem,
  IconButton,
  Select,
  FormControl,
  InputLabel,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import {
  ArrowBackRounded,
  ArrowForwardRounded,
  RefreshRounded,
  CameraAltOutlined,
  AutoAwesomeOutlined,
  KeyboardArrowUpRounded,
  KeyboardArrowDownRounded,
  OpenInNewRounded,
  PauseCircleOutlineRounded,
} from "@mui/icons-material";
import type { Call, RecordData, Snapshot } from "./types";
export function PortalFieldEditor({
  field: f,
  applicationId,
  call,
  busy,
}: {
  field: RecordData;
  applicationId: string;
  call: Call;
  busy: string;
}) {
  const [value, setValue] = useState(f.value || "");
  useEffect(() => setValue(f.value || ""), [f.value, applicationId]);
  const privateField =
    /password|otp|one.time|verification.code|security.code|secret|token|passport|national.id|social.security|date.of.birth/i.test(
      `${f.type} ${f.name} ${f.label}`,
    );
  if (f.type === "file") return <span>{f.value || "No file selected"}</span>;
  if (privateField) return <small>Enter privately in Chrome</small>;
  const choice = ["checkbox", "radio"].includes(f.type);
  return (
    <div className="portal-field-editor">
      <TextField
        size="small"
        fullWidth
        label={f.label + " value"}
        disabled={!!busy || f.disabled}
        select={choice || !!f.options?.length}
        multiline={!choice && !f.options?.length && /textarea/.test(f.type)}
        maxRows={6}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        {choice
          ? [
              <MenuItem key="true" value="true">
                Selected
              </MenuItem>,
              <MenuItem key="false" value="false">
                Not selected
              </MenuItem>,
            ]
          : (f.options || []).map((o: RecordData) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
      </TextField>
      <Button
        size="small"
        disabled={!!busy || f.disabled}
        onClick={() =>
          call(
            "application.browserAction",
            {
              id: applicationId,
              action: {
                action: "fill",
                fieldKey: f.key,
                value: choice ? value === "true" : value,
              },
            },
            "Field updated. Review it in the portal.",
          )
        }
      >
        Fill
      </Button>
    </div>
  );
}
export default function ApplicationControls({
  application: a,
  data,
  call,
  busy,
}: {
  application: RecordData;
  data: Snapshot;
  call: Call;
  busy: string;
}) {
  const [state, setState] = useState<RecordData | null>(null),
    [url, setUrl] = useState(a.snapshot?.url || ""),
    [prompt, setPrompt] = useState(
      "Inspect this application, fill verified profile details and reviewed answers, upload the requested reviewed package files, and continue until a manual decision or final submission review is needed.",
    ),
    [preview, setPreview] = useState(""),
    [matches, setMatches] = useState<Record<string, string[]>>({});
  const provider =
    data.settings.workflowProviders?.portal || data.settings.provider;
  const agent = data.tasks.find(
    (t) =>
      t.kind === "browser-agent" &&
      t.payload?.applicationId === a.id &&
      ["queued", "running"].includes(t.status),
  );
  async function inspect() {
    const result = await call("application.browserInspect", { id: a.id });
    if (result) {
      setState(result);
      setUrl(result.snapshot.url);
      setMatches(
        Object.fromEntries(
          result.uploadMatches.map((m: RecordData) => [m.fieldKey, m.fileIds]),
        ),
      );
    }
  }
  const formKey = JSON.stringify([
    a.snapshot?.url,
    a.packageId,
    a.snapshot?.fields?.map((f: RecordData) => [f.key, f.value, f.label]),
  ]);
  useEffect(() => {
    setState(null);
    if (a.browserConnected) inspect();
  }, [a.id, formKey, a.browserConnected]);
  async function action(action: RecordData) {
    const result = await call("application.browserAction", {
      id: a.id,
      action,
    });
    if (result?.image) setPreview(result.image);
    else if (result?.snapshot) {
      setState(result);
      setUrl(result.snapshot.url);
    }
  }
  return (
    <div className="application-browser-console">
      <div className="section-label">
        <b>Application browser</b>
        <span>
          {provider === "antigravity"
            ? "Antigravity ACP / MCP"
            : "Codex app-server tools"}
        </span>
      </div>
      <div className="portal-toolbar">
        <IconButton
          title="Back"
          disabled={!!busy || !!agent}
          onClick={() => action({ action: "back" })}
        >
          <ArrowBackRounded />
        </IconButton>
        <IconButton
          title="Forward"
          disabled={!!busy || !!agent}
          onClick={() => action({ action: "forward" })}
        >
          <ArrowForwardRounded />
        </IconButton>
        <IconButton
          title="Reload portal"
          disabled={!!busy || !!agent}
          onClick={() => action({ action: "reload" })}
        >
          <RefreshRounded />
        </IconButton>
        <TextField
          size="small"
          label="Portal address"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <Button
          disabled={!!busy || !!agent || !url}
          onClick={() => action({ action: "navigate", url })}
        >
          Go
        </Button>
      </div>
      {!!state?.tabs?.length && (
        <FormControl size="small" fullWidth>
          <InputLabel id={"application-tab-" + a.id}>
            Application Chrome tab
          </InputLabel>
          <Select
            labelId={"application-tab-" + a.id}
            label="Application Chrome tab"
            value={state.tabs.find((t: RecordData) => t.selected)?.id || ""}
            onChange={(e) =>
              action({ action: "select_tab", tabId: e.target.value })
            }
          >
            {state.tabs.map((t: RecordData) => (
              <MenuItem key={t.id} value={t.id}>
                {t.title || t.url}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <div className="portal-toolbar">
        <Button
          size="small"
          startIcon={<OpenInNewRounded />}
          onClick={() => call("application.focus", { id: a.id })}
        >
          Show Chrome
        </Button>
        <Button
          size="small"
          startIcon={<CameraAltOutlined />}
          disabled={!!busy}
          onClick={() => action({ action: "screenshot" })}
        >
          Page preview
        </Button>
        <IconButton
          title="Scroll up"
          onClick={() => action({ action: "scroll", direction: "up" })}
        >
          <KeyboardArrowUpRounded />
        </IconButton>
        <IconButton
          title="Scroll down"
          onClick={() => action({ action: "scroll", direction: "down" })}
        >
          <KeyboardArrowDownRounded />
        </IconButton>
        <Button size="small" onClick={inspect}>
          Refresh controls
        </Button>
      </div>
      <TextField
        multiline
        minRows={2}
        maxRows={6}
        fullWidth
        label="Ask the browser assistant"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="portal-toolbar">
        <Button
          variant="contained"
          startIcon={<AutoAwesomeOutlined />}
          disabled={!!busy || !!agent || !data.settings.cloudConsent}
          onClick={() =>
            call(
              "application.agent",
              { id: a.id, prompt },
              "Browser assistant queued. Follow each action in Activity.",
            )
          }
        >
          Run {provider === "antigravity" ? "Antigravity" : "Codex"} assistant
        </Button>
        {provider === "antigravity" && (
          <Button
            disabled={!!busy || !!agent || !data.settings.cloudConsent}
            onClick={() =>
              call(
                "application.nativeBrowser",
                { id: a.id, prompt },
                "Native browser assistant handoff opened. Review permissions in Chrome and the terminal.",
              )
            }
          >
            Native /browser handoff
          </Button>
        )}
        {agent && (
          <Button
            color="warning"
            startIcon={<PauseCircleOutlineRounded />}
            onClick={async () => {
              await call("task.cancel", { id: agent.id });
              await call("application.focus", { id: a.id });
            }}
          >
            Stop agent & take over
          </Button>
        )}
      </div>
      <p className="muted">
        The assistant works in this application's Chrome session. Sign-in,
        private declarations and final submission stay with you. Only reviewed
        package documents are available to the agent.
      </p>
      {provider === "antigravity" && (
        <small className="muted">
          Native handoff uses Antigravity's own browser subagent and requires
          Chrome DevTools permission. Its actions run outside the embedded
          assistant's controls; keep final submission manual.
        </small>
      )}
      {a.agentReport && (
        <details>
          <summary>
            Last assistant result
            {a.agentActions ? ` · ${a.agentActions} actions` : ""}
          </summary>
          <Alert severity="info" sx={{ whiteSpace: "pre-wrap" }}>
            {String(a.agentReport)
              .replace(/^#{1,6}\s*/gm, "")
              .replace(/\*\*/g, "")
              .replace(/`/g, "")
              .replace(/\s*\([fb]\d+-\d+\)/g, "")}
          </Alert>
        </details>
      )}
      <details>
        <summary>Page controls and matched uploads</summary>
        {!!a.packageId && (
          <Button
            onClick={async () => {
              const pkg = data.packages.find((p) => p.id === a.packageId);
              if (pkg) {
                const result = await call(
                  "package.combine",
                  {
                    id: pkg.id,
                    documentIds: pkg.documents
                      .filter((d: RecordData) => d.reviewed && d.pdf)
                      .map((d: RecordData) => d.id),
                    attachmentPaths: pkg.attachments
                      .filter(
                        (f: RecordData) =>
                          /\.pdf$/i.test(f.path) &&
                          !/Combined-Supporting-Packet\.pdf$/i.test(f.path),
                      )
                      .map((f: RecordData) => f.path),
                  },
                  "Combined package PDF created. Preview it before upload.",
                );
                if (result) inspect();
              }
            }}
          >
            Combine reviewed PDFs and supporting attachments
          </Button>
        )}
        <div className="portal-toolbar">
          {state?.snapshot?.buttons
            ?.filter((b: RecordData) => !b.terminal)
            .slice(0, 45)
            .map((b: RecordData) => (
              <Button
                size="small"
                variant="outlined"
                key={b.key}
                disabled={!!busy || b.disabled || !!agent}
                onClick={() => action({ action: "click", buttonKey: b.key })}
              >
                {b.text || "Unnamed control"}
              </Button>
            ))}
        </div>
        {state?.uploadMatches?.map((m: RecordData) => (
          <div key={m.fieldKey} className="upload-slot">
            <b>{m.label}</b>
            <small>
              {m.reason} · {m.accept || "Portal file types"}
            </small>
            <Select
              fullWidth
              size="small"
              multiple
              value={matches[m.fieldKey] || []}
              inputProps={{ "aria-label": "Files for " + m.label }}
              onChange={(e) =>
                setMatches({
                  ...matches,
                  [m.fieldKey]:
                    typeof e.target.value === "string"
                      ? e.target.value.split(",")
                      : e.target.value,
                })
              }
            >
              {state.files.map((f: RecordData) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.label} · {f.format}
                </MenuItem>
              ))}
            </Select>
            <Button
              disabled={!!busy || !!agent || !matches[m.fieldKey]?.length}
              onClick={() =>
                action({
                  action: "upload",
                  fieldKey: m.fieldKey,
                  fileIds: matches[m.fieldKey],
                })
              }
            >
              Upload selected files
            </Button>
          </div>
        ))}
        {!state?.uploadMatches?.length && (
          <p className="muted">
            No visible upload slots. Inspect again after moving to the document
            step.
          </p>
        )}
      </details>
      <Dialog
        open={!!preview}
        onClose={() => setPreview("")}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Current portal preview</DialogTitle>
        <DialogContent>
          <img
            src={preview}
            alt="Application page with private fields masked"
            style={{ width: "100%" }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
