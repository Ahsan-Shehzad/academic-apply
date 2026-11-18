# AcademicApply 1.5.0

## Advanced discovery

Discover includes a New search action with a shared advanced editor for one-off runs and saved weekly searches. Country groups, individual countries, roles, research topics, title/institution matches, required/excluded phrases, match thresholds, date windows, unknown-data policies, official-source filtering and explicit remote mentions are available. Filters are enforced by the discovery engine before persistence, including results imported from connected MCP research tools.

Sources and AI tools include country-aware enabled-source selection, public/hybrid/AI methods, provider and model selection, detail-review budgets and tested MCP read tools with schema-visible JSON arguments. Per-search provider/model overrides stay local to that search. A provider override cannot inherit an incompatible model from another provider's workflow. Public-only mode disables AI recovery, including MCP detail imports. Search now does not create a saved profile or a weekly schedule; saved searches reuse all criteria through Discover and Scheduler. Failures and partial coverage remain visible in Activity.

## Listing-specific application workflow

Applications is now Apply with a sparkle icon. Its entry panel selects an opportunity and a package belonging to that listing, with prepare/review and start/resume actions. Package names display Institution - Job title; status, date and a short identifier distinguish versions. Legacy packages receive these display names without moving files.

Documents keeps its displayed package tied to its target listing. Selecting a package changes the target opportunity; selecting a new opportunity shows only a matching package. Use this package in Apply carries the exact pair into the portal session. Apply displays the listing description, requirements, eligibility and selected package beside its browser controls. Archived listings retained for packages or applications remain selectable in Apply with an archived label; they are not restored to Discover.

The controlled browser assistant, answer suggestions and native-provider handoff receive listing-specific context and matching package requirements plus reviewed document content. Unreviewed document text is excluded. Context fingerprints detect changes to the listing, profile or package during assistance. Switching packages clears prior suggestions, reports and approvals, and cannot occur during an active controlled assistant. Final approval rejects uploads recorded from another package. Large native Antigravity handoffs use a private local instruction file to preserve complete context within Windows command-line limits. Existing final-submission review, private-field boundaries and uncertain-submission protections remain in place.

## Validation and limits

The automated suite and isolated Electron workflows cover filters, MCP templates and validation, saved provider/model overrides, one-off search persistence, package/listing alignment, context changes and guarded form filling/uploads. Browser fixtures do not submit real applications. Source access and live AI service checks are separate from deterministic UI fixtures. This release reuses the 1.4.0 source-access report; it does not claim fresh tests of all 103 sources.

Availability depends on source access, installed provider capabilities and subscription entitlement. AI-only searches require AI processing enabled. Public source filters work with extracted fields; unknown dates and countries follow the selected policy. Match scores remain heuristics. Microsoft Word is required for PDF export.
