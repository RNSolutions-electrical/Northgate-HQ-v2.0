# V5 Jobs / Financials reconciliation readiness

**Mode:** Production Mode
**Prepared:** 2026-09-22
**Status:** Budget proposal/baseline foundation implemented, verified, migrated, and deployed

## Implemented in this slice

- Added RPC-only `job_financial_baselines` metadata with a non-destructive legacy
  backfill. No financial values are copied or recalculated.
- Added constrained save/submit/review/apply endpoints for Job budget proposals.
  Generic v5 submissions cannot forge the reserved Financials destination.
- Added baseline triggers covering retained budget and SOV writes, imports,
  archives, and controlled deletes so an older proposal cannot be applied after
  any authoritative financial mutation.
- Added exact destination version/hash checks, source working-copy checks,
  baseline-version checks, transactional official application, and idempotent
  retry behavior.
- Retained the existing direct official workflow for authorized budget approvers.
  Other users with project-financial visibility now edit through a clearly
  separated review proposal.
- Added an assigned-scope review queue to Job Financials with proposed amounts,
  review note, Apply, Return, and Decline actions.

## Local verification completed

- Production schema/data was inspected read-only; nine existing Jobs will receive
  baseline metadata and no amount changes.
- The migration compiled and executed against an isolated Postgres runtime.
- The isolated workflow verified legacy backfill, constrained save, anti-forgery,
  atomic apply, baseline advancement, and idempotent retry.
- `node --test "tests/*.test.js"`: 127 passed, 0 failed.
- The broader `npm test` discovery found 212 passing assertions; its sole failure
  was the existing `scripts/serve-estimating-test.mjs` helper attempting to claim
  port 5320 while the local prototype server already occupied it.
- A production-mode Vite build passed using non-production validation values.

## Production migration verification

- Migration `20260922162009_v5_jobs_financials_foundation.sql` applied successfully
  to project `keogysnoukbendfkfjcn` on 2026-09-22.
- Live verification found 9 Jobs with existing budget/SOV records and exactly 9
  baseline rows; all were marked `legacy_backfill`.
- All four client-facing constrained RPCs and all three internal concurrency and
  anti-forgery triggers are present.
- Trigger helpers are executable only by database/service roles. Constrained user
  endpoints are authenticated-only; no new anonymous function grant was created.

## Production release verification

- Feature commit `6144dcf3f1bdeed0493918c6da34ad42042040d8` was published
  by Netlify production deploy `6ab2b127ae14530008a3e0f1`.
- The live `/northgate/` route returned HTTP 200 and served bundle
  `assets/index-D3wY-T6r.js` as JavaScript.
- The deployed bundle contains the constrained proposal save and Financials review
  actions. The later failed manual CLI deploy was local-only and did not replace
  the successful Git-triggered production release.

## Still deferred

- SOV proposal/revision and atomic archive adapters.
- Bulk input, import, and catalogue operations as consolidated proposal batches
  for contributors; these retained setup tools remain approver-only in this slice.
- Monthly Forecast cycles and removal of the Change Order compatibility hold.

## Existing implementation retained

The current Jobs Financials and Billing implementation remains the authoritative
production system. It already provides:

- `job_budget_lines` as the project cost source;
- `job_budget_divisions` as the project Division hierarchy;
- `job_revenue_lines` as the SOV/revenue source;
- protected-financial metadata and server-filtered reads;
- atomic batch budget saves through `save_job_financial_batch`;
- job-aware SOV saves through `save_job_revenue_line`;
- financial catalogue/template application;
- guarded archive and zero-value deletion paths;
- immutable Change Order postings and Pay App snapshots; and
- before/after entries in the existing change log.

These structures must be extended. They must not be replaced by a second budget,
SOV, Change Order, or billing implementation.

## Compatibility finding

The production UI currently treats `can_approve_budget` as permission to write the
official Financials and SOV records immediately. V5 instead distinguishes:

1. a contributor's proposed financial change;
2. the official financial baseline;
3. an assigned Project Manager or applicable Director applying ordinary official
   changes; and
4. a preserved revision for changes to approved/posted financial history.

