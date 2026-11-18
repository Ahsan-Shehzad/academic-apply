"use strict";
const path = require("node:path");
const { exec } = require("./providers.cjs");
function xmlEscape(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
}
function taskXml(executable, args, userId = "") {
  return `<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Description>Run saved AcademicApply job searches when due.</Description></RegistrationInfo><Triggers><LogonTrigger>${userId ? `<UserId>${xmlEscape(userId)}</UserId>` : ""}<Enabled>true</Enabled></LogonTrigger><TimeTrigger><Repetition><Interval>PT30M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>2026-01-01T00:00:00</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers><Principals><Principal id="Author">${userId ? `<UserId>${xmlEscape(userId)}</UserId>` : ""}<LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT45M</ExecutionTimeLimit><Enabled>true</Enabled></Settings><Actions Context="Author"><Exec><Command>${xmlEscape(executable)}</Command><Arguments>${xmlEscape(args)}</Arguments></Exec></Actions></Task>`;
}
async function installScheduler(executable, appPath, packaged) {
  const fs = require("node:fs");
  const os = require("node:os");
  const args =
    (packaged ? "" : `"${appPath}" `) + "--run-schedules --background";
  const file = path.join(
    os.tmpdir(),
    "academicapply-task-" + process.pid + ".xml",
  );
  try {
    const identity = await exec(
      path.join(process.env.SystemRoot, "System32", "whoami.exe"),
      ["/user", "/fo", "csv", "/nh"],
    );
    const userId = identity.stdout.match(/S-1-5-[0-9-]+/)?.[0];
    if (!userId)
      throw new Error(
        "Cannot determine the Windows user for background scheduling.",
      );
    fs.writeFileSync(
      file,
      "\uFEFF" + taskXml(executable, args, userId),
      "utf16le",
    );
    await exec(path.join(process.env.SystemRoot, "System32", "schtasks.exe"), [
      "/Create",
      "/TN",
      "AcademicApply Weekly Discovery",
      "/XML",
      file,
      "/F",
    ]);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  return {
    message:
      "Windows scheduler installed. Due searches are checked every 30 minutes and at sign-in.",
  };
}
async function removeScheduler() {
  await exec(path.join(process.env.SystemRoot, "System32", "schtasks.exe"), [
    "/Delete",
    "/TN",
    "AcademicApply Weekly Discovery",
    "/F",
  ]);
  return { message: "Windows scheduler removed." };
}
module.exports = { installScheduler, removeScheduler, taskXml };
