# Estimate proposal sales tax and credit card fee

Ryan authorized implementation and direct Production deployment on 2026-10-15 to finish a customer quote. No customer estimates may be edited or sent as verification fixtures.

## Scope and calculation

Neither charge existed in estimate pricing/approval; service-call invoice tax is separate. The Proposal page now has sales tax and credit card fee percentage inputs, each defaulting to zero when absent. Both accept 0 through 100 with up to four decimal places. No jurisdiction or rate is inferred.

The existing selling subtotal includes material markup and estimate fee. Sales tax is rounded half-up to cents on this subtotal. Card fee is rounded half-up on subtotal plus the rounded tax. Final total adds each charge once. Charges do not count as estimated gross profit or increase section/work-item prices. Changing/reloading inputs recalculates from base pricing, never the prior grand total.

Existing JSONB documents persist proposal.salesTaxPercent and proposal.creditCardPercent without new columns. Server approval writes proposalChargeSnapshot into its immutable workbench document and uses its final total for pricing_total. Historical snapshots are never rewritten; approved PDFs retain their stored total and show charge breakdown only from a new frozen snapshot. Revisions recalculate their own draft and replace the breakdown on approval. New-estimate creation resets both rates to zero.

## Database release

Migration 20261015135754_estimate_proposal_charges.sql adds a postgres-only pure calculation helper and replaces the existing validation, approval and handoff pricing functions. Existing signatures, authorization, stale-save checks, audit and snapshot locks stay in place. No tables, columns, RLS policies, credentials, client privilege grants or historical data are changed. Source functions come from the Production labor-rate migration, with targeted additions only.

Destination accounting is a known boundary: job/CO/service-call handoffs do not model these charges separately. Both UI and server reject handoff when either rate is nonzero rather than dropping charges, capitalizing tax as cost/profit, or sending a gross quote to an independently taxable invoice. Saving, official promotion, approval and customer proposal export are supported. Extending destination accounting is a separate follow-up.

## Verification

- Named Node regressions across tests and src: 326 passed (before final migration ACL tightening; focused verification rerun afterward).
- Isolated PostgreSQL: 120 SQL/JS charge parity cases, authenticated save/reload/approval, immutable breakdown/total, zero and legacy compatibility, invalid percentages, helper anonymous/authenticated denial, charged handoff rejection, historical snapshot fingerprints unchanged.
- PDF text extraction verifies draft/approved totals and separate amounts; legacy approved PDF retains the original total. Customer proposal output excludes internal costs/markup.
- Synthetic real editor in headless Edge: zero defaults; 7.25% tax + 3% card on $195 gives $14.14 + $6.27 = $215.41; save/reload; invalid-save prevention; mobile/desktop screenshots. All non-local network requests blocked.
- Vite build passed using nonproduction placeholder public settings. Production deploy must use existing site settings, never that placeholder build.
- Default npm test also discovers a fixture server and does not terminate; named *.test.js/*.test.mjs files were run explicitly instead.

Reproduce local extra checks after npm ci with temporary npm install --no-save --package-lock=false @electric-sql/pglite@0.3.14 playwright@1.56.1, then node scripts/verify-proposal-charges-db.mjs and node scripts/verify-proposal-charges-ui.mjs. These are test-only dependencies and do not alter package manifests/lockfiles.

## Release and verification plan

Start from current origin/main (13ce6e0; live app b452934). Only documentation and already-applied incident repair migrations separate these commits; no EOS work is included. Confirm live Production function definitions match the reviewed baseline, preserve aggregate estimate/workbench/snapshot fingerprints, apply this one migration, and push the focused commit to main for existing Netlify Git CD. Verify published commit, deploy status, live HTML/assets and charge strings; run pure SQL charge checks and compare historical fingerprints. Do not change Netlify environment values or real customer records. Signed-in live edit verification is limited to existing authorized browser availability; synthetic UI and database tests provide independent evidence.

If release fails before publication, old app remains live with backward-compatible schema. If a published issue occurs, fix forward; keep new charge-aware snapshots and do not restore/drop customer data. Reverting only the UI after charge-bearing drafts exist could hide charges and must be reviewed.
