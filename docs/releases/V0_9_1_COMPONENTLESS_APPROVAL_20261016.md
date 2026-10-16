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
