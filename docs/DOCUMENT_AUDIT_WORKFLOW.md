# Document Audit Integrity

September 11, 2026. This pass strengthens existing upload/archive workflows in
Jobs and Estimates, including quote attachments. The Documents workspace itself
is read-only. Document editing and restoration do not yet have UI workflows.

## Implemented

- Database-created document metadata and its audit record now commit together.
  Actor, timestamp and actual row snapshots are recorded by a restricted trigger.
  Ordinary upload needs no reason; description/notes remain in the document data.
- All document archive paths, including upload-failure cleanup, require a reason.
  The trigger records full before/after snapshots, actual archive actor and reason.
  Existing archive functions no longer duplicate the trigger's audit record.
- The job archive function accepts job-owned documents only. Approved signed
  Change Order authorizations remain protected, including direct update attempts.
- Estimates uses the shared reason dialog. Jobs and Estimates preserve the reason
  after a failed archive; cancellation causes no archive. No layout redesign.
- Six Jobs/Estimates upload/quote cleanup paths use the checked cleanup RPC.
  Cleanup errors are surfaced alongside the original failure instead of ignored.

## Boundaries

Migration `20260911171045_document_audit_integrity` leaves RLS policies unchanged.
The cleanup RPC needs SECURITY DEFINER because archived rows are intentionally
hidden by SELECT RLS; direct archive updates were failing. It checks active owner
and the existing job/estimate/change-order edit scope, rejects anonymous calls,
and is subject to the reason/audit/signed-document triggers. Trigger functions
are not directly executable by authenticated users; search paths are fixed.

An audit create event records metadata registration, not proof that the binary
uploaded. Storage and Postgres are separate operations. Normal failures archive
the metadata with an audit reason. Browser termination between requests and
uncertain network outcomes still require reconciliation; no background upload
recovery service was added. Signed-CO replacement retains its existing workflow.

Metadata identity/path/owner edits and restoration cannot bypass reasons through
direct table updates. Their dedicated controls/workflows remain unimplemented;
this release does not claim they have been completed. Earlier cached clients may
still issue their old extra client-side audit call until refreshed.

## Verification

- 21 Node tests, production build and diff check passed.
- `scripts/verify-document-audit.mjs`: real Jobs/Estimates components with mocked
  transport, desktop/tablet/phone; cancel/retry/reason retention, upload metadata,
  cleanup RPC, no duplicate client audits, and page overflow checks passed.
- `tests/documentAuditIntegrity.sql` runs only inside BEGIN/ROLLBACK: creation and
  archive audit failure injection rolls back metadata; reasons, owner isolation,
  denied users, cleanup, actor and exact snapshots/counts verified.
- Deductive CO regression tests pass, including signed-document archive rejection.
- Pre/post-migration database tests pass; no test jobs, estimates or users remain.
- Live security advisors returned five findings before and after; none new. This
  is the current tool output, not a claim that older advisory backlogs were fixed.

## Acceptance / Remaining

1. Refresh; upload a document in a Job and an Estimate without a reason prompt.
2. Archive with a reason; confirm cancellation leaves the document untouched.
3. Review the owner History for creation/archive entries and the retained note.

Next Documents work requires dedicated metadata edit/restore workflows and a
decision about reconciliation of interrupted uploads. Other module audit work
remains in `docs/APPROVED_WORKFLOWS.md`. Authenticated production UI acceptance
is Ryan's check; browser verification used mocked transport.
