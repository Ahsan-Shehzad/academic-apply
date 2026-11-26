"use strict";
const { setTimeout: delay } = require("node:timers/promises");
const { execFileSync } = require("node:child_process");
const http = require("node:http");
const https = require("node:https");
const { Readable } = require("node:stream");
const zlib = require("node:zlib");

const DEFAULT_NO_PROXY = "localhost,127.0.0.1,::1,<local>";
let cachedSystemProxy = { at: 0, value: null };

function normalizeProxyUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return "http://" + s;
}

function parseWindowsProxyServer(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (!text.includes("=")) return normalizeProxyUrl(text);
  const parts = Object.fromEntries(
    text
      .split(";")
      .map((entry) => entry.trim().split("="))
      .filter((pair) => pair.length === 2 && pair[0] && pair[1])
      .map(([k, v]) => [k.trim().toLowerCase(), v.trim()]),
  );
  return normalizeProxyUrl(parts.https || parts.http || "");
}

function discoverSystemProxy({
  env = process.env,
  platform = process.platform,
  protocol = "https:",
  readRegistry,
  forceRefresh = false,
} = {}) {
  const envProxy =
    protocol === "http:"
      ? env.HTTP_PROXY || env.http_proxy || env.HTTPS_PROXY || env.https_proxy || ""
      : env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || "";
  if (envProxy.trim()) {
    return {
      url: normalizeProxyUrl(envProxy),
      bypass: String(env.NO_PROXY || env.no_proxy || DEFAULT_NO_PROXY)
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  if (platform !== "win32") return null;
  if (!forceRefresh && Date.now() - cachedSystemProxy.at < 60000)
    return cachedSystemProxy.value;
  let value = null;
  try {
    const out = readRegistry
      ? readRegistry()
      : execFileSync(
          "reg.exe",
          [
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
          ],
          { windowsHide: true, encoding: "utf8", timeout: 1500 },
        );
    const enabled = /ProxyEnable\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(out);
    const server = /ProxyServer\s+REG_SZ\s+([^\r\n]+)/i.exec(out);
    const override = /ProxyOverride\s+REG_SZ\s+([^\r\n]+)/i.exec(out);
    if (enabled && parseInt(enabled[1], 16) === 1 && server?.[1]) {
      const url = parseWindowsProxyServer(server[1]);
      if (url) {
        value = {
          url,
          bypass: [
            "localhost",
            "127.0.0.1",
            "::1",
            "<local>",
            ...(override?.[1] || "")
              .split(/[;,]/)
              .map((s) => s.trim())
              .filter(Boolean),
          ],
        };
      }
    }
  } catch {}
  cachedSystemProxy = { at: Date.now(), value };
  return value;
}

function shouldBypassProxy(hostname, bypassList = []) {
  const host = String(hostname || "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  if (!host) return true;
  if (
    host === "localhost" ||
    host === "::1" ||
    host === "127.0.0.1" ||
    host.startsWith("127.")
  )
    return true;
  for (const rawRule of bypassList) {
    const rule = String(rawRule || "").trim().toLowerCase();
    if (!rule) continue;
    if (rule === "<local>" && !host.includes(".")) return true;
    if (rule === "*" || rule === host) return true;
    const suffix = rule.startsWith("*.")
      ? rule.slice(1)
      : rule.startsWith(".")
        ? rule
        : null;
    if (suffix && (host.endsWith(suffix) || host === suffix.slice(1)))
      return true;
  }
  return false;
}

function proxyEnvPatch(proxy = discoverSystemProxy(), baseEnv = process.env) {
  if (!proxy?.url) return {};
  const bypass = [
    ...new Set([
      "localhost",
      "127.0.0.1",
      "::1",
      "<local>",
      ...(proxy.bypass || []),
      ...String(baseEnv.NO_PROXY || baseEnv.no_proxy || "")
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ]),
  ].join(",");
  return {
    HTTP_PROXY: baseEnv.HTTP_PROXY || proxy.url,
    HTTPS_PROXY: baseEnv.HTTPS_PROXY || proxy.url,
    http_proxy: baseEnv.http_proxy || proxy.url,
    https_proxy: baseEnv.https_proxy || proxy.url,
    NO_PROXY: bypass,
    no_proxy: bypass,
  };
}

function buildHeaders(rawHeaders) {
  const out = {};
  if (!rawHeaders) return out;
  if (typeof rawHeaders.forEach === "function") {
    rawHeaders.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  for (const [k, v] of Object.entries(rawHeaders))
    if (v !== undefined) out[k] = v;
  return out;
}

function nodeHttpResponse(res, targetUrl) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers || {})) {
    if (Array.isArray(value))
      for (const item of value) headers.append(key, item);
    else if (value !== undefined) headers.set(key, String(value));
  }
  const encoding = String(res.headers?.["content-encoding"] || "")
    .trim()
    .toLowerCase();
  let stream = res;
  if (encoding === "gzip" || encoding === "x-gzip")
    stream = res.pipe(zlib.createGunzip());
  else if (encoding === "deflate") stream = res.pipe(zlib.createInflate());
  else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress());
  const webBody = Readable.toWeb(stream);
  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode || 0,
    statusText: res.statusMessage || "",
    url: String(targetUrl),
    headers,
    body: webBody,
    async text() {
      const reader = webBody.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      return text + decoder.decode();
    },
    async json() {
      return JSON.parse(await this.text());
    },
  };
}

