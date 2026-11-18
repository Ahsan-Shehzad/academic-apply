# AcademicApply

A local Windows desktop workspace for academic job discovery, document preparation and assisted applications.

## Install and start

Run `release/AcademicApply-Setup-1.7.0.exe`. The installer is unsigned and Windows may show a publisher warning. It installs for the current user and preserves application data when uninstalled. See [1.7.0 changes](docs/RELEASE-1.7.0.md) for flexible job roles, profile-based keyword selection, text-only CV headings and workflow fixes. Supporting-file management, requirement counts, narrative creation and referee-review letters remain available. Advanced discovery and the listing-specific Apply workflow remain available. The 103 source routes, access reporting, employer feeds, ratings and listing management remain available.

1. Open **Profile → Import profile folder** and select `Job-application-related-data`.
2. Review the imported facts, edit anything outdated, then approve the profile.
3. In **Settings**, test Codex or Antigravity, sign in if required, choose a model, and enable AI processing when ready.
4. In **Discover → New search**, choose advanced criteria, sources and tools. Run once or save the search, with an optional weekly schedule. In **Scheduler**, refine saved searches. Enable the Windows background task for searches with the app closed.
5. Run discovery or import a listing. Check the employer, eligibility, official application URL and deadline.
6. Prepare a document package. Edit its content, export PDFs using Microsoft Word, inspect each PDF, and mark it reviewed.
7. Open **Apply** and choose the listing and its matching submission package. Sign in through the dedicated Chrome window; inspect, fill and upload as needed.
8. Review answers, declarations and saved uploads. Approve the current version, then explicitly submit.

## Requirements

- Windows x64 and Google Chrome.
- Microsoft Word desktop for DOCX-to-PDF export.
- A working Codex CLI or Antigravity CLI and an eligible signed-in subscription for AI tasks. The Antigravity desktop application alone is not a CLI installation.
- Internet access for discovery and provider inference.

The application automatically looks for a Codex executable bundled with the Codex desktop application, native CLI installations and supported PATH entries. Settings also accepts an explicit executable path.

## Privacy and behavior

SQLite, the dedicated Chrome profile, receipts and packages remain on this computer. AI tasks send selected profile facts and listing/document text to the chosen provider after AI processing is enabled. Passwords, one-time codes, passport records and referee contacts are excluded from general AI prompts. Referee sheets are generated locally when explicitly selected.

The database is not encrypted by this application. Protect the Windows account and use Windows device encryption or BitLocker when appropriate. Exported backups and submission packages contain personal information.

Discovery respects published crawl exclusions and reports blocked sources. It does not promise complete market coverage. Unreadable listings can be entered manually. AI-discovered URLs are reopened and verified before being saved; eligibility and official-source status still require review.

Scheduling checks due searches every 30 minutes and on sign-in. It requires an available computer and a signed-in Windows user. Missed runs catch up. Browser login and application submission remain interactive.

Final approval is tied to current form values and package file hashes. Changed forms, changed files or expired approval require a new review. An unclear submission response is recorded as **Outcome uncertain** and is never retried automatically.

## Development

```powershell
npm ci
npm run build
npm start
npm test
npm run test:ui
npm run verify:live
npm run dist
```

`npm run dev` serves the renderer for frontend development; the installed app always loads built local assets. Rebuild before running Electron.

Use `ACADEMICAPPLY_DATA_DIR` to isolate test data. Never point test runs at the production database. `node scripts/document-check.cjs` verifies the supplied candidate profile through Word using an isolated QA directory.

## Architecture

- `src`: React/TypeScript UI with Material UI, keyboard-accessible controls and light/dark themes.
- `desktop`: Electron main/preload, validated IPC, SQLite persistence, durable task queue, source adapters, subscription providers, documents, Chrome automation and scheduler.
- `tests`: semantic matching, extraction, privacy, scheduling, persistence and controlled portal submission tests.
- `resources`: portable drafting policies and supporting application resources.

See `docs/USER-GUIDE.md` for troubleshooting and `docs/VALIDATION.md` for the tested delivery state.

See `docs/AI-CONNECTIONS.md` for the supported Codex/Antigravity integration methods, sign-in behavior and the difference between a verified service and enabling AI processing.

See `docs/ACTIVITY-BROWSER-CONNECTORS.md` for work logs, result links, Chrome controls, automatic connector setup and remote MCP configuration.
