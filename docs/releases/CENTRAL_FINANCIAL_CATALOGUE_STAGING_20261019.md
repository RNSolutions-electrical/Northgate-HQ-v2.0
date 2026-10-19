# Central financial catalogue and project naming — Staging only

Ryan approved the shared financial Divisions/Cost Codes manager and optional project name overrides on 2026-10-19. This candidate extends the verified signed Remaining Budget patch while preserving all existing Staging changes. Production promotion and Production catalogue mapping remain unapproved.

## Scope and behavior

Developer → Systems now has a searchable financial catalogue manager for divisions/cost codes, versioned saves, add/retire/reactivate, full audit and reviewed workbook import/export. Used identities, division assignments and classifications require a separate impact review. Additions do not insert rows into jobs. Inventory `cost_codes` remains separate.

Job Financials inherits current master names, shows a project override and the catalogue original, and supports reset to the current master. Approvers use the existing atomic financial save; contributors use the existing proposal/review workflow. The scoped resolver includes referenced retired entries only within already-authorized job financial access. Stable grouping keys, the Add Line picker, cost-report preview, current financial exports and CO selection/default labels use effective names. New job-only custom lines remain clearly identified.

Stored job descriptions/names, categories, amounts, billing values, historical documents, issued Pay App snapshots and original UUIDs are preserved. Actual Remaining Budget remains signed current budget minus actual; forecast remains distinct. No transfers, balancing entries, new CO postings, forecast autofill, data reclassification or permission-rank change was performed.

## Validation

- Explicit named aggregate: **367 total, 366 passed, one skipped, zero failed**. Plain `npm test` discovers an unbounded browser-serving fixture; the explicit repository aggregate avoids that harness.
- Exact migration on disposable PostgreSQL 18.4: **nine scenario groups pass**, including full rollback, 531-line/36-division mapping integrity, no helper inserts, inheritance/override/reset, successful/stale import, used-code denial, grants/job scope, real reviewed application/idempotence, direct audit-bypass denial and two-connection races. Final original-row financial fingerprint is unchanged after the whole sequence.
- Catalogue UI: **three broad groups pass** (desktop, phone and contributor proposal), covering master/division/line edits, inheritance, reset, collapse state, stale rejection/draft retention, used-field restrictions, additions without job insertion, retirement/reactivation, workbook preview and naming-only payloads.
- Remaining Budget UI: **40 groups pass** on desktop/tablet/phone, including Toro split-line -$1,229.59, cost movement invariance, credits, zero/negative budgets, overrides, reversals, decimals, scopes, archives, independent forecasts and label/creation/import paths.
- Existing Add Line suite: **seven groups pass**. Existing financial override/protected-reason/contributor and estimate review scrolling suites pass.
- Final synthetic Staging-identity build, visual desktop/phone review and `git diff --check` pass. Existing xlsx/chunk warnings remain. Synthetic build output is never deployed.

Evidence is held in ignored `.temp/catalogue-qa/`, `.temp/catalogue-ui-qa/`, `.temp/remaining-budget-qa/` and test logs. Review/dry-run details: `docs/reviews/CENTRAL_FINANCIAL_CATALOGUE_STAGING_20261019.md`.

## Release receipts

Migration source: `supabase/migrations/20261019125143_central_financial_catalogue_names.sql`, created using Supabase CLI 2.121.0 and applied only through the supported Staging migration tool. Exact SQL SHA-256: `31bf5499d9fa4ac4985897d32bd1ca9cc73774063fe3c99a9a10e24a6c8f8fb5`.

Applied successfully to **Staging Supabase `fazfwzbuesvzhgodckiw` only**, ledger **`20261019133823 central_financial_catalogue_names`** at 2026-10-19 13:38:23 UTC. The supported migration tool assigns its ledger timestamp separately from the CLI-generated source timestamp above.

Post-application: 12 master divisions, 177 catalogue entries, 531 linked financial lines, 36 linked job divisions, zero job name overrides and 757 new mapping/seed audit records. No financial/helper rows were inserted. These exact before/after fingerprints match:

| Original data (new metadata/timestamps excluded where applicable) | MD5 before and after |
| --- | --- |
| Financial rows/identities/amounts/categories/copied text | `351092fc71cbc301bad0e70f5e878cb3` |
| Original project divisions | `cc40d8d1a1133e1540b2cae3c3741a25` |
| Revenue rows | `95a0c3f9531833e632661ab22122fd51` |
| Issued Pay App line snapshots | `1d315a51ad61872c279ba776146d4238` |
| Legacy inventory cost-code table | `d41d8cd98f00b204e9800998ecf8427e` |

