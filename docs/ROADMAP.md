# Northgate HQ — shared work queue

**Updated:** 2026-09-24 12:20 EDT (UTC-04:00) · **Machine:** `RYAN_NORTHGATE`
**Scope:** This is the cross-machine queue for work that remains open. `HANDOFF.md` preserves completed release history; `docs/ENVIRONMENT_RELEASE_WORKFLOW.md` records environment details. Older review documents are evidence, not separate competing roadmaps.

## Cross-machine sync convention

For each new work checkpoint, record a unique sync marker in the commit message and the handoff entry, plus the **local date, time, UTC offset, machine name, branch, commit SHA, and deployment/migration status**. Use the actual machine hostname, not an assumed device nickname. Example format:

`SYNC-MARKER` · `2026-09-23 14:27 EDT (UTC-04:00)` · `Ryan_Northgate` · `development` · `<SHA>` · `local/pushed/staging/production`.

The marker proves a specific Git checkpoint, **not** that another machine has fetched it, a migration was applied, or a site deployed. Verify branch/SHA and deployment separately. Never reuse a marker. For changes not yet committed, record `uncommitted` and do not call them synchronized. A documentation-only commit with `[skip ci]` need not redeploy the app. Do not embed secrets or machine-local paths in the sync entry.

## 1. Staging readiness — access/routing smoke test passed; Change Order draft fix awaiting owner acceptance

- The independent `staging` branch/site and isolated staging Supabase exist. First app deploy: `58ea95e`, Netlify deploy `6ab410cc3fab6c5ff1b8eccd`. Both designated Clerk invitations were accepted. A Developer signed in and created a labeled job that was confirmed absent from Production.
- **Verified 2026-09-23:** A normal certificate-validating HTTPS request to `https://staging.rnsolutions.net/` returned HTTP 200, and the CNAME still pointed at the dedicated staging Netlify site. This supersedes the earlier certificate-mismatch observation.
- **Owner-tested 2026-09-23:** Invited `ryan@thenorthgategroup.com` signed in and saw only standard-User content; uninvited `Ryan@rnguns.com` could not sign in. These are reported UI results, not an exhaustive server-side permission audit.
- **Owner-tested 2026-09-23:** Opening `/jobs` in a new tab loaded the directory and allowed reselection of the test job. Job selection is page state, **not** an individual shareable URL; the former “copy job deep link” test was corrected accordingly. The ordinary-User account is not assigned to that test job and could not see its Financials. Opening a staging link while signed out navigated to sign-in. These results pass the access/routing smoke test.
- **Change Order draft correction on Staging:** Populated breakdowns can now save without financial coding; submission still requires every line to be coded, enforced in the UI and database. Header-only drafts were verified. Migration `20260923201445_change_order_uncoded_drafts.sql` was applied only to Staging. Owner acceptance in the app remains pending; do not add artificial financial lines solely to hide a draft gap.
- Staging infrastructure is usable for Development/Staging feature work. The above smoke test does **not** certify every workflow or grant permission for Production promotion.

## 2. Release and environment control — after staging gate

- Initial full pre-1.0 Production release `v0.5.0` was tagged and published on September 24. Historical V1–V5 labels and `package.json` `3.0.0` are not official releases; reconcile app-visible version separately before a later release.
- Verify GitHub Releases, branch protection, migration manifests, and deliberate Development → Staging → Production promotion/rollback checks. Production `main` must not receive unfinished work.
- Add safe environment/version/build/database-environment visibility to the Developer Console, as proposed in the environment restructure. Do not expose secrets.
- Source: `docs/ENVIRONMENT_RELEASE_WORKFLOW.md` and `docs/reviews/ENVIRONMENT_RELEASE_PHASE1_CURRENT_STATE_20260922.md`.

## 3. Silas guided Change Order builder — Staging owner acceptance pending

