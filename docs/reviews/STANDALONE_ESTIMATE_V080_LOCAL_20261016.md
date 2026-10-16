# Standalone estimate approval — local v0.8.0 reconciliation

Production Mode, 2026-10-16. All execution stayed on Ryan_Northgate in this isolated
checkout. No push, deployment, shared migration, business record write, credential
change or active-user browser interaction was performed. Separate archive and CO
permission work was not included.

## Source and dependency review

Fetched main `a504f88a0562f2f960c43db85a656874d8452100`; v0.8.0 code/tag resolves to
`d8e8770c543ed55053bd4ae91030f0d6f2999a5a`. Staging is
`9a8716baac6819998640419cf6ecf63b6b1edb08`. Reconciled local `76c8083` onto main;
the single EstimateHandoff conflict was resolved preserving the current proposal
charge guard and adding the optional-handoff wording/duplicate-call guard.

AGENTS and the discipline protocol were read. No `.agents/skills` directory was
present in this checkout. Existing user checkouts and Git metadata were untouched.

Read-only shared metadata: both databases report PostgreSQL 17.6 and neither has
the new standalone RPC. Production has the proposal charge handoff guard; Staging
does not. Production migration registry after Oct 13: 20261013104626,
20261013223023, 20261013223745, 20261015140526, 20261015145753. Staging registry:
20261014234750, 20261015001358. Registry identities differ from some repository
filenames, so do not bulk-push pending migrations or replay historical incident
pause scripts. Reconcile actual function definitions and migration records first.

## Resulting workflow and compatibility changes

An official saved estimate submits through the reason modal without a Job or
Service Call. Review freezes the exact saved scope. Approval uses the existing
approval engine and retains its immutable snapshot in Estimates. Return restores
the draft with review history. Linking/creating a destination remains optional.
Existing destination edits and idempotent retries remain authoritative.

The new migration is CLI-generated `20261016110350_standalone_estimate_review_v080.sql`,
replacing the unpublished Oct 13 filename to follow current migrations. It adds
the review table/RLS/audit controls and four RPCs. A schema change is required
before deploying this UI; no shared schema has been changed.

Application conflicts now use PT409 rather than 40001, preserving the incident
repair's bounded-conflict behavior. No retry loop was introduced. Submission
validates original percentages and scope, projects zero destination charges only
for priced-line validation, and stores the untouched source document. Approval
retains actual sales tax/card fees using the current approval engine. Optional
handoff still invokes the existing guarded mapper: charged estimates cannot create
destinations. Snapshot scope comparison excludes the generated charge breakdown,
alongside existing approval metadata, while comparing the underlying proposal
rates and scope. The financial allocation retry aggregate is qualified without
changing its arithmetic; its exact-source anchor fails closed on unexpected code.

## Passed local checks

- 320/320 named tests across `tests/*.test.js`, `tests/*.test.mjs`, `test/*.test.js`.
- Production build with explicitly synthetic local environment values; existing
  chunk-size warning only. This bundle must not be deployed.
- Standalone actual-shell/editor checks at 1440px and 390px: modal/failure text
  retention, submitted lock, reviewer failure/retry, approval, retained listing and
  snapshot reopening, notes, optional handoff failure/retry without reapproval.
- Existing submission modal regression: focus trap/return, whitespace, Cancel and
  Escape retention, pending duplicate protection, route/unmount cleanup, repeated
  opens, mobile height/root scrollbar, permission/status/dirty guards, calculator.
- Notes UI, labor-rate UI and proposal-charge UI regression scripts.
- PGlite fixture with current proposal-charge migration: permissions/division/RLS,
  stale scope, submission idempotence, immutable approval, return/resubmit, labor
  zero/override/legacy parity, retained notes, optional Job/CO/Service Call handoff,
  altered approved scope rejection, and atomic audit-failure rollback.
- Real PostgreSQL 17.10 on loopback, separate clients and actual observed lock
  waits: duplicate submit/approve/handoff create one result; competing submission
  reasons and approve-versus-return return PT409; save of submitted scope rejects
  while approval is concurrent. Full sequential database suite also passed there.
  Disposable server was stopped afterward. Repeat via
  `scripts/verify-standalone-estimate-postgres.ps1` and its pinned setup commands.
- Charged standalone approval retains both charge amounts; later handoff fails
  before destination creation. Zero-charge approved snapshots hand off successfully.
- `git diff --check`.

Evidence remains under ignored `.temp/standalone-checks`: `db-results.json`,
`db-results-postgres.json`, `unit-results.txt`, `build-results.txt`, desktop/mobile
submitted/review/approved PNGs and UI results. Mobile approved screenshot was
visually inspected. Original Library screenshot remains unavailable due the
previously documented Windows extended-attribute materialization failure; no
claim is made to have inspected that source image.

## Remaining acceptance and rollout boundary

No access blocker prevented local work. Live JWT/account-specific permission and
owner acceptance remain unrun; database tests use captured permission fixtures.
The local PostgreSQL patch level differs from shared 17.6. Standalone requests are
in the Estimates review queue; adding them to the cross-module Bell inbox remains
outside this minimal scope. No new decline policy was invented.

Recommended next step, requiring explicit approval: reconcile Staging's missing
v0.8.0 proposal-charge/incident dependencies against actual definitions without
replaying historical migrations; apply only reviewed missing changes and the new
standalone migration; deploy an exact candidate with Staging credentials; run
authenticated author/reviewer acceptance using labeled fixtures. Verify charged
handoff stays blocked, and retain review/audit/snapshot data on any forward repair.
Production publication requires separate approval after that evidence. Existing
source and synthetic builds are preparation only.
