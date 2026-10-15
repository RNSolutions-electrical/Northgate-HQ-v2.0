# Reviewed EOS and estimate modal Production release — 2026-10-15

Ryan accepted the staging updates and authorized promotion. Release branch
release/eos-reviewed-20261015 starts at current main b296188, retaining tax/card-fee
code 47f899e and its already-applied production migration. No stale staging merge.

## Scope

Selective commits: dfde10a (Submit for Review personal-estimate dialog and viewport
scrolling), 8a68795 (EOS scorecard and member editing), 90ad8d6 (bounded requests /
PT409 conflicts), 79b18c7 (EOS friendliness). Cherry-picked on current production.
No tax files changed. No additional pursuits, workbook definitions, pilot data or
metric values are imported. Existing 41 production pursuits and grants stay intact.
The scorecard starts empty; members create definitions and enter intended values.

## Migration and recovery

CLI-created source: supabase/migrations/20261015145240_eos_scorecard_reviewed_production.sql.
SHA256 F650F9DEDB9A1741C91E78C00EA7B7E9BD79CA5E2512CE96774AED057ED30934.
Recovered exact applied staging SQL from ledger versions 20261014234750 and
20261015001358. Production legacy EOS function bodies match staging preflight
hashes; production service_role ACLs are preserved in adapted guards. The only
installed definition correction folds deliberate 40001 conflicts to PT409.
Existing access-administration functions, rank restrictions for granting access,
financial functions and client privileges remain unchanged. New EOS access is
active explicit membership, as tested/approved on staging. No new member grants.

Guarded additive schema creates six RLS scorecard tables, private retry/clock
state and member-checked RPCs. Direct client writes denied. Legacy pursuit save
execution is removed for authenticated clients so stale writes cannot bypass the
versioned wrapper. Existing open app tabs need refresh at cutover. A short table
lock drains legacy writers within a five-second lock timeout; drift aborts all.
This production-only bootstrap must not be replayed on existing staging objects.

Verified scheduled physical backup COMPLETED at 2026-10-15 07:13:51.474 UTC,
ID 1970633432. PITR disabled; database backups exclude Storage. This additive
release does not modify Storage or existing business rows. Fresh EOS function/ACL
capture retained in tests/fixtures/eosProductionBaseline.json and local evidence.
Data-preserving manual recovery SQL: sql/eos_scorecard_production_recovery_20261015.sql.
It disables new entry points, restores the former access gate/legacy writer, keeps
all scorecard data/audit and existing business history; then fix forward the client
through Git CD. No restore, destructive rollback or data rewind is planned.

## Validation before applying

- 334 named tests across tests and src pass; no fixture-server test discovery.
- Disposable PostgreSQL exact guarded migration: empty install, active low-rank
  member, duplicate/stale PT409, zero, idempotence, unsafe cumulative SUM rejection,
  latest actual, six RLS tables, direct-write/nonmember/anon denial pass.
- Rollback-only exact DDL rehearsal against Production passes and leaves no objects.
- Tax integration: 120 JS/SQL rounding parity cases, authenticated save/reload and
  approval, immutable breakdown/history, invalid inputs, helper denial and charged
  destination-handoff rejection pass. Tax source paths match current main exactly.
- Synthetic tax desktop/mobile UI, EOS desktop/mobile and personal review-dialog
  tests pass. External requests blocked. Real records never used as fixtures.
- Production public-client-config build passes. Existing xlsx/chunk warnings remain.
- Live production before release: Netlify 6ad0ddb847ba95e0846a88ac / 47f899e.
- Read-only fingerprints captured for pursuits, managers, grants, estimates,
  workbenches, approval snapshots and all four tax function definitions.

Signed-in live editing remains unobserved because the connected computer-use
runtime fails Windows platform initialization. Ryan's staging acceptance and
synthetic UI/database tests are distinct from live production verification.

## Preserved tax behavior

Tax applies to full selling subtotal, card fee after rounded tax. Saving,
promotion, approval and PDF retain the existing charge support. Nonzero charges
continue blocking downstream job/CO/service-call handoff pending separate
accounting support. The newly promoted personal review dialog does not change
that destination-handoff boundary.

## Post-release verification plan

Verify exact ready/current Netlify source and remote main; EOS/estimate routes,
asset MIME, production Supabase identity, EOS labels, modal and tax controls.
Verify final function definitions/privileges, six RLS tables and empty scorecard;
compare existing business and charge-function fingerprints, test read-only member
and denial paths, and inspect advisor changes. Record applied ledger/deploy below.

## Published result

Production app commit d8e8770c543ed55053bd4ae91030f0d6f2999a5a is published by
Netlify deploy 6ad0ea06a80a4d22e9ebc1e8, ready/current on main, at
2026-10-15 14:58:32.962 UTC. No deploy error or secret-scan matches (974 files).
Applied ledger 20261015145753 / eos_scorecard_reviewed_production maps to the
CLI-created source above. Source/client contain both reviewed EOS and dfde10a
estimate modal/scrolling changes. Newer production tax/card-fee code is retained.

Post-apply evidence:

- All 13 EOS contract function definitions exactly match reviewed live staging.
- Six scorecard tables have RLS. Zero metrics, observations and scorecard audit
  rows; no staging pilot records imported. Anonymous read RPC execute denied;
  authenticated legacy writer denied; existing service-role privilege retained.
- Rollback-only authenticated-member read succeeds; ungranted identity denied.
- Pursuits, managers, grants, estimates, workbenches, snapshots and four tax
  function hashes exactly match immediate pre-release capture. No business rows
  changed. Counts before migration: 41 pursuits, one manager link, three grants.
- Live EOS, estimates and assembly deep routes return 200; 12 referenced assets
  return successfully with expected MIME. Main bundle index-DvbHInR2.js contains
  EOS labels; lazy estimate bundle includes modal and both charge controls.
  Production Supabase identity verified. Evidence .temp/eos-production-http.json.
- Staging remains 9a8716b; release did not overwrite it with the production tax work.

Security advisor delta is expected from the reviewed staging contract: eight new
member-guarded authenticated definer RPCs, while the legacy writer loses client
execution (net 229 to 236 warnings). No new anonymous exposure or definer-view
findings. Private observation_json carries staging's existing mutable-search-path
warning (6 to 7); the private schema/helper has no anon/authenticated usage/execute,
and it formats a typed row rather than accessing client-selected relations.
RLS-without-policy and definer-view findings remain 22 and four. No unrelated
security change was bundled. Guidance:
https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

Refresh existing production tabs before using EOS. The legacy-save restriction
is deliberate so stale clients cannot bypass optimistic concurrency. Signed-in
Production editing remains an owner follow-up; no customer records were used to
test it. Ordinary checks are complete with no deployment blocker.
