# Contract-adjustment Production integration checkpoint

Sync marker: `CO-INTEGRATION-READY-20261002-012`.
Updated 2026-10-02 18:06 EDT (UTC-04:00) on `RYAN_NORTHGATE`.
Branch: `feature/change-order-integration-20261002`, based on Production
`main` at `9c1199ec9ebd19a6f946e6b606a281c83c8e07e7` (v0.5.4 code plus
post-release handoff). **Nothing in this branch is deployed or migrated to
Production or Staging.**

## Owner intent

Bring the simpler Staging Change Order / Credit state model and continuing
Billing lineage to Production without losing the optional client PDF detail
released in v0.5.4. Also make the breakdown editor fit a normal desktop view
without scrolling, keep actions visible on narrow screens, and allow a
read-only client-form preview before draft submission.

## What is already done

- The breakdown dialog is wider and uses a compact row grid. In a 1366 x 768
  browser with two representative detail rows, the whole dialog and all fields
  fit without vertical or horizontal scrolling. At 390 x 844, only the detail
  list scrolls; totals and save/cancel actions remain visible. A very short
  viewport still permits whole-dialog scrolling rather than clipping controls.
- The client PDF test passed and a placeholder-configured Vite build passed.
  No business logic or database schema changed in this checkpoint.
- A draft now has a separate **Preview client form** action. It renders the
  current on-screen fields and optional client breakdown in a printable window
  with a visible draft notice. It does not save, submit, change status, post to
  financials, or call the export-audit RPC. Staging's existing saved-record
  preview first saves changes and is not a substitute for this path.
- After the preview addition, all 231 tests and a placeholder-configured Vite
  build passed. The placeholder build is only a local verification artifact,
  not a deployable environment build.

## Integration hazards confirmed in source

1. Staging `save_contract_adjustment(jsonb)` calls
   `save_job_change_order_draft_with_all_markups`, which deletes/reinserts all
   lines without v0.5.4's `client_breakdown`. Its UI likewise omits the detail
   editor. Direct promotion would silently discard details on a later draft
   save and remove their editing path.
2. Staging redefines `revise_job_change_order` without copying
   `client_breakdown`; v0.5.4 explicitly copies it to controlled revisions.
3. Staging rebuilds the generated `line_total` column and replaces approval,
   status, closeout and Billing functions. Its migration and the v0.5.4
   migration must be rehearsed together on a current Production schema, in
   intended order, with financial and historical fingerprints before/after.
4. A direct cherry-pick of the Staging state-model commit conflicted in
   `ChangeOrderWorkspace.jsx`, `JobsWorkspace.jsx`, `HANDOFF.md` and
   `docs/ROADMAP.md`. That uncommitted attempt was fully removed before the
   focused integration changes below. The whole Staging branch also contains
   unrelated dashboard, inventory and environment work, so it must not be
   merged wholesale.

## October 2 Production-base integration in progress

- The staged state model, Production PDF-detail compatibility bridge, and
  continuing Billing lineage are assembled into one CLI-generated migration
  (`20261002174322_contract_adjustment_state_model_integration.sql`). This
  ordering keeps one transaction from exposing an interim save/revision path
  that drops `client_breakdown` or an interim Billing calculation that counts
  revisions twice. This is a **local candidate only**; it has been applied to
  one isolated temporary restore, not Production or Staging.
- The bridge routes `save_contract_adjustment` through Production's validated
  detail-aware save RPC. Controlled revisions copy both `record_type` and
  `client_breakdown`. Original Budget is not written by the candidate.
- `ChangeOrderWorkspaceNext.jsx` is a separate integrated
  UI candidate. It carries the Staging state flow, PDF-detail editor, shared
  client form renderer, and read-only pre-submit preview. The local Jobs
  workspace now routes to it and adds the adjustment log and closeout card.
  This has not been deployed or browser-accepted.
- Shared adjustment helpers, reporting and closeout components have been
  copied for integration. The line serializer now preserves optional PDF
  details. An empty markup input no longer turns into an accidental $0.00.
- Seven focused tests and the full 237-test suite pass. A
  placeholder-configured Vite build passes with the new workspace routed.
  Placeholder configuration is not a deployable environment build.

### Isolated Production-backup rehearsal

- A schema-only Supabase branch failed while replaying older repository
  migrations (`public.documents` was missing), before this candidate ran.
  It was deleted; do not treat that attempt as a candidate failure.
