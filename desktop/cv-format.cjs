"use strict";
const { unzipSync, zipSync } = require("fflate");
// Patch the existing Word XML so candidate text, hyperlinks and contact icons stay intact.
function removeCvHeadingIcons(buffer) {
  const entries = unzipSync(buffer);
  if (!entries["word/document.xml"])
    throw new Error("This file is not a readable Word document.");
  let removed = 0;
  const xml = Buffer.from(entries["word/document.xml"]).toString("utf8");
  const revised = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!/<w:pStyle\b[^>]*w:val="Heading[1-9]"/.test(paragraph))
      return paragraph;
    let afterIcon = false;
    return paragraph.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) => {
      if (/<w:drawing\b/.test(run)) {
        removed++;
        afterIcon = true;
        return "";
      }
      if (
        afterIcon &&
        /<w:t\b[^>]*>\s*<\/w:t>/.test(run) &&
        !/<w:(?:drawing|br|tab)\b/.test(run)
      ) {
        afterIcon = false;
        return "";
      }
      afterIcon = false;
      return run;
    });
  });
  if (!removed) return { buffer, removed };
  entries["word/document.xml"] = Buffer.from(revised, "utf8");
  return { buffer: Buffer.from(zipSync(entries, { level: 6 })), removed };
}
module.exports = { removeCvHeadingIcons };
