# Electrical inspection implementation and release checklist

**Status:** Local release candidate, 2026-09-14. User authorized implementation with “Proceed” after the integration plan and review-policy update. No deployment, production migration, permission grant, or live customer import has been performed.

## Delivered behavior

- Add-On Tools entry and `/electrical-inspections` workspace with directory search, workflow/archive views, horizontal Overview / Equipment / Findings / Photos / Report tabs, new inspections, and multiple equipment records.
- Visual and labeling checklists, feeder and circuit observations, explicit units and conductor pairs, exception reasons, findings, recommendations, separate priority/category/legacy severity, and correction evidence.
- Assigned technician, scoped manager/reviewer access, submission, return with reason, immutable issue, revised drafts, and audit history. Completion measures recorded observations; it is never a condition grade.
- JSON and inert HTML import preview; older single-panel and version-2 formats; original structured source plus exact original file retention; content fingerprint and duplicate confirmation; unknown data retained and ambiguous mappings exposed for resolution. No scripts execute during import.
- Existing/new canonical job or service-call links. `ServiceCallFields` and `EMPTY_SERVICE_CALL` are shared with the existing workspace. Create-and-link calls the existing `svc_save_call` inside one audited, idempotent transaction. It neither invents numbers nor changes billing rules.
- Deterministic multi-page PDFs containing all equipment, observations, findings, units, explicit missing values, photos, and frozen technician/reviewer/job metadata. Preview, download, and job Documents upload use the same bytes. PDF code loads on demand.
- Report presentation follows Ryan's supplied inspection PDF: Northgate Electrical branding, burgundy headings, client/visit grid, equipment summary, compact checklist and feeder tables, paired odd/even circuit schedules, equipment findings and captioned photos. Long circuit notes are numbered below the schedule; repeated notes list every affected circuit. Continuation pages repeat table headings and row context. Source condition scores are not adopted as new grades.
- Real private Storage uploads with reserved document IDs, size/type/hash metadata, read-back byte verification, finalization, safe retry, and cancellation of incomplete report uploads. Finished reports appear in the existing job Documents system under optional **Service Inspections**. They do not increase required-document checklist counts.
- Shared **Permits & Inspections** tab on jobs and service calls: optional multiple permit numbers and portal URLs, dates/status/notes, independent jurisdiction attempts, prior failed/partial attempts, and same-job document links. Health-inspection references are displayed independently and never mark a permit Passed or Closed.
- Failed saves retain edits; authenticated-user-scoped in-memory recovery protects navigation within the session. Stale versions require comparison/reload. No customer drafts are written to browser local storage. Reloading/closing the browser still requires saving or exporting first.

## Adopted implementation details

These supersede the proposed physical table/API names in the earlier integration plan. Product scope is retained.

| Concern | Implemented contract |
|---|---|
| Equipment and findings | Stable nested IDs in one versioned `health_inspections.document` JSON object. One save locks and validates the entire inspection, avoiding partial multi-panel updates. |
| Historical issue | Relational `health_inspection_revisions`, with frozen document, job snapshot, assigned technician and reviewer names, issue reason/time, renderer version, and evidence IDs. Prior revisions never change during revised-draft edits. |
| Files and delivery | `health_inspection_files` references the canonical `documents.id`; it holds inspection/revision relationships, caption, content hash and upload state. One active report per revision/destination. Cancelled reservations remain retained. |
| Source provenance | `health_inspection_imports` stores the original parsed object, source fingerprint, exact file hash/name and importer/time. Original HTML/JSON bytes use inspection-owned Documents; HTML is offered as a download, never mounted as app content. |
| Job health references | Derived from `health_inspections.job_id`. No duplicate health-kind jurisdiction-attempt row to keep synchronized. |
| Permission flag | `can_review_electrical_inspections`, false by default for every role. Existing templates/overrides configure it. No hard-coded Ryan or technician account. |
| Identity | Existing Clerk subject and active `user_permissions` account; no Supabase Auth migration. Target-assignee resolution is explicitly target-scoped and does not misuse the caller-scoped effective-permission helper. |
| File limits | 25 MB per source/report/native JPEG or PNG; imported inline images are limited to 20 MB and may also be WebP. WebP is converted losslessly to PNG for PDF compatibility, with the original source retained; no downsampling. |
| Text | Supported Latin accents/punctuation render directly. Characters outside the bundled standard PDF font appear as explicit `[U+…]` codes; original strings remain in saved/exported JSON. |
| Source interpretation | `single`, `double`, `triple` breaker poles map to 1/2/3; unsupported configurations get review notes. The supplied HTML explicitly labels circuit temperatures °F. Legacy voltages require actual conductor-pair selection before issue. |

