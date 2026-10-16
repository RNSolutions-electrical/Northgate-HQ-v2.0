# v0.9.2 — reviewed proposal formatting

Ryan accepted Staging code 77b4dc5 and authorized Production promotion. This
release starts on live main 223bd27 after the v0.9.1 approval hotfix. Only the
four supplied commits are selected: 88ddd21, 60cde5f, f590a09 and 77b4dc5.
Staging history/receipt merges and unreviewed scrollbar fix e75bcb4 are excluded.

The proposal has Northgate letterhead, embedded licensed fonts, editable grouped
customer-facing scope and explicit PDF preview/download/print controls. The
iframe fix supplies PDF.js with the canvas owner's document and renders overlay
CSS in that document. The approved header and builder actions say Export Proposal.

No pricing arithmetic, financial data, approval permissions or database functions
change. Componentless approval hotfix source is preserved, including the new
readiness validation and error text. All proposal application files match accepted
Staging; the only application differences from 77b4dc5 are retained hotfix changes
in app.jsx, componentStructure.mjs and workspaceModel.mjs. WorkbenchRoute has no
change, and no scrollbar fix is included. No database migration is required or
applied. No customer/test records are created, edited, approved or deleted.

## Combined checks

- 354 named tests pass, zero skipped/failed, with optional CO SQL tests enabled.
- Locked dependency installation and build pass; synthetic Development bundle is
  not uploaded. @pdf-lib/fontkit remains pinned at the reviewed 1.1.1 version.
- Full presentation regression passes grouping/save/reload, required scope,
  pagination, stable totals, byte-identical PDF download, approved total-only
  recovery, interrupted render/print, mobile overlay and repeated openings.
- Actual WorkbenchRoute/editor iframe passes desktop/mobile geometry, all three
  font registrations, exact pixel equality with independent rendering of the
  downloaded PDF, immutable snapshot, explicit download and Escape/Back/Close.
- Native Edge print previews pass for the actual embedded one-page and three-page
  proposals. Selected simplex mode was observed; expected sheet counts matched.
  Both dialogs were cancelled through their actual Cancel buttons; no print job.
- The initial cold Vite iframe navigation hit the old 20-second test timeout.
  A QA-only environment override now allows 60 seconds on this Windows executor;
  the complete reruns pass. Application behavior was not changed for this.
- git diff --check passes. Source comparisons confirm approved proposal bytes and
  retained approval-hotfix changes without a blanket Staging merge.

Recovery preserves v0.9.1's immutable source/tag and installed approval fix; any
necessary correction is forward-only and must retain that fix. No shared schema,
data or database/Storage restoration is part of this frontend release.

Evidence is under ignored `.temp/proposal-production-*` logs and
`.temp/proposal-embedded/` downloaded PDFs, desktop/mobile previews, independent
rasters and cancelled native-print screenshots. All test content is synthetic.
Production identities, exact deploy/commit and release receipts follow below.