- Source: Ryan's 2026-09-23 pasted proposal, *Northgate HQ — Silas Guided Workflows, Priority 2*. **Not implemented or approved for Production.** Its prerequisite is operational, isolated staging.
- The audit and additive implementation plan are recorded in `docs/reviews/SILAS_GUIDED_CHANGE_ORDER_STAGING_20260923.md`. The guided UI and two Staging migrations are implemented; owner acceptance is pending before any Production decision.
- The implementation reuses one Change Order draft and pricing path from both Dashboard → Ask Silas and Project → Change Orders → Help Me Build It. Create Manually remains first-class. Scope, multiple line items, costs, schedule/access, clarifications, teaching, save/exit/resume, checklist, and ordinary editable-draft handoff are in the Staging candidate. “Ready for Review” is a guidance flag, not submission.
- The existing Developer Silas setting is now presented as AI assistance availability. Guided steps remain available when AI is off and make no AI call. Optional AI actions and future provider work are later slices.
- **Owner acceptance remaining:** demonstrate both entry points, autosave/resume, permissions, AI-off operation, manual-flow regression, stale-edit protection, and responsive layout on Staging before any Production decision.

## 4. V5 reconciliation — tracked remaining slices

- **Staging financial setup trial (September 23):** Budget template selection, manual-line access, and the cost-report import preview/selection overlay are being promoted to Staging for owner testing. The report preview can display revenue, but revenue writes remain deferred until their Billing/SOV destination is confirmed. No Production promotion is implied.
- **Staging validation finding:** The template created 165 lines and aligned 12 existing Change Order lines on the test job; a repeat selection had no changes and now reports that clearly. A missing authenticated self-read grant on `user_permissions` was repaired on Staging in migration `20260923194702_staging_user_permissions_self_read.sql`. Owner refresh and further workflow testing remain pending.
- **Cost-report source retention:** Financial import now links the original uploaded file to Job Documents → Cost Reports and the financial audit source, with protected-financial read gating. Staging migration `20260923195722_job_cost_report_documents.sql` adds the required metadata/storage policies. Owner file-open and unauthorized-user acceptance tests remain pending before Production promotion.

- **Jobs Financials:** Consolidated contributor proposals for bulk input, imports, and catalogue operations remain deferred; current direct setup tools remain approver-only. Complete test/review of the deployed budget and SOV proposal foundations. Source: `docs/reviews/V5_JOBS_FINANCIALS_RECONCILIATION_READINESS.md`.
- **Assigned Jobs in Dashboard → My Work:** Implemented in the Staging candidate and owner-accepted on September 24. The existing My Work table merges its project-member rows with the four informational responsibility slots, displays role labels, deduplicates Jobs and retains direct navigation. New self-scoped RPC `read_my_job_responsibilities()` requires current Job access; normal Jobs RLS filters the detail fetch. This does **not** grant assignment-driven financial or editing permissions. Staging migration `20260924162513_dashboard_job_responsibilities.sql` was applied; Production promotion remains a separate decision.
- **Budget health alerts in Dashboard → Project Health:** Staging candidate implemented September 24; owner browser acceptance pending. Uses only My Work Jobs and existing financial-line/CO-posting RLS, classifies with the same 20%/5% thresholds as Job Financials, and keeps unresolved alerts visible after a per-user acknowledgement. A changed budget or actual amount invalidates that acknowledgement. Staging migration `20260924191152_dashboard_budget_health_acknowledgements.sql` adds only the acknowledgement state and a permission-checked RPC. No assignment-derived financial grant or Production deployment is implied.
- **Change Orders:** Resolve the compatibility hold before enabling stricter Project Manager approval/posting gates. Assign actual Project Managers through the existing authorized workflow, test Manager/Director behavior, then separately review `CFG-009`/`AUD-016`. Do not invent assignments or silently remove the current path. Source: `docs/reviews/V5_CHANGE_ORDER_RECONCILIATION_READINESS.md`.
- **Service calls:** Build the previewed, idempotent cost-report import with mapping, duplicate detection, and reconciliation. Existing service-call directory, billing, invoices, payments, and stages remain authoritative. Source: `docs/reviews/V5_PERMISSION_USABILITY_REPOSITORY_MAPPING.md`.
- **Forecasting:** Define and implement the period/deadline-driven Project Manager forecast cycle and revisions without replacing Job Financials as the source of truth. Same source.
- **Permissions and recovery:** Continue canonical action/permission coverage and grant provenance where incomplete. Emergency Override remains a later, high-risk design: Primary-only reauthentication, time-bound session, recovery capture, and tested restore. Do not turn on a broad permission bypass merely to finish a demo. Same source.
- **Inventory/estimating integration:** Confirm the remaining catalogue/price-review and source-value snapshot gaps against the current main release before scheduling another slice; the review mapping predates several completed September releases. Do not reimplement completed catalogue work.

