# EOS usability cleanup — staging review

Date: 2026-10-15. Machine: Ryan_Northgate. Production Mode; staging only.

## Baseline and isolation

Remote: RNSolutions-electrical/Northgate-HQ-v2.0. Fresh origin/staging baseline
90ad8d66710d618093e02d4a7a63733b086ed6f5 matched Netlify current staging deploy
6ad01adb61a60f600c65f22b. Work isolated in the October 15 task checkout on
codex/eos-usability-20261015; existing Dropbox development checkout, untracked
builds and other worktrees preserved. Older home-directory main checkout left alone.

## Changes

- Meeting date/week controls stay on Meeting, with Wednesday defaults and override.
- Last week/this week display Wednesday-to-Wednesday reference dates. Actual
  measurement dates remain visible; existing dates are preserved. New `period`
  entries default to seven days ending on the meeting date and remain editable.
- Owner/category stay visible; retirement and sorting move into More filters.
- Plain metric name, owner, category, format, target, value basis and report
  calculation labels. Optional Source details retains workbook mapping/review notes.
- Selected week controls quarter/year history and exports. Stable Monday week
  identities still determine scope, so moving a meeting never reassigns history.
- Metric configuration, retire/restore, member permissions and save RPCs unchanged.

## Calculation boundary

Existing server/local validation rejects SUM for YTD, QTD, rolling windows,
percentages and text. Actual observations alone feed summaries; carried displays
are excluded and zero remains data. Latest reported value uses the last actual
entry in reporting-week order, not the carried display or a new inferred amount.
Separate non-overlapping period totals can use SUM; cumulative quarter/year totals
can use Latest reported value or no calculated total. No existing definition or
value was converted. No database operations, migrations, imports or real sample
values were performed, so no database backup/apply sequence was needed.

Owner decision remains metric-specific: which workbook financial measures are
separate period totals versus cumulative quarter/year snapshots, and their exact
measurement basis/targets. Source candidates remain provisional; do not invent
starting values or infer the business meaning from workbook formulas.

## Validation

313 explicit tests pass. Focused tests cover Wednesday defaults, saved dates,
quarter/year boundaries, actual zero and carried-value exclusion. Real component
browser fixture with local synthetic store passes desktop 1440x900 and mobile
390x700, weekly-zero save, optional source details, filter disclosure, YTD sum
rejection/latest acceptance and viewport containment. External fixture requests
blocked; no shared data touched. Evidence: .temp/eos-usability/.

Staging public-client-config build passes using the isolated staging Supabase
project fazfwzbuesvzhgodckiw and root assets. Existing large-chunk/xlsx warnings
remain. Locked dependency installation reported five high vulnerabilities; no
unrelated dependency upgrade was attempted. Desktop/mobile screenshots inspected.

Signed-in live browser verification is limited: connected computer-use runtime
failed initialization (Windows platform directory missing). Fixture checks do
not substitute for Ryan's signed-in staging acceptance. Live HTTP/assets and
exact Netlify deploy identity will be checked after publication.

## Ryan's staging review checklist

- Meeting: select a week, check last/this-week reference dates, change meeting date
  if needed, and verify existing values/measurement dates stay attached to the week.
- Update an intended metric value and note; verify zero, missing value, carried
  provenance and notes for the displayed week are understandable.
- Manage metrics: inspect plain labels and optional Source details; review each
  financial metric's basis before choosing cumulative versus separate-period totals.
- Choose selected week's quarter/year and check CSV/PDF scope and configured summary.
- More filters: show retired; confirm restore/history and normal EOS-member editing.
- Confirm desktop/mobile readability. Production promotion remains unauthorized.

## Separate estimate-formatting status

Read-only Netlify check: current Production deploy 6ace81232c40f252dfd1bb70 is
ready at b4529347a4c79119971d620cfce738630e027c98 (notes/calculator), published
2026-10-13 19:06:41 UTC. It does not contain dfde10a, the Submit for Review dialog
and editor scrolling/layout fix. That fix is on staging and included in 90ad8d6.
Nothing was promoted to Production for this status question.

## Deployment evidence

Netlify staging site 431ce717-1a06-45a0-9d7a-8acd06a67dde published ready/current
deploy 6ad0bc79a0ccfa5fa7fa9a2e from exact app commit
79b18c73ca37217b41b25aef729856d4d224c74a at 2026-10-15 11:44:20.758 UTC.
No deploy error; secret scan found no matches across 955 files.
https://6ad0bc79a0ccfa5fa7fa9a2e--northgate-hq-staging.netlify.app/eos

Live https://staging.rnsolutions.net/eos returned HTTP 200; its
/assets/index-ByBvcanv.js returned 200 and application/javascript, includes
new labels and isolated staging project identity. HTTP evidence saved at
.temp/eos-usability/live-http.json. origin/main remained
13ce6e0908042963849f440c489e96f010b80c19. Production deploy remained
6ace81232c40f252dfd1bb70. Later documentation-only commit uses [skip ci].
