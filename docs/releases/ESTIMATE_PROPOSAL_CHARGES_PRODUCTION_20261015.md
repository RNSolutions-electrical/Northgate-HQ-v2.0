# Production estimate proposal charges - October 15, 2026

Ryan explicitly approved direct Production deployment for customer-quote turnaround. No EOS changes, customer-estimate edits, messages or sends were included. Existing EOS checkout remains clean and unchanged.

## Published identity

- App: https://rnsolutions.net/northgate/estimates (open the estimate, then Proposal).
- Code commit: 47f899e4415f7aef5ed0a9aa6a98ad23a51ec93f.
- Parent: 13ce6e0908042963849f440c489e96f010b80c19, current Production main before release. Live prior app: b4529347a4c79119971d620cfce738630e027c98. Intervening commits were release/incident records and already-applied incident migrations.
- Netlify site: 16adb4ff-83a9-4440-8aad-fcb820d55cac.
- Ready published deploy: 6ad0ddb847ba95e0846a88ac, published 2026-10-15 14:06:03.107 UTC. Production context, exact code commit, no deploy error or secret-scan matches. Existing Git CD and environment configuration used.
- Supabase Production: keogysnoukbendfkfjcn. Applied ledger 20261015140526 / estimate_proposal_charges; source file 20261015135754_estimate_proposal_charges.sql, normalized-LF SHA256 0e6e437cd0beb3222c47fff4548d656049b22ec0d9ed82143638844fa0a2ad31.

## Verification

326 named Node tests passed after rebasing onto current main. Isolated PostgreSQL tests passed including 120 JS/SQL parity cases, authenticated save/reload/approval and immutable charge breakdown, invalid rates, helper access denial, history preservation and safe handoff rejection. Synthetic full editor tests passed desktop/mobile, both zero defaults, live totals, saving/reloading, invalid-save rejection and correction. Browser test blocked all non-local requests. Local build passed with nonproduction placeholders; that output was not deployed.

Production function bodies exactly matched the reviewed prior baseline before migration. All four new/replaced bodies match the migration afterward. Existing client execution privileges remained unchanged; calculation helper is unavailable to anon/authenticated. Server examples: $195 + 7.25% tax ($14.14) + 3% card on $209.14 ($6.27) = $215.41; half-cent sequence $0.05 + $0.01 + $0.01 = $0.07; missing rates keep $195 unchanged.

Pre/post data fingerprints are identical:

| Records | Count | Fingerprint |
| --- | ---: | --- |
| Estimates | 22 | d2a471f200fa4e07b98e836413168219 |
| Workbenches | 19 | a479a42bc5eb747eae7ec474c01de434 |
| Approval snapshots | 11 | 641f7bda5e1a449dc7d373bde615801a |

Live HTML, estimate and assembly deep routes return HTTP 200. Fourteen referenced assets return successfully with expected JS/CSS MIME; live estimate chunk WorkbenchRoute-DTLTx3nd.js contains both inputs, percentage fields and immutable breakdown support. Main entry is index-Dz5o6yz1.js. Netlify independently identifies the exact published source commit. Signed-in Production editing was not exercised; no real customer record was used as a fixture.

Security advisor categories/counts are unchanged (22 RLS-without-policy info, 4 existing security-definer-view errors, 6 mutable-search-path warnings, 11 anon and 229 authenticated definer-function warnings). None concerns the four charge functions; unrelated security remediation was not bundled. See the existing [Supabase security-definer view guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

## Behavior and remaining boundary

Two percentage inputs on Proposal: tax applies to the full selling subtotal; credit card fee applies after rounded tax. Missing or zero rates add nothing. Separate amounts and final total appear in UI, proposal preview and PDF; frozen approved totals remain authoritative. No new schema columns or data rewrite were needed.

Nonzero charge rates intentionally block job/change-order/service-call handoff until destination accounting supports separate charges. This prevents dropping amounts, inflating profit/cost, or duplicating invoice tax. Saving, official promotion, approval and PDF export are available. This accounting boundary remains a follow-up, not a quote-export blocker.

Implementation and reproduction details: [review](../reviews/ESTIMATE_PROPOSAL_CHARGES.md). Local screenshots, test logs, pre-release function definitions and HTTP asset evidence are under .temp/proposal-charges in the isolated task checkout. This release record is a subsequent skip-ci documentation/test-verification commit; the published app remains the code commit above.
