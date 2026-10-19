# Financial Remaining Budget and division labels — Staging, 2026-10-19

Ryan approved a consistent actual Remaining Budget display on Staging and subsequently added the Division 07 spacing issue and a focused financial-line creation/import/aggregation review. Production promotion, stored-data correction and forecasting redesign are excluded.

## Behavior and source preservation

The job summary now includes **Remaining Budget**, and division headers calculate the same signed **current budget minus actual costs** as their expanded rows. Toro's split-line case is $5,500 original/current budget on `04.1`, $6,729.59 actual on zero-budget `04.11`, both completion forecasts zero: actual remaining is **-$1,229.59**, while the separately labeled **Forecasted Remaining Budget** remains **$5,500.00**. Forecast edits do not change actual remaining. Currency subtraction uses cents to avoid false positive/negative zero from floating-point sums. Negative remaining is red; a zero remaining balance is neutral. Zero/negative-budget overspending is classified over budget without a percentage denominator. Dashboard's existing classifier behavior remains unchanged through an explicit Financials-only option.

`currentBudget.js` is unchanged: explicit zero/positive overrides retain precedence; otherwise original plus manual changes plus net approved CO postings/reversals determines current budget. Forecast fallback/zero semantics, billing-line identities, financial writes, permissions and RPCs are retained. No balancing lines, transfers, forecast autofill/clamp, postings, migrations, auth/configuration/dependency changes or live business-record edits are included.

Read-only inspection found the exact catalogue name `Thermal&  MoistureProtection` in both environments. SQL template creation copies that stored value into job divisions and generated CO descriptions. The cost-report importer reads codes and amounts and does not rewrite descriptions. The built-in template/fallback name was already correct. A shared formatter now displays the known Division 07 alias as **Thermal & Moisture Protection** across linked/unlinked headings, manual division picker, catalogue/template picker, cost-report preview, generated CO labels, Billing and financial exports. Future catalogue workbook imports/export also use this targeted correction. Custom labels and arbitrary internal whitespace are preserved; editing or saving another field does not silently rewrite a stored description.

When canonical linked/unlinked rows share a displayed group, it retains a real linked division and its metadata for Add Line even if the first row is unlinked. No row is relinked. Existing aggregation-by-display-label behavior is preserved rather than introducing a new financial allocation model.

The isolated checkout starts from current Staging **c670ab1abb42d833f90cc3ad5e1af8f3998f7dbe**. Existing Add Line, estimate review-scroll/approval changes and the Staging CO timing migration remain ancestors. Earlier working copies and unrelated connector/repair work are untouched. No wholesale merge from main is used.

## Verification against final product code

- Explicit aggregate: collect all `*.test.js`/`*.test.mjs` directly under `tests/` and `test/`, plus named tests recursively under `src/`, then `node --test` those paths: **363 total, 362 passed, 1 skipped, 0 failed**. This avoids the unbounded browser-serving harness discovered by plain `npm test`.
- `scripts/verify-remaining-budget.mjs`: **40 scenario groups**, desktop 1440x1000, tablet 768x1024, phone 390x844. Real Jobs component; only auth/backend modules mocked; external requests blocked. Covers exact Toro amounts, moving costs within a division, credits/negative actual, zero and negative budgets, negative manual/CO adjustments and reversals, zero/positive overrides, decimals, empty/archived/other-job rows, multiple divisions/job reconciliation, collapse/expand, independent saved forecast edit, negative red/over-budget state and finite percentages. Canonical linked/unlinked/generated Division 07 labels, Add Line with first unlinked row, unchanged original stored labels/amounts, custom manual description, template selection and cost-report preview pass. All intentional writes are confined to synthetic fixture memory.
- `scripts/verify-financial-add.mjs`: seven scenario groups pass on desktop/phone, including denied reads, empty budgets, rejected saves/retry/draft retention, duplicate-click protection, contributor proposals and no-access permissions.
- `scripts/verify-financial-workflows.mjs`: existing current-budget override/reset, protected reason/cancel, rejected-save retention and contributor access pass on desktop/tablet/phone.
- `scripts/verify-estimate-review-scroll.mjs`: preserved Staging desktop/phone/resizing, horizontal table, proposal preview/back, read-only/unchanged-source checks pass.
- Final synthetic Staging-identity Vite build passes. Dummy public build keys are used only locally and never uploaded; the Git-connected Staging build supplies its existing target configuration. Existing xlsx mixed-import/chunk-size warnings remain.
- `git diff --check` passes. Desktop/phone screenshots visually reviewed. Ignored evidence: `.temp/remaining-budget-qa/`, `.temp/aggregate-tests.txt`, `.temp/build-check.txt`, plus existing workflow suite outputs.

## Stored labels and limits

No stored name was corrected. Read-only affected-record inventory: **each environment has 12 catalogue rows and 2 job divisions** with the known alias. Only each catalogue's top `07` description also contains the alias. Production has two generated `07.CO` descriptions; Staging has two top `07` descriptions. Exact IDs, job IDs, code and current text are recorded locally in `.temp/DIVISION_07_STORED_LABEL_REVIEW.md` and `.temp/division-07-affected-records.json`, rather than publishing customer-specific repair data in the repository.

The existing SQL template function will continue persisting the stored catalogue spelling until a separately approved, audited, expected-value-guarded catalogue correction. Display is consistent in this patch; stored data is not claimed repaired. Existing customer division-link reconciliation remains a separate reviewed plan. This focused review does not assert that every possible financial-line issue is resolved.

Live Staging contains test jobs, not Toro's Production job. Toro's exact negative case is verified locally with synthetic data; no customer record is copied into Staging. A signed-in read-only Staging smoke and public asset/identity checks will be recorded after publication. No live financial save/import/template/CO action is used as a test.

## Deployment target

Only branch `staging`, Netlify site **431ce717-1a06-45a0-9d7a-8acd06a67dde**, https://staging.rnsolutions.net/jobs, isolated backend **fazfwzbuesvzhgodckiw**. Re-fetch and require a fast-forward before pushing. Production site **16adb4ff-83a9-4440-8aad-fcb820d55cac**, main, version tags and database/auth settings remain untouched. Append the exact commit/deploy/publish receipt after confirmation.
