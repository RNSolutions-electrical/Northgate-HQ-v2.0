# Inventory details and routine audit policy

Release: JUNIPER-INVENTORY-AUDIT-20260916-001, September 16, 2026. Inventory
details and routine-audit migrations applied as 20260916132528 / 20260916132537,
after document tags 20260916132523. Live rollback-only storage/move/quantity,
compatibility, routine-audit, replay, document and permission checks pass.
Publication is tracked in SYNC_STATUS.md; earlier local-only notes are historical.

Production: source 829b94a0c85c8285a99b712ca00fd3c5892baf3a, Netlify
6aaa9b15689e8b0008b7c9f5, published September 16 at 13:35:44 UTC. Live HTML
and all 15 assets match the tested build. Existing security-advisor findings
remain outside this release; only the intended tags RPC adds an authenticated
security-definer entry (storage creation's signature is replaced, not duplicated).
Real-account acceptance is still required; no signed-in user workflow claimed.

## Storage workflow

- Add Storage Location now exposes type, parent/department, code, name, sort
  position (children), physical location, and materials/purpose in one form.
- Units keep their physical location. Children default to the nearest ancestor's
  nonblank location. Uncheck “Use parent physical location” for an explicit value.
- Blank physical_location is the inheritance marker in the existing column.
  Display resolution follows parent edits/moves; no copied descendant values,
  backfill, new location table or changed QR identifiers. Explicit child values
  remain untouched. Materials/purpose is specific to each location, not inherited.
- Creation writes all details and its audit atomically. The existing eight-argument
  API remains callable through the new ninth argument's default. Request replay
  checks include details. Existing duplicate, department, archived-parent,
  concurrency, child/stock archive and deletion protections remain.
- QR label exports use the effective location; generation/size/printing remains
  in the existing QR tools after a location has been saved.

## Reason policy applied

No typed reason for storage create/edit/move/archive/restore, material aliases,
material-to-bin mapping, zero-balance assignment retirement, ordinary document
metadata/archive/restore, tool catalogue metadata/archive/restore, job/estimate/
service-call soft archive, schedule archive, job assignment, pending-employee
archive, service-stage label/color, permit-register changes, and draft-inspection
assignment/link/new service call.

New default-User employee setup and contact-detail changes are routine. Elevated
role grants and changes to an existing role, department or linking email retain
explicit reasons, including server-side enforcement against stale clients.

Audits are not optional. The server substitutes a clearly labeled automatic
operation note where legacy helpers require a nonblank note, keeping existing
actor/time/snapshot writes in the same transaction. Explicit notes from older
clients remain intact. This does not fabricate a user-entered justification.
Confirmations, permission checks, stale-version checks and source restrictions
are retained; shared ConfirmDialog defaults are not globally relaxed.

### Retained high-risk gates

- permanent deletion: existing Developer authority, reason, initials, backup and
  dependency checks;
- inventory corrections/ledger-affecting actions and Developer data correction;
- role/permission/account-identity changes;
- original/protected budgets, SOV/billing corrections, voids, financial posting,
  buyout awards/commitment-affecting archives and controlled financial revisions;
- CO approval evidence, denial/reopening/voiding, and signed/source-controlled
  document mutations; classification-only tags use the separate pending tag RPC;
- issued technical records, evidence changes, review/revision and duplicate-source
  overrides. These are not ordinary catalogue edits.

No arbitrary dollar threshold was introduced. Existing protected financial
boundaries are preserved. New workflows must follow this policy rather than
requiring reasons just because the action is called “edit” or “archive.”

## Pending migrations and release order

1. 20260916112115_document_organization_tags.sql — prior-turn document tags.
2. 20260916125643_inventory_creation_details.sql — replace the create RPC
   signature with a backwards-call-compatible default details argument; preserve
   grants and all existing data. Stop if unexpected function dependencies exist;
   never use CASCADE.
3. 20260916125644_routine_audit_notes.sql — explicitly enumerated 17 routine
   RPCs, conditional hi_action handling, and two employee-profile RPCs.
   Preserves current function security/search paths/grants and core validation.

Recheck live schema/functions for other-machine changes before application. Apply
and verify database changes before deploying the frontend; otherwise the old
server will still demand reasons or reject the new creation argument.
No destructive data migration, RLS relaxation, permission grant, or backup
automation is included.

## Verification

- 119 unit tests pass, including inheritance/moves/explicit overrides and risk
  policy exemptions with protected/delete/unknown actions still gated.
- Inventory SQL fixture: existing hierarchy, stock/ledger, scope, deletion and
  correction regressions; new creation details/replay, reason-free lifecycle,
  actor/snapshot audit, validation, stale rejection and audit-failure rollback.
- All 20 inspected production RPC definitions load and transform in isolated
  PostgreSQL with execute grants/security/search paths preserved. Employee
  routine versus identity/access cases are executed, not just inspected.
  Other RPC definition loading is not a claim of full business-flow execution.
- 58 inspection database checks pass with reason-free register/link/create-call
  paths, retaining immutable issued records, scope, retry and rollback behavior.
- Existing 40 AFC checks and 33 pending document-tag checks pass.
- Browser fixtures: storage creation/inherited details, storage moves/lifecycle,
  ordinary document edits/archive/restore, and tool catalogue on desktop, tablet
  and phone. Failure/retry/cancel paths and overflow checks pass. Creation and
  storage screenshots visually inspected.
- Production-configured local build passes:
  .temp/inspection-production-check-1789564506378.
  Existing large-bundle/XLSX split warnings remain.

Browser transport is mocked and PostgreSQL tests are isolated. No live-account
acceptance, production migration, or truly concurrent multi-session race test
was performed in this local-only pass.

## Backups

Deferred to backlog at Ryan's request. No schedule, export, purchase or restore.
Existing per-object permanent-deletion safeguards remain; deferring a weekly
backup system does not remove those safeguards.
