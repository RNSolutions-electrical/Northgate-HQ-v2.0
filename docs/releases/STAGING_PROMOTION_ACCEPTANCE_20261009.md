# Whole-release Staging acceptance — October 9, 2026

**Status:** Ready for owner browser testing on `staging.rnsolutions.net`; not approved for Production. Use Staging test records only. Report the Job/record name and exact error or screenshot for any failure. Do not enter real Production data here.

**Sync marker:** `STAGING-PROMOTION-ACCEPTANCE-READY-20261009-1224-EDT-RYAN_NORTHGATE` · Recorded 2026-10-09 12:24 EDT on `RYAN_NORTHGATE`.

## Owner checks

1. **Access boundary.** Sign in as `CRNCMK@gmail.com`; confirm the Staging banner and E.O.S. tracker are visible. You previously granted the second test account E.O.S. access, so it may now see E.O.S.; do not change roles just for this check. If you still have an ungranted test account, confirm it cannot open E.O.S. Confirm a Job not assigned/authorized to that user does not expose its financials.
2. **Change Orders and Silas.** On a Staging test Job, start a guided Change Order, save it with incomplete details, leave and resume it, then add a priced line and use the handoff. Check the client-facing preview. Separately verify that a normal draft with a positive and a negative line shows the correct net; submission/approval still requires valid cost-code assignments. Do not approve a QA Change Order on a real Production Job.
3. **Billing continuity.** On a Staging Job with an existing Pay App, inspect its historical amount, then use a controlled CO revision test if you have a suitable test record. Earlier Pay Apps must remain unchanged; the revised CO family should remain one continuing billing item, not a duplicate. Tell me if no suitable Staging test record exists rather than fabricating historical billing.
4. **Cost report and Documents.** Upload a harmless PDF cost report to a Staging test Job. Select only the intended divisions and financial fields. Confirm it appears in Documents and opens the same file. Revenue from the report must remain preview-only and must not silently create Billing/SOV revenue.
5. **Everyday navigation.** Open an Estimate and a Vehicle detail page, reload each, and confirm the details still load. Open Inventory and confirm the catalogue/location filters load without 403 errors. On a Job assigned to your test account, check the My Work navigation reaches that Job.

The owner previously passed the E.O.S. award, link/unlink, reversal, access, and guided-CO flows individually. This list checks the combined Staging candidate and cross-module regressions; it does not ask for another exhaustive E.O.S. workflow run.

## Technical evidence and remaining gates

- The October 9 isolated Production-backup rehearsal passed the targeted schema, E.O.S. permission/award-reversal, guided-draft, and financial-baseline checks. See `STAGING_PROMOTION_REHEARSAL_20261009.md`. Its temporary database was deleted.
- The offline Production E.O.S. importer is insert-only and atomic. It preserves 41 source pursuits, 29 exact client labels, eight blank clients, six unresolved manager labels, five source Job numbers as text only, and five historical Awarded rows without inventing Job links. On Staging, rollback-only tests showed both a rerun with zero inserts and 41 synthetic inserts; a read check confirmed zero synthetic records remained.
- `sql/production_guided_co_targeted_candidate_20261009.sql` is **not a numbered or applied migration**. It refuses an unexpected target schema, preserves Production's current draft-save function, and revokes anonymous execute on the new guided RPC before commit. A final CLI-created migration and fresh Production-schema review remain required.
- Explicit Node suite: **287/287 pass**. The bare `npm test` command hung while Vite's concurrent optimizer encountered a Dropbox `EBUSY` rename; the explicit suite completed. A placeholder-key Staging-identity compile passed (2,261 modules); that output is not deployable. A Production-configured build remains required.
- Netlify reports the current Staging deploy `6ac8f34d64056c0008c70b75` is ready for app commit `8acf959`. All later committed Staging changes through `d864b67` were documentation or offline release-preparation files; the accepted app build is the current deployed candidate. The new local import/candidate-SQL files in this working tree are not deployed.
- No Production migration, E.O.S. import, merge, release tag, or deploy is authorized yet. Reconfirm a fresh Production backup and obtain separate owner approval before those steps. Database rollback requires a reviewed forward repair; a frontend rollback alone will not undo schema changes.
