# Developer Data Correction

2026-09-15 · Production Mode · release approved; commit/push/production verification in progress.
Sync marker: `JUNIPER-DATA-CORRECTION-20260915-001`.
Database migration and approved single-account grant are already applied; do not repeat them.

## Scope

This is not a permissions/RLS bypass. Existing location edit/move/archive and guarded permanent deletion remain unchanged. The new capability restores a retired material assignment in its original bin without changing its UUID, item, minimum quantity, inventory balances, or transaction history. To correct a wrong location, leave the wrong assignment retired and map the material to the correct bin; restore only a pairing that should be active.

`can_developer_data_correction` is stored in existing `user_permission_overrides`. No new permission table or role defaults. Explicit active per-user grant, active Developer role, technical access and existing department inventory-management access are required. An active deny wins. Permission templates cannot grant it; no hard-coded email authorization. Only the verified main account (crncmk@gmail.com) was granted access, with an audit reason. No other override changed.

The generic override editor intentionally excludes Developer targets. A dedicated control for this single flag is placed alongside it at Developer → Permissions → selected user. The control requires a reason and confirmation and supports grant/revoke, including self-revocation. A global warning identifies enabled access. Same-window permission state refreshes after changes; other open sessions may retain stale UI until refresh, but every RPC checks current server permission state.

This permission has the existing standard review cadence, not automatic expiration. Revoke it before official rollout. Do not mark it long-term as a substitute for a rollout review.

## User workflow (after frontend publication)

1. Storage → open the bin, e.g. C211 → View retired assignments.
2. Select only the correct material assignment and choose Restore assignment.
3. Enter the reason and confirm. Recorded quantity must be zero; backend also checks the canonical ledger, unresolved transactions, active catalogue material, active ancestors and stale retirement timestamp.
4. Use Add materials / Count for the actual physical quantity. No old quantities are reinstated.

If the wrong material is associated with a bin, do not restore it merely to remove an error. Existing history is intentionally retained. Archive location and delete safeguards remain unchanged; historical assignments still prevent permanent location deletion.

## Applied migration

`20260915164220_developer_data_correction.sql` (actual Supabase version). Do not replay former local timestamp 20260915163330.

- Extends `user_permission_overrides_permission_flag_check`, preserving the entire prior expression and adding only this flag.
- `current_user_can_correct_inventory_data()` checks active Developer, technical access and explicit overrides; templates/defaults do not enable it.
- `set_developer_data_correction(text,boolean,boolean,text)` changes only this flag. Active Developer actor; active eligible Developer grant target; required audit reason; expected-state conflict check; target lock; previous overrides retained inactive; atomic `permission_change` audit. Revocation can remove dormant access after role/status changes.
- `read_retired_bin_assignments(uuid)` returns retired assignments only for a requested authorized bin.
- `restore_retired_bin_assignment(uuid,timestamptz,text)` restores only the archived fields. Checks active parents/material, permissions, cached and ledger zero, unresolved transactions and expected retirement timestamp. Uses existing inventory lifecycle and bin-item advisory locks, row locks, and short override/transaction table locks. Writes `change_logs` action `restore` atomically with full before/after and actor/time/reason. Repeat restoration fails with an actionable already-active message and creates no extra audit/stock event.
- All four functions use empty search paths, revoke PUBLIC/anon execution, and grant authenticated execution with internal authorization. No direct table grants, table/RLS changes, new indexes, new defaults or ledger writes.

Approval grant applied September 15 at 16:44:14 UTC using the guarded function, with the owner's explicit authorization and an audit entry. One active correction grant exists; no real assignments were restored.

## Validation actually run

- 84 Node tests pass, including default-deny/role/server/technical-access checks and active-deny precedence.
- Isolated PostgreSQL suite: existing catalogue, count, hierarchy, deletion and new correction tests pass. New tests cover grant/revoke, another Developer without grant, inactive/non-Developer/unknown actors, technical-access denial, department permission denial, missing reason, stale retirement, archived location, inactive catalogue item, nonzero balance, inconsistent ledger, pending transactions, audit-failure rollback, repeated restoration, direct-write denial and unchanged balances/history/defaults.
- Actual-schema `tests/dataCorrectionReleaseSmoke.sql` passed grant, list, count-zero/retire/restore through existing RPCs, missing reason, repeated restoration, revoke, audit, no extra stock transaction; all synthetic data and test permission changes rolled back.
- Before/after migration and rollback-smoke hashes matched for bins, assignments, balances, transaction lines, overrides and role defaults. After the approved grant, unrelated overrides still matched and exactly one grant audit remained. Zero real restoration events.
- Desktop 1440 and phone 390 browser fixtures passed retired-list rendering, zero/reason guards, error/retry, payloads, grant/revoke and warning visibility. No overflow/browser errors; screenshots visually reviewed. Existing Storage workspace desktop/tablet/phone and guarded-delete regressions also passed. Browser transport was mocked.
- Final fresh production-config build passes at `.temp/data-correction-final-20260915`; public configuration reused without logging secrets. Existing chunk-size/xlsx warnings remain.
- Live function grants/search paths verified. Security advisor baseline: 13 RLS-without-policy, 4 definer-view, 5 mutable-search-path, 11 anonymous-definer, and 147 authenticated-definer findings. Only the four new guarded authenticated functions were added (151). Existing warnings remain separately tracked: [Supabase linter reference](https://supabase.com/docs/guides/database/database-linter).

## Remaining release work

User authorized commit, push and deployment. Publish the tested source; do not reapply the migration or duplicate the account grant. Preserve historical untracked dist-* folders and private files. Exact production commit/assets verification is pending. Signed-in user acceptance and true simultaneous-session contention stress remain unclaimed.
