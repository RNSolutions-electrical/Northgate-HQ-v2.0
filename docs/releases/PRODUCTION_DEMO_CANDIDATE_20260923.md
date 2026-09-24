# Northgate HQ Production demo release candidate — NOT APPROVED FOR PROMOTION

**Prepared:** 2026-09-23 21:21 EDT, RYAN_NORTHGATE
**Mode:** Production Mode
**Candidate branch:** `release/production-demo-candidate-20260923`
**Production base:** `0340cdf8cc4a93f41cce8ed5a40553161e86314f` (`origin/main`)
**Release version/tag:** Not assigned. Do not tag or create a GitHub Release until owner acceptance.

## Scope boundary

Only three features belong in this release: budget-health presentation on Job Financials; four informational Job responsibility slots; and separate percentage inputs for line-specific electrical markup and overall General Contracting markup. No Staging environment/authentication changes, Silas guided workflow, financial import changes, document-storage changes, uncoded-draft changes, or dashboard alerts belong here. The candidate branch is a descendant of the Production base, not a merge of `staging`.

## Database manifest, in order

1. `20260923120000_job_responsibilities_demo.sql` — additive responsibility table, constrained read/write RPCs, RLS with no direct client table access, audit trail.
2. `20260923121000_change_order_line_markup_rates_demo.sql` — nullable line markup rate and atomic draft-save wrapper; historical dollar markup remains authoritative.
3. `20260923121500_job_responsibility_serialization_demo.sql` — serializes responsibility changes on a Job before recording before/after audit data.
4. `20260923123000_change_order_overall_markup_demo.sql` — nullable overall rate, one tagged overall-markup pricing line, unique partial index, draft-save wrapper and revision-copy adaptation.

Production was inspected **read-only**. It has the existing Jobs, user permissions, audit, Change Order and financial-line structures these migrations reference. The existing job-access and Department-read functions have a second argument with a default, so the one-argument calls in the new RPCs are valid. It does **not** yet have the four new objects/rates/RPC. There are 45 existing Production Change Orders (13 approved, 19 submitted, 9 draft, 2 denied, 2 voided); the migrations do not backfill or recalculate them. The revised `revise_job_change_order` function preserves existing authority and behavior while copying the new markup metadata.

Do not apply all `staging` migrations to Production. Staging contains five other migration files and separately evolved workflows. The Staging migration ledger also records some demo migrations under tool-generated version numbers that differ from these repository filenames; reconcile the intended Production migration manifest explicitly rather than inferring it from Staging history.

## Calculation and display contract

- Each line markup percentage applies only to that line's material/labor/equipment/subcontract/other subtotal.
- Overall GC markup applies to the **sum of line totals after their individual markups**.
- The overall amount is a distinct financial line, so existing submission/approval posting sums to the full contract adjustment. The selected active Job financial line is required for a nonzero overall rate.
- Existing submitted/approved Change Orders keep their stored dollar values. Existing draft lines with unknown historical percentages remain in legacy-dollar mode until explicitly converted.
- Browser preview uses deterministic decimal-to-cent rounding aligned with Postgres numeric rounding, including half-cent boundaries and negative credits. The previous floating-point implementation produced one-cent mismatches for inputs such as $6.25 at 20.24%; that defect was fixed in this candidate and must be deployed to Staging before final acceptance.

## Evidence collected, not yet full acceptance

- Current Staging integration of the earlier candidate passed 234 selected repository tests and built. The owner visually confirmed the Electrical Labor line turned yellow at $56,560.61 actual on a $63,100 budget (10.36% left).
- This narrower Production candidate passes 218 selected repository tests and a Production-style Vite build using build-only placeholder keys. An exact-cent sweep comparing the browser rate helper with integer arithmetic found zero mismatches after the rounding fix.
- Prior rollback-only Staging database tests confirmed a $5,000 line + 15% = $5,750, then 10% overall = $575, total $6,325; repeated draft save did not compound markup; submission retained $6,325 price and $5,000 internal cost. These are database tests, **not** authenticated browser acceptance.
- The pinned dependency installation reports four inherited high-severity advisories. No dependency upgrade is part of this limited-scope candidate; triage before promotion.

