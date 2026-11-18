# AcademicApply user guide

## Version 1.7.0

Discover → New search and Scheduler's search editor retain **Lecturer**, **Assistant Professor** and **Postdoctoral** as quick choices. **Additional job roles** offers common academic/research titles and accepts custom titles when you press Enter. Results can match any selected role. To search only a custom role, uncheck the presets you do not want. Custom titles match phrases in vacancy titles; use topic keywords for subject specializations.

**Research and teaching topics** is now a multiple-selection keyword picker. Choose suggestions or type your own terms and press Enter. **Suggested search keywords** ranks profile research, methods and disciplines, then offers role-relevant terminology and related search wording. Hover/focus a keyword to see why it was suggested; click it to toggle selection. **Use recommended keywords** replaces the current selection with the leading profile/role matches. Suggestions refresh as roles change, while your existing selection is retained. This uses local profile text and works with AI processing off. References and private contact fields are not used.

For efficient searching, choose a few focused phrases plus useful acronyms such as natural language processing / NLP. Public discovery distributes selected terms across sources and tries up to three terms for a source when only a few sources are selected. Saved runs rotate the term starting point so repeated searches do not always query the same topic. Public-index-only sources keep their published access limitation. AI shortlist and recovery requests receive the actual selected roles and keywords. These topics guide discovery; use Required terms for strict all-term matching.

Selected custom roles and keywords are saved together and reused by Scheduler. The CV-heading, saved-search persistence and document export/merge fixes described below are included in this release.

See [release details](RELEASE-1.7.0.md).

## Version 1.6.1

New CVs have text-only section headings. Contact and original network icons, labels, links, blue headings and black body text remain. Other document types retain their existing heading styles.

For an older saved CV, use **Remove heading icons** on its document card. The app edits only the icon runs in the existing Word heading paragraphs, stores prior Word/PDF files in the package's history folder, and exports that CV alone. Candidate wording, other documents and non-heading icons are preserved. Review the updated PDF before approving it.

**Export PDFs with Word** now exports missing or changed PDFs and retains reviews for unchanged current PDFs. It keeps supporting-file changes made while Word is running. Editing or approving a document during its export is blocked until the operation ends. A Word file changed outside the app during export causes that export to stop before replacing the previous PDF. A merge stops if its package or source files change, so it cannot replace newer package work.

Deleting the final saved search now leaves the list empty after restart. Newly seeded schedules have a calculated next-run time, and a running search can finish after its saved profile is deleted without recreating that profile. A built-in discovery failure no longer prevents configured MCP research tools from running; Activity reports that failure alongside any MCP results.

See [release details](RELEASE-1.6.1.md).

## Version 1.6.0

Documents now tracks a count for each supplied-file requirement. For example, two transcripts and three research papers need distinct files; identical copies count once per requirement. Check extracted counts against the listing and correct **Required file count** if necessary. **Add requirement** records an additional supporting-file, official-form or applicant-authored narrative requirement.

In **Supporting files**, select a requirement, choose multiple evidence-library files and add them together, or use **Add files from computer** to copy several files into the evidence library and package. **Suggest library matches** selects filename-based candidates for your inspection; it does not verify document contents or attach them automatically. Each file can be assigned to several requirements. Open, reassign or remove files individually; removal retains library originals and physical copies. Package changes invalidate approvals and derived combined-packet records.

Use **Create required document** on a missing or optional narrative to add it to the existing package. Existing documents and attachments are preserved. Export PDFs, inspect them and approve submission narratives. Degree certificates, transcripts, published papers and official records are supplied as existing files.

When reference letters are requested, **Prepare referee-review letters** creates a separate Word draft for each selected referee in the approved profile. Drafts use verified candidate facts and supplied referee identities/relationships. They have blue headings and black body text, can be edited and exported, and stay marked as referee-review drafts in the app. No signature, letterhead or referee consent is invented. Draft letters never count as signed letters and are excluded from manual/AI upload choices and combined submission packets. Obtain the referee's approval and actual signed original, then add it as a supporting file. For confidential/direct referee submission, record confirmed submission counts and notes instead of uploading a letter; the app does not send or confirm letters itself.

**Build a combined PDF** combines selected reviewed narrative PDFs and original PDF attachments. A merged packet does not count again toward requirement counts. Rebuild it when its sources or reviews change. Review its contents before using a single portal upload slot.

See [release details](RELEASE-1.6.0.md).

## Version 1.5.0

**Discover → New search** opens advanced criteria, sources/AI tools, and an optional weekly schedule. Run **Search now** for a one-off task, **Save search** to reuse the criteria, or **Save & search** for both. Progress and saved results appear in Activity. Criteria apply to newly found results; existing Discover listings stay available.