## 5. Database and Storage recovery — deferred decision, required before broader beta

Ryan reaffirmed on September 22, 2026 that backup options should be decided later but must not be forgotten. Before relying on the release flow for business-critical data, verify actual Supabase backup/PITR capabilities and cost, Storage-object recovery, offsite destination, approximately eight weekly recovery points, alerting, and an isolated restore drill. Create an additional recovery point before significant production migrations once the policy exists. See `docs/reviews/ENVIRONMENT_RELEASE_PHASE1_CURRENT_STATE_20260922.md`.

This is a tracked decision gate, **not authorization** to purchase, schedule, export, restore, or modify Production backup settings now. Existing per-object permanent-deletion safeguards remain in place.

## 6. Post-demo Staging development package — scoped roadmap, not a single release

Source: Ryan's September 24 Staging-development package. The narrow Production demo patch is now `v0.5.0` at `810b3c9`; these follow-on features are **Staging-first** and independently promotable only after their own acceptance. This section records direction and sequencing, not approval to modify Production or to implement all priorities at once. Keep existing manual workflows and the risk-based audit-reason policy.

### Dependency map and reusable foundations

| Proposed slice | Existing foundation to reuse | Dependency / boundary |
| --- | --- | --- |
| Project-health alerts (Priority 1) | `classifyBudgetHealth`, Job Financials, Dashboard Needs Attention/Pulse, responsibility RPC, existing job-access and protected-financial permissions | First reconcile the four Production responsibility slots into Staging's assignment-aware read model. Alert computation and any aggregate must apply current per-user data scope server-side; acknowledgement changes presentation, never the underlying condition. Required alert area stays outside customizable widgets. |
| Responsibility integration (Priority 2) | `job_responsibilities` informational slots, `job_user_assignments`, existing global/granular permissions | First add Assigned Jobs to My Work without changing authority. Separately design scoped Job authority; one named owner per controlled slot, unlimited other participation. No automatic financial-edit grant from assignment alone. |
| Guided CO refinement (Priority 3) | Existing deterministic `GuidedChangeOrder`, one authoritative CO draft/pricing path, autosave/resume and manual alternative | Await Ryan's annotated screenshots for step boundaries. Preserve flexible navigation and one logical decision group per step; do not create another CO system. |
| Custom dashboard (Priority 4) | Dashboard workspace, existing Cards/Pulse, Job and permission helpers | Implement saved working-layout session with Save/Discard, individual removal, four-column responsive grid, hierarchical searchable widget picker, optional checked deep links. Source queries reauthorize on every read; saved configuration never caches sensitive data. Repeating assigned-project templates are a later slice. |
| Principal experience (Priority 5) | Role/default/override model and future widget framework | **Definition pending:** Principal is not yet a canonical role in the User → Supervisor → Manager → Director → Developer hierarchy. Decide placement, business authority, protected-financial defaults, and distinction from Director/Developer with ownership before schema/default changes. Do not hard-code executive widgets yet. |
| Unit-based budgets (Priority 6) | Job budget lines, actual-cost and forecast calculations | Financial schema/calculation design and historical migration review required. Optional unit type, quantity, rate and source must not rewrite original or billed history. Specify rounding and which input is authoritative when amount, rate and units disagree. |
| Classification and analytics (Priority 7) | Job Details, Reports workspace, existing financial/project metrics | Start with optional multi-select classifications and scoped read-only comparisons. Reference existing financial values rather than duplicate entry. Analytics must exclude data the viewer cannot access, including protected financials. |
| Nested documents (Priority 8) | Job Documents, categories/tags, storage metadata, document audit/permissions | Distinguish virtual folder metadata from physical Storage paths; review move/rename/archived-document behavior and links before migration. Preserve current categories and existing files. |
| Project backup (Priority 9) | Job Documents and Storage access; existing project metadata | First design a manual ZIP + manifest with category/folder organization and tested restore-by-hand. Dropbox one-way copy follows only after connector/auth, destination, integrity and access review. No automatic purge, offloading or two-way sync in this package. This is distinct from Production database backup/PITR policy in Section 5. |
| Billing templates (Priority 10) | Job Billing/SOV/Pay App data and immutable history | Backlog/architecture only until real AIA, GMP, residential and commercial examples arrive. No universal template engine or client export guessed from incomplete samples. |