function fetchViaHttpProxy(targetUrl, options = {}, proxyUrl) {
  const target = targetUrl instanceof URL ? targetUrl : new URL(targetUrl);
  const proxy = new URL(proxyUrl);
  const signal = options.signal;
  if (signal?.aborted)
    return Promise.reject(
      signal.reason || new DOMException("The operation was aborted.", "AbortError"),
    );

  return new Promise((resolve, reject) => {
    let settled = false;
    let activeReq = null;
    let activeSocket = null;
    const fail = (err, fallbackDirect = false) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      if (fallbackDirect) {
        fetch(target.toString(), options).then(resolve, reject);
        return;
      }
      reject(err);
    };
    const onAbort = () => {
      const err =
        signal.reason ||
        new DOMException("The operation was aborted.", "AbortError");
      activeReq?.destroy(err);
      activeSocket?.destroy(err);
      fail(err);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const reqHeaders = {
      "accept-encoding": "gzip, deflate, br",
      ...buildHeaders(options.headers),
    };
    const proxyPort = Number(proxy.port) || (proxy.protocol === "https:" ? 443 : 80);
    const targetPort =
      Number(target.port) || (target.protocol === "https:" ? 443 : 80);

    if (target.protocol === "http:") {
      const req = http.request(
        {
          host: proxy.hostname,
          port: proxyPort,
          method: options.method || "GET",
          path: target.toString(),
          headers: { ...reqHeaders, Host: target.host },
        },
        (res) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", onAbort);
          resolve(nodeHttpResponse(res, target));
        },
      );
      activeReq = req;
      req.on("error", (err) => fail(err, err.code === "ECONNREFUSED"));
      if (options.body) req.write(options.body);
      req.end();
      return;
    }

    const authority = `${target.hostname}:${targetPort}`;
    const connectReq = http.request({
      host: proxy.hostname,
      port: proxyPort,
      method: "CONNECT",
      path: authority,
      headers: { Host: authority },
    });
    activeReq = connectReq;
    connectReq.on("connect", (res, socket) => {
      activeSocket = socket;
      if (res.statusCode !== 200) {
        socket.destroy();
        return fail(new Error(`Proxy CONNECT failed with HTTP ${res.statusCode}`));
      }
      if (signal?.aborted) {
        socket.destroy();
        return onAbort();
      }
      const req = https.request(
        {
          socket,
          servername: target.hostname,
          method: options.method || "GET",
          path: target.pathname + target.search,
          headers: { ...reqHeaders, Host: target.host },
        },
        (httpsRes) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", onAbort);
          resolve(nodeHttpResponse(httpsRes, target));
        },
      );
      activeReq = req;
      req.on("error", (err) => fail(err));
      socket.on("error", (err) => fail(err));
      if (options.body) req.write(options.body);
      req.end();
    });
    connectReq.on("error", (err) => fail(err, err.code === "ECONNREFUSED"));
    connectReq.end();
  });
}