Existing financial baseline triggers advanced each job by 177 metadata updates: Smoke Test 798→975, Temporary Test Job 229→406, Toro Test 248→425. Their actor is `system:job-financial-write`; no trigger was disabled. All original job financial values remain unchanged.

RLS is enabled on the new master table. Anonymous master read/save, authenticated direct master update and authenticated direct internal division-name apply are denied. Advisor comparison adds no error, anonymous-execute, missing-RLS, missing-policy, mutable-search-path or unindexed-FK finding. The three intentional authenticated, guarded RPCs add the standard [authenticated SECURITY DEFINER notice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable); they enforce existing Developer/job/line bounds internally. One new [unused-index informational notice](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) concerns the new division reference index. Existing unrelated advisor findings remain unchanged.

Verified publication:

- Exact code commit **`fc7b1663473b2392a62cec67db437839c7b3a1bf`**, pushed as a fast-forward to `staging` from receipt `c711e4f`. No main/Production push.
- Dedicated Staging site **`431ce717-1a06-45a0-9d7a-8acd06a67dde`**, ready Netlify deploy **`6ad61e02d7b472b67c3e7297`**, published **2026-10-19 13:41:47.757 UTC**. Netlify confirms branch `staging`, exact commit above, no error and no standard/enhanced secret-scan matches across 1,053 files. Its `production` context is the primary deploy of the dedicated Staging site.
- Review **https://staging.rnsolutions.net/developer** → Systems → Financial catalogue, and **https://staging.rnsolutions.net/jobs** → Toro Test → Financials. Immutable deployment: **https://6ad61e02d7b472b67c3e7297--northgate-hq-staging.netlify.app**.
- Strict-TLS custom and immutable Jobs/developer/estimates deep links return HTTP 200. Both serve identical JS `/assets/index-Bq5BOgvB.js` (SHA-256 `691cadc0f1cae728c106cf7f56660a5dbca38dda5e9ce4d82414bb0ea66099be`) and CSS `/assets/index-DHoUbRiE.css` (SHA-256 `985a2e7a2fcc3cf40beff4dfac3138fac99faa30cb6db107f376105ee52e7aa1`). The published bundle contains the new catalogue/name RPCs and controls, isolated Staging Supabase/Clerk identity, and no local synthetic build keys.
- Signed-in Developer read-only smoke: Toro Test Division 04 shows current budget $5,500.00, actual $6,729.59 and signed Remaining Budget **-$1,229.59**, unchanged across expand/collapse. Its budgeted labor and zero-budget material remain separate; material shows **-$6,729.59 / OVER BUDGET**, zero rows are neutral. Existing completion forecasts remain separate (this live test job currently has $0 forecast balance). Catalogue-name indicators and line override dialog load with the actual master original. The dialog was cancelled.
- Live Developer → Systems manager reads canonical Division 07 and its cost codes, shows three existing job uses, and disables the used division code in its editor. Search/tabs and opening/cancelling the editor work. No save, import, retire/reactivate, financial write or proposal application was performed in the live smoke. The manager tab is left open for Ryan.
- Production remains on main **`1e0c5635b6289b4e2f4c55eaa8fb81b9cb8152a0`**, deploy **`6ad28722f48eddc8eb974f91`**. A final read-only Production check confirms no new master table and zero catalogue migration ledger rows.

Receipt-only follow-up is committed with `[skip ci]`; it does not replace the verified application deploy above. Ryan acceptance and any Production promotion remain separate.

## Recovery and limits

The migration is additive and transactionally validates original financial/history fields. Existing timestamp and financial baseline triggers remain enabled, so metadata backfill advances concurrency tokens; pending proposals must be reloaded against the new baseline. Preserve the added links/overrides/audits if a UI rollback is needed. Do not drop columns or restore old RPCs after new naming writes without a separately reviewed forward repair.

Permission helper behavior and generic v5 persistence are synthetic in the local database harness; existing rules were reused unchanged. Live verification uses the already-authorized Developer session and read-only inspection. No live financial save or real proposal application is needed for the smoke test. Production mapping still contains custom/unmatched/missing-link decisions and must be separately reviewed. Existing unrelated advisor findings remain outside this release.
