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
  `20261003131058_contract_adjustment_state_model_integration.sql`.
- Separate, official-CLI-generated, one-time reconciliation migration:
  `20261003131120_reconcile_carolina_retina_co9_revision.sql`.
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

**RELEASED TO PRODUCTION; TEMPORARY RESTORES REMOVED.** The October 3
recovery point and fresh isolated rehearsal cleared the backup gate. The two
Production migrations and exact CO9 correction are applied and verified. The
tag, GitHub Release, and exact-code Netlify deployment are complete.


## Owner recovery coverage requirement - October 2, 2026, 7:00 p.m. EDT

Ryan explicitly requires the recovery point to preserve Production data through
**at least 2026-10-02 19:00 EDT (UTC-04:00), equivalent to 2026-10-02 23:00 UTC**,
because information added that evening must be retained. This supersedes earlier
19:47:59 UTC and 20:01:57 UTC minimum-cutoff observations. The original hard-stop
requirement to cover later Production writes remains in force.

**Verify recoverable snapshot/data coverage, not merely backup completion time.**
A backup completing after 23:00 UTC does not pass if its snapshot excludes data
at or before the required cutoff. Record the covered-through time and evidence,
completion status, and recovery limits. Immediately before any release write,
recheck later Production writes and require a verified recovery point covering
both this owner minimum and the then-current latest pre-release Production write.
Keep release blocked while coverage is unverified.

At the time this requirement was recorded, the Supabase connector had no
backup-list/status action and no newer backup was claimed verified. Database
backups do not by themselves recover Storage object bytes. This requirement
did not authorize backup creation, configuration, credential changes,
migration, deployment, restore, or a recurring 7 p.m. backup schedule. The
October 3 verification and separate owner authorization are recorded below.

## October 3 verified recovery and Production database release

Sync marker: `CO-INTEGRATION-PROD-DB-20261003-013`.
Checked 2026-10-03 09:12 EDT (13:12 UTC) on `RYAN_NORTHGATE`.

- The Production Supabase **Restore to new project** list showed the October 3
  07:22:56 UTC physical backup as `COMPLETED`. Supabase restored that exact
  recovery point to isolated project `tkrojlgxbgdlrprtfksg`. The restored
  database contained the October 2 19:47:59 UTC Change Order edit and 20:01:57
  UTC audit activity, with matching Production fingerprints: 47 COs, 51 lines,
  14 postings totaling $5,625.91, 8 Pay Apps, 32 Pay App CO rows, 3,305 audit
  entries, and CO9 family net $0. A read-only scan of 90 timestamped public
  base tables found no records modified from October 2 23:00 UTC through the
  backup or afterward; Storage objects had no writes in that interval. This
  directly verifies restoration of the latest observed pre-backup activity.
- A second isolated project `cuawhuhtyastzzdmdhom` was inadvertently created
  18 seconds after the first. It was not used. **Both temporary projects must
  be deleted after explicit owner confirmation** to stop their charges.
- Both candidate SQL migrations passed again on the October 3 restored copy.
  It finished with 15 postings totaling $7,103.51, one +$1,477.60 CO9
  reconciliation posting and one audit entry. The 8 Pay Apps, 32 Pay App CO
  rows, and Original Budget remained unchanged.
- Applied both migrations to Production via the Supabase migration API. Its
  recorded versions are `20261003131058` and `20261003131120`; the local SQL
  files were renamed to match. After the integration migration, historical
  counts and totals remained unchanged. After the separate repair, Production
  had one new +$1,477.60 posting and one audit entry, CO9 family net $1,477.60,
  15 total postings totaling $7,103.51, and unchanged Original Budget and
  historical Pay App counts. Security-advisor categories were unchanged except
  for three expected authenticated SECURITY DEFINER functions from the
  integration migration; their calls remain governed by application guards.
- The backup and isolated restore are **database** recovery only. Supabase does
  not restore Storage object bytes through this workflow. No database restore
  has been performed against Production. This entry does not authorize one.

## October 3 Production code promotion

Sync marker: `CO-INTEGRATION-PROD-LIVE-20261003-014`.
Verified 2026-10-03 09:21 EDT (13:21 UTC) on `RYAN_NORTHGATE`.

- The verified release commit `3ec69de7827a388eb5b35c5d64993124c046dbbf`
  passed 239/239 local tests, was tagged immutably as `v0.6.0`, and has a
  [GitHub Release](https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/releases/tag/v0.6.0).
- `main` was fast-forwarded from `9c1199e` to that exact commit without a force
  push. Netlify Production deploy `6ac100faf928bf000863128c` is `ready` and
  `published` from the exact `main` commit, with no build error or secret-scan
  match. Published at 2026-10-03 13:20:10 UTC.
- `https://rnsolutions.net/northgate/` opened in Chrome and redirected the
  signed-out session to the Northgate sign-in page. This is an anonymous route
  smoke test only; no authenticated Production financial workflow was changed.
- Known-good frontend rollback remains prior Netlify deploy
  `6abfe6d0df400a474bf2171b` (v0.5.4). Database migrations cannot be
  rolled back by republishing the old frontend. Preserve the October 3 backup
  and use the documented guarded database recovery plan if required.
- With fresh owner approval, temporary restored projects
  `tkrojlgxbgdlrprtfksg` and `cuawhuhtyastzzdmdhom` were permanently
  deleted on October 3. Supabase's project list then showed neither ID;
  Production `keogysnoukbendfkfjcn` remained `ACTIVE_HEALTHY`. Their
  short-lived resource charges stop accruing after removal; this does not
  reverse usage already incurred.
