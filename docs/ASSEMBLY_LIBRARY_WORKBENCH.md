# Assembly Library Workbench

Status: migration applied after Ryan explicitly approved its shared schema and
permission-policy changes. UI release is prepared for publication.

## Approved Scope
- Migration 20260914002830_workbench_assembly_library adds stage, fixed quantity,
  missing-price and missing-labor fields to existing assembly_items.
- Existing can_estimate and division edit permissions remain in force.
- assembly_items SELECT policy allows the same scoped readers to read archived
  component rows so soft removal can pass UPDATE checks. Application library
  queries continue filtering archived rows. No new divisions/users gain access.
- Trigger-only audit writers run with elevated audit-table privileges; callers
  cannot invoke them directly. Existing and new assembly editors are covered.
- The new SECURITY INVOKER save_workbench_assembly RPC atomically saves the
  library, estimate and optional existing catalogue changes. Editing a library
  directly does not offer shared catalogue updates in this pass.
- Old editor duplicate client-side assembly audit calls are removed in the
  companion UI change. Deploy this UI only after the migration succeeds.

## Workflow
- Work item: Project only, with an optional named copy to assembly library.
- New copies exclude project-specific notes, markup and project item quantity.
  Components retain unit quantities, stages and scaling.
- Assembly library: Create assembly or Edit assembly, with scope/component notes.
- Existing estimate copies are independent; linked catalogue values refresh
  when an assembly is added to an estimate, not when its library row changes.
- Refresh library fetches current shared values. Reopening an estimate also
  replaces its cached library list with the current list.
- Removal soft-archives omitted components and records before/after audit data.
- updated_at conflict checks include old-editor component changes.

## Validation
- 26 Node tests and build pass.
- Browser fixture covers create/copy/edit/reuse, notes, stages, project/catalogue
  save regression and layouts at 1440, 768 and 390 pixels. Transport is mocked.
- Local PGlite Postgres runs the real assembly schema/policies and migration;
  tests creation, editing, soft removal, denied edits, stale conflicts, and
  rollback on draft-save or audit failure. Auth helpers and draft RPC are stubs.
- Reproduce database tests with a local-only install:
  npm install --prefix .temp/assembly-db --no-save @electric-sql/pglite
  node scripts/verify-assembly-library-db.mjs
- No production fixtures or real customer records were created by these tests.

## Release Verification
- Live fields and function privileges verified: audit trigger is not directly
  callable by clients; the save RPC is invoker-only and unavailable anonymously.
- Local database tests, 26 Node tests and three-width browser checks passed.
- Signed-in acceptance: copy a work item to library, create/edit an assembly,
   reuse in another estimate, verify audit and an ordinary user's permissions.
