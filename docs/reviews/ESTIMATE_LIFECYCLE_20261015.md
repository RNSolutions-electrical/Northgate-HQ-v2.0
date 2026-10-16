# Estimate lifecycle archive and restore candidate — 2026-10-15

Status: local implementation only; Production Mode. No deployment or migration application authorized or performed. Exact reported test estimate identified read-only on October 16; see follow-up below.

## Baseline and diagnosis

Isolated clone/branch fix/estimate-lifecycle-20261015 starts from remote main a504f88a0562f2f960c43db85a656874d8452100. Remote staging at inspection: 9a8716baac6819998640419cf6ecf63b6b1edb08. Preserves deployed app d8e8770 and its EOS, modal scrolling, proposal tax/full-subtotal and card/after-tax changes. Other checkouts untouched.

Read-only Production inspection (keogysnoukbendfkfjcn): three applied official-estimate destinations, zero missing official headers, zero missing workbenches, one archived linked official estimate. That archived record has a matching pre-archive audit status. No target name was inferred, no business record was changed, and no cleanup was run.

My Estimates reads durable personal working copies. Promoted is a workflow status, not proof of current official visibility. Official Estimates reads workbenches joined to active estimate headers under division-scoped RLS. Archived headers are intentionally invisible, and a different Department or insufficient scope also hides official records. The UI previously did not resolve/display promotion links; personal copies lacked archive actions. Official archive existed but no restore path was exposed. The reported record's specific cause still requires its name/id.

The promotion adapter creates official header, workbench, and applied-record linkage atomically. Existing October 13 payload/retry incident fixes remain untouched. No promotion repair, relinking, or recreation is proposed without identifying the target.

## Minimal behavior

- Archive personal copy hides only that owned source. Restore shows it again. Workflow status, version, hashes, review destinations, official estimates, snapshots and job links are retained.
- Pending review cannot be archived; reviewers must resolve it first. Old browser saves/submissions against archived personal records are rejected by a narrow trigger.
- Archive official estimate uses the existing authorized RPC; restore requires the same estimate edit scope plus can_archive_records, recovering the exact pre-archive status from protected audit history. Missing recovery evidence stops restoration, never defaults an approved estimate to draft.
- Archived list is separate. Restore before opening. Personal rows show official active/archived/unavailable state and Department where permitted. Unavailable links never trigger automatic repair.
- Promoted personal sources open read-only with a promotion-history message. Client permissions are presentation only; server enforces ownership/role/division checks.
- Stale timestamp/version checks, row locks, duplicate-state no-ops and a synchronous UI click guard prevent conflicting/repeated mutations. Every successful mutation writes actor/time/before/after audit in the same transaction. No typed reason for recoverable archives, following repository policy.

Existing RLS and table privileges remain unchanged. Production privilege checks confirm authenticated cannot DELETE estimates or personal copies and cannot INSERT change_logs. Immutable snapshots and downstream links are untouched; no cascade or hard-delete is introduced. Archived official directory exposes scoped header metadata only, not hidden workbench contents.

## Validation

- All 334 named src/tests regressions pass, including EOS, modal, tax/card fee and promotion suites.
- scripts/verify-estimate-lifecycle-db.mjs passes in disposable PGlite 0.3.14: owner/active/scope/archive-permission denial; personal and official archive/restore; active/archive filtering; approved/draft/legacy restoration; orphan links; stale/repeated requests; pending review and old-browser write rejection; content/snapshot preservation; audit-failure rollback; missing original-state recovery denial; function ACLs. This uses fixture authorization helpers, not a Production mutation.
- scripts/verify-estimate-lifecycle-ui.mjs passes rendered component checks for personal/official action labels, permissions, archived/pending disabled actions and unavailable links.
- Vite build passes with explicitly synthetic Development settings. This bundle is not a deployment artifact. Existing large-chunk/xlsx warnings persist.
- git diff --check passes. Default npm test discovers a long-running fixture server; explicit named-test enumeration completes normally.

Run DB check with PGLITE_MODULE pointing to an installed @electric-sql/pglite/dist/index.js. No dependency/lockfile changes are required. Run UI check with node scripts/verify-estimate-lifecycle-ui.mjs.

## Remaining release gates

Exact-record identification is complete. Obtain approval for deployment and the unapplied 20261015171453 migration; compare live function/schema definitions again and test in the approved isolated environment. Perform signed-in browser acceptance before release; rendered component checks do not replace it. No production cleanup or restoration is bundled with deployment approval.


## Exact-record follow-up — 2026-10-16

Ryan identified Personal Test Estimate / Codex / personal version 8. Unique exact match: personal working copy 669b038e-dd23-4cbb-ad7c-3030d0400306, Electrical, promoted, not personally archived. Its version-5 review was returned and version-7 review declined; version 8 applied successfully on September 21 at 12:27:47 UTC via destination 81c2d038-c0a8-4348-b53c-a29785058257. Official estimate b8dc4f3e-d229-4294-b51e-dfcdf16b5e71 and revision-1 workbench both exist. Personal version 8 and official version 1 are separate counters.

Confirmed cause: the official estimate was archived October 15 at 14:07:21 UTC with reason Old test estimate. The archive audit preserves prior status approved. One approval snapshot and one workflow handoff remain. The official active-only RLS intentionally excludes it; the personal source retains promoted status. This is not an orphan or a failed promotion. Audit prose is historical evidence only, not new authorization to delete or alter records.

Recommended action: preserve the already archived official record and its snapshot/handoff. Once archive UI release is approved, archive only the personal source if Ryan wants it removed from My Estimates. Restore the official record only if explicitly requested; it would return to approved, never draft. No relinking, recreation, hard-delete, or data repair is needed.

Readiness recheck: remote main remains a504f88 and staging 9a8716b. Candidate migration is still unapplied; the live Workbench restore integration anchor exists. All 334 named regressions and both isolated database/rendered-UI lifecycle checks pass again. Synthetic Development build rechecked. No live writes, cleanup, migration, or deployment performed. Signed-in browser acceptance remains outstanding; no active browser was disturbed. No further user input is needed for diagnosis or automated checks. Release/target archive authorization and any desired official restoration are separate decisions; parent should coordinate them when convenient.
