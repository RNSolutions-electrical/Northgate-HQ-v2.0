# Estimate workflow handoff

2026-09-15 · Production Mode · LOCAL implementation; migration not applied, not committed/pushed/deployed.

## Confirmed business rules

- The normal CO approval rule remains: the entire selling price updates the project budget. No cost-only posting change.
- Material, labor, other cost, material markup and fee remain internal. The existing client CO form displays descriptions and line totals, not the component breakdown.
- Submit for review creates a normal editable CO **draft**. Review, authorized edits/audits, submission, signed authorization, approval and posting continue in the existing CO workflow.
- Existing jobs/service calls can receive a review copy; new jobs and service calls may also be created. COs always require an existing regular job.

## Workflow

1. Develop/save a Workbench estimate. Save estimate remains the ordinary draft-save action.
2. Submit for review opens a dedicated workspace. Select Job, Change Order or Service Call.
3. For COs, select the job and assign each work item to an active division `.CO` financial line. Apply one division to all, then change individual assignments if needed. Enter a CO number or leave blank for the next numeric number.
4. Each work item becomes an ordinary CO line with internal cost components and allocated markup/fee. Customer scope comes from the proposal scope. Work-item descriptions/pricing and overall scope remain editable through the existing draft workspace. Nothing is submitted to the client automatically.
5. Open destination goes directly to the CO draft, Job Details, or Service Call Billing. A collapsible source-estimate review retains original values alongside the normal workflow.
6. New jobs start On Hold. New service calls start Pursuit with quoted billing. These are review destinations, not authorization to proceed.
7. Service Call Billing offers Review as service call quoted amount: it opens the existing quote editor, preserving approved changes and requiring the normal Save. It does not record estimated costs as actual costs or create an invoice.

Job destinations receive an attached estimate for review, not automatic budget initialization. Existing Financials remain authoritative and untouched by handoff. Service-call quotes also remain unchanged until explicitly saved in the normal quote editor. An unpriced/empty or invalid estimate cannot be handed off; ordinary draft saving remains available.

## Architecture and integrity

- Reuses `estimate_workbenches`, `estimates`, the current Workbench editor, `create_job`, `svc_save_call`, `save_job_change_order_draft`, and existing job/service/CO navigation. No second CO system or replacement financial workflow.
- One immutable `estimate_workflow_handoffs` row per estimate record/business version. FK links to estimate, job and optional CO; source saved revision/version, source document, calculated pricing, actor and timestamp retained.
- Source edits do not overwrite an already-created destination or its source copy. Repeated submission opens the same handoff. Use the destination's ordinary edit/revision workflow, not resubmission, to change the CO. Archived destinations do not free the source for duplicate conversion.
- Estimate row lock serializes retries/concurrent handoffs; expected saved revision blocks stale first submissions. Job row locks serialize CO handoffs and numbering. New job/service handoffs reuse the service-number advisory lock. Existing table/function constraints remain in force.
- All destination creation, source copy and audit writes occur in one RPC transaction. Any validation/audit failure rolls everything back. No frontend multi-request partial creation.
- Source values are computed from persisted server data, never trusted client monetary totals. Already-approved estimates must reconcile to their locked approval total or require a reviewed revision.
- Uses existing `can_estimate`, `can_create_jobs`, `can_manage_jobs`, `can_create_change_orders`, project-financial and protected-financial permissions. Existing department/sub-department helpers remain authoritative; no new defaults, grants, user exceptions or bypass.
- New table has protected-project-financial SELECT RLS and no authenticated direct-write privileges. Only the new transaction endpoint is exposed, with active actor, source and destination authorization checks and empty search path. Private calculators/trigger functions revoke PUBLIC/anon/authenticated execution. An immutable trigger rejects source-copy UPDATE/DELETE.

## Calculations

Uses current estimator semantics: per-component quantity × work-item quantity (except fixed components), material unit cost, labor hours × estimate rate, awarded-quote material/other values, and material markup. Currency rounds per item to cents. Overall fee rounds once, then distributes by cumulative proportional subtotal in source order. The difference between consecutive rounded cumulative allocations becomes each line's fee, so all line fees and totals reconcile exactly. Fee is included in CO markup, never duplicated as another billable line. No-fee and zero totals avoid division by zero; normal CO submission still requires a nonzero total.

## Local migration

`supabase/migrations/20260915194050_estimate_workflow_handoffs.sql`

Applied to `keogysnoukbendfkfjcn` on 2026-09-15 after Ryan's release approval. Supabase assigned version `20260915194050`; the initially generated local filename `20260915190723` was aligned to that recorded version without changing its SQL.

