"use strict";

const period = (start, end, ongoing, years = false) => {
  const format = (value) => {
    if (!value) return "";
    if (years) return String(value).slice(0, 4);
    const [year, month] = String(value).split("-");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return month && months[+month - 1] ? `${months[+month - 1]} ${year}` : year;
  };
  return [format(start), ongoing ? "Present" : format(end)]
    .filter(Boolean)
    .join(" – ");
};
const newestFirst = (items) =>
  [...items].sort(
    (a, b) =>
      Number(!!b.ongoing) - Number(!!a.ongoing) ||
      String(b.end || b.start || "").localeCompare(
        String(a.end || a.start || ""),
      ) ||
      String(b.start || "").localeCompare(String(a.start || "")),
  );

function academicCv(profile) {
  const personal = profile.personal;
  const sections = [];
  const add = (heading, text) => {
    if (text?.trim()) sections.push({ heading, text });
  };
  const summary = (personal.summary || personal.headline || "")
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .slice(0, 3)
    .join(" ");
  add("Academic Profile", summary);
  add(
    "Education",
    newestFirst(profile.education || [])
      .map((e) =>
        [
          `${e.degree}\t${period(e.start, e.end, e.ongoing, true)}`,
          [e.institution, e.location].filter(Boolean).join(", "),
          e.thesis ? `Thesis: ${e.thesis}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n"),
  );
  const groups = { teaching: [], research: [], professional: [] };
  for (const entry of profile.experience || []) {
    const group =
      /research associate|research assistant|postdoc|research fellow|research scientist/i.test(
        entry.title,
      )
        ? "research"
        : /lecturer|professor|lab engineer|teaching fellow|instructor/i.test(
              entry.title,
            )
          ? "teaching"
          : "professional";
    groups[group].push(entry);
  }
  for (const [group, heading] of [
    ["teaching", "Teaching and Academic Appointments"],
    ["research", "Research Experience"],
    ["professional", "Professional Experience"],
  ]) {
    add(
      heading,
      newestFirst(groups[group])
        .map((e) =>
          [
            `${e.title}\t${period(e.start, e.end, e.ongoing)}`,
            e.organization || e.institution,
            e.delivery_location
              ? `Programme delivery: ${e.delivery_location}`
              : "",
            ...(e.bullets || e.details || []).map((b) => `• ${b}`),
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n"),
    );
  }
  add(
    "Research Interests",
    (personal.research_interests || []).map((s) => `• ${s}`).join("\n"),
  );
  add(
    "Selected Research and Applied Projects",
    (profile.projects || [])
      .slice(0, 8)
      .map((p) =>
        [
          p.title || p.name,
          p.description ||
            p.summary ||
            (p.bullets || p.details || []).join("\n"),
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n"),
  );
  return {
    title: personal.name,
    subtitle: "Academic Curriculum Vitae",
    sections,
    evidence: [],
  };
}

function orderAcademicSections(content, job = {}) {
  const research =
    /postdoc|research fellow|research associate|research scientist/i.test(
      job.title || "",
    ) || /research.intensive|research.track/i.test(job.description || "");
  const order = research
    ? [
        "Academic Profile",
        "Education",
        "Research Interests",
        "Research Experience",
        "Peer Reviewed Publications",
        "Manuscripts Under Review",
        "Selected Research and Applied Projects",
        "Teaching and Academic Appointments",
        "Professional Experience",
        "Technical and Teaching Skills",
        "Honours and Awards",
        "Academic Service",
        "Academic Memberships",
        "Professional Certifications",
        "Languages",
      ]
    : [
        "Academic Profile",
        "Education",
        "Teaching and Academic Appointments",
        "Research Experience",
        "Research Interests",
        "Peer Reviewed Publications",
        "Manuscripts Under Review",
        "Selected Research and Applied Projects",
        "Professional Experience",
        "Technical and Teaching Skills",
        "Honours and Awards",
        "Academic Service",
        "Academic Memberships",
        "Professional Certifications",
        "Languages",
      ];
  const rank = (heading) =>
    order.includes(heading) ? order.indexOf(heading) : 99;
  content.sections.sort((a, b) => rank(a.heading) - rank(b.heading));
  return content;
}

module.exports = { academicCv, orderAcademicSections, period, newestFirst };
