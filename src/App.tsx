import { useState, useEffect, useCallback, useMemo, Fragment } from "react";

import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Button,
  IconButton,
  TextField,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Drawer,
  LinearProgress,
  Alert,
  Snackbar,
  Checkbox,
  FormControlLabel,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Autocomplete,
  Switch,
  Tooltip,
  CircularProgress,
  Divider,
  Rating,
  Menu,
} from "@mui/material";

import {
  SpaceDashboardOutlined,
  TravelExploreOutlined,
  EventRepeatOutlined,
  DescriptionOutlined,
  SendOutlined,
  PersonOutline,
  BarChartOutlined,
  SettingsOutlined,
  ArrowForwardRounded,
  AddRounded,
  SearchRounded,
  CloseRounded,
  OpenInNewRounded,
  CheckRounded,
  FolderOpenOutlined,
  RefreshRounded,
  NotificationsNoneRounded,
  NorthEastRounded,
  SchoolOutlined,
  AutoAwesomeOutlined,
  MoreHorizRounded,
  KeyboardArrowDownRounded,
  DownloadOutlined,
  TaskAltRounded,
  PauseCircleOutlineRounded,
  PlayArrowRounded,
  WarningAmberRounded,
  VerifiedOutlined,
  MailOutlineRounded,
  EditOutlined,
  ContentCopyOutlined,
  LightModeOutlined,
  DarkModeOutlined,
  HistoryOutlined,
  PublicOutlined,
  ExtensionOutlined,
  HelpOutlineRounded,
} from "@mui/icons-material";

import type { RecordData, Snapshot } from "./types";

import Activity, { WorkflowProgress } from "./Activity";
import { CompletionNotices } from "./TaskSummary";

import BrowserWorkspace from "./BrowserWorkspace";

import ApplicationControls, { PortalFieldEditor } from "./ApplicationControls";

import Connectors from "./Connectors";
import PackageSupport, { PackageRequirements } from "./PackageSupport";
import AdvancedSearch, { newSearch } from "./AdvancedSearch";
import ApplyStart, { packageLabel } from "./ApplyStart";
import SearchCandidates from "./SearchCandidates";

const NAV = [
  ["Dashboard", SpaceDashboardOutlined],

  ["Discover", TravelExploreOutlined],

  ["Scheduler", EventRepeatOutlined],

  ["Documents", DescriptionOutlined],

  ["Apply", AutoAwesomeOutlined],

  ["Activity", HistoryOutlined],

  ["Connectors", ExtensionOutlined],

  ["Profile", PersonOutline],

  ["Reports", BarChartOutlined],

  ["Settings", SettingsOutlined],
] as const;

const STATUS: Record<string, string> = {
  discovered: "Discovered",

  shortlisted: "Shortlisted",

  preparing: "Preparing",

  ready_for_review: "Ready for review",

  submitted: "Submitted",

  submission_uncertain: "Outcome uncertain",

  interview: "Interview",

  offer: "Offer",

  rejected: "Rejected",

  withdrawn: "Withdrawn",

  paused: "Paused",

  dismissed: "Dismissed",

  closed: "Closed",
};

const fmt = (value: any) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",

        month: "short",

        year: "numeric",
      })
    : "—";

function deadline(job: RecordData) {
  if (!job.deadline)
    return { label: job.deadlineText || "Not stated", kind: "unknown" };

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(job.deadline);

  const days = Math.ceil(
    (Date.parse(dateOnly ? job.deadline + "T23:59:59Z" : job.deadline) -
      Date.now()) /
      86400000,
  );

  return {
    label:
      fmt(job.deadline) +
      (dateOnly && job.deadlineTimezone === "Not stated"
        ? " · check time"
        : ""),

    kind:
      days < 0
        ? "expired"
        : days <= 3
          ? "urgent"
          : days <= 7
            ? "soon"
            : "normal",
  };
}

function Stat({
  label,

  value,

  detail,

  icon: Icon,

  color = "teal",
}: {
  label: string;

  value: number | string;

  detail: string;

  icon: any;

  color?: string;
}) {
  return (
    <div className="stat">
      <div>
        <p>{label}</p>

        <strong>{value}</strong>

        <span>{detail}</span>
      </div>

      <div className={"stat-icon " + color}>
        <Icon />
      </div>
    </div>
  );
}

function Empty({
  icon: Icon = TravelExploreOutlined,

  title,

  text,

  action,
}: {
  icon?: any;

  title: string;

  text: string;

  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon sx={{ fontSize: 30 }} />
      </div>

      <h3>{title}</h3>

      <p>{text}</p>

      {action}
    </div>
  );
}

function Tag({
  children,

  kind = "neutral",
}: {
  children: React.ReactNode;

  kind?: string;
}) {
  return <span className={"tag " + kind}>{children}</span>;
}

