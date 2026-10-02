# Contract adjustments — v0.6.0 release candidate

Sync marker: `CO-INTEGRATION-READY-20261002-012`
Prepared: 2026-10-02 18:06 EDT (UTC-04:00), `RYAN_NORTHGATE`
Source branch: `feature/change-order-integration-20261002`
Production base: `main` at `9c1199e` / v0.5.4
Target: Production `rnsolutions.net`; **not deployed or migrated**

This is a preparation checklist, not a statement that v0.6.0 has been released.
Ryan accepted the combined Change Order/Credit UI on isolated Staging and
approved the exact Carolina Retina NGG-CO-9-R1 correction. Staging's branch is
not to be merged wholesale: this candidate selectively integrates its state
model and Billing lineage with Production's v0.5.4 client PDF details.

## Verified preparation

- Production-base integration migration:
  `20261002174322_contract_adjustment_state_model_integration.sql`.
- Separate, official-CLI-generated, one-time reconciliation migration:
  `20261002220438_reconcile_carolina_retina_co9_revision.sql`.
  Its SQL body matches the twice-rehearsed candidate; it aborts on any changed
  Carolina Retina CO family or financial-line fingerprint, and it is
  idempotent. It adds one +$1,477.60 R1 posting to 16.CO and one audit entry;
  it does not change Original Budget, past postings, or billed Pay Apps.
- Both migrations passed on an isolated restoration of the October 2 morning
  Production backup. The second migration was reapplied there as a no-op.
  Temporary rehearsal projects were deleted after owner approval.
- Ryan accepted the integrated UI/Billing/PDF flow on Staging. Local source
  tests pass 239/239. A Production-mode Vite compilation with placeholder
  public keys passes; it is **not** the deployable Netlify artifact.

## Hard stop before any Production write

1. Confirm a completed Production Supabase backup **newer than the most recent
   pre-release Production write**. The October 2 07:42:43 UTC backup is too
   old: a Change Order was edited at 19:47:59 UTC. If a manual logical dump
   is selected instead, securely capture credentials, verify the dump and a
   restoration path, and record its timestamp and limits. Do not enable PITR
   or reset database credentials as part of this release.
2. Fetch `main` and confirm it still fast-forwards from the candidate base.
   Stop and rebase/retest if Production code or migration history drifted.
3. Read-only preflight: confirm Production migration history ends with
   `20261002171310` for the v0.5.4 PDF-detail migration, check the PDF-detail
   column/RPC, compare CO/line/posting/Pay App counts and posting sums, inspect
   security-advisor baseline, and confirm the exact CO9 root/R1/16.CO
   fingerprint. Last observed: 47 COs, 51 lines, 14 postings totaling
   $5,625.91, 8 Pay Apps, 32 Pay App CO rows, CO9 family net $0.00. Those are
   observations, not values to force if legitimate activity has occurred.
4. Confirm release authorization and the recovery point before applying SQL.
   Abort if any fingerprint or permission prerequisite does not match.

## Deliberate promotion order

1. Apply the integration migration as one transaction; verify new schema,
   callable permissions, representative legacy totals, and no unintended
   mutation to Original Budget, postings or billed Pay Apps.
2. Apply the separate CO9 reconciliation migration. Verify one new
   `reconciliation` posting, one audit event, CO9 family net $1,477.60,
   unchanged historical Pay Apps, and one continuing Billing adjustment.
3. Re-run Supabase security advisors and compare only the intended delta.
   Do not broaden this release to fix unrelated pre-existing lints.
4. Commit/push the exact reviewed candidate, create an immutable `v0.6.0`
   tag and GitHub Release with both migration IDs and recovery point in the
   release notes, then fast-forward Production `main` deliberately. Do not
   force-push, overwrite an existing tag, or merge unrelated Staging work.
5. Deploy the exact release commit to the Production Netlify site, then verify
   its ready deploy, HTTPS route, signed-out behavior, authenticated Change
   Order/Credit UI, client preview/PDF, Financials, Billing, and closeout.
   Record the deployment ID, commit, date/time, machine, and sync marker.

## Rollback boundary

- Before either migration commits: stop; no Production code has changed.
- After migration but before deploy: keep the v0.5.4 frontend in place while
  assessing compatibility; do not run a destructive reverse migration.
- After deploy: republish known-good v0.5.4 Netlify deploy
  `6abfe6d0df400a474bf2171b` if the frontend regresses. Preserve the
  database and audit records for a forward correction unless a separately
  approved restore is necessary.
- A database restore is a separate, destructive recovery decision and can
  lose all post-backup writes. Supabase database backups also exclude Storage
  object bytes. Confirm the exact recovery point and impact before restoring.

## Current status

**WAITING FOR A NEWER VERIFIED PRODUCTION RECOVERY POINT.** No Production
migration, data correction, Git `main` promotion, tag, release, or Netlify
deployment has been performed for this candidate.
