# Estimate Workbench Approval

## Scope

This release completes the approval stage for editor-version-2 Workbench estimates.
It reuses `estimates`, `estimate_snapshots`, the existing `can_approve_estimates`
permission, and the existing change-log audit boundary. It does not create a second
estimate system and does not create or convert a Job.

## Workflow

1. An authorized estimator saves a Workbench draft.
2. A user with `can_approve_estimates` selects **Review & approve**.
3. The user certifies the review and may add an optional approval note.
4. `approve_workbench_estimate` locks the draft, calculates the approved price,
   writes one immutable `estimate_snapshots` record, updates the estimate to
   `approved`, and writes the existing estimate change-log entry atomically.
5. The app reads only the locked snapshot for **Download proposal**. The proposal
   exposes customer-facing scope and approved price, not internal cost, labor,
   markup, catalogue, or vendor data.

## Server Safeguards

- The RPC is `SECURITY DEFINER` only because snapshot rows have no direct client
  write policy. It requires an authenticated Clerk subject, checks active
  division-scoped `can_approve_estimates`, locks the estimate and Workbench row,
  and is not callable by `anon`.
- Approval validates a named draft, entries, component arrays, and non-negative
  quantity, price, labor, rate, material-markup, and fee values.
- Approval calculates the stored total in PostgreSQL; the client display is not
  authoritative.
- `estimate_snapshots` already blocks updates and deletes. The added
  `workbench_document` field is protected by that same immutable-row trigger.
- The Workbench header guard permits the status change only during the controlled
  approval RPC. Ordinary Workbench saves remain Draft-only.

## Calculation

For each Workbench item, the approved snapshot records direct material, labor,
other/awarded-quote amounts, material markup, and subtotal. It then applies the
saved estimate fee once to the sum of item subtotals. The snapshot stores both the
item-level values and the final approved price, rounded to cents.

## Explicit Boundary

Job conversion remains disabled. Mapping Workbench entries/components into a Job's
project divisions, cost codes, and financial lines needs a separately reviewed
source-of-truth and reconciliation design; this release does not infer one.

## Migration and Verification

- Migrations: `20260914103331_estimate_workbench_approval.sql` and
  `20260914110000_validate_workbench_approval_components.sql`, followed by
  `20260914111500_restrict_workbench_approval_internal.sql`
- Rollback-only database verification: `tests/estimateWorkbenchApproval.sql`
- The verification covers calculated totals, locked status, immutable snapshots,
  denied approval, and no retained test records.