## Remaining gates before Production

1. Integrate and deploy the cent-rounding correction to Staging; verify its exact live commit.
2. Owner tests all four responsibility slots (assign, replace, remove, same person in more than one slot) and confirms they do not grant access. Test Manager/Director authority and ordinary-User denial.
3. Owner tests new line-only markup, overall-only markup, both together, 0%, decimal %, draft save/reopen, submission, client PDF, and an existing historical Change Order. Confirm an approved revision retains both layers without changing its predecessor.
4. Reconcile the four migration files against a Production-schema clone or an equivalent non-production rehearsal. Do not use a live Production transaction as a substitute; DDL can lock active tables even if rolled back.
5. Verify a recoverable pre-release Production database point and its restore path; record current Production Netlify deploy, migration ledger, and relevant Storage scope. Database backup status is not yet confirmed.
6. Review exact final diff, security/RLS advisor results, dependency advisories, and known issues. Obtain explicit owner acceptance and promotion approval. Then choose an unused pre-1.0 version, tag the accepted commit, create a GitHub Release, and promote deliberately.

## September 23 release-gate recheck (21:40 EDT, Ryan_Northgate)

- Owner accepted the line and overall markup, assignment layout, and four informational assignment slots on Staging. The Staging-only assignment token fix deployed at `06bd838`; owner confirmed assignments work.
- Re-ran the narrow candidate test suite: 218 passed, 0 failed. Existing Staging integration separately passed 234 tests and a Staging build. Production remains at its prior code and schema.
- Supabase security advisor on Staging flags the new `job_responsibilities` table as RLS-enabled with no direct policy. This is intentional: direct access is revoked; authenticated, authorization-checked RPCs provide access. It also flags the authenticated SECURITY DEFINER RPCs, which are intentionally callable after in-function permission checks. Existing unrelated advisor findings remain and are not created by this patch.
- Dependency audit found four inherited high-severity advisories in Clerk, React Router, and xlsx; the candidate does not change dependencies. These require security triage, not an automatic `npm audit fix --force`.
- Owner approved a temporary $0.01344/hour schema-only Supabase rehearsal branch. Branch creation replayed historical migrations unsuccessfully (`MIGRATIONS_FAILED`); the first demo migration could not find `public.jobs`. The branch was deleted immediately and its absence verified. No Production data or schema was changed. Exact Production-schema migration rehearsal remains **unproven**; do not claim this gate passed. Existing Staging did apply all four demo migrations, but its schema has other Staging-only changes and is not an exact Production clone.
- Production backup inventory/restore path remains unverified. Owner is checking the Production Database → Backups dashboard; do not start a restore. Do not promote until a current, usable recovery point and a safer equivalent migration rehearsal are identified.

## Recovery evidence and rehearsal handoff (2026-09-23 21:47 EDT, Ryan_Northgate)

- Owner-supplied Production Supabase screenshot shows scheduled **physical** database backups, with the latest visible recovery point at **2026-09-23 07:47:29 UTC** and several earlier daily points. The dashboard offers both Restore and Restore to new project. This verifies backup availability and a documented restore path, but **no restore has been tested**. Storage objects are explicitly excluded from these database backups.
- Supabase's restore-to-new-project option would copy actual Production database data, including Auth users. The organization project base quote is **$10/month**; the dashboard may add mirrored compute/disk costs. Owner authorized a short-lived copy only if the displayed monthly total is **$15 or less**. The existing connector cannot invoke restore-to-new-project or delete a project; do not use its `restore_project` action on Production.
- Owner chose to wait until back at a computer before creating the temporary restored project. At that point: use the **Restore to new project** tab (never the ordinary Restore action), select the September 23 backup, confirm the displayed cost ceiling, and send the new project reference. Codex can then apply the four candidate migrations to that isolated copy, run integrity/security checks, and report results. Owner must remove the temporary project in Supabase afterward because the connector lacks project deletion.
- Until that rehearsal succeeds, **Production promotion remains on hold**. The prior failed schema-only branch was deleted and no Production schema/data was changed.

## September 24 Production-backup clone rehearsal (10:00–10:10 EDT, RYAN_NORTHGATE)