async function systemFetch(url, options = {}) {
  const target = url instanceof URL ? url : new URL(url);
  const proxy = discoverSystemProxy({ protocol: target.protocol });
  if (proxy?.url && !shouldBypassProxy(target.hostname, proxy.bypass))
    return fetchViaHttpProxy(target, options, proxy.url);
  return fetch(target.toString(), options);
}
function accessIssue(error) {
  const message = String(error?.message || error || "Source unavailable");
  const statusCode =
    error?.statusCode || Number(message.match(/HTTP\s+(\d{3})/i)?.[1]) || null;
  let status = "unavailable",
    action = "Try the official source or use an employer vacancy link.";
  if (/manual source|manual search/i.test(message)) {
    status = "manual";
    action = "Open the official search, then import an employer vacancy link.";
  } else if (
    /board identifiers|board URL required|configuration required/i.test(message)
  ) {
    status = "configuration_required";
    action =
      "Add employer board identifiers or an institution's careers URL in Connectors.";
  } else if (
    /disallowed|crawl rules|robots/i.test(message) &&
    !statusCode &&
    !/fetch failed|ENOTFOUND|EAI_AGAIN|timeout/i.test(message)
  ) {
    status = "restricted";
    action =
      "Use provider research to find an official employer announcement, or open the source manually.";
  } else if (
    [401, 403].includes(statusCode) ||
    /captcha|verification|requires a browser|access denied/i.test(message)
  ) {
    status = "needs_browser";
    action =
      "Use provider research for an official employer alternative, or open the source and complete sign-in or verification.";
  } else if ([404, 410].includes(statusCode)) {
    status = "not_found";
    action =
      "This route is unavailable. Open the source homepage or import an official employer link.";
  } else if (
    statusCode === 429 ||
    statusCode >= 500 ||
    /fetch failed|ENOTFOUND|EAI_AGAIN|timeout|timed out|aborted/i.test(message)
  ) {
    status = "temporary_error";
    action =
      "Retry later; provider research can look for an official employer alternative.";
  }
  return {
    status,
    statusCode,
    message,
    action,
    ...(error?.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
  };
}
function retryAfter(value) {
  if (!value) return 500;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  return Math.max(250, ms || 500);
}
async function requestWithRetry(
  url,
  options,
  fetcher = systemFetch,
  wait = delay,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    options.signal?.throwIfAborted();
    let response;
    try {
      response = await fetcher(url, options);
    } catch (error) {
      if (options.signal?.aborted || attempt) throw error;
      await wait(500, undefined, { signal: options.signal });
      continue;
    }
    if (
      !attempt &&
      (response.status === 429 ||
        [500, 502, 503, 504].includes(response.status))
    ) {
      const pause = retryAfter(response.headers.get("retry-after"));
      if (pause > 3000) return response;
      await response.body?.cancel();
      await wait(pause, undefined, {
        signal: options.signal,
      });
      continue;
    }
    return response;
  }
}
function sourceOutcome(source, patch = {}) {
  return {
    id: source.id,
    name: source.name,
    url: source.base,
    guideUrl: source.guideUrl,
    ...patch,
  };
}
module.exports = {
  accessIssue,
  requestWithRetry,
  retryAfter,
  sourceOutcome,
  systemFetch,
  discoverSystemProxy,
  shouldBypassProxy,
  proxyEnvPatch,
  fetchViaHttpProxy,
};