### Server and storage boundaries

Applied migrations: `20260914235450_electrical_inspection_workflow.sql` and
`20260915000120_inspection_reviewer_permission_management.sql`, on the existing
production project `keogysnoukbendfkfjcn`. Local filenames match server-recorded versions.
The list/search correction `20260915000719_inspection_list_alias.sql` is also applied.
The follow-up permission migration extends the current audited batch permission editor so only
the inspection-reviewer override can change on Developer accounts. It preserves
their template assignment and other overrides. The legacy single-flag setter/clear
RPCs keep their existing Developer restrictions; the UI uses the batch editor.

All seven new tables use RLS and revoke direct anonymous/authenticated table writes. Only the named `hi_*` API functions are executable by authenticated clients; private helpers are revoked. Every API checks an active account and the relevant add-on/job/division/record authority. Parent row locks, expected versions, and actor/request receipts make writes atomic and retries safe. Audit failure rolls back the operation, including creation of a linked service call.

Private draft/source/photo access requires inspection authority. A finalized job-owned PDF uses the existing job audience, including participating departments. Narrow restrictive policies protect inspection-managed objects from replacement/deletion and hide incomplete reports from ordinary job readers. A document trigger also protects against existing SECURITY DEFINER maintenance RPCs, which bypass table RLS. Existing signed Change Order guards remain in force. A storage-path lookup index supports the new predicates; prior live metadata had no such index.

Finalization verifies the stored object exists and matches reserved size/type. The application downloads and hashes its bytes before finalization and before report generation. The server records the authorized publisher's fingerprint; it does not independently attest that client-supplied PDF content semantically matches the report snapshot.

## Validation evidence

| Check | Result |
|---|---|
| `npm test` | 77 passing tests, including 11 inspection model/import tests and existing financial/estimate/document tests. |
| `node scripts/verify-electrical-inspection-db.mjs` | 58 checks passing in isolated PGlite/PostgreSQL, plus reviewer grant/deny/default, target-scoped audit, preserved other override history and Developer protection assertions. Covers migration, active/inactive/anonymous and add-on/reviewer revocation, scoped reads, direct-write denial, stale saves, request replay, duplicate imports, issue requirements, pending files, immutable evidence, generic-maintenance bypass protection, report recovery, permits/reinspection, and rollback. |
| Database harness scope | Uses synthetic dependency tables and captured current public permission functions. Canonical service-call creation is a tested integration boundary stub here; its full existing workflow is covered separately. This is not a production-authentication test. |
| `node scripts/verify-electrical-inspection-ui.mjs` | 1440 / 768 / 390 px: creation, failed-save retry with same request ID, panel editing, navigation recovery, job link, review/issue, PDF publication, permit/reinspection and read-only controls. Synthetic APIs; no live customer writes. |
| `node scripts/verify-service-calls.mjs` | Existing desktop/tablet/phone creation/editing, invoicing, archive, import preview, financial views and resource navigation pass after shared-form extraction. |
| `node scripts/verify-electrical-inspection-pdf.mjs` | Deterministic 8-page branded synthetic sample and 9-page pagination stress report. Source unchanged; paired circuit positions, full long notes and recommendations, units/zero/missing/exception states, unresolved voltage pairs, draft/issue metadata, branding and photo evidence preserved. All text within bounds with no overlap; rendered pages visually inspected. |
| Supplied private ZIP | Both JSON and HTML parsed locally: six panels, 252 configured circuit positions, 149 measured circuit temperatures, three findings, 40 review notes; identical saved-state fingerprint. Populated source stays in ignored `.temp/inspection-private`, outside fixtures, bundles, and Git. No live import. |
| Build | Release-readiness check passes with the existing public production Clerk/Supabase settings, validated from the live app without logging values. Candidate: `.temp/inspection-production-check-1789430532866`. The prior isolated test build `.temp/inspection-build-1789429481015` remains **not deployable**. Logo is a bundled hashed PNG loaded on demand with a content-type check. Existing bundle-size/XLSX import warnings remain. |

