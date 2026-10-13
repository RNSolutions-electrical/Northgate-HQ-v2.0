# Standalone estimate review and approval — local candidate

## Baseline and diagnosed coupling

Local branch `feature/standalone-estimate-approval` starts at Staging
`8858de81cd68e51cfa76cf9ce806cc98165feb9b`, whose deployed runtime is `dfde10a`.
Production remains `b71a8f1`; v0.7.2 runtime/tag is `b452934`. The modal already
published to Staging is preserved. The active Dropbox and previous checkouts
remain untouched. This new lifecycle change has not been pushed, deployed or
applied to any shared database.

The official editor's old Submit for review button invoked
`submit_estimate_for_review_v2`, an actual destination handoff. Its base function
only accepts job/change_order/service_call, requires a job or creation details,
and `estimate_workflow_handoffs.job_id` is NOT NULL. The v2 Job path also imports
mapped costs into Original Budget. It is not an estimate-only review queue.

`approve_workbench_estimate` already approves an unlinked draft into a locked
snapshot. Personal submission/promotion also already works without a job, but
promotion creates an official draft, not approval. These authorities are retained.
Read-only Staging inspection confirmed current approval/save/header-guard,
handoff definitions and pertinent schema columns before implementation.

## Implemented behavior

- Official Submit for Review opens the preserved reason modal. Its explicit
  confirmation submits only an estimate review request. No destination is
  selected, created or linked. Dirty/stale/incomplete/checklist-invalid input is
  rejected; failed confirmation retains the reason and retry request ID.
- New `estimate_review_requests` stores the immutable saved document/revision,
  submitter/reason/time, stale token, review decision and approved snapshot ID.
  One pending request per estimate; permissions/RLS and audit writes apply.
  Submitted status locks the Workbench through its existing save/RLS guards.
- Review Submissions combines existing personal/shared proposals with official
  estimate approval requests. Authorized reviewers approve or return the saved
  scope; notes are required. Approval reuses the unchanged v0.7.1 pricing engine,
  validation, immutable snapshot and audit transaction. Its temporary draft
  transition exists only inside the locked transaction. Retries reuse the same
  decision/snapshot. Return restores an editable draft and retains history.
- Approved estimates remain listed/reopenable in Estimates. Reopen uses the
  approved snapshot document; direct existing draft approval also updates the
  active/listing state. Notes and frozen rates remain in the approved payload;
  customer exports continue excluding private annotations.
- Link / create destination is an optional separate editor action. Existing CO,
  Job and Service Call choices, mapping/creation/access requirements, financial
  import semantics and unique handoff protection are preserved. No new
  conversion option was invented. Later handoff does not request another
  estimate approval; approved status/snapshot stay intact. The new adapter checks
  full saved scope against the approved snapshot before the first handoff, so
  same-price scope drift cannot silently pass. Existing handoffs preserve their
  destination edits and retry behavior. Missing/mismatched approval documents are
  blocked for inspection/revision rather than inferred or repaired silently.

Standalone requests appear in the Estimate review queue. Existing personal/shared
decline and notification workflows are unchanged. A new terminal standalone
decline policy or expansion of the cross-module notification inbox was not
inferred; those are separate policy/integration choices if desired. Approval
does not imply work authorization or weaken job/budget/service permissions.

## Migration and discovered defect

`20261013201613_standalone_estimate_review.sql` was generated using official
Supabase CLI 2.120.0. It adds the review table, indexes, RLS, immutable-source
trigger, restricted submit/read/review RPCs, and optional handoff adapter.
No existing estimate, snapshot, notes or rate document is rewritten.

Local optional-Job testing exposed a pre-existing ambiguity in the v2 mapper:
`sum(amount)` conflicts with its PL/pgSQL variable. Read-only Staging inspection
confirmed the unqualified aggregate and `plpgsql.variable_conflict=error`.
The migration qualifies `allocation.amount`/`allocation.handoff_id` only, preserving
allocation mathematics, role gates and audit behavior. Its exact definition
anchor fails closed on drift, requiring reconciliation before application.

