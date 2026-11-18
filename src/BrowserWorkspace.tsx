import { useEffect, useState } from "react";
import { Button, TextField, Alert } from "@mui/material";
import type { Call, RecordData, Snapshot } from "./types";
export default function BrowserWorkspace({
  data,
  call,
  busy,
  embedded = false,
}: {
  data: Snapshot;
  call: Call;
  busy: string;
  embedded?: boolean;
}) {
  const [tabs, setTabs] = useState<RecordData[]>([]),
    [selected, setSelected] = useState(""),
    [url, setUrl] = useState("https://www.academictransfer.com/en/jobs/"),
    [inspection, setInspection] = useState<RecordData | null>(null),
    [prompt, setPrompt] = useState(
      "Find lecturer and postdoctoral positions in speech AI in the Netherlands.",
    ),
    [plan, setPlan] = useState<RecordData | null>(null);
  async function refresh() {
    const result = await call("browser.tabs");
    if (result) {
      setTabs(result);
      setSelected((current) =>
        result.some((t: RecordData) => t.id === current)
          ? current
          : result[0]?.id || "",
      );
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  async function open(target: string) {
    const result = await call("browser.open", { url: target });
    if (result) {
      setTabs(result.tabs);
      setSelected(result.tabId);
      setInspection(null);
      setUrl(target);
    }
  }
  async function control(action: string) {
    const result = await call("browser.control", { tabId: selected, action });
    if (result) {
      setTabs(result.tabs);
      setInspection(null);
      if (action === "close") setSelected(result.tabs[0]?.id || "");
    }
  }
  const tab = tabs.find((t) => t.id === selected);
  return (
    <>
      <div className="page-heading">
        <div>
          {embedded ? <h2>Browser workspace</h2> : <h1>Browser workspace</h1>}
          <p>
            Research vacancies in visible Chrome, inspect listings and bring
            them into your workspace.
          </p>
        </div>
        <Button onClick={refresh}>Refresh tabs</Button>
      </div>
      {!data.chromeInstalled && (
        <Alert severity="warning">
          Install Google Chrome to use browser controls.
        </Alert>
      )}
      <section className="panel padded">
        <h2>Chrome controls</h2>
        <div className="browser-address">
          <TextField
            fullWidth
            size="small"
            label="Public job board or vacancy URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            variant="contained"
            disabled={!!busy || !url || !data.chromeInstalled}
            onClick={() => open(url)}
          >
            Open tab
          </Button>
        </div>
        <div className="browser-tabs">
          {tabs.map((t) => (
            <Button
              variant={selected === t.id ? "contained" : "outlined"}
              key={t.id}
              onClick={() => {
                setSelected(t.id);
                setInspection(null);
                setUrl(t.url);
              }}
            >
              {t.title || "Chrome tab"}
            </Button>
          ))}
          {!tabs.length && (
            <p className="muted">
              Open a research tab to begin. Application portal tabs are
              controlled from Apply.
            </p>
          )}
        </div>
        {tab && (
          <>
            <p className="portal-url">{tab.url}</p>
            <div className="portal-toolbar">
              {["back", "forward", "reload", "focus", "close"].map((action) => (
                <Button
                  key={action}
                  disabled={!!busy}
                  onClick={() => control(action)}
                >
                  {action === "focus"
                    ? "Show Chrome"
                    : action[0].toUpperCase() + action.slice(1)}
                </Button>
              ))}
              <Button
                variant="outlined"
                disabled={!!busy}
                onClick={async () => {
                  const result = await call("browser.inspect", {
                    tabId: selected,
                  });
                  if (result) setInspection(result);
                }}
              >
                Inspect page
              </Button>
              <Button
                variant="contained"
                disabled={!!busy}
                onClick={() => call("browser.import", { tabId: selected })}
              >
                Import visible listing
              </Button>
            </div>
          </>
        )}
      </section>
      <section className="panel padded">
        <h2>Describe your browser task</h2>
        <p className="muted">
          Get a research plan, then review and run its steps. Your prompt and
          the current page address (without query values) go to the selected AI
          provider. Page text and form entries are excluded.
        </p>
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Research instructions"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button
          sx={{ mt: 2 }}
          variant="contained"
          disabled={!!busy || !data.settings.cloudConsent || prompt.length < 5}
          onClick={async () => {
            const result = await call("browser.plan", {
              prompt,
              tabId: selected || undefined,
            });
            if (result) setPlan(result);
          }}
        >
          Create browser plan
        </Button>
        {!data.settings.cloudConsent && (
          <p className="muted">
            Enable AI processing in Settings for prompt assistance. Direct
            browser controls work locally.
          </p>
        )}
        {plan && (
          <div className="browser-plan">
            <h3>{plan.summary}</h3>
            {plan.steps.map((step: RecordData, index: number) => (
              <div className="plan-step" key={index}>
                <div>
                  <b>
                    {index + 1}. {step.description}
                  </b>
                  {step.url && <small>{step.url}</small>}
                </div>
                <Button
                  disabled={!!busy || (step.action !== "open" && !selected)}
                  onClick={async () => {
                    if (step.action === "open") await open(step.url);
                    else if (step.action === "inspect") {
                      const result = await call("browser.inspect", {
                        tabId: selected,
                      });
                      if (result) setInspection(result);
                    } else await call("browser.import", { tabId: selected });
                  }}
                >
                  Run {step.action}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
      {inspection && (
        <section className="panel padded">
          <h2>{inspection.title}</h2>
          <p className="portal-url">{inspection.url}</p>
          <p className="browser-page-text">{inspection.text}</p>
        </section>
      )}
    </>
  );
}
