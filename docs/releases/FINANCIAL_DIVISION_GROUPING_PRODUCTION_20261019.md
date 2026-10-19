# Financial division grouping and Add Line - Production promotion

Ryan approved promoting the completed Staging repair after confirming that posted
change orders would retain their approvals, amounts, history and financial links.
Authorization is code deployment only. No financial write, budget rebuild, record
copy, reclassification, linkage repair, migration or CO repost is included.

## Exact scope

Production baseline is `27cb1ccbdde4a3a80c7805c2de6be59804afbab1`, serving ready
Netlify `6ad6498a10b13ea805229665` (application source `a1446b2`). The isolated
candidate selects only the **13 source/test files** changed by approved Staging
`5f7ce88916e7d4948440e335182f3179577b465e`; all selected blobs match that commit.
Staging receipt `fa8ffd9` and ready deploy `6ad665bfdba3040672cb1502` identify the
reviewed candidate. The whole Staging branch is not merged; 25 unrelated Staging
file differences, including its separate estimate scrolling work, are excluded.
The only extra files are this release record and its Production HANDOFF entry.

The shared view/action/export division resolver uses explicit project and master
identity, then unique normalized codes. Custom/unlinked rows can share their
correct display section without modifying stored identity, category or linkage.
Inferred Add Line uses the existing audited null-parent save path; explicit targets
retain their existing IDs. Ambiguous/retired contexts are blocked, Unassigned opens
a chooser, and failed drafts are retained. Existing contributor proposals and
server permissions remain authoritative. Current Budget, signed actual Remaining
Budget, override precedence, forecast calculations and CO aggregation are unchanged.

## Fresh data and exact-candidate verification

The read-only Production test snapshot was captured at
**2026-10-19 21:43:51.945720 UTC**, SHA256
`6c4c7df72d82502e92a4a0a15ee23ec4ce9210eee2b23f15cf96f8d13a1676a5`.
It contains 124 active Toro rows, two project divisions, 22 job change-order records
and two job posting records. Full per-table/per-row fingerprints cover all 671
budget lines, 53 project divisions, 49 COs, 16 posting-ledger records, six allocations,
360 revenue lines and eight Pay Apps. Separate fingerprints cover 382 issued Pay App
lines and 4,820 audit rows. Raw data stays ignored locally and is not bundled.

The final pre-publication snapshot at **21:47:46.573676 UTC** matches every table,
issued-line and audit fingerprint; all 124 Toro rows are identical to the test
snapshot. These timestamps bracket possible concurrent user activity rather than
assuming the earlier Staging baseline is still current.

Authenticated Production baseline displays **17 sections/two Add Line buttons**,
with duplicate Concrete, Thermal/Moisture, Openings and Electrical sections. The
fresh local snapshot on the exact candidate gives **13 sections**, **all 124 original
identities exactly once**, two explicit/ten inferred Add Line targets and an
Unassigned chooser. Every original row remains unchanged after local test saves.
Protected job-only custom `16.5` remains O&P and unlinked, with **$34,131** budget and
forecast; Division16 Original remains **$147,900**.

Baseline Toro totals are current **$834,425.38**, actual **$332,550.77**, actual
Remaining Budget **$501,874.61**, committed **$0**, completion forecast **$818,757.68**,
forecasted remaining **$15,667.70**, estimated O&P **$108,590.52**, projected gross
profit **$10,227.40**. Actual and forecast balances remain distinct.

- Final bounded aggregate: **376 total / 375 passed / one skipped / zero failures**.
  Named tests immediately under `tests/` and `test/`, plus recursively under `src/`,
  are passed explicitly to `node --test`; bare discovery includes a persistent
  browser-serving harness.
- Fresh snapshot desktop/phone verification passes membership/amount/source
  preservation, export selector, explicit/inferred local saves, cancel, prefix and
  retirement validation, rejection/draft retention, names/order/overrides/reset,
  protected scope, contributor proposal/submit and bounded sticky/collapse behavior.
  No external request or browser exception occurs.
- Remaining Budget **40 groups**, Add Line **seven**, Edit/sticky **five**, catalogue
  **three**, and integrated financial workflows on desktop/tablet/phone all pass.
- Local PostgreSQL **ten groups pass**, using the existing synthetic 531-line/
  36-division fixture and synthetic permission helpers. Existing audited null-parent
  catalogue/custom saves, classification preservation, no project/helper inserts,
  rollback and unauthorized rejection are verified locally; no live RPC test save.
- Synthetic Production-identity build, private-fixture exclusion, diff check and
  desktop/phone visual review pass. Existing bundle-size/externalization notices
  remain. Local build output contains synthetic keys and is never uploaded; Git CD
  builds with the existing Production environment settings.

Ignored proof includes `.temp/grouping-promotion-manifest.json`, fresh snapshots,
`.temp/financial-grouping-qa/`, and `.temp/grouping-promotion-*.txt`. No database/auth,
dependency, Netlify configuration or unrelated source change is selected. Deployment
will use the existing main-branch Git pipeline. Only read/cancel workflows will be
used in the authenticated live verification; local saves/proposals/permission tests
do not imply live non-Developer authorization was exercised.

## Publication and live preservation receipt

Exact code/deploy, asset and final read-only preservation receipts follow below.
