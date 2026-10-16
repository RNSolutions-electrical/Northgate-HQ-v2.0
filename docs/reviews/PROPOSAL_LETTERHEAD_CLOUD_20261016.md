# Proposal letterhead implementation and verification — 2026-10-16

## Status

Production Mode continuation of checkpoint `0a325f5c2b3bd13f3abb6e79a0df3f41a282bb64`, based on production `bb74361045c44a358435343188c9d798019f5f29`. Real letterhead integration and cloud PDF regression/visual review are complete. Final browser QA and native print-dialog review must run in the Windows implementation task before release. No branch push, deployment, customer record change, migration or financial calculation change occurred.

## Changes

- Replaced the generic proposal heading/rule with the exact supplied compass logo at 165 × 50.17 points, top-left, on US Letter with half-inch margins.
- Matched the reference's 11-point black body, 16-point bold inline total, left-hand date and red (#C00000) address/phone/website footer. Retained explicit draft labeling and multi-page numbering.
- Used redistributable embedded typography: Carlito for the Calibri-compatible body; compressed Liberation Sans for the narrow footer. These are intentional substitutes, not a claim of pixel-identical proprietary typefaces. Assets and licenses are recorded in `src/assets/proposal/README.md`.
- Kept numbered scope with hanging indentation and all original source work visible. Grouped and unassigned descriptions now preserve entry section/location/safety context. Quoted vendor names, quote item names, internal notes and component costs remain private.
- Added explicit **Preview total-only PDF** recovery for approved line-priced snapshots whose frozen subtotal differs from recomputation, including fractional-cent rounding differences. This is an export-only choice; the approved snapshot and total remain unchanged. The locked proposal summary now uses its saved charge breakdown and authoritative approved total.
- Preserved all existing pricing, tax and card-fee calculations and validation. Historical example prices are never defaults.
- Strengthened the browser verification script for byte-identical downloads, raster-print page count, interrupted rendering/printing, and approved total-only recovery. This updated script is syntax checked but not successfully run in cloud.

## Verification

- Full bounded repository test suite: run `node --test` with every tracked/untracked `*.test.js` and `*.test.mjs` file, excluding node_modules. **350 passed, 1 skipped, 0 failed** on the final code. Avoid plain `npm test`: it also discovers a persistent development-server script.
- Synthetic isolated Development build succeeds. The build is for verification only, using placeholders, and must not be deployed. Missing target configuration continues to stop a default build.
- Generated and visually inspected synthetic total-only, optional-priced/tax/card and three-page long-scope PDFs against the actual reference pixels. Checked logo position/scale, footer position/color, typography, totals, last-page retained source scope and page breaks. Source references are unchanged.
- Added regression tests for exact logo checksum, Letter media box, embedded logo on all pages, body/side margins, footer baseline, 16-point total, absence of historical customer/amount defaults, approved total-only recovery/non-mutation, accented names and unsupported-character rejection.
- Visual raster review caught a font-subsetting defect that text-extraction tests could not detect; full-font embedding with ligatures disabled fixes it. The final rendered samples are readable and complete.

## Browser environment limit and required Windows checks

The cloud sandbox cannot launch local Chromium because its process/socket setup is restricted. The supported escalation fails during sandbox setup. The managed cloud browser is separate from this workspace and cannot reach its localhost fixture server. Do not label this as a browser pass or reuse the old generic-branding screenshots as final evidence.

Run the updated `scripts/verify-proposal-presentation-ui.mjs` on Windows. It defaults to installed Edge on Windows; `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_CHANNEL`, and `PLAYWRIGHT_EXECUTABLE_PATH` are optional overrides. Use synthetic fixtures only. Confirm desktop/mobile rendering and controls, grouping/save/reload, no automatic tab/download, byte-identical download, tax/card stability, long scope, Escape/Back/Close/reopen, interrupted render/print cancellation, and approved total-only recovery. Inspect the generated `raster-print.pdf`; the script verifies page count but native print invocation is still stubbed. Finally open the real native print dialog and check page count/scaling, cancellation and return to editing before publication.

## Transfer and publication

The deliverable includes a Git bundle preserving commit identity, binary format-patch, synthetic PDFs/rendered PNGs, and restore instructions. Windows Library materialization is blocked by its platform's missing xattr support. Do not bypass Library metadata or recreate its files without identity. Recommended supported code transfer: after user approval, publish the isolated implementation branch to the authorized repository, then fetch its exact commit in the Windows task. The bundle/patch remains an independent recovery checkpoint. No production merge or deployment is implied by publication approval.