function FieldSelect({
  label,

  value,

  onChange,

  options,
}: {
  label: string;

  value: any;

  onChange: (value: any) => void;

  options: (string | { value: string; label: string })[];
}) {
  return (
    <FormControl size="small" fullWidth>
      <InputLabel>{label}</InputLabel>

      <Select
        label={label}

        inputProps={{ "aria-label": label }}

        value={value ?? ""}

        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <MenuItem
            key={typeof o === "string" ? o : o.value}

            value={typeof o === "string" ? o : o.value}
          >
            {typeof o === "string" ? o : o.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [route, setRoute] = useState("Dashboard"),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [busy, setBusy] = useState(""),
    [tasksOpen, setTasksOpen] = useState(false),
    [selectedTask, setSelectedTask] = useState(""),
    [selectedJob, setSelectedJob] = useState<RecordData | null>(null),
    [addJob, setAddJob] = useState(false),
    [searchEditor, setSearchEditor] = useState<RecordData | null>(null),
    [packageJob, setPackageJob] = useState(""),
    [selectedPackage, setSelectedPackage] = useState(""),
    [docEditor, setDocEditor] = useState<{
      pkg: RecordData;

      doc: RecordData;
    } | null>(null),
    [selectedApp, setSelectedApp] = useState(""),
    [browserResearchOpen, setBrowserResearchOpen] = useState(false),
    [review, setReview] = useState<RecordData | null>(null),
    [suggestions, setSuggestions] = useState<RecordData | null>(null),
    [mail, setMail] = useState<RecordData | null>(null),
    [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null),
    [aboutOpen, setAboutOpen] = useState(false);

  const reload = useCallback(async () => {
    const r = await window.academic.call("snapshot");

    if (r.ok) setData(r.result);
    else
      setToast({
        text: r.error || "Could not load the workspace",

        error: true,
      });
  }, []);

  const call = useCallback(
    async (method: string, args: RecordData = {}, message?: string) => {
      setBusy(method);

      try {
        const r = await window.academic.call(method, args);

        if (!r.ok) throw new Error(r.error);

        await reload();

        if (r.result?.status === "queued" && r.result?.kind) {
          setSelectedTask(r.result.id);

          setTasksOpen(true);
        }

        if (method === "browser.open" && r.result) {
          setRoute("Apply");

          setBrowserResearchOpen(true);
        }

        if (message) setToast({ text: message });
        else if (r.result?.message) setToast({ text: r.result.message });

        return r.result;
      } catch (error) {
        setToast({ text: (error as Error).message, error: true });

        return null;
      } finally {
        setBusy("");
      }
    },

    [reload],
  );

  useEffect(() => {
    reload();

    const off = window.academic.onEvent((event) => {
      if (event?.type === "about") {
        setAboutOpen(true);
        return;
      }
      reload();
    });

    const interval = setInterval(reload, 12000);

    return () => {
      off();

      clearInterval(interval);
    };
  }, [reload]);

  const dark =
    data?.settings.theme === "dark" ||
    (data?.settings.theme === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: dark ? "dark" : "light",

          primary: { main: "#147d78" },

          secondary: { main: "#1b3355" },

          background: {
            default: dark ? "#101924" : "#f5f7fa",

            paper: dark ? "#192533" : "#ffffff",
          },
        },

        typography: {
          fontFamily: '"Segoe UI", Inter, Arial, sans-serif',

          button: { textTransform: "none", fontWeight: 600, fontSize: 13 },
        },

        shape: { borderRadius: 9 },

        components: {
          MuiButton: {
            defaultProps: { disableElevation: true },

            styleOverrides: { root: { borderRadius: 8, padding: "9px 16px" } },
          },

          MuiTextField: { defaultProps: { size: "small" } },

          MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },

          MuiChip: { styleOverrides: { root: { fontSize: 12 } } },
        },
      }),

    [dark],
  );

  if (!data)
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />

        <div className="loading">
          <CircularProgress />

          <p>Opening your academic workspace…</p>
        </div>
      </ThemeProvider>
    );

  const activeTasks = data.tasks.filter((t) =>
    ["running", "queued"].includes(t.status),
  );

  const shortlisted = data.jobs.filter((j) => j.status === "shortlisted");

  const strong = data.jobs.filter(
    (j) => j.match?.score >= 70 && j.status !== "dismissed",
  );

  const closing = data.jobs.filter(
    (j) =>
      ["urgent", "soon"].includes(deadline(j).kind) && j.status !== "dismissed",
  );

  const documentJobId =
    packageJob ||
    data.jobs.find((j) => j.status === "shortlisted")?.id ||
    data.jobs[0]?.id ||
    data.packages[0]?.jobId ||
    "";
  const currentPackage =
    data.packages.find(
      (p) => p.id === selectedPackage && p.jobId === documentJobId,
    ) || data.packages.find((p) => p.jobId === documentJobId);

  const currentApp =
    data.applications.find((a) => a.id === selectedApp) || data.applications[0];

  const openJob = (job: RecordData) => setSelectedJob(job);

  const openTaskResult = (task: RecordData) => {
    setTasksOpen(false);

    const packageId =
      task.result?.packageId || task.packageId || task.payload?.packageId;

    if (packageId) {
      setSelectedPackage(packageId);
      setPackageJob(data.packages.find((p) => p.id === packageId)?.jobId || "");

      setRoute("Documents");

      return;
    }

    const jobId = task.result?.jobId;

    if (jobId) {
      const job = [...data.jobs, ...(data.jobHistory || [])].find(
        (j) => j.id === jobId,
      );

      setRoute("Discover");

      if (job) setSelectedJob(job);

      return;
    }

    if (task.payload?.applicationId) {
      setSelectedApp(task.payload.applicationId);

      setRoute("Apply");

      return;
    }

    setRoute(
      task.kind.startsWith("connector") && !task.result?.jobIds?.length
        ? "Connectors"
        : "Discover",
    );
  };

  const goDocs = (job: RecordData, pkgId?: string) => {
    setPackageJob(job.id);
    setSelectedPackage(
      pkgId || data.packages.find((p) => p.jobId === job.id)?.id || "",
    );

    setSelectedJob(null);

    setRoute("Documents");
  };

  const startApplication = async (job: RecordData, pkg?: string) => {
    const result = await call("application.start", {
      jobId: job.id,

      packageId: pkg,
    });

    if (result) {
      setSelectedApp(result.id);

      setSelectedJob(null);

      setRoute("Apply");
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <div className={"app " + (dark ? "dark" : "")}>
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">
              <SchoolOutlined />
            </span>

            <div>
              Academic<span>Apply</span>
              <small>YOUR NEXT CHAPTER</small>
            </div>
          </div>

          <div className="nav-label">WORKSPACE</div>

          <nav>
            {NAV.map(([name, Icon]) => (
              <button
                key={name}

                className={"nav-item " + (route === name ? "active" : "")}

                onClick={() => setRoute(name)}
              >
                <Icon fontSize="small" />

                <span>{name}</span>

                {name === "Apply" && data.applications.length > 0 && (
                  <small>{data.applications.length}</small>
                )}

                {name === "Activity" && activeTasks.length > 0 && (
                  <small>{activeTasks.length}</small>
                )}
              </button>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <div className="privacy-dot" />

            <span>
              Private by design<small>Stored on this computer</small>
            </span>
          </div>

          <button className="profile-mini" onClick={() => setRoute("Profile")}>
            <span className="avatar">
              {data.profile?.data.personal.name

                ?.split(" ")

                .filter((_: any, i: number) => i === 0)

                .map((s: string) => s[0]) || "A"}
            </span>

            <span>
              {data.profile?.data.personal.name

                ?.split(" ")

                .slice(-2)

                .join(" ") || "Your profile"}

              <small>
                {data.profile?.verified
                  ? "Verified candidate profile"
                  : "Set up your profile"}
              </small>
            </span>

            <MoreHorizRounded />
          </button>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              Workspace <span>/</span> <b>{route}</b>
            </div>

            <div className="top-actions">
              <span className="local-date">
                {new Date().toLocaleDateString("en-GB", {
                  timeZone: "Asia/Shanghai",

                  weekday: "short",

                  day: "numeric",

                  month: "short",
                })}
              </span>

              <Tooltip title="Activity and task queue">
                <Button
                  startIcon={<HistoryOutlined />}

                  onClick={() => {
                    setRoute("Activity");

                    setTasksOpen(false);
                  }}
                >
                  Activity{activeTasks.length ? ` (${activeTasks.length})` : ""}
                  {activeTasks.length > 0 && (
                    <span className="notification-dot" />
                  )}
                </Button>
              </Tooltip>

              <div className="header-divider" />

              <Tooltip title="Refresh workspace">
                <IconButton onClick={reload}>
                  <RefreshRounded fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Help &amp; About AcademicApply">
                <Button
                  size="small"
                  startIcon={<HelpOutlineRounded fontSize="small" />}
                  onClick={(e) => setHelpAnchor(e.currentTarget)}
                >
                  Help
                </Button>
              </Tooltip>

              <Menu
                anchorEl={helpAnchor}
                open={!!helpAnchor}
                onClose={() => setHelpAnchor(null)}
              >
                <MenuItem
                  onClick={() => {
                    setHelpAnchor(null);
                    setAboutOpen(true);
                  }}
                >
                  About AcademicApply (v{data.version})
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setHelpAnchor(null);
                    call("url.open", {
                      url: "https://github.com/Ahsan-Shehzad/academic-apply/releases",
                    });
                  }}
                >
                  View Releases on GitHub
                </MenuItem>
              </Menu>
            </div>
          </header>

          {busy && <LinearProgress className="top-progress" />}

          <main>
            <CompletionNotices
              data={data}
              open={(task) => {
                setSelectedTask(task.id);
                setTasksOpen(true);
              }}
            />
            {activeTasks.length > 0 && route !== "Activity" && (
              <button
                className="active-work-banner"

                onClick={() => setTasksOpen(true)}
              >
                <CircularProgress size={14} />

                <span>
                  {activeTasks.length} task{activeTasks.length === 1 ? "" : "s"}{" "}
                  active ·{" "}
                  {activeTasks.find((t) => t.status === "running")?.message ||
                    "Waiting to start"}
                </span>

                <b>View work log</b>
              </button>
            )}

            {route === "Discover" && (
              <WorkflowProgress
                data={data}

                kinds={[
                  "import",

                  "browser-import",

                  "search",

                  "ai-search",
                  "search-once",
                  "ai-search-once",
                  "connector-discovery",

                  "connector-search",
                ]}

                open={() => setTasksOpen(true)}
              />
            )}

            {route === "Documents" && (
              <WorkflowProgress
                data={data}

                kinds={["documents", "pdf"]}

                open={() => setTasksOpen(true)}
              />
            )}

            {route === "Activity" && (
              <Activity
                data={data}

                call={call}

                openResult={openTaskResult}

                initialTask={selectedTask}
              />
            )}

            {route === "Connectors" && (
              <Connectors data={data} call={call} busy={busy} />
            )}

            {route === "Dashboard" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      YOUR ACADEMIC CAREER, ORGANIZED
                    </div>

                    <h1>A clear path to your next role.</h1>

                    <p>
                      Find the right opportunities. Put your strongest evidence
                      forward.
                    </p>
                  </div>

                  <Button
                    variant="contained"

                    startIcon={<SearchRounded />}

                    onClick={() => setRoute("Discover")}
                  >
                    Discover opportunities
                  </Button>
                </div>

                {!data.profile && (
                  <div className="setup-banner">
                    <div className="setup-symbol">
                      <PersonOutline />
                    </div>

                    <div>
                      <b>Start with your academic story</b>

                      <p>
                        Import your profile and supporting materials to
                        personalize your search and documents.
                      </p>
                    </div>

                    <Button
                      variant="outlined"

                      onClick={() =>
                        call(
                          "profile.import",

                          {},

                          "Profile imported. Review the facts in Profile.",
                        )
                      }

                      endIcon={<ArrowForwardRounded />}
                    >
                      Import my profile
                    </Button>
                  </div>
                )}

                <div className="stats-grid">
                  <Stat
                    label="Opportunities found"

                    value={data.jobs.length}

                    detail="Across your search regions"

                    icon={TravelExploreOutlined}
                  />

                  <Stat
                    label="Strong matches"

                    value={strong.length}

                    detail="Aligned with your academic profile"

                    icon={AutoAwesomeOutlined}

                    color="purple"
                  />

                  <Stat
                    label="Closing soon"

                    value={closing.length}

                    detail="Deadlines within seven days"

                    icon={EventRepeatOutlined}

                    color="amber"
                  />

                  <Stat
                    label="Applications tracked"

                    value={data.applications.length}

                    detail={`${data.applications.filter((a) => a.status === "submitted").length} submitted`}

                    icon={SendOutlined}

                    color="blue"
                  />
                </div>

                <div className="dashboard-grid">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Your strongest opportunities</h2>

                        <p>Research alignment and teaching fit, explained.</p>
                      </div>

                      <button
                        className="text-link"

                        onClick={() => setRoute("Discover")}
                      >
                        View all <ArrowForwardRounded fontSize="small" />
                      </button>
                    </div>

                    {data.jobs.length ? (
                      <JobList
                        jobs={[...data.jobs]

                          .filter((j) => j.status !== "dismissed")

                          .sort((a, b) => b.match.score - a.match.score)

                          .slice(0, 5)}

                        onOpen={openJob}
                      />
                    ) : (
                      <Empty
                        title="Your shortlist starts here"

                        text="Search academic job boards and official university pages for opportunities that fit your work."

                        action={
                          <Button
                            onClick={() => setRoute("Discover")}

                            endIcon={<ArrowForwardRounded />}
                          >
                            Explore jobs
                          </Button>
                        }
                      />
                    )}
                  </section>

                  <div className="stack">
                    <section className="panel focus-card">
                      <span className="eyebrow">YOUR RESEARCH LENS</span>

                      <h2>
                        Speech. Cognition.
                        <br />
                        Meaningful impact.
                      </h2>

                      <p>
                        Prioritize speech AI, language, multimodal learning and
                        interpretable methods for cognitive health.
                      </p>

                      <div className="tag-row">
                        <Tag kind="teal">Speech AI</Tag>

                        <Tag kind="teal">NLP</Tag>

                        <Tag kind="teal">Brain health</Tag>
                      </div>

                      <button
                        className="text-link"

                        onClick={() => setRoute("Scheduler")}
                      >
                        Refine your searches{" "}
                        <NorthEastRounded fontSize="small" />
                      </button>
                    </section>

                    <section className="panel">
                      <div className="panel-heading compact">
                        <h2>Next scheduled search</h2>

                        <EventRepeatOutlined color="action" />
                      </div>

                      {data.searches

                        .filter((s) => s.enabled)

                        .sort(
                          (a, b) =>
                            Date.parse(a.nextRun) - Date.parse(b.nextRun),
                        )

                        .slice(0, 1)

                        .map((s) => (
                          <div className="schedule-preview" key={s.id}>
                            <b>{fmt(s.nextRun)}</b>

                            <p>{s.name}</p>

                            <small>
                              {s.time} · {s.timezone}
                            </small>
                          </div>
                        ))}

                      <div className="panel-footer">
                        <span
                          className={
                            "status-dot " +
                            (data.settings.schedulerInstalled
                              ? "green"
                              : "amber")
                          }
                        />

                        {data.settings.schedulerInstalled
                          ? "Windows background scheduling enabled"
                          : "Background scheduling not installed"}

                        <button
                          className="text-link"

                          onClick={() => setRoute("Scheduler")}
                        >
                          Manage
                        </button>
                      </div>
                    </section>
                  </div>
                </div>

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>A workflow you can follow</h2>

                      <p>Every application has a clear next step.</p>
                    </div>
                  </div>

                  <div className="workflow-strip">
                    {[
                      [
                        "01",

                        "Discover",

                        "Find and verify positions",

                        "Discover",
                      ],

                      [
                        "02",

                        "Prepare",

                        "Build a tailored document package",

                        "Documents",
                      ],

                      [
                        "03",

                        "Review & apply",

                        "Complete forms with your approval",

                        "Apply",
                      ],

                      [
                        "04",

                        "Track",

                        "Keep outcomes and evidence together",

                        "Reports",
                      ],
                    ].map(([n, title, text, destination]) => (
                      <button key={n} onClick={() => setRoute(destination)}>
                        <span>{n}</span>

                        <div>
                          <b>{title}</b>

                          <p>{text}</p>
                        </div>

                        <ArrowForwardRounded />
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}

            {route === "Discover" && (
              <Discover
                data={data}

                call={call}

                openJob={openJob}

                addJob={() => setAddJob(true)}
                newSearch={() => setSearchEditor(newSearch(data))}

                busy={busy}
              />
            )}

            {route === "Scheduler" && (
              <>
                <PageHeading
                  title="Let opportunities come to you."

                  subtitle="Saved searches, weekly discovery and a shortlist worth reading."

                  action={
                    <Button
                      variant="contained"

                      startIcon={<AddRounded />}

                      onClick={() => setSearchEditor(newSearch(data, true))}
                    >
                      New search
                    </Button>
                  }
                />

                <div className="setup-banner">
                  <EventRepeatOutlined color="primary" />

                  <div>
                    <b>
                      {data.settings.schedulerInstalled
                        ? "Weekly discovery is connected to Windows"
                        : "Keep discovery running when the app is closed"}
                    </b>

                    <p>
                      Due searches are checked every 30 minutes and at sign-in.
                      Missed searches catch up when your computer is available.
                    </p>
                  </div>

                  <Button
                    variant="outlined"

                    disabled={!!busy}

                    onClick={() =>
                      call(
                        data.settings.schedulerInstalled
                          ? "scheduler.remove"
                          : "scheduler.install",
                      )
                    }
                  >
                    {data.settings.schedulerInstalled
                      ? "Disable background task"
                      : "Enable background task"}
                  </Button>
                </div>

                <div className="search-cards">
                  {data.searches.map((s) => (
                    <section className="panel search-card" key={s.id}>
                      <div className="flex-between">
                        <span className="icon-tile">
                          <TravelExploreOutlined />
                        </span>

                        <Switch
                          checked={s.enabled}

                          onChange={(_, enabled) =>
                            call("search.save", { search: { ...s, enabled } })
                          }
                        />
                      </div>

                      <h2>{s.name}</h2>

                      <p>
                        {s.countries.length} countries · {s.roles.join(", ")}
                      </p>

                      <div className="tag-row">
                        {s.keywords

                          .split(",")

                          .slice(0, 4)

                          .map((k: string) => (
                            <Tag key={k}>{k.trim()}</Tag>
                          ))}
                      </div>

                      <div className="search-schedule">
                        <EventRepeatOutlined fontSize="small" />

                        <span>
                          {
                            [
                              "Sunday",

                              "Monday",

                              "Tuesday",

                              "Wednesday",

                              "Thursday",

                              "Friday",

                              "Saturday",
                            ][s.day]
                          }{" "}
                          at {s.time}
                          <small>
                            {s.timezone} · next {fmt(s.nextRun)}
                          </small>
                        </span>
                      </div>

                      <div className="card-actions">
                        <Button
                          size="small"

                          startIcon={<PlayArrowRounded />}

                          disabled={!!busy}

                          onClick={() =>
                            call(
                              "search.run",

                              { id: s.id },

                              "Search queued. Follow progress in Activity.",
                            )
                          }
                        >
                          Run now
                        </Button>

                        <Button size="small" onClick={() => setSearchEditor(s)}>
                          Edit search
                        </Button>

                        <Tooltip title="Delete saved search">
                          <IconButton
                            size="small"

                            onClick={() => call("search.delete", { id: s.id })}
                          >
                            <CloseRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </div>
                    </section>
                  ))}
                </div>

                <SourceHealth data={data} call={call} />
              </>
            )}

            {route === "Documents" && (
              <DocumentsScreen
                data={data}

                call={call}

                busy={busy}

                jobId={documentJobId}

                setJobId={setPackageJob}

                pkg={currentPackage}

                setPackage={setSelectedPackage}

                apply={startApplication}
                edit={(pkg, doc) => setDocEditor({ pkg, doc })}
              />
            )}

            {route === "Apply" && (
              <>
                <PageHeading
                  title="Apply with your AI assistant."

                  subtitle="Prepare in Chrome, review the complete package, and submit with confidence."
                />

                <ApplyStart
                  key={currentApp?.id || "new"}
                  application={currentApp}
                  data={data}
                  busy={busy}
                  start={startApplication}
                  prepare={goDocs}
                />
                <div className="application-layout">
                  <section className="panel application-list">
                    <div className="panel-heading compact">
                      <h2>Application pipeline</h2>

                      <Tag>{data.applications.length}</Tag>
                    </div>

                    {data.applications.length ? (
                      data.applications.map((a) => {
                        const j = [
                          ...data.jobs,
                          ...(data.jobHistory || []),
                        ].find((j) => j.id === a.jobId);

                        return (
                          <button
                            key={a.id}

                            className={
                              "application-item " +
                              (currentApp?.id === a.id ? "selected" : "")
                            }

                            onClick={() => setSelectedApp(a.id)}
                          >
                            <span className="institution-mark">
                              {j?.institution?.[0] || "U"}
                            </span>

                            <div>
                              <b>{j?.title || "Application"}</b>

                              <p>{j?.institution}</p>

                              <Tag
                                kind={
                                  a.status === "submitted"
                                    ? "teal"
                                    : a.status === "submission_uncertain"
                                      ? "amber"
                                      : "neutral"
                                }
                              >
                                {STATUS[a.status] || a.status}
                              </Tag>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <Empty
                        icon={SendOutlined}

                        title="Your next application"

                        text="Open a job in Discover and choose Apply to begin."

                        action={
                          <Button onClick={() => setRoute("Discover")}>
                            Find an opportunity
                          </Button>
                        }
                      />
                    )}
                  </section>

                  {currentApp ? (
                    <ApplicationPanel
                      application={currentApp}

                      data={data}

                      call={call}

                      busy={busy}

                      onReview={() => setReview(currentApp)}

                      onSuggestions={setSuggestions}

                      onMail={setMail}
                    />
                  ) : (
                    <section className="panel application-intro">
                      <div className="orbit-icon">
                        <SendOutlined />
                      </div>

                      <h2>
                        Assistance where it helps.
                        <br />
                        Control where it matters.
                      </h2>

                      <p>
                        The workspace reads your form, fills verified details,
                        uploads your package and pauses for your final review.
                      </p>

                      <div className="tag-row">
                        <Tag>Chrome sessions</Tag>

                        <Tag>Manual takeover</Tag>

                        <Tag>Submission evidence</Tag>
                      </div>
                    </section>
                  )}
                </div>
              </>
            )}

            {route === "Apply" && (
              <details
                className="panel padded integrated-research"

                open={browserResearchOpen}

                onToggle={(e) => setBrowserResearchOpen(e.currentTarget.open)}
              >
                <summary>Research listings in Chrome</summary>

                <BrowserWorkspace
                  data={data}

                  call={call}

                  busy={busy}

                  embedded
                />
              </details>
            )}

            {route === "Profile" && (
              <Profile data={data} call={call} busy={busy} />
            )}

            {route === "Reports" && <Reports data={data} call={call} />}

            {route === "Settings" && (
              <Settings data={data} call={call} busy={busy} />
            )}

            <footer className="workspace-footer">
              <span>AcademicApply {data.version}</span>

              <span>Purposeful applications. Evidence-led decisions.</span>
            </footer>
          </main>
        </div>

        <Drawer
          anchor="right"

          open={!!selectedJob}

          onClose={() => setSelectedJob(null)}

          slotProps={{ paper: { sx: { width: 660, maxWidth: "90vw" } } }}
        >
          {selectedJob && (
            <JobDetail
              job={
                [...data.jobs, ...(data.jobHistory || [])].find(
                  (j) => j.id === selectedJob.id,
                ) || selectedJob
              }

              data={data}

              call={call}

              close={() => setSelectedJob(null)}

              docs={goDocs}

              apply={startApplication}

              busy={busy}
            />
          )}
        </Drawer>

        <Drawer
          anchor="right"

          open={tasksOpen}

          onClose={() => setTasksOpen(false)}

          slotProps={{ paper: { sx: { width: 700, maxWidth: "95vw" } } }}
        >
          <div className="drawer-head">
            <div>
              <h2>Activity</h2>

              <p>Live work logs and results.</p>
            </div>

            <IconButton onClick={() => setTasksOpen(false)}>
              <CloseRounded />
            </IconButton>
          </div>

          <div className="drawer-body">
            <Activity
              data={data}

              call={call}

              openResult={openTaskResult}

              initialTask={selectedTask}

              compact
            />

            <Button
              sx={{ mt: 2 }}

              onClick={() => {
                setTasksOpen(false);

                setRoute("Activity");
              }}
            >
              Open full Activity screen
            </Button>
          </div>
        </Drawer>

        <AddJobDialog
          open={addJob}

          close={() => setAddJob(false)}

          call={call}

          countries={Object.values(data.countries).flat()}
        />

        {searchEditor && (
          <AdvancedSearch
            search={searchEditor}
            data={data}
            call={call}
            busy={busy}
            close={() => setSearchEditor(null)}
            submit={async (search, action) => {
              if (action === "run") {
                const task = await call(
                  "search.execute",
                  { search },
                  "Advanced search queued. Follow progress in Activity.",
                );
                if (task) {
                  setSearchEditor(null);
                  setRoute("Discover");
                }
              } else {
                const saved = await call(
                  "search.save",
                  { search },
                  "Search saved.",
                );
                if (saved) {
                  setSearchEditor(null);
                  if (action === "save-run") {
                    setRoute("Discover");
                    await call("search.run", { id: saved.id });
                  }
                }
              }
            }}
          />
        )}

        {docEditor && (
          <DocumentEditor
            value={docEditor}

            close={() => setDocEditor(null)}

            save={async (content) => {
              if (
                await call(
                  "package.edit",

                  {
                    packageId: docEditor.pkg.id,

                    documentId: docEditor.doc.id,

                    content,
                  },

                  "Document updated. Re-export PDF before approval.",
                )
              )
                setDocEditor(null);
            }}
          />
        )}

        {review && (
          <ReviewDialog
            application={
              data.applications.find((a) => a.id === review.id) || review
            }

            data={data}

            close={() => setReview(null)}

            call={call}

            busy={busy}
          />
        )}

        {suggestions && (
          <SuggestionsDialog
            suggestions={suggestions}

            close={() => setSuggestions(null)}

            apply={async (answers) => {
              if (
                await call(
                  "application.fillSuggestions",

                  { id: currentApp.id, answers },

                  "Selected suggestions filled. Inspect the current form.",
                )
              )
                setSuggestions(null);
            }}
          />
        )}

        <Dialog
          open={!!mail}

          onClose={() => setMail(null)}

          maxWidth="md"

          fullWidth
        >
          <DialogTitle>Application email</DialogTitle>

          <DialogContent>
            <Alert severity="info">
              {mail?.note || "Complete verification in Chrome."}
            </Alert>

            <pre className="mail-preview">{mail?.message}</pre>
          </DialogContent>

          <DialogActions>
            <Button onClick={() => setMail(null)}>Close</Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={aboutOpen}
          onClose={() => setAboutOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>About AcademicApply</DialogTitle>
          <DialogContent>
            <div className="form-stack">
              <p>
                <b>AcademicApply</b> · Version <b>{data.version}</b>
              </p>
              <p className="muted">
                Private academic job discovery and application workspace.
              </p>
              {data.appInfo && (
                <small>
                  Electron {data.appInfo.electron} · Chromium{" "}
                  {data.appInfo.chrome} · Node.js {data.appInfo.node} ·{" "}
                  {data.appInfo.platform}
                </small>
              )}
              <small>
                Chrome integration:{" "}
                {data.chromeInstalled ? "Google Chrome detected" : "Chrome not found"}
              </small>
              <small>Workspace data: {data.dataRoot}</small>
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              startIcon={<ContentCopyOutlined fontSize="small" />}
              onClick={() => {
                const lines = [
                  `AcademicApply v${data.version}`,
                  data.appInfo
                    ? `Electron ${data.appInfo.electron} / Chromium ${data.appInfo.chrome} / Node ${data.appInfo.node} (${data.appInfo.platform})`
                    : "",
                ]
                  .filter(Boolean)
                  .join("\n");
                navigator.clipboard?.writeText(lines);
                setToast({ text: "Version details copied to clipboard." });
              }}
            >
              Copy version info
            </Button>
            <Button
              onClick={() =>
                call("url.open", {
                  url: "https://github.com/Ahsan-Shehzad/academic-apply/releases",
                })
              }
            >
              GitHub Releases
            </Button>
            <Button variant="contained" onClick={() => setAboutOpen(false)}>
              Close
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={!!toast}

          autoHideDuration={toast?.error ? 12000 : 6000}

          onClose={() => setToast(null)}

          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert
            onClose={() => setToast(null)}

            severity={toast?.error ? "error" : "success"}

            variant="filled"

            sx={{ maxWidth: 650 }}
          >
            {toast?.text}
          </Alert>
        </Snackbar>
      </div>
    </ThemeProvider>
  );
}

type Call = (
  method: string,

  args?: RecordData,

  message?: string,
) => Promise<any>;

function PageHeading({
  title,

  subtitle,

  action,
}: {
  title: string;

  subtitle: string;

  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>

        <p>{subtitle}</p>
      </div>

      {action}
    </div>
  );
}

function JobList({
  jobs,

  onOpen,

  call,
  onDelete,
}: {
  call?: (method: string, args?: RecordData) => Promise<any>;

  onDelete?: (job: RecordData) => void;

  jobs: RecordData[];

  onOpen: (job: RecordData) => void;
}) {
  return (
    <div className="job-list">
      {jobs.map((job) => (
        <article key={job.id} className="job-listing">
          <button className="job-row" onClick={() => onOpen(job)}>
            <span className="institution-mark">
              {job.institution.replace(/^University of /, "")[0]}
            </span>

            <div className="job-row-title">
              <b>{job.title}</b>

              <p>
                {job.institution} <span>·</span> {job.country}
              </p>

              <div className="tag-row">
                <Tag kind={job.match.score >= 70 ? "teal" : "neutral"}>
                  {job.match.score}% match
                </Tag>

                <Tag>{STATUS[job.status] || job.status}</Tag>

                {job.pinned && <Tag kind="teal">Pinned</Tag>}

                {job.official && (
                  <span className="verified-caption">
                    <VerifiedOutlined sx={{ fontSize: 13 }} />
                    Employer source
                  </span>
                )}
              </div>
            </div>

            <div className="job-row-deadline">
              <small>APPLICATION DEADLINE</small>

              <span className={deadline(job).kind}>{deadline(job).label}</span>
            </div>

            <NorthEastRounded fontSize="small" className="muted" />
          </button>

          {call && (
            <div className="listing-actions">
              <Rating
                name={`personal-rating-${job.id}`}
                value={job.personalRating || 0}
                onChange={(_, value) =>
                  call("jobs.update", {
                    id: job.id,
                    changes: { personalRating: value || 0 },
                  })
                }
              />

              <small>Your rating</small>

              <Button
                size="small"
                onClick={() =>
                  call("jobs.update", {
                    id: job.id,
                    changes: { pinned: !job.pinned },
                  })
                }
              >
                {job.pinned ? "Unpin" : "Pin"}
              </Button>

              <Button
                size="small"
                onClick={() =>
                  call("jobs.update", {
                    id: job.id,
                    changes: {
                      status:
                        job.status === "shortlisted"
                          ? "discovered"
                          : "shortlisted",
                    },
                  })
                }
              >
                {job.status === "shortlisted" ? "Unshortlist" : "Shortlist"}
              </Button>

              <Button
                size="small"
                onClick={() =>
                  call("jobs.update", {
                    id: job.id,
                    changes: {
                      status:
                        job.status === "dismissed" ? "discovered" : "dismissed",
                    },
                  })
                }
              >
                {job.status === "dismissed" ? "Restore" : "Dismiss"}
              </Button>

              <Button
                size="small"
                onClick={() =>
                  call("browser.open", { url: job.applicationUrl || job.url })
                }
              >
                Open listing
              </Button>

              <Button
                size="small"
                color="error"
                onClick={() => onDelete?.(job)}
              >
                Delete
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function Discover({
  data,

  call,

  openJob,

  addJob,
  newSearch,

  busy,
}: {
  data: Snapshot;

  call: Call;

  openJob: (job: RecordData) => void;

  addJob: () => void;
  newSearch: () => void;

  busy: string;
}) {
  const [view, setView] = useState("listings");
  const [query, setQuery] = useState(""),
    [selectedCountries, setSelectedCountries] = useState<string[] | null>(null),
    [countryGroup, setCountryGroup] = useState(""),
    [country, setCountry] = useState("all"),
    [status, setStatus] = useState("all"),
    [sort, setSort] = useState("match"),
    [ratingFilter, setRatingFilter] = useState("all"),
    [deleting, setDeleting] = useState<RecordData | "all" | null>(null),
    [searchId, setSearchId] = useState("");

  const jobs = data.jobs

    .filter(
      (j) =>
        (ratingFilter === "all" ||
          (ratingFilter === "unrated"
            ? !j.personalRating
            : (j.personalRating || 0) >= Number(ratingFilter))) &&
        (country === "all" || j.country === country) &&
        (selectedCountries === null || selectedCountries.includes(j.country)) &&
        (status === "all" ? j.status !== "dismissed" : j.status === status) &&
        `${j.title} ${j.institution} ${j.country} ${j.focus} ${j.personalNotes || ""}`

          .toLowerCase()

          .includes(query.toLowerCase()),
    )

    .sort(
      (a, b) =>
        Number(b.pinned || false) - Number(a.pinned || false) ||
        (sort === "rating"
          ? (b.personalRating || 0) - (a.personalRating || 0)
          : sort === "institution"
            ? a.institution.localeCompare(b.institution)
            : sort === "country"
              ? a.country.localeCompare(b.country)
              : sort === "updated"
                ? Date.parse(b.lastSeen) - Date.parse(a.lastSeen)
                : sort === "deadline"
                  ? (Date.parse(a.deadline) || Infinity) -
                    (Date.parse(b.deadline) || Infinity)
                  : sort === "newest"
                    ? Date.parse(b.firstSeen) - Date.parse(a.firstSeen)
                    : b.match.score - a.match.score),
    );

  const selectedSearch = searchId || data.searches[0]?.id;

  return (
    <>
      <PageHeading
        title="Find where your work belongs."

        subtitle="Academic opportunities, ranked around your research and teaching strengths."

        action={
          <div className="tag-row">
            <Button
              variant="outlined"
              startIcon={<AddRounded />}
              onClick={addJob}
            >
              Add a job
            </Button>
            <Button
              variant="contained"
              startIcon={<SearchRounded />}
              onClick={newSearch}
            >
              New search
            </Button>
          </div>
        }
      />

      <section className="panel discovery-controls">
        <div className="discovery-search">
          <FieldSelect
            label="Saved search"

            value={selectedSearch || ""}

            onChange={(id) => {
              setSearchId(id);

              setSelectedCountries(null);

              setCountryGroup("");
            }}

            options={data.searches.map((s) => ({ value: s.id, label: s.name }))}
          />

          <Button
            variant="contained"

            startIcon={<SearchRounded />}

            disabled={
              !!busy || !selectedSearch || selectedCountries?.length === 0
            }

            onClick={() =>
              call(
                "search.run",

                {
                  id: selectedSearch,

                  countries: selectedCountries || undefined,
                },

                "Discovery queued. View Activity for progress.",
              )
            }
          >
            Search sources
          </Button>

          <Button
            variant="outlined"

            startIcon={<AutoAwesomeOutlined />}

            disabled={
              !!busy ||
              !selectedSearch ||
              !data.settings.cloudConsent ||
              selectedCountries?.length === 0
            }

            onClick={() =>
              call(
                "search.run",

                {
                  id: selectedSearch,

                  ai: true,

                  countries: selectedCountries || undefined,
                },

                "AI discovery queued. Returned URLs will be verified.",
              )
            }
          >
            AI discovery
          </Button>
        </div>

        <div className="discovery-country-scope">
          <FieldSelect
            label="Country group"

            value={countryGroup}

            onChange={(id) => {
              setCountryGroup(id);

              setSelectedCountries(
                data.countryGroups?.find((g) => g.id === id)?.countries || null,
              );

              setCountry("all");
            }}

            options={[
              { value: "", label: "Saved search countries" },

              { value: "custom", label: "Custom selection" },

              ...(data.countryGroups || []).map((g) => ({
                value: g.id,

                label: g.label + " (" + g.countries.length + ")",
              })),
            ]}
          />

          <Autocomplete
            multiple

            options={Object.values(data.countries).flat()}

            value={
              selectedCountries ||
              data.searches.find((s) => s.id === selectedSearch)?.countries ||
              []
            }

            onChange={(_, v) => {
              setSelectedCountries(v);

              setCountryGroup("custom");
            }}

            renderInput={(params) => (
              <TextField {...params} label="Search countries" />
            )}
          />

          <Button
            disabled={!!busy || !selectedCountries?.length}

            onClick={() => {
              const search = data.searches.find((s) => s.id === selectedSearch);

              if (search)
                call(
                  "search.save",

                  { search: { ...search, countries: selectedCountries } },

                  "Country selection saved for discovery and scheduled searches.",
                );
            }}
          >
            Save countries to search
          </Button>
        </div>

        <div className="filter-row">
          <TextField
            placeholder="Search jobs, institutions or research topics"

            value={query}

            onChange={(e) => setQuery(e.target.value)}

            slotProps={{
              input: {
                startAdornment: (
                  <SearchRounded color="action" sx={{ mr: 1, fontSize: 20 }} />
                ),
              },
            }}
          />

          <FieldSelect
            label="Country"

            value={country}

            onChange={setCountry}

            options={[
              { value: "all", label: "All countries" },

              ...Object.values(data.countries).flat(),
            ]}
          />

          <FieldSelect
            label="Stage"

            value={status}

            onChange={setStatus}

            options={[
              { value: "all", label: "All opportunities" },

              { value: "shortlisted", label: "Shortlisted" },

              { value: "discovered", label: "New discoveries" },

              { value: "preparing", label: "Preparing" },

              { value: "dismissed", label: "Dismissed" },

              { value: "closed", label: "Closed" },
            ]}
          />

          <FieldSelect
            label="Sort"

            value={sort}

            onChange={setSort}

            options={[
              { value: "match", label: "Best match" },

              { value: "deadline", label: "Closing first" },

              { value: "newest", label: "Newest discoveries" },

              { value: "rating", label: "My highest rating" },

              { value: "institution", label: "Institution A–Z" },

              { value: "country", label: "Country A–Z" },

              { value: "updated", label: "Recently checked" },
            ]}
          />
        </div>
      </section>

      <div
        className="tag-row discovery-views"
        role="tablist"
        aria-label="Discovery results"
      >
        <Button
          role="tab"
          aria-selected={view === "listings"}
          variant={view === "listings" ? "contained" : "outlined"}
          onClick={() => setView("listings")}
        >
          Full listings ({jobs.length})
        </Button>
        <Button
          role="tab"
          aria-selected={view === "candidates"}
          variant={view === "candidates" ? "contained" : "outlined"}
          onClick={() => setView("candidates")}
        >
          Needs detail review (
          {data.candidates?.filter((c) =>
            ["pending", "needs_review"].includes(c.status),
          ).length || 0}
          )
        </Button>
      </div>
      {view === "candidates" ? (
        <SearchCandidates
          data={data}
          call={call}
          openJob={openJob}
          query={query}
          countries={selectedCountries}
        />
      ) : (
        <>
          <div className="section-label">
            <b>{jobs.length} opportunities</b>

            <div className="tag-row">
              <FieldSelect
                label="My rating"
                value={ratingFilter}
                onChange={setRatingFilter}
                options={[
                  { value: "all", label: "Any rating" },
                  { value: "4", label: "4 stars and above" },
                  { value: "1", label: "Rated" },
                  { value: "unrated", label: "Unrated" },
                ]}
              />

              <small>Pinned listings first</small>
              <Button
                color="error"
                disabled={!!busy || !data.jobs.length}
                onClick={() => setDeleting("all")}
              >
                Reset all listings ({data.jobs.length})
              </Button>
            </div>
          </div>

          <section className="panel">
            {jobs.length ? (
              <JobList
                jobs={jobs}
                onOpen={openJob}
                call={call}
                onDelete={setDeleting}
              />
            ) : (
              <Empty
                title="Discover your next opportunity"

                text="Run a saved search, use AI discovery, or import a listing you already have. Source coverage and errors remain visible."

                action={
                  <Button
                    variant="contained"

                    startIcon={<AddRounded />}

                    onClick={addJob}
                  >
                    Import a listing
                  </Button>
                }
              />
            )}
          </section>
        </>
      )}
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {deleting === "all"
            ? `Delete all ${data.jobs.length} listings?`
            : "Delete this listing?"}
        </DialogTitle>

        <DialogContent>
          <p>{deleting !== "all" && deleting?.title}</p>
          <p>
            This removes{" "}
            {deleting === "all"
              ? "every listing, including hidden and dismissed listings"
              : "this listing"}{" "}
            from Discover. A local database backup is saved. Existing submission
            packages and application history retain their listing context.
            Future searches may discover deleted positions again.
          </p>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={!!busy}
            onClick={async () => {
              const result = await call(
                deleting === "all" ? "jobs.reset" : "jobs.delete",
                deleting === "all" ? {} : { id: (deleting as RecordData).id },
              );
              if (result) setDeleting(null);
            }}
          >
            Delete {deleting === "all" ? "all listings" : "listing"}
          </Button>
        </DialogActions>
      </Dialog>

      <SourceHealth data={data} call={call} />
    </>
  );
}

function SourceHealth({ data, call }: { data: Snapshot; call: Call }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="panel source-panel">
      <button className="source-heading" onClick={() => setExpanded(!expanded)}>
        <div>
          <h2>Source coverage</h2>

          <p>
            {data.sources.filter((s) => s.status === "available").length}{" "}
            available ·{" "}
            {
              data.sources.filter((s) =>
                [
                  "unavailable",
                  "needs_browser",
                  "manual",
                  "configuration_required",
                ].includes(s.status),
              ).length
            }{" "}
            need attention · {data.sources.filter((s) => !s.status).length} not
            checked
          </p>
        </div>

        <KeyboardArrowDownRounded
          sx={{ transform: expanded ? "rotate(180deg)" : "" }}
        />
      </button>

      {expanded && (
        <div className="source-grid">
          {data.sources.map((s) => (
            <div className="source-item" key={s.id}>
              <div className="flex-between">
                <b>{s.name}</b>

                <IconButton
                  size="small"

                  onClick={() => call("url.open", { url: s.base })}
                >
                  <OpenInNewRounded sx={{ fontSize: 16 }} />
                </IconButton>
              </div>

              <small>{s.countries?.join(", ") || s.region}</small>

              <Tag
                kind={
                  s.status === "available"
                    ? "teal"
                    : s.status
                      ? "amber"
                      : "neutral"
                }
              >
                {s.status?.replace("_", " ") || "Not checked"}
              </Tag>

              <p>
                {s.message ||
                  "Will be checked during discovery. Access restrictions and unreadable pages are reported here."}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function JobDetail({
  job,

  data,

  call,

  close,

  docs,

  apply,

  busy,
}: {
  job: RecordData;

  data: Snapshot;

  call: Call;

  close: () => void;

  docs: (job: RecordData) => void;

  apply: (job: RecordData, pkg?: string) => void;

  busy: string;
}) {
  const [pkg, setPkg] = useState(""),
    [editing, setEditing] = useState(false),
    [changes, setChanges] = useState<RecordData>({
      institution: job.institution,

      country: job.country,

      deadline: job.deadline?.slice(0, 10) || "",

      deadlineText: job.deadlineText,

      applicationUrl: job.applicationUrl,

      eligibility: job.eligibility,

      requiredDocuments: job.requiredDocuments,
    });

  return (
    <>
      <div className="drawer-head">
        <span className="eyebrow">OPPORTUNITY DETAILS</span>

        <IconButton onClick={close}>
          <CloseRounded />
        </IconButton>
      </div>

      <div className="drawer-body job-detail">
        <div className="tag-row">
          <Tag kind={job.match.score >= 70 ? "teal" : "neutral"}>
            {job.match.score}% match
          </Tag>

          <Tag>{STATUS[job.status] || job.status}</Tag>
        </div>

        <h1>{job.title}</h1>

        <div className="tag-row">
          <Rating
            aria-label="My personal rating"
            value={job.personalRating || 0}
            onChange={(_, value) =>
              call("jobs.update", {
                id: job.id,
                changes: { personalRating: value || 0 },
              })
            }
          />
          <small>Your rating</small>
        </div>

        <TextField
          key={job.id + "-notes"}
          label="Personal notes"
          multiline
          minRows={2}
          fullWidth
          defaultValue={job.personalNotes || ""}
          onBlur={(e) => {
            if (e.target.value !== (job.personalNotes || ""))
              call("jobs.update", {
                id: job.id,
                changes: { personalNotes: e.target.value },
              });
          }}
          inputProps={{ maxLength: 5000 }}
        />

        <h3>{job.institution}</h3>

        <p className="muted">
          {job.country} · {job.source}
        </p>

        {!!job.detailCoverage?.notes?.length && <Alert severity="info">Full description retrieved. Please confirm: {job.detailCoverage.notes.join(' ')}</Alert>}
        <div className="detail-meta">
          <div>
            <small>DEADLINE</small>

            <b className={deadline(job).kind}>{deadline(job).label}</b>

            <span>{job.deadlineTimezone}</span>
          </div>

          <div>
            <small>FIRST DISCOVERED</small>

            <b>{fmt(job.firstSeen)}</b>

            <span>Last checked {fmt(job.lastSeen)}</span>
          </div>
        </div>

        <div className="detail-actions">
          <Button
            variant="contained"

            startIcon={<CheckRounded />}

            onClick={() =>
              call("jobs.update", {
                id: job.id,

                changes: {
                  status:
                    job.status === "shortlisted" ? "discovered" : "shortlisted",
                },
              })
            }
          >
            {job.status === "shortlisted" ? "Shortlisted" : "Shortlist"}
          </Button>

          {job.verification?.status === "ai_reported" && (
            <Alert severity="warning">
              Provider-retrieved listing. Check its official source before
              submitting.
              <Button
                onClick={() =>
                  call(
                    "jobs.verify",

                    { id: job.id },

                    "Official listing review recorded.",
                  )
                }
              >
                I checked the official listing
              </Button>
            </Alert>
          )}

          <Button
            variant="outlined"

            startIcon={<OpenInNewRounded />}

            onClick={() => call("url.open", { url: job.url })}
          >
            View listing
          </Button>

          <IconButton onClick={() => setEditing(!editing)}>
            <EditOutlined />
          </IconButton>
        </div>

        <FormControlLabel
          control={
            <Checkbox
              checked={job.official}

              onChange={(_, official) =>
                call("jobs.update", { id: job.id, changes: { official } })
              }
            />
          }

          label="Employer source verified against the official listing"
        />

        <section className="detail-section">
          <h2>Why this could fit</h2>

          {job.match.reasons.map((r: string) => (
            <p className="check-line" key={r}>
              <CheckRounded fontSize="small" />

              {r}
            </p>
          ))}

          {!job.match.reasons.length && (
            <p>
              No specialist alignment detected. Read the listing before
              shortlisting.
            </p>
          )}

          {job.match.gaps.map((g: string) => (
            <p className="gap-line" key={g}>
              <WarningAmberRounded sx={{ fontSize: 16 }} />

              {g}
            </p>
          ))}
        </section>

        {editing ? (
          <section className="stack">
            <TextField
              label="Institution"

              value={changes.institution}

              onChange={(e) =>
                setChanges({ ...changes, institution: e.target.value })
              }
            />

            <FieldSelect
              label="Country"

              value={changes.country}

              onChange={(country) => setChanges({ ...changes, country })}

              options={["Unknown", ...Object.values(data.countries).flat()]}
            />

            <TextField
              label="Deadline date"

              type="date"

              value={changes.deadline}

              onChange={(e) =>
                setChanges({ ...changes, deadline: e.target.value })
              }

              slotProps={{ inputLabel: { shrink: true } }}
            />

            <TextField
              label="Advertised deadline wording"

              value={changes.deadlineText}

              onChange={(e) =>
                setChanges({ ...changes, deadlineText: e.target.value })
              }
            />

            <TextField
              label="Official application link"

              value={changes.applicationUrl}

              onChange={(e) =>
                setChanges({ ...changes, applicationUrl: e.target.value })
              }
            />

            <TextField
              label="Eligibility requirements"

              multiline

              minRows={4}

              value={changes.eligibility}

              onChange={(e) =>
                setChanges({ ...changes, eligibility: e.target.value })
              }
            />

            <Autocomplete
              multiple

              freeSolo

              options={data.documentTypes}

              value={changes.requiredDocuments}

              onChange={(_, requiredDocuments) =>
                setChanges({ ...changes, requiredDocuments })
              }

              renderInput={(params) => (
                <TextField {...params} label="Required documents" />
              )}
            />

            <Button
              variant="contained"

              onClick={async () => {
                if (
                  await call(
                    "jobs.update",

                    {
                      id: job.id,

                      changes: {
                        ...changes,

                        deadline: changes.deadline || null,
                      },
                    },

                    "Listing facts updated.",
                  )
                )
                  setEditing(false);
              }}
            >
              Save listing facts
            </Button>
          </section>
        ) : (
          <>
            <section className="detail-section">
              <h2>Research focus</h2>

              <p>{job.focus || "Read the listing for research details."}</p>
            </section>

            <section className="detail-section">
              <h2>Eligibility and expectations</h2>

              <p className="preserve">{job.eligibility}</p>
            </section>

            <section className="detail-section">
              <h2>Required documents</h2>

              <div className="tag-row">
                {job.requiredDocuments.length ? (
                  job.requiredDocuments.map((d: string) => (
                    <Tag key={d}>{d}</Tag>
                  ))
                ) : (
                  <p>Not identified. Check the official listing and portal.</p>
                )}
              </div>

              <Button
                startIcon={<AutoAwesomeOutlined />}

                disabled={!!busy || !data.settings.cloudConsent}

                onClick={() =>
                  call(
                    "jobs.enrich",

                    { id: job.id },

                    "Requirements extraction queued.",
                  )
                }
              >
                Extract requirements with AI
              </Button>
            </section>

            <details className="listing-text">
              <summary>Read extracted listing</summary>

              <p>{job.description}</p>
            </details>
          </>
        )}

        <section className="application-box">
          <h2>Move this opportunity forward</h2>

          <p>
            Prepare a tailored package, then complete the portal in a visible
            Chrome session.
          </p>

          <Button
            variant="outlined"

            fullWidth

            startIcon={<DescriptionOutlined />}

            onClick={() => docs(job)}
          >
            Prepare documents
          </Button>

          <div className="spacer" />

          <FieldSelect
            label="Submission package"

            value={pkg}

            onChange={setPkg}

            options={[
              { value: "", label: "Automatically select a matching package" },

              ...data.packages

                .filter((p) => p.jobId === job.id)

                .map((p) => ({
                  value: p.id,

                  label: packageLabel(p),
                })),
            ]}
          />

          <Button
            sx={{ mt: 1.5 }}

            variant="contained"

            fullWidth

            startIcon={<SendOutlined />}

            disabled={!!busy || job.status === "closed"}

            onClick={() => apply(job, pkg || undefined)}
          >
            Apply with assistance
          </Button>
        </section>
      </div>
    </>
  );
}

function AddJobDialog({
  open,

  close,

  call,

  countries,
}: {
  open: boolean;

  close: () => void;

  call: Call;

  countries: string[];
}) {
  const [manual, setManual] = useState(false),
    [url, setUrl] = useState(""),
    [form, setForm] = useState<RecordData>({
      title: "",

      institution: "",

      country: "Unknown",

      url: "",

      description: "",

      eligibility: "",

      deadline: "",

      official: false,
    });

  const submit = async () => {
    const result = manual
      ? await call(
          "jobs.add",

          {
            job: {
              ...form,

              deadline: form.deadline || null,

              applicationUrl: form.url,

              focus: form.description.slice(0, 700),

              deadlineText: form.deadline || "Not stated",

              deadlineTimezone: "Not stated",
            },
          },

          "Listing saved. Review its details before applying.",
        )
      : await call(
          "jobs.import",

          { url },

          "Listing import queued. Check Activity for progress.",
        );

    if (result) {
      close();

      setUrl("");
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Add an opportunity</DialogTitle>

      <DialogContent>
        <div className="dialog-tabs">
          <Button
            variant={!manual ? "contained" : "text"}

            onClick={() => setManual(false)}
          >
            Import from URL
          </Button>

          <Button
            variant={manual ? "contained" : "text"}

            onClick={() => setManual(true)}
          >
            Enter listing manually
          </Button>
        </div>

        {manual ? (
          <div className="form-stack">
            <TextField
              label="Job title"

              value={form.title}

              onChange={(e) => setForm({ ...form, title: e.target.value })}

              required
            />

            <TextField
              label="Institution"

              value={form.institution}

              onChange={(e) =>
                setForm({ ...form, institution: e.target.value })
              }

              required
            />

            <FieldSelect
              label="Country"

              value={form.country}

              onChange={(country) => setForm({ ...form, country })}

              options={["Unknown", ...countries]}
            />

            <TextField
              label="Official application URL"

              value={form.url}

              onChange={(e) => setForm({ ...form, url: e.target.value })}

              required
            />

            <TextField
              label="Full job description"

              multiline

              minRows={5}

              value={form.description}

              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }

              required
            />

            <TextField
              label="Eligibility requirements"

              multiline

              minRows={2}

              value={form.eligibility}

              onChange={(e) =>
                setForm({ ...form, eligibility: e.target.value })
              }
            />

            <TextField
              label="Deadline date if stated"

              type="date"

              value={form.deadline}

              onChange={(e) => setForm({ ...form, deadline: e.target.value })}

              slotProps={{ inputLabel: { shrink: true } }}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={form.official}

                  onChange={(_, official) => setForm({ ...form, official })}
                />
              }

              label="I verified this against the employer's official listing"
            />
          </div>
        ) : (
          <>
            <p>
              Paste an official employer listing or job-board vacancy link.
              Extracted facts remain editable.
            </p>

            <TextField
              label="Job listing URL"

              value={url}

              onChange={(e) => setUrl(e.target.value)}

              placeholder="https://university.example/careers/…"

              fullWidth
            />

            <Alert severity="info" sx={{ mt: 2 }}>
              If a portal blocks automated reading, use manual entry and paste
              its listing text.
            </Alert>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={close}>Cancel</Button>

        <Button
          variant="contained"

          onClick={submit}

          disabled={
            manual
              ? !form.title ||
                !form.institution ||
                !form.url ||
                !form.description
              : !url
          }
        >
          {manual ? "Save listing" : "Import listing"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DocumentsScreen({
  data,

  call,

  busy,

  jobId,

  setJobId,

  pkg,

  setPackage,

  edit,
  apply,
}: {
  data: Snapshot;

  call: Call;

  busy: string;

  jobId: string;

  setJobId: (id: string) => void;

  pkg?: RecordData;

  setPackage: (id: string) => void;

  edit: (pkg: RecordData, doc: RecordData) => void;
  apply: (job: RecordData, pkg?: string) => Promise<void>;
}) {
  const [types, setTypes] = useState(["Academic CV", "Cover letter"]);
  const [automatic, setAutomatic] = useState(true);

  const [keywordDocument, setKeywordDocument] = useState<RecordData | null>(
    null,
  );

  const selectedJob =
    jobId ||
    data.jobs.find((j) => j.status === "shortlisted")?.id ||
    data.jobs[0]?.id ||
    "";

  const plan = data.documentPlans?.[selectedJob];

  return (
    <>
      <PageHeading
        title="Make your evidence count."

        subtitle="Formal, tailored documents with editable Word files and submission-ready PDFs."
      />

      <section className="panel document-builder">
        <div>
          <span className="eyebrow">DOCUMENT STUDIO</span>

          <h2>A package for this opportunity</h2>

          <p>Use verified facts. Tailor the emphasis. Review every document.</p>
        </div>

        <div className="form-stack">
          <FieldSelect
            label="Target opportunity"

            value={selectedJob}

            onChange={(id) => {
              setJobId(id);
              setPackage(data.packages.find((p) => p.jobId === id)?.id || "");
            }}

            options={[...data.jobs, ...(data.jobHistory || [])].map((j) => ({
              value: j.id,

              label: j.institution + " · " + j.title,
            }))}
          />

          <FormControlLabel
            label="Automatically select documents required by this listing"

            control={
              <Switch
                checked={automatic}

                onChange={(_, v) => setAutomatic(v)}
              />
            }
          />

          {automatic && (
            <Alert severity="info">
              The listing is checked before drafting. Required statements and
              proposals are created automatically; official records, existing
              samples and third-party letters are tracked as files to supply.
            </Alert>
          )}

          {automatic && plan && (
            <div>
              <b>Listing requirements · preliminary</b>

              <ul>
                {plan.requirements.map((r: RecordData) => (
                  <li key={r.id}>
                    {r.label}
                    {!r.required ? " (optional)" : ""} ·{" "}
                    {r.kind === "generated" ? "Create document" : "Supply file"}
                  </li>
                ))}
              </ul>

              {plan.warning && <p className="muted">{plan.warning}</p>}
            </div>
          )}

          {!automatic && (
            <div className="type-options">
              {data.documentTypes.map((type) => (
                <FormControlLabel
                  key={type}

                  label={type}

                  control={
                    <Checkbox
                      checked={types.includes(type)}

                      onChange={(_, checked) =>
                        setTypes(
                          checked
                            ? [...types, type]
                            : types.filter((t) => t !== type),
                        )
                      }
                    />
                  }
                />
              ))}
            </div>
          )}

          {!data.profile?.verified && (
            <Alert severity="warning">
              Import and approve your candidate profile before generating
              documents.
            </Alert>
          )}

          {!data.settings.cloudConsent &&
            types.some(
              (t) => !["Academic CV", "Referee sheet"].includes(t),
            ) && (
              <Alert severity="info">
                Enable AI processing and test your provider in Settings to draft
                letters and statements. CV generation uses your local profile.
              </Alert>
            )}

          <Button
            variant="contained"

            startIcon={<AutoAwesomeOutlined />}

            disabled={
              !!busy ||
              !selectedJob ||
              (!automatic && !types.length) ||
              !data.profile?.verified
            }

            onClick={() =>
              call(
                "package.draft",

                {
                  jobId: selectedJob,

                  types: automatic ? null : types,

                  automatic,
                },

                "Document package queued. Follow progress in Activity.",
              )
            }
          >
            Create submission package
          </Button>
        </div>
      </section>

      <div className="document-layout">
        <section className="panel package-list">
          <div className="panel-heading compact">
            <h2>Submission packages</h2>

            <Tag>{data.packages.length}</Tag>
          </div>

          {data.packages.length ? (
            data.packages.map((p) => (
              <button
                className={
                  "package-item " + (p.id === pkg?.id ? "selected" : "")
                }

                key={p.id}

                onClick={() => {
                  setPackage(p.id);
                  setJobId(p.jobId);
                }}
              >
                <DescriptionOutlined color="primary" />

                <div>
                  <b>{p.name}</b>

                  <p>
                    {
                      [...data.jobs, ...(data.jobHistory || [])].find(
                        (j) => j.id === p.jobId,
                      )?.title
                    }
                  </p>

                  <small>
                    {fmt(p.createdAt)} · {p.documents.length} documents · v
                    {p.version}
                  </small>
                </div>

                <Tag kind={p.status === "ready" ? "teal" : "neutral"}>
                  {p.status}
                </Tag>
              </button>
            ))
          ) : (
            <Empty
              icon={DescriptionOutlined}

              title="Build your first package"

              text="Choose an opportunity and the documents its listing requires."
            />
          )}
        </section>

        {pkg ? (
          <section className="panel package-detail">
            <div className="panel-heading">
              <div>
                <h2>{pkg.name}</h2>

                <p>
                  {
                    [...data.jobs, ...(data.jobHistory || [])].find(
                      (j) => j.id === pkg.jobId,
                    )?.title
                  }
                </p>
              </div>

              <IconButton
                title="Open package folder"

                onClick={() => call("file.open", { path: pkg.folder })}
              >
                <FolderOpenOutlined />
              </IconButton>
            </div>

            {pkg.notes?.length > 0 && (
              <Alert severity="warning" sx={{ m: 2 }}>
                {pkg.notes.join(" ")}
              </Alert>
            )}

            <PackageRequirements
              key={"requirements-" + pkg.id}
              pkg={pkg}
              data={data}
              call={call}
              busy={busy}
            />

            <div className="package-toolbar">
              <Button
                startIcon={<AutoAwesomeOutlined />}
                variant="contained"
                disabled={!!busy}
                onClick={() => {
                  const job = [...data.jobs, ...(data.jobHistory || [])].find(
                    (j) => j.id === pkg.jobId,
                  );
                  if (job) apply(job, pkg.id);
                }}
              >
                Use this package in Apply
              </Button>
              <Button
                startIcon={<DownloadOutlined />}

                variant="outlined"

                disabled={!!busy || !pkg.documents.length}

                onClick={() =>
                  call(
                    "package.export",

                    { id: pkg.id },

                    "PDF export queued. Microsoft Word will run in the background.",
                  )
                }
              >
                Export PDFs with Word
              </Button>
            </div>

            <div className="document-cards">
              {pkg.documents.map((doc: RecordData) => (
                <div key={doc.id} className="document-card">
                  <div className="flex-between">
                    <div className="doc-type">
                      <DescriptionOutlined />

                      <div>
                        <b>{doc.label || doc.type}</b>

                        <small>
                          Revision {doc.revision} · {doc.audit.words} words{" "}
                          {doc.pdfAudit
                            ? "· " + doc.pdfAudit.pages + " pages"
                            : ""}
                        </small>
                      </div>
                    </div>

                    <Tag kind={doc.reviewed ? "teal" : "neutral"}>
                      {doc.reviewed ? "Reviewed" : "Needs review"}
                    </Tag>
                  </div>

                  {doc.purpose === "referee_review" && (
                    <Alert severity="warning" sx={{ mb: 1 }}>
                      Referee-review draft — excluded from submission files.
                      Obtain referee approval and the signed original.
                    </Alert>
                  )}
                  <p>{doc.content.sections[0]?.text.slice(0, 220)}…</p>

                  {doc.keywordLayer?.enabled && (
                    <Alert severity="warning" sx={{ mb: 1 }}>
                      Experimental hidden keywords:{" "}
                      {doc.keywordLayer.terms.length
                        ? doc.keywordLayer.terms.join("; ")
                        : "No supported terms matched."}{" "}
                      Screening benefit is unproven.
                    </Alert>
                  )}

                  <div className="card-actions">
                    {doc.type === "Academic CV" &&
                      (doc.templateVersion || 0) < 5 && (
                        <Button
                          size="small"
                          disabled={!!busy}
                          onClick={() =>
                            call(
                              "package.refreshCV",
                              { id: pkg.id, documentId: doc.id },
                              "CV formatting queued. Follow progress in Activity.",
                            )
                          }
                        >
                          Remove heading icons
                        </Button>
                      )}
                    {["Academic CV", "Cover letter"].includes(doc.type) && (
                      <Button
                        size="small"

                        disabled={!!busy}

                        onClick={async () => {
                          const preview = await call("package.keywordPreview", {
                            packageId: pkg.id,

                            documentId: doc.id,
                          });

                          if (preview)
                            setKeywordDocument({
                              ...doc,

                              availableKeywords: preview.candidates,
                            });
                        }}
                      >
                        Hidden keywords
                        {doc.keywordLayer?.enabled ? " · on" : " · off"}
                      </Button>
                    )}

                    <Button
                      size="small"

                      startIcon={<EditOutlined />}

                      onClick={() => edit(pkg, doc)}
                    >
                      Edit & preview
                    </Button>

                    <Button
                      size="small"

                      onClick={() => call("file.open", { path: doc.docx })}
                    >
                      Word
                    </Button>

                    <Button
                      size="small"

                      disabled={!doc.pdf}

                      onClick={() => call("file.open", { path: doc.pdf })}
                    >
                      Open PDF
                    </Button>

                    <Button
                      size="small"

                      disabled={
                        !doc.pdf || (doc.reviewed && pkg.status === "ready")
                      }

                      startIcon={<CheckRounded />}

                      onClick={() =>
                        call(
                          "package.review",

                          { id: pkg.id, documentIds: [doc.id] },

                          "Document marked reviewed.",
                        )
                      }
                    >
                      {doc.purpose === "referee_review"
                        ? "Mark draft reviewed"
                        : "Approve"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {keywordDocument && (
              <KeywordLayerDialog
                doc={keywordDocument}

                close={() => setKeywordDocument(null)}

                save={async (enabled, terms) => {
                  if (
                    await call(
                      "package.keywordLayer",

                      {
                        packageId: pkg.id,

                        documentId: keywordDocument.id,

                        enabled,

                        terms,
                      },

                      "Keyword settings saved. Export and review the new PDF before approval.",
                    )
                  )
                    setKeywordDocument(null);
                }}
              />
            )}

            <PackageSupport
              key={"support-" + pkg.id}
              pkg={pkg}
              data={data}
              call={call}
              busy={busy}
            />
          </section>
        ) : (
          <section className="panel">
            <Empty
              icon={DescriptionOutlined}

              title="Your documents, together"

              text="Draft, edit, export and review each document before it reaches a portal."
            />
          </section>
        )}
      </div>
    </>
  );
}

function KeywordLayerDialog({
  doc,

  close,

  save,
}: {
  doc: RecordData;

  close: () => void;

  save: (enabled: boolean, terms: string[]) => Promise<void>;
}) {
  const candidates: RecordData[] = doc.availableKeywords || [];

  const [enabled, setEnabled] = useState(!!doc.keywordLayer?.enabled);

  const [selected, setSelected] = useState<string[]>(
    doc.keywordLayer?.enabled
      ? doc.keywordLayer.terms
      : candidates.map((c) => c.term),
  );

  const [saving, setSaving] = useState(false);

  return (
    <Dialog open maxWidth="md" fullWidth onClose={() => !saving && close()}>
      <DialogTitle>Hidden keywords · {doc.type}</DialogTitle>

      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Experimental feature. Hidden text has no proven ATS ranking benefit
          and may be ignored, exposed or flagged. It does not guarantee
          shortlisting.
        </Alert>

        <FormControlLabel
          control={
            <Switch
              checked={enabled}

              disabled={saving || !candidates.length}

              onChange={(_, value) => setEnabled(value)}
            />
          }

          label="Enable hidden keyword layer for this document"
        />

        <p className="muted">
          Only topics found in both your verified profile and this vacancy are
          available. The same selected terms go into the DOCX and PDF. Changing
          them creates a new revision and resets PDF approval.
        </p>

        {!candidates.length && (
          <Alert severity="info">
            No supported keyword topics were found in both the profile and
            vacancy.
          </Alert>
        )}

        <div className="form-stack">
          {candidates.map((candidate) => (
            <div key={candidate.term} className="keyword-evidence">
              <FormControlLabel
                control={
                  <Checkbox
                    disabled={!enabled || saving}

                    checked={selected.includes(candidate.term)}

                    onChange={(_, checked) =>
                      setSelected(
                        checked
                          ? [...selected, candidate.term]
                          : selected.filter((t) => t !== candidate.term),
                      )
                    }
                  />
                }

                label={candidate.term}
              />

              <small className="muted">
                {candidate.section}: {candidate.evidence}
              </small>
            </div>
          ))}
        </div>

        <p className="field-caption">EXACT EMBEDDED TEXT</p>

        <p className="keyword-text">
          {enabled
            ? candidates

                .filter((c) => selected.includes(c.term))

                .map((c) => c.term)

                .join("; ") || "No terms selected."
            : "Disabled. No hidden keywords will be added."}
        </p>
      </DialogContent>

      <DialogActions>
        <Button disabled={saving} onClick={close}>
          Cancel
        </Button>

        <Button
          variant="contained"

          disabled={saving || (enabled && !selected.length)}

          onClick={async () => {
            setSaving(true);

            try {
              await save(enabled, selected);
            } finally {
              setSaving(false);
            }
          }}
        >
          Save keyword settings
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DocumentEditor({
  value,

  close,

  save,
}: {
  value: { pkg: RecordData; doc: RecordData };

  close: () => void;

  save: (content: RecordData) => void;
}) {
  const [content, setContent] = useState<RecordData>(
      structuredClone(value.doc.content),
    ),
    [preview, setPreview] = useState(false);

  return (
    <Dialog open onClose={close} maxWidth="lg" fullWidth>
      <DialogTitle>
        <div className="flex-between">
          <span>{value.doc.type}</span>

          <Button onClick={() => setPreview(!preview)}>
            {preview ? "Edit content" : "Preview layout text"}
          </Button>
        </div>
      </DialogTitle>

      <DialogContent>
        {preview ? (
          <div className="paper-preview">
            <h1>{content.title}</h1>

            <h3>{content.subtitle}</h3>

            {content.letter && (
              <div>
                <p>{content.letter.date}</p>

                <p>{content.letter.recipient}</p>

                <p className="letter-subject">
                  Application for {content.letter.subject}
                </p>
              </div>
            )}

            {content.sections.map((section: RecordData, index: number) => (
              <section key={index}>
                {section.heading && <h2>{section.heading}</h2>}

                <p>{section.text}</p>
              </section>
            ))}
          </div>
        ) : (
          <div className="form-stack">
            <Alert severity="info">
              Edits create a new revision and invalidate the existing PDF
              approval. Keep claims consistent with your verified profile.
            </Alert>

            <TextField
              label="Candidate name"

              value={content.title}

              onChange={(e) =>
                setContent({ ...content, title: e.target.value })
              }
            />

            <TextField
              label="Document subtitle"

              value={content.subtitle}

              onChange={(e) =>
                setContent({ ...content, subtitle: e.target.value })
              }
            />

            {content.letter && (
              <>
                {(
                  [
                    ["date", "Letter date"],

                    ["recipient", "Recipient institution"],

                    ["subject", "Application subject"],
                  ] as const
                ).map(([key, label]) => (
                  <TextField
                    key={key}

                    label={label}

                    value={content.letter[key]}

                    onChange={(e) =>
                      setContent({
                        ...content,

                        letter: { ...content.letter, [key]: e.target.value },
                      })
                    }
                  />
                ))}
              </>
            )}

            {content.sections.map((section: RecordData, index: number) => (
              <div className="editor-section" key={index}>
                <div className="flex-between">
                  <TextField
                    label="Section heading"

                    fullWidth

                    value={section.heading}

                    onChange={(e) =>
                      setContent({
                        ...content,

                        sections: content.sections.map(
                          (s: RecordData, i: number) =>
                            i === index ? { ...s, heading: e.target.value } : s,
                        ),
                      })
                    }
                  />

                  <IconButton
                    disabled={content.sections.length === 1}

                    onClick={() =>
                      setContent({
                        ...content,

                        sections: content.sections.filter(
                          (_: any, i: number) => i !== index,
                        ),
                      })
                    }
                  >
                    <CloseRounded />
                  </IconButton>
                </div>

                <TextField
                  multiline

                  minRows={5}

                  fullWidth

                  label="Text"

                  value={section.text}

                  onChange={(e) =>
                    setContent({
                      ...content,

                      sections: content.sections.map(
                        (s: RecordData, i: number) =>
                          i === index ? { ...s, text: e.target.value } : s,
                      ),
                    })
                  }
                />
              </div>
            ))}

            <Button
              startIcon={<AddRounded />}

              onClick={() =>
                setContent({
                  ...content,

                  sections: [...content.sections, { heading: "", text: "" }],
                })
              }
            >
              Add section
            </Button>
          </div>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={close}>Cancel</Button>

        <Button variant="contained" onClick={() => save(content)}>
          Save revision
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ApplicationPanel({
  application: a,

  data,

  call,

  busy,

  onReview,

  onSuggestions,

  onMail,
}: {
  application: RecordData;

  data: Snapshot;

  call: Call;

  busy: string;

  onReview: () => void;

  onSuggestions: (v: RecordData) => void;

  onMail: (v: RecordData) => void;
}) {
  const job = [...data.jobs, ...(data.jobHistory || [])].find(
      (j) => j.id === a.jobId,
    ),
    pkg = data.packages.find((p) => p.id === a.packageId);

  const [notes, setNotes] = useState(a.notes || ""),
    [evidence, setEvidence] = useState("");

  useEffect(() => {
    setNotes(a.notes || "");
  }, [a.id]);

  return (
    <section className="panel application-detail">
      <div className="panel-heading">
        <div>
          <h2>{job?.title}</h2>

          <p>
            {job?.institution} · {job?.country}
          </p>
        </div>

        <Tag
          kind={
            a.status === "submitted"
              ? "teal"
              : a.status === "submission_uncertain"
                ? "amber"
                : "neutral"
          }
        >
          {STATUS[a.status] || a.status}
        </Tag>
      </div>

      <div className="application-body">
        <section className="apply-context">
          <h3>Application context</h3>
          <p>
            <b>
              {job?.institution} - {job?.title}
            </b>
          </p>
          <p>
            {job?.eligibility ||
              job?.focus ||
              "Review the listing's eligibility and requirements."}
          </p>
          <details>
            <summary>Listing details and required documents</summary>
            <p className="preserve-lines">{job?.description}</p>
            <ul>
              {job?.requiredDocuments?.map((r: string) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
          <FieldSelect
            label="Submission package"

            value={a.packageId || ""}

            onChange={(packageId) =>
              call("application.update", { id: a.id, changes: { packageId } })
            }

            options={[
              { value: "", label: "Choose a package" },

              ...data.packages

                .filter((p) => p.jobId === a.jobId)

                .map((p) => ({
                  value: p.id,

                  label: packageLabel(p),
                })),
            ]}
          />
          <div className="tag-row">
            <Tag kind={pkg?.status === "ready" ? "teal" : "amber"}>
              {pkg ? pkg.name : "No package selected"}
            </Tag>
            <span>
              {pkg?.documents?.filter((d: RecordData) => d.reviewed).length ||
                0}{" "}
              reviewed documents
            </span>
          </div>
          <small>
            The AI receives this listing and only reviewed text/files from this
            matching package.
          </small>
        </section>
        <ApplicationControls
          application={a}

          data={data}

          call={call}

          busy={busy}
        />

        <Alert
          severity={a.status === "submission_uncertain" ? "warning" : "info"}
        >
          {a.message || "Inspect your application form to continue."}
        </Alert>

        <div className="portal-toolbar">
          <Button
            variant="contained"

            startIcon={<RefreshRounded />}

            disabled={!!busy}

            onClick={() =>
              call(
                "application.inspect",

                { id: a.id },

                "Current portal form inspected.",
              )
            }
          >
            Inspect / resume portal
          </Button>

          <Button
            variant="outlined"

            disabled={!!busy}

            onClick={() => call("application.fill", { id: a.id })}
          >
            Fill contact details
          </Button>

          <Button
            startIcon={<AutoAwesomeOutlined />}

            disabled={!!busy || !data.settings.cloudConsent}

            onClick={async () => {
              const result = await call("application.suggest", { id: a.id });

              if (result) onSuggestions(result);
            }}
          >
            Suggest answers
          </Button>
        </div>

        <div className="email-actions">
          <Button
            size="small"

            startIcon={<MailOutlineRounded />}

            onClick={() => call("application.mail", { id: a.id })}
          >
            Open application email
          </Button>

          <Button
            size="small"

            onClick={async () => {
              const r = await call("application.readMail", { id: a.id });

              if (r) onMail(r);
            }}
          >
            Read opened relevant message
          </Button>

          <span>Passwords, codes and verification links stay in Chrome.</span>
        </div>

        {a.snapshot && (
          <>
            <div className="section-label">
              <b>Current form</b>

              <span>
                {a.snapshot.fields.length} fields · inspected{" "}
                {fmt(a.snapshot.at)}
              </span>
            </div>

            <p className="portal-url">{a.snapshot.url}</p>

            {a.snapshot.validation.length > 0 && (
              <Alert severity="warning">
                {a.snapshot.validation.join(" · ")}
              </Alert>
            )}

            <div className="form-field-list">
              {a.snapshot.fields.map((f: RecordData) => (
                <div className="form-field-row" key={f.key}>
                  <div>
                    <b>
                      {f.label}

                      {f.required ? " *" : ""}
                    </b>

                    <small>
                      {f.type}

                      {f.invalid ? " · needs attention" : ""}
                    </small>
                  </div>

                  <PortalFieldEditor
                    field={f}

                    applicationId={a.id}

                    call={call}

                    busy={busy}
                  />
                </div>
              ))}
            </div>

            {a.snapshot.fields

              .filter((f: RecordData) => f.type === "file")

              .map((f: RecordData) => (
                <UploadSlot
                  key={f.key}

                  field={f}

                  pkg={pkg}

                  call={call}

                  appId={a.id}
                />
              ))}

            <div className="portal-toolbar">
              {a.snapshot.buttons

                .filter((b: RecordData) => b.navigation && !b.terminal)

                .map((b: RecordData) => (
                  <Button
                    key={b.key}

                    variant="outlined"

                    disabled={b.disabled || !!busy}

                    onClick={() =>
                      call("application.next", { id: a.id, buttonKey: b.key })
                    }
                  >
                    {b.text}
                  </Button>
                ))}
            </div>

            <Alert severity="info">
              Use the visible Chrome window for sign-in, CAPTCHA, declarations
              and controls that need manual assistance. Inspect again after each
              change.
            </Alert>
          </>
        )}

        <div className="review-banner">
          <div>
            <b>Final review stays with you</b>

            <p>
              Approve the current answers, declarations and document versions
              before submitting.
            </p>
          </div>

          <Button
            variant="contained"

            disabled={
              !!busy || ["submitted", "submission_uncertain"].includes(a.status)
            }

            onClick={onReview}
          >
            Review & submit
          </Button>
        </div>

        {a.receipt && (
          <Button
            startIcon={<TaskAltRounded />}

            onClick={() => call("file.open", { path: a.receipt })}
          >
            Open submission evidence
          </Button>
        )}

        <Divider sx={{ my: 2 }} />

        <h3>Tracking and notes</h3>

        <FieldSelect
          label="Application stage"

          value={a.status}

          onChange={(status) => {
            if (status === "submitted" && !a.submittedAt && !evidence) {
              return;
            }

            call("application.update", {
              id: a.id,

              changes: {
                status,

                ...(status === "submitted" && evidence
                  ? { confirmationText: evidence }
                  : {}),
              },
            });
          }}

          options={[
            "preparing",

            "paused",

            "submission_uncertain",

            "submitted",

            "interview",

            "offer",

            "rejected",

            "withdrawn",
          ].map((value) => ({ value, label: STATUS[value] }))}
        />

        <TextField
          sx={{ mt: 2 }}

          label="Confirmation evidence for a manually submitted application"

          placeholder="Portal reference or confirmation email details"

          value={evidence}

          onChange={(e) => setEvidence(e.target.value)}

          fullWidth
        />

        <Button
          size="small"

          disabled={!evidence}

          onClick={() =>
            call(
              "application.update",

              {
                id: a.id,

                changes: { status: "submitted", confirmationText: evidence },
              },

              "Submission recorded with your confirmation evidence.",
            )
          }
        >
          Record confirmed submission
        </Button>

        <TextField
          sx={{ mt: 2 }}

          label="Private application notes"

          multiline

          minRows={3}

          fullWidth

          value={notes}

          onChange={(e) => setNotes(e.target.value)}
        />

        <Button
          onClick={() =>
            call(
              "application.update",

              { id: a.id, changes: { notes } },

              "Application notes saved.",
            )
          }
        >
          Save notes
        </Button>
      </div>
    </section>
  );
}

function UploadSlot({
  field,

  pkg,

  call,

  appId,
}: {
  field: RecordData;

  pkg?: RecordData;

  call: Call;

  appId: string;
}) {
  const [file, setFile] = useState("");

  const files = pkg
    ? [
        ...pkg.documents
          .filter((d: RecordData) => d.submissionEligible !== false)
          .flatMap((d: RecordData) => [
            {
              value: d.pdf || d.docx,

              label: d.type + (d.pdf ? " · PDF" : " · Word"),
            },
          ]),

        ...pkg.attachments.map((a: RecordData) => ({
          value: a.path,

          label: a.name,
        })),
      ]
    : [];

  return (
    <div className="upload-slot">
      <DescriptionOutlined color="primary" />

      <FieldSelect
        label={field.label}

        value={file}

        onChange={setFile}

        options={[{ value: "", label: "Select a package file" }, ...files]}
      />

      <Button
        disabled={!file}

        onClick={() =>
          call("application.upload", { id: appId, fieldKey: field.key, file })
        }
      >
        Upload
      </Button>
    </div>
  );
}

function ReviewDialog({
  application: a,

  data,

  close,

  call,

  busy,
}: {
  application: RecordData;

  data: Snapshot;

  close: () => void;

  call: Call;

  busy: string;
}) {
  const [checks, setChecks] = useState<RecordData>({
      documents: false,

      answers: false,

      uploads: false,

      declarations: false,
    }),
    [button, setButton] = useState("");

  const pkg = data.packages.find((p) => p.id === a.packageId),
    job = [...data.jobs, ...(data.jobHistory || [])].find(
      (j) => j.id === a.jobId,
    );

  const terminal =
    a.snapshot?.buttons.filter((b: RecordData) => b.terminal && !b.disabled) ||
    [];

  const approved = !!a.approval;

  return (
    <Dialog open onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Review this application</DialogTitle>

      <DialogContent>
        <h2>{job?.title}</h2>

        <p>
          {job?.institution} · {job?.country}
        </p>

        <Alert severity="warning">
          Submission sends this application to the employer. Review the visible
          portal and each attached file before approval.
        </Alert>

        <h3>Submission package</h3>

        {pkg ? (
          <>
            {pkg.documents
              .filter((d: RecordData) => d.submissionEligible !== false)
              .map((d: RecordData) => (
                <div className="attachment-row" key={d.id}>
                  <span>
                    {d.type} · revision {d.revision}
                  </span>

                  <Tag kind={d.reviewed ? "teal" : "amber"}>
                    {d.reviewed ? "Reviewed" : "Needs review"}
                  </Tag>

                  <Button
                    size="small"

                    disabled={!d.pdf}

                    onClick={() => call("file.open", { path: d.pdf })}
                  >
                    Inspect PDF
                  </Button>
                </div>
              ))}

            {pkg.attachments.map((f: RecordData) => (
              <p key={f.path}>{f.name}</p>
            ))}
          </>
        ) : (
          <Alert severity="error">
            Choose a submission package in the application workspace.
          </Alert>
        )}

        <h3>Current portal answers</h3>

        <div className="review-fields">
          {a.snapshot?.fields

            .filter((f: RecordData) => f.type !== "password")

            .map((f: RecordData) => (
              <div key={f.key}>
                <b>{f.label}</b>

                <span>{f.value || "—"}</span>
              </div>
            ))}
        </div>

        <FieldSelect
          label="Final portal button"

          value={button || a.approval?.buttonKey || ""}

          onChange={setButton}

          options={terminal.map((b: RecordData) => ({
            value: b.key,

            label: b.text,
          }))}
        />

        {!terminal.length && (
          <p className="amber">
            No final submission button detected. Complete the portal steps and
            inspect again.
          </p>
        )}

        <div className="review-checks">
          {[
            ["documents", "I inspected the current PDFs and supporting files."],

            ["answers", "The form answers are accurate and complete."],

            ["uploads", "The portal shows all required uploads as saved."],

            [
              "declarations",

              "I reviewed and completed all required declarations.",
            ],
          ].map(([key, label]) => (
            <FormControlLabel
              key={key}

              label={label}

              control={
                <Checkbox
                  checked={checks[key]}

                  onChange={(_, checked) =>
                    setChecks({ ...checks, [key]: checked })
                  }
                />
              }
            />
          ))}
        </div>

        {approved && (
          <Alert severity="success">
            Approval is bound to the current form and package. Any change
            requires another review.
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={close}>Return to workspace</Button>

        {approved ? (
          <Button
            color="primary"

            variant="contained"

            disabled={!!busy}

            onClick={async () => {
              if (await call("application.submit", { id: a.id })) close();
            }}
          >
            Submit application now
          </Button>
        ) : (
          <Button
            variant="contained"

            disabled={
              !!busy ||
              !Object.values(checks).every(Boolean) ||
              !terminal.length
            }

            onClick={() =>
              call("application.approve", {
                id: a.id,

                buttonKey: button || terminal[0]?.key,

                confirmations: checks,
              })
            }
          >
            Approve this application
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function SuggestionsDialog({
  suggestions,

  close,

  apply,
}: {
  suggestions: RecordData;

  close: () => void;

  apply: (answers: RecordData[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <Dialog open onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Review suggested answers</DialogTitle>

      <DialogContent>
        <Alert severity="info">
          Select only answers you have verified. Unknown eligibility and
          declarations must be answered by you.
        </Alert>

        {suggestions.questions?.map((q: string) => (
          <p className="gap-line" key={q}>
            <WarningAmberRounded fontSize="small" />

            {q}
          </p>
        ))}

        {suggestions.answers.map((a: RecordData) => (
          <div className="suggestion" key={a.key}>
            <FormControlLabel
              label={a.key}

              control={
                <Checkbox
                  checked={selected.includes(a.key)}

                  onChange={(_, checked) =>
                    setSelected(
                      checked
                        ? [...selected, a.key]
                        : selected.filter((k) => k !== a.key),
                    )
                  }
                />
              }
            />

            <p>{a.value}</p>

            <small>{a.evidence}</small>
          </div>
        ))}
      </DialogContent>

      <DialogActions>
        <Button onClick={close}>Cancel</Button>

        <Button
          variant="contained"

          disabled={!selected.length}

          onClick={() =>
            apply(
              suggestions.answers.filter((a: RecordData) =>
                selected.includes(a.key),
              ),
            )
          }
        >
          Fill selected answers
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Profile({
  data,

  call,

  busy,
}: {
  data: Snapshot;

  call: Call;

  busy: string;
}) {
  const p = data.profile?.data,
    [editing, setEditing] = useState(false),
    [json, setJson] = useState(""),
    [jsonError, setJsonError] = useState(""),
    [query, setQuery] = useState("");

  return (
    <>
      <PageHeading
        title="Your academic source of truth."

        subtitle="Verified facts and supporting evidence behind every application."

        action={
          <Button
            variant="outlined"

            startIcon={<FolderOpenOutlined />}

            onClick={() =>
              call(
                "profile.import",

                {},

                "Profile imported. Review and approve the current facts.",
              )
            }
          >
            Import profile folder
          </Button>
        }
      />

      {p ? (
        <>
          <section className="panel profile-card">
            <div className="profile-avatar">
              {p.personal.name

                .split(" ")

                .slice(-2)

                .map((s: string) => s[0])

                .join("")}
            </div>

            <div>
              <div className="tag-row">
                <Tag kind={data.profile?.verified ? "teal" : "amber"}>
                  {data.profile?.verified
                    ? "Profile approved"
                    : "Review required"}
                </Tag>

                <Tag>Local evidence library</Tag>
              </div>

              <h1>{p.personal.name}</h1>

              <p>{p.personal.headline}</p>

              <small>Imported {fmt(data.profile?.importedAt)}</small>
            </div>

            <Button
              variant="outlined"

              startIcon={<EditOutlined />}

              onClick={() => {
                setJson(JSON.stringify(p, null, 2));

                setEditing(true);
              }}
            >
              Edit profile facts
            </Button>
          </section>

          <div className="profile-columns">
            <section className="panel padded">
              <h2>Review before reuse</h2>

              {data.profile?.warnings.map((w: string) => (
                <p className="gap-line" key={w}>
                  <WarningAmberRounded fontSize="small" />

                  {w}
                </p>
              ))}

              <p>
                Confirm appointments, qualification status, publication records,
                contact details and referee consent against your current
                records.
              </p>

              <Button
                variant="contained"

                disabled={!!busy || data.profile?.verified}

                startIcon={<VerifiedOutlined />}

                onClick={() =>
                  call(
                    "profile.approve",

                    {},

                    "Profile approved for document drafting and form assistance.",
                  )
                }
              >
                {data.profile?.verified
                  ? "Facts approved"
                  : "I reviewed these facts — approve profile"}
              </Button>
            </section>

            <section className="panel padded">
              <h2>Research profile</h2>

              <div className="tag-row">
                {p.personal.research_interests?.map((r: string) => (
                  <Tag kind="teal" key={r}>
                    {r}
                  </Tag>
                ))}
              </div>

              <p>{p.personal.summary}</p>
            </section>
          </div>

          <div className="profile-columns">
            <section className="panel padded">
              <h2>Education</h2>

              {p.education?.map((e: RecordData, i: number) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-dot" />

                  <b>{e.degree}</b>

                  <p>{e.institution}</p>

                  <small>
                    {e.start?.slice(0, 4)}–
                    {e.ongoing ? "present" : e.end?.slice(0, 4)}
                    {e.thesis ? " · " + e.thesis : ""}
                  </small>
                </div>
              ))}
            </section>

            <section className="panel padded">
              <h2>Experience</h2>

              {p.experience?.map((e: RecordData, i: number) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-dot" />

                  <b>{e.title}</b>

                  <p>{e.organization}</p>

                  <small>
                    {e.start?.slice(0, 7)}–
                    {e.ongoing ? "present" : e.end?.slice(0, 7)}
                  </small>
                </div>
              ))}
            </section>
          </div>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Supporting evidence</h2>

                <p>
                  {data.library.length} indexed files · originals remain in
                  their existing folder
                </p>
              </div>

              <TextField
                size="small"

                placeholder="Filter library"

                value={query}

                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="library-table">
              {data.library

                .filter((f) =>
                  f.relative.toLowerCase().includes(query.toLowerCase()),
                )

                .slice(0, 100)

                .map((f) => (
                  <div key={f.id}>
                    <DescriptionOutlined color="action" />

                    <span>
                      <b>{f.name}</b>

                      <small>{f.relative}</small>
                    </span>

                    <Tag>{f.category}</Tag>

                    <IconButton
                      title="Open file"

                      onClick={() => call("file.open", { path: f.path })}
                    >
                      <OpenInNewRounded fontSize="small" />
                    </IconButton>
                  </div>
                ))}
            </div>
          </section>
        </>
      ) : (
        <section className="panel">
          <Empty
            icon={PersonOutline}

            title="A strong application starts with accurate facts"

            text="Choose your Job-application-related-data folder. The importer reads data/profile.yaml, indexes supporting files and keeps your originals intact."

            action={
              <Button
                variant="contained"

                startIcon={<FolderOpenOutlined />}

                onClick={() => call("profile.import")}
              >
                Import candidate materials
              </Button>
            }
          />
        </section>
      )}

      <Dialog
        open={editing}

        onClose={() => setEditing(false)}

        fullWidth

        maxWidth="lg"
      >
        <DialogTitle>Edit candidate facts</DialogTitle>

        <DialogContent>
          <Alert severity="info">
            Edit the structured profile below. Saving requires a fresh profile
            approval and invalidates previous application approvals.
          </Alert>

          {jsonError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {jsonError}
            </Alert>
          )}

          <TextField
            sx={{ mt: 2 }}

            fullWidth

            multiline

            minRows={20}

            value={json}

            onChange={(e) => setJson(e.target.value)}

            slotProps={{
              input: { sx: { fontFamily: "Consolas,monospace", fontSize: 12 } },
            }}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setEditing(false)}>Cancel</Button>

          <Button
            variant="contained"

            onClick={async () => {
              try {
                const parsed = JSON.parse(json);

                if (
                  await call(
                    "profile.save",

                    { data: parsed },

                    "Profile updated. Review and approve its facts.",
                  )
                )
                  setEditing(false);
              } catch (error) {
                setJsonError(
                  "The profile JSON is invalid: " + (error as Error).message,
                );
              }
            }}
          >
            Save facts
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function Reports({ data, call }: { data: Snapshot; call: Call }) {
  const stages = ["preparing", "submitted", "interview", "offer", "rejected"];

  const submitted = data.applications.filter((a) =>
    ["submitted", "interview", "offer", "rejected"].includes(a.status),
  );

  const interviews = data.applications.filter((a) =>
    ["interview", "offer"].includes(a.status),
  );

  const countBy = (list: RecordData[], key: string) =>
    Object.entries(
      list.reduce((counts: Record<string, number>, item) => {
        const k = String(item[key] || "Unknown");

        counts[k] = (counts[k] || 0) + 1;

        return counts;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeading
        title="See your search clearly."

        subtitle="Understand your pipeline, source coverage and application outcomes."

        action={
          <div className="tag-row">
            <Button
              variant="outlined"

              startIcon={<DownloadOutlined />}

              onClick={() => call("report.csv", {}, "Shortlist CSV exported.")}
            >
              Export CSV
            </Button>

            <Button
              variant="contained"

              onClick={() => call("report.pdf", {}, "PDF report exported.")}
            >
              Export PDF report
            </Button>
          </div>
        }
      />

      <div className="stats-grid">
        <Stat
          label="Saved opportunities"

          value={data.jobs.length}

          detail={`${data.jobs.filter((j) => j.status === "shortlisted").length} on your shortlist`}

          icon={TravelExploreOutlined}
        />

        <Stat
          label="Submitted applications"

          value={submitted.length}

          detail="Including recorded later outcomes"

          icon={SendOutlined}

          color="blue"
        />

        <Stat
          label="Interview progress"

          value={interviews.length}

          detail={
            submitted.length
              ? `${Math.round((interviews.length / submitted.length) * 100)}% of submitted applications`
              : "Awaiting submission history"
          }

          icon={PersonOutline}

          color="purple"
        />

        <Stat
          label="Offers"

          value={data.applications.filter((a) => a.status === "offer").length}

          detail="Your next chapter"

          icon={TaskAltRounded}
        />
      </div>

      <div className="profile-columns">
        <section className="panel padded">
          <h2>Application pipeline</h2>

          <p className="muted">Current stage of each tracked application.</p>

          {stages.map((stage) => {
            const n = data.applications.filter(
              (a) => a.status === stage,
            ).length;

            return (
              <div className="report-bar" key={stage}>
                <div>
                  <span>{STATUS[stage]}</span>

                  <b>{n}</b>
                </div>

                <div className="bar-track">
                  <span
                    style={{
                      width:
                        Math.max(
                          n ? 3 : 0,

                          (n / Math.max(data.applications.length, 1)) * 100,
                        ) + "%",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </section>

        <section className="panel padded">
          <h2>Opportunities by country</h2>

          <p className="muted">Geographic coverage of your saved listings.</p>

          {countBy(data.jobs, "country").length ? (
            countBy(data.jobs, "country")
              .slice(0, 9)

              .map(([country, n]) => (
                <div className="report-bar" key={country}>
                  <div>
                    <span>{country}</span>

                    <b>{n}</b>
                  </div>

                  <div className="bar-track blue">
                    <span
                      style={{
                        width: (n / Math.max(data.jobs.length, 1)) * 100 + "%",
                      }}
                    />
                  </div>
                </div>
              ))
          ) : (
            <Empty
              icon={BarChartOutlined}

              title="A picture will emerge"

              text="Discover and save opportunities to see your geographic coverage."
            />
          )}
        </section>
      </div>

      <section className="panel padded">
        <h2>Discovery sources</h2>

        <div className="source-counts">
          {countBy(data.jobs, "source").map(([source, n]) => (
            <div key={source}>
              <b>{n}</b>

              <span>{source}</span>
            </div>
          ))}
        </div>

        {!data.jobs.length && (
          <p className="muted">
            Run discovery to compare the sources that bring you relevant
            opportunities.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Activity history</h2>

            <p>A record of important workflow events.</p>
          </div>
        </div>

        {data.events.length ? (
          <div className="event-list">
            {data.events.slice(0, 30).map((e) => (
              <div key={e.id}>
                <span className="status-dot green" />

                <b>{e.action.replaceAll(".", " ").replaceAll("_", " ")}</b>

                <span>{new Date(e.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={TaskAltRounded}

            title="Nothing to report yet"

            text="Profile imports, discovery runs, approvals and submissions will be recorded here."
          />
        )}
      </section>
    </>
  );
}

function Settings({
  data,

  call,

  busy,
}: {
  data: Snapshot;

  call: Call;

  busy: string;
}) {
  const settings = data.settings;
  const [chromeDir, setChromeDir] = useState(settings.chromeUserDataDir || "");
  useEffect(() => {
    setChromeDir(settings.chromeUserDataDir || "");
  }, [settings.chromeUserDataDir]);

  const detectedProfiles = data.chromeProfiles?.profiles || [];
  const profileMode =
    settings.chromeProfileMode === "google" ? "google" : "dedicated";
  const selectedProfile =
    settings.chromeProfileDirectory ||
    detectedProfiles[0]?.directory ||
    "Default";

  const save = (patch: RecordData) =>
    call("settings.save", { settings: patch }, "Settings saved.");

  return (
    <>
      <PageHeading
        title="A workspace that works your way."

        subtitle="Connect your subscriptions, choose your models and control your data."
      />

      <section className="panel padded">
        <div className="flex-between">
          <div>
            <h2>AI processing</h2>

            <p className="muted">
              Use your signed-in Codex or Antigravity subscription. No API key
              is required.
            </p>
          </div>

          <Switch
            inputProps={{ "aria-label": "Enable AI processing" }}

            checked={settings.cloudConsent}

            onChange={(_, cloudConsent) => save({ cloudConsent })}
          />
        </div>

        <Alert severity={settings.cloudConsent ? "info" : "warning"}>
          {settings.cloudConsent
            ? "AI tasks send the relevant job listing, selected profile facts and requested document text to your chosen provider. Passwords, verification codes and passport records are excluded."
            : "AI processing is off. A successful service test does not turn it on. Enable the switch above to use AI discovery, letters, statements and answer suggestions."}
        </Alert>

        <div className="three-fields settings-fields">
          <FormControlLabel
            control={
              <Switch
                checked={settings.providerWebResearch !== false}

                onChange={(_, providerWebResearch) =>
                  save({ providerWebResearch })
                }
              />
            }

            label="Use provider internet tools for imports and unavailable sources"
          />

          <FieldSelect
            label="Default provider"

            value={settings.provider}

            onChange={(provider) => save({ provider })}

            options={[
              { value: "codex", label: "Codex · ChatGPT subscription" },

              {
                value: "antigravity",

                label: "Antigravity · Google subscription",
              },
            ]}
          />

          <FieldSelect
            label="Reasoning effort"

            value={settings.effort}

            onChange={(effort) => save({ effort })}

            options={["low", "medium", "high", "xhigh", "max"]}
          />

          <FormControlLabel
            label="Allow fallback to the other provider"

            control={
              <Switch
                checked={settings.fallback}

                onChange={(_, fallback) => save({ fallback })}
              />
            }
          />
        </div>
      </section>

      <div className="profile-columns">
        {["codex", "antigravity"].map((provider) => {
          const service = data.providers.find((p) => p.id === provider);

          return (
            <section className="panel padded provider-card" key={provider}>
              <div className="flex-between">
                <span className="provider-icon">
                  {provider === "codex" ? (
                    <AutoAwesomeOutlined />
                  ) : (
                    <TravelExploreOutlined />
                  )}
                </span>

                <Tag
                  kind={
                    service?.status === "ready"
                      ? "teal"
                      : service?.status
                        ? "amber"
                        : "neutral"
                  }
                >
                  {service?.status?.replaceAll("_", " ") || "Not tested"}
                </Tag>
              </div>

              <h2>{provider === "codex" ? "Codex" : "Antigravity"}</h2>

              <p>
                {provider === "codex"
                  ? "ChatGPT sign-in through the local app-server."
                  : "Persistent ACP server with isolated task sessions and live progress."}
              </p>

              <p className="provider-message">
                {service?.message ||
                  "Test the service to detect its executable, authentication and available models."}
              </p>

              {service?.file && <small>Detected: {service.file}</small>}

              {service?.version && <small>{service.version}</small>}

              {service?.inferenceAt && (
                <small>
                  Last verified:{" "}
                  {new Date(service.inferenceAt).toLocaleString()} ·{" "}
                  {service.selectedModel || "Provider default"} ·{" "}
                  {service.effort || "default"} effort
                </small>
              )}

              {!!service?.checks?.length && (
                <div className="form-stack" aria-label="Service checks">
                  {service.checks.map((check: RecordData, index: number) => (
                    <small key={index}>
                      {check.status === "passed" ? "✓" : "!"} {check.name}:{" "}
                      {check.detail}
                    </small>
                  ))}
                </div>
              )}

              {service?.webSearchHealth && (
                <Alert
                  severity={
                    service.webSearchHealth.status === "ready"
                      ? "success"
                      : "warning"
                  }
                >
                  <b>Internet search: {service.webSearchHealth.status}</b>
                  <br />
                  {service.webSearchHealth.message}
                  <br />
                  <small>
                    Model: {service.webSearchHealth.model || "provider default"}{" "}
                    · {new Date(service.webSearchHealth.at).toLocaleString()}
                  </small>
                </Alert>
              )}
              {service?.status === "ready" && !settings.cloudConsent && (
                <Alert severity="warning">
                  Service verified. Enable AI processing above before running AI
                  workflows.
                </Alert>
              )}

              <div className="form-stack">
                <TextField
                  label="CLI executable path"

                  value={settings.providerPaths?.[provider] || ""}

                  placeholder="Auto-detect"

                  onChange={(e) =>
                    save({
                      providerPaths: {
                        ...settings.providerPaths,

                        [provider]: e.target.value,
                      },
                    })
                  }
                />

                <Button
                  size="small"

                  onClick={() => call("provider.pick", { provider })}
                >
                  Choose executable
                </Button>

                <Autocomplete
                  freeSolo

                  forcePopupIcon

                  openOnFocus

                  options={(service?.models || []).map((m: RecordData) => m.id)}

                  value={settings.models?.[provider] || ""}

                  onChange={(_, value) =>
                    save({
                      models: { ...settings.models, [provider]: value || "" },
                    })
                  }

                  onInputChange={(_, value, reason) => {
                    if (reason === "input")
                      save({
                        models: { ...settings.models, [provider]: value },
                      });
                  }}

                  renderInput={(params) => (
                    <TextField
                      {...params}

                      label="Model"

                      placeholder="Provider default"

                      helperText="Choose a returned model, or leave blank for the provider default. Test again after changing model or effort."
                    />
                  )}
                />

                <div className="tag-row">
                  <Button
                    variant="contained"

                    disabled={!!busy}

                    onClick={() =>
                      call("provider.test", { provider, inference: true })
                    }
                  >
                    {busy === "provider.test" && service?.status === "testing"
                      ? "Testing…"
                      : "Test service"}
                  </Button>

                  <Button
                    variant="outlined"

                    disabled={!!busy}

                    onClick={() => call("provider.login", { provider })}
                  >
                    {provider === "codex" ? "Sign in" : "Check sign-in"}
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={!!busy}
                    onClick={() =>
                      call("provider.webTest", {
                        provider,
                        model: settings.models?.[provider] || "",
                      })
                    }
                  >
                    Test web search
                  </Button>

                  {provider === "antigravity" && (
                    <Button
                      size="small"

                      disabled={!!busy}

                      onClick={() =>
                        call("provider.login", {
                          provider,

                          forceTerminal: true,
                        })
                      }
                    >
                      Open sign-in terminal
                    </Button>
                  )}

                  <Button
                    size="small"

                    onClick={() =>
                      call("url.open", {
                        url:
                          provider === "codex"
                            ? "https://developers.openai.com/codex/cli"
                            : "https://antigravity.google/docs/install?tab=cli",
                      })
                    }
                  >
                    Setup guide
                  </Button>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel padded">
        <h2>Workflow routing</h2>

        <p className="muted">
          Use your default provider or select a provider and model for each
          task.
        </p>

        <div className="routing-grid">
          {[
            ["discovery", "Job discovery"],

            ["documents", "Document drafting"],

            ["portal", "Portal answer suggestions"],
          ].map(([key, label]) => (
            <div key={key}>
              <b>{label}</b>

              <FieldSelect
                label="Provider"

                value={settings.workflowProviders?.[key] || ""}

                onChange={(v) =>
                  save({
                    workflowProviders: {
                      ...settings.workflowProviders,

                      [key]: v,
                    },

                    workflowModels: { ...settings.workflowModels, [key]: "" },
                  })
                }

                options={[
                  { value: "", label: "Use default" },

                  { value: "codex", label: "Codex" },

                  { value: "antigravity", label: "Antigravity" },
                ]}
              />

              <Autocomplete
                freeSolo

                forcePopupIcon

                openOnFocus

                options={
                  data.providers

                    .find(
                      (p) =>
                        p.id ===
                        (settings.workflowProviders?.[key] ||
                          settings.provider),
                    )

                    ?.models?.map((m: RecordData) => m.id) || []
                }

                value={settings.workflowModels?.[key] || ""}

                onChange={(_, value) =>
                  save({
                    workflowModels: {
                      ...settings.workflowModels,

                      [key]: value || "",
                    },
                  })
                }

                onInputChange={(_, value, reason) => {
                  if (reason === "input")
                    save({
                      workflowModels: {
                        ...settings.workflowModels,

                        [key]: value,
                      },
                    });
                }}

                renderInput={(params) => (
                  <TextField
                    {...params}

                    label="Workflow model"

                    placeholder="Use provider default"

                    helperText="Select an available model, or enter an exact model ID. Test the effective provider to refresh models."
                  />
                )}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="profile-columns">
        <section className="panel padded">
          <h2>Application preferences</h2>

          <div className="form-stack">
            <FieldSelect
              label="Webmail"

              value={settings.mailProvider}

              onChange={(mailProvider) => save({ mailProvider })}

              options={[
                { value: "outlook", label: "Outlook" },

                { value: "gmail", label: "Gmail" },
              ]}
            />

            <TextField
              label="Contact email override"

              defaultValue={settings.contactEmail}

              placeholder="Use primary profile email"

              onBlur={(e) => save({ contactEmail: e.target.value })}
            />

            <FieldSelect
              label="Appearance"

              value={settings.theme}

              onChange={(theme) => save({ theme })}

              options={["light", "dark", "system"]}
            />

            <TextField
              type="number"

              label="Listings inspected per direct search"

              defaultValue={settings.maxResults}

              onBlur={(e) => save({ maxResults: Number(e.target.value) })}

              slotProps={{ htmlInput: { min: 5, max: 100 } }}
            />

            <h3>Experimental hidden keyword layer</h3>

            <FormControlLabel
              control={
                <Switch
                  checked={!!settings.hiddenKeywordLayer}

                  onChange={(_, hiddenKeywordLayer) =>
                    save({ hiddenKeywordLayer })
                  }
                />
              }

              label="Add hidden keywords to new CVs and cover letters"
            />

            <p className="muted">
              Disabled by default. Hidden text may be detected by screening
              tools and has no proven ranking benefit. Each document has its own
              reviewable keyword list. This setting affects future packages.
            </p>

            <Divider />

            <div>
              <strong>Chrome profile and real Chrome automation</strong>
              <p className="muted">
                Chrome: {data.chromeInstalled ? "installed" : "not found"}. All
                job searches, public-page JS renders, and portal Apply actions
                run in real Google Chrome via DevTools (CDP) rather than
                Playwright&apos;s launch pipe, while portal/Google sign-in opens
                an un-debugged Clean Chrome window.
              </p>
            </div>

            <div className="form-grid">
              <TextField
                select
                size="small"
                label="Browser profile mode"
                value={profileMode}
                disabled={!!busy}
                onChange={(e) =>
                  save({
                    chromeProfileMode: e.target.value,
                    chromeProfileDirectory: selectedProfile,
                  })
                }
              >
                <MenuItem value="dedicated">
                  Dedicated AcademicApply profile (recommended — can import from Chrome)
                </MenuItem>
                <MenuItem value="google" disabled={!data.chromeProfiles?.exists}>
                  Use my personal Google Chrome profile directly
                </MenuItem>
              </TextField>

              <TextField
                select
                size="small"
                label="Google Chrome profile"
                value={selectedProfile}
                disabled={!!busy || !detectedProfiles.length}
                onChange={(e) =>
                  save({ chromeProfileDirectory: e.target.value })
                }
                helperText={
                  detectedProfiles.length
                    ? `${detectedProfiles.length} Chrome profile(s) detected`
                    : "No Google Chrome profiles found at the configured User Data folder"
                }
              >
                {detectedProfiles.map((p) => (
                  <MenuItem key={p.directory} value={p.directory}>
                    {p.name}
                    {p.userName ? ` (${p.userName})` : ` (${p.directory})`}
                  </MenuItem>
                ))}
              </TextField>
            </div>

            {profileMode === "google" && (
              <Alert severity="info">
                To let AcademicApply attach directly to your running personal
                Chrome (<code>{selectedProfile}</code>), enable{" "}
                <strong>Remote debugging</strong> inside{" "}
                <code>chrome://inspect/#remote-debugging</code> in Chrome and
                click Allow when prompted. Or use{" "}
                <strong>Dedicated profile</strong> +{" "}
                <strong>Import Chrome sessions</strong> below to spawn a real
                separate Chrome automatically without touching your open Chrome
                windows.
              </Alert>
            )}

            <div className="tag-row">
              <Button
                variant="outlined"
                disabled={!!busy || !data.chromeInstalled}
                onClick={() => call("browser.openCleanLogin", {})}
              >
                Open clean Chrome for Google / portal sign-in
              </Button>
              <Button
                variant="outlined"
                disabled={!!busy || !detectedProfiles.length}
                onClick={() =>
                  call("browser.importChromeProfile", {
                    profileDirectory: selectedProfile,
                    userDataDir: chromeDir.trim(),
                  })
                }
              >
                Import Chrome sessions into dedicated profile
              </Button>
            </div>

            <div className="flex-between">
              <TextField
                size="small"
                fullWidth
                label="Custom Chrome User Data directory (optional)"
                value={chromeDir}
                placeholder={data.chromeProfiles?.userDataDir || ""}
                disabled={!!busy}
                onChange={(e) => setChromeDir(e.target.value)}
              />
              <Button
                variant="text"
                disabled={!!busy}
                onClick={() => save({ chromeUserDataDir: chromeDir.trim() })}
              >
                Save path
              </Button>
            </div>
          </div>
        </section>

        <section className="panel padded">
          <h2>Local storage and backup</h2>

          <p className="muted">
            Your database and library are stored on this computer. Keep a backup
            of the database and submission package folders.
          </p>

          <p className="field-caption">DATABASE AND BROWSER PROFILE</p>

          <code className="path-display">{data.dataRoot}</code>

          <p className="field-caption">SUBMISSION PACKAGES</p>

          <code className="path-display">
            {settings.documentRoot || data.dataRoot + "\\packages"}
          </code>

          <div className="form-stack">
            <Button
              variant="outlined"

              startIcon={<FolderOpenOutlined />}

              onClick={() =>
                call(
                  "settings.documentRoot",

                  {},

                  "Package storage updated for future packages.",
                )
              }
            >
              Choose package folder
            </Button>

            <Button
              variant="outlined"

              startIcon={<DownloadOutlined />}

              onClick={() => call("backup")}
            >
              Back up database
            </Button>
          </div>

          <Alert severity="info" sx={{ mt: 2 }}>
            Backups contain personal application information. Store them in a
            protected location. Uninstalling the app preserves your data.
          </Alert>
        </section>
      </div>
    </>
  );
}
