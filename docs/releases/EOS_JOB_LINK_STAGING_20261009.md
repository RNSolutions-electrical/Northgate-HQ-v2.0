# E.O.S. Job association — Staging preparation, October 9, 2026

**Sync marker:** `EOS-JOB-LINK-STAGING-20261009-0943-EDT-RYAN_NORTHGATE`

**Recorded:** 2026-10-09 09:43 EDT (UTC-04:00), machine `Ryan_Northgate`, checkout `job-assignment-fix`, branch `dev-eos-pursuit-tracker-20261006`.

**Release state:** Database changes applied only to isolated Staging; UI is prepared locally but intentionally **not yet deployed** while Ryan tests Silas on Staging. Production app, database, and branch are unchanged.

## Owner decisions

- Initial Production E.O.S. workbook import should not automatically link its pursuits to Jobs, even where an exact Job number exists. Authorized E.O.S. users need an explicit link/change/unlink action because a service call can later become a full Job.
- Job association is independent of phase/status. Linking or unlinking does not award or un-award a pursuit, create/delete a Job, or change Job budget/financials.
- Preserve each ambiguous source client label separately and exactly as written; leave eight source-blank client fields blank. Do not infer that similar labels identify the same client. A future reviewed consolidation can be designed separately.

## Implementation boundary

The existing `eos_award_pursuit` atomic handoff remains the only way to transition a pursuit to Awarded. The new `eos_set_pursuit_job(p_pursuit_id,p_job_id,p_expected_job_id)` RPC changes only `job_id` after the same explicit E.O.S. permission check, active/accessible Job check, row lock, and stale-link comparison. `NULL` unlinks. Direct table UPDATE remains unavailable to `authenticated`; `anon` cannot execute the RPC. The existing row audit trigger records actor, timestamp, and before/after Job IDs. An awarded pursuit may be unlinked without undoing its award; a later award retry cannot create another Job and instead directs the user to link explicitly. The UI separates **Link/Change Job** from **Award** and keeps the existing Job navigation.

Two local Supabase CLI-created migrations capture the change:

1. `20261009133828_eos_pursuit_job_link.sql` — guard, link RPC, and linked-pursuit award handoff.
2. `20261009134158_eos_prevent_reaward_after_unlink.sql` — prevents a second Job from an award retry after deliberate unlink.

The corresponding isolated Staging migration-ledger versions are `20261009134035` and `20261009134216`. Production must receive a reviewed, targeted delta later, not a blind replay of the Staging ledger.

## Verification

- Rollback-only `tests/eosPursuitJobLink.live.sql` passed on Staging. It covered link/unlink, unchanged phase/status and Job budget, stale-link rejection, ungranted Manager rejection, award of a pre-linked pursuit, unlink of an awarded pursuit, and prevention of a second Job. Follow-up read found zero fixture pursuits, Jobs, users, and audit rows.
- Staging retained 41 active source pursuits. One pre-existing active pursuit remains linked to a Staging `Test Award` Job; this work did not alter it.
- The explicit Node suite passed **298/298** and a Staging-identity compile-only Vite build passed. The build used placeholder public keys and does not prove signed-in browser behavior.
- Supabase Security Advisor flags the authenticated-callable SECURITY DEFINER RPC as expected; it is deliberately exposed only to signed-in callers and checks explicit E.O.S. authority and Job access inside the function. Direct table UPDATE and anonymous RPC execution remain denied. Other inherited advisor findings are outside this change.

## Remaining gates

1. Wait for Ryan's ongoing Silas test before pushing the UI change to `staging`, to avoid a mid-workflow refresh. The new Staging database functions are backward compatible with the currently published E.O.S. UI.
2. Publish the UI to Staging, verify the exact ready deploy, then signed-in test link/change/unlink with a safe Staging pursuit and Job. Confirm phase, value, Job budget, and audit remain correct. Leave or restore the test relationship deliberately.
3. Build an idempotent Production import that leaves all source pursuits unlinked and preserves source labels; do not reuse the old Staging script's optional Job-number auto-linking behavior.
4. Rehearse the Production-targeted schema delta on a fresh isolated Production restore with historical award and permission cases before requesting promotion approval.