- With owner approval, restored the 2026-10-02 07:42:43 UTC Production backup
  to temporary project `northgate-co-integration-rehearsal-20261002`
  (`kyqfnkhsjydcebyfbehd`) in RNSolutions. Supabase displayed $10.18/month
  additional compute/disk, below the approved $15 ceiling. The restore
  included real Production data and users. After the rehearsal, the owner
  explicitly approved permanent deletion of this exact temporary project.
  Supabase confirmed `Successfully deleted northgate-co-integration-rehearsal-20261002`
  on 2026-10-02 at approximately 14:23 EDT; the project is absent from the
  RNSolutions project list. Production and Staging were not deleted. The exit
  survey failed to submit, but project deletion succeeded.
- The backup predates live Production migration
  `change_order_client_pdf_breakdown`. Applied that existing migration first
  on the isolated copy, then applied this integration candidate. Both
  succeeded. Before/after: 47 Change Orders, 51 lines, 14 postings totaling
  $5,625.91, 8 Pay Apps and 32 Pay App CO rows, unchanged. No rehearsal rows
  remain after rollback-only tests.
- Rollback-only tests passed for incomplete draft, explicit $0, negative
  standalone Credit with CR numbering, mixed positive/negative cost-code
  postings, approval without signed documentation, unchanged Original Budget,
  unauthorized approval rejection, PDF detail save/revision, missing-document
  closeout flag, approved revision delta, one continuing adjustment in the
  Billing reader, and Draft Pay App resync to the latest revision.
- **Historical Production data gate:** Carolina Retina `NGG-CO-9` was approved
  for $1,477.60, revised as approved `NGG-CO-9-R1` for the same amount, then
  the original was voided *after* the revision approval. The original's
  +$1,477.60 approval and -$1,477.60 void net to $0; the revision posted a
  $0 delta. Thus the family has an active approved $1,477.60 adjustment but
  $0 net financial postings. This discrepancy exists in live Production as
  well and is **not caused by this migration**. The new Billing validator
  intentionally refuses to sync that job rather than silently presenting an
  unreconciled contract total. One adjustment family / one job is affected;
  other jobs' Billing readers ran. No automatic financial repair was made.
- A fresh read-only Production check confirmed that the original's recorded
  void reason is `Voiding Duplicate CO`, while `NGG-CO-9-R1` is still approved.
  All three postings in the family point to the same `16.CO` / Electrical
  Change Orders budget line: original approval +$1,477.60, original void
  -$1,477.60, R1 approval $0.00. The budget line's original amount and manual
  change amount are both $0; its posted change total includes other families
  and is currently $5,004.30. No Production record was edited.
- The owner confirmed R1 **should remain active and approved for $1,477.60**.
  Prepare a **separate, one-time, idempotent** compensating +$1,477.60 posting
  on the same `16.CO` line, tied to R1, with an explicit reconciliation kind
  and `change_logs` entry. Keep the original approval, void, and R1 approval
  postings immutable; do not change Original Budget or billed Pay App snapshots.
  The guarded SQL candidate is in
  `docs/reviews/CO9_RECONCILIATION_REHEARSAL_20261002.sql`, outside the normal
  migration directory. It has been applied **only to an isolated copy**;
  Production execution still requires the separately reviewed release migration
  and explicit owner authorization. Ryan authorized the exact +$1,477.60
  correction on October 2; the release migration is now
  `20261002220438_reconcile_carolina_retina_co9_revision.sql` and matches the
  rehearsed SQL body byte-for-byte after its header.
- The family appears in four historical billed Pay App rows and one Draft Pay
  App row; all have $0.00 `final_current_amount`. One billed Pay App contains
  both the root and R1 rows, which the new lineage reader will not rewrite.
  This explains why the approved contract value must not be confused with
  already billed revenue. The repair must leave those snapshots untouched.
- Added a focused source test for the new unreconciled-posting Billing guard,
  ancestor-void prohibition, and Pay App contract-basis validation. It passes
  locally. This is not a substitute for another isolated data rehearsal.
- The integration migration now also blocks a future void of an adjustment
  with a `reconciliation` posting. Without a controlled reversal, ordinary
  voiding would leave the compensating amount in Financials. This guard was
  verified in the isolated database function definition.
