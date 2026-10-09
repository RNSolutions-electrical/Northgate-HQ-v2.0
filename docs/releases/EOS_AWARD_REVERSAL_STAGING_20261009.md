# E.O.S. Award Reversal — Staging, October 9, 2026

**Sync marker:** `EOS-AWARD-REVERSAL-STAGING-20261009-0958-EDT-RYAN_NORTHGATE`

**Recorded:** 2026-10-09 09:58 EDT (UTC-04:00), machine `RYAN_NORTHGATE`, checkout `job-assignment-fix`, branch `dev-eos-pursuit-tracker-20261006`.

**Scope:** Isolated Staging only. Production app, database, and branch are unchanged.

Ryan reported that the E.O.S. Award Reversal screen said it was unavailable. This was intentional in the prior implementation: the UI had no reversal action and the database guard rejected an Awarded-to-other-phase transition. Ryan approved restoring the pre-award phase while retaining the Job link and Job itself, requiring a reason and audit.

The new action restores the recorded Pursuit/Estimate phase; Job link, Job row, and Job financials remain unchanged. For imported Awards without an auditable pre-award phase, the user must explicitly choose Pursuit or Estimate. Five of the 41 active Staging pursuits currently have this missing phase history. Reversal requires E.O.S. authority, the current Job link for a stale-write check, an Awarded record, and a nonblank reason. The existing row audit and a reasoned `change_logs` update capture before/after data, actor, and time. Direct phase edits remain blocked. A previously awarded pursuit without a Job link cannot silently create a second Job on re-award; it must be linked to an existing Job first.

Two tracked migrations correspond to Staging ledger versions `20261009135711` (`eos_award_reversal`) and `20261009135756` (`eos_award_reversal_audit_fix`). The second corrects the audit action to the established `update` value after a rollback-only test found that `change_logs` rejects custom action names. Apply both in order in any later environment. Do not replay the entire Staging migration history into Production.

Verification: the rollback-only E.O.S. Job-link/reversal SQL test and original E.O.S. regression passed after both migrations; fixture pursuits were absent afterward and the active count remained 41. Anonymous execution of the new RPC is denied; authenticated execution still requires the function's explicit E.O.S. authority check. E.O.S. Node tests passed 8/8, the explicit test-file suite passed 281/281, and a Staging-identity Vite compile-only build passed. The default `npm test` command failed solely because the separate estimating Vite harness encountered a Windows `EBUSY` lock on `node_modules/.vite/deps`; a normal build to `dist` also hit an `EPERM` lock, so the successful compile used a fresh temporary output directory. The pre-existing security-advisor findings remained otherwise unchanged; one expected authenticated-callable SECURITY DEFINER function was added.

The UI was published to Staging by ready/current Netlify deploy `6ac8f34d64056c0008c70b75` from exact commit `8acf959f8f218d0032ce1b87c025a685e833ecdc` at 2026-10-09 10:00:06 EDT. The Staging site reports no deployment error. Production remains unchanged.

Remaining: owner-test a reversal in the signed-in browser on a safe pursuit. Confirm that the phase and Awards total change, the Job link remains, the Job's budget is unchanged, and the reason appears in audit history. Production promotion remains a separate reviewed decision.
