# Northgate HQ — shared work queue

**Updated:** 2026-09-23 17:05 EDT (UTC-04:00) · **Machine:** `Ryan_Northgate`
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

- Agree on the initial full pre-1.0 semantic version. Historical V1–V5 labels and `package.json` `3.0.0` are not official releases.
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
- **Change Orders:** Resolve the compatibility hold before enabling stricter Project Manager approval/posting gates. Assign actual Project Managers through the existing authorized workflow, test Manager/Director behavior, then separately review `CFG-009`/`AUD-016`. Do not invent assignments or silently remove the current path. Source: `docs/reviews/V5_CHANGE_ORDER_RECONCILIATION_READINESS.md`.
- **Service calls:** Build the previewed, idempotent cost-report import with mapping, duplicate detection, and reconciliation. Existing service-call directory, billing, invoices, payments, and stages remain authoritative. Source: `docs/reviews/V5_PERMISSION_USABILITY_REPOSITORY_MAPPING.md`.
- **Forecasting:** Define and implement the period/deadline-driven Project Manager forecast cycle and revisions without replacing Job Financials as the source of truth. Same source.
- **Permissions and recovery:** Continue canonical action/permission coverage and grant provenance where incomplete. Emergency Override remains a later, high-risk design: Primary-only reauthentication, time-bound session, recovery capture, and tested restore. Do not turn on a broad permission bypass merely to finish a demo. Same source.
- **Inventory/estimating integration:** Confirm the remaining catalogue/price-review and source-value snapshot gaps against the current main release before scheduling another slice; the review mapping predates several completed September releases. Do not reimplement completed catalogue work.

## 5. Database and Storage recovery — deferred decision, required before broader beta

Ryan reaffirmed on September 22, 2026 that backup options should be decided later but must not be forgotten. Before relying on the release flow for business-critical data, verify actual Supabase backup/PITR capabilities and cost, Storage-object recovery, offsite destination, approximately eight weekly recovery points, alerting, and an isolated restore drill. Create an additional recovery point before significant production migrations once the policy exists. See `docs/reviews/ENVIRONMENT_RELEASE_PHASE1_CURRENT_STATE_20260922.md`.

This is a tracked decision gate, **not authorization** to purchase, schedule, export, restore, or modify Production backup settings now. Existing per-object permanent-deletion safeguards remain in place.

## Promotion boundary

The above feature items are **Development → Staging** work. A Production release is a separate, deliberate decision after acceptance, migration/recovery review, version tag and GitHub Release, and deployment verification. Necessary Production hotfixes follow their own reviewed path. Nothing in this queue authorizes automatic Production migration or deployment.
