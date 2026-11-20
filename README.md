# AcademicApply

A Windows desktop application for academic job discovery, tailored submission packages and assisted job applications. Built with Electron, React, TypeScript and Material UI.

**Current release: 1.9.0.** See the [release notes](docs/RELEASE-1.9.0.md), [user guide](docs/USER-GUIDE.md) and [validation record](docs/VALIDATION.md).

## Install

Download [AcademicApply Setup 1.9.0](https://github.com/Ahsan-Shehzad/academic-apply/releases/download/v1.9.0/AcademicApply-Setup-1.9.0.exe) from [GitHub Releases](https://github.com/Ahsan-Shehzad/academic-apply/releases). The installer is currently unsigned. Version 1.8.0 is also available for rollback; see [release files](release/README.md) for checksums and distribution details.

Installers and prepared source archives are distributed as GitHub Release assets and excluded from Git history. A source-only clone must be built using the development instructions below. Local delivery copies are kept in `release/`.

### Requirements

- Windows x64.
- Google Chrome for application-portal automation.
- Microsoft Word desktop for DOCX-to-PDF export.
- A working, signed-in Codex CLI or Antigravity CLI for AI features. Access depends on the installed CLI, account and model availability; the application does not require its own API key.
- Internet access for discovery and AI inference.

## Features

- **Discover:** web-search-first country/role/topic plans, native provider search, reliable supplemental connectors, full-page verification, official-employer recovery, resumable candidate review, ratings and sorting.
- **Connectors:** 103 source definitions, public employer feeds and configurable read-only MCP research tools, with access reports and setup guides.
- **Scheduler:** saved searches with weekly schedules and optional Windows background execution.
- **Documents:** listing-based document selection, editable academic CVs and statements, supporting files, referee drafts, Word/PDF export and package review.
- **Apply:** listing/package context, visible Chrome controls, form inspection, AI assistance, file uploads and explicit final review.
- **Activity:** persistent logs, automatic completion summaries, distinct search counts, source failures and result/retry actions.
- **Reports:** application and discovery progress across the local workspace.
- **AI routing:** Codex app-server and persistent Antigravity ACP integration, service checks, detected models and per-workflow selection.

## First run

1. Import your own candidate-data folder in **Profile**. Review and approve the extracted facts.
2. In **Settings**, choose an installed AI provider, sign in if needed, run **Test service** and **Test web search**, select a model and enable AI processing when ready.
3. In **Discover → New search**, choose roles, countries and keywords. Use **Web search + reliable connectors**, **Thorough** depth and **Automatic** public-page reading. Preview the query plan, then run once or save a scheduled search.
4. Review **Full listings** and the search-funnel summary. Under **Needs detail review**, use **Complete pending details** or open a blocked candidate in Chrome and **Import visible page**. Unresolved links are not counted as full listings.
5. Prepare the matching package in **Documents**. Add supporting records, edit drafts, export PDFs and inspect each document before marking it reviewed.
6. In **Apply**, select the listing and package, complete portal sign-in, review answers and uploads, then explicitly approve final submission.

Candidate files are supplied separately; this repository does not include personal CVs, credentials or application databases.

## Development

Use Node.js 22.12 or newer with a compatible npm installation.

```powershell
npm ci
npm run build
npm start
```

`npm run dev` starts the Vite renderer development server. `npm start` launches Electron with the built local assets; rebuild after renderer changes.

Use a separate data directory when developing or testing:

```powershell
$env:ACADEMICAPPLY_DATA_DIR = Join-Path $PWD '.test-data\development'
npm start
```

The normal installed application stores its workspace in `%APPDATA%\AcademicApply`. Keep development and automated tests separate from this directory.

### Checks

```powershell
npm test
npm run build
npm run test:ui
```

The 1.9.0 validation run passed 120 automated tests. Additional controlled Electron workflows cover completion summaries, flexible search, supporting files and Apply controls. Live source availability and AI output vary; see the dated [validation record](docs/VALIDATION.md).

Optional focused checks:

```powershell
New-Item -ItemType Directory -Force qa, .test-data | Out-Null
node scripts/task-summary-ui-check.cjs
node scripts/flexible-search-ui-check.cjs
node scripts/supporting-package-ui-check.cjs
```

UI checks create local `qa/` and `.test-data/` outputs. `npm run verify:live` makes real source/provider requests, requires configured providers in its isolated workspace, and is separate from the offline test suite.

### Build an installer

```powershell
npm run dist
```

Electron Builder writes the Windows NSIS installer to `release/`. The package version is defined in `package.json`. Build outputs and installed dependencies are generated locally and excluded from Git.

### Clean generated files

Preview the generated builds, caches and obsolete delivery files eligible for removal:

```powershell
.\scripts\clean-workspace.ps1
```

Apply that cleanup locally:

```powershell
.\scripts\clean-workspace.ps1 -Apply
```

The script validates retained delivery checksums and target paths first. It preserves source, Git history, `qa/` backups, the installed application, personal candidate records and the 1.9.0/1.8.0 deliveries. It removes local dependencies, which can be restored with `npm ci`.

Locked targets retry up to three times and then remain pending while the other targets continue. The report in `qa/workspace-cleanup.json` includes actual reclaimed bytes and pending paths. Close applications using those paths, or wait for background file scanning to finish, and rerun the same command. The script does not force-close processes. Its cleanup behavior can be checked without deleting files using `scripts/clean-workspace.test.ps1`.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/` | React/TypeScript user interface |
| `desktop/` | Electron main/preload, IPC, persistence, tasks, providers, discovery, documents and browser controls |
| `resources/` | Icons, source catalog, dated access report and application policies |
| `tests/` | Automated regression tests |
| `scripts/` | Development and controlled integration checks |
| `docs/` | User guides, architecture details, release notes and validation |
| `release/` | Local installers, source archives and delivery checksums |
| `qa/` | Ignored local diagnostics and retained workspace backups |

## Data and application behavior

Workspace records, document packages, receipts and the dedicated browser profile are stored locally. AI processing sends selected listing, profile or document information to the chosen provider when enabled. See [AI connections](docs/AI-CONNECTIONS.md) and [Activity, browser and connectors](docs/ACTIVITY-BROWSER-CONNECTORS.md).

The application does not encrypt its SQLite database. Credentials, personal documents, backups, browser profiles and environment files must remain outside Git. `.gitignore` excludes these local artifacts.

Discovery respects published crawl restrictions. HTTP 403 challenges, authentication requirements and unavailable sites cannot be guaranteed away; hybrid research can find official employer alternatives and otherwise presents manual actions. Provider-reported facts, eligibility and deadlines require review. The source catalog is not a guarantee of exhaustive coverage.

Background scheduling checks due searches every 30 minutes and at Windows sign-in, and requires an available computer and signed-in user. Final application approval is tied to the current form and package files. Uncertain submission outcomes are recorded and are not automatically resubmitted.

## Git and GitHub handoff

The repository uses `main`. Source, tests, documentation and the dependency lockfile belong in Git; installers, caches, generated documents and personal data do not. Publish binary delivery files as release assets rather than adding them with `git add -f`.

The repository is hosted at [Ahsan-Shehzad/academic-apply](https://github.com/Ahsan-Shehzad/academic-apply). Clone it with:

```powershell
git clone https://github.com/Ahsan-Shehzad/academic-apply.git
cd academic-apply
```

Release tags identify the corresponding source snapshots. Windows installers, prepared source archives, blockmaps and per-version SHA-256 checksums are attached to [GitHub Releases](https://github.com/Ahsan-Shehzad/academic-apply/releases). Review staged changes with `git diff --cached` before publishing updates.

## License

See [LICENSE](LICENSE).
