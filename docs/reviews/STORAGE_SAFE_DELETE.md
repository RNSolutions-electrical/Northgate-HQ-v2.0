# Storage duplicate guidance and guarded permanent deletion

2026-09-15 · Production Mode · WILLOW-STORAGE-SAFETY-20260915-001.
LIVE: migration applied and deployment verified. Previous release: BIRCH / e9e3910.

## Scope and behavior

- Add Storage Location now searches loaded authorized records including archived locations, matching normalized code within the correct type/parent scope. Storage-unit codes retain existing global uniqueness. It displays matching name/path/department and archived status with Open existing location. Opening requires confirming loss of the unsaved new-location form. Parent choices exclude archived ancestry. Server errors refresh the list without clearing input.
- Archived locations expose a collapsed Developer-only permanent-deletion section. The UI requires server-loaded Developer role and canAccessDeveloper. Managers/Directors cannot gain this action merely through inventory-management access.
- Workflow: reason + initials → Download backup JSON → confirm file saved → type exact location code → final destructive confirmation → permanent deletion → parent Storage view.
- Backup download itself does not delete anything. Changing the reason/initials invalidates the client backup selection and requires a new export. Failed deletion retains the backup for retry.

## Database migration (applied)

`supabase/migrations/20260915161130_inventory_storage_safe_delete.sql` creates three functions only. This is the actual applied version; do not replay the former local timestamp 20260915155751.

1. `storage_location_deletion_snapshot(text, uuid)`: internal SECURITY INVOKER helper, no PUBLIC/anon/authenticated execution. Validates active Developer role AND existing current_user_has_developer_access(), archived state, all inbound FKs, legacy polymorphic cart/transaction references and retained material/transaction audit references. Returns full location record, ancestors and location audit history. Future simple inbound FKs are checked too; complex FKs fail closed.
2. `prepare_storage_location_deletion(text, uuid, text, text)`: guarded SECURITY DEFINER endpoint. Validates reason/initials, reuses helper and writes a durable full JSON backup to existing change_logs with action update and operation storage_deletion_backup. Returns that exact server snapshot and its audit UUID for the browser download.
3. `permanently_delete_storage_location(uuid, text, boolean)`: guarded SECURITY DEFINER endpoint. Requires the same active Developer who prepared the backup, exact code and saved-file acknowledgment. Rechecks all dependencies and full current record/ancestor equality to the backup, deletes only the selected row, then records action delete atomically with reason, initials, actor, time and backup UUID. A failed audit insert rolls back deletion. Retrying the same completed backup returns success without a second deletion/audit.

Both exposed endpoints have empty search paths, PUBLIC/anon revoked and authenticated EXECUTE granted. Actual role/access checks remain server-side. No direct table DELETE grant, no new permission defaults, no new tables, no cascade, no audit deletion, no balance updates, and no production data change in the migration itself. Existing change_logs accepts update/delete and has no direct authenticated writes.

The existing hierarchy advisory lock coordinates create/map/count/edit/archive with deletion. Hierarchy and referenced-table locks keep checks/deletion in one short transaction. Both backup preparation and deletion repeat dependency checks. Material links block deletion even if archived or confirmed zero; consequently their stock, cart and transaction relationships remain intact. A parent with archived children is still blocked.

There is no direct browser API that can prove a user physically saved a file. The server enforces a prepared, actor-bound backup plus explicit saved-file acknowledgment; the authoritative copy is retained independently in change_logs. Client-supplied JSON is never trusted as deletion authority.

## Recovery and historical identity

JSON contains the original UUID, archived metadata, original field values, ancestor records and prior location audit history. After deletion, the old QR destination becomes unavailable. Reusing its code creates a new UUID and new QR identity. Do not silently relink old QR codes/history.

Recovery is a controlled Developer/database operation, not an automatic JSON upload. Verify the server audit copy, parent existence, current schema, code conflicts and dependencies before any explicit restoration. Preserve original delete/backup audit entries and record a new recovery event. Downloaded JSON is useful evidence but not a guarantee of conflict-free restoration. No restore endpoint was introduced in this scope.

## Tests actually run

- 82 Node tests: includes archived/case-normalized duplicate matching, parent/type scope and existing inventory/label utilities.
- Isolated PGlite SQL runner: existing catalogue/storage suites plus role/active/technical-access denial; reason/initials/code/download/backup-owner gates; archive-only; every hierarchy level; archived children/material links/zero balance; future FK with CASCADE still blocked; cart/history references; stale backup; audit-failure rollback; durable backup/delete record; idempotent retry; code reuse under a new UUID; anonymous/internal-helper/direct-delete/direct-audit denial.
- Browser fixture at 1440/768/390: archived duplicate discovery and opening, JSON download content, required controls and reference errors, changing reason invalidates backup, failed request/retry, successful return to parent, no overflow or browser exceptions. Manager/Director/Supervisor/Developer-with-denied-access do not see deletion. Screenshots at desktop and phone visually reviewed.
- Existing location setup/count/retry/permission browser regression passed. Storage drill-down and catalogue regressions run separately.
- Local production-config build passes. Existing chunk-size/xlsx warnings remain.
- Live schema inspection: no deletion triggers found on hierarchy; inbound FKs and polymorphic references reviewed. Post-migration grants confirm the internal helper cannot be called by anonymous/authenticated users, while the two guarded endpoints allow authenticated execution only. Security-advisor counts remain 13 RLS-without-policy, 4 definer-view, 5 mutable-search-path and 11 anonymous-definer; authenticated-definer findings increased from 145 to 147 for the two new guarded RPCs. Existing findings were not changed by this scope; [remediation reference](https://supabase.com/docs/guides/database/database-linter).
- Actual-schema authenticated rollback smoke (`tests/storageDeletionReleaseSmoke.sql`) passed all four hierarchy levels, archived-child protection, archive/reason/code/download/actor gates, backup/audit retention and idempotent retry. All synthetic rows and backup/deletion audit entries were rolled back; follow-up query confirmed zero retained deletion/backup operations.
- Eleven-table before/after checks: unchanged source/profile/override hashes where no concurrent edits occurred. Bay, balance and transaction differences correspond to user-logged bay details and count corrections during verification; later binding archives also belong to the user. These were preserved, not reverted. This is not a claim that all live tables stayed unchanged while the user worked.

Reproduce: `node scripts/verify-storage-workspace-db.mjs`, `node scripts/verify-storage-deletion-ui.mjs`, `node --test tests/*.test.js tests/*.test.mjs`. Browser runner needs PLAYWRIGHT_MODULE and Edge. Local QA artifacts stay ignored under .temp/storage-delete.

## Release and remaining checks

Migration 20260915161130 is applied and the local filename/test reference now matches. Do not apply it again. No real locations have been deleted. Feature commit c016cf8ed706717d4c1c559265dc2cc92ec7de78 is published in ready production deploy 6aa96fd3299c040008299945. Live HTML and all 14 assets match the fresh tested build by SHA-256/MIME; public configuration, retained workflows and deep links verified. silas-chat is retained; Netlify scanned 590 files with no secret matches. The final documentation-only commit uses [skip ci] and does not alter deployed bytes. True independent-session concurrent stress and signed-in production acceptance are not claimed by these isolated/mocked tests.
