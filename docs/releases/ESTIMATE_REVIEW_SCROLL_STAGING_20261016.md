# Submitted estimate review scrolling — 2026-10-16

Status: verified isolated implementation, awaiting the separate quote-approval hotfix's released commit before further Staging integration. Production proposal/scroll promotion remains withheld. No live estimates, financial calculations, approval handlers, snapshots, migrations or account settings changed.

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

## Coordination and publication boundary

Separate lifecycle owner is implementing the urgent priced-quote approval Production hotfix. This branch does not duplicate or alter that gate. Reconcile its exact released source before any subsequent Staging integration and rerun affected checks if needed. No Production proposal/scroll promotion is authorized.

Current Staging remains proposal preview fix code `77b4dc5ca2733bfb914e3624c8c1c7a002d8eea1`, receipt `5a1b301c5153797307d967c37bc1c5f495747bae`, ready Netlify deploy `6ad2575293f5ef7050b28d53`. Scroll correction is not deployed yet. Target for the later authorized deployment remains Staging site `431ce717-1a06-45a0-9d7a-8acd06a67dde`, isolated backend `fazfwzbuesvzhgodckiw`.
