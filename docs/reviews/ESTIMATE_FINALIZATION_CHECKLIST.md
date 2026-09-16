# Estimate Finalization Checklist

## Release authorization and database verification — 2026-09-16

Ryan explicitly requested commit and deployment. All four migrations are applied; filenames were aligned to Supabase's recorded versions: checklist 20260916103538, AFC 20260916103702, sections 20260916103706, read audit 20260916103711. An initial AFC attempt rolled back because it rebuilt the override allowlist from role defaults and omitted the separately granted Developer correction capability. The corrected migration extends the existing constraint, preserves that grant, and passes a new regression (40 isolated database checks total).

Actual-schema rollback-only suites now pass for both checklist finalization gates and unchanged $72.97 pricing/handoffs, AFC draft/replay/version/reviewer checks, service-only release/missing-file rollback/immutable archive, original destinations, document classification and read auditing. Test fixtures account for live required grant-audit columns and the existing transaction-NOW document timestamp trigger. No test jobs/studies/files/storage metadata/audits, reviewer grants or historical classifications remain. Existing correction permission remains intact.

AFC Edge Function afc-release version 1 is ACTIVE (ID 81a63b35-d563-4148-bf35-722453d1e892), bundle SHA-256 0a42bff0f95de542d08f4b7d5abe7347a180162fd81059b4fb595c8cdc1f6b3c. Browser preflight 204, missing-token denial 401 and forged-token denial 400 passed. It uses its custom caller-scoped Clerk/PostgREST check with the legacy gateway JWT check disabled. Authenticated browser uploads and physical printer acceptance remain unclaimed.

