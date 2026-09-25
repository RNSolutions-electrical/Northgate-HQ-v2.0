# Contract adjustment usability — Staging acceptance release

Updated 2026-09-25 12:23 EDT (UTC-04:00), Ryan_Northgate.
Target: Staging only. Migration applied; frontend deployed for acceptance. Production unchanged.
App commit `96b5efdd2ed093c64b917aac8c9889f6650938c9`; Netlify deployment
`6ab69fbe01e8390008d35d0f` READY at that exact commit. HTTPS page and bundle return
200; deployed Supabase URL is the isolated Staging project. Production deployment
remains `6ab5472cb12e7cdb63937be9`.
Base: `400bbfc85b4615cd7442af8aae151e87a9af3366`, branch `codex/staging-demo-integration`.

## Inspected architecture and implementation plan

Reuse `change_orders`, `change_order_lines`, immutable per-cost-code
`change_order_financial_postings`, existing documents/Storage, canonical action
decisions, granular permissions, templates, Job financial reads and change_logs.
Do not create a parallel Credits engine or change Original Budget.

1. Extend the existing status vocabulary with Potential and Waived; preserve old
   Proposed/Rejected/Voided values and archived timestamps. Add a CO/CR record
   discriminator and independent auto-numbering under a Job lock.
2. Preserve nullable draft amounts, allow incomplete saves, validate complete
   coding/explicit prices at submission/approval, and retain separate percentage
   markups. Overall fee remains applied after line-level markup.
3. Reuse the posting transaction for direct Manager approval without signed-file
   prerequisites. Preserve approved revision/reversal controls and original data.
4. Separate customer authorization from the financial decision and enforce its
   completion through the Job closeout predicate/trigger.
5. Compact the existing editor and provide shared filtered meeting-log exports.
6. Rehearse locally, then verify real Staging authorization, Billing integration,
   concurrency and owner acceptance before any Production proposal.

## Local implementation

- Number-only/unfinished drafts; unpriced values are not displayed as zero.
- Draft/Potential/Submitted editable states; Manager decision note and deliberate
  approval; no manual name/initials or certification checkboxes.
- CO/CR numbering and type; signed positive/zero/negative line values; revisions
  retain the source type. Existing records remain Change Orders.
- Approval preserves the current per-code delta posting engine, audit transaction
  and unique posting constraint. It does not write budget_amount.
- Signed authorization may be attached after approval. Stored-object existence
  is checked. Editing scope/pricing invalidates its satisfaction without deleting
  the earlier file; identical saves retain it. Uncertain upload outcomes preserve
  files rather than deleting potentially committed authorizations.
- Closeout counts approved missing authorizations and unresolved Potential /
  Proposed / Submitted adjustments, excluding superseded approved revisions.
  Job completion is blocked until required items are resolved. Other existing
  closeout checks remain advisory. The trigger also prevents new unresolved
  adjustments on already-completed Jobs.
- Collapsible pricing/fee/documents/history sections, shared decision note,
  CO/Credit filters and printable meeting logs; approved net in the selection
  excludes superseded approved revisions.
- Default Supervisor templates gain preparation, submission and attachment flags;
  individual overrides/custom templates are preserved. Manager action floors use
  the existing canonical evaluator and Project access, not named-PM sequencing.

## Candidate migration

`20260925112213_contract_adjustment_state_model.sql` applied to Staging only as
ledger version `20260925161443`, name `contract_adjustment_state_model`.
It adds the type, nullable draft values, regenerated derived line_total, status
checks, canonical action/default-template changes, constrained orchestration
RPCs, parent-visible line RLS, authorization-document INSERT policy, and closeout
RPC/trigger. Existing posting tables and budget columns are unchanged.

The generated line_total expression is rebuilt with no CASCADE; known historical
non-null amounts evaluate identically. Live dependencies were checked before
application (only the generated-column default depended on it). Existing endpoint signatures are preserved; new endpoints are
authenticated-only and the internal completeness validator is not public.