Test harness dependencies are isolated: install `@electric-sql/pglite` under `.temp/inspection-checks`; set `PLAYWRIGHT_MODULE` to the available Playwright package. The supplied workspace runtime was used. No application package/lockfile dependency changes were needed. Browser screenshot/PDF artifacts are in ignored `.temp/inspection-qa`.

The 2026-09-14 presentation revision uses the supplied 13-page ACC Blvd PDF as a visual reference only. Its SHA-256 is `f8d1855e83e4aefb87235f432937ac65a8c9f2ad2a39719b62d13198fb25ddb0`. It includes later findings/photos than the earlier ZIP's saved state; neither source was overwritten or silently reconciled. The preview uses synthetic data and an explicitly labeled illustrative photo. It is not a regenerated customer inspection. Renderer version 1 is the first release; the reference-driven layout changes no historical customer revision.

## Release sequence and remaining acceptance

**Release authorized September 14, 2026:** feature commit `8152528`; all three migrations applied. Both Ryan Noel accounts have explicit reviewer overrides. The Manager account also has the inspection add-on enabled; the Developer account already receives add-on access. These audited changes target only the two accounts Ryan selected.

The release preflight caught the existing Developer-target restriction in the batch permission editor. The follow-up permits only this new flag for Developer targets, retaining stale-save validation and unchanged override history. Template editing fills newly introduced boolean flags with false when loading an older template.

Verification: 77 Node tests; 58 database checks plus permission-management assertions; permission-editor browser tests at desktop/tablet/phone widths, including the Developer reviewer control. A production rollback-only test using both authorized account subjects passed canonical service-call creation and replay, permits/reinspection, issue/revise immutability and missing-upload rejection. All synthetic rows rolled back: production remains 51 jobs, 18 documents, and zero inspection/revision/file/permit/register rows.

Security advisors: no new error-level findings, anonymous executable functions, or mutable-search-path findings from this release. The seven RLS-enabled API-only tables and 14 checked authenticated inspection APIs create expected informational/warning notices. Existing security-definer-view errors predate this release; see [Supabase guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

Published through the existing Netlify/Git integration: deploy `6aa88bc4748c3500071c76ba`, source `fa26a66`. Live HTML and all 13 assets match the tested build by SHA-256 and MIME; silas-chat is retained and the 551-file secret scan has no matches. The signed-in check caught a list/search alias collision, corrected by the third applied migration with new empty/populated/scoped/search/archive/pagination tests.

Signed-in acceptance: Ryan signed in during release verification. The live Developer session successfully opened the add-on, loaded the corrected list, opened a new form and generated draft PDF bytes (Download PDF became available). The Codex embedded PDF frame remained blank; ordinary-browser viewing still needs confirmation. Camera/photo selection, actual Storage upload/download and a customer pilot remain to be exercised interactively. The database test uses authenticated-role JWT claims inside a rolled-back SQL transaction; it does not upload actual Storage bytes; the separate live browser check verifies Clerk sign-in for Developer Ryan. No customer source was imported or issued. The supplied PDF/ZIP remain preserved private source material.

Rollback retains the additive schema and issued evidence; disable the new add-on/revert the UI release if needed. Do not delete inspection history, Storage objects, permission history, or source files to roll back a UI deployment.

Review ownership follows ARCHITECTURE Section 51. This release requires normal technical and authenticated acceptance, not a Claude review gate.
