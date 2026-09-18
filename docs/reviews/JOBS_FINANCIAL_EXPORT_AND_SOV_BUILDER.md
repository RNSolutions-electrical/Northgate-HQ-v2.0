# Jobs Financial Export, Safe Line Deletion, and SOV Builder

## Scope

Production Mode implementation. Existing Job Financials, Billing, SOV and
Pay App systems remain authoritative; this work does not add a parallel ledger.

## Financial export

Job Financials now has one export dialog. Cost code and description are mandatory
columns. Authorized users may independently include Budget, Costs to Date, Change
Orders, Monthly Forecast, Completion Forecast and Notes. PDF and CSV use only the
already permission-filtered lines returned to the signed-in user. Protected rows
are not re-fetched or reconstructed in the browser.

## Safe deletion

Two guarded RPCs permanently remove an unused Financial or SOV line. They require
the existing job budget-management permission, lock the target, require every
financial value to equal zero, reject all known Change Order/Billing/Pay App
references, delete atomically, and retain a full before-value audit snapshot.
The UI shows Delete only on zero-value lines and requires confirmation. Archive
remains available for nonzero records and ordinary lifecycle use.

## SOV builder and templates

Billing now exposes Add SOV Line as the scratch builder entry point. The existing
inline SOV table remains the editor. Users may save a positive current SOV as a
Department-scoped reusable template. Templates store structure and deterministic
allocation percentages, never the source job's dollar values. A template can be
applied only to a job with no active SOV lines and no Pay App history. The supplied
contract amount is allocated to cents; the final line receives the rounding
remainder so the resulting SOV equals the target exactly.

## Schema

Migration 20260918173055_job_financial_exports_deletion_sov_templates.sql adds:

- job_sov_templates and job_sov_template_lines with RLS and authenticated read
  grants constrained by existing Department/budget permissions;
- delete_empty_job_budget_line(uuid);
- delete_empty_job_sov_line(uuid);
- save_job_sov_template(uuid,text);
- apply_job_sov_template(uuid,uuid,numeric).

All RPCs revoke PUBLIC/anon execution and grant authenticated execution only; each
function performs its own Clerk actor and granular job permission checks.

## Verification

- 127 scoped unit tests pass, including selected-column CSV behavior, current
  budget overrides, and spreadsheet-formula neutralization.
- Isolated PostgreSQL migration suite passes zero-value deletion, valued-line
  rejection, exact 33.33/66.67 template allocation to $100.00, repeat-apply
  blocking, unauthorized deletion/template denial, RLS template hiding, existing
  estimate permissions and atomic audit rollback.
- Production-configured Vite build passes. Existing XLSX chunk and bundle-size
  warnings remain unchanged.

- Supabase applied the migration as production version `20260918173055`. Live
  verification confirms both tables, RLS, both policies, authenticated RPC grants,
  anonymous RPC denial, and zero template rows before release.
- Frontend publication is recorded separately in `SYNC_STATUS.md` after the
  production deployment is verified.

## Revenue save hotfix

Migration `20260918180036_fix_job_revenue_line_save_rls.sql` replaces the legacy
browser-direct SOV create/update path with `save_job_revenue_line`. The function
uses the existing job-aware `can_approve_budget` check, preserves protected-line
validation, saves and audits atomically, denies anonymous execution, and does not
weaken table RLS. Isolated tests cover create, update, two audit records, denied
unauthorized creation, and rollback of the denied write.
