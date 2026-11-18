# Experimental hidden keyword layer

Research checked on 16 November 2026. The user chose to keep this feature disabled initially.

The search did not establish a reliable, universal hidden watermark that passes employer screening. ATS products, employer rules, extractors and AI matching features differ. In particular, [hireEZ's ResumeSense announcement](https://hireez.com/newsroom/hireez-launches-resumesense/) describes detection of hidden text, prompt injections and unusual match patterns. [CareerOneStop's formatting guidance](https://www.careeronestop.org/JobSearch/Resumes/ResumeGuide/formatting.aspx) advises against white-font keyword tricks. [UCLA's resume guidance](https://career.ucla.edu/resources/resumes-cover-letters/) recommends relevant visible keywords and straightforward formatting.

AcademicApply therefore labels this feature as experimental and makes the exact embedded contents inspectable in the app. It has not been tested against an employer's ATS and does not promise improved ranking, shortlisting or selection. Hidden content can be ignored, exposed to recruiters, or flagged. A local text-extraction test proves only that the local extractor can read it.

## Implementation

- Disabled by default. An individual CV or cover letter can be enabled, customized from its available topics, or disabled. A Settings preference can enable the default for future packages.
- Topics come from a fixed computing and academic vocabulary. Each must match both a user-approved profile fact and the vacancy. The dialog shows the profile evidence and exact final text. Neither the listing nor AI output can insert arbitrary hidden instructions.
- DOCX uses native hidden text and keyword properties. Word export suppresses printing hidden text and restores the Word preference afterward. PDF output adds transparent text and keyword metadata locally after conversion. The visible blue headings and black body text remain unchanged.
- New revisions preserve previous files in package history. Keyword changes clear PDF and submission approvals. The current PDF must be exported and reviewed again. Disabling the layer regenerates the Word file without it; re-export removes it from the current PDF as well.
- Source profile or listing changes require a new package before enabling a layer. Other document types, referee contacts, private records and unsupported terms do not supply hidden keywords.

For broad screening compatibility, continue to use truthful, visible descriptions of relevant experience and obey the employer's document and eligibility requirements.
