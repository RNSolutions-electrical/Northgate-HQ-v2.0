# Audit Reasons and Approved Workflows

**Release status: database applied, September 6, 2026.** Ryan explicitly approved
the multi-module production migration after the initial safety-review rejection.
`20260906191944_approved_financial_workflows.sql` is applied. The local filename
matches Supabase's recorded version. Frontend publication is in progress.

The pre-release checks and post-migration rollback-only authenticated database
tests passed. A division-label synchronization fix restores its internal reason
before returning; its regression test passed. No test fixtures are retained.
Authenticated production UI acceptance remains Ryan's check.

Security advisors: 142 existing findings, plus one expected warning for the new
authenticated SECURITY DEFINER financial batch RPC. This is intentional: the RPC
writes the protected audit table atomically. Its fixed search path, field allowlist,
job/financial authorization, protected-line read gate and anon/PUBLIC execution
revocation were reviewed; absent/insufficient authority tests passed.
See [Supabase's function-execution advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
This does not claim the existing advisory backlog is resolved.

Ryan approved this policy on September 6, 2026. It supersedes blanket
reason-on-every-save wording in older Financials documentation. Permission
checks, job/department scope, access classification, and approval/certification
requirements are not exemptions and remain enforced.

## Policy

| Action | Reason | Audit |
| --- | --- | --- |
| Ordinary content creation | Optional | Actor, timestamp, record, new values |
| Update through a named approved routine | Optional | Actor, timestamp, before/after |
| Change Original Budget or existing cost code, description, category, financial access classification | Required | Before/after and reason |
| Permission, role, department, template or access assignment | Required, including creation | Before/after and reason |
| Archive, delete, retire, controlled reversal/revision | Required by default | Before/after and reason |
| Update outside a named approved routine | Required | Before/after and reason |

Approved routine examples: forecasting, Actual cost report import, Current
Budget adjustments/overrides, personal contact details, vehicle creation and
assignment/release, draft estimate/CO preparation, schedule progress, normal
document upload, and normal tool/inventory issue/return workflows.

Operational notes and business certifications are distinct from justifications.
Inventory still requires a cart note OR a note on every line, and preserves both.
Signed CO approval, billing certifications, master material repricing reasons,
physical count corrections, and developer access safeguards are unchanged.

A shared reason covers only the submitted batch. Per-line reasons are also
accepted. When both are supplied, retain both. No passcode unlock, lasting
approval session, or browser-only authorization is introduced.

## Implemented Rollout

- Financial line saves, bulk budget input and cost-report imports use
  `save_job_financial_batch`: atomic updates plus server-generated audit rows.
- Routine financial edits do not require a reason. Protected single-line edits
  prompt on Save when no reason was entered. Existing-field template alignment
  and Original Budget report imports require one shared reason.
- Bulk input accepts a `Reason` column, a batch reason, or both. Each protected
  change must be covered; a failure rolls back the entire financial batch.
- The server guards direct Original Budget/cost-code/description/category/
  classification updates. Ordinary direct clients cannot modify overrides.
- The previous single-line RPC remains compatible and preserves overrides.
- The editor captures the row timestamp when editing starts; stale saves fail.
- Personal profile contact edits, vehicle create/assign/release and draft CO
  saves now accept optional notes while retaining their existing server audit
  and permission checks. Employee role/department setup still requires a reason.
- Archive, permissions, billing certification, controlled CO reopen/revision/
  denial/void, and inventory note requirements were not loosened.

`src/services/auditPolicy.js` provides reason classification/coverage helpers.
It is not an authorization boundary or a replacement for mutation-specific
server checks. Legacy modules have not all been migrated to a universal RPC.

## Current Budget

Calculated Current Budget = Original Budget + approved budget adjustments
(`budget_change_amount`) + posted approved CO budget impacts. Manual override
is a nullable, separate `current_budget_override_amount`; zero is valid.

An override stays fixed when other inputs change, is marked "Manual override",
shows the calculated comparison, and can be reset using "Use calculated budget".
The original is never overwritten by an override. The adjustment field remains
limited to authorized financial editors; this does not create a new approval
queue. Financial line, project-division and job totals use effective line values
and mark included overrides. The division Approved CO metric excludes manual
adjustments.

Remaining Budget = Current Budget - Actual Costs.
Forecasted Remaining Budget = Current Budget - Completion Forecast.
The existing division "Remaining" metric remains the forecasted remainder.
Forecast Final and SOV/billing revenue stay separate from cost budgets.
Accounting/Reports' existing original-only summaries are now labeled explicitly;
they are not silently reinterpreted as Current Budget reports.

## Validation

- Node tests cover calculation, zero/reset overrides, reason classification,
  shared/line coverage and both-reason preservation.
- `tests/financialWorkflows.sql` is rollback-only: mutation calls run as
  `authenticated`; audit assertions run as the database test operator. It
  checks routine saves, protected and direct-write rejection, whole-batch
  rollback, stale-write rejection, override reset, old RPC compatibility,
  absent/insufficient authority, and routine profile/fleet/CO writes.
- `scripts/verify-financial-workflows.mjs` uses real Jobs components with mocked
  Clerk/Supabase transport at desktop/tablet/phone widths. It checks controls,
  reason prompt/cancel, save-failure retention, visible errors, read-only controls,
  onscreen division headings and page overflow. It is not authenticated
  production acceptance.

## Remaining Sitewide Work

This is the first implemented rollout, not a claim that every legacy mutation
has been converted or exhaustively verified.

1. Audit remaining module mutation paths against the policy, especially direct
   client write followed by a separate audit call. Move those to atomic
   workflows where needed; do not remove reason checks by text replacement.
2. Add shared-reason batch submission to legacy physical-count/master-price
   correction interfaces where they currently only offer individual actions.
   Keep their existing reasons until those workflows are validated.
3. Verify archive/restore and exceptional edits throughout Tools, Estimates,
   Documents, Buyout, Schedule and Developer Console, including denied-user
   tests. Preserve operational notes separately from justifications.
4. Add Current Budget reporting outside the Jobs Financials workspace only with
   explicit effective-value columns; current Accounting/Reports views show
   Original Budget.
5. Ryan's authenticated acceptance: forecasts without reasons; original edit
   prompt; manual Current Budget including zero/reset; shared/line budget batch
   reasons; Actual import vs Original import; ordinary fleet/profile/CO saves;
   permission-denied users and archive reasons.

No production job, budget, vehicle, user or inventory fixture is retained by
database validation. Existing Inventory desktop/tablet and Tools acceptance
checks remain pending.
