# Phase 1 — Catalog Intelligence & Inventory Foundation

Production Mode. Scope follows Ryan's corrected four-phase plan and subsequent storage-archiving requirement (2026-09-15). No AFC, Documents restructuring, or AI/MCP implementation. No deployment authorization carried over from the preceding release.

## Architecture review / plan

- Reuse `items` as the canonical shared material catalogue; existing item IDs remain authoritative in Estimates, assemblies, and inventory.
- No equivalent alias table exists. Add audited aliases with catalogue-edit/department authorization and shared catalogue read scope. Same phrase may identify several items; show candidates, never guess or create a new material automatically.
- Share a pure material resolver among catalogue search, inventory selection, and the Estimate Workbench (including its assembly editor). Exact identifiers/name/alias outrank normalized and fuzzy suggestions. Every selection remains explicit.
- Reuse `storage_units → shelves → bays → bins` and `bin_items` for quantity-free mapping. Do not introduce a second location or inventory table.
- Preserve missing balance as unknown, distinct from a confirmed physical count of zero. Counting uses existing intake/correction RPCs and transaction-derived balances.
- Add archive metadata to existing storage tables. Require inventory-management scope, archive permission, and a nonblank reason. Block archiving a parent with active children or a bin with active material links. Keep history and identifiers; no deletion or implicit cascade. Guard new/active children against archived parents at the database layer.
- Ryan also requested location editing. Permit audited name/code/sort-order edits with a valid reason and stale-write protection. Keep IDs, QR links, parents, departments, stock links, and history stable. Department changes and reparenting are not silently treated as cosmetic edits.
- Test in isolated PostgreSQL plus UI fixtures; leave production migration, commit, push, and deploy for explicit approval.

## Acceptance / release checks

Aliases: canonical/identifier/alias ranking; ambiguous phrases; fuzzy confirmation; archived aliases; shared reads; unauthorized writes; audit failure rollback.

Inventory: map without a quantity or ledger write; repeated mapping; unknown vs zero; physical count variance/audit; department permissions; archived parents; reason validation; active-child and mapped-bin archive blockers; historical references preserved.

Integration: current inventory/cart/count/QR and Estimate Workbench regressions, responsive display, production-config build. Record actual results below before release.

## Implementation / user workflow

1. Inventory → Full Catalogue → expand a material → Material aliases. Authorized catalogue editors can add, archive, or restore an alias with a reason; other catalogue readers can inspect aliases. Exact identifiers, exact canonical names, and exact aliases precede normalized and fuzzy suggestions. Ambiguous matches remain explicit choices.
2. Inventory → Add materials / Count → Pass 1 — Map materials. Choose the bin, search by code/name/alias, explicitly select the canonical material, and confirm. This inserts only the existing `bin_items` relationship and its audit record. The quantity is **Not counted**, not zero.
3. Count the mapped row in the existing count sheet, or use Pass 2 — Record quantity for an initial count. Zero must be entered explicitly. Existing count/correction RPCs generate transactions and derived balances; no UI or mapping function writes `inventory_balances`.
4. Inventory → Locations & QR → select a location → Edit location. Code/name/sort order are editable with a reason and optimistic revision validation. IDs and parent/department relationships are unchanged. Existing QR URLs still resolve; previously printed human-readable labels may need reprinting after a rename.
5. The same location administration area supports Archive / Restore with a reason. Inventory management and archive permission are both required. Active children/material links and any nonzero balance block archive. Include archived locations to find history and restore. Restore a parent before its archived children. Archiving never cascades, deletes records, retires links, clears stock, or restores retired material links implicitly.

The existing Developer/Admin-only material-link retirement rule is unchanged. A Manager cannot use location archive to bypass it. Retired material links require Developer review before reuse; no pre-existing material-link restore UI/RPC exists, and this phase does not invent a hidden automatic restoration path.

## Database migration

`supabase/migrations/20260915122542_catalog_inventory_foundation.sql` (applied to production on 2026-09-15; local filename aligned to the Supabase-assigned version):

- New `item_aliases`: canonical item FK; normalized generated key; unique `(item_id, alias_key)`; active lookup index; creator/archive user FKs; timestamps/reason; RLS catalogue-read policy and SELECT-only authenticated grants. Identical aliases may legitimately belong to different items, creating candidates rather than a guessed identity.
- Existing `storage_units`, `shelves`, `bays`, `bins`: additive `archived_at`, `archived_by` FK, `archive_reason`, and positive `revision` columns. Existing rows remain active at revision 1. No data removal/backfill of quantities or role defaults.
- RPCs `save_material_alias`, `map_material_to_inventory_bin`, `edit_inventory_location`, `set_inventory_location_archived`: active Clerk actor; existing permission/department helpers; validated inputs; atomic audit writes; PUBLIC/anon execute revoked. Alias/map retries reuse the existing relationship; editing rejects stale revisions. Archive/restore repeated state is a no-op.
- `guard_inventory_location_parent` triggers on hierarchy children and `bin_items` prevent active insertion/restoration under archived parents. Parent row locks serialize against archive.
- `guard_active_inventory_posting` trigger prevents new postings to retired links/archived locations, including stale preflight requests. Existing ledger update/rebuild logic is retained.
- `inventory_cart_candidates_view`: preserves the existing authorization/legacy column contract; excludes archived hierarchy and appends `quantity_recorded`. New clients distinguish missing balances from zero. Existing item-department stock visibility is unchanged.
- Existing `audit_physical_count_correction`: retains legacy fields and action, adds nullable previous observed quantity / recorded flag and unit snapshot, fixes its search path. Existing history is not rewritten.
- All actions use existing allowed audit values (`create`, `update`, `archive`, `restore`, `physical_count_correction`). No duplicate permission or inventory systems.

