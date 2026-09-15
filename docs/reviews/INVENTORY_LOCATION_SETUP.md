# Material Inventory — location setup and count access

2026-09-15 · Production Mode · release authorized; database applied, frontend publication in progress.

## Scope and reuse

Ryan approved both missing location setup and replacing the old Developer/Admin-only
count gate with existing granular inventory management authority. Existing tables,
count RPCs, inventory ledger, balance triggers, QR/location browser and department
permission resolver are retained. No role defaults, user grants or retirement
permissions were changed. No new inventory system or department table was added.

## User workflow

1. Material Inventory → **Add Storage Location** opens a dedicated workspace.
2. Create a Storage unit, then Shelf, Bay and Bin, or select an existing parent.
   Codes and descriptive names are required. Child locations inherit the parent's
   department. Codes are unique within their parent; storage-unit codes are global.
3. After saving a bin, **Add materials and quantities** opens existing Count intake
   with that bin selected. Search the shared active catalogue by code/name, select
   the material, enter the physically counted quantity and reason, and record it.
4. Existing bin/material quantities are adjusted through **Set Count**. This records
   an absolute physical count, not an additional shipment quantity. Existing
   transaction and audit behavior remains authoritative.

The location list, QR workflow and count read model refresh after writes.
Hierarchy/count reads now paginate beyond 1,000 records; the intake picker shows up
to 200 search matches from the existing full active-catalogue read.

## Authorization and database changes

Migration: `20260915113613_inventory_location_setup_permissions.sql` (applied).

- New RPC `create_inventory_location(uuid,text,uuid,text,text,text,integer,text)`:
  active Clerk actor, existing `can_manage_inventory`, existing
  `current_user_can_edit_division`, strict inputs and inherited department;
  atomic location + `change_logs` create entry, actor/name/time/reason.
- Existing `intake_inventory_count` and `set_inventory_count_quantity`:
  replace the role-only gate with the same effective permission and root storage
  department check. Keep count transactions, balance recomputation, correction
  audits, locks, and retired/inactive item checks. Reject nonfinite quantities.
- No tables, columns, indexes, RLS policies or role defaults added/changed.
  Existing hierarchy FK/uniqueness and SELECT policies are reused. No direct
  authenticated table-write grants are introduced.
- All three RPCs revoke PUBLIC/anon execution and grant authenticated execution;
  authentication and granular authorization are also checked inside the RPCs.
- New location RPC has empty search_path. The two count functions retain their
  existing public/pg_temp search_path because existing ledger triggers use
  unqualified relation references; those triggers were not refactored.
- Existing resolver permits Manager/Director/Developer cross-department edits only
  when effective Manage Inventory is true. Other authorized roles remain scoped
  to their department. Explicit denials remain effective. UI mirrors the resolver;
  database enforcement is authoritative.
- Retirement remains Developer/Admin plus existing archive permission, zero
  quantity and existing server checks. No retirement RPC was changed.

Location request UUIDs are serialized with advisory locks. Identical retries by the
same actor return the saved location without another audit row. Changed requests
must use a new UUID. A second lock serializes normalized codes within each parent.
Existing records and quantities are not backfilled or modified by migration.

## Verification actually performed

- `scripts/verify-inventory-location-db.mjs`: isolated PGlite/Postgres, migration
  applied twice; synthetic hierarchy/ledger tables with captured real permission
  functions and real balance/audit triggers. Verified all four levels, same-code
  sibling rules, idempotent retry, mismatched retry, invalid code/type/parent,
  inherited department, direct insert blocked by RLS, Supervisor scope, User
  explicit grant, Manager explicit deny, inactive/missing actor, finite count and
  required reason, initial count/recount/correction, balance and audit provenance,
  retired-link rejection, audit-failure rollback, and anonymous execute denial.
- `scripts/verify-inventory-location-ui.mjs`: actual workspace and hooks with
  synthetic API transport. Desktop 1440, tablet 768, phone 390; unit → shelf → bay →
  bin → material beyond first 200 → intake; Supervisor correction and cross-
  department controls; no expanded retirement; duplicate errors preserve fields;
  exact retry UUID; readonly hidden actions; selection beyond 1,000 bins; no page
  overflow or uncaught JavaScript errors. Setup screenshots visually inspected.
- Existing `scripts/verify-inventory-pass.mjs`: stock/catalogue, cart, checkout,
  search/pagination, source selection, scan, readonly, server failure and responsive
  checks passed.
- Five Node inventory-search/material-catalogue tests passed.
- Production-configured local Vite build passed. Existing XLSX dynamic/static
  import and large-bundle warnings remain. No environment secrets logged.

Not claimed: true multi-session concurrent database testing or signed-in browser
acceptance. Isolated fixtures are not production data and must never be applied to
Supabase. The separate rollback-only release smoke uses the real schema.

## Release checklist

1. Obtain commit/push/deployment authorization; preserve unrelated dist-* artifacts.
2. Recheck current remote and live count-function definitions before replacing
   functions, in case another machine changed them. Migration copies were based on
   read-only live inspection on 2026-09-15.
3. Apply this migration before publishing the frontend. Run rollback-only real
   schema smoke tests and inspect grants/security findings. Do not grant users
   extra permissions without explicit authority.
4. Build from fresh output with configured VITE_SUPABASE_URL and public auth
   settings; commit/push and deploy through the existing release path.
5. Verify signed-in setup, QR appearance and first count using an explicitly
   designated test location. Update durable sync marker and release log.

## Authorized release verification

Ryan authorized commit, push and deploy on 2026-09-15.
Marker: OAK-INVENTORY-SETUP-20260915-001. Base: 9c010f5.

- Fetched origin; no newer commits or divergent work. Live count RPCs and department
  resolver exactly matched the previously inspected definitions.
- Applied migration; local filename aligned to server version 20260915113613.
- `tests/inventoryLocationReleaseSmoke.sql` passed against production in an
  explicit rollback transaction: existing active Manager/Developer authority,
  create/replay/duplicate, all hierarchy levels, RLS visibility, quantity 12 → 8 →
  0, actor attribution, missing-actor and anonymous denial. No test rows retained.
- Before/after hashes of all existing storage units, shelves, bays, bins, bin links,
  balances and user permission records match exactly.
- 74 Node tests and the isolated database/browser suites pass. Fresh production
  output: `.temp/inventory-production-20260915-oak`.
- Deployment result and cross-machine commit are recorded in SYNC_STATUS.md and
  the next HANDOFF entry once publication is verified.
