# Service call profit and historical import review

## Release checkpoint — September 14, 2026

Ryan approved committing and deploying all pending frontend work under
`MAPLE-SERVICE-REVIEW-20260914-001`. See `SYNC_STATUS.md` for final deployment status.
Profit summaries and period filters are included together with the billing-derived
directory stages/colors and read-only Estimate verification details.

The later 26-046 resolution combined both source scopes into one Pursuit through
the existing RPC, with no fabricated dates or financial entries (HANDOFF 223).
Ryan accepts the other historical gaps; this does not authorize rewriting posted
financials or importing other undated calls. The earlier review workbook predates
this resolution. Private customer source records remain excluded from Git.

## Import completed — September 14, 2026

This section supersedes the import boundary in the earlier checkpoint below.
Ryan authorized import when any valid service, billed or paid date is on/after
2026-01-01, and specified that historical billed totals include 7.25% sales tax
and a final 3% card fee. Ryan also approved In progress for dated unbilled calls,
with the status retained as a review item.

Production data batch: `SVC-RETRO-20260914-2026-TAX725-FEE3-001`.
This is a **data import marker**, not a new Git or deployment marker.

- 40 eligible source records: 37 new calls, 2 existing calls enriched, 1 existing
  financial history preserved unchanged. Three eligible records retain Void.
- 18 source rows excluded because none of the three dates qualified. Number
  prefixes and derived due dates were not used as eligibility evidence.
- 24 invoices, 22 payments and 27 cumulative cost snapshots added through existing
  permission-checked `svc_*` RPCs. No schema, RLS or permission changes.
- Original workbook hash verified unchanged. Original live invoice/payment/cost
  history was compared exactly with the private pre-import snapshot.
- Unknown shared allocations, invalid invoice dates, overpayments and other
  unresolved data were not guessed. Withheld source values and source cell notes
  are preserved in the permission-scoped import audit payload.

### Financial representation

For each imported gross amount: pre-fee amount = ROUND(gross / 1.03, 2),
service subtotal = ROUND(pre-fee amount / 1.0725, 2), tax = pre-fee amount minus
subtotal, and card fee = gross minus pre-fee amount. The reverse split reconciles
exactly to source gross; fractional-cent rounding is retained in the split.

The existing ledger has no separate card-fee column. Its revenue-excluding-tax
contains service subtotal plus card fee. A matching card-fee expense is included
in the cumulative Other cost with a separate breakdown in its source note and
the structured import audit. Thus profit = service subtotal minus source hard
cost, without treating tax or the fee as profit. Existing margin remains profit
divided by revenue excluding tax (including the fee recovery). Aggregate source
cost is explicitly unallocated, not fabricated labor/material detail.

When cost is unresolved, no partial cost snapshot is presented as a complete
cost. Missing billing dates do not get an invented invoice date. Import invoice
references are visibly labeled `IMPORT-SCORECARD-*`, not original invoice numbers.
The workbook lacks explicit billing-method/classification fields; existing
defaults and quote-present mapping are disclosed in both notes and the review.

### Verification and handoff

The full batch passed twice in rollback, including stored invoice/cost/payment
reconciliation and the directory RPC read. After commit, a full retry in rollback
returned 40 already-imported records and zero new writes. Unique audit/request
IDs, existing-row timestamps, source hash and the existing save advisory lock
guard against duplicates and stale writes. No automatic cleanup/deletion occurred.
Developer RPC reads return all 40 calls; unauthenticated reads return zero.

The replacement review contains only remaining questions: 50 grouped review
entries, with an answer column. Native Excel normal-load verified the file,
its single sheet, 50 table rows and editable answers. The preceding review-copy
corruption was caused by missing OOXML namespace bindings; its packaging helper
now preserves those bindings. The new review is artifact-authored directly.

Private manifests, pre/post database snapshots, executed plan, verification and
review workbooks stay outside tracked source. Do not commit customer records or
financial data to this public repository. Frontend changes from the previous
checkpoint remain local, uncommitted and undeployed. No commit/push/deploy was
requested or performed during this import.

## Working checkpoint — September 14, 2026

Production Mode. This is a **local, uncommitted frontend change**, not a deployment
or a completed historical import. The pushed marker remains
`CEDAR-SERVICE-PROPOSAL-20260914-001`. No production records or schema changed in
this pass. Preserve the existing posted invoice/cost history.

## Reused implementation