### Recommended implementation order and release grouping

1. **Acceptance/groundwork:** Finish the current Staging guided-CO acceptance and financial-import/document tests in Sections 1–4. Reconcile `v0.5.0` into Staging without losing Staging-only work. Establish permission-safe Job responsibility reads and an Assigned Jobs/My Work slice. Demo-ready with existing records; no assignment-driven permissions yet.
2. **Project health:** Build a server-scoped budget-alert feed using the existing health thresholds; persistent non-removable dashboard area; per-user acknowledgement with actor/time. Test healthy/warning/danger/over-budget, zero or missing budgets, protected-financial exclusion, assignment changes, acknowledgement persistence and condition resolution. This can ship separately from customizable dashboards.
3. **Low-risk independent metadata/UX:** Refine guided CO step layout after screenshots; optional Project classification fields and initial filterable Reports view; document folder design/prototype. Each can be accepted independently. Avoid broad schema migration until existing records and audit behavior are mapped.
4. **Dashboard configuration:** Build the four-column session-based widget layout and picker after authorized read endpoints and alert-area separation are proven. Test Save/Discard, reorder/remove, mobile stacking, deep-link denial after access revocation, and no stale financial payload in configurations. Add repeating assigned-project layouts later.
5. **Higher-risk financial/storage slices:** Unit-based budgets require cent/unit reconciliation, historical-data and SOV/forecast regression tests before any promotion. Nested folders and manual ZIP backup require Storage metadata and actual file integrity/recovery tests. Dropbox backup follows only after one-way destination/access design and external-service authorization.
6. **Definition-gated:** Principal role/dashboard awaits owner requirements. Template-based billing export awaits representative documents. Do not block the independent slices above on these definitions.

### Data and security review before coding each slice

- Likely additive Staging schema: alert acknowledgement keyed to condition/user (with timestamps), dashboard layout/configuration, optional Project classification/tags, optional unit-basis fields, and document folder relationships. These are **candidates**, not approved migrations; first inspect equivalent tables, RLS, RPCs, indexes and audit structure. Assignments already have a table and should not be duplicated.
- Alerts, widgets, analytics, exports, deep links and Silas must resolve live permissions and protected-financial scope at the data-access layer. No browser-only hiding. Authorization changes must invalidate visible sensitive data immediately.
- High-risk areas: budget unit math and historical financials; assignment-derived edit authority; folder moves affecting document pointers; Dropbox data transmission; and recovery claims. Test migrations on isolated Staging, verify old records, rollback/forward-repair paths, RLS, concurrent edits and audit fidelity. Do not copy Production data into Staging just to make demos realistic.
- The earliest plausible demos are Assigned Jobs/My Work, compact budget alerts, and screenshot-guided CO layout refinement. Principal, budget composition, Dropbox, and billing-template exports need additional definition or safety testing before promising a demo date.

## Promotion boundary

The above feature items are **Development → Staging** work. A Production release is a separate, deliberate decision after acceptance, migration/recovery review, version tag and GitHub Release, and deployment verification. Necessary Production hotfixes follow their own reviewed path. Nothing in this queue authorizes automatic Production migration or deployment.
