"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
function selectedSkills(workflow, home = os.homedir()) {
  const names =
    workflow === "portal"
      ? ["professional-job-application", "chrome-browser-control"]
      : ["professional-job-application"];
  const roots = [
    path.join(home, ".codex", "skills"),
    path.join(home, ".agents", "skills"),
    path.join(home, ".gemini", "skills"),
    path.join(home, ".gemini", "antigravity", "skills"),
    path.join(home, ".gemini", "antigravity", "global_skills"),
  ];
  return names.flatMap((name) => {
    const file = roots
      .map((r) => path.join(r, name, "SKILL.md"))
      .find((f) => fs.existsSync(f));
    return file
      ? [
          {
            name,
            path: file,
            text: fs.readFileSync(file, "utf8").slice(0, 14000),
          },
        ]
      : [];
  });
}
module.exports = { selectedSkills };
