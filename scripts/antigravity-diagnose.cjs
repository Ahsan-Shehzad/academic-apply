const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const cli = path.join(process.env.LOCALAPPDATA, "agy", "bin", "agy.exe");
const prompt =
  'Draft a formal academic cover letter for Example Candidate applying for Lecturer in Computing at Example University. Verified facts: PhD in computing; teaches Python and software engineering; researches speech AI for cognitive impairment detection. Use only these facts. Return ONLY valid JSON {"title":"Example Candidate","subtitle":"Cover letter","sections":[{"heading":"","text":"Dear Selection Committee,\\n\\n..."}],"evidence":[]}. Write 350 to 400 words. Do not create files or use tools. Return the complete letter text in the response.';
async function run(label, keepOpen, print = false) {
  const directory = path.resolve(".test-data", "agy-diagnosis", label);
  fs.mkdirSync(directory, { recursive: true });
  const args = print
    ? [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--settings",
        JSON.stringify({ agentMode: "", toolPermission: "strict" }),
      ]
    : [
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--mode",
        "plan",
        "--sandbox",
        "--disable-slash-commands",
      ];
  args.push("--model", "gemini-3.8-flash-high", "--effort", "high");
  return new Promise((resolve) => {
    const child = spawn(cli, args, {
      cwd: directory,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const events = [];
    let stderr = "",
      response = "";
    const timer = setTimeout(() => child.kill(), 150000);
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        return;
      }
      events.push(m);
      if (m.event === "result") {
        response = m.result?.response || "";
        console.log(
          label,
          JSON.stringify({
            status: m.result?.status,
            chars: response.length,
            error: m.result?.error,
            resultKeys: Object.keys(m.result || {}),
          }),
        );
        child.stdin.end();
      }
    });
    child.stderr.on("data", (data) => {
      stderr = (stderr + data).slice(-10000);
    });
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      clearTimeout(timer);
      const summary = {
        label,
        code,
        responseChars: response.length,
        events: events.map((m) => ({
          event: m.event,
          type: m.step_update?.step_type,
          state: m.step_update?.state,
          tool: m.step_update?.tool_name,
          deltaChars: m.step_update?.text_delta?.length,
          result: m.result
            ? {
                status: m.result.status,
                responseChars: m.result.response?.length,
                error: m.result.error,
              }
            : undefined,
        })),
        stderr,
      };
      fs.writeFileSync(
        path.join("qa", "agy-" + label + ".json"),
        JSON.stringify({ summary, raw: events }, null, 2),
      );
      resolve(summary);
    });
    if (!print)
      child.stdin.write(
        JSON.stringify({ event: "user", message: { content: prompt } }) + "\n",
      );
    if (!keepOpen || print) child.stdin.end();
  });
}
(async () => {
  const results = await Promise.allSettled([
    run("original-eof", false),
    run("open-stdin", true),
    run("print-normal", false, true),
  ]);
  for (const r of results)
    console.log(
      r.status === "fulfilled"
        ? JSON.stringify({
            label: r.value.label,
            code: r.value.code,
            chars: r.value.responseChars,
          })
        : String(r.reason),
    );
})().catch(console.error);
