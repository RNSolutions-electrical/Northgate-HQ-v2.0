# Estimate submission modal — Staging publication

Ryan authorized Staging publication after the local review. Production publication
and business-estimate submission remain unauthorized.

## Identities and preserved baseline

- Reviewed local commit: `49c3d99c71d712b45b2a1f0efcbd5b4c6a2a4a4c`.
- Its exact parent: `b71a8f1c03862c28801a8e7d1e204678d5505d68`, the
  documentation-only v0.7.2 Production release record. Runtime/tag baseline is
  `b4529347a4c79119971d620cfce738630e027c98`.
- Staging base: `3bbef1383ceb2bddbbbeedc00eec860f031b7a4e`.
- Integrated/published code: `dfde10a372b7134d7aae0d25122bb43e1d3a50b1`, a
  conflict-free cherry-pick onto that Staging base. Runtime sources, test/script
  sources, package/lockfiles, public/functions/database/config files match the
  reviewed local candidate exactly.
- Netlify site: `431ce717-1a06-45a0-9d7a-8acd06a67dde` (`northgate-hq-staging`).
- Ready deploy: `6ace8dc7019276ae96dfc237`, branch `staging`, exact code commit
  `dfde10a`; published **2026-10-13 20:00:30.155 UTC**. Netlify's `production`
  context here means the primary deploy of the independent Staging site.
- URL: https://staging.rnsolutions.net/estimates?view=personal
- Production `main` remains `b71a8f1`. No Production push or deployment, schema
  changes, site configuration changes, private credential retrieval, or shared
  database writes occurred. Active Dropbox/previous checkouts were not modified.

Notes/calculator production implementation, fixtures, verification scripts and
named tests are byte-identical to the reviewed Production baseline. Existing
labor rates are unchanged. Integration changes only the submission modal,
WorkbenchRoute submission guards/frame sizing, scoped estimate CSS, local
fixture/verifier and review documentation. Reviewer decision fields remain.

## Test-count reconciliation

The earlier **305** report used:

```text
node --test tests/*.test.js tests/*.test.mjs
```

It omitted the separate singular `test/` directory. Its unchanged
`test/billingMath.test.js` contains exactly three tests: fee allocation at the
cent, original-contract SOV reconciliation, and incremental pay-app clamping.
There are no removed baseline tests and this is not a dynamic-discovery change.
The complete explicit command passed **308/308**, with zero failures/skips:

```text
node --test tests/*.test.js tests/*.test.mjs test/*.test.js
```

This complete command passed again on the integrated Staging candidate. The
default `npm test` discovery starts a long-running fixture server, so explicit
named files were used. The modal browser script is a separate UI suite and is
not included in the 308 named Node cases.

## Verification

- Complete 308-case regression suite passed; actual-shell/actual-editor modal
  checks passed on desktop/mobile with Production-style and Staging-banner
  shells. Covers explicit confirmation, reason validation/retention, dirty-save
  revision, permissions/status, focus/Tab/Escape/Cancel, pending/duplicate guards,
  successful/failed submission, route change/unmount, viewport/root scrolling,
  calculator precedence and repeated clicks. Only synthetic local callbacks;
  browser external requests blocked.
- Existing local notes, calculator and labor-rate UI suites passed unchanged.
- Exact Staging-configured Vite build passed using only already-public client
  configuration from the published Staging bundle: `VITE_APP_ENV=staging`,
  base `/`, Supabase `fazfwzbuesvzhgodckiw`, Clerk `clerk.staging.rnsolutions.net`.
  Keys were not printed or committed. Existing chunk/XLSX warnings remain.
- Normal certificate-validating HTTPS verifies live HTML and all **17** assets
  against the exact build by SHA-256, including expected script/CSS MIME.
  `/estimates`, `/jobs`, `/dashboard` return the same SPA HTML. No TLS bypass.
- Read endpoint rejects GET with 405 as implemented; the documented POST
  initialization probe returns 503 (disabled) before auth/data operations.
- Deploy state is ready, exact branch/commit/site identities match, no error;
  secret scan: 938 files, zero ordinary/enhanced matches. Existing
  `northgate-read` and `silas-chat` functions remain deployed.
- Read-only fresh desktop/mobile live `/estimates` visits redirect to Staging
  sign-in and stop at Cloudflare security verification, with no browser page
  errors. No challenge bypass or business record submission was attempted.

Local evidence: `.temp/staging-rollout/` has before public HTML/entry hashes,
exact build, asset/config/live/browser evidence and internal screenshots;
`.temp/estimate-submission/` has modal screenshots and local UI results.
Original user screenshot inspection remains blocked by Library's Windows
`os.setxattr` incompatibility, as documented in the local review.

Automatic approval review rejected listing all Netlify environment variables
because that could expose private Staging secrets. No variables were returned.
Public client-bundle verification completed the required configuration check;
no credential-retrieval workaround was used.

## Owner acceptance

Hard-refresh Staging and open **My Estimates** in Ryan's normal signed-in
session. Use a labeled test draft. Submit for Review should open the modal
without submitting; type a reason, Cancel/Escape and reopen to verify retention.
Check desktop/mobile editor scrolling and notes/calculator interactions. A final
confirmation on a test fixture should lock the payload and show success.

Unrun: independently authenticated live modal/save/review smoke and live
submission success/failure; these remain owner follow-up because fresh automated
sign-in is challenged. Local fixture coverage is not claimed as live-account
coverage. No Production promotion is authorized or performed.