## Tests actually run

- All 246 `*.test.js` / `*.test.mjs` repository tests passed.
- 34 isolated PostgreSQL assertions passed using Staging table/check definitions
  with **mocked authorization helpers**, not real Staging RLS. Includes legacy
  totals, incomplete saves, mixed signed postings, Original Budget preservation,
  independent numbering, zero approval, duplicate approval, stale save rejection,
  simulated Supervisor approval rejection, two markup levels/rounding, injected
  approval-failure rollback, Credit revision type, document invalidation and
  closeout enforcement.
- Mock-backed desktop (1440px) / phone (390px) browser tests passed: incomplete
  save, direct approval, finalized inputs disabled, post-approval upload, five
  existing states and absence of Supervisor approval UI. Phone screenshot inspected.
- Staging-configured Vite build passed with build-only placeholder keys in a
  temporary output directory. Those artifacts must never be deployed.
- `git diff --check` passed. Existing chunk-size/xlsx bundling warnings remain.
- Real Staging rollback-only SQL passed using temporary Supervisor, Manager and
  User identities: incomplete save, mixed signs, direct approval without a file,
  zero CO, separate CR/CO numbering, idempotent posting, original-budget
  preservation, missing-document closeout blocking, Potential/Waived/archive,
  decision audit, ordinary User/Supervisor rejection and canonical explicit deny.
  Anonymous new-RPC and authenticated private-validator execution are denied.
  The test initially used obsolete profile JSON for its deny fixture; corrected
  to canonical `user_permission_overrides`, with no authorization code change.
  Audit verification runs as owner because direct authenticated audit reads are
  intentionally denied. Zero fixture Jobs/users remain after rollback.
- Before/after fingerprints match exactly for all existing CO header amounts,
  line amounts/totals, financial postings, budget records and Pay Apps.
- Security advisor reviewed: scoped authenticated SECURITY DEFINER notices are
  expected for these checked RPCs. The pre-existing anonymous grant on
  `save_change_order_sov_allocations` remains a separate security-review item;
  no clean-project security claim is made. See the
  [Supabase remediation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

Reproduce with `scripts/verify-contract-adjustments-db.mjs` (PGLITE_MODULE),
`scripts/verify-contract-adjustments-ui.mjs` (PLAYWRIGHT_MODULE and Edge), and
explicit Node test-file discovery. Bare `npm test` also discovers an existing
long-running synthetic editor server; that run was stopped, not counted as a pass.

## Remaining release gates / limits

1. Staging migration, scoped recovery capture, historical comparisons and real
   role/explicit-deny tests passed. Authenticated deployed-browser acceptance,
   protected-line visibility and actual document Storage round-trip remain.
2. Exercise independent concurrent sessions (not modeled by single-session
   PGlite), and existing Billing / SOV / Pay App / revision / void / estimate / Silas
   consumers with zero and negative adjustments. Do not assert those gates passed.
3. Update older SQL test expectations that mandated signed documents before
   approval; do not run them as new-contract acceptance tests unchanged.
4. Posted adjustments cannot be archived through this slice: existing Billing
   queries exclude archived records. Keep approved commitments visible until a
   tested archive-versus-financial-history policy spans all consumers. Controlled
   revisions/reversals remain available.
5. Archive uses the existing archived_at convention, not a new status. An archived
   directory/restore UI and the broader dashboard/usability roadmap are not added
   in this slice. Existing Dashboard My Work/budget alerts are retained.
6. Perform owner Staging acceptance before a separate Production decision. There
   is no authorization in this checkpoint to promote the package to Production.

## Recovery

Pre-migration function/policy/action/template and schema definitions plus financial
fingerprints were captured in ignored `.temp/contract-adjustment-recovery-20260925`.
This is scoped recovery material, not a full database or Storage backup.
Once nullable drafts/new statuses/types exist, blindly
restoring older constraints could reject saved work; prefer a forward fix or a
verified environment restore, not destructive normalization of those records.
