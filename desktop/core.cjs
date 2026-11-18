"use strict";
const crypto = require("node:crypto");
const path = require("node:path");
const { z } = require("zod");
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const slug = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "document";
const hash = (s) =>
  crypto
    .createHash("sha256")
    .update(typeof s === "string" ? s : JSON.stringify(s))
    .digest("hex");
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const inside = (root, file) => {
  const r = path.relative(path.resolve(root), path.resolve(file));
  return (
    r === "" ||
    (!r.startsWith(".." + path.sep) && r !== ".." && !path.isAbsolute(r))
  );
};
const COUNTRIES = {
  Europe: [
    "Austria",
    "Belgium",
    "Bulgaria",
    "Croatia",
    "Cyprus",
    "Czechia",
    "Denmark",
    "Estonia",
    "Finland",
    "France",
    "Germany",
    "Greece",
    "Hungary",
    "Iceland",
    "Ireland",
    "Italy",
    "Latvia",
    "Liechtenstein",
    "Lithuania",
    "Luxembourg",
    "Malta",
    "Netherlands",
    "Norway",
    "Poland",
    "Portugal",
    "Romania",
    "Slovakia",
    "Slovenia",
    "Spain",
    "Sweden",
    "Switzerland",
    "United Kingdom",
  ],
  Australia: ["Australia"],
  Gulf: [
    "Bahrain",
    "Kuwait",
    "Oman",
    "Qatar",
    "Saudi Arabia",
    "United Arab Emirates",
  ],
};
const ALL_COUNTRIES = Object.values(COUNTRIES).flat();
const { SOURCES } = require("./source-catalog.cjs");
const defaultSearch = () => ({
  id: id(),
  name: "Computing and AI academic opportunities",
  countries: ALL_COUNTRIES,
  roles: ["Lecturer", "Assistant Professor", "Postdoctoral"],
  keywords:
    "speech AI, natural language processing, multimodal learning, interpretable AI, graph learning, cognitive impairment",
  sources: SOURCES.filter((s) => !s.access.startsWith("employer")).map(
    (s) => s.id,
  ),
  enabled: true,
  day: 1,
  time: "09:00",
  timezone: "Asia/Shanghai",
  lastRun: null,
  createdAt: now(),
});
const defaultSettings = () => ({
  provider: "codex",
  fallback: false,
  cloudConsent: false,
  hiddenKeywordLayer: false,
  theme: "light",
  providerPaths: { codex: "", antigravity: "" },
  models: { codex: "", antigravity: "" },
  effort: "medium",
  workflowProviders: { discovery: "", documents: "", portal: "" },
  workflowModels: { discovery: "", documents: "", portal: "" },
  mailProvider: "outlook",
  schedulerInstalled: false,
  sourceRoot: "",
  profileVerified: false,
  contactEmail: "",
  documentRoot: "",
  maxResults: 30,
});
const JobSchema = z.object({
  title: z.string().min(2).max(400),
  institution: z.string().max(400).default("Institution not identified"),
  country: z.string().max(100).default("Unknown"),
  url: z.url(),
  applicationUrl: z.url().optional(),
  description: z.string().max(150000).default(""),
  focus: z.string().max(5000).default(""),
  eligibility: z.string().max(10000).default(""),
  requiredDocuments: z.array(z.string().max(200)).max(30).default([]),
  deadline: z.string().nullable().default(null),
  deadlineText: z.string().max(200).default("Not stated"),
  deadlineTimezone: z.string().max(100).default("Not stated"),
  publishedAt: z.string().nullable().default(null),
  official: z.boolean().default(false),
});
function canonicalUrl(raw) {
  const u = new URL(raw);
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
  return u.toString().replace(/\/$/, "");
}
function jobKey(job) {
  return hash(canonicalUrl(job.url));
}
function deadlineInfo(job, at = new Date()) {
  if (!job.deadline)
    return {
      kind: "unknown",
      label: job.deadlineText || "Deadline not stated",
      days: null,
    };
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(job.deadline);
  const ms = Date.parse(dateOnly ? job.deadline + "T23:59:59Z" : job.deadline);
  if (!Number.isFinite(ms))
    return {
      kind: "unknown",
      label: job.deadlineText || "Check deadline",
      days: null,
    };
  const days = Math.ceil((ms - at.getTime()) / 86400000);
  const uncertain =
    dateOnly &&
    (!job.deadlineTimezone || job.deadlineTimezone === "Not stated");
  return {
    kind:
      days < 0
        ? uncertain && days >= -1
          ? "urgent"
          : "expired"
        : days <= 3
          ? "urgent"
          : days <= 7
            ? "soon"
            : "normal",
    label:
      (dateOnly ? job.deadline : new Date(ms).toLocaleDateString("en-GB")) +
      (uncertain ? " · time not stated" : ""),
    days,
  };
}
function matchJob(job, profile = {}) {
  const text = `${job.title} ${job.focus} ${job.description}`.toLowerCase();
  const research =
    /postdoc|research fellow|research associate|research scientist/.test(
      job.title.toLowerCase(),
    );
  const groups = [
    ["Speech and language", /speech|natural language|\bnlp\b|neurolinguist/],
    ["Brain and cognitive health", /cognitiv|alzheimer|dementia|brain|neuro/],
    ["Graph and interpretable learning", /graph|interpretab|explainab|causal/],
    [
      "Multimodal machine learning",
      /multimodal|multi-modal|machine learning|deep learning|artificial intelligence/,
    ],
    [
      "Computing teaching",
      /computing|computer science|software engineering|data science|data analy|teaching|curriculum/,
    ],
  ];
  const reasons = groups
    .filter(([, re]) => re.test(text))
    .map(([label]) => label);
  let score = research
    ? reasons.reduce(
        (n, x) =>
          n +
          ({
            "Speech and language": 25,
            "Brain and cognitive health": 25,
            "Graph and interpretable learning": 18,
            "Multimodal machine learning": 17,
            "Computing teaching": 5,
          }[x] || 0),
        0,
      )
    : reasons.reduce(
        (n, x) =>
          n +
          ({
            "Speech and language": 12,
            "Brain and cognitive health": 12,
            "Graph and interpretable learning": 12,
            "Multimodal machine learning": 18,
            "Computing teaching": 30,
          }[x] || 0),
        0,
      );
  const phd = (profile.education || []).some(
    (e) => /phd|doctor/i.test(e.degree || "") && !e.ongoing,
  );
  if (phd && /ph\.?d|doctor/i.test(text)) {
    score += 10;
    reasons.push("Completed doctorate recorded in profile");
  }
  if (
    !research &&
    (profile.experience || []).some((e) =>
      /lecturer|teach/i.test(e.title || ""),
    )
  )
    score += 8;
  const gaps = ["Work authorization and sponsorship need confirmation"];
  if (
    /must.*(citizen|citizenship|national)|only.*(citizen|national)/i.test(
      job.eligibility || "",
    )
  )
    gaps.push(
      "Possible citizenship restriction — review the official criteria",
    );
  if (!job.official) gaps.push("Official employer listing needs verification");
  if (!job.deadline) gaps.push("Deadline needs confirmation");
  return {
    score: Math.min(100, score),
    label:
      score >= 70
        ? "Strong match"
        : score >= 40
          ? "Worth reviewing"
          : "Broader opportunity",
    track: research ? "Research" : "Teaching / faculty",
    reasons,
    gaps,
  };
}
function nextRun(schedule, from = new Date()) {
  const zone = schedule.timezone || "Asia/Shanghai";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const [hh, mm] = schedule.time.split(":").map(Number);
  for (let i = 0; i < 9; i++) {
    const trial = new Date(from.getTime() + i * 86400000);
    const p = Object.fromEntries(
      formatter.formatToParts(trial).map((v) => [v.type, v.value]),
    );
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, hh, mm);
    let utc = wall;
    for (let j = 0; j < 3; j++) {
      const q = Object.fromEntries(
        formatter.formatToParts(new Date(utc)).map((v) => [v.type, v.value]),
      );
      utc += wall - Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute);
    }
    if (
      new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay() ===
        Number(schedule.day) &&
      utc > from.getTime()
    )
      return new Date(utc).toISOString();
  }
  throw new Error("Unable to calculate scheduled time");
}
function parseJson(text) {
  const clean = String(text)
    .replace(/^```(?:json)?\s*|\s*```$/g, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = Math.min(
      ...["{", "["].map((x) => clean.indexOf(x)).filter((x) => x >= 0),
    );
    const end = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
    if (!Number.isFinite(start) || end < start)
      throw new Error("AI did not return valid JSON");
    return JSON.parse(clean.slice(start, end + 1));
  }
}
module.exports = {
  id,
  now,
  slug,
  hash,
  escape,
  inside,
  COUNTRIES,
  ALL_COUNTRIES,
  SOURCES,
  defaultSearch,
  defaultSettings,
  JobSchema,
  canonicalUrl,
  jobKey,
  deadlineInfo,
  matchJob,
  nextRun,
  parseJson,
};