- The owner authorized restoring the **September 23 07:47:29 UTC** Production physical backup to a separate, temporary RNSolutions Supabase project, `northgate-demo-release-rehearsal-20260924` (`ikwmjjceecrskygrvyxq`). The Supabase dashboard quoted **$10.18 additional monthly compute/disk**, below the owner's $15 ceiling. The clone became `ACTIVE_HEALTHY`. This did not invoke Restore on the Production project.
- The restored clone had the same 186 migration-ledger entries as Production before rehearsal. Its 53 Jobs reflect the September 23 backup; live Production had 54 Jobs by September 24. Both had 45 Change Orders, 46 lines, $320,041.68 total Change Order price, and $311,435.42 total Change Order internal cost. The snapshot is therefore a schema/data rehearsal at the selected recovery point, not an assertion that all current Production data was copied.
- Applied only the four demo migrations in the manifest above, sequentially, to the clone. All succeeded. Historical Change Order counts and financial aggregates stayed unchanged. There was no backfill of markup rates, no new responsibility assignment, and no historical financial recalculation.
- On the clone, rollback-only tests exercised authorized Manager/Director responsibility assignment, same person occupying two different slots, removal, and ordinary-User denial. A rollback-only draft test exercised three lines ($5,000 at 15%, $3,000 at 10%, $2,000 at 0%) plus 10% overall markup: final price $12,155 and internal cost $10,000. Repeating the save did not compound markup; clearing overall markup produced $11,050. After rollback, zero synthetic Change Orders and zero responsibility rows remained; historical totals were still exact.
- Confirmed the responsibility table is RLS-enabled with no direct authenticated SELECT and the RPCs are not executable by `anon`. The advisor reports expected `rls_enabled_no_policy` and authenticated `security_definer` notices for the RPC-only design. Review other existing advisor findings separately; this rehearsal did not eliminate them.
- This proves the four SQL migrations run on a Production-backup clone and the sampled data paths reconcile. It does **not** prove every authenticated browser flow, full Production traffic compatibility, Storage-file recovery, or the inherited npm advisories. Production code, schema, and data remain unchanged.
- After explicit action-time confirmation, permanently deleted **only** the temporary clone `ikwmjjceecrskygrvyxq`. Supabase showed a success notice and the RNSolutions project list no longer contained it. Production project `keogysnoukbendfkfjcn` and Staging were untouched. The cloned data and test schema are no longer recoverable through the project's normal flow; the original Production backup remains separate.

## Owner browser acceptance and presentation follow-up (2026-09-24, RYAN_NORTHGATE)

- Owner accepted the budget-health behavior but reported a status-badge overlap in the fixed-layout Financials table. The candidate CSS now constrains the badge to its own cell and allows wrapping; underlying classification and dollar calculations are unchanged. The owner has not yet visually retested this CSS adjustment on Staging.
- Owner accepted the four informational responsibility slots. The component already renders `display_name` before email. A read-only Production check found all eight active `user_permissions` records have non-email display names; Staging's test-profile email fallback does not predict Production's labels. No Production user data was changed.
- Owner verified line-specific and overall Change Order markup together and accepted the calculation.
- Owner clarified the intended submitted-record workflow: Return to Draft may edit before approval; an approved order requires an editable revision (`CO-001-R1`) retaining the original. This matches the existing status/revision approach and is accepted.
- Owner confirmed the authorization-document upload/view path with a disposable PDF. This is **not** equivalent to verifying every client-facing Change Order PDF amount; that separate amount/PDF check remains unproven in this browser pass.
- After the CSS fix, 215 scoped tests passed and the Production-style Vite build passed. A blanket `npm test` run had one unrelated failure because the repository's `scripts/serve-estimating-test.mjs` attempted to bind already-occupied port 5320; it is a server helper discovered by Node's test runner, not a failing assertion. No tests or running service were deleted or stopped.

The narrow release still requires final diff/advisory review, owner acceptance of the wrapped badge on Staging if desired, and explicit promotion approval. No Production deployment or database migration has occurred.

## September 24 Staging publication and final-diff review (11:07 EDT, RYAN_NORTHGATE)

