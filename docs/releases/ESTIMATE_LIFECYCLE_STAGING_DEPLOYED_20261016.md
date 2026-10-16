# Estimate approval and archive/restore — Staging deployment receipt

Ryan authorized this Staging release. Published 2026-10-16 11:17:38 UTC at
https://staging.rnsolutions.net. Production estimate-feature promotion is withheld
for Ryan's review. Execution stayed on Ryan_Northgate, in an isolated checkout.
This receipt supersedes preparation-only status in earlier review documents.

## Immutable identities

- Deployed code: `3a23a6a5c40f05550fe962508b92acb70d314091`.
- Netlify deploy: `6ad207bffeaebd6b8b043d09`, ready, branch staging, site
  `431ce717-1a06-45a0-9d7a-8acd06a67dde`.
- Includes Production CO security commit `2c1880f1ffa3d592d39b387bbb61c7aadea6bc83`.
- Main remained at that CO commit. No Production frontend deployment, estimate
  migration, business write/delete, grants/account changes or active browser use.
- Existing Staging history was merged normally; no force-push. Current Production
  tax/card-fee code and the approved combined workflow won stale cherry-pick
  conflicts. Earlier Staging submission documentation was retained.

## Applied Staging migrations, in order

Only project `fazfwzbuesvzhgodckiw` was modified. MCP generated the actual ledger
timestamps below; source filenames retain their CLI-generated identities.

| Applied ledger | Source migration |
| --- | --- |
| 20261016111623 | 20261016110939_contract_adjustment_status_authorization.sql |
| 20261016111627 | 20261016111126_staging_estimate_dependency_reconciliation.sql |
| 20261016111632 | 20261015171453_estimate_lifecycle_archive_restore.sql |
| 20261016111636 | 20261016110350_standalone_estimate_review_v080.sql |

Each returned success. New estimate migrations use five-second lock and
30-second statement bounds. Historical incident pause and Production-only EOS
bootstrap were not replayed. The new dependency migration directly reconciles
the exact old promotion definition to its accepted repair, preserving ACLs, and
installs the accepted proposal-charge source without record changes.

Source SHA256:

```text
999B6BD5D450B60943098B439D521B5FF5B9C7EF9188A16A3D4FB0D7A2C362F8  CO authorization
B970B9ADEA68177E3D8D43D9E82975AC2322CEDA7EAA738651D347029C16D4E4  Staging dependencies
7F838FF3F472087B6C3737EA7410849BF668E2EC56066EFCB69AC2A46CC152ED  Archive/restore
2B41F9558CB442888D38A33506D4BC8A38C56C7134303060F792F8D031FD4234  Standalone review
```

## Behavior and verification

Official estimates submit through the reason modal without creating a Job or
Service Call. Review locks saved scope; approval retains the immutable snapshot
in Estimates. Destination handoff is optional and preserves the tax/card-fee
block. Personal archive hides only the owned personal source; official archive
retains snapshots and links. Restore recovers the exact prior workflow status.
Pending standalone review cannot be archived by the directory or an old RPC.

Final named suite: **341/341 passed**, including optional CO SQL regression.
Build passed using synthetic local settings (existing chunk-size warning).
Actual shell/router/editor fixtures passed desktop 1440px and mobile 390px,
including official archive failure/retry/restore, independent personal archive/
restore and promoted-source read-only behavior. Existing modal focus/Escape/
Cancel/pending/route/scroll/calculator, notes, labor-rate and proposal-charge UI
checks passed. Independent lifecycle and promotion database regressions passed.

Real PostgreSQL 17.10 fixtures passed observed separate-session lock contention:
duplicate submit/approve/handoff, competing reasons/decisions, submitted-save
rejection, both archive-versus-submit orders, duplicate personal archive/restore
and conflicting personal archive/restore timestamps. Local server stopped after
testing. Shared databases use 17.6. Captured official permissions and synthetic
personal-scope authorization remain explicit fixture boundaries.

Post-migration shared metadata verifies:

- CO function hash `0099a2e4e5dcdb037af6fd69602a336b` matches Production; owner
  postgres, authenticated execute retained, anonymous execute denied.
- Promotion hash `71bbbcef4ee5f7bffddccf9fa6ee5385`; guarded handoff pricing hash
  `ce3bc1adc014248106252263420fff39`, matching accepted Production definitions.
- New review table has RLS, zero rows, no authenticated INSERT/DELETE. Internal
  approval/charge/trigger functions remain unavailable to clients; intended RPCs
  allow authenticated execution and deny anonymous execution.
- Existing estimates, workbenches, immutable snapshots, personal copies, Jobs and
  CO full-row fingerprints match before migrations, after migrations and after
  deployed browser checks. No customer record was changed or deleted.
- Rollback-only no-identity personal-directory read returns zero rows.
- Security advisors: missing-policy 22→22, definer-view 4→4, mutable-path 7→7,
  anonymous-definer 10→10. Authenticated-definer 235→244 corresponds exactly to
  nine deliberately guarded new RPCs. See the [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Netlify verifies exact deployed commit, ready state and zero secret-scan matches.
Normal TLS HTTP checks return 200 for root, official/review estimate routes and
Jobs. Entry JS, Workbench chunk, runtime JS and CSS return expected MIME types.
Compiled assets contain the Staging database identity, Staging Clerk domain and
the new workflow RPCs. No synthetic local build was uploaded.

## Remaining acceptance limit and recovery

A fresh isolated Edge session redirects to `accounts.staging.rnsolutions.net` and
reaches Cloudflare "Performing security verification". That page was captured and
visually inspected. It prevents automated access to Clerk sign-in; no challenge
bypass, session reuse, account change or business test submission was attempted.
Signed-in owner/reviewer acceptance therefore remains unrun. Use Ryan's normal
Staging login to review; Production promotion remains separately withheld.

Original source screenshot still could not be materialized through Library's
Windows extended-attribute route, as recorded in the earlier modal review. New
local editor/mobile screenshots were inspected; no source-image inspection is
claimed. The Bell inbox extension and any new decline policy remain outside scope.

Evidence is retained in ignored `.temp/standalone-checks`: final unit/build logs,
database/race JSON, combined UI results and PNGs, `staging-deployment-evidence.json`,
`staging-live-results.json` and the Cloudflare screenshot. Recovery is forward
repair preserving review/audit/snapshot data. No destructive migration rollback or
new blanket physical-backup requirement was introduced.

Sync marker: ESTIMATE-LIFECYCLE-STAGING-20261016-001.