- New table `estimate_workflow_handoffs`, three restrictive foreign keys, primary key, unique estimate/CO keys, job lookup index and destination/revision constraints.
- SELECT RLS policy `estimate_workflow_handoffs_read` and immutable UPDATE/DELETE trigger.
- Functions: `guard_estimate_workflow_handoff`, private `workbench_handoff_number` / `workbench_handoff_pricing`, and guarded `submit_estimate_for_review`.
- No existing rows backfilled or rewritten. No existing financial/posting/approval function replaced.

## Verification actually run

- 86 Node tests pass, including new fee reconciliation, zero handling, stable identities and navigation checks.
- Isolated PostgreSQL test uses captured live destination-function/column definitions and existing captured permission helpers. Passes source/preview cent reconciliation, 35 varied decimal cases, awarded quotes, CO drafts, existing/new jobs and calls, duplicate source and duplicate number protection, stale expected revision, invalid values, wrong-job budget lines, inactive/basic-user/explicit protected-financial denial, no anonymous execution/direct table writes, source immutability, approved-snapshot reconciliation, and audit-failure rollback.
- Browser fixtures pass desktop 1440 and phone 390 handoff selection, per-line/default .CO mapping, failed request/retry with inputs retained, durable destination action and new job/call payloads. Screenshots reviewed; mobile amounts do not wrap and page does not overflow.
- Existing estimate editing/proposal PDF/approval snapshot/V2/delete-retry/read-only regressions pass at desktop/tablet/phone. Existing deductive CO edit/save/reopen/submit/error/read-only/PDF credit regressions pass at those sizes.
- Existing service-call browser regressions pass at desktop/tablet/phone: editing, invoice allocation/confirmation, archiving, import preview without writes, creation, read-only controls, profit/date filters and navigation; zero runtime errors. The fixture now explicitly mocks the new attached-estimate table read.
- Final production-config build passes at `.temp/estimate-handoff-final-20260915` (main `index-TWmlYoYq.js`, Workbench `WorkbenchRoute-VLHrnxdt.js`). Existing large-bundle and mixed xlsx import warnings remain. Public configuration is reused without writing secrets.
- Read-only live security advisor baseline inspected; its existing warnings are not caused or resolved by this unapplied migration. See [Supabase advisor reference](https://supabase.com/docs/guides/database/database-linter).

## Release / remaining checks

The migration is applied. `scripts/verify-estimate-handoff-live.sql` passed against the actual production schema using the authenticated role for workflow calls: existing estimate save, draft CO/retry, stale rejection, new/existing jobs and service calls, exact $72.97 reconciliation, no budget/invoice/quote posting, immutable source and unauthorized/RLS denial. Follow-up queries confirmed zero retained synthetic jobs, estimates, handoffs or audits. All test writes were rolled back.

Post-migration security advisors are unchanged except the intentional authenticated SECURITY DEFINER endpoint count, 151 → 152. This endpoint requires active actor, source edit authority and destination financial/management authority, uses a fixed empty search path, and is not executable by anon. Existing 13 no-policy, 4 definer-view, 5 mutable-path and 11 anonymous-definer findings remain outside this release; see the advisor reference above.

Release marker: `CEDAR-ESTIMATE-HANDOFF-20260915-001`. Migration precedes frontend publication. Signed-in browser acceptance and independent-session contention tests are not claimed. Historical jobs/estimates are not retroactively converted. No new approval queue or automatic job-budget initialization was invented.

## Verified production release

- Feature commit `189b1c66b5f4ffa4ae7959375bb8f692f74bec92` pushed to main.
- Git-triggered production deploy `6aa9a0763c03550008271b42` published after migration and live-schema checks. Existing silas-chat function retained. Secret scan: 613 files, zero matches.
- Clean-archive preview `6aa9a12c4fe8b100a467997e` also verified. No separate manual production overwrite was necessary: the automatic production build was byte-identical to the tested build.
- `scripts/verify-estimate-handoff-release.mjs` passed for production and preview: HTML/all 14 assets match SHA-256; JS/CSS MIME, required public Supabase/Clerk configuration, feature markers, deep links and anonymous RPC denial.
- Live: https://rnsolutions.net/northgate/estimates — open an estimate and choose Submit for review.

## Follow-up security maintenance (outside this feature)

The unchanged lockfile reports four high-severity dependency entries: @clerk/clerk-react, react-router, react-router-dom (via react-router), and xlsx. No versions were upgraded during this release. Schedule a scoped dependency security pass with authentication/navigation/import regression tests; do not use an unreviewed force-upgrade. See [Clerk advisory](https://github.com/advisories/GHSA-w24r-5266-9c3c), [React Router advisory](https://github.com/advisories/GHSA-2w69-qvjg-hvjx), and [SheetJS advisory](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6). Broader Supabase advisor findings above also remain open.