- Published the same badge-wrapping CSS change to the Git-connected Staging site from `staging` commit `5a7fb1c7ab1611fc96058461b931a1833392f633` (`OAK-HARBOR-20260924-001`). Netlify deploy `6ab53c9389b326000865a499` is **ready** at `https://staging.rnsolutions.net`; the deploy reports that exact commit. Staging's previously unbuilt commit was documentation-only. Production Netlify deploy remains `6ab2d90c269cd800087bc95c` and was not touched.
- Staging branch verification: 231 scoped tests passed, 0 failed; production-style Vite build passed. The release candidate itself remains clean and includes only 14 changed files: the three approved demo features, four ordered migrations, focused tests, and handoff/release documentation. No Staging-only feature or migration is merged into the candidate.
- Staging security check: the five demo RPCs inspected (`read_job_responsibilities`, `set_job_responsibility`, `save_job_change_order_draft_with_rates`, `save_job_change_order_draft_with_all_markups`, `revise_job_change_order`) deny `anon` EXECUTE and allow authenticated callers subject to their internal checks. The new responsibility table is deliberately RPC-only with RLS enabled and direct table access revoked. The Supabase advisor's new `rls_enabled_no_policy` notice is expected for that design; its authenticated SECURITY DEFINER notices require this explicit grant/internal-check review.
- The Production Supabase advisor already reports four pre-existing SECURITY DEFINER views and 11 anonymous-executable SECURITY DEFINER functions, plus other legacy notices. These were not introduced by this candidate; they warrant separate security remediation and should not be silently attributed to the demo patch. [View advisor guidance](https://supabase.com/docs/guides/database/database-linter).
- Current `npm audit --omit=dev` reports **four inherited high-severity packages**: `@clerk/clerk-react` 5.61.3, `react-router`/`react-router-dom` 7.9.4, and `xlsx` 0.18.5. The audit suggests non-major upgrades for Clerk and Router; it offers no registry fix for `xlsx`. This candidate changes none of them. Treat dependency remediation as a separately tested security slice, not `npm audit fix --force` in the demo patch. Relevant advisories: [Clerk](https://github.com/advisories/GHSA-w24r-5266-9c3c), [React Router](https://github.com/advisories/GHSA-2w69-qvjg-hvjx), [SheetJS](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6).
- Remaining acceptance before Production: owner visually verifies the wrapped warning badge on Staging and, if the client-facing PDF total is part of the demo, exports a draft with known markup to compare its PDF total to the screen. Then explicitly approve Production promotion. Before migration/deploy, confirm a current recovery point (the September 23 restore was proven, but is no longer a current pre-release point), choose an unused pre-1.0 version/tag, and create the GitHub Release under the established process.

## Final owner acceptance follow-up (2026-09-24, RYAN_NORTHGATE)

- Owner confirmed the wrapped budget-health badge no longer overlaps on Staging and the generated Change Order PDF total matches the screen. The prior PDF-total gate is now passed.
- Owner requested that the *client-facing PDF row* for overall markup read **General Contractor Fee**. The candidate and Staging PDF template use that wording. The internal control and persisted pricing-line description remain **Overall Change Order Markup** to preserve financial/audit terminology; no data migration or recalculation is involved.
- After this wording-only change, 215 candidate tests and 231 Staging tests passed; both Vite builds passed. Staging commit `a01c09950b4cd196007f7e372453710a5704459a` deployed as ready Netlify deploy `6ab543e65f5046000874a496` at `https://staging.rnsolutions.net`. The new PDF label has not yet been visually rechecked by the owner. Production remains unchanged pending explicit approval and a current pre-release recovery point.

## Rollback / incident plan

If a frontend regression occurs, redeploy the previously verified Production Netlify deploy without force-pushing or moving a tag. The four schema changes are additive and should normally remain in place during a code rollback; dropping columns, functions or tables after users create markup or responsibility data would destroy records. For a database/data incident, stop affected writes, preserve audit evidence, assess new records, and use a verified recovery point or controlled forward repair. A frontend rollback alone does not undo migrations or submitted Change Orders.

**Status:** release candidate preparation only. Production code, schema, data and deployment remain unchanged.
