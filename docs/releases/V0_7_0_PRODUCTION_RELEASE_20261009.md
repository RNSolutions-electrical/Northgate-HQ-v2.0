# Northgate HQ v0.7.0 Production release — October 9, 2026

**Status:** Published to Production. The owner approved promotion after accepting the combined Staging checks and the disclosed backup limitation.

**Sync marker:** `NORTHGATE-RELEASE-V0.7.0-PROD-20261009-1324-EDT-RYAN_NORTHGATE`

**Recorded:** 2026-10-09 13:24 EDT (UTC-04:00), machine `RYAN_NORTHGATE`, checkout `job-assignment-fix`.

## Code and deployment

- Immutable annotated tag and [GitHub Release](https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/releases/tag/v0.7.0): `v0.7.0` at `e178c64`.
- `main` was fast-forwarded from `36cf543` to the tagged candidate. The candidate commit had `[skip ci]`, so it did not deploy. An empty, non-skip trigger commit `aeb13f3` was then pushed to `main`; its Git tree hash `f1b66bf9edc8c6a92336823b8e660d4b18d54d07` exactly equals the tag's tree. No source files changed in the trigger commit.
- Production Netlify site `16adb4ff-83a9-4440-8aad-fcb820d55cac` published ready deploy `6ac922aa8f0252000885717d` at **2026-10-09 17:22:07 UTC** from `main`/`aeb13f3`. The deploy uploaded one page and seven changed assets, processed four redirects and three header rules, deployed two functions, and reported no secret-scan matches.
- Staging's accepted app deploy remained `6ac8f34d64056c0008c70b75` at `8acf959`; later Staging commits were release-preparation files or documentation. The v0.7.0 app tree is the accepted Staging app tree plus offline release-preparation files.

## Database and import

Production Supabase project: `keogysnoukbendfkfjcn`. Nine selective, additive migrations were applied in reviewed order and recorded by Supabase as:

1. `20261009171612` — `staging_promo_job_cost_report_documents`
2. `20261009171617` — `staging_promo_dashboard_job_responsibilities`
3. `20261009171623` — `staging_promo_dashboard_budget_health_acknowledgements`
4. `20261009171757` — `staging_promo_eos_pursuit_foundation`
5. `20261009171803` — `staging_promo_eos_pursuit_job_link`
6. `20261009171809` — `staging_promo_eos_prevent_reaward_after_unlink`
7. `20261009171815` — `staging_promo_eos_award_reversal`
8. `20261009171821` — `staging_promo_eos_award_reversal_audit_fix`
9. `20261009171839` — `staging_promo_targeted_guided_change_order_production`

The ninth used the CLI-numbered Production-only source `docs/releases/production-migration-candidate/supabase/migrations/20261009170611_staging_promotion_targeted_production.sql`. Supabase recorded its own execution version. The older Staging uncoded-draft migration was **not** replayed. Postflight: `job_budget_line_id` nullable for drafts; `guided_state` and guided RPC present; Production draft-save function fingerprint still `bbe14801752dc9fad7274cfe04984c79`; guided RPC execute `anon=false`, `authenticated=true`.

The offline importer matched seed SHA-256 `c2daa6371dcf28b38658db21ff907fbdedf0af6fe` and inserted exactly **41 pursuits**. Persisted checks: 41 source pursuits, 29 labeled clients, eight blank-client pursuits, five historical Awarded pursuits, zero Job links, and zero duplicate source identities. No manager links were inferred. Production has two conditional E.O.S. access grants for existing eligible accounts; no user accounts or roles were created.

Financial baselines matched before and after migration/import: 61 Jobs, 617 budget lines, 48 Change Orders, 15 financial postings, eight Pay Apps, 382 Pay App lines, 35 Documents; Original Budget `$6,958,067.85`, Actual Costs `$3,489,758.99`, CO posting deltas `$7,103.51`, and CO header prices `$354,512.41`.

Security advisor comparison: the pre-existing four security-definer-view ERROR findings, six search-path WARN findings, and 11 anonymously executable definer-function WARN findings remained at baseline. The RLS-with-no-policy INFO count rose from 21 to 22 for the intentionally closed E.O.S. grant table; authenticated definer-function notices rose from 217 to 229 for the new guarded RPCs. This release did not remediate unrelated baseline findings. [Security advisor reference](https://supabase.com/docs/guides/database/database-linter).

## Recovery and verification

- Latest completed scheduled Production **database** backup before promotion: **2026-10-09 09:04:29 UTC**. No point-in-time recovery add-on is enabled. The owner explicitly accepted proceeding under this recovery gap after stating no new information was added today. Supabase database backups do not include Storage objects; the October 9 isolated rehearsal copy had already been deleted.
- Explicit local Node suite: **287/287 pass**. Prior isolated Production-copy migration rehearsal passed targeted E.O.S./guided-draft tests without financial drift; the temporary copy was deleted. The Netlify Production build is ready and its secret scan has zero matches.
- Signed-in Production browser smoke on the published deploy loaded Dashboard/My Work, Jobs, Carolina Retina Job details, financial totals and Change Orders, and Inventory's 47-material list/location filters. The current `CRNCMK@gmail.com` session is a technical Developer without an E.O.S. business grant; direct `/eos` navigation redirected to Dashboard, as intended. An authorized Production manager's E.O.S. UI smoke test is still needed; do not describe it as complete.
- If an issue is found, stop writes in the affected workflow and use a reviewed forward repair. A frontend-only revert cannot undo schema/data changes; a database restore would lose post-backup writes and does not restore Storage objects. No restore or rollback was performed.

Cost-report revenue remains preview-only. Minor owner formatting ideas and the separate Inventory Management batch editor remain outside v0.7.0.
