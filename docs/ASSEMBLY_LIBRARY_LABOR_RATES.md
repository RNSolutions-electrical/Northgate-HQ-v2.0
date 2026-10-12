# Assembly Library labor rates

Prepared locally on Ryan_Northgate from branch `dev-eos-pursuit-tracker-20261006`,
HEAD `8f4e4b8`. The active Dropbox checkout and its Git metadata were not edited.
The implementation is in an isolated copy under the delegated task directory.

## Behavior

Each division has an Assembly Library default hourly rate. Library settings use
the existing `can_edit_catalog` authority; editing individual assembly overrides
uses the existing division `can_estimate` authority. Settings readers use the same
estimating/approval permissions as assembly readers. Library queries are scoped to
the selected division so an assembly inherits its own division's default.

Pricing precedence is work-item override, estimate override, saved library
assembly override snapshot, then saved library default snapshot. Zero is valid;
null represents inheritance. Library assembly editing and lists display the live
library rate, while estimate pricing, reports, approval and handoff use snapshots.

Legacy estimate `rate` values remain explicit estimate overrides. Existing work
item overrides remain intact. Opening or refreshing the library does not reprice
existing estimates. New estimates inherit the shared default; adding a library
assembly captures its override and source identifier. Clipboard/template copies
retain rate metadata. The library CSV includes its saved hourly override.

Reset clears the explicit override and exposes the next inherited rate. Overview
offers an explicit snapshot refresh with before/after estimate totals and Cancel.
Applying it changes the draft; Save Draft persists it. Explicit overrides remain.
Missing or inaccessible assembly sources retain their previous snapshot. Approved
and submitted/read-only estimates cannot refresh. An editable revision is required.

## Schema and rollout

`20261012220350_assembly_library_labor_rates.sql` adds the division settings table,
nullable assembly hourly override, numeric validation, optimistic settings-save RPC
and atomic audit trigger. It updates library saving, structural validation and both
server pricing paths. Existing internal endpoint ACLs remain restricted.

The migration preserves the verified code default of $75/hour. No estimate or
approval document is rewritten; $67 is not introduced as a default. No existing
separate configured library default was present in the inspected code. During the bounded release review, staging schema/function metadata was read;
no business records were queried or changed. See ASSEMBLY_LIBRARY_LABOR_RATE_RELEASE_REVIEW.md.

Apply and validate the migration in an authorized staging rollout before deploying
this UI. The UI requires the new schema. Verify the current production/staging
function definitions against this checkout before rollout because those deployments
may differ. Preparation and review performed no shared writes. Ryan subsequently approved
Staging only. The reviewed SQL was applied to staging ref fazfwzbuesvzhgodckiw
as ledger version 20261012223850 / assembly_library_labor_rates. The build targets
that isolated branch and the dedicated northgate-hq-staging site. Production and
the active Dropbox checkout remain unchanged; final deploy identity is recorded
in the delegated task rollout record.

## Local verification

- 300 named Node tests across `test` and `tests` passed, including 10 new rate tests.
- `scripts/verify-labor-rates-db.mjs` passed in isolated PGlite: defaults, override
  and reset persistence, hierarchy and zero, client/server approval/handoff parity,
  stale settings, invalid input, division permissions, anonymous denial, immutable
  legacy approvals, absence of silent repricing and atomic audit rollback. It also
  runs the existing estimating workspace database integration checks.
- `scripts/verify-labor-rates-ui.mjs` passed with a separate headless Edge profile,
  localhost-only fixtures and external requests blocked. It covers cancel/save,
  reload, zero/reset, unchanged saved estimates, cancelled/repeated refresh and
  screenshots at 1440, 768 and 390 pixels.
- The existing estimating workspace browser regression passed after updating its
  stale catalogue-field selector to the label already present in baseline code.
- Vite build passed with isolated development fixture configuration. This is a
  compile check, not a deployment bundle. Existing chunk-size and mixed static/
  dynamic XLSX import warnings remain.
- No lint or typecheck scripts are configured in `package.json`. Bare `node --test`
  also discovers browser fixtures and was stopped; the complete named test suite
  was run explicitly instead. Live release checks were not run because rollout
  was not authorized and DNS resolution was unavailable in the shell environment.

Headless Edge initially failed to create its profile inside the filesystem sandbox;
the same isolated checks succeeded with automatically approved local execution.
