# v0.9.1 — priced work items without component breakdowns

Ryan requested this urgent Production correction. Branch starts at current main
bb74361/v0.9.0. No proposal-formatting or unreviewed scrollbar work is included.

The exact server blocker was the legacy outer approve_workbench_estimate wrapper:
it rejected all items with zero resource rows, including valid linked quotes.
Structure completion and editor readiness also treated organizational component
groups as mandatory. Component groups are now optional. Work-item name/quantity
and a valid active quote or numeric material/labor rows remain required. Empty,
missing, duplicate, archived and invalid pricing sources remain rejected. Explicit
zero costs remain valid. Group IDs/references still validate when groups exist.

The internal approval engine, pricing arithmetic, permissions, finalization
checklist, audit transactions, immutable snapshots and tax/card-fee handoff guard
are unchanged. No customer estimate is edited, submitted or approved by release
checks. The UI uses work-item/pricing errors rather than a blanket component gate.
Flat priced rows with an empty grouping array remain visible and editable without
changing their values.

Migration source: CLI-created
20261016173353_componentless_priced_work_item_approval.sql. Changes only
validate_workbench_structure and the outer approval wrapper; expected old hashes
and protected pricing/internal-approval hashes fail closed on drift. Five-second
lock and 30-second statement bounds. CREATE OR REPLACE preserves owners/grants.

344 named tests pass. PGlite and real PostgreSQL fixtures pass manual flat/grouped
work, componentless quotes, optional empty group metadata, zero costs and charged
quotes through submission/approval with exact pricing/snapshot parity. Both paths
reject invalid quantity/name, missing/duplicate/archived quote, blank/negative/
invalid costs and unpriced manual items. Existing role/scope, immutable snapshot,
audit rollback and concurrency tests pass. Actual editor checks at 1440px/390px
confirm manual and quoted items approve and unpriced items do not call approval.
Build passes with synthetic local settings; it is not a deployment artifact.

Exact Production function definitions were captured and restored/reapplied in an
isolated recovery fixture with owner/ACL equality. No shared backout or business
mutation is performed. Prefer forward repair, preserving approved history.

Publication and integrity receipts are appended after verification.

## Production receipt

Released code/tag: `d54c656234cc7d35674435803b4d011744fba09f` / `v0.9.1`.
Netlify deploy `6ad262ca38bfc02f815e6b47` is ready at that exact commit,
published 2026-10-16 17:46:06.880 UTC, zero secret-scan matches.
Production URL: https://rnsolutions.net/northgate.

Applied ledger `20261016174505`, `componentless_priced_work_item_approval`.
Migration source SHA256
`883255C7DEB8054A78E1D5B67CEAD0C258DBF0B68E86235DCD1593601FFA5163`.
Installed wrapper hash `94a7bf2b18ca9d34de6acfd3481b62de`, structure-validator
hash `7ef7cb4b8bd6b53e22a8d745b094dddd`, matching the exact recovery fixture.
Owners and ACLs unchanged. Internal approval, handoff-pricing/charge guard and CO
security function hashes remain unchanged.

All 14 data fingerprints match across migration: estimates, workbenches,
snapshots, personal copies, change sets/destinations, Jobs, COs, budget lines,
handoffs, allocations, permission templates/overrides, and normalized authorization
rows. The authorization fingerprint excludes login-synced display_name/email/
updated_at only; roles, division, active state and permission data are included.
No customer/test estimate was changed or approved by these checks.

Live pure validation of a synthetic componentless priced quote with tax/card
percentages succeeds without records. Normal TLS routes/assets, Production
Supabase/Clerk identities and the updated pricing-gate text verify in the compiled
deployed Workbench bundle. Security-advisor counts remain 22/4/7/11/245, unchanged.
Fresh-browser authenticated business checks remain blocked at Cloudflare; no
challenge bypass, active-user session reuse or real record test was attempted.
Evidence: ignored `.temp/standalone-checks/componentless-*` logs, JSON and PNGs.

GitHub Release: https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/releases/tag/v0.9.1.
Proposal-formatting promotion is separately approved and remains the next release;
no unreviewed scrollbar change is included here.

Sync marker: COMPONENTLESS-APPROVAL-PROD-V091-20261016-001.
