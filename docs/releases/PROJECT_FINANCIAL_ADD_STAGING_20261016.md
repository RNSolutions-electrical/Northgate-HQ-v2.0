# Project Financials Add Financial Line — Staging, 2026-10-16

Ryan authorized the diagnosed fixes and Staging publication at 19:08 UTC. Production publication is not authorized. No schema migration or business-record mutation is part of this change.

## Cause and bounded fix

The top Add Financial Line action scrolled to a legacy form permanently hidden by CSS. That form also had no project-division selector, while new financial saves require a project division. Existing division Add Line buttons were generated only from financial rows, so an empty budget had no working manual-add entry. Finally, inline creation suppressed the visible error panel; errors and success were otherwise displayed inside the hidden legacy form.

The top action now reads active divisions for the selected job through the existing authenticated client and opens a division picker. Choosing a division calls the existing inline Add Line workflow and focuses Description. This also supports an existing division with no financial rows. Missing divisions produce setup guidance; denied/failed reads produce visible errors and can be retried by reopening. Adding is disabled while an inline create/edit/save is active, so repeated clicks cannot replace that draft. Cancellation resets the draft using the existing handler.

Financial save feedback now appears in a visible, focused alert/status region and is scrolled into view. Rejected saves retain the entered draft. Existing save validation, financial batch RPC, protected-field reason checks, contributor proposal/save/submit routing and server authorization remain unchanged. No financial amounts are recalculated by this patch.

## Source preservation

The isolated investigation began at Production receipt `ac89a3020266a06bb11585385bf64679b70f98a6`. Product/test commit `0af599b` was cherry-picked as `cdb64c0` onto current Staging receipt `7f82168b146898c41ed7d5ec8d931269c2dfd52d`, not merged wholesale from main. Staging's combined review-scroll/approval code `8c2705bd5e838e1fcff2cb0283722827fb7c7338` remains an ancestor. No estimating source, migrations, Netlify configuration, dependency versions or permission rules changed.

## Verification

- `node --test tests/*.test.js tests/*.test.mjs test/*.test.js`: 336 passed, 1 skipped, 0 failed (337 total). Unbounded `npm test` discovers a browser-serving harness and remains running, so the bounded named-test invocation is used.
- `scripts/verify-financial-add.mjs`: seven synthetic scenario groups, at 1440x1000 and 390x844, with external requests blocked. Covers active/current-job-only division reads, multiple divisions, empty financial rows, no divisions, denied division read/reopen, cancellation/reopen, repeated top clicks, Save double click, rejected save/retry, visible focused feedback, preserved draft/amount, unchanged pre-existing financial row, and contributor proposal routing without direct official writes. A no-financial-access viewer has no Financials action. No browser exceptions.
- `scripts/verify-financial-workflows.mjs`: existing override/reset, protected reason, cancelled reason and failed-save draft preservation pass on desktop/tablet/phone. Its obsolete pre-v5 non-approver read-only assertion now checks existing contributor access with zero direct financial writes; product permissions are unchanged.
- `scripts/verify-estimate-review-scroll.mjs`: unchanged Staging review-scroll behavior passes at 1440 and 390 widths, including resize, horizontal table, proposal modal/back, unchanged synthetic source data and no mutation RPCs. Outer height remains 900px at a 900px viewport.
- Combined source Vite build passes using explicit synthetic build-only public settings and isolated Staging backend identity. Those dummy keys are never deployed. Existing node:fs externalization, xlsx and chunk-size warnings remain. The configured Netlify build supplies real target configuration without exporting environment secrets.
- `git diff --check` passes. Synthetic browser evidence/screenshots: ignored `.temp/financial-add-qa/`; original unchanged-source reproduction: `.temp/financial-add-investigation/`.

A diagnostic full-page screenshot immediately before the phone Save click disturbed that automation step. The final test captures the picker and feedback states, and tests Save without an intervening full-page capture. The normal phone interaction then passes.

## Deployment gate and limits

Target is only Staging site `431ce717-1a06-45a0-9d7a-8acd06a67dde`, https://staging.rnsolutions.net, isolated Supabase ref `fazfwzbuesvzhgodckiw`. Before publication, the site reports ready deploy `6ad2658ee08657389e961653` for `8c2705b`; remote Staging is its receipt follow-up `7f82168`. Re-fetch and require a fast-forward immediately before pushing.

Automatic approval review rejected an all-environment-variable read because it could expose unrelated secrets. No workaround was attempted; use the site's existing Git build configuration. No new credentials or permission grants are required for the local fix.

Live authenticated business-action acceptance remains Ryan's review: all financial creates/updates and rejection tests used synthetic local data. No real project financial line was added or changed. Production/main and the separately pending review-scroll approval remain untouched by this release. Append the exact Staging deployment receipt after Netlify confirms publication.
