# Document Edit and Restore

September 12, 2026. Production Mode, Jobs and Estimates only.

## Workflow

- Authorized owner editors can change the display filename, category and
  description using the document-row pencil button. Save opens a single reason
  step; editing fields itself does not prompt. Back preserves the draft/reason.
- Archived documents opens a collapsed-by-default, 50-row paginated list.
  Restore requires one reason and returns the document to the active list.
- Server audit writes actual before/after rows, actor, timestamp and reason in
  the same transaction. Failed audit writes roll back edits/restores.
- Optimistic timestamp checks reject stale saves. Failure keeps the dialog and
  reason open; refresh and review a stale record before retrying.
- Owner, stored path, file content and other identity fields cannot be changed.
  No file replacement is included. Change-order-linked and signed documents
  remain in their dedicated workflow, regardless of signature status.
- Restore checks the storage object exists; missing files must be re-uploaded.
  This checks storage metadata at restore time, not the binary's integrity.

## Database / Security

Applied migration: `20260912134038_document_edit_restore`.

`maintain_owner_document` and `read_archived_owner_documents` are narrowly scoped
SECURITY DEFINER RPCs because archived rows are deliberately hidden by existing
SELECT RLS. No document/storage RLS policy was changed. Both endpoints check the
active caller, active job/estimate, and existing owner edit permission before
reading or writing. Anonymous execution is revoked; the owner-check helper is
not client-executable. Search paths are empty, table names qualified. Editing
locks the row and requires the expected timestamp, allowlisted fields and reason.

Security advisor baseline: five groups, 144 findings (6 no-policy INFO, 4 view
ERROR, 6 mutable-path WARN, 13 anonymous-definer WARN, 115 authenticated-definer
WARN). After: five groups, 146 findings; the two additions are the intentional
authenticated owner-checked RPCs above. No new anonymous exposure or RLS findings.
Existing advisories were not repaired by this pass. The previous documentation's
"five findings" counted groups, not individual findings.
See [Supabase definer-function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Verification

- 21 Node tests and production build pass; existing bundle-size warning remains.
- Real Jobs/Estimates component fixtures, mocked Clerk/Supabase transport:
  1440px desktop, 768px tablet, 390px phone. Edit, category change, saved payload,
  reason at save only, Back/retry preservation, archive, restore, upload failure
  cleanup, no duplicate client audits, and page overflow checks pass.
- Pre/post-migration BEGIN/ROLLBACK SQL tests pass: owner/denied access, immutable
  identity, stale saves, blank reasons, exact audit snapshots, forced edit and
  restore audit failures, missing storage rejection, job/estimate maintenance,
  anonymous/helper ACLs, old upload/archive regressions and signed CO protection.
- No test users/jobs/estimates/storage metadata retained; no test binary uploaded.
- Deployment verification is recorded in HANDOFF Entry 205 and SYNC_STATUS.md.

## Acceptance / Next Step

1. Refresh the app, open Job > Documents, edit a document and save with a reason.
2. Archive it, expand Archived documents, then restore it with a reason.
3. Confirm the active list/category checklist and History update; repeat in an
   Estimate. Verify a user without owner-edit permission has no edit/restore UI.

Authenticated production acceptance is Ryan's check; browser transport was mocked.
Interrupted-upload reconciliation remains a separate decision and is not solved
by metadata restore. Next implementation: the remaining Estimates audit mutation
paths under the already-approved sitewide policy; do not expand into file
replacement, binary recovery or new estimating features without selecting scope.
