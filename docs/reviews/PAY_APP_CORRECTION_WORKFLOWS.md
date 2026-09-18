# Pay App correction workflows

## Purpose

Northgate HQ keeps Billed Pay Apps immutable while making ordinary mistakes and historical data entry practical.

## Normal billing workflow

- A Draft can be edited or discarded. Both actions are audited; discarding a Draft does not require a typed reason.
- An Approved Pay App can be returned to Draft without a typed reason. The transition is audited automatically.
- Voiding an Approved Pay App requires a reason because it removes a reviewed record from the active workflow.
- A Billed Pay App cannot be edited or deleted. A Manager, Director, or Developer with billing authority can create a linked Correction or Reversal, with a reason, from the immutable Billed record.

## Developer Data Correction workflow

The existing `can_developer_data_correction` override exposes two additional tools to an authorized Developer who can manage the selected Job:

- **Record Historical Pay App** approves and bills a standard Draft atomically using the entered historical billed date. The user supplies a correction reason and an exact certification. Historical applications must be entered in billing order.
- **Delete Pay App (Developer)** temporarily permits removal of Draft, Approved, Voided, or Billed Pay Apps during development. It requires a reason, retains a complete JSON audit snapshot, refuses records with correction children, requires newest-first deletion, and atomically recalculates SOV billed-to-date from the remaining finalized history.

Normal billing users cannot overwrite or hard-delete Billed Pay Apps. Corrections and reversals remain the required production workflow. Finalized deletion is explicitly documented as a temporary development override and should be removed or narrowed before rollout.

## Audit and security

All transitions are performed by `SECURITY DEFINER` RPCs that validate the authenticated Clerk identity and Job permissions. Status changes, historical finalization, and deletions write to `change_logs` in the same database transaction. Failed validation rolls back the entire action.

Migrations: `supabase/migrations/20260918184924_pay_app_correction_workflows.sql` and `supabase/migrations/20260918192615_developer_delete_finalized_pay_apps.sql`
