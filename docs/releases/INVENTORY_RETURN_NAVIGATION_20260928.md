# Production-targeted Inventory return navigation

Local checkpoint: STORAGE-RETURN-20260928-001
Date: 2026-09-28 14:47 EDT (-04:00)
Machine: Ryan_Northgate
Base: freshly fetched origin/main, 810b3c950cf488ae0574848029e5687229c60c62.
Release: v0.5.1. Owner approved commit and Production deployment on September 28.
Status: approved release candidate; publication verification recorded in HANDOFF.

## Scope

The bin's Add materials / Count screen now offers Storage, storage unit,
shelf, bay, and bin return links. It reuses the authorized hierarchy and
existing wrapping breadcrumb styles. Links open the existing Storage view
at the selected location without carrying the scanned-bin filter.
An unscoped Count page shows the path after a bin is selected for intake.
Unavailable hierarchy data falls back to Storage without guessing parents.

No database migration, permission change, inventory mutation, or Staging
feature is included. Existing unsaved form/navigation behavior is unchanged;
users should save their count/intake before leaving the screen.

## Verification

- 218 explicitly selected repository tests passed, including rendered
  breadcrumb regressions for complete, missing, moved and archived paths.
- Direct Vite build passed using placeholder build-only environment values;
  output is verification-only and must not be deployed.
- `git diff --check` passed.
- Local Edge browser component harness: all four location links navigated to
  the correct Storage URL without scan filters; no horizontal overflow at
  1280px or 390px. Authenticated live Production testing was not performed.
- Default `npm test` also launches a long-running browser fixture server;
  it was stopped and the explicit test-file selection used instead.

## Promotion / rollback

Build with the verified Production
configuration through the established release process. Smoke-test opening
Storage -> unit -> shelf -> bay -> bin -> Add materials / Count, then each
return link, including narrow screens. No live inventory write is needed.
Rollback is a code revert or previous frontend deployment; no schema/data
rollback is required.

Previous Production deploy: 6ab5472cb12e7cdb63937be9 (v0.5.0,
810b3c950cf488ae0574848029e5687229c60c62). Preserve it as the frontend rollback
point. Release tag v0.5.1 must remain immutable. No Staging work is promoted.
