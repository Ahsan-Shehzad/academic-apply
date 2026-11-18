# AcademicApply 1.4.0

This release expands discovery and adds personal listing management.

## Sources and access

The source catalog includes 103 entries: academic boards, national and regional portals, major general boards, institution sites, and employer platforms. These are source adapters and research routes, not 103 official authenticated API integrations.

- Major sources include LinkedIn, Indeed, SEEK, Interfolio, Glassdoor, Monster, Careerjet, Jooble, Talent.com, Adzuna, ZipRecruiter, EURAXESS, jobs.ac.uk, AcademicTransfer, Academic Positions, HigherEdJobs, Chronicle, Inside Higher Ed, Nature Careers and Science Careers.
- National portals cover the 32 supported European countries, Australia, and Gulf countries, alongside regional and global sources. A global/regional portal's presence does not guarantee a current matching vacancy in every country.
- Greenhouse, Lever and Ashby have public employer-board API adapters. In Connectors, choose Configure employer boards and add the identifier from each employer's careers URL. Saving adds the feed to saved searches. These platforms do not expose a single global employer index.
- Workday, PageUp, SAP SuccessFactors and SmartRecruiters are employer-specific browser/import routes. Open an institution's actual career board or import a vacancy URL. Their corporate homepages are not job feeds.
- Indeed has an official MCP service, but its published September 2026 documentation limits access to Claude Connector. This app does not impersonate that client or claim a working native Indeed MCP connection. Its card links the official setup guide; here Indeed uses public discovery, provider research and browser import.
- LinkedIn is a manual route. Search in its official interface, then import the official employer vacancy URL. This app does not install an unofficial LinkedIn scraping server.

Every card has an inline Setup and access guide, an official site/guide link, and a connector test. Test all connectors runs bounded parallel checks and reports each source independently in Activity. Installation, real candidate-link extraction, manual access and missing configuration have different states. Release-time results are displayed separately from your latest local check.

A public HTML test succeeds only when candidate vacancy links can be extracted. This does not guarantee relevance, current deadlines or successful imports of every detail page. JavaScript, human verification, robots rules, sign-in, DNS and network failures remain visible. Test all is read-only; it does not sign into providers or submit applications.

Discovery and Scheduler use the same country-aware source routes. Source indexes are checked with four concurrent readers, per-source time limits, and detailed Activity logs. Detail-review budgets rotate across larger source catalogs. Unreadable sources can use the selected AI provider's public web research in small batches if AI processing and web research are enabled. Deferred fallback sources and review limits are reported; coverage is not silently implied.

The packaged `resources/source-access-report.json` contains the actual release-time checks, timestamps, API samples and limitations. Access may differ by network or change later. Public API fixtures and live checks are distinct evidence; live failures are kept as failures.

## Listing management in Discover

All discovered, imported and MCP-returned listings are stored centrally in Discover. Each listing now has:

- A personal zero-to-five-star rating, independent of AI match score.
- Pin/unpin, shortlist/unshortlist, dismiss/restore, open listing and delete actions.
- Personal notes in its details panel; notes are searchable.
- Stage badges, including shortlisted and pinned states.

Sort by personal rating, AI match, closing deadline, newest discovery, institution, country, or last checked. Pinned listings appear first. Filter personal ratings, stage and country. Dismissed listings are accessible through the Stage filter.

Delete removes one listing after confirmation. Reset all listings removes every Discover listing, including filtered/dismissed entries, after a count-based confirmation. The operation writes a database backup in the data folder's `backups` directory and runs as one database transaction. Existing packages/files and application records remain; only linked listings keep a separate historical context for those records. Deleting a listing does not block future rediscovery. Dismiss it instead if you want to retain it with a dismissed status.

Finish or cancel active searches/imports/document drafting in Activity before deleting listings. Your saved searches, credentials, profile and document files are not reset.

## Official references

- LinkedIn access rules: https://www.linkedin.com/help/linkedin/answer/a1341543
- Indeed MCP scope: https://docs.indeed.com/mcp
- SEEK integration scope: https://developer.seek.com/introduction
- Interfolio Faculty Search: https://www.interfolio.com/products/faculty-search/
- Greenhouse public GET API: https://docs.greenhouse.io/job-board.html
- Lever public postings API: https://github.com/lever/postings-api
- Ashby public job board API: https://developers.ashbyhq.com/docs/public-job-posting-api
- Denmark's current job search: https://workindenmark.jobnet.dk/find-job
