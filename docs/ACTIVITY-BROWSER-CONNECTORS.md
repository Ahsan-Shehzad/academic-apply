# Activity, browser controls and connectors

Version 1.1.0 - 17 November 2026.

Updated in 1.3.0: the browser workspace is part of Applications. Its embedded agents use Codex dynamic tools or Antigravity ACP/MCP, with action logs and manual takeover. Optional native Antigravity /browser handoff is outside embedded tracking. See [current workflow details](RELEASE-1.3.0.md).

## Activity

Open Activity in the sidebar or the labelled top-bar button. It shows the latest 100 tasks with status filters, search, elapsed time and timestamped work logs. Each task retains up to 400 entries locally. Tasks from older versions show their last saved message; historical intermediate steps cannot be recovered.

Queued work opens the Activity drawer. A persistent banner shows active work, and Discover/Documents show their latest relevant task. Provider tests and browser operations are also recorded.

Open imported listing links to the saved vacancy. Open package links to completed or partial document work. If a cover letter fails after a CV is created, that CV remains accessible with the failure reason. Retry creates a new package and preserves earlier work. Failed imports offer Retry task and Open source in browser; manual entry remains available.

Document logs show AI requests, response progress when available, content checks, Word saving and PDF conversion. Character counts indicate activity, not remaining work. Percentages describe approximate stages. Cancellation may wait for the active operation; Word finishes its current conversion. Completed PDFs remain saved if a later file fails.

## Browser

Browser manages research tabs in the dedicated visible Chrome profile. Controls include Open tab, Back, Forward, Reload, Show Chrome, Close, Inspect page and Import visible listing. Application portal tabs remain managed by Applications, which now also has Show Chrome.

The prompt box creates a research plan through the selected subscription provider. Review and run steps individually. Supported actions open a public URL, inspect public text or import a vacancy. The provider receives your prompt and current origin/path; query values, page text and form entries are excluded. Direct controls and browser import work without AI processing. Sign-in, CAPTCHA and verification remain manual.

## Bundled source connectors

Connectors lists 16 job-board and university adapters for Europe, Australia and the Gulf. Adapters used by existing search profiles are installed automatically during migration. Install automatically sets up an individual remaining adapter. Install visible connectors sets up adapters in the current catalog filter. Setup writes a versioned manifest and enables bundled code; it requires no npm installation, API key or executable download.

Cards support enabling/disabling, access tests, Open in browser and Search source with a saved profile. Countries, roles and keywords come from that profile. Disabled/uninstalled connectors are excluded from direct scheduled discovery. AI discovery retrieves a bounded candidate pool from enabled connectors, shortlists exact candidate URLs and verifies selected pages.

A connection test reports readable links on the tested page, not complete coverage. Source access restrictions are reported. Browser import provides a recovery route for pages requiring JavaScript or manual access. Bundled adapters are maintained by AcademicApply; they are not claims of provider-endorsed MCP integrations.

## Remote MCP connections

Add MCP connection accepts a provider-issued public HTTPS endpoint, protocol and optional bearer token. Test discovers research tools. Configure updates settings or replaces a token. Changing endpoints removes the old token unless you supply a replacement.

Supported: Streamable HTTP, JSON/request-scoped SSE responses, 2026-07-28 metadata protocol or explicitly selected 2025-11-25 initialize/session protocol. Pagination, session cleanup and annotated parameter headers are supported. Interactive OAuth, sampling, elicitation, local stdio servers and local-network HTTP are not automatically handled or installed.

Search jobs shows tool descriptions and argument schemas. Enter the required JSON arguments, then Search and import. Only those arguments go to the server; candidate facts and packages are excluded. Research-oriented names and read-only metadata filter tools. This selection rule does not independently verify a remote server's behavior.

Results must contain structured vacancy URLs, such as {"jobs":[{"url":"https://employer.example/job"}]}, in structuredContent or JSON text. Up to 20 returned pages are reopened through the normal importer before saving. Unreadable pages and provider errors appear in Activity. Returned free-form instructions do not become browser or application commands.

Tokens are encrypted through Windows secure storage and excluded from UI snapshots, logs and AI prompts. Public HTTPS validation, response limits and redirect rejection apply. The app does not invent credentials or official MCP endpoints for portals that do not publish them.

References: [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).

## Verification

Run npm test for persistence, partial packages, connector setup, MCP and real-Chrome research fixtures. Run node scripts/workflow-ui-check.cjs for UI result links, failures, partial packages, setup and an MCP fixture. An optional packaged executable path checks that build. Fixture responses do not contact a real MCP service or submit applications.
