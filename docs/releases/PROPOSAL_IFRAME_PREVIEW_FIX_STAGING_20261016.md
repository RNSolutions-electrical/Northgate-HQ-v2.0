# Proposal iframe preview correction — 2026-10-16

Ryan reported square glyphs and a cramped approved-proposal preview on Staging, and requested the action label **Export Proposal**. This correction is authorized for Staging only. Production remains withheld. No live estimate, customer send, database migration or financial-calculation change is included.

## Reproduced cause and correction

The actual WorkbenchRoute portals the editor into an iframe. The PDF preview imported its CSS into the parent document and PDF.js registered its embedded fonts there, while the canvases lived in the iframe. The earlier top-document preview harness missed both integration defects.

Synthetic reproduction through the actual directory → editor iframe → approval → header export path matched the report: 520px dialog width, 940px scroll width against a 518px client width, zero PDF font faces in the iframe, and square text glyphs. Screenshot: ignored `.temp/proposal-embedded/before-desktop.png`.

`PdfPreviewOverlay` now renders its inline style sheet in its own document and supplies the canvas owner's document to PDF.js. It works both in the portal/iframe and in a normal document. The corrected desktop dialog measures 1080px, has no horizontal overflow, and registers all three embedded font faces in the iframe. Downloaded PDF construction/fonts and all financial logic are unchanged.

The approved header and both builder actions consistently read **Export Proposal**, with an eye icon. Approved recovery reads **Export Proposal (total only)**. Save / Download and Print remain explicit inside the overlay. The preview handler no longer receives the click event as an options object.

## Verification

- Full bounded suite: **350 passed, 1 skipped, 0 failed**. Staging-configured build passes with unchanged public client settings and existing chunk warnings.
- `scripts/verify-proposal-embedded-ui.mjs` uses the actual WorkbenchRoute, current router outlet context, real editor iframe, synthetic approval and approved header action. It verifies responsive desktop/mobile geometry, iframe font registration, explicit download, immutable approval snapshot, Escape/Back/Close/reopen and **pixel-for-pixel equality between the iframe preview and an independent rendering of its downloaded PDF**.
- Ran both a one-page total-only proposal and three-page grouped/priced scope with tax/card settings through this actual entry path. Native Edge print previews displayed readable text and correct layout/page count, then were cancelled through their observed Cancel controls. No physical print was sent. Long-scope fixture includes the frozen charge breakdown used by real approved snapshots.
- Comprehensive top-document regression browser suite also passes: grouping/save/reload, retained scope, tax/card totals, byte-identical download, raster-print pagination, approved total-only recovery, interrupted rendering/printing, mobile and repeated opens, and no automatic tab/download.
- Existing synthetic route fixture was brought up to the current required router outlet context. Regression scripts use the new action labels. No application authorization/approval guards were relaxed.
- Evidence: ignored `.temp/proposal-embedded/` includes before/after desktop, mobile, independent PDF raster, downloaded PDFs and actual native-print screenshots. All are synthetic; the user screenshot and live customer content are not published.

## Deployment

Pending authorized Staging publication and exact served-asset verification. Previous ready code `f590a09d92b6ff6f915d5aecce48013ce93c158d`, receipt `a1915e993492d312995686b70957c8b352378438`, deploy `6ad2532486c3cdf1e222f6d5`. Target remains separate Staging site `431ce717-1a06-45a0-9d7a-8acd06a67dde` and backend `fazfwzbuesvzhgodckiw`. Production remains unchanged.
