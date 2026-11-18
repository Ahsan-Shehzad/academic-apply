# AcademicApply 1.7.0

This release adds flexible role selection and profile-based keyword suggestions and includes the CV-heading and workflow repairs documented in RELEASE-1.6.1.md.

## Roles and keywords

The original Lecturer, Assistant Professor and Postdoctoral checkboxes remain. Additional job roles provides common titles and free entry for other titles. Saved searches accept up to 30 role values, normalize duplicate/case variants, and match custom phrases against vacancy titles. Search, AI research, MCP criteria and Scheduler use the same selected roles. Custom roles are no longer interpreted as lecturer searches by the backend. Role-only searches can run without a forced computing-topic filter.

The topic field supports selectable keywords and manual phrases. Local suggestions rank research interests, publication/project themes, skills and disciplines from the profile, then adjust role-related terms for teaching, faculty, research or engineering positions. Suggested variants/acronyms are identified as related wording; leading recommendations prioritize profile-grounded terms and relevant role combinations. Private information, reference contacts, name/contact records and source identifiers are not used as recommendation text. Incomplete profiles are handled without breaking snapshot/loading. This helper requires no AI sign-in or API key. Existing saved keyword selections are preserved until edited.

Public-source discovery now distributes selected keyword queries across sources and uses up to three queries per source for small source sets. Repeated saved runs rotate topics, including when the source count is a multiple of the keyword count. Public-front-page sources remain one-index checks. Vacancy URLs are deduplicated across keyword pages and source access failures remain visible. AI retrieval, shortlist and recovery receive selected custom roles and selected keywords rather than fixed role descriptions. These are broad discovery terms; strict required/excluded filters remain separate.

The search-suggestion IPC endpoint is read-only, so requesting suggestions cannot trigger a snapshot-change reload loop. Keyword buttons expose their selection state and explanatory descriptions to keyboard and assistive-technology users.

## Included CV/workflow repairs

Academic CV headings are text-only while contact/network icons, labels and links remain. Saved CV heading drawings can be removed without rewriting factual text or other Word package parts. Prior versions are archived and the selected CV alone is re-exported for review.

The included repairs preserve an empty saved-search list after restart; initialize usable next-run times; handle deletion during an active search; continue configured MCP work after built-in failure; preserve supporting-file changes during Word export/edits; retain reviews for current PDFs; and reject stale Word/PDF approvals and package changes during PDF merging.

## Validation

91 automated tests cover the existing workflows and the new role matching, keyword provenance/privacy, query coverage and rotation. Electron fixtures verify presets, free role entry, keyword toggles/manual phrases, saved/scheduled criteria, real import filtering through mocked public source pages, read-only suggestions and empty-search persistence after restart. Separate fixtures verify CV repair, selective export, supporting files and controlled browser uploads. The stored CV copy was exported through Word and all six pages visually inspected: 15 heading icons removed, 12 contact/network icons retained, and every non-whitespace text run plus every other Word part preserved. No real job application or email was sent in validation.

Suggestions and match scores are search aids; they do not establish eligibility or guarantee exhaustive portal coverage. The source-access report is retained from the earlier release rather than representing fresh tests of every job portal.
