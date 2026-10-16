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

## Published receipt

- Production URL: https://rnsolutions.net/northgate.
- Deployed/released code: `9af388ad995208f4c648fab93dba25ef5acd4f64`.
- Immutable annotated tag `v0.9.0`, object
  `1fdf6e45a8b7db2adb1d7b6174c2ef73f8bab21f`, peels to that exact code commit.
- [GitHub Release](https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/releases/tag/v0.9.0)
  ID `415011675`, published 2026-10-16 13:45:38 UTC.
- Production Supabase `keogysnoukbendfkfjcn`: applied ledger
  `20261016134012`, name `estimate_lifecycle_reviewed_production`, success.
- Source migration SHA256
  `7723C595CA49C6A5DE83AEAC9BE92BBEFDC5BC5999C8B8EEDE30B71E49D25D51`.
- Netlify site `16adb4ff-83a9-4440-8aad-fcb820d55cac`, deploy
  `6ad2296da5d37d55222d89b8`, ready, exact code commit, published
  2026-10-16 13:41:24.511 UTC. Zero secret-scan matches. Git-connected deployment
  used Production's existing configuration; no synthetic local bundle uploaded.

The single migration installed both required reviewed additions atomically. CO
migration `20261016110939` and its function hash
`0099a2e4e5dcdb037af6fd69602a336b` remain intact. Promotion hash
`71bbbcef4ee5f7bffddccf9fa6ee5385`, handoff-pricing hash
`ce3bc1adc014248106252263420fff39` and approval-engine hash
`b9860bd3229bf5fa8fef7d7be71a9a3c` are unchanged.

Changed existing definitions match accepted Staging: header guard
`8c7384e67f9cd7a27f5c6ce1154fdd2c`, v2 mapper
`8df663760aa3fb2802c6d01db696401e`. All seven captured existing function owners
and ACLs are unchanged. All 14 lifecycle function/trigger definitions match
Staging. Nine intended RPCs allow authenticated execute and deny anonymous
execute. New review table has RLS, zero initial rows, no authenticated direct
INSERT/DELETE. A rollback-only authenticated/no-identity personal-directory read
returns zero rows; no customer identity was impersonated.

Post-migration and post-deployment fingerprints match baseline for 13 tables:
Jobs, estimates, COs, change sets, budget lines, personal copies, snapshots,
workbenches, permission templates, individual permission overrides, handoffs,
review destinations and financial allocations. No customer/test estimate action
was used for verification. One separate user_permissions full-row hash changed:
the same eight rows remain, and one existing row has updated_at
13:39:53.164215 UTC, before migration application at 13:40:12. No matching
permission audit entry was found. Existing authenticated login synchronization
updates display_name/email/updated_at on conflict, consistent with this timing;
the actor/change details were not conclusively reconstructed. No permission DML
is present in the release, and no claim that this full table stayed byte-identical
is made. This concurrent pre-migration change was preserved.

Security advisors: missing-policy 22→22, definer-view 4→4, mutable-search-path
7→7, anonymous-definer 11→11, authenticated-definer 236→245. The nine additional
authenticated-definer findings are exactly the intended, explicitly guarded
archive/review/handoff RPCs. No new anonymous exposure or missing-RLS finding.
See [Supabase's advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Normal TLS HTTP verification returned 200 for `/northgate/`, official/review
estimate deep links and Jobs. Entry JS `index-D3Z86Ac3.js`, Workbench chunk
`WorkbenchRoute-Ufq9sPPv.js`, runtime JS and CSS load successfully with expected
asset types. Compiled code has the Production Supabase URL, Clerk domain
`clerk.rnsolutions.net`, all new workflow RPCs and tax/card-fee controls.

A fresh isolated Edge session redirects to the Production sign-in URL at
`accounts.rnsolutions.net` and stops at Cloudflare security verification, with
zero page errors. No challenge bypass, active-user session reuse or authenticated
Production estimate write was attempted. Automated signed-in Production checks
remain unrun; Ryan's explicit Staging acceptance is the owner acceptance for
this release. Local PostgreSQL remains 17.10 versus shared 17.6; fixture authority
and live account tests are distinct. The previously unavailable original Library
screenshot was not newly materialized or claimed inspected.

No proposal-formatting work or unrelated feature was included. Main's final
receipt commit uses `[skip ci]`; the release tag and deployed code stay immutable.
Evidence includes production unit/build/race logs, exact-source recovery JSON,
`production-deployment-evidence.json`, `production-live-results.json`, browser PNG
and GitHub Release receipt in `.temp/standalone-checks`.

Sync marker: ESTIMATE-LIFECYCLE-PROD-V090-20261016-001.
