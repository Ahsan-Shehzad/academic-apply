# AcademicApply 1.2.0

## Listing-driven submission packages

Documents opens in automatic mode. With AI processing enabled, the selected document provider extracts application requirements before drafting. It distinguishes mandatory and optional documents, preserves topics and limits, resolves alternatives, and separates applicant-authored documents from official records and third-party letters. Manual selection remains available.

Additional types include research proposals, teaching portfolios, publication lists, diversity statements, career plans and other application statements. Publication lists use verified local records. Narratives use the approved profile and evidence-ID validation.

Each package records requirements and coverage in the app and package-manifest.json. Select required external files from the evidence library and assign them to the corresponding requirement in Supporting files. Transcripts, certificates, published samples, signed forms, evaluations and recommendation letters are not fabricated. Stated counts of separate letters or samples are checked. A combined file may need manual review against the listing. Missing mandatory requirements prevent Ready status. Compare extracted requirements with the final portal, where additional requirements can emerge.

With AI processing off, local rules provide a preliminary list. If no explicit list is identifiable, the app proposes a CV and letter and warns that official instructions need checking. Narratives still require AI processing; failed tasks retain documents already created.

## Academic CV template 3

The CV contact header includes email, telephone numbers, the explicitly included work address, and clickable LinkedIn, Google Scholar, Web of Science, Scopus, ORCID, GitHub and ResearchGate links. Readable labels avoid reliance on icon fonts. Extraction from final-cv/index.html is restricted to the matching candidate's identity header, excluding referee contacts elsewhere. Approved YAML contacts are the fallback.

The structure retains separate teaching, research and professional appointments, reverse chronology, publication-status groups, numbered citations, DOI links, projects and skills. Academic service, memberships and certifications are included when present in the approved profile. Headings stay blue and body text black. Previously generated files are retained; create a new package to apply template 3.

## Persistent Antigravity ACP

The official `agy acp --stdio` server runs in the background for the app session. Initialization is shared; each task receives a fresh session, closed afterward. The server reconnects on the next request after disconnection and closes when AcademicApply exits. Cached sign-in needs no terminal.

Models come from ACP session configuration. Model and thinking level use session/set_config_option; earlier combined Gemini IDs remain compatible. Permission requests are denied, client filesystem and terminal capabilities are disabled, default customizations are excluded, and no MCP servers are supplied to the AI session. Browser and file operations remain application-controlled. Account entitlements, availability and usage limits still apply.

Test service checks connection, model discovery and an actual structured drafting response. Progress appears in Activity. Testing does not enable AI processing or change the default workflow provider.

Sources: [Antigravity ACP](https://antigravity.google/docs/cli/acp/), [ACP session configuration](https://agentclientprotocol.com/protocol/v1/session-config-options).

## Workflow models

Every workflow has a visible model dropdown populated from its effective provider's returned models. Clear it to inherit the provider default. Exact custom IDs remain supported. Changing workflow provider clears its previous model override. Test the effective provider to refresh its list.

## Verification

Windows x64: automated tests, Electron UI checks, real Codex and Antigravity structured service/drafting checks, and native Word PDF export. A live ACP run planned and created a CV, cover letter and teaching statement and correctly left the official transcript outstanding. The candidate's six-page CV was rendered and inspected. The installer is unsigned; Word is needed for native PDF export. No real application or email was submitted.
