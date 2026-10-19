# Reviewed financial package promotion - 2026-10-19

Ryan approved Production promotion after removing the inherited "Catalogue name"
hint from financial division headers and closing the gap before Add Line. Approval
covers signed actual Remaining Budget, central catalogue/project naming overrides,
the focused Job Edit menu, section-bounded sticky headers and that visual cleanup.
It does not authorize merging unrelated Staging work or changing the meanings of
unmatched Production codes. Ryan subsequently approved preserving all unmatched
entries as job-only custom lines and will reconcile them manually from his job
cost report. The required catalogue migration is now verified in Production;
the application publication receipt follows below when ready.

## Verified cleanup on Staging

Source `376dbf8090fa70dd45de7f01a49d43f0074b2a59` removes the inherited division hint
and its empty layout wrapper. Line hints, existing overrides/catalogue originals,
retirement status, permissions, name dialogs and reset behavior are retained.
The ordinary desktop header-to-Add-Line gap is now the existing 8.796875px CSS gap.

Dedicated Staging site `431ce717-1a06-45a0-9d7a-8acd06a67dde` published ready Netlify
deploy `6ad64572172aff953870faad` at **2026-10-19 16:29:57.916 UTC**, exact source and
`staging` branch confirmed with no deploy error. Review:
https://staging.rnsolutions.net/jobs . Immutable:
https://6ad64572172aff953870faad--northgate-hq-staging.netlify.app/jobs .

Strict-TLS custom/immutable pages and matching assets pass. JavaScript
`index-CcL-q7DJ.js` SHA256
`5eba025e5081dfae5a3c584da24eb3b80bd6fabd7b058fb51fa2e3e9b55c6d9b`;
CSS `index-CFpMAqNI.css` SHA256
`1b369a81dae546c60fb830877afca916c1f5eb5d45bafea001911061bbe3cae3`.
The new controls and isolated Staging identity are present; synthetic local keys
are absent. Local build output was not uploaded.

Final cleanup aggregate: **367 total, 366 pass, one skip, zero failures**. Staging
build and diff check pass. Five desktop/phone Edit/sticky groups verify both normal
and naming layouts, no inherited hint/empty wrapper, gap below 10px, dialogs/drafts,
permissions, section release, column labels and collapsed normal-flow behavior.
Three catalogue UI groups verify linkage, overrides/reset, master editing and the
contributor naming workflow. Desktop/phone screenshots were visually inspected.

Signed-in Developer Staging smoke on Toro Test confirms no inherited division hint,
compact gap, Edit > Division Names, existing catalogue/reset dialog, Cancel > Done,
Masonry sticky top 96.84375px beneath the actual shell/banner, retained column labels
and static collapsed header. Masonry actual Remaining Budget remains -$1,229.59.
No live name/reset/proposal/financial save was performed. Phone and other permissions
were checked using fixtures rather than additional live records.

## Exact release audit and prepared worktree

Production baseline: `1e0c5635b6289b4e2f4c55eaa8fb81b9cb8152a0` on `origin/main`;
published Production deploy `6ad28722f48eddc8eb974f91`.

The isolated `release/financial-catalogue-20261019` worktree is built from that
baseline. Only source/test/script/migration patches from approved commits
`f91bcdfa7ea1a32e50f795953e3b7c5c76a995ef`,
`fc7b1663473b2392a62cec67db437839c7b3a1bf`,
`1870886b16262763ec43176745d52ee2d67b0ee0` and cleanup `376dbf8090fa70dd45de7f01a49d43f0074b2a59`
were applied. All **38 selected files exactly match reviewed Staging bytes**.
The catalogue integration's EstimateHandoff change only resolves current catalogue
and job override labels; it does not import unrelated estimate-review behavior.

The existing Production estimate review viewport, WorkbenchRoute/workspace CSS,
their browser fixtures/scripts and Production release history remain at Production
baseline. Twenty-four differing Staging files are excluded, mostly historical
receipts plus those review-scroll files. No dependency/lockfile, currentBudget.js,
authorization helper or unrelated migration change is selected. The sole new
migration is `20261019125143_central_financial_catalogue_names.sql`, SHA256
`31bf5499d9fa4ac4985897d32bd1ca9cc73774063fe3c99a9a10e24a6c8f8fb5`.
Ignored `.temp/reviewed-release-manifest.json` records every selected file hash.

Against this exact isolated release: the same **366 pass/one skip** aggregate,
synthetic Production-identity build, five Edit/sticky UI groups, three catalogue UI
groups, 40 Remaining Budget/label groups, seven Add Line groups and existing
desktop/tablet/phone financial override/protected-reason/contributor workflows pass.
Exact migration rehearsal on disposable PostgreSQL 18.4 passes nine scenario
groups, including transactional rollback on failed preflight, value/history/identity
invariance, no CO helper insertion, role/job bounds, proposal application and races.
Permission helpers in that rehearsal are synthetic; live tests remain read-only.
Evidence is ignored under each worktree's `.temp/`.

## Production preflight and approved preservation decision

Read-only confirmed target: Supabase `keogysnoukbendfkfjcn` (`northgate-hq-v2.0`),
healthy PostgreSQL 17.6. Production has no `financial_division_catalogue` table and
has not applied this catalogue migration. Existing financial-save/proposal function
hashes exactly match the migration's guarded preflight:
`85be3ca12db88a0e88b3705b357e469b` and `02b8febabbe0a123d5b4238f5cde8810`.
No duplicate master codes, conflicting master division names, ambiguous active job
division codes, linked master/project division mismatches or invalid copied-name
lengths were found. Existing authorization helper definitions/grants are retained.

