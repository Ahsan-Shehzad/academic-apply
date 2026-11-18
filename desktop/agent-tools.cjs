"use strict";
const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");
async function createToolBridge(tools, execute, signal) {
  const token = crypto.randomBytes(32).toString("hex");
  let calls = 0;
  let chain = Promise.resolve();
  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (
      req.method !== "POST" ||
      req.headers.authorization !== `Bearer ${token}`
    ) {
      res.writeHead(403);
      res.end('{"error":"Unauthorized"}');
      return;
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 100000) {
        res.writeHead(413);
        res.end();
        return;
      }
    }
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const send = (result) =>
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
    if (msg.id === undefined) {
      res.writeHead(202);
      res.end();
      return;
    }
    if (msg.method === "initialize")
      return send({
        protocolVersion: msg.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "academicapply_portal", version: "1.3.0" },
      });
    if (msg.method === "ping") return send({});
    if (msg.method === "tools/list")
      return send({
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    if (msg.method !== "tools/call") {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32601, message: "Unknown method" },
        }),
      );
      return;
    }
    try {
      if (signal?.aborted) throw new Error("Agent task cancelled");
      if (++calls > 45)
        throw new Error(
          "Browser action limit reached. Inspect the form and continue in a new task.",
        );
      if (!tools.some((t) => t.name === msg.params?.name))
        throw new Error("Unknown tool");
      const operation = chain.then(() => {
        if (signal?.aborted) throw new Error("Agent task cancelled");
        return execute(msg.params.name, msg.params.arguments || {});
      });
      chain = operation.catch(() => {});
      const result = await operation;
      send({ content: [{ type: "text", text: JSON.stringify(result) }] });
    } catch (e) {
      send({ isError: true, content: [{ type: "text", text: e.message }] });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
  return {
    tools,
    execute: async (name, args) => {
      if (signal?.aborted) throw new Error("Agent task cancelled");
      if (++calls > 45) throw new Error("Browser action limit reached");
      const operation = chain.then(() => execute(name, args));
      chain = operation.catch(() => {});
      return operation;
    },
    mcpServers: [
      {
        name: "academicapply_portal",
        command: process.execPath,
        args: [path.join(__dirname, "stdio-mcp.cjs")],
        env: [
          { name: "ELECTRON_RUN_AS_NODE", value: "1" },
          { name: "ACADEMICAPPLY_TOOL_ENDPOINT", value: endpoint },
          { name: "ACADEMICAPPLY_TOOL_TOKEN", value: token },
        ],
      },
    ],
    close: () => {
      server.closeAllConnections();
      server.close();
    },
    endpoint,
    token,
  };
}
module.exports = { createToolBridge };
