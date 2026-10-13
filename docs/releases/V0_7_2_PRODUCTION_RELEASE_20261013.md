# Northgate HQ v0.7.2 — estimate notes and shared calculator

Ryan accepted both Staging features and explicitly approved Production promotion on October 13. Only accepted notes and calculator commits were cherry-picked onto the verified Production v0.7.1 baseline. Ryan's active Dropbox checkout and unrelated work were not changed.

## Release identity

- Production: https://rnsolutions.net/northgate/ (Calculator is available throughout authenticated workspaces; notes are in Estimating).
- Code/tag/deploy commit: `b4529347a4c79119971d620cfce738630e027c98` on `main`.
- Notes Production cherry-pick: `a3c6420015b8f90a7b57b71576a871d1077b72a5`, from Staging `d1fad0ccff7daa3bd7e91c3f58ea6add327eddfd`.
- Calculator Production cherry-pick: `b4529347a4c79119971d620cfce738630e027c98`, from Staging `3bbef1383ceb2bddbbbeedc00eec860f031b7a4e`.
- Final runtime source (`src`, public/config/functions/database/test/script sources and package/lockfiles) matches accepted Staging exactly. Production's existing release-history documentation is retained.
- Fixed annotated tag: `v0.7.2` (tag object `47573b3060ce02f81689af52d1badeed6dda1613`, dereferenced commit `b4529347a4c79119971d620cfce738630e027c98`).
- Published GitHub Release: [v0.7.2](https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/releases/tag/v0.7.2), ID `412018367`, published **2026-10-13 19:10:34 UTC**. Repository release immutability remains disabled (`immutable=false`); no repository-setting change or tag reuse was performed.
- Production Netlify site: `16adb4ff-83a9-4440-8aad-fcb820d55cac`.
- Ready/current deploy: `6ace81232c40f252dfd1bb70`, published **2026-10-13 19:06:41.241 UTC** from the exact code commit on `main`, with null error and no ordinary/enhanced secret-scan matches.
- Staging remains at accepted commit `3bbef1383ceb2bddbbbeedc00eec860f031b7a4e` / deploy `6ace5f1962a258d708c1708c`.

## Scope and recovery

The feature diff is limited to 22 notes/calculator/shell/test/review-document paths. Existing labor-rate implementation, catalogue service, pricing implementation, Supabase/migrations, functions, Netlify configuration and package/lockfiles are unchanged. No database migration was added/replayed/applied, no database backup/restore was invoked, and no live business estimate was edited as a fixture.

Before publication, preserved baseline `main` was `c1afe71f52ef8da40776edb2063b7647e709a59c`; prior runtime/tag was v0.7.1 code `99952ec3cba3adeb2c6ec7717a1fca565d049f6c`, Netlify deploy `6ace0c6f8786a9d97c2e4318`. Prior public HTML and entry bundle and SHA-256 signatures are saved in `.temp/production-v0.7.2/recovery.json`, `before-index.html`, `before-entry.js`. Before HTML SHA-256: `0f9150e8a59de47851a29317471052652a1e6afd259bb3405eb4f2415c3f9d11`; entry SHA-256: `56fe974f92252d4d9974bd1f35e76904f317b6ccdd4a994924e0c087ebf13ac6`.

Recovery is a reviewed forward repair/revert and normal CI publication from preserved source; do not automatically restore an older Netlify deploy. There is no schema rollback. Retain internal-note JSON metadata if repairing UI behavior; do not rewrite estimate documents or reusable records. Calculator state is scoped browser session data and has no database writeback. No recovery action was needed.

## Verification and limits

- Final candidate: **308/308** named Node tests passed. Notes persistence/copy/reusable-template isolation/customer-export projections and labor-rate regressions are included.
- Actual shared-shell calculator UI passed with the actual estimator iframe: percentage/result/secondary display, clipboard/history, move/reset/resize, nonmodal background interaction, focus/Tab/Escape, route/reload, user switching/logout, non-Developer access, mobile App Menu, and parent/iframe modal precedence.
- Actual-editor notes UI passed again: all note levels, persisted reload/review, overlays/save/cancel/clear/keyboard, literal/multiline text, read-only access and desktop/mobile.
- Production build passed. Live Production **HTML and all 17 assets** match the exact Production-configured build by SHA-256; JavaScript MIME types and dashboard/estimate/assembly/Jobs/Inventory deep links pass.
- Public Production configuration verified: base `/northgate`, Production environment defaults, Supabase `keogysnoukbendfkfjcn`, Clerk `clerk.rnsolutions.net`; Staging database URL/banner absent. Both new feature markers and retained labor-rate markers are in the published bundles.
- Exact-build verification initially differed because the local preflight explicitly emitted VITE environment/base keys that this site's established configuration leaves at defaults. Rebuilding with those same existing public defaults produced exact live hashes. No live configuration or source change was needed.
- Anonymous estimate save is denied (**401**); read endpoint remains disabled (**503**). These denial-only requests created no test record. No fixtures require cleanup.
- **Unrun:** independently signed-in Production calculator/note smoke and live authenticated save/reload/permission/review/export checks. Browser-session tooling cannot initialize in this environment; a fresh headless Production sign-in still stops at Cloudflare security verification. No bypass was attempted. Local synthetic-identity checks are not claimed as live-account smoke. Ryan's Staging acceptance preceded promotion.
- Existing chunk-size/mixed XLSX import warnings remain; no lint/typecheck scripts are configured. No unrelated remediation was included.

Local evidence: `.temp/production-v0.7.2/verification.json`, `verification.log`, `regression.log`, `build-exact.log`, `github-release.json`, `live-signin.png`; calculator/notes UI JSON and screenshots under `.temp/calculator/` and `.temp/estimate-notes/`. Production feature patch: `C:/Users/Ryan/Documents/Codex/2026-10-13/task/production-v0.7.2.patch`.

## Owner smoke

Hard-refresh Production. Open Calculator below the last rail navigation item/before Northgate HQ footer, or App Menu → Calculator on mobile. `200 + 20%` must show **240** and **20% of 200 = 40**; background typing should remain unaffected and route/reload should retain the scoped session. Open an estimate-note overlay to confirm it takes precedence; expanding verification should show saved internal notes. Use a separate labeled test draft for any optional save/reload/export check, rather than an actual business estimate.

A documentation-only `[skip ci]` commit records the handoff after publication. Code/tag/deploy identities above remain authoritative.
