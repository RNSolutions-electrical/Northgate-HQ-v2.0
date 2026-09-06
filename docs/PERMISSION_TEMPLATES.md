# Permission Templates

Production Mode scope, September 6, 2026.

## Behavior

- Developer Console > Access Control now edits named permission templates.
- Existing role/department defaults were seeded as 20 named templates, including
  Unassigned department defaults. Initial permissions are identical to the previous resolver.
- Templates have case-insensitive unique names, can be created, renamed, edited,
  or duplicated, and remain linked to their users.
- Users inherit their role/department default unless explicitly assigned a template.
- Individual overrides take precedence over template permissions. Removing a user's
  template assignment returns them to role/department defaults; overrides remain unless cleared.
- Template checkboxes and user override selections are drafts. Save opens the shared
  audit-reason dialog. Canceling the dialog retains the draft and writes nothing.
- Each successful save is atomic and records one permission_change audit entry with
  before/after values, actor identity from the JWT, and the required reason.
- Template version checks and expected user-state checks reject stale saves.
- Developer-console access remains role/legacy-access controlled and is not editable
  through a template. Developer users remain protected from individual override assignment.
- Existing profile editing and long-term override review remain available.

## Database

Migration: `20260906142923_permission_templates` on `keogysnoukbendfkfjcn`.

`permission_templates` stores names, boolean flags, default role/department bindings,
versions, and update attribution. `user_permission_templates` stores explicit assignments.
Both tables have RLS and deny direct browser access. Reads/writes use authorized RPCs.

`effective_permissions_for_user` remains caller-scoped. The developer console uses
the new target-scoped `permission_template_base_for_user` for each user's base, with
explicit self/developer authorization. No caller JWT substitution is used for target audits.

The existing override constraint now includes the three financial flags already
present in the UI and canonical defaults.

Server-side access checks use updated templates on the next request. An already-open
client may need a refresh to update its cached navigation/permission display.

## Validation

- Migration rehearsed with all original role/department defaults compared before/after.
- `tests/permissionTemplates.sql` passed before and after migration. Wrap the file in
  BEGIN/ROLLBACK when running it; its synthetic users, edits, and audits must not persist.
- Covered required reasons, unique names, invalid flags/types, stale versions, stale
  user state, live inheritance, override precedence, clearing overrides, default edits,
  target-specific console results, Developer protection, and unauthorized/direct access.
- `scripts/verify-permission-templates.mjs` uses isolated browser fixtures, not real users.
  It checks draft editing, save-time reasons, cancel behavior, atomic payloads, error
  recovery, and desktop/tablet/mobile overflow. Set PLAYWRIGHT_MODULE and optionally
  PLAYWRIGHT_CHANNEL to the installed browser tooling.
- Full production build and seven existing Node tests passed.
- Security advisors added only the four expected authenticated SECURITY DEFINER RPC
  notices. Each RPC has a fixed search path and explicit caller authorization; new
  functions deny anonymous execution. No new RLS or search-path findings.

## Release Check

1. Open Developer Console > Access Control and duplicate a template with a unique name.
2. Change several checkboxes; verify no reason is requested until Save Template.
3. Cancel the reason dialog, reopen it, enter a reason, and save.
4. Assign the template to a test user, retaining an individual deny override.
5. Edit the template and confirm that user inherits the change while the deny remains.
6. Confirm before/after values and the reason in the audit export.

Authenticated production UI acceptance remains Ryan's final check; automated UI tests
use isolated fixtures and database verification runs in rolled-back transactions.
