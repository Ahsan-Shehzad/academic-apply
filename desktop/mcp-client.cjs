"use strict";
const { safeUrl } = require("./discovery.cjs");
function encodeHeader(value) {
  const text = String(value);
  return /^[\x09\x20-\x7e]*$/.test(text) &&
    text.trim() === text &&
    !/^=\?base64\?.*\?=$/.test(text)
    ? text
    : "=?base64?" + Buffer.from(text, "utf8").toString("base64") + "?=";
}
function headerBindings(schema) {
  const bindings = [],
    names = new Set();
  function visit(node, path, reachable) {
    if (!node || typeof node !== "object") return;
    if (Object.hasOwn(node, "x-mcp-header")) {
      const name = node["x-mcp-header"];
      if (
        !reachable ||
        !path.length ||
        typeof name !== "string" ||
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
        !["string", "integer", "boolean"].includes(node.type) ||
        names.has(name.toLowerCase())
      )
        throw new Error("Invalid MCP tool parameter header schema");
      names.add(name.toLowerCase());
      bindings.push({ name, path, type: node.type });
    }
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue;
      if (key === "properties" && reachable)
        for (const [field, child] of Object.entries(value))
          visit(child, [...path, field], true);
      else if (Array.isArray(value))
        value.forEach((child) => visit(child, path, false));
      else visit(value, path, false);
    }
  }
  visit(schema || {}, [], true);
  return bindings;
}
class McpClient {
  constructor(config, options = {}) {
    this.config = config;
    this.fetch = options.fetch || fetch;
    this.validateUrl = options.validateUrl || safeUrl;
    this.token = options.token || "";
    this.counter = 0;
    this.session = null;
    this.bindings = new Map();
  }
  async rpc(method, params = {}, signal, notification = false) {
    await this.validateUrl(this.config.endpoint);
    const modern = this.config.protocol !== "2025-11-25";
    const id = ++this.counter;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": this.config.protocol || "2026-07-28",
    };
    if (modern) {
      headers["Mcp-Method"] = method;
      if (params.name) headers["Mcp-Name"] = encodeHeader(params.name);
      if (method === "tools/call")
        for (const binding of this.bindings.get(params.name) || []) {
          let value = params.arguments;
          for (const field of binding.path)
            value =
              value && typeof value === "object" && Object.hasOwn(value, field)
                ? value[field]
                : undefined;
          if (value === undefined || value === null) continue;
          if (
            (binding.type === "integer" && !Number.isSafeInteger(value)) ||
            (binding.type !== "integer" && typeof value !== binding.type)
          )
            throw new Error("Invalid MCP header argument type");
          headers["Mcp-Param-" + binding.name] = encodeHeader(value);
        }
      params = {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": {
            name: "academicapply",
            version: "1.1.0",
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      };
    } else if (this.session) headers["Mcp-Session-Id"] = this.session;
    if (this.token) headers.Authorization = "Bearer " + this.token;
    const response = await this.fetch(this.config.endpoint, {
      method: "POST",
      redirect: "error",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(!notification ? { id } : {}),
        method,
        params,
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(
        `MCP returned HTTP ${response.status}${[401, 403].includes(response.status) ? " — check the provider's authentication requirements" : ""}`,
      );
    if (!modern && response.headers.get("mcp-session-id"))
      this.session = response.headers.get("mcp-session-id");
    if (notification) {
      await response.body?.cancel();
      return {};
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "",
      bytes = 0;
    const sse = (response.headers.get("content-type") || "").includes(
      "text/event-stream",
    );
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 5e6)
          throw new Error("MCP response exceeded the size limit");
        text += decoder.decode(chunk.value, { stream: true });
        if (sse) {
          const events = text.replace(/\r\n/g, "\n").split("\n\n");
          text = events.pop();
          for (const event of events) {
            const data = event
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            const message = JSON.parse(data);
            if (message.id === id) return this.result(message);
          }
        }
      }
      if (sse) throw new Error("MCP stream ended without the requested result");
      const message = JSON.parse(text);
      if (message.id !== id)
        throw new Error("MCP response ID did not match the request");
      return this.result(message);
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  result(message) {
    if (message.error)
      throw new Error(
        String(message.error.message || "MCP request failed")
          .split(this.token || "\u0000")
          .join("[redacted]"),
      );
    if (!message.result) throw new Error("MCP returned no result");
    return message.result;
  }
  async connect(signal) {
    if (this.config.protocol !== "2025-11-25") return;
    const info = await this.rpc(
      "initialize",
      {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "academicapply", version: "1.1.0" },
      },
      signal,
    );
    if (info.protocolVersion !== "2025-11-25")
      throw new Error("Server negotiated an unsupported MCP version");
    await this.rpc("notifications/initialized", {}, signal, true);
  }
  async tools(signal) {
    const tools = [];
    let cursor;
    for (let page = 0; page < 10; page++) {
      const result = await this.rpc(
        "tools/list",
        cursor ? { cursor } : {},
        signal,
      );
      if (!Array.isArray(result.tools))
        throw new Error("MCP tools/list returned no tools array");
      for (const tool of result.tools) {
        try {
          this.bindings.set(tool.name, headerBindings(tool.inputSchema));
          tools.push(tool);
        } catch {
          /* Invalid annotated definitions are excluded per the HTTP binding. */
        }
      }
      if (!result.nextCursor) return tools.slice(0, 1000);
      if (cursor === result.nextCursor)
        throw new Error("MCP tool pagination repeated its cursor");
      cursor = result.nextCursor;
    }
    throw new Error("MCP tool list exceeded the pagination limit");
  }
  async close() {
    if (!this.session) return;
    await this.fetch(this.config.endpoint, {
      method: "DELETE",
      redirect: "error",
      headers: {
        "Mcp-Session-Id": this.session,
        "MCP-Protocol-Version": "2025-11-25",
        ...(this.token ? { Authorization: "Bearer " + this.token } : {}),
      },
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }
}
module.exports = { McpClient, headerBindings, encodeHeader };
