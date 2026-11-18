"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { ImageRun, TextRun } = require("docx");
function icon(name, size = 11) {
  const file = path.join(
    __dirname,
    "..",
    "resources",
    "cv-icons",
    name + ".png",
  );
  if (!fs.existsSync(file)) return [];
  return [
    new ImageRun({
      type: "png",
      data: fs.readFileSync(file),
      transformation: { width: size, height: size },
      altText: {
        title: "",
        description: "Decorative icon; meaning is in the adjacent text",
        name,
      },
    }),
    new TextRun({ text: "  ", size: 19 }),
  ];
}
function networkIcon(url = "") {
  try {
    const host = new URL(url).hostname;
    return /linkedin/.test(host)
      ? "i-brand-linkedin"
      : /scholar.google/.test(host)
        ? "i-brand-scholar"
        : /webofscience/.test(host)
          ? "i-brand-webofscience"
          : /scopus/.test(host)
            ? "i-brand-scopus"
            : /orcid/.test(host)
              ? "i-brand-orcid"
              : /github/.test(host)
                ? "i-brand-github"
                : /researchgate/.test(host)
                  ? "i-brand-researchgate"
                  : url.startsWith("mailto:")
                    ? "i-mail"
                    : url.startsWith("tel:")
                      ? "i-phone"
                      : null;
  } catch {
    return null;
  }
}
function sectionIcon(heading) {
  return /profile/i.test(heading)
    ? "i-verified"
    : /education|teaching|certification/i.test(heading)
      ? "i-school"
      : /publication|manuscript/i.test(heading)
        ? "i-article"
        : /research|project/i.test(heading)
          ? "i-science"
          : /award|honour/i.test(heading)
            ? "i-star"
            : /language/i.test(heading)
              ? "i-language"
              : /skill/i.test(heading)
                ? "i-code"
                : /service|member|referee/i.test(heading)
                  ? "i-verified"
                  : /experience|appointment/i.test(heading)
                    ? "i-work"
                    : null;
}
module.exports = { icon, networkIcon, sectionIcon };
