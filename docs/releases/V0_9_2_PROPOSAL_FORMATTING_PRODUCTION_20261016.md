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

## Production receipt

Production URL: https://rnsolutions.net/northgate.
Code/tag: `1fe9528d8b9c866a4122a7a99656a4aa13b0cfd6` / `v0.9.2`.
Netlify deploy `6ad26592f784be315a3db862`, ready at that exact commit,
published 2026-10-16 17:57:57.645 UTC. Zero secret-scan matches. The Git-connected
Production project used its existing configuration; no local synthetic bundle
was uploaded. Immutable v0.9.1 remains in history and in this release ancestry.

Live HTTP/TLS checks return 200 for root, official/review estimate routes and Jobs.
Entry `index-DZEyMkfH.js`, Workbench `WorkbenchRoute-CP4rV3F-.js`, runtime JS and
CSS are served correctly. Compiled assets verify Export Proposal, Save / Download,
the retained componentless-pricing gate text, Production Supabase and
`clerk.rnsolutions.net`. Fonts Carlito Regular (628032 bytes), Carlito Bold
(682468 bytes), Liberation Sans (410820 bytes) and letterhead PNG (46791 bytes)
all return 200 with correct font/image MIME types.

Production approval wrapper hash remains `94a7bf2b18ca9d34de6acfd3481b62de`;
validator `7ef7cb4b8bd6b53e22a8d745b094dddd`; internal approval
`b9860bd3229bf5fa8fef7d7be71a9a3c`; guarded pricing
`ce3bc1adc014248106252263420fff39`; CO security
`0099a2e4e5dcdb037af6fd69602a336b`. No database migration or business-record
mutation occurred for this frontend release. Existing approval migration
20261016174505 is retained.

Fresh isolated Edge reaches the normal Production accounts sign-in redirect and
Cloudflare security verification with zero page errors. Authenticated Production
PDF export remains unrun by automation; no challenge bypass or active-user session
reuse was attempted. Ryan's explicit Staging acceptance and the exact local
actual-iframe/native-print tests are distinct from that live browser limit.
No physical paper output was tested or sent. The original source screenshot was
not rematerialized as part of this bounded promotion.

[GitHub Release](https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/releases/tag/v0.9.2)
and the following receipt commit preserve the immutable deployed code/tag.
The unreviewed e75bcb4 scrollbar change remains excluded.

Sync marker: PROPOSAL-FORMATTING-PROD-V092-20261016-001.
