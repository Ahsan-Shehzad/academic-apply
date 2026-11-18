"use strict";
const { setTimeout: delay } = require("node:timers/promises");
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
async function requestWithRetry(url, options, fetcher = fetch, wait = delay) {
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
module.exports = { accessIssue, requestWithRetry, retryAfter, sourceOutcome };
