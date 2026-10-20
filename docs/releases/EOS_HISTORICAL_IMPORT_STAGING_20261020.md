# Historical scorecard bulk import — Staging only

Defined-outcome Production Mode; deployment target is Staging. Isolated checkout and branch `codex/staging-scorecard-bulk-import` started from `origin/staging` `ae8fcbc`, including the deployed category fix `075aec6`. Production, Dropbox checkouts and paused Mini jobs/Toro work are outside this release.

## Contract

The Historical bulk import panel provides a dedicated CSV template and an existing mapping reference. The existing shared round-trip CSV editor remains disabled. Historical imports are insert only. No metric/category/definition/owner/goal is inferred or created. Initialize missing historical definitions using the normal reviewed metric editor first. Owner remains optional and goal nullable.

All calls use the signed-in EOS store and three versioned RPCs: preview, apply and receipt. The normal active EOS membership predicate is checked on every operation, including receipt/retry after membership revocation. The server retains the source payload and preview by actor and opaque UUID; only the UUID is retained on the browser device. Unknown/malformed IDs are rejected before UUID casts. Strict columns, dates, Monday anchors, explicit historical effective definition/category/unit, finite numeric/count/percent values and explicit percent scale are validated server-side. Source meeting dates remain separate from anchors and existing canonical meeting dates. Blank actuals are held; zero remains an actual. Comments, provenance and review-needed/reviewed status are preserved in observation notes and immutable import audit.

Preview performs no scorecard business writes. It expires after 30 minutes. Apply serializes on the existing scorecard clock and revalidates the complete stored payload; any intervening normal scorecard write invalidates it. One bad row prevents the entire batch. Existing metric/week observations and already imported source cells are held, never overwritten. Held rows are excluded from the explicit ready count. Source identities and metric/week identities must be unique within the file. Limits: 2,000 rows and 4 MB per batch.

Apply calls existing guarded period/observation RPCs inside one database transaction. The import receipt, source dedupe ledger and immutable audit commit with observations. A disconnect has an uncertain outcome until receipt recovery or retry with the same import ID; successful retry returns the exact original receipt even after later edits/expiry. No direct admin import, policy/eligibility expansion or service-key client path exists. No existing scorecard functions or grants are replaced.

## Verification

- Full explicit test inventory: 361 pass, 1 existing skip, 0 failures (362 total). Bare `npm test` is avoided because repository browser fixtures start servers during discovery.
- Disposable PostgreSQL/PGlite: strict validation, missing/malformed metric/category/definition IDs, historical effective dates, source dates, blanks versus zero, explicit fraction scaling, invalid scales, duplicate rows, existing/manual observations, repeat sources, conflicting/stale/expired previews, mixed ready/held files, interrupted transaction rollback, lost-response receipt replay, actor isolation, membership revocation and direct private table denial.
- Representative 1,051-observation synthetic batch, exact retry and second-file held deduplication passed without double counting.
- Transactional migration rollback and forward disable/re-enable recovery preserve existing function hashes, records, audit and exact receipts. `docs/releases/sql/eos_historical_import_disable.sql` disables only the new writers and leaves receipt recovery available.
- Desktop 1440/mobile 390 component verification passed: review rows, explicit apply, zero/blank, lost response, recover receipt, disabled completed Apply and no horizontal overflow. Screenshots inspected under `.temp/import-qa/`.
- Local build passed with synthetic public staging configuration, never deployed. Existing bundle/xlsx/node module warnings and five pre-existing high dependency findings remain; dependencies/lockfile unchanged.

Reproduce with locked `npm ci`, explicit Node test globs, then disposable QA tools installed under `.temp/qa` (`@electric-sql/pglite@0.5.10`, `playwright@1.64.1`). Run `scripts/verify-scorecard-import-db.mjs` and `scripts/verify-scorecard-import-ui.mjs`. The UI script uses installed Edge. No source workbook/client records were added to this change or fixtures.

## Deployment checkpoint

Staging migration/deploy receipts and signed-in desktop/mobile evidence will be appended after verification. Before migration, existing scorecard counts: metrics 4, definitions 4, categories 3, observations 2. Initial Production deploy `6ad69040e21f5c2ab1335be8`; Staging deploy `6ad74d5a46c831e1502367dd`.

Full customer history import remains paused. Synthetic verification does not imply user review of historical mappings or authorize Production promotion.
