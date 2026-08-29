# Job Billing / Pay Application Implementation Readiness

## Current implementation retained

- **Job → Billing** is the single existing Billing location in `JobsWorkspace.jsx`.
- `job_revenue_lines` is the existing SOV representation. It has one active production row, with `$1,000.00` scheduled and `$0.00` billed.
- `job_budget_lines` and `job_budget_divisions` are the Financials source. They are cost-oriented records with original budget, cost, forecast, and the structured `ohp_fee` category.
- Approved Change Orders and `change_order_financial_postings` remain the authoritative cost-side CO workflow. The old `change_order_sov_allocations` supports only a one-time manual allocation, not progressive billing.

## Safe implementation design

1. Extend—not replace—`job_revenue_lines` with a source Financials-line relationship, source Project Division, source amount, allocation percentage, allocated fee, and a billing lock.
2. Add Pay App headers, SOV-line snapshots, and CO-line snapshots. Billed rows never derive historical amounts or descriptions from current Financials, SOV, or CO records.
3. Create all Draft, Approval, Billing, and correction operations as permission-checked database RPCs. Billed finalization must lock the Pay App, validate all cumulative limits, write all snapshots, and commit or fail as one transaction.
4. Keep Financials cost values immutable from Billing. SOV allocation changes only the billing representation.
5. Treat approved, non-voided COs as eligible only when the user explicitly syncs them into a Draft. CO history stays tied to the source CO ID and captured version/value.
6. Use cents (`NUMERIC(14,2)`) with deterministic final-line remainder allocation for percentage and fee distribution.

## Confirmed business decisions — 2026-08-28

- **Original Contract Value** equals the total original Financials budget. It is not a separate manually-entered contract number.
- **OH&P / Fee** is identified by the Financials category `ohp_fee` (shown to users as `OH&P / Fee`). It is distributed proportionately within its Project Division to non-fee billable lines.
- **Retainage** is optional per Pay App for this release; its value is explicitly stored in the snapshot.
- **Authority:** Supervisors can view billing within their existing project-financial scope. Managers, Directors, and Developers may manage, override, approve, bill, and correct Pay Apps through granular permissions.
- **Corrections:** a billed Pay App is never unlocked. A reversal/correction Pay App is the only correction path.
- **Legacy SOV:** the existing manually entered SOV record is preserved. It requires an explicit, audited controlled reallocation before the first Pay App; it will not be silently rewritten.
- **Form choices:** Billing supports a selected AIA, GMP, Residential, Commercial, or Custom Uploaded form framework. Actual owned/licensed form files remain external job documents until supplied.

## Local work completed

- Added fixed-cent allocation and incremental-pay-app calculation helpers in `src/modules/jobs/billingMath.js`.
- Added unit coverage for cent-level OH&P reconciliation, SOV reconciliation, and overbilling prevention.
- Added a single template-choice registry in `src/modules/jobs/billingPayAppTemplates.js`; it does not embed or redistribute third-party forms.

## Draft migration safeguard

`supabase/migrations/20260828040208_redefine_job_billing_pay_apps.sql` is now applied to production. It extends the existing SOV table and adds the Pay App headers, snapshots, server-side operations, and RPC-only RLS boundary. The initial UI exposes SOV initialization and Draft Pay App creation; detailed draft editing, approval, billing, and history presentation are the next interface pass.