There is no current baseline record or state flag that safely distinguishes a
non-posted line from an official/posted line. There is also no financial proposal
adapter comparable to the existing v5 Estimate promotion adapter. Therefore the
canonical `CFG-004`, `CFG-005`, `AUD-040`, `AUD-041`, and `AUD-046` decisions cannot
simply be attached to the current save RPCs. Doing so would either block valid
legacy work or allow proposal authority to mutate official financial records.

## Current write-path inventory

| Workflow | Current path | Reconciliation requirement |
| --- | --- | --- |
| Add/edit budget line | `save_job_financial_batch` | Retain as the atomic official adapter; add a proposal path and baseline/revision state before tightening authority. |
| Bulk input/import | `save_job_financial_batch` | One proposed change set, shared reason only when risk-gated, per-line before/after audit, stale-row protection. |
| Apply financial catalogue | `apply_financial_catalogue_to_job` and batch save | New zero-value lines may be prepared without silently committing a baseline; alignment of official lines follows the official adapter. |
| Archive budget line | `archive_job_budget_line` | Preserve Manager+ scope and history; route through the canonical decision after compatibility rollout. |
| Delete empty budget line | `delete_empty_job_budget_line` | Retain zero/reference checks. This is controlled cleanup, not a substitute for revising financial history. |
| Add/edit SOV line | `save_job_revenue_line` | Add proposal/revision handling before enforcing `AUD-046`; preserve Billing and Pay App constraints. |
| Archive SOV line | client table update plus audit write | Replace with one server transaction before v5 enforcement so authorization, stale checks, and audit cannot split. |
| Delete empty SOV line | `delete_empty_job_sov_line` | Retain zero/reference checks and immutable Pay App/CO relationships. |
| Save/apply SOV template | existing SOV template RPCs | Keep as helpers; applying a template must respect baseline state and cannot rewrite billed history. |
| CO financial posting | existing atomic Change Order RPC | Keep compatibility hold until real Project Managers are assigned and tested; then enable `CFG-009` / `AUD-016`. |

## Controlled implementation sequence

1. Add a minimal financial-baseline record per Job with version, status, actor, and
   timestamp. Do not copy financial values into a second source-of-truth table.
2. Add constrained financial proposal/change-set adapters using the existing v5
   working-copy and destination primitives. Client callers must not select their
   own authority or destination action.
3. Add an atomic official budget adapter that validates the exact submitted
   version/hash, assigned-PM-or-Director scope, protected-financial visibility,
   stale row timestamps, and existing field-level financial invariants.
4. Move SOV archive into a server RPC and add the equivalent official SOV adapter,
   retaining Change Order, Billing, and Pay App references.
5. Update the Financials UI so contributors save proposals while authorized Project
   Managers/Directors can apply reviewed changes. Clearly label proposed versus
   official values and never blend them into totals before application.
6. Backfill existing Jobs as already-baselined without changing any amounts. The
   backfill records provenance and does not fabricate Project Manager assignments.
7. Rehearse against production schema/data, test role/scope combinations and stale
   concurrency, then request separate migration and deployment authorization.
8. After real Project Managers are assigned and acceptance-tested, remove the
   Change Order compatibility hold and enable `CFG-009` / `AUD-016`.

## Validation requirements

- Existing Financials, SOV, Change Order, Billing, and Pay App values do not change
  during backfill.
- A proposal never affects official totals, exports, Billing, or Change Orders.
- Applying an exact reviewed proposal is one transaction and cannot post twice.
- A stale official line or proposal version fails with an actionable conflict.
- Protected financial values never enter a payload returned to an unauthorized
  reviewer or contributor.
- Direct client table writes cannot bypass proposal/review/application authority.
- Existing zero-value deletion safeguards and immutable historical references remain.
- Every applied line records actor, timestamp, shared change-set identity, and
  field-level before/after values.
- Jobs without an assigned Project Manager remain usable under the documented
  compatibility boundary until assignment rollout is explicitly completed.

## Deferred, separate slices

- The deadline-driven monthly Forecast cycle (`FCT-001` through `FCT-003`) follows
  this financial authority foundation.
- Service Call cost-report import/reconciliation remains a separate staging-ledger
  workflow.
- Primary Emergency Override remains last; it must not be used to compensate for
  missing ordinary Financials authority.
