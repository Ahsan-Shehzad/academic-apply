"use strict";
const readline = require("node:readline");
const endpoint = process.env.ACADEMICAPPLY_TOOL_ENDPOINT;
const token = process.env.ACADEMICAPPLY_TOOL_TOKEN;
if (!endpoint || new URL(endpoint).hostname !== "127.0.0.1" || !token)
  process.exit(1);
readline.createInterface({ input: process.stdin }).on("line", async (line) => {
  let request;
  try {
    request = JSON.parse(line);
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(120000),
    });
    if (request.id !== undefined) {
      const text = await r.text();
      process.stdout.write(text + "\n");
    }
  } catch (e) {
    if (request?.id !== undefined)
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32000,
            message: "Browser bridge unavailable: " + e.message,
          },
        }) + "\n",
      );
  }
});
