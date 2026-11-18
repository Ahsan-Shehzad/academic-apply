# AcademicApply 1.3.0

## Applications browser workspace

Browser controls now live in Applications. The separate Browser sidebar item has been removed. Research listings in Chrome is an expandable section in Applications. Opening the Applications screen does not launch Chrome automatically; Open/Resume, Show Chrome or an explicit browser action opens it. Starting the same application reuses its existing tab. Pop-up tabs are tracked with the application and can be selected from its tab menu.

The workspace provides address navigation, back/forward, reload, scroll, masked page previews, visible page controls, editable fields and dropdowns, hidden file inputs and multiple-file uploads. Matched uploads propose package files based on document type; users can change the selection. Reviewed document PDFs and original PDF attachments can be combined for single-slot portals. Portals may still require an additional Save or Upload action; confirm that the portal persists each file.

Run assistant uses the provider and model configured for the portal workflow. Codex receives scoped app-server dynamic tools. Antigravity receives the same controls through an authenticated local stdio MCP bridge in its persistent ACP session. The agent inspects the current form, fills verified facts, uploads requested reviewed documents and follows supported next steps. Every action appears in Activity; Stop agent & take over cancels the current task and shows Chrome. Stale form hashes are rejected. Private credentials, sensitive choices, ambiguous controls and final submission require manual review. Tool execution cannot select arbitrary local files or invoke the final submission path. Read-only research can use the configured fallback; browser mutations are never automatically replayed with another provider.

Native /browser handoff is an optional Antigravity-only route. It opens the official CLI interactively with /browser, the selected model/effort and a bounded application brief. Chrome DevTools permission and the CLI's own permission prompts may be needed. This native assistant uses its own Chrome integration and operates outside AcademicApply's embedded safeguards and action tracking. The app confirms terminal startup, not browser connection or completed application work. Review native actions yourself and keep final submission manual. Existing normal Chrome windows are not closed or restarted.

## Country groups

Discover offers Europe (EU/EEA, UK and Switzerland), EU, EEA, Gulf/GCC, Australia, UK/Ireland, Nordic, DACH, Benelux, Baltic, Southern Europe and Central/Eastern Europe presets. Individual countries remain editable. The active selection filters saved opportunities and scopes the next search. Save countries to search persists it for scheduled searches. Scheduler editing offers the same group presets.

## Provider-assisted vacancy retrieval

When AI processing and provider internet tools are enabled, URL import first asks the selected discovery provider to retrieve the vacancy. Native internet search and the public vacancy-reader tool can find and read an official employer equivalent when the original source is unavailable. The app's reader continues to enforce public HTTPS, source access rules, redirect and response-size checks. It does not bypass CAPTCHA, authentication, paywalls or denied source access.

Direct discovery and scheduled searches use the same recovery path for failed sources. AI discovery also recovers when its connector pool or shortlisted pages cannot be read. Source failures remain visible, even when a position is recovered elsewhere. Research is bounded and stops rather than inventing details when evidence is unavailable.

Saved research records retain requested URL, source links, evidence excerpts and retrieval time. Source verified means the app could independently retrieve matching page evidence. Provider-reported records require official-source review in the listing detail before final submission. A successful model service check does not guarantee that every portal or search tool is accessible.

Installed professional-job-application guidance is included in relevant provider tasks. The portal workflow also uses installed chrome-browser-control guidance. Codex receives native skill input items; ACP receives the selected local skill text. Unrelated installed skills and arbitrary web instructions are not automatically executed.

## CV icons

Template 4 embeds the original SVG symbols from the supplied HTML CV as PNG images in Word: LinkedIn, Google Scholar, Web of Science, Scopus, ORCID, GitHub and ResearchGate retain their text labels and clickable links. Address, email, telephone and appropriate academic section headings also have icons. Icon fonts are not needed. Blue headings and black body text are preserved. The six-page candidate CV was exported with Word and all pages inspected. Generate a new package to apply the icon template.

## Verification

57 automated tests pass. Controlled Electron checks verify country filtering and saved scheduler scope, integrated application controls, no extra tab, private-field masking and upload controls. Live Codex and Antigravity runs each filled verified contacts and uploaded two requested documents on a local application fixture, with six browser actions each. Declarations and the final submission control remained untouched. Both providers completed a real public vacancy retrieval. Independent access and employer-name matching can vary; provenance review flags are retained.

The Windows installer is unsigned. Microsoft Word is required for PDF export. Real employer forms can expose controls or requirements that need manual assistance.

Primary integration references: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [ACP integration](https://antigravity.google/docs/ide/extensions/acp/), [Antigravity browser command](https://antigravity.google/docs/commands/browser/).