- Supabase security advisor was run on the isolated copy. It reports existing
  project-wide lints; review their baseline/delta before release. Live UI
  acceptance, Production backup recovery, and promotion have not occurred.

### Second isolated rehearsal — CO9 repair

- With owner approval, restored the same 2026-10-02 07:42:43 UTC Production
  backup to `northgate-co9-reconciliation-rehearsal-20261002`
  (`dkgotahxweppwgwejbwf`) in RNSolutions. Supabase quoted $10.18/month
  while active, below the $15 limit. This copy includes real Production data
  and users. With the owner's explicit confirmation, this exact temporary
  project was permanently deleted after review on 2026-10-02 at 15:06 EDT.
  Supabase showed a successful-deletion notice and returned to the RNSolutions
  project list, where the temporary project was absent. Production and Staging
  were not altered. This disposable copy cannot be recovered through normal
  project restoration; the original Production backup remains separate.
- Baseline matched the first rehearsal: 47 Change Orders, 51 lines, 14
  postings totaling $5,625.91, 8 Pay Apps, 32 Pay App CO rows. The existing
  PDF-detail migration and updated integration migration both applied to
  this isolated copy. Those two steps left all counts and posting totals
  unchanged, while adding `client_breakdown` and `record_type`.
- The guarded CO9 candidate applied. It selected the job, CO, revision and
  `16.CO` financial line by exact business keys rather than generated UUIDs;
  verified approved/voided states and the three-posting fingerprint; extended
  the posting-kind constraint to permit `reconciliation`; inserted one
  +$1,477.60 R1 posting and one audit entry. Global postings became 15 and
  $7,103.51. CO9 family postings became four, net $1,477.60. The `16.CO`
  line's posted changes became $6,481.90; Original Budget stayed $0.
  All 8 Pay Apps and 32 Pay App CO rows remained. Historical CO9 billed
  amount remained $0.00.
- The Billing reader now returns **one** continuing `NGG-CO-9-R1` adjustment
  at $1,477.60 with $0 previously billed. Reapplying the exact candidate
  on the isolated copy succeeded as a no-op: still one reconciliation
  posting, one audit entry and the same $1,477.60 family net.
- Security-advisor comparison with live Production has the same counts for
  RLS-no-policy (21), security-definer views (4), mutable search path (6),
  and anonymous-executable definer functions (11). Authenticated-executable
  definer functions rise from 214 to 217, attributable to the three intended
  adjustment/closeout RPCs, each of which contains a job authority check.
  Review those RPC permission paths before promotion. The existing
  project-wide advisor findings are not resolved by this focused slice.
- After adding the reconciliation/void guard source tests, the full local
  test suite passes 239/239; `git diff --check` is clean. No configured
  Production build, browser acceptance, commit, push, or deployment has
  occurred for this integration checkpoint.

### Current release gate

The owner approved proceeding with the release review on October 2. Do not
deploy this branch yet: technical acceptance remains incomplete, and approval
to proceed does not waive the gates below. The CO9 repair passed an isolated
data rehearsal but has not been applied to Production. Do not silently rewrite
immutable postings or historical Pay Apps. Existing Staging has a different
applied migration history; do not replay this Production-base migration there
blindly.

Read-only release checks at 15:14 EDT on `RYAN_NORTHGATE`:

- Production Supabase still has 47 Change Orders, 51 lines, 14 postings
  totaling $5,625.91, 8 Pay Apps and 32 Pay App CO rows. `NGG-CO-9` remains
  voided and `NGG-CO-9-R1` remains approved at $1,477.60, with $0 net family
  postings. The live migration history ends with the PDF-detail migration
  `20261002171310`; neither integration nor CO9 repair is applied.
- The Production Supabase Backups page lists a completed physical backup at
  2026-10-02 07:42:43 UTC. That same backup was restored to isolated projects
  for the successful rehearsals; it is not a point-in-time snapshot of later
  October 2 activity. Database backups exclude Storage object bytes.
- The current Netlify Production deploy is still
  `6abfe6d0df400a474bf2171b`, the ready v0.5.4 deploy. `origin/main` is
  `9c1199e`; this working branch is not live.
- All 239 explicit test cases across 58 test files pass. `npm test` itself
  starts an indefinite synthetic-editor server under Node's broad discovery,
  so that command was stopped and must not be reported as a passing run. A
  placeholder-configured Vite build passes; a Production-configured build has
  not yet run for this candidate.