Security advisors changed only as expected: four RPC-only AFC tables have RLS with direct writes revoked and no table policies; eight new authenticated guarded SECURITY DEFINER endpoints. Existing anonymous endpoints, mutable-search-path and view findings did not increase. References: [RPC-only table policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [authenticated function review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

The pending choices remain default-denied AFC review and unchanged historical classifications. The external MCP route is unexposed and its OAuth connection is unconfigured; internal read tools remain disabled. Earlier local-only status and unapplied-migration statements below describe the pre-release checkpoint and are superseded by this section. Frontend publication and the final sync marker will be recorded after verification.


Status: implemented and verified locally on 2026-09-15. Migration unapplied; not committed, pushed or deployed.

## User decisions

- Required consideration; not required inclusion. Every enabled, applicable consideration must have a valid answer at both **Submit for review** and **Review & approve**.
- Draft saves remain available with unanswered items. No extra approval stage or permission flag.
- Zero is valid; blank is unanswered. Adjusted values, exclusions and not-applicable responses do not require explanations.
- Labor allowances are recorded as hours for consideration. Existing pricing work items remain the source of price; answers never add cost.
- Supervision starts with approximately 5% of projected field man-hours. The suggested basis uses current priced non-quote labor, including fixed and quantity-based components. Estimators can change that basis, percentage or resulting hours. The UI identifies priced labor as a starting point because it can also include non-field work. Changing percentage or allowance selects the adjusted status.

## Existing architecture reused

- Draft answers live in `estimate_workbenches.document.finalizationChecklist.answers`. Existing `save_estimate_workbench`, optimistic revision, permissions, draft audit and revision lineage remain authoritative.
- Approval validates inside the existing locked `approve_workbench_estimate_internal` transaction, after its authorization and pricing checks and before status/snapshot writes.
- Review submission validates inside the existing `submit_estimate_for_review` transaction before creating a destination or immutable source copy.
- Existing repeat-submission behavior opens the same destination without reinterpreting a historical handoff or overwriting reviewer edits.
- Validated definitions, answers and server completion time are frozen in the existing approved snapshot or handoff source document. Their original labels/statuses remain readable when current configuration changes.
- Workbench approvals display their frozen answers. Job, service-call and Change Order attached-estimate views display the submitted answers through the existing financial audience. Only the checklist JSON projection is fetched for that view; no new permission grants.
- Historical approvals remain usable without retroactive answers. New editable revisions use current enabled definitions and require reconfirmation of version-changed considerations.
- Legacy editor-version-1 estimates keep their existing workflow. Current Workbench editor-version-2 routes implement the checklist.
- Customer proposal/CSV/pricing formulas are unchanged. New estimates and reusable templates do not inherit unrelated project checklist answers.

## Configuration and migration

CLI-generated migration: `supabase/migrations/20260916103538_estimate_finalization_checklist.sql`.

New `estimate_checklist_definitions` table:

| Field | Purpose |
|---|---|
| key | Stable consideration identifier |
| label / description | Display text |
| enabled / sort_order | Availability and presentation order |
| version | Meaning/rules version; saved responses must match |
| options | Array of value/label status choices |
| parent_key / parent_statuses | Optional one-level conditional follow-up |
| numeric_fields | Status-dependent recorded number fields, optional defaults/suggestions |

The seed contains three main considerations and five AFC follow-ups. AFC follow-ups apply to all AFC statuses except Not applicable. Estimating and supervision fields require nonnegative numeric values only when included/adjusted; exclusion requires only an explicit status.

Definitions are maintained through database migrations. There is no new administrative UI or client write access. Add a root row or conditional child to extend the checklist without new editor components. Disable a row to retire it. Increment its version when changing label, meaning, options or numeric rules; existing drafts then require reconfirmation. Configuration validation rejects duplicate status/field keys, unsupported suggestion modes, invalid parent statuses and nested/cyclic dependencies.

Numeric suggestions support priced labor hours and percentage of field hours; the latter uses `fieldHours`, `percent` and `hours` values as seeded. These are suggestions, never price calculations. New considerations can have simple status choices and independently required numeric fields.

RLS provides SELECT only to existing active estimating/reviewer users. PUBLIC/anon have no table access; authenticated users cannot write definitions. Private validation/snapshot functions are not directly callable by clients. Existing guarded public endpoint signatures and grants are retained.

The migration updates existing function bodies using explicit anchors and aborts on unexpected drift. It does not backfill or rewrite any existing estimate, approval, handoff, price or permission. A table SHARE lock serializes definition changes with finalization. Existing estimate/workbench row locks and transaction rollback protect answer/source consistency.

JSDoc interfaces and shared client rules: `src/modules/estimates/workbench/finalizationChecklist.mjs`. UI: `FinalizationChecklist.jsx`, Workbench route/editor and `EstimateChecklistSummary.jsx`.

## Verification completed

- `npm test`: **94 passing**, including zero/blank/excluded, conditional AFC, editable allowance, unchanged price, definition version/enablement and template isolation.
- `node scripts/verify-estimate-checklist-db.mjs`: actual captured save/approval functions, existing migration-defined handoff/revision/audit functions and permission resolvers in isolated PGlite. Both gates, partial draft saves, zero/invalid values, private function grants, definition RLS, reviewer-only access, stale revisions, unchanged pricing, new/versioned/disabled definitions, immutable approval/source history, editable revision and audit rollback pass.
- `node scripts/verify-estimate-checklist-ui.mjs`: desktop and phone preflight at both actions, partial draft save, conditional AFC, 5%/adjustment/zero, failed-save retention, configuration failure/reload/reconfirmation, read-only approved/reviewer controls and attached review answers pass. No page overflow/runtime errors. Screenshots visually inspected.
- Existing estimate editing/proposal/PDF/approval/revision/delete-retry regressions pass at 1440/768/390px. Existing handoff, service-call and deductive Change Order browser suites pass. Existing handoff SQL reconciliation/security/rollback suite passes.
- Final local production build passes using verified, already-public configuration without printing or writing credentials: `.temp/inspection-production-check-1789515960826`. Existing large-chunk and mixed xlsx import warnings remain.
- `git diff --check` passes. HANDOFF appended with prefix verification.

Browser transport is mocked; SQL tests run in an isolated database. Live migration, authenticated actual-schema smoke, signed-in production acceptance and independent-session concurrency have not been performed for this feature.

## Release sequence

1. Review the local diff and migration against the current production function definitions. Preserve the existing Clerk/Supabase/Netlify integration and all permissions.
2. Apply the migration to the established `keogysnoukbendfkfjcn` project, then run rollback-only actual-schema smoke checks for partial save, both finalization gates, zero/exclusion, snapshots and permissions.
3. Publish the tested frontend immediately after the migration. Until the new frontend is published, old sessions will receive the server checklist error when attempting finalization; drafts still save. If frontend is published early, missing configuration prevents finalization but permits drafts.
4. Signed-in acceptance: incomplete draft saves; both actions direct to missing answers; N/A hides AFC follow-ups; included zero works; 5% is editable; reviewers can inspect submitted answers; historical approval stays intact; new revision follows current definitions.
5. Record a new release/sync marker only after publication and verification. The current durable CEDAR marker describes the prior deployed feature and is deliberately unchanged here.

Existing dependency/advisor maintenance remains recorded in `ESTIMATE_WORKFLOW_HANDOFF.md`; this feature changes no dependency versions.
