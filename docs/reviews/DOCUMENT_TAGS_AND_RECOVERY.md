# Document organization and recovery — September 16, 2026

Release: JUNIPER-INVENTORY-AUDIT-20260916-001. Migration applied as
20260916132523 on September 16. Live authenticated rollback-only tags, stale-write,
metadata/archive/restore and anonymous-denial checks pass. Publication is tracked
in SYNC_STATUS.md. Earlier pending-status notes below describe the local checkpoint.

## Workflow

- Documents retains its existing document type and original stored file. Select a
  document, open **Edit tags**, choose one or more department tags, optionally add
  custom tags, and **Save tags**. No reason prompt. The same control is available
  in Job/Service Call document rows to existing job managers.
- Construction, Electrical and General are organizational labels, not access
  grants. No department tags means Unclassified. Custom tags are case-normalized,
  deduplicated and limited to 20 tags of 48 characters each.
- Multiple selected departments use **all-selected** matching, combined with the
  document-type, custom-tag, date and text filters. Thus Construction + Electrical
  + Change Orders finds dual-department CO documents without changing their type.
- The Job dropdown excludes service calls. Their documents remain in the index,
  searchable by call number/name, and retain existing access rules.
- Both canonical CO-owned documents and signed job-owned CO documents can be
  organized by authorized users. Signed bytes, owner, approval, financial posting,
  file path and source relationships never change. Released AFC/inspection and
  other dedicated technical evidence retains its existing source controls.

## Schema, security and compatibility

Migration: `20260916112115_document_organization_tags.sql`.

Extends existing documents, not a second document system:

- nullable department_tags text[], non-null custom_tags text[], and positive
  organization_version integer; bounded-array constraints;
- NULL department_tags inherits the existing document_section through the shared
  UI helper. Explicit [] means cleared. This is a non-destructive lazy conversion:
  no blanket rewriting of historical documents or immutable released artifacts;
- set_document_tags authenticates the active account, locks the document, checks
  existing owner/job/estimate management scope (CO-owned documents additionally
  require financial read scope and job or CO management), rejects archived/source-
  protected documents, checks timestamp AND organization version, normalizes tags,
  updates only organizational fields, increments version and writes before/after,
  user name/ID and timestamp through existing hi_audit/change_logs, atomically;
- guard_document_audit_mutation is minimally extended so direct tag/version/section
  updates outside the dedicated classify workflow fail. File guards and all table,
  Storage and financial RLS policies are unchanged;
- set_document_section remains as an adapter for cached older clients, preserving
  custom tags and rejecting legacy single-section writes over multiple departments;
- document_section stores the first department for legacy readers; the shared
  departmentTags helper is authoritative for new UI filtering/display.

No permission grant, file movement, deletion, financial change, new role/table,
Storage policy change or historical reclassification is included.

## Verification actually performed

- 117 Node unit tests passed, including four new document-tag/filter tests.
- Existing 40 isolated AFC/document/read-audit checks passed.
- 33 additional isolated Postgres assertions passed: legacy inheritance, multi-tag
  normalization, bounds, no-op save, stale-version rejection, legacy adapter,
  approved signed and CO-owned organization, unchanged source/CO record, direct
  mutation denial, ordinary/outside/inactive account denial, audit identity/before/
  after/time, anon execute denial and full rollback on audit failure.
- Mocked Edge browser: 1440px and 390px, department intersections, CO type/custom
  filters, signed CO tag editor, service-call search with no call dropdown entries,
  readonly controls, failed-save retention, dates, inert HTML, no overflow/errors.
  Screenshots inspected in .temp/document-sections.
- Existing Job/Estimate document edit/archive/restore/upload-failure regression
  passed on desktop, tablet and phone with mocked transport.
- Production-configured Vite build succeeded using validated public live config,
  with fail-closed environment checks. Existing large-chunk/mixed XLSX import
  warnings remain; no dependency changes.

Not claimed: live migration execution, signed-in production acceptance, independent-
session concurrency stress, or a backup restore drill. Version/lock behavior was
tested in isolated Postgres, not simultaneous live sessions.

## Release order

1. Review the additive migration against then-current main/live schema and preserve
   any other-machine work. Apply migration before publishing frontend queries that
   request the new columns.
2. Verify live function grants/guards and perform an authorized rollback-only smoke
   test; no mass tagging/backfill. Deploy the tested frontend after approval.
3. Test an ordinary document and approved signed CO with Ryan's real account; tags
   must survive reload while the source/download/approval remains unchanged.
4. Record exact commit, migration and deployment with a fresh sync marker. Old
   clients must refresh to edit multi-department tags. No new release marker exists
   for this local-only work yet.

## Audit usability policy

See CODEX_DISCIPLINE_PROTOCOL.md. Routine changes use automatic audit information,
not mandatory explanations. Reasons remain for destructive/irreversible actions
and protected-record corrections. This pass applies that rule to tagging only.
Follow-up: audit each remaining workflow's reason gates; update frontend and server
validation together without deleting audit records or weakening authorization.

## Backup proposal — backlog (owner deferred September 16, 2026)

Do not activate backup automation or request setup choices as part of this release.
Ryan will revisit recovery planning separately. The proposal below is retained only
for future discussion.

Code history and Netlify rollback do not restore business data or uploaded files.
Supabase database backups exclude Storage object bytes:
https://supabase.com/docs/guides/platform/backups

Recommended starting policy, subject to owner approval and provider verification:

- daily database recovery points (verify current plan, retention and successful
  backup first; PITR is a separate paid option, not assumed enabled);
- weekly encrypted offsite database AND original Storage objects, with a manifest
  of counts/hashes, release commit, schema/migration version and configuration
  inventory; preserve independent copies rather than a synced live mirror;
- initial retention proposal: eight weekly copies plus daily provider retention;
- credentials/encryption keys kept separately in a restricted secret store; no
  service credentials in browser code/Git. Include a documented Clerk/configuration
  recovery strategy because these are outside the application database;
- verify completion and failure alerts; perform a restore drill in an isolated
  environment before relying on the plan.

Recovery should normally restore into an isolated environment and recover the
affected records through an audited correction. A whole-production rollback would
also remove valid work performed after the backup and must be explicitly approved.

Still needed: owner choice/authorization of offsite destination and restricted
access, retention/storage cost preference, verification of current provider backup
coverage, and restore objectives. No export, schedule, storage purchase, PITR
purchase or production restore has been initiated by this request.