Choose country groups or individual countries, role types, research topics, title/institution phrases, required and excluded terms, minimum research match, publication/deadline windows, treatment of unknown dates/countries, official-source status and explicit remote mentions. Select enabled sources, a public/hybrid/AI research method, an optional provider/model override and a bounded detail-review budget. Tested MCP research tools support JSON arguments with `{{keywords}}`, `{{countries}}` and `{{roles}}` templates. Filters run before returned listings are saved. Public-only mode does not invoke AI; AI-only mode requires AI processing in Settings. Access restrictions remain visible.

**Apply** replaces Applications and uses a sparkle icon. First select the opportunity and its matching submission package. **Prepare / review package** opens that listing's documents; **Start / resume application** opens or reuses its portal session. Visiting Apply alone does not open Chrome. Archived listings retained by packages or applications are also available here with an archived label. Large native Antigravity handoffs store their full instruction text locally under the data folder's `ai-workspace/native-handoffs` directory to avoid Windows command-line truncation.

Packages display **Institution - Job title**, together with status, date and a short identifier in selectors. Documents keeps the target opportunity and displayed package aligned. **Use this package in Apply** carries the exact listing/package pair into the portal. The application panel shows listing requirements, full description and the selected package before browser controls. Only packages for that listing are offered.

AI portal suggestions, the controlled assistant and native-provider handoff receive the selected listing and matching package, including reviewed document content and requirement coverage. Unreviewed document text is omitted. Changing the package clears old suggestions, agent reports and approval. Stop an active assistant before changing packages; replace previous uploads and review again. The assistant checks that its listing, profile and package context remains unchanged while working. All final submission controls still require explicit review and approval.

See [release details](RELEASE-1.5.0.md).

## Version 1.3.0

Applications now contains the browser workspace, advanced form controls and the selected provider's browser assistant. Discover includes country groups and a country selection that can be saved for Scheduler. AI-first import and blocked-source recovery use provider internet tools and retain verification evidence. CV template 4 adds original network and section icons with readable labels. See [the current release guide](RELEASE-1.3.0.md).

## Version 1.2.0

Documents defaults to automatic selection from the listing. Required attachments are tracked separately; assign supplied library files to their requirements. New CVs include contact details and academic network links. Antigravity uses a persistent ACP server, and each workflow has a model dropdown. See [the release guide](RELEASE-1.2.0.md). Create a new package to apply the updated CV template to earlier applications.

## Activity, browser and connectors

Activity is now a named sidebar screen and top-bar button. Queued tasks open its live log drawer; imports and document work link to saved results. Browser offers Chrome controls and prompts for reviewed research plans. Connectors lists bundled adapters, automatic setup, access tests and remote MCP configuration. See [the workflow guide](ACTIVITY-BROWSER-CONNECTORS.md).

## Discovery

Use country presets to add Europe, Australia and the six Gulf countries, then remove countries you do not want. Europe includes EU/EEA, the UK and Switzerland. Select lecturer, assistant professor and postdoctoral roles independently. Direct source discovery uses public listings; AI discovery retrieves bounded connector candidates, uses the selected provider to shortlist exact source URLs, and verifies the selected vacancy pages.

Read **Source coverage** after every run. A successful run may still have unavailable sources. Job-board URLs are not automatically treated as employer-verified. Open the employer page, correct extracted facts if needed, and confirm the official source in job details.

Fit scores are transparent heuristics, not predictions of selection. They emphasize computing teaching for faculty posts and speech, cognitive health, graph/interpretability and multimodal learning for research posts. Work authorization and sponsorship are never inferred from research fit.

## Candidate profile

The importer reads the supplied YAML and bibliography and indexes eligible supporting files. It skips dependency folders, passport images and raw Europass exports. Profile edits require renewed approval. Changing profile facts makes earlier packages stale for submission: create a fresh package from the updated profile.

Verify qualification dates, appointment status, contact information and publication status. The source folder remains unchanged. The advanced structured editor accepts JSON; preserve the existing field structure.

## Documents

Version 1.0.1 uses navy-blue headings, black body text, aligned dates, native Word lists and consistent page headers and footers. The CV separates teaching appointments, research and professional experience; research posts bring research evidence forward. Published and accepted publications are separate from manuscripts under review. Letters use an editable date, recipient and application subject with a formal paragraph structure. Statements use descriptive headings and concrete evidence.

Generate a new package to use the revised academic structure. Existing packages preserve their content and approvals; editing an existing document applies the new visual style and requires a fresh PDF export and review. No previously approved package is silently restyled.

CV and referee-sheet generation work locally. Letters and statements use the selected subscription provider. Drafts retain evidence identifiers internally. These are an audit aid and do not replace your review of each claim.

