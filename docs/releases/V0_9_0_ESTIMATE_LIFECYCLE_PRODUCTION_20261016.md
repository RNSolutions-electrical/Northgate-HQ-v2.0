# v0.9.0 — estimate approval and recovery

Ryan accepted both features on Staging (reviewed code 3a23a6a, receipt 3f9462c)
and explicitly authorized Production promotion on October 16, 2026. Production
Mode. Release branch starts at current main 2c1880f, retaining its deployed CO
security correction and existing v0.8.0 EOS, tax/card fees, notes and labor rates.
Only the reviewed estimate commits were selected; application source, lockfile
and Netlify configuration compare identically with reviewed Staging.

## Scope

Saved official estimates submit through the accessible reason modal without a
Job or Service Call. Review freezes scope; approval retains an immutable snapshot
in Estimates. Destination handoff is a separate optional step. Tax/card-fee
estimates retain their approval breakdown and remain blocked from destination
handoff pending accounting support. Personal and official archive/restore are
independent and preserve review history, exact prior status, snapshots and links.
Pending standalone review cannot be archived through either UI or older RPCs.

No customer/test estimate is submitted, approved, archived, restored or deleted
as part of release verification. No account, credential or permission changes.

## Required migration and recovery

CLI-generated `20261016133828_estimate_lifecycle_reviewed_production.sql` packages
the exact reviewed archive/restore and standalone-review SQL behind a Production
preflight. It is a single atomic migration with five-second lock and 30-second
statement bounds. The estimate table lock drains writers before installing the
new guard. Existing source hashes, accepted CO fix, promotion repair and charge
dependencies must match or the transaction aborts. Already/partially installed
lifecycle objects also stop the migration. No record updates are included.

Production already has the accepted CO, promotion and proposal-charge migrations;
the Staging dependency migration and historical incident pause are NOT applied.
The Production-only EOS bootstrap is not replayed. New review rows start empty,
with RLS and RPC-only writes; authenticated direct INSERT/DELETE and anonymous
RPC execution are denied.

Exact existing function definitions, owners and ACLs were captured locally before
release. The only existing functions changed are the Workbench header restore
guard and v2 financial-mapper qualified retry aggregate. Isolated round trips
Production→reviewed→original→reviewed match their exact hashes and preserve
owner/ACL and a synthetic sentinel. Full lifecycle fixtures separately cover
semantic recovery, retained snapshots/status and atomic audit-failure rollback.
This is scoped source recovery, not a claim of full database/Storage restoration.
Prefer forward repair preserving all review/audit/snapshot rows. No destructive
schema rollback or customer-record recovery is performed for this release.

## Final checks before promotion

- 341 named tests pass, including CO SQL regression.
- Production-equivalent application source equals accepted Staging source.
- Build passes with synthetic Development configuration; that bundle is not uploaded.
- Real PostgreSQL 17.10 exact guarded Production migration and complete lifecycle
  suite pass, including observed separate-session review/archive/handoff races.
- Actual shell/router/editor UI passes at desktop 1440px and mobile 390px.
- Exact function recovery round trips pass; shared Production runs PostgreSQL 17.6.
- Existing Production data fingerprints captured for estimates, workbenches,
  snapshots, personal copies, change sets/destinations, Jobs, COs, budget lines,
  handoffs, allocations and permission tables. Compare after migration/deployment.
- Owner's Staging acceptance resolves the earlier automated Cloudflare/login
  limitation. No automated signed-in Production business action is claimed.

Pre-release Production deployment: 6ad0ea06a80a4d22e9ebc1e8. The immutable release
tag and final migration/deployment/integrity receipt are recorded below after
publication. Evidence remains under ignored `.temp/standalone-checks`.
