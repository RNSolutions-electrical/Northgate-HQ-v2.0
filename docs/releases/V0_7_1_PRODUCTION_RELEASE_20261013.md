# Northgate HQ v0.7.1 — Assembly Library labor rates

Published to Production after Ryan accepted Staging and explicitly approved
promotion on October 13. Only the accepted labor-rate commit was cherry-picked;
no other Staging changes or migrations were promoted. Ryan's active Dropbox
checkout and unrelated work were not edited.

## Release identity

- Production: https://rnsolutions.net/northgate/estimates/assemblies
- Code commit: `99952ec3cba3adeb2c6ec7717a1fca565d049f6c` on `main`.
- Accepted Staging commit: `a71a47f08eda9920d255c995c3d92c61104160f4`.
  Both full Git trees equal `991858bce9cf430552377058e7297ead19e18dd6`.
- Fixed annotated tag and GitHub Release: [v0.7.1](https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/releases/tag/v0.7.1), release ID `411573176`.
- Production Netlify site: `16adb4ff-83a9-4440-8aad-fcb820d55cac`.
  Ready deploy `6ace0c6f8786a9d97c2e4318` published from the code commit at
  **2026-10-13 10:48:32.504 UTC**, with no deployment error or secret-scan matches.
- Production Supabase: `keogysnoukbendfkfjcn`.
  Applied ledger version `20261013104626 / assembly_library_labor_rates` from
  reviewed source `20261012220350_assembly_library_labor_rates.sql`.
  Source SHA256: `96F268D3717F5CF8931365A00E260E9EDF4015EBBB50086F5079D81B5B981DA3`.

## Compatibility and recovery

The four replaced Production function bodies match the reviewed Staging baseline:
`validate_workbench_structure(jsonb,boolean)`, `save_assembly_library(text,jsonb,uuid)`,
`workbench_handoff_pricing(jsonb)`, and `approve_workbench_estimate_internal(uuid,text)`.
Their eight dependencies match as well. Existing division RLS and Production
service-role grants are preserved. New settings default to $75/hour per division;
existing rates, approval documents and assembly component snapshots are not rewritten.

The completed Production physical database backup is **2026-10-13 09:06:44.546 UTC**.
Latest pre-release affected-table update: **2026-10-12 21:40:59.331164 UTC**;
latest business audit likewise precedes that backup. Source and exact old function
definitions were preserved locally. PITR is disabled and database backups exclude
Storage; this migration does not touch Storage. After new-format estimates exist,
retain hierarchy-aware code or pause estimating and fix forward. A full restore is
a separate destructive decision and would discard post-backup changes.

## Verification and limits

- 300 named Node tests and isolated Postgres integration/rate checks passed.
- Build used the site's exact existing public configuration and defaults, targeting
  Production Supabase and `/northgate`. Live HTML and all 17 assets match that build
  by SHA256 and MIME. An initial comparison used extra explicit local defaults;
  rebuilding with the exact site's variable presence resolved that mismatch without
  changing Netlify environment settings.
- Live rate labels/RPC bundle and three SPA deep routes passed. Anonymous settings
  reads and writes are denied.
- Rollback-only Production SQL, using authenticated test contexts, passed default
  zero, stale/invalid saves, assembly zero/reset/save/reload, four-level precedence,
  saved-estimate stability, scoped RLS and cross-division denial. Fractional-hour
  approval and handoff pricing both produced the expected $123.46 fixture total.
  These are database checks, not signed-in browser checks.
- All pre-existing record counts and fingerprints remain unchanged: 18 estimates,
  11 approval snapshots, 13 assemblies and 74 components. No fixture estimates,
  assemblies or transient permission identities remain.
- Local headless rate UI checks and Ryan's Staging acceptance preceded promotion.
  Signed-in Production labor-rate UI was not independently verified: browser control
  failed to start, and a fresh headless browser reached Production Clerk sign-in but
  Cloudflare's security verification prevented checking the sign-in form. No challenge
  was bypassed and no real business estimate was used as a fixture.
- Existing build chunk-size/mixed XLSX import warnings remain. No lint/typecheck
  scripts are configured. No unrelated security remediation was included.

Owner follow-up: reload Production, check Library settings and an assembly's rate
source/reset controls, and use a separate test draft to inspect the explicit
inherited-rate refresh preview. Existing business estimates keep saved snapshots.

A documentation-only `[skip ci]` commit records this handoff after the code release;
the published code/tag/deploy identities above remain authoritative.
