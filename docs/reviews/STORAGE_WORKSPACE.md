# Storage Explorer — release implementation

2026-09-15. Production Mode. Separate authorized Inventory follow-up before AFC Phases 2–4. Ryan approved migration, commit, push and production deployment. Sync marker: `BIRCH-STORAGE-EXPLORER-20260915-001`. Database applied; frontend release verification pending below.

## Existing architecture and changes

Storage was a 10-row unit/bin preview. Locations & QR was a flat hierarchy table plus a separate QR/administration panel. They now share one authoritative Storage Explorer:

- Storage units → shelves → bays → bins → mapped material/count rows.
- Breadcrumbs and locationId URL state support browser navigation and direct views.
- Existing `view=locations` links resolve to Storage; stable /scan/location/UUID payloads are unchanged.
- Existing DataTable/Toolbar/layout tokens, create/archive/restore/count/mapping hooks and server permissions are reused. Flat Locations & QR navigation/rendering and unused preview selectors are removed.
- Add the next child within its current parent; saved locations open directly. Details/administration and QR tools open only when needed.
- Code, name, sort order, physical location and materials/purpose are editable. Shelves, bays and bins can move to an authorized parent, with confirmation, reason and server audit. Storage units stay roots; this does not add department editing or physical inventory transfer shortcuts.
- Bin content quantities use the existing audited count controls; Add materials / Count opens the existing mapping/intake workflow. No inventory balance write or replacement ledger is introduced.

## Database (applied)

`supabase/migrations/20260915153440_inventory_storage_workspace.sql` (Supabase-assigned version; replaces local timestamp 20260915151207):

1. Add nullable physical_location and materials_summary text (maximum 500 characters each) to storage_units, shelves, bays and bins. Existing data, grants, RLS, foreign keys and indexes remain unchanged.
2. Extend edit_inventory_location with an explicit nine-argument overload accepting details and parent ID. Keep the seven-argument endpoint as an invoker compatibility wrapper into that single implementation. Old clients preserve new detail fields.
3. Require active Clerk actor, existing can_manage_inventory scope for source AND destination departments, active target/parent ancestry, matching revision, valid text/code and reason. Fixed table/column dispatch; no arbitrary dynamic identifiers. Parent type follows existing FK hierarchy, so cycles are not possible.
4. Reject duplicate code in destination scope, archived destination, stale edit and unauthorized moves. Update only the selected location; children keep IDs/links and travel with their parent. Transactional before/after audit includes parent IDs and metadata. Quantities, original ledger and QR UUIDs are unchanged.
5. Move/edit and archive share an exclusive advisory lock; existing create/map/intake/count functions acquire its shared half before inspecting ancestry. The migration preserves their full current definitions, signatures and grants and prepends only the shared lock. This prevents old-scope preflight during a concurrent hierarchy move. Short hierarchy table locks stabilize mutations; no external request is made while locked.
6. Anonymous/PUBLIC execution revoked; authenticated execution granted only to guarded RPC overload. Search paths remain empty. No new roles, permission defaults or RLS policies.

Applied before the frontend. Live function definitions were inspected first; all four create/map/count function bodies are identical afterward except for the added shared lock. Both edit signatures deny anonymous execution and grant authenticated execution with internal permission validation. No production business-data migration or quantity backfill.

Preservation checks across 11 tables: nine matched original-row counts/hashes exactly, including catalogue, balances, transaction history and permission overrides. Concurrent user shelf edits changed the shelf hash; reconstructing the prior values from their audit entries matches the baseline exactly. The Developer profile updated_at also advanced during use; a separate timestamp-excluded profile hash is retained for post-release comparison. No permissions/defaults were changed by this migration. Security advisor counts unchanged: 13 RLS-without-policy, 4 definer-view, 5 mutable-search-path, 11 anonymous-definer and 145 authenticated-definer findings. Existing findings remain outside this release; the guarded nine-argument edit function replaces the former seven-argument definer finding. [Advisor remediation reference](https://supabase.com/docs/guides/database/database-linter).

Moving a branch changes its current location path and inherited department. Existing IDs/QRs/ledger entries remain; reports that display the *current* path will reflect the move. Existing historical audit snapshots are not rewritten. Previously printed human-readable names/paths may need replacement even though the QR still resolves.

## Labels

Reuse existing QR encoder and pdf-lib. PDF is generated locally from authorized loaded locations, never through a public data endpoint.

- Select all locations, one branch, one level, or individual labels.
- Avery 5164 / compatible 94215: US Letter, 2 columns × 3 rows, 4-inch width × 3⅓-inch height; 0.5-inch top margin, 0.15625-inch side margin and 4.1875-inch horizontal pitch.
- QR size 0.75–2.1 inches including four-module quiet zone; vector PDF modules and SVG export avoid raster scaling. Start at any label 1–6 to use a partial sheet.
- Names/paths are bounded to label width, with ellipsis for overflow. Unsupported font characters produce an actionable error, not corrupted symbols.
- Print Actual size / 100%, never Fit. Physical alignment and scanner acceptance need a plain-paper test on the user's printer.

Sources: [Avery 5164](https://www.avery.com/templates/5164), [compatible label geometry](https://stg-cms.avery.com/blank/labels/94215?material=recmw-paper).

## Verification

- 81 Node tests passed including branch/ancestor filtering, exact page geometry, partial-sheet pagination, bounds validation and PDF page size.
- Isolated PGlite SQL: existing Phase 1 checks plus new detail fields, all three move types, unchanged child IDs/quantities/ledger, old-client preservation, source/destination permissions, archive/type/collision/stale rejections, anonymous denial and audit-failure rollback.
- Responsive browser fixture (1440/768/390): drill-down, details save, move confirmation/payload, archive/restore, contextual child creation, bin contents, PDF download and old locations URL; no browser exceptions or page overflow.
- Minimum/default/maximum label PDFs rendered with Poppler; first/continuation pages visually inspected. All six minimum-size QR codes decoded from a 300-DPI rendered PDF to their exact original URLs using jsQR.
- Existing catalogue/location browser regressions passed after updating selectors for the consolidated UI.
- Production-config fresh build passed; existing chunk-size/xlsx warnings remain.
- Live-schema rollback-only smoke passed: actual authenticated RPC/RLS create, map/count, shelf/bay/bin moves, stable descendants/quantity, details, old-client preservation, stale/type/collision/reason/unknown-actor rejection, archive/restore. All synthetic records and audit entries rolled back. Reproduce with tests/storageWorkspaceReleaseSmoke.sql.
- Remaining: genuine simultaneous-session PostgreSQL checks, signed-in production acceptance and physical label/printer test. Browser transport is mocked; do not confuse responsive fixtures with signed-in production acceptance.

Reproduction: scripts/verify-storage-workspace-db.mjs, scripts/verify-storage-workspace-ui.mjs, scripts/verify-storage-labels.mjs and scripts/verify-storage-qr-render.mjs. Render labels-0.75.pdf at 300 DPI to labels-small.png before the decoder check. QA outputs are ignored under .temp/storage-workspace.
