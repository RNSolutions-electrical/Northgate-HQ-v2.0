# Estimator catalogue integration

Production Mode, September 13, 2026. Scope: connect the reviewed new estimator
interface to the authenticated app, catalogue and persistent drafts. The isolated
estimator-prototype remains unchanged and is not a production data client.

## Access and storage

- Existing Estimates has a New estimator link at /estimates/workbench.
- Clerk supplies the existing Supabase JWT. No service key or extra permission
  is shipped to the browser. Existing can_estimate and division rules govern
  draft writes; existing can_edit_catalog and material division rules govern
  shared catalogue updates. Read access uses existing estimate permissions.
- New drafts have estimates.editor_version=2 and a versioned JSON document in
  estimate_workbenches. This is an incremental editor integration, not a migration
  of legacy pricing/quote records. Existing directory queries remain version 1.
- The reviewed editor is isolated in a same-origin iframe through a React portal
  to avoid global CSS collisions with Jobs and Inventory. It is not a separate
  authenticated service and never receives credentials through messaging.
- Full active estimating catalogue is paged in 1,000-row batches. Existing
  assembly library definitions are paged and copied into new drafts. Adding a
  catalogue-linked assembly refreshes its linked prices/hours, but existing
  estimate entries are never silently repriced.
- Save estimate persists overview, sections, entries and quotes. Save changes
  in a work-item editor persists the entire draft plus that work item. Failures
  retain input; version conflicts require reopening and reviewing saved data.
- Closing/reloading warns about unsaved edits; sidebar links also warn.
  Browser history navigation protection still needs a router-wide solution.

## Catalogue workflow

- Project only saves snapshots without modifying items.
- Project + catalogue patches only edited nonblank numeric price/labor fields.
  Blank is omitted, zero is valid, conflicting duplicate material values and
  changed units are rejected. Custom lines never create catalogue records.
- Source estimate, user, timestamp and actual before/after records are audited
  automatically. There is no reason prompt for routine pricing/labor updates.
- save_estimate_workbench and save_material_catalogue_values are invoker RPCs.
  Existing items RLS remains unchanged. Restricted definer triggers write audits
  atomically; public/anon/authenticated cannot execute the audit helpers directly.
- A stale catalogue timestamp or failed audit rolls back the entire save.
- price_confirmed distinguishes historical unknown zero from explicitly saved
  zero. Nonzero historical prices were marked confirmed without changing amounts.
  Existing labor is unverified; manually saved hours are labeled internal.
  No claim is made that manually entered labor is published NECA data.
- Existing estimator Update Master Price now uses the same reason-free atomic
  RPC rather than separate item/audit writes.

## Boundaries / next work

- New editor remains draft-only. Approval, conversion, document attachments and
  legacy quote/pricing projection are not connected. A server header guard blocks
  accidental approval/conversion of editor-version-2 drafts through legacy paths.
- New reusable assembly copies remain within the draft. Shared library writes,
  shared template management and real price-history indicators require follow-up;
  template/price-history controls are disabled rather than presenting sample data.
- PDF/CSV exports remain draft-marked. Missing price/labor contributes zero to
  provisional totals and is visibly flagged; review before bidding.
- Full cutover must preserve legacy snapshots and define normalization of this
  editor document into existing operational tables before enabling job conversion.

## Validation

- Applied migration 20260913164527_estimate_workbench_catalogue through the
  controlled Supabase migration endpoint.
- Initial synthetic rollback tests passed: project/shared saves, actor/source
  audit, zero/partial patches, stale draft/material, denied caller, direct-write
  protection, helper ACL, and injected audit-failure atomic rollback.
- Zero test users/materials/estimates remained after the accepted test run.
- The later expanded normal-user / wrong-division rollback test was blocked by
  the safety reviewer and has NOT been run. tests/estimateWorkbench.sql contains
  that expansion. Do not rerun it in production without explicit approval.
- 24 Node tests; production build; actual WorkbenchRoute with mocked transport
  at 1440/768/390: full 1,615-item pagination, search, project/shared saves, failed
  save input retention, versioned reopening and horizontal-overflow checks.
- Browser tests are not a claim of signed-in production-user acceptance.
- StrictMode workbench checks and existing Jobs/Estimates document maintenance
  browser regression checks also passed.
- Security advisor groups/counts unchanged: 6 + 4 + 6 + 13 + 117 findings.

## Separate security backlog

Existing dependency audit reports four high-severity package groups: Clerk React,
React Router, React Router DOM and SheetJS. None is introduced by pdf-lib 1.17.1.
Review relevant advisories and upgrade with auth/navigation/import regression
tests in a dedicated security pass. No forced dependency upgrades were performed.

Sync marker: ESTIMATOR-CATALOGUE-20260913-001.

Production feature release: commit 5983e4025ee07b1bf58e413d60bf5fe8df5c1c26,
Netlify deploy 6aa6d5ac4aadce00085de1c8. Ready, secret scan clean, public route
and main/workbench JavaScript MIME/content checks passed.
