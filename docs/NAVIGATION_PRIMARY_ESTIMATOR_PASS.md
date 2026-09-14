# Navigation and Primary Estimator Pass

Status: Ryan approved the Supabase changes. Migration applied and live permissions
verified; companion UI prepared for publication.

## Changes
- Desktop hover reveals navigation options. Label clicks use a default target;
  separate disclosure arrows support touch and keyboard users.
- Defaults: material inventory, jobs, the user's estimate division, own employee
  profile, own assigned vehicle. No assignment displays an empty assigned view.
- Add-On Tools has a permission-filtered dashboard at /add-on-tools.
- /estimates becomes the new estimator. /estimates/workbench remains valid.
  The old implementation remains behind /estimates/legacy and existing wildcard
  routes; it is omitted from normal navigation. The dashboard approval queue
  deliberately retains its legacy route dependency.
- /estimates/assemblies is a standalone library, with create/edit, reason-required
  archive, and active/readable library CSV export. No dummy estimate is created.
- Estimate directory reads and creation use the selected/default permitted division.
- Assembly fields align with the labor-hours reference.
- Shell navigation checks unsaved editor changes before leaving.

## Approved Migration
20260914010605_standalone_assembly_library:
- Extracts the existing assembly save into SECURITY INVOKER save_assembly_library,
  usable without an estimate. The previous combined estimate save remains atomic.
- Adds SECURITY INVOKER archive_assembly_library, with required reason, existing
  can_estimate/division permissions, stale-edit protection and existing audit.
- Allows the same scoped readers to SELECT archived assembly rows so soft-archive
  UPDATE checks can succeed. Active application lists exclude archived rows.
- No customer estimates are migrated and no job conversion/approval is enabled.

## Validation
- 27 Node tests passed, including CSV quoting and formula-injection protection.
- Local Postgres tests passed for standalone create/archive, required reason,
  permission denial, conflicts and audit/draft rollback. Auth helpers are fixtures.
- Browser fixture passed existing estimator regression plus standalone save,
  archive, CSV download, aligned fields, desktop hover and mobile default targets.
- The browser backend is mocked; signed-in production acceptance is still needed.

## Acceptance
- Live save/archive functions verified as SECURITY INVOKER, authenticated-only.
- Security advisors reported no new findings against the pre-migration baseline.
- Test defaults with a real assigned-vehicle user, division selection, standalone
   library edits/archive/export and preserved legacy approval links.
