# Contract-adjustment Production integration checkpoint

Sync marker: `CO-INTEGRATION-20261002-002`.
Updated 2026-10-02 13:37 EDT (UTC-04:00) on `RYAN_NORTHGATE`.
Branch: `feature/change-order-integration-20261002`, based on Production
`main` at `9c1199ec9ebd19a6f946e6b606a281c83c8e07e7` (v0.5.4 code plus
post-release handoff). **Nothing in this branch is deployed or migrated.**

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
   `docs/ROADMAP.md`. That uncommitted attempt was fully removed; the branch
   is clean at this checkpoint. The whole Staging branch also contains
   unrelated dashboard, inventory and environment work, so it must not be
   merged wholesale.

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