## Verification (local)

- 78 Node tests passed, including shared resolver ranking/ambiguity, fractional sizes, archived aliases, unknown vs zero, catalogue paging, and existing financial/estimate tests.
- `scripts/verify-catalog-inventory-db.mjs` passed against isolated PostgreSQL/PGlite with captured live permission helpers and ledger triggers. Covers alias CRUD lifecycle and shared reads; explicit overrides/denials; anonymous/direct-write denial; quantity-free mapping/retry; first zero count; real transaction/balance/audit; unit/code editing and stale revision rejection; duplicate codes; archive reason/active-child/link/nonzero-stock checks; parent restoration order; retired-posting rejection; forced audit-failure rollback for aliases, mapping, edits, and archive.
- Existing `verify-inventory-location-db.mjs` passed (setup permissions, count ledger, rollback, retirement boundaries).
- `verify-catalog-inventory-ui.mjs` passed at 1440, 768, and 390px with the actual components/hooks and mocked transport. Alias search/save, explicit map without quantity, unknown→zero count, edit payload/revision, archive/restore reason gates, permissions, and overflow checked. Screenshots under ignored `.temp/catalog-inventory-ui/` were inspected.
- Existing `verify-inventory-location-ui.mjs`, `verify-inventory-pass.mjs`, and `verify-estimate-workbench.mjs` passed (setup, stock/cart/checkout/scans, count, shared catalogue and assembly/estimate workflows).
- Production-config Vite build passed in ignored `.temp/catalog-inventory-phase1-20260915/`. Existing bundle-size and mixed xlsx-import warnings remain; no secret values were logged.

The UI transport is mocked and the SQL fixture is isolated; these are not signed-in production acceptance or a true simultaneous-session PostgreSQL concurrency test. Constraints/locks/stale revisions are implemented and tested for deterministic conflicts, but live multi-session validation is still a release check. Test scripts reuse the project's existing optional PGlite runtime under `.temp/inspection-checks/` and configured Playwright runtime.

## Release order / remaining checks

1. Review and commit/push only the scoped changes after Ryan authorizes release. Preserve all unrelated untracked dist directories, environments, and private imports. Do not claim a new sync marker before a commit exists.
2. Database step completed: live schema preflight, isolated migration tests, real-schema rollback smoke, preservation comparison, and security advisor comparison passed on 2026-09-15.
3. The additive migration is already applied as 20260915122542. Do not apply it again under the original local timestamp 20260915115633. Nested alias reads, archive/revision fields, and `quantity_recorded` are ready for the frontend. A frontend rollback can leave the additive database migration installed.
4. Build/deploy using validated production public environment values and normal secret scanning. Verify signed-in catalogue/department access, mapping/counting, and editing/archiving with a disposable empty location. Verify simultaneous edit/archive/count conflicts in staging.
5. Other machines should pull the eventual release commit and read this document. Phases 2–4 remain intentionally deferred.

## Status

Database migration applied and verified with Ryan's explicit approval. Ryan subsequently authorized commit, push, and deployment. Release marker: `ASPEN-CATALOG-FOUNDATION-20260915-001`. Production publishing and final verification are in progress; see SYNC_STATUS.md for the final release record.

### Production database verification — 2026-09-15

- Applied `20260915122542_catalog_inventory_foundation` to project `keogysnoukbendfkfjcn`. The local migration was renamed from 20260915115633 to match the live migration history; SQL content is unchanged.
- Before/after row counts and deterministic record hashes matched across 11 existing tables: storage_units (5), shelves (4), bays (4), bins (9), bin_items (12), items (1,615), inventory_balances (12), inventory_transactions (46), transaction_items (79), user_permissions (6), and user_permission_overrides (10). Hashes exclude only new archive/revision columns on the four hierarchy tables. Recently added user locations are preserved.
- `tests/catalogInventoryReleaseSmoke.sql` passed on the real schema using transaction-local authenticated claims and synthetic records inside BEGIN/ROLLBACK. Verified alias lifecycle/RLS reads; quantity-free mapping and retry; unknown-to-zero count through the existing ledger; stable location identity; stale edit rejection; archive reason and active-link blockers; archived mapping rejection; restore; and unknown-actor write denial. No user role or persistent test record was changed. Follow-up checks found zero test aliases, locations, or audit entries, and all 11 preservation hashes still matched.
- Four public RPCs have authenticated execution, anonymous execution revoked, empty search paths, and existing actor/permission/department guards. Trigger functions cannot be directly executed by anonymous or authenticated users.
- Security advisors: unchanged 13 RLS-without-policy tables, 4 definer views, and 11 anonymous definer notices; mutable search paths reduced from 6 to 5. Authenticated definer notices increased from 141 to 145 solely for the four intentionally exposed, guarded RPCs. Existing unrelated findings remain outside this phase. See [Supabase definer endpoint guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Signed-in frontend acceptance and true simultaneous-session concurrency validation remain pending; the database smoke is not a frontend deployment or a multi-session test.