Edit content in the studio or open Word to inspect formatting. Prefer studio edits for tracked revisions: the studio records history and invalidates earlier PDF approvals. When a Word document is edited externally, export and inspect its PDF again before approval. Check page limits against the listing. Combined supporting PDFs are available for portals with fewer upload slots.

Word must be installed and available to the signed-in user. If export fails, finish any first-run or licensing dialogs in Word and retry. Do not run Word export from a service account.

## Experimental hidden keywords

Hidden keywords are disabled by default. In **Documents**, choose **Hidden keywords · off** on a CV or cover-letter card. Inspect the available terms and supporting profile evidence, enable the document's layer, select terms, and save. Export PDFs again and review the new revision. Turning the control off removes the layer from the regenerated Word file; export again to replace the PDF. The exact embedded text is displayed in the dialog and on enabled document cards.

Only a fixed set of computing and academic topic labels found in both the approved profile and vacancy can be selected. There is no free-form hidden prompt field. Profile or listing changes require a fresh package before enabling the layer. Passwords, referee contacts and private profile records do not supply keywords. All matching and embedding run locally.

Word output uses hidden text and document keyword properties. PDF output adds transparent text and keyword metadata after Word export. These are inspectable document contents, not a guaranteed screening bypass. Some extractors may ignore them, some may expose them, and some screening products detect hidden text. No claim of improved ATS ranking or selection is made. The Settings switch applies only to future CVs and cover letters; per-document changes invalidate earlier approvals.

See [research and limitations](HIDDEN-KEYWORDS.md). The professional blue-heading and black-body presentation remains visible when the layer is enabled.

## Apply and email

The app launches installed Chrome using its own persistent profile. Sign into your job portal and Outlook or Gmail there. Existing sessions in your everyday Chrome profile are not copied.

Use **Inspect / resume portal** after signing in or changing a page. Fill contact details locally. AI answer suggestions are shown for review before filling. Sensitive answers, legal declarations, checkboxes, passwords and verification codes remain manual.

Choose an upload file from the current package for each slot. Verify the portal's saved upload state. Use visible Chrome for multi-factor authentication, CAPTCHA, custom widgets and account passwords. Ordinary Next/Continue controls can be used from the app.

Open application email from the workspace. The app can read the currently opened relevant message in supported webmail layouts without scanning the entire inbox. Verification links and codes stay in Chrome; if the layout is unsupported, complete verification manually and resume.

At the final page, inspect the form, select the detected submission button and review all four confirmations. Approval expires after ten minutes. Submission is a separate explicit action. If the result is uncertain, inspect the portal and confirmation email, then record confirmation evidence manually. Do not submit again until the result is reconciled.

## Provider troubleshooting

See [Subscription AI connections](AI-CONNECTIONS.md) for setup and status definitions. Codex uses its app-server; Antigravity uses the official headless CLI. Run Test service after selecting a model or changing effort, then enable AI processing separately. Tests send a fixed diagnostic prompt, not your profile.

**Missing:** install the official CLI, not just the editor, or choose its executable.

**Broken:** a global npm wrapper may be missing a platform package. Prefer a native executable or repair the CLI using its official installation instructions.

**Authentication required:** use Codex Sign in or Antigravity Check sign-in. Antigravity reuses a working cached session without opening a terminal. Open sign-in terminal explicitly opens the provider-owned CLI in visible PowerShell and confirms startup before reporting success. Complete the sign-in if requested, close the terminal, then run Test service.

**Quota limited / unavailable model:** choose an available model or wait for the provider's limits to reset. Fallback is optional and disabled by default. It may send the same task data to the other selected subscription provider when enabled.

**Antigravity model list empty:** the app uses `agy models` and supports tab-separated output. Update the official CLI and retry if no models are returned. A version check or empty model list is never presented as a passed inference test.

**Ready but drafting unavailable:** enable the AI processing switch. Service verification deliberately leaves this preference unchanged. Changing the executable, model or reasoning effort clears earlier verification and requires another test.

## Backup and removal

Settings displays the database and package locations. Back up both the SQLite database and package folder; the database backup alone does not include document files or browser sessions. The database has an adjacent `.bak` file for recovery. Close the app before restoring a database copy. Remove the background task in Scheduler before moving or uninstalling the app.

Version 1.1.1 improves structured AI output, profile-evidence validation and waiting logs. Native Codex is the verified recommended provider for the repaired installation; Antigravity CLI 1.5.9 showed intermittent timeouts during longer requests.


## Expanded sources and listing management (1.4.0)

See [the 1.4.0 guide](RELEASE-1.4.0.md) for source access methods, per-provider setup, live tests, employer feeds, ratings, notes, sorting and safe listing deletion/reset. Connectors shows all 103 sources with inline instructions and official links.
