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

### Verified ready release

- Exact deployed `main` commit:
  **`e8a239de6389eb40a8f5a1cac559cfd23241f6d1`**.
- Production site: `16adb4ff-83a9-4440-8aad-fcb820d55cac` (`northgate-hq-v2`).
- Ready deploy: **`6ad69040e21f5c2ab1335be8`**, branch `main`, published
  **2026-10-19 21:49:05.841 UTC**. Exact commit confirmed; no deploy error.
- Live: https://rnsolutions.net/northgate/jobs . Immutable:
  https://6ad69040e21f5c2ab1335be8--northgate-hq-v2.netlify.app/northgate/jobs .
- Secret scan: 1,063 files, zero regular/enhanced matches. Strict-TLS custom and
  immutable Jobs/Developer/Estimates/Inventory deep links return 200. Served assets
  have correct MIME types and identical hashes. Production identity and grouping
  controls are present; Staging URL, synthetic key and private fixture markers are
  absent.

JavaScript `/northgate/assets/index-DC3ychBt.js` is 2,110,651 bytes, SHA256
`ffc03fe1d12969e417d4d0dc2e0d67c84df6226d7c2c787a27dae8393e28fdeb`.
CSS `/northgate/assets/index-CFpMAqNI.css` is 186,097 bytes, SHA256
`1b369a81dae546c60fb830877afca916c1f5eb5d45bafea001911061bbe3cae3`.
The rolldown runtime hash is
`5db5ba82eef00d1dee7e86e663098c9427d01183a88d357437daff295aec3e75`.
Ignored `.temp/grouping-promotion-deploy.json` holds the served receipt.

### Authenticated live result

The existing signed-in Developer session on the ready code confirms **13 sections
and 13 Add Line buttons**, with **124 rendered financial rows**. All eight summary
cards are byte-for-byte identical to the pre-deploy UI baseline. Concrete has six
rows, Thermal/Moisture eight, Openings 13 and Electrical 12. The export chooser
matches these 13 sections and reports **124 of 124 authorized lines**.

Inferred Electrical and explicit Division07 Add Line each open exactly one draft
inside the correct section; Cancel removes each draft. Unassigned opens the
12-division chooser; Cancel closes it. No live form value, Save, proposal, import,
template rebuild or financial record mutation is submitted. Protected custom
`16.5` is visible under the merged Electrical header as O&P/Protected, preserving
its $34,131 original/current budget and completion forecast. The header retains
$147,900 current/original, $19,006.20 actual, $128,893.80 actual remaining and
$1,526.60 forecast balance. Expanded Electrical pins at the measured 63px shell
boundary; column labels begin at its 158.46875px bottom. The review tab remains
open with no draft and no captured browser error.

The Contract Changes view retains the same 21 displayed records, including the
approved Firewall/Insulation and voided Countertops entries, with identical rendered
status, amount, decision and action text. All 22 underlying Toro CO records and
its two posting records are independently compared in full by the snapshots.

### Post-deploy financial preservation

The final read-only snapshot at **2026-10-19 21:50:47.651008 UTC**, after the cancelled
Add Line/export/CO checks, matches the **21:47:46.573676** pre-deploy snapshot.
Every original active Toro row matches field for field, with no additions/removals.
Across all Production jobs, complete table counts and full-row checksums match:

| Table | Count | Unchanged MD5 |
| --- | ---: | --- |
| job_budget_lines | 671 | `05e7db0cc9fdc4330fe080e7adf0a746` |
| job_budget_divisions | 53 | `b9102424c3af6180be3bd75de50012e3` |
| change_orders | 49 | `8fa15ac80dbf823ddb736838958dc696` |
| change_order_financial_postings | 16 | `fd03c86d3d5315ceb795150f8ac8e05d` |
| change_order_allocations | 6 | `a989909aa84eb1d63b513ad44d8fbb66` |
| job_revenue_lines | 360 | `7416eaf8a56412abb1be49e956f7164a` |
| job_pay_applications | 8 | `4a3a1df2c5085506f1727ea0b5212722` |
| job_pay_application_lines | 382 | `ca2c142dc5ca7b9a7d177a7ebb86e799` |
| change_logs | 4,820 | `fb158b10122456057adb6dc24ebd58f4` |

Thus existing approvals, amounts, posted CO ledger/reversals, allocations, links,
issued billing snapshots and audit history are preserved with no double posting.
No concurrent financial/audit change was observed during these fresh snapshots.
Ignored `grouping-promotion-preservation.json` records exact timestamps/counts/
hashes; raw before/after snapshots remain local. No financial or database write was
performed by this task. Local multi-role/save/failure tests supplement the live
Developer read/cancel smoke; live non-Developer saves were not exercised. No release
blocker remains. Receipt-only documentation uses `[skip ci]` to preserve this deploy.
