# AcademicApply 1.6.1

## CV headings

Academic CV section headings no longer contain decorative icons. Contact/network icons, readable labels, hyperlinks, blue headings, black body text and other document types retain their existing styling. The Word template revision is 5.

Older CVs have a Remove heading icons action. It patches only drawing runs and their spacer runs in Word heading paragraphs, preserving all other XML parts and non-whitespace text. Previous Word/PDF revisions are retained in history. The action exports only the chosen CV, clears that CV's review and package submission approval, and can be retried after export failure. It leaves CVs that already have plain headings unchanged.

## Workflow diagnosis and fixes

Deleting the last saved search previously caused Store startup to create the default enabled search again. Defaults are now seeded only for a new workspace, with a valid next-run time, so an intentionally empty search list remains empty. Deleting a saved search while it is running no longer breaks completion or recreates that profile.

If built-in discovery raised an error before returning, connected MCP research tools previously never ran. Searches with configured MCP tools now log the built-in failure and continue. Cancellation still stops the run; a failed search with no alternative tools still reports its failure.

PDF export previously held an old package snapshot while Microsoft Word was working, then saved it over newly attached files or assignments. It now exports to a temporary file and updates the selected document in the latest package. It rejects a changed Word source, preserves the previous PDF on cancellation/failure, and cleans up temporary output. Editing and review cannot race that document's export. Existing unchanged PDFs retain their reviews instead of being regenerated unnecessarily. Approving stale Word/PDF pairs is rejected.

Word edits now merge their document into current package state, preserving concurrent supporting-file work. Combined-PDF creation validates source ownership before reading, checks the package version and source hashes before saving, and rejects stale reviewed PDF inputs. A package change during merging cannot overwrite current work or produce a stale combined packet.

## Validation

86 automated tests pass, including eight focused workflow regressions. Electron checks cover legacy CV heading cleanup, history, targeted export, review preservation, supporting files, advanced discovery and controlled browser uploads. A copy of the stored candidate CV was exported through Microsoft Word and all six pages were visually inspected. Fifteen heading icons were removed; twelve contact/network icons remain. Every non-whitespace text run and every other Word package part was verified unchanged.

Browser checks use isolated fixtures and leave final submission untouched. No real job application or email was sent during diagnosis. The source-access report is retained from the earlier release; this update does not claim a fresh test of every job portal.
