const { spawn } = require("node:child_process");
const readline = require("node:readline");
const child = spawn(
  process.env.LOCALAPPDATA + "\\agy\\bin\\agy.exe",
  ["acp", "--stdio", "--sandbox", "--include-default-customizations=false"],
  { cwd: process.cwd(), windowsHide: true },
);
let next = 0;
const pending = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.id !== undefined && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error
      ? p.reject(new Error(JSON.stringify(m.error)))
      : p.resolve(m.result);
  } else if (m.method === "session/request_permission") {
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: m.id,
        result: { outcome: { outcome: "cancelled" } },
      }) + "\n",
    );
  } else if (m.method === "session/update") {
    if (m.params.update.sessionUpdate === "agent_message_chunk")
      process.stdout.write(JSON.stringify(m.params.update) + "\n");
  }
});
child.stderr.on("data", (d) => process.stderr.write(d));
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
    );
  });
}
const timer = setTimeout(() => {
  console.error("timeout");
  child.kill();
}, 90000);
(async () => {
  console.log(
    "INIT",
    JSON.stringify(
      await request("initialize", {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "academicapply", version: "1.2.0" },
      }),
    ),
  );
  const s = await request("session/new", {
    cwd: process.cwd(),
    mcpServers: [],
  });
  console.log("SESSION", JSON.stringify(s));
  if (process.argv.includes("--prompt")) {
    console.log(
      "RESULT",
      JSON.stringify(
        await request("session/prompt", {
          sessionId: s.sessionId,
          prompt: [
            {
              type: "text",
              text: "Return exactly ACP_OK in your final answer. Do not use tools.",
            },
          ],
        }),
      ),
    );
  }
  child.kill();
  clearTimeout(timer);
})().catch((e) => {
  console.error(e);
  child.kill();
  clearTimeout(timer);
  process.exitCode = 1;
});
