# Clean User Views and Developer Diagnostics

September 6, 2026. Production Mode presentation cleanup.

## Default Experience

All users, including developers, see clean operational views by default.
Developer Console > Overview > Developer UI visibility > Show developer diagnostics
reveals implementation descriptions, source labels, permission summaries, and
boundary notes. The preference is local to the browser and defaults off.
Only server-confirmed Developer access can activate it. A saved preference alone
does not enable diagnostics for an ordinary user.

This replaces the inverted Hide development-only UI toggle. Highlighting incomplete
work remains a separate developer preference and does not make diagnostics visible.

## Component Rules

- WorkspaceHeader descriptions are diagnostic introductions by default. Use
  descriptionIsDiagnostic={false} for operational descriptions that must remain visible.
- Toolbar and RecordHeader descriptions remain visible unless explicitly marked
  descriptionIsDiagnostic. Never mark user-entered record descriptions as diagnostics.
- SummaryCard developmentOnly hides the entire diagnostic card. detailIsDiagnostic
  hides only technical supporting text while preserving the business value.
- StatePanel suppresses non-actionable development/boundary notes in normal views.
  Errors, warnings, panels containing actions, and panels with children remain visible.
- PrimarySidebar introductions, item descriptions, and implementation footers are
  diagnostic; navigation labels and badges remain usable.
- Hide unauthorized action buttons with their existing permission predicate. Keep
  authorized buttons disabled during saving, validation, or other temporary restrictions.
  Server authorization remains unchanged; browser visibility is not a security boundary.
- Page Menu is a mobile drawer control, hidden when desktop navigation is already
  present. Employees omits the sidebar and menu when only My Information is available.
- Empty diagnostic-only grids collapse rather than leaving blank space.

## Coverage

Shared components apply these rules across the app. Explicit annotations and action
visibility were reviewed in Employees, Vehicles, Tools, Jobs, Estimates, Inventory,
Documents, Accounting, Dashboard, and Developer Console. Reports and other modules
also inherit shared header, sidebar, and development-panel behavior.

Employees specifically hides the visible-contact header count, My Profile / Manage
Employees / Read Scope diagnostics, profile and role source cards, four boundary
notes, and technical Email / Current Vehicle subtitles. Profile editing, contact
data, vehicle information, personal notes, tasks, and actionable error states remain.

## Verification

- Full Vite build using the existing local environment passed.
- Seven existing Node tests passed; git diff --check passed.
- scripts/verify-ui-cleanup.mjs renders the real Employees component with isolated
  auth/data fixtures at desktop, tablet, and phone sizes. It covers user/manager/developer
  visibility, preference gating, diagnostics toggling, employee creation visibility,
  mobile Page Menu selection, profile form inputs, retained audit reasons, error
  panels, financial values, temporary disabled actions, and horizontal overflow.
- Permission-template browser regression suite passed after the shared UI changes.
- Browser fixtures do not perform production data writes. Authenticated acceptance
  across every live module remains a user smoke check rather than a claimed automated test.

## Production Smoke Check

1. As an ordinary user, refresh Employees and confirm profile data remains without diagnostics.
2. As a manager, verify Create employee and mobile Page Menu remain available.
3. As a developer, toggle Show developer diagnostics, visit Employees, and verify
   the diagnostics appear only while the toggle is enabled.
