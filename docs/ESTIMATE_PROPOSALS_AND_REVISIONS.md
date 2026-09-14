# Estimates: proposals, draft deletion and linked revisions

Released under **CEDAR-SERVICE-PROPOSAL-20260914-001**, feature commit `23c2e9c`,
production deploy `6aa7eb647db05775d8eab870`. Original local checkpoint:
PROPOSAL-LINK-20260914-001.

## User workflow

1. Open an estimate and choose **Proposal**. Scope starts from non-empty entries and work-item names/quantities; internal notes, component costs, markup and vendor pricing are excluded.
2. Edit contact, address, introduction, scope, inclusions, exclusions, schedule and terms. **Save proposal** saves the whole current draft through the existing save RPC. **Preview draft PDF** previews current input, clearly marked Draft.
3. Review and approve using the existing Overview workflow. Customer-facing text is included in the immutable approval snapshot. Approved exports use that snapshot, never current draft values.
4. On an approved estimate, choose **Create editable revision**, provide a reason, and edit the new version. **View previous version** returns to the original approved record. The directory identifies version numbers. Existing draft revisions from the same approval are reopened rather than duplicated.
5. In Pricing, use the trash controls to delete draft entries or work items. Confirmation and a reason are required; the entire current draft is saved. Failure retains input and reason. Deleting a package entry removes its draft package/quotes; deleting its awarded work item clears the award but retains vendor quotes. Shared assemblies and approved snapshots are untouched.

Manual proposal scope is deliberately not rewritten when pricing changes. Review it before approval; use **Use work items as starting scope** to explicitly replace it.

## Reused architecture

WorkbenchRoute / WorkbenchEditor, existing package normalization, save_estimate_workbench optimistic locking, approve_workbench_estimate snapshots, department-scoped can_estimate / can_approve_estimates permissions, and change_logs before/after audit remain authoritative. No second estimator or permission system.

The old approved-PDF exporter replaced Unicode with question marks and stopped after one page. It is replaced with a client-safe multipage exporter. Typographic punctuation is normalized; supported accented names are preserved. Unsupported font characters fail with a clear message instead of being silently corrupted. Empty optional sections are omitted. Draft/approved and version labels distinguish documents.

The Estimates directory now uses WorkspaceHeader and standard button/form styling.

## Database

Applied to Supabase project keogysnoukbendfkfjcn:
**20260914121940_estimate_workbench_revisions.sql**

Follow-up applied: **20260914123229_estimate_revision_archived_numbering.sql**.
It retains SECURITY INVOKER/RLS and uses the unique version index to skip numbers
reserved by archived, RLS-hidden revisions. Failed candidates and their audit
records roll back before retrying within the locked, atomic family transaction.

- estimates: version_number (default 1), revision_of, revision_root_id, source_snapshot_id.
- Foreign keys retain parent/root estimate and source approval relationships; no cascading deletion.
- Positive-version and lineage consistency constraints; unique root/version index plus parent/snapshot indexes.
- guard_estimate_revision_lineage trigger/function prevents ordinary changes to lineage.
- create_workbench_revision(uuid,uuid,text): SECURITY INVOKER, empty search_path, signed-in edit authorization, existing RLS, original-family row lock, source-snapshot validation, existing-draft retry handling, and atomic draft creation via the existing save RPC.
- The save counter estimate_workbenches.revision is NOT the business version.
- Revision reason and source identifiers are included in document.revisionContext and captured by the existing change_logs audit with actor and timestamp.
- Deletion reason/target are in document.lastEditReason and captured by the same before/after audit.

Existing records become version 1 without changing their prices, contents, approvals or snapshots. Newly approved revisions use the existing approval validator, including its decimal-value correction. Frontend deployment must follow this migration.

## Validation performed

- Node tests: scope privacy/quantities, draft entry/item deletion, approval lock, deletion reason, missing entry, package reappearance prevention, award clearing, multipage PDF, final scope/terms/price, accented names, unsupported-character errors.
- Full `npm test`: 43 passing tests, zero failures.
- tests/estimateRevisions.sql ran as authenticated synthetic users inside a rollback: V1 approval → V2 → save → approval → V3; original snapshot equality; retry returns same draft; stale save denied; wrong source snapshot denied; missing reason denied; lineage mutation denied; unauthorized user denied; anonymous RPC grant absent; audit reason captured. No synthetic users or estimates remain.
- A synthetic administrative archive of V3 was followed by authenticated revision creation; V4 was allocated correctly with matching document metadata. This does not claim to test the unrelated legacy archive interface.
- scripts/verify-estimate-editing.mjs: browser fixtures at 1440/768/390px for proposal editing/save/download, approval lock, V2, original link, failed-deletion retry, entry/item deletion, snapshot preservation and read-only delete controls.
- Existing scripts/verify-estimate-workbench.mjs passed (catalogue, assembly, export and navigation regressions).
- PDF output rendered and visually inspected, including long multipage scope and mobile proposal layout.
- Full production-config Vite build verified. The existing missing-VITE-variable build guard remains in place.
- Security advisors ran. No findings name the new revision RPC/trigger. Existing unrelated inventory views/functions and other historical findings remain; this pass does not claim to resolve them. [Supabase view-security guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

## Boundaries / release status

- Database migrations are applied; frontend is committed, pushed and deployed. Live HTML/JS/CSS match the tested build. Authenticated acceptance remains with Ryan; automated sign-in encountered the account site's Cloudflare bot check.
- Existing Service Calls work and pre-existing untracked dist-* directories are preserved.
- Browser tests use fixtures, not real estimates. No real estimate was approved, deleted or revised by these tests.
- Concurrent numbering is protected by the family lock and unique index; simultaneous live sessions were not exercised. Retry and stale-save cases were exercised.
- A previous version archived outside this workflow may be hidden by existing RLS; it is not unarchived or silently reconstructed.
- Custom letterhead/templates, e-signatures, and estimate-to-job conversion are outside this request.