Existing approval/pricing/notes/labor SQL engines are not replaced or reimplemented.
The existing handoff endpoints remain available for compatibility. Calculator
code and tests, note storage/export projections and labor hierarchy are unchanged;
the editor action label and lifecycle integration are the necessary UI changes.

## Passed local checks

- Complete existing regression suite: **308/308**, zero failures/skips:
  `node --test tests/*.test.js tests/*.test.mjs test/*.test.js`.
  One existing handoff contract assertion now verifies the adapter delegates to
  the unchanged financial mapper. The three singular-directory billing cases
  are included. New SQL/UI suites are separate from this named-test count.
- `verify-standalone-estimate-db.mjs`: fresh in-memory PostgreSQL using real
  released approval/handoff/save/checklist/rate functions and captured dependency
  and permission fixtures. Passes unlinked submit/approve; existing linked
  approval; review return/resubmit/history; stale/reason/permission/department/RLS
  rejection; submitted-save lock; duplicate request/decision and one snapshot;
  immutable snapshots and sources; internal notes/customer projection; approval
  price parity including legacy, inherited, override and explicit-zero rates;
  optional later CO/On Hold Job/Pursuit Service Call handoff without reapproval
  or duplicates; destination edit retention; same-price source drift rejection;
  approval/audit failure rolls back status, decision and snapshot atomically.
  The corruption case deliberately bypasses a trigger only in the disposable
  fixture, then re-enables it to exercise legacy-integrity rejection.
- `verify-standalone-estimate-ui.mjs`: actual shell/router/editor and transport
  fixtures, external requests blocked. Desktop 1440px and mobile 390px pass
  modal-without-destination, failure/retention, locked submission, reviewer-note
  retention on failure, approval, approved listing/reopen/notes, optional handoff
  failure/retry without reapproval; no page errors. Screenshots inspected.
- Existing personal-modal, notes, calculator and labor-rate browser suites pass.
- Synthetic isolated development build passes; validation bundle must not be
  deployed. Existing chunk-size/mixed XLSX warnings remain. Diff whitespace check
  passes. Evidence is under `.temp/standalone-checks/` and existing UI folders.

## Rollout, compatibility and recovery

Separate approval is required for migration/publication; prior Staging approval
covered the modal only. Before a rollout, verify current refs and function
definitions, preserve intervening work, and rerun the complete suite. Apply the
additive migration to independent Staging first, verify RPC grants/RLS/schema
cache and the mapper anchor, then deploy the exact reviewed UI candidate with
existing Staging-only configuration. Old UI cannot review new standalone requests;
new UI requires the new RPCs, so coordinate this order and refresh cached sessions.

Use labeled Staging fixtures for authenticated author/reviewer acceptance and
optional conversion. Do not use business estimates or Production writes. Record
the approved code/migration/deploy identities and acceptance before considering
Production. Legacy editor-version-1 workflows and historical snapshots remain
untouched. New requests target editor-version-2 Workbench estimates only.

Recovery is forward repair. Retain review rows, audit history and snapshots;
never drop them to undo a UI rollout. Authorized reviewer return can release a
pending standalone draft while preserving its review record. Do not silently
clear submitted states or alter approved documents; corrupted historical scope
requires inspection and, where appropriate, a separately reviewed revision.

Unrun: shared migration/advisors, deployment, live JWT/RLS/account smoke, real
approvals/jobs/service calls, multi-session database races, and owner acceptance.
PGlite is single-session; row-lock/index ordering was reviewed and sequential
duplicate/rollback cases passed, but no concurrent live test is claimed. Permission
fixtures use captured resolvers; current live authorization helpers remain the
authority and were not changed. No material business rule was guessed to enable
approval; additional standalone decline/notification policy remains outside this
minimal change. Original user screenshot inspection remains blocked by the
previously reported Library Windows extended-attribute incompatibility.
