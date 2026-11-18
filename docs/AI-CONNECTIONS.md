# Subscription AI connections

Updated 17 November 2026.

AcademicApply uses each vendor's supported local integration surface. It does not scrape the Codex or Antigravity chat interface, copy browser cookies, or convert subscription credentials into an unofficial API endpoint.

## Recommended setup

1. Install/open Codex and the official Antigravity CLI (`agy`). The Antigravity desktop editor's launcher is a different executable.
2. In AcademicApply Settings, leave the executable path blank to auto-detect. An explicit path is authoritative: a broken path will not silently test a different installation.
3. Run **Test service**. This discovers models and requests an actual short answer using the selected model and reasoning effort. A successful check does not enable AI processing.
4. Pick an available model from the returned list, or leave it blank for the provider default. Test again after changing model, effort or executable.
5. Enable **AI processing** to allow relevant listing/profile/document text to be sent for real work.
6. Choose a default provider and optional per-workflow routing. Start with one verified provider; use the other for selected tasks or an optional fallback. Fallback can send the same task context to the other provider.

Codex's app-server exposes authentication, model discovery, structured requests and streaming responses. Antigravity uses a persistent official ACP server (`agy acp --stdio`), with an isolated session per task, streamed text and configuration for model and thinking level. No API key is required for these signed-in flows. Account entitlements and usage limits still apply. See [1.2.0 changes](RELEASE-1.2.0.md) for lifecycle and workflow model selection.

AcademicApply manages job records, document formatting, validation and Chrome forms. Providers supply research and drafting assistance. Portal sign-in, private declarations and final submission review remain in the application/browser workflow.

## Sign-in behavior

**Codex:** Sign in opens the app-server's browser OAuth URL. An already signed-in Codex installation can pass Test service without a new login.

**Antigravity:** Check sign-in first checks current CLI access. If a cached session works, it reports that no terminal is needed. Open sign-in terminal explicitly starts a new Windows console on the interactive desktop for the official CLI. The app waits for both a startup receipt and a matching visible terminal window before claiming it opened. Failure produces a manual-start instruction instead of a success message. Finish any browser sign-in there, close the terminal and run Test service. Starting a terminal alone does not verify authentication or inference.

The CLI may sign in silently from its secure keyring, so absence of a new browser login is not a failure. Conversely, a process starting or printing a version is not evidence that an AI request works.

## Status meanings

- **Signed in:** CLI/account and model access passed; no answer test has passed for this check yet.
- **Testing:** waiting on discovery, authentication or a real model response. The current phase is displayed.
- **Ready:** the selected model and effort returned the exact test answer. Last verification time is shown.
- **Not tested:** configuration changed; repeat Test service. An old success does not verify new settings.
- **Authentication required / quota limited / error:** inspect the specific failed stage. Model availability, network access, account entitlement and usage limits can change.

Service testing sends only a fixed diagnostic prompt. With AI processing off, job-board discovery and local CV generation still work, but AI discovery, letters, statements and answer suggestions are blocked.

## Sources

- [OpenAI Codex app-server](https://developers.openai.com/codex/app-server/) — authentication, model list and turn protocol.
- [Antigravity authentication](https://antigravity.google/docs/install/) — local keyring and interactive sign-in.
- [Antigravity headless mode](https://antigravity.google/docs/cli/headless/) — supported programmatic input/output, cached credentials and result statuses.
- [Antigravity ACP](https://antigravity.google/docs/cli/acp/) — persistent JSON-RPC server and cached credentials.
- [Antigravity CLI reference](https://antigravity.google/docs/cli/reference/) — `models`, model/effort flags and execution modes.

## Developer verification

`node scripts/provider-check.cjs` exercises both installed providers with a short inference and a structured academic drafting task in an isolated test database. It never sends the candidate profile. `node scripts/provider-ui-check.cjs <packaged-exe>` checks the Electron IPC, visible status, model discovery and configuration invalidation. Set `CHECK_SIGNIN_TERMINAL=1` only when explicitly testing the visible sign-in window; the test closes the terminal it creates.


## Installed-app repair in 1.1.1

The service check now verifies structured JSON and a short academic drafting response. A successful literal ACK alone is insufficient. Updating the adapter invalidates older ready indicators.

Full documents use a generation schema with an explicit list of allowed profile evidence identifiers. Response parsing accepts the CLI's structured_output and streamed final agent text, while rejecting empty or malformed results. Empty/invalid JSON responses retry once with the same provider; quota errors do not retry. Waiting heartbeats and actual response character counts appear in Activity.

Antigravity now runs with task-scoped permissions rather than forcing its planning mode. File, shell and MCP operations are denied for these drafting requests. The installed CLI 1.5.9 remained intermittent during full workflow validation: a full letter passed, while some search/shortlist requests timed out. Native Codex is the verified primary connection for the repaired installation. Antigravity remains selectable; fallback remains a user-controlled preference.

AI discovery now retrieves bounded source pages, asks the provider to shortlist exact candidate URLs, then verifies the selected pages. It checks up to 12 geographically balanced eligible sources, at most 60 candidate links and 8 selected detail pages. Its output reports coverage and source failures. It does not delegate an unbounded web-browsing session to the CLI.
