# Submitted estimate review scrolling — 2026-10-16

Status: verified combined Staging candidate. Released quote-approval hotfix reconciled; its reviewed database migration applied to Staging. No live estimates, financial calculations, snapshots or account settings changed. This task does not deploy Production; the separate release owner controls approved proposal promotion. The scroll fix remains Staging-only pending review.

## Exact route and cause

Open `/estimates?view=review`, then a submitted standalone or personal estimate review. Both use the `selectedReview` estimate-document branch in WorkbenchRoute.

The prior estimator fix used a viewport-fitted EditorFrame for an opened estimate. The review branch still rendered the review header/decision form in the outer page above a separate 770px iframe at a 900px viewport. Both documents overflowed vertically: the full-shell synthetic reproduction measured an outer height of **1279px desktop / 1408px mobile**, plus inner iframe content heights of **1343px / 2137px**. This reproduced the two main vertical scrollbars.

## Bounded correction

EditorFrame accepts optional leading content. The unchanged review header, note, decision controls and handlers now render through the same portal as the read-only WorkbenchEditor. Review uses the existing `fitViewport` sizing/rail behavior. One iframe document owns the entire main review scroll; the outer shell stays at the viewport height. Review-only styles preserve the header and decision-form presentation inside that document. Shared-library and non-estimate change reviews retain their existing layout.

The controls moved documents; their decision callbacks, required-note conditions, busy guards and approval/return/decline behavior are unchanged. The review content stays read-only. Existing table wrappers retain intentional horizontal scrolling. Normal estimate editing and the document-owned proposal overlay remain consistent.

## Verification

- Full bounded suite: **350 passed, 1 skipped, 0 failed**. Staging-configured build passes, unchanged environment and existing chunk warnings.
- New `scripts/verify-estimate-review-scroll.mjs` uses actual AppShell + WorkbenchRoute + editor iframe, synthetic 24-entry submitted estimate, and long customer scope. At both 1440px and 390px, the corrected outer height is **900px**, matching the viewport. Fitted iframe heights are **787px / 701px**, with only its main vertical scroll active.
- Tested long Pricing content, scrolling to bottom with outer scroll remaining zero, resize down to 760px height, buffered review note retention, proposal modal/back and responsive layout, return to review queue, disabled draft save, zero mutation RPCs, and byte-equivalent fixture document/request/total/snapshot before/after browsing.
- Actual mobile Takeoff table remains horizontally scrollable without widening the iframe document.
- Existing `scripts/verify-standalone-estimate-ui.mjs` passes at 1440px and 390px: submission, review failure/retry, approval, optional handoff, official archive/restore and promoted personal-copy behavior. Its review-control locators follow the intentional document move.
- Existing actual approved-header/iframe proposal check passes: all fonts in the correct document, responsive desktop/mobile, pixel equality to independent downloaded-PDF rendering, explicit download, immutable snapshot, Escape/Back/Close/reopen.
- Synthetic before/after review and proposal screenshots plus measurements: ignored `.temp/estimate-review-scroll/`. No user/customer screenshot was published. Authenticated Staging acceptance remains separate from network-isolated fixture verification.

## Released hotfix reconciliation and combined verification

Normal merge `4901e95` preserves Production v0.9.1 code `d54c656234cc7d35674435803b4d011744fba09f` and receipt `223bd279221a42a76d8b869289dacd9613030d04`, alongside the accepted Staging proposal/iframe fixes and scroll commit `e75bcb4`. Conflicts preserved both release records and both independent synthetic fixture variants. No approval gate was reimplemented or broadened here.

Combined full suite: **353 passed, 1 skipped, 0 failed**. Staging build, actual long-review scroll/modal/table tests, approved-proposal iframe pixel/download regression and existing full lifecycle browser suite pass. Explicit componentless browser cases at 1440px/390px approve priced manual/linked-quote items and block unpriced items without an approval RPC. The exact released migration passes the isolated PGlite lifecycle/componentless suite, including invalid-source rejection and pricing/snapshot parity. Test servers now use separate ignored Vite caches to prevent fixture-adapter interference.

Staging target was verified as persistent branch `staging`, ref `fazfwzbuesvzhgodckiw`, API URL https://fazfwzbuesvzhgodckiw.supabase.co. All four released migration preflight hashes matched. Applied only source `20261016173353_componentless_priced_work_item_approval.sql` (SHA-256 `883255C7DEB8054A78E1D5B67CEAD0C258DBF0B68E86235DCD1593601FFA5163`), with five-second lock and 30-second statement bounds. Actual Staging ledger: **20261016175352**, `componentless_priced_work_item_approval`.

Verified installed wrapper hash `94a7bf2b18ca9d34de6acfd3481b62de` and structure hash `7ef7cb4b8bd6b53e22a8d745b094dddd`, matching the released Production fix. Function owners/ACLs, protected internal approval (`b9860bd3229bf5fa8fef7d7be71a9a3c`), handoff pricing/charge guard (`ce3bc1adc014248106252263420fff39`) and CO authorization (`0099a2e4e5dcdb037af6fd69602a336b`) remain unchanged. All ten tracked estimate/personal/Job/CO/budget/handoff data fingerprints match before/after migration. Existing advisor notice categories are unchanged.

Live pure validation accepts a synthetic componentless quote with tax/card settings, without records. Uncharged quote pricing returns 224.68 for the synthetic input. The unchanged charged-handoff guard still rejects unsupported destination accounting. No real estimate was edited, submitted or approved by these checks.

## Staging frontend deployment

Published **2026-10-16 17:57:52 UTC** at https://staging.rnsolutions.net/estimates?view=review.

- Exact code: `8c2705bd5e838e1fcff2cb0283722827fb7c7338`; ready Netlify deploy `6ad2658ee08657389e961653`, no deploy errors or secret-scan matches.
- Immutable review URL: https://6ad2658ee08657389e961653--northgate-hq-staging.netlify.app/estimates?view=review.
- Served `/assets/index-6wcs0DsE.js` SHA-256 `83256681d955607e2bea2ec33f214f0ee3f8fae93eef2f28ab0bd33b58cb1362` and `/assets/WorkbenchRoute-BJlE92dA.js` SHA-256 `4f6dfbadc57faebe482f86ede8a13db886920f0e53b1a04452016db68ae6cc75` match the tested Staging build exactly. Logo/fonts remain byte-identical; deep links and isolated Staging configuration verify.
- Atomic push updated only `staging` and `fix/estimate-review-scroll-20261016`. No main/Production push or deployment was performed by this task. Remote main advanced independently to `1fe9528d8b9c866a4122a7a99656a4aa13b0cfd6` while the separate release owner handled approved proposal promotion; this Staging candidate anchors the released approval receipt `223bd27` and preserves all accepted Staging proposal fixes.
- Target remains Staging site `431ce717-1a06-45a0-9d7a-8acd06a67dde`, isolated backend `fazfwzbuesvzhgodckiw`. Previous code `77b4dc5`, receipt `5a1b301`, deploy `6ad2575293f5ef7050b28d53`.
- Authenticated Staging owner acceptance remains pending; the existing fresh-browser sign-in challenge was not bypassed or retried. All business-action UI checks used synthetic network-isolated adapters. No live estimate was modified or approved.

The scroll correction remains **Staging-only until Ryan reviews it**. Do not promote this branch wholesale to Production merely because its approved proposal and v0.9.1 hotfix ancestors are released. Receipt-only follow-ups use `[skip ci]`; deployed application code remains the exact commit above.
