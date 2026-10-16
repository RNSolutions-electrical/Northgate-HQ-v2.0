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

Published **2026-10-16 16:39:32 UTC** at https://staging.rnsolutions.net/estimates.

- Exact deployed code: `f590a09d92b6ff6f915d5aecce48013ce93c158d`.
- Netlify ready deploy: `6ad2532486c3cdf1e222f6d5`; site `431ce717-1a06-45a0-9d7a-8acd06a67dde`, branch `staging`; no deploy errors or secret-scan matches.
- Immutable URL: https://6ad2532486c3cdf1e222f6d5--northgate-hq-staging.netlify.app/estimates.
- Atomic Git push updated only `staging` and `release/proposal-staging-20261016`. Verified `main` remains `bb74361045c44a358435343188c9d798019f5f29`. Netlify's context name is `production` because this is the Staging site's primary Git deploy; the target is the separate Staging site and isolated Staging backend, never the Production site.
- Served `/assets/index-BFX9OXMs.js` SHA-256 `a9948de8aba5c613f99fb60522e7250c4ac8408e6f2612d969bc76847c94d598` matches the reviewed Staging-configured local build exactly.
- Logo `/assets/northgate-header-DNA85ehx.png` returns HTTP 200 `image/png`, 46,791 bytes, SHA-256 `b33dfd38a3066fe61507096bfe090bf69229180068ebd39eda42d3cb88cbc8d5`.
- All three served TTFs return HTTP 200 `font/ttf` and byte-identical hashes to the reviewed local build. `/estimates` and `/northgate/estimates` deep links both return the deployed entry HTML. Bundle contains the Staging banner and isolated project `fazfwzbuesvzhgodckiw` configuration.
- Fresh isolated desktop/mobile entry smoke check reaches the expected Staging Clerk sign-in host, then Cloudflare security verification (403). No application page errors were observed. **Authenticated Staging owner acceptance remains pending**; no authentication challenge was bypassed and no signed-in record action was attempted. Ryan's existing browser and Production editing session were not used.
- No migrations, shared database queries/writes, customer sends, account changes, credential changes, Production branch push or Production deployment occurred.

Production promotion remains withheld for Ryan's review of this Staging release. Documentation-only receipt commits use `[skip ci]`; the immutable deployed application remains the exact code commit above.