The Financial scorecard inside `ServiceCallsWorkspace` reuses `svc_read_calls`,
the existing permission-masked payload and `callFinancials`. Profit $ was already
present; Profit % and a reporting date are added beside it. No second ledger,
permission system, route or invoice implementation was introduced. The existing
Add-On Service Scorecard is unchanged.

`ServiceProfitSummary` provides year/quarter controls, annual/YTD profit and
weighted margin, and selected-period profit/margin. Financial read permission is
still required; unavailable costs are not converted to profitable zero costs.

## Calculation/reporting basis

- Call profit = posted invoice revenue excluding tax minus latest active cumulative
  hard-cost snapshot. Void invoices do not contribute.
- Margin = profit / matching net revenue. Summary margin uses summed amounts, not
  the average of call percentages. A zero denominator is unavailable.
- Void service calls are excluded from summary amounts and show Void in the
  directory financial cells. Archived calls remain in historical summaries.
- Each call contributes once, based on its latest posted invoice date (default),
  service date, or latest recorded payment date, as selected explicitly.
- These are **call-profit groups**, not an accrual P&L or period cash-flow report.
  All of a call's lifetime posted billing/current cost is grouped under that date.
  A later invoice/payment may move a call to another group; this is disclosed in
  the UI. Do not present it as historical period-cost accounting. The requested
  default reporting basis still needs confirmation.
- Missing dates are excluded and can be shown for review in the directory.
  Missing costs are excluded from both the profit numerator and matching revenue
  denominator, with a visible incomplete-data count. Preliminary costs are flagged.
- Annual summaries cover the selected calendar year through today; previous years
  are full years. Quarter filters apply to the scorecard, not Operations. Search
  and work-stage filters do not alter the all-accessible-calls summary.

## Workbook review and import boundary

The original workbook was not modified. A separate review copy preserves all four
source worksheets, values, formula text, notes, table definitions, freeze panes,
conditional formatting and original black/strike void markers. Amber cells and an
Import Review sheet identify review items. The artifact export dropped strike
styles, so final packaging retained original OOXML and applied only authored
review highlights and the review worksheet. Read-back comparison found zero
source value/formula/strike/note differences. Source cached results were retained
instead of replacing them with unsupported recalculation results.

Private workbook/review files and extracted records live outside tracked source.
Do not commit customer/financial data into this public repository. The source
hash and cell-level review manifest are retained privately in `.temp/service-calls`.

There are 58 numbered service rows, 57 distinct numbers and six clearly void
records. Two rows share a number. Shared-invoice/cost references conflict, an
invoice date contains a non-date number, and source summaries/formulas need review.
The newly entered live call already has posted financial data, so blind re-import
would duplicate or overwrite it. No historical records have been injected.

Before import, resolve:
1. Whether each gross amount includes sales tax and/or the final card fee. The
   rate alone does not identify applicability or payment method.
2. Shared invoice and cost allocations, conflicting links, and duplicate numbers.
3. Invalid/missing invoice/payment dates and missing cost amounts.
4. Explicit treatment of the existing posted invoice with a conflicting tax split.
5. Missing work-stage/billing-method classifications for operational-only rows.
6. Missing historical invoice references. Any surrogate must be clearly labeled
   as an import reference, never invented as an actual invoice number.

## Reverse calculation

`reverseServiceCharges` is review-only; it does not write invoices. For a total
including both charges, the initial estimate is gross / 1.03 / 1.0725. Integer
cent arithmetic then tests candidate subtotals with separately rounded 7.25% tax
and 3% surcharge on subtotal + tax. Only exact-cent reconciliations are accepted;
unreconcilable totals stay review items. Tax/card applicability must be explicit.
No card-fee ledger column or processor expense is assumed/created in this pass.

## Verification actually run

- `npm test`: 50 passed, including weighted margins, missing vs zero costs,
  void/archive handling, quarter/year/leap-day boundaries, multiple invoices,
  preliminary costs and 2,000 inverse-calculation cent-rounding examples.
- `scripts/verify-service-calls.mjs`: desktop/tablet/phone checks passed for existing
  workflows and new profit/quarter/date controls, missing-date review and restricted
  financial access. Screenshots reviewed; no page overflow or runtime errors.
- Configured production build passed with existing public client configuration.
- No new SQL/migrations, remote financial writes or production authentication tests.
- Review export preserves source data/native features; original formula defects
  are highlighted, not silently repaired. Native Excel recalculation was not run.

Next: confirm the reviewed source decisions, prepare an idempotent import using
existing authorized RPCs with explicit provenance, test it in rollback, import
only reconciled records, then commit/push/deploy when authorized.