There are **667 total financial lines, 644 active** and 53 project divisions.
The exact Staging migration would map 630 lines and mark **37 unmatched lines
(36 active, one archived) as job-only custom**. Active unmatched codes include
03.21, 04.21, 07.31, 08.7, 16.00, 16.5, 16.99, CO, CO-MAT, PER-DIEM and one blank
accounting-baseline code. Their current descriptions/categories have real meanings;
none should be inferred into a different master entry.

Ryan approved leaving every unmatched code unlinked and preserving its exact code,
description, category, amounts, division links and history while explicitly
recording the job-only flag. He will make report-based corrections manually.
No automatic inferred catalogue match or business-data correction is included.

For matched codes, 180 differing copied descriptions would become explicit local
name overrides without overwriting their originals. All 434 existing category
differences remain unchanged. Six existing division names become local overrides;
all 348 existing missing physical division links remain missing. The patch does
not transfer costs, insert balancing/CO rows, fill/clamp forecasts or reclassify
financial categories. It reuses existing Developer/job/line authorization bounds;
no credential or broader security-sensitive access is required.

## Execution and recovery plan

1. Refresh refs, ready deploy and Production read-only snapshot. Recheck the exact
   mapping counts, guarded function hashes, uniqueness/length constraints and
   existing security/performance advisor baseline before any Production write.
2. Apply only the reviewed catalogue SQL through the supported migration tool.
   It has a five-second lock timeout, 120-second statement timeout and a single
   transaction. Its internal full-row comparisons exclude only added metadata and
   updated timestamps, and assert original financial identities/values/categories,
   divisions and revenue/issued Pay App history. A failure rolls back the schema,
   backfill, audits and financial-baseline changes; local rehearsal verifies this.
3. Compare original-row/history fingerprints, row counts, exact expected links,
   copied overrides, retained unmatched codes, no new helper rows, function grants,
   scoped reads and migration ledger. Existing timestamp/baseline triggers remain
   enabled; metadata mapping advances concurrency tokens and pending proposals must
   reload against the new baseline. No trigger bypass is permitted.
4. Commit/push only the isolated reviewed release to main, allowing the existing
   Production Git deployment. Verify ready deploy's exact commit, custom/immutable
   deep links, asset hashes, Production identity and authenticated read-only smoke.
   Do not submit business-data test saves in Production.
5. If the UI needs recovery, revert its release commit and deploy that forward
   through CI, retaining the additive catalogue links/overrides/audits. Do not drop
   the schema or restore old RPCs after naming writes. Any schema repair needs a
   separately reviewed forward migration preserving all new metadata/history.

The requested software-engineering skill was searched through the complete cloud
and executor catalogues and local/repository locations; it is unavailable. Existing
repository working/release instructions plus the Supabase and Netlify deployment
skills govern this bounded release. Production completion receipts will be appended
only after verified execution.

## Verified Production migration

Fresh preflight at **2026-10-19 16:43:53.871761 UTC** still matched all reviewed
mapping counts and function hashes, with no ambiguous code/division matches or
invalid copied names. Main remained `1e0c5635`; no intervening edits were overwritten.

Exact reviewed SQL applied through the supported migration tool to Production
`keogysnoukbendfkfjcn` as ledger **`20261019164425 central_financial_catalogue_names`**.
The ledger stores one 45,867-byte SQL statement, MD5
`fc7577ce65e5066c1f3d931276e787a2`, identical to the reviewed file (SHA256 above).

Post-application: **667 original lines, 630 linked, 37 job-only custom (36 active),
180 preserved local line names, 53 linked original project divisions, six local
division names, 12 master divisions and 177 master codes**. All 348 originally
missing physical division links remain missing. Zero mapping errors and no new
financial/CO helper lines. There are 910 explicit metadata/seed audit records;
all 3,851 earlier audit records remain byte-for-byte unchanged.

| Original data (new metadata/timestamps excluded where applicable) | MD5 before and after |
| --- | --- |
| Financial identities, amounts, categories and copied text | `4b0147c8e86f6f6fbacb48fcebebcfef` |
| Project divisions and original names | `c8e69dbe8709ead8dec8fe2a53697f00` |
| Revenue | `7416eaf8a56412abb1be49e956f7164a` |
| Issued Pay App lines | `ca2c142dc5ca7b9a7d177a7ebb86e799` |
| Legacy inventory cost codes | `87bb05e67ed040e068e54aa6cd847dab` |
| Existing audit history | `fb4f348703176309dd0999882241afbc` |

Per-job original/adjustment/actual/forecast/override sums and row counts also match.
Existing baseline triggers remain enabled: ten jobs' concurrency versions advance
by their 667 total metadata updates; one job with no mapped lines is unchanged.
Toro Pizzeria advances 51 to 178. Pending proposals must reload the new baseline;
this is metadata concurrency, not a monetary change.

Existing authorization helper hashes/owners/grants are unchanged. The new master
table has RLS; anonymous SELECT and authenticated direct UPDATE are denied. The
internal reference trigger is not directly executable by authenticated users.
Public read/save RPCs reject anonymous callers and retain the reviewed internal
Developer/job/line bounds. No credential, role or broader access was introduced.

Advisor comparison adds only the three intentional guarded authenticated RPC
[SECURITY DEFINER notices](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and two [unused-index informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
for the new master/reference indexes. Existing anonymous-execute, RLS/policy,
search-path, view and unindexed-FK findings are unchanged. Exact snapshots and
comparisons are ignored under `.temp/production-catalogue-before.json` and
`.temp/production-catalogue-after.json`.
