# Proposal letterhead Staging release — 2026-10-16

Ryan explicitly authorized isolated branch publication, final Windows browser/print QA, and Staging deployment if checks pass. Production promotion remains withheld. No customer estimates, accounts, credentials, database records or schema are changed by this release.

## Reviewed source and reconciliation

- Published proposal commit: `88ddd21d6dcc793982678580ef766c6c07c2d00f`; verified tree `2e00335b91799aa08b005d43331b09f208e373e7`, parent `bb74361045c44a358435343188c9d798019f5f29`.
- Normal integration merge `4910ec3` retains the accepted Staging history `3f9462c` and current main `bb74361`. Application source, package lock and Netlify configuration are identical to the reviewed proposal commit.
- Conflict resolution retained both lifecycle deployment records, Staging's later lifecycle diagnosis, and main's guarded Production database-test option. No lifecycle/security/financial source was replaced. No force-push or migration replay is required.
- Staging target: `431ce717-1a06-45a0-9d7a-8acd06a67dde`, https://staging.rnsolutions.net, existing Git branch `staging`, isolated Supabase `fazfwzbuesvzhgodckiw`. Pre-release deploy `6ad207bffeaebd6b8b043d09`, code `3a23a6a5c40f05550fe962508b92acb70d314091`.

## Windows verification

- Full bounded repository suite: **350 passed, 1 skipped, 0 failed**. Existing npm audit reports five high-severity dependency advisories; no unrelated dependency upgrades were made.
- Build passes using the existing public Staging client settings and observed root asset base `/`. No environment settings were changed. Existing XLSX/chunk warnings remain.
- Comprehensive synthetic browser checks pass: explicit authored grouping, retained required scope/context, save/reload, unchanged tax/card totals, long scope pagination, byte-identical PDF download, raster-print pagination, locked approved total-only recovery, interrupted render/print cancellation, mobile overlay, Escape/Back/Close/repeated opens, and no automatic downloads/new tabs.
- Corrected two verification-script issues: guard an observer against an already-removed iframe, and restore desktop viewport before reloading the approved fixture and using desktop navigation. Application source did not change for these test corrections.
- **Real native Edge print preview verified**, without a print stub: one-page total-only and three-page grouped/priced branded PDFs. Inspected actual rendered preview for logo, readable body, hanging scope numbers, total, red footer, scaling and page count. Observed printer duplex setting explains two sheets for the three-page proposal. Clicked Cancel and verified preview target closed and editing returned; no physical print command was sent.
- Repeatable native check: `scripts/verify-proposal-native-print.mjs` with installed Edge and the same optional `PLAYWRIGHT_MODULE` override used by other browser scripts. Synthetic evidence lives in ignored `.temp/proposal-final-windows`; broader desktop/mobile/download/raster evidence in `.temp/proposal-presentation`.

## Design and scope

Actual supplied logo and measured letterhead layout; redistributable Calibri-compatible Carlito body and compressed Liberation Sans footer, rather than proprietary Microsoft fonts. Deliberate font substitutes mean the result is visually aligned, not pixel-identical typography. All assets are versioned and local to the app. Underlying financial calculations, full-subtotal tax, after-tax card fee, approval guards and immutable totals remain unchanged.

Reusable PDF overlay is adopted only for proposals here. Other HQ exporters and future mixed Quoted/T&M/NTE billing remain follow-on work. Source design/asset licenses and detailed cloud PDF regression review are in `docs/reviews/PROPOSAL_LETTERHEAD_CLOUD_20261016.md` and `src/assets/proposal/README.md`.

## Deployment receipt

Pending exact ready deploy verification. Update this section after the authorized Staging Git deployment; do not infer publication from a successful push alone. Production remains withheld.
