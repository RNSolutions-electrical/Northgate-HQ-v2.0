# HQ Financials V2: Staging acceptance
Scope: Staging only, deployment branch `staging`. No Production changes or historical data rewrite.

## Legacy checkpoint and navigation
The previous Staging workspace is the immutable source checkpoint
[`671405a`](https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/commit/671405abc1632439154e712f4ea1afe039da13c5)
and Netlify deploy `6b0482cc9d9d09cb961d770f`. Open any accessible job in
Jobs → Financials. V2 is the default in Staging. **Open Legacy Financials**
and **Back to Financials V2** switch presentation, not databases. Existing
tools, cost imports, and workflows remain available in Legacy. If the
application needs rollback, restore the checkpoint application deployment;
do not delete any additive V2 records. No data migration back is required.

## What to test
- Overview separates a confirmed signed Original Contract, current
  approved revisions/credits, Current Contract, allocated SOV, and billing.
  Missing signed/locked inputs stay blank. Record a verified reference
  explicitly. Correcting a recorded contract requires an audit reason.
- Detailed Budget: review the original line values next to the working
  budget, actuals and remaining; optionally lock the original cost-code
  baseline, open the attached sold estimate, and edit the working value
  independently. Quote/material carrying and the markup workflow are not
  mandatory.
- Sales: start a proportional OH&P distribution, optionally set the fee
  with a cost markup, pin other shares while changing one, and explicitly
  recalculate remaining shares. Over 100% and over-allocated fees are
  blocked; unallocated fee and reconciliation to signed price are visible.
  Sales never writes to SOV or the signed amount.
- Execution: cost plus actuals/hours side by side, sales reference, separate
  rates, independent basis locks, explicit apply for an execution target.
  Hours used are not inferred from cost.
- SOV & Billing: current allocation, billed percentages, remaining, existing
  SOV builder, and optional paid/date annotations for issued pay apps.
  Compare gross and retainage against the issued record before recording
  through the V2 billing entry point. Differences require correction before
  recording. Paid status does not alter billed totals or expected revenues.
- Change Orders: review effective approved revisions and credits, filter by
  discipline and inspect actual cost-code postings. CO approval and its
  existing posting transaction are intentionally not split in this build.
  Legacy issuance and controlled billing corrections remain unchanged.
- Forecasts: optional quick worksheet; month and completion inputs; crew
  times cost, materials quotes/allowance, actuals + unposted + future;
  separately recorded monthly billing and retainage. Export completion,
  execution/cost, estimate comparison and revenue as CSV separately or
  together. Finalization saves a dated, immutable, user-reviewed snapshot
  with the same figures and assumptions the export uses. Draft export and
  saving shared totals without finalization are separate options.
- V2 History records revision, time and actor for versioned additions.
  Existing authoritative financial-line and billing audits remain in their
  source workflows. New planning data requires the existing job-scoped
  protected financial access, and writes additionally require existing
  budget approval permission.

## Data and rollout
The additive migration `20261123184020_financials_v2_records` is applied only
in isolated Staging. Legacy tables remain authoritative for existing budget
lines, posted costs, SOV, pay apps and change orders. Original contract,
baseline, Sales allocations, labor assumptions, monthly revenue assumptions,
paid annotations and immutable forecast snapshots are job-owned records,
not stored in the browser. User-reviewed forecasts are not accounting
records. Reports label partial coverage and unknown values. There is no
automated tax, collections, invoicing, or blanket Production promotion.