October 2 evening release preparation: Ryan accepted the combined UI, Billing,
and PDF flow on isolated Staging and authorized the exact CO9 correction. The
official Supabase CLI generated the separate local release migration
`20261002220438_reconcile_carolina_retina_co9_revision.sql`. Its SQL body is
identical to the isolated rehearsal. All 239 explicit tests pass; a Vite build
with Production mode and placeholder public keys passes when output to a clean
temporary directory. The existing `dist/assets` directory is locked by
Dropbox, so the default build target failed with EPERM; this is an output-path
lock, not a source compilation failure. The temporary build is **not** a
deployable artifact. No Production database or hosting write has occurred.

**Active release blocker:** The latest completed Production Supabase physical
backup is 2026-10-02 07:42:43 UTC, before a live Change Order edit at
2026-10-02 19:47:59 UTC. PITR is not enabled, and the project has no on-demand
physical-backup control. Ryan requested a newer recovery point before any
Production migration. Wait for the next completed scheduled backup and verify
its timestamp covers all preceding live edits, or separately arrange and
verify a current manual logical backup. Do not treat the old backup, the
placeholder build, or the prior isolated rehearsal as satisfying this gate.

The short release checklist and rollback boundary are in
`docs/releases/CONTRACT_ADJUSTMENT_V0_6_0_RELEASE_CANDIDATE.md`. After the
recovery point, recheck live schema/data fingerprints and permissions, apply
the two migrations in order, verify database and UI behavior, then perform
deliberate code promotion. Nothing in this preparation is itself a Production
approval to bypass a failed preflight.

### One-time Carolina Retina repair release plan (not applied to Production)

1. Obtain a fresh Production recovery point. The exact candidate has already
   passed two isolated restores; before the live write, assert the exact job, root CO, R1,
   `16.CO` line and three existing posting IDs/amounts; assert R1 is approved
   for $1,477.60, the root is voided for the recorded duplicate reason, and
   the family posting sum is exactly $0.00. Abort on any drift.
2. In one transaction, extend only the posting-kind CHECK constraint to admit
   an auditable `reconciliation` kind and insert exactly one +$1,477.60 posting
   against the R1 CO and the same `16.CO` financial line. The existing unique
   `(change_order_id, job_budget_line_id, posting_kind)` key makes that posting
   idempotent. Record the reason, owner decision, before/after amounts,
   release marker, actor and timestamp in `change_logs` using an allowed
   action value. Never alter or delete an earlier posting.
3. Assert the family posting sum and R1 approved value are both $1,477.60,
   Original Budget is unchanged, the line's total posted changes rise by
   exactly $1,477.60, and all historical Pay App rows and billed amounts have
   the same fingerprints. Confirm new Billing lineage reads the family as
   one continuing adjustment and its unbilled remainder is correct.
4. The repair was rerun in the isolated copy and proved a no-op, security
   advisors were inspected, and Ryan completed Staging UI/Billing acceptance.
   Production execution still waits for the current-backup gate. If the repair ever needs reversal, use a new audited
   compensating posting, not deletion or mutation of immutable history.

## Remaining implementation sequence

1. Port the staged contract-adjustment state model, Credit numbering,
   closeout predicate and shared report UI selectively onto this Production
   base. Preserve v0.5.4 PDF rendering, the detail editor and current
   Production Inventory/Jobs behavior.
2. Make the new save path validate and persist `client_breakdown` atomically,
   preserving optional detail on edits and copying it on controlled revisions.
   Keep the parent financial line total authoritative.
3. Port the continuing-CO Billing lineage fix, retaining immutable billed
   Pay Apps. Reconcile existing correction/reversal and developer-deletion
   paths with the new basis validator.
4. Test on a full isolated copy of the **current** Production schema: legacy
   approved COs, mixed signed lines, zero CO, standalone Credit, separate
   numbering, direct Manager approval, unauthorized approval rejection,
   unchanged Original Budget, PDF details through edit/revision, signed-file
   closeout, prior billing across revisions, and rollback behavior.
5. Run all unit and browser tests, a configured build, security advisors and
   historical fingerprints. Deploy only to isolated Staging for owner
   acceptance. Production migration/deployment needs a separate release gate.

The prior Staging implementation and its incomplete acceptance gates are in
`docs/reviews/CONTRACT_ADJUSTMENT_STATE_MODEL_20260925.md` on `origin/staging`.
