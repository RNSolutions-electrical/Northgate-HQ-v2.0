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
- **Delete Unbilled Record** permanently removes only a Draft, Approved, or Voided Pay App. It requires a reason, retains a complete JSON audit snapshot, refuses records with correction children, and requires newer unbilled records to be removed first so numbering remains sequential.

The permission does not allow Billed Pay Apps to be overwritten or hard deleted. Corrections and reversals remain the required path for finalized history.

## Audit and security

All transitions are performed by `SECURITY DEFINER` RPCs that validate the authenticated Clerk identity and Job permissions. Status changes, historical finalization, and deletions write to `change_logs` in the same database transaction. Failed validation rolls back the entire action.

Migration: `supabase/migrations/20260918184924_pay_app_correction_workflows.sql`
