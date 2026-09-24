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

## Rollback / incident plan

If a frontend regression occurs, redeploy the previously verified Production Netlify deploy without force-pushing or moving a tag. The four schema changes are additive and should normally remain in place during a code rollback; dropping columns, functions or tables after users create markup or responsibility data would destroy records. For a database/data incident, stop affected writes, preserve audit evidence, assess new records, and use a verified recovery point or controlled forward repair. A frontend rollback alone does not undo migrations or submitted Change Orders.

**Status:** release candidate preparation only. Production code, schema, data and deployment remain unchanged.
