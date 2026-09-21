# V5 Change Order reconciliation readiness

**Mode:** Production Mode

**Prepared:** 2026-09-21

**Implementation:** Production migration applied and verified; paired client release pending deployment

## Completed

- Added a fail-closed database trigger that evaluates canonical v5 actions for
  Change Order creation, draft/revision edits, submission, signed authorization
  and decision certification, official denial, archive, and approved-order void.
- Kept every existing RPC permission check, workflow-state check, audit write,
  signed-document requirement, and atomic financial-posting operation in place.
- Kept the trigger function unavailable as a client RPC.
- Added focused regression coverage for lifecycle mapping, project context,
  fail-closed denial, and function exposure.
- Added a v5-scoped Job Assignments RPC and UI control for `member`, `lead`,
  `superintendent`, and `project_manager`. Project Manager selection is limited
  to employees whose business role is Manager or Director, and the existing
  database constraint remains authoritative.
- Project-role changes require a reason because Project Manager status changes
  financial approval scope; routine assignment/removal retains automatic audit
  notes when no prose is supplied.

## Production readiness finding

The production database currently has:

- 9 active regular jobs;
- 22 active project assignments, all with `assignment_role = member`;
- 0 active `project_manager` assignments;
- 4 active jobs containing Change Orders.

The v5 action `CFG-009` requires an assigned Project Manager or an authorized
Director before an approved Change Order may post to Financials. Enabling that
gate now would remove the existing Manager posting path because no job has an
explicit Project Manager assignment.

For that reason, the local migration intentionally leaves approval/posting on
the existing atomic RPC and does not yet add the independent `AUD-016` posting
trigger. This is an explicit compatibility hold, not an implicit fallback.

## Required next slice

1. Deploy the paired Job Assignments interface.
2. Have an authorized Director assign Project Managers to current jobs rather
   than inventing or automatically backfilling business responsibility.
3. Verify Manager and Director Change Order approval on a representative job.
4. Enable `CFG-009` on the Change Order transition and `AUD-016` on immutable
   financial postings in a follow-up migration.

## Verification performed

- Combined financial-export and v5/Change Order tests: 11 passed, 0 failed.
- Full test run: 183 passed; one environment-only failure because the existing
  estimating preview server already occupied port 5320.
- A local production build passed in an isolated release directory with explicit
  non-production placeholder environment values; no placeholder bundle will be
  deployed.
- The production migration was applied successfully. Live verification confirmed
  both scoped assignment RPCs, the Change Order trigger, authenticated-only RPC
  access, 22 unchanged active assignments, and zero Project Manager assignments.
- Supabase advisors were run after the migration. They reported existing project
  advisories, but no new finding tied to the added trigger or scoped RPCs.
