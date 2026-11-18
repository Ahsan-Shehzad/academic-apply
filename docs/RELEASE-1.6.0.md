# AcademicApply 1.6.0

This release improves submission-package preparation around the document requirements of the selected listing.

## Supporting files and coverage

Multiple library files can be added together, and a native file picker imports multiple local PDFs, Word documents, images, RTF, ODT or text files into the evidence library and package. File assignments support multiple requirements. Individual files can be opened, reassigned or removed while retaining originals. Filename-based suggestions are review aids, not content verification.

Coverage now displays supplied/required counts, distinguishes optional requirements and supports manual count corrections and additional requirements. AI extraction requests explicit counts; local parsing distinguishes counts for transcripts, papers and letters within the same sentence. Duplicate file content counts once per requirement. Official records and published papers remain attachments even if AI incorrectly labels them as generated narratives. Final application approval rechecks required coverage, including legacy packages. Counts and AI extraction should still be checked against the official listing.

## Creating additional documents

Missing and optional applicant-authored narratives can be created inside an existing package. The same verified-fact, content-audit and Word-layout path is used for initial and additional documents. Existing attachments are preserved across drafting and failures. Activity exposes progress, partial package links, cancellation and retry for additional narratives and referee-letter drafts.

Requested reference/recommendation letters support one review draft per selected profile referee. Only the selected referee's name, professional title, institution and supplied relationship accompany the public candidate facts; private referee email/phone records are excluded from these prompts. Drafts use the referee's identity and a dedicated Reference Letter heading, with the existing professional blue/black styling. They are editable and exportable but are permanently ineligible for submission. Their existence or editorial review cannot satisfy a signed-letter requirement. Manual upload, controlled AI upload, native handoff and combined-packet paths exclude these drafts. Actual signed letters must be supplied as original attachments. Separate/confidential referee submission is tracked through explicit user-recorded counts and notes; no email or letter is sent by this feature.

## Combined packets and verification

The combined-PDF dialog selects reviewed narrative PDFs and original PDF attachments. It excludes referee drafts, records source hashes and invalidates stale merged packets after source/package changes. Derived packets do not double-count evidence. Submission approvals are invalidated after package changes.

Validation includes automated coverage, duplicate/multi-assignment, local import, in-package drafting, reference identity/privacy, draft upload exclusion, separate-submission and merge-staleness tests. Electron fixtures exercise multiple library attachments, local multi-file import, two referee drafts, signed-letter replacements, in-place narrative creation, shared assignments, selected three-page merging and safe removal. A live Codex run extracted two transcripts, three papers and one reference letter, generated a truthful referee-review draft, and exported it through Microsoft Word as a one-page PDF. The rendered page was visually inspected. No real job application or email was submitted during validation.

Microsoft Word remains required for PDF export. Referee review, signatures and institution-issued records remain external steps. Existing packages are not regenerated or rewritten by installing this update.
