# v0.9.3 — Project Financials Add Financial Line

Ryan verified Staging code 76221e03 and approved Production on October 16.
Release branch starts at Production receipt ac89a30, retaining v0.9.2 proposal
formatting, v0.9.1 componentless approval, v0.9.0 lifecycle and the CO security fix.
Only product commit cdb64c0 and QA follow-up 76221e03 were selected. No blanket
Staging merge. Unreviewed draft-review scrollbar repair is excluded.

## Bounded behavior

The top Add action formerly scrolled to a hidden legacy form. It now opens an
active/current-job division picker and enters the existing inline Add workflow,
including divisions with no budget rows. Missing divisions produce setup guidance;
denied/failed reads produce visible errors. Save failures remain visible and
focused without losing the draft. Repeated Add clicks cannot replace a create or
edit in progress. Existing batch/proposal routing, permissions, protected-field
reasons, audit calls, validation and financial values are unchanged.

Only JobsWorkspace.jsx and the new FinancialLineDivisionPicker.jsx change product
behavior. Both exactly match the accepted Staging files. There are no estimating,
database, dependency, permission-rule or Netlify configuration changes. No shared
migration, permission grant, credentials change or real financial test mutation.

## Final validation and recovery preparation

- Full named suite across src/tests/test: 354 passed, zero skipped/failed.
- Add Line fixture: seven scenario groups at desktop 1440x1000 and phone 390x844;
  active/current-job-only division reads, multiple/empty/no divisions, denied-read
  retry, cancel/reopen, repeated clicks, Save double-click, failed save/retry,
  visible focused feedback, retained draft/amount, unchanged existing row,
  contributor proposal routing and no-financial-access viewer. No page exceptions.
- Existing financial workflow fixture passes override/reset, protected reason,
  cancelled-reason draft preservation, failed-save retention and contributor
  access on desktop/tablet/phone. Expected synthetic rejected-save logs are not
  browser exceptions. All external requests are blocked in fixtures.
- Locked source build passes with synthetic Development settings. That bundle is
  not uploaded; the existing Production Git build uses its own configuration.
- git diff --check passes; exact product-source comparison with 76221e03 passes.
  Estimating/WorkbenchRoute and all database/config/dependency files have no diff
  from the Production base, excluding the unapproved scrollbar behavior.
- Pre-release Production code/tag v0.9.2 and receipt ac89a30 remain recoverable in
  Git. A forward UI repair must preserve approved financial and estimating work.
  No database restore is needed for this frontend-only change. No rollback or
  customer-data change was performed. Existing financial RPC fingerprints,
  ownership and grants are captured for post-deployment comparison.

Evidence is retained in ignored `.temp/financial-add-qa/` and
`.temp/financial-production-*` logs. Phone rejected-save screenshot was inspected.
Authenticated live financial creation is intentionally not tested; Ryan's Staging
acceptance is recorded separately. Deployment/release receipts follow below.

## Production receipt

Production URL: https://rnsolutions.net/northgate/jobs.
Deployed code/tag: `dc2de6d17c4259e169a787b20dfa0169515092b6` / `v0.9.3`.
Netlify deploy `6ad28722f48eddc8eb974f91`, ready at that exact commit,
published 2026-10-16 20:21:08.334 UTC. Zero secret-scan matches. Existing Production
Git configuration supplied the build; no synthetic local artifact was uploaded.

Normal TLS routes and assets return 200. Entry JS `index-CiDJqlf6.js`, Workbench
chunk `WorkbenchRoute-DczPb-bq.js`, runtime JS and CSS load with expected types.
Served code contains the new division picker/failed-read feedback plus retained
Export Proposal and componentless-pricing markers, Production Supabase identity
and `clerk.rnsolutions.net`. Previous proposal fonts/letterhead assets still load.
The exact reviewed two-file financial fix is present; unreviewed scrollbar source
is absent from this promotion.

Five existing financial/canonical-authorization function definitions, owners and
ACLs match pre-release metadata exactly:

```text
save_job_financial_batch              85be3ca12db88a0e88b3705b357e469b
save_v5_job_financial_proposal         02b8febabbe0a123d5b4238f5cde8810
submit_v5_job_financial_proposal       105fb2073d004aabc1bf782d0d3c3a5f
archive_job_budget_line               ebedfe308ab3fe391663230dcfa233cc
current_scoped_authorization_decision bc964e811ea657f661d2bc6780fefa8d
```

No database migration, permission/credential change or real financial mutation
occurred. Financial write/rejection checks remained synthetic local fixtures.
Live authenticated financial creation remains deliberately unrun: a fresh isolated
browser reaches the Production accounts-domain Cloudflare challenge with zero
page errors, and no bypass/session reuse or business action is attempted. Ryan's
Staging acceptance resolves the owner review separately from this automation limit.

[GitHub Release](https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/releases/tag/v0.9.3)
records the immutable deployed code. Receipt-only follow-up uses `[skip ci]` and
does not move that tag or replace the published deploy.

Sync marker: PROJECT-FINANCIAL-ADD-PROD-V093-20261016-001.
