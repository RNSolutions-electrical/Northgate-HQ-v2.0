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

Published **2026-10-16 16:57:13 UTC** at https://staging.rnsolutions.net/estimates.

- Exact code: `77b4dc5ca2733bfb914e3624c8c1c7a002d8eea1`; ready Netlify deploy `6ad2575293f5ef7050b28d53`, no deploy errors or secret-scan matches.
- Immutable URL: https://6ad2575293f5ef7050b28d53--northgate-hq-staging.netlify.app/estimates.
- Verified served main `/assets/index-DNwXZr4s.js` SHA-256 `106bf60e07feaf67aeb61143447aa0abf257f67c4c4383511c74e1b3cb9597f7` and corrected `/assets/WorkbenchRoute-zxNkIXTB.js` SHA-256 `e86dd942141ed13e17a2fc02d58ed46c50aab8afbea9d5cba899ba598171d980` match the tested local Staging build byte for byte.
- All three font files and actual company logo remain byte-identical to the reviewed assets and return correct content types. Both estimate deep links return the new entry HTML. Staging banner/backend configuration remains isolated.
- Target: separate Staging site `431ce717-1a06-45a0-9d7a-8acd06a67dde`, backend `fazfwzbuesvzhgodckiw`. Atomic push updated only `staging` and `fix/proposal-export-review-20261016`; `main` remains `bb74361045c44a358435343188c9d798019f5f29`.
- Previous ready release: code `f590a09`, receipt `a1915e9`, deploy `6ad2532486c3cdf1e222f6d5`. No migrations, live-record actions or Production deployment occurred. Ryan's existing Production editing/browser session was not used.
- Authenticated Staging owner acceptance remains for Ryan; isolated sign-in encountered the existing Cloudflare challenge during the preceding release and no bypass was attempted. The actual application route/iframe was tested with synthetic network-isolated adapters, not with a live customer estimate.

Receipt-only follow-up commits use `[skip ci]`; deployed application code remains the exact code commit above. Production promotion remains withheld.
