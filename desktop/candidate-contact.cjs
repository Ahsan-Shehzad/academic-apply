"use strict";
const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");
const labels = {
  linkedin: "LinkedIn",
  google_scholar: "Google Scholar",
  web_of_science: "Web of Science",
  scopus: "Scopus",
  orcid: "ORCID",
  github: "GitHub",
  researchgate: "ResearchGate",
};
function contactFromHtml(html) {
  const $ = cheerio.load(html);
  const root = $("header .identity .contact-stack").first();
  const entries = [];
  root.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const label = $(el).text().trim();
    if (/^(https:\/\/|mailto:)/i.test(href)) entries.push({ label, url: href });
  });
  const phones = [];
  root.find("span.contact-item").each((_, el) => {
    const value = $(el).text().trim();
    if (/^\+\d[\d\s()-]{7,}$/.test(value)) phones.push(value);
  });
  const address = root
    .find('.contact-item:has(use[href="#i-location"])')
    .first()
    .text()
    .trim();
  return {
    entries,
    phones,
    address,
    name: $("header .identity .name").first().text().trim(),
  };
}
function candidateContact(profile, settings = {}) {
  const c = profile.personal?.contact || {};
  let source = { entries: [], phones: [] };
  if (settings.sourceRoot) {
    const file = path.join(settings.sourceRoot, "final-cv", "index.html");
    if (fs.existsSync(file)) {
      const extracted = contactFromHtml(fs.readFileSync(file, "utf8"));
      const normalize = (s) =>
        String(s || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
      const candidate = normalize(profile.personal?.name);
      if (candidate.length > 5 && normalize(extracted.name).includes(candidate))
        source = extracted;
    }
  }
  const primary =
    settings.contactEmail ||
    c.emails?.find((e) => e.use === "primary")?.value ||
    c.emails?.[0]?.value;
  const emails = [
    primary,
    ...source.entries
      .filter((e) => e.url.startsWith("mailto:"))
      .map((e) => e.url.slice(7)),
  ].filter(Boolean);
  const phones = [
    ...(c.phones || []).map(
      (p) => p.formatted || [p.prefix, p.number].filter(Boolean).join(" "),
    ),
    ...source.phones,
  ];
  const links = [
    ...source.entries.filter((e) => /^https:\/\//.test(e.url)),
    ...(c.links || []).map((l) => ({
      label:
        labels[l.label] || String(l.label || "Profile").replaceAll("_", " "),
      url: l.url,
    })),
  ].filter((l) => /^https:\/\//.test(l.url));
  const work = c.addresses?.find((a) => a.include_in_default_cv);
  const location =
    source.address ||
    (work
      ? [
          work.address_part_1,
          work.address_part_2,
          work.city,
          work.state_or_province,
          work.country,
        ]
          .filter(Boolean)
          .join(", ")
      : [c.location?.city, c.location?.country].filter(Boolean).join(", "));
  return {
    emails: [...new Set(emails)].slice(0, 2),
    phones: [
      ...new Map(
        phones.filter(Boolean).map((p) => [p.replace(/\D/g, ""), p]),
      ).values(),
    ],
    location,
    links: [
      ...new Map(links.map((l) => [l.url.replace(/\/$/, ""), l])).values(),
    ],
  };
}
module.exports = { candidateContact, contactFromHtml };
