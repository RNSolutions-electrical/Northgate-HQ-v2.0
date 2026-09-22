# Environment and release workflow — implementation draft

**Status:** Preparatory documentation on the local `development` branch. Branches are not yet published or connected to staging. Do not interpret this document as evidence that staging is live.

## Vocabulary

- **Production:** the live Northgate HQ application at `rnsolutions.net/northgate`, regardless of version number.
- **Staging:** completed development awaiting owner/developer acceptance at the proposed `staging.rnsolutions.net` address. Not yet provisioned.
- **Development:** active work, including incomplete features. Not user-facing by default.
- **Release:** a known code commit, database migration set and deployment record carrying an immutable `v0.x.y` tag and corresponding GitHub Release. `1.0.0` is reserved for the first company-wide release.

Historical `V1`–`V5`, the repository name, and `package.json` `3.0.0` are development-generation labels, **not** official SemVer releases. No formal baseline version has been assigned yet.

## Branch and environment map

| Branch | Purpose | Deployment | Database |
| --- | --- | --- | --- |
| `main` | Production source; currently deployed automatically by the existing Netlify site | `rnsolutions.net/northgate` | Existing production Supabase `keogysnoukbendfkfjcn` |
| `staging` | Accepted integration candidate; locally created from production baseline | **Not connected yet**; target `staging.rnsolutions.net` | Must be isolated before any staging deployment |
| `development` | Active feature work; locally created from production baseline | No production deployment | Must not default to production for test writes |

All three branches were initialized locally from production commit `0340cdf8cc4a93f41cce8ed5a40553161e86314f` on 2026-09-22. `main` remains unchanged. Do **not** push `development` or `staging` until production Netlify branch-deploy behavior has been verified and a safe non-production data endpoint is ready. Keep legacy recovery/backup branches and untracked local output intact.

## Promotion contract (target, not yet active)

1. Build and test on a feature branch from `development`; merge completed, reviewed work into `development` without touching `main`.
2. Promote a specific tested commit to `staging`. Deploy it only to the independently configured staging site and isolated database.
3. Record owner acceptance, tested paths, known limitations, build/commit ID and required migrations.
4. Confirm a real, recoverable pre-release database point when the change warrants it. Backup policy is deferred but remains a gate for broader beta/business-critical promotion; see `ROADMAP.md`.
5. Pick an unused complete SemVer tag (for example `v0.5.0` or `v0.5.1`) after agreeing on the initial baseline. Create an annotated tag **on the accepted commit**, never move an existing tag, and publish a GitHub Release with release notes and the migration manifest.
6. Deliberately promote that exact accepted commit to `main`; verify Netlify's production deploy reports the same SHA and the live page/assets load. Record deploy ID, migration head and smoke-test results.
7. Never auto-promote staging to production. If an urgent production hotfix is needed, branch from `main`, validate it, release deliberately, then reconcile it back into `development` and `staging`.

The repository does not yet have a verified GitHub Release archive or branch protection. This document is not a substitute for either.

## Required environment separation before staging goes live

- A dedicated staging Netlify deploy target and `staging.rnsolutions.net` DNS mapping, independent of the existing `rnsolutions.net/northgate` project.
- Build-time environment identity, persistent staging banner and `[STAGING]` page title; neither may appear in Production.
- Developer-only access enforced before serving protected application content and independently checked on data operations. Developer technical authority remains distinct from Director/business authority.
- Staging-specific Supabase URL and publishable/anon key pointing to an isolated project or persistent isolated branch; never inherit Production's `VITE_SUPABASE_URL` by default. No Production service-role secret in client builds.
- Staging-specific Clerk settings/origin and any function secrets. Validate JWT issuer/audience and RLS/RPC behavior on the staging database.
- Migration replay, RLS/policy checks, Storage bucket/policy setup, Edge Function deployment and sanitized fixture data. A staging write test must be followed by a read-only assertion that the Production record was not changed.
- A read-only confirmation of the current Netlify primary domain and `/northgate` proxy arrangement before altering DNS or site settings.

## Reversal and incident handling

- **Before staging is connected:** keep new branches local or remove their deployment linkage; `main` and live infrastructure remain unchanged.
- **Staging deployment failure:** disable the staging deploy/domain; never point it at Production Supabase to make it work.
- **Production frontend regression:** redeploy a previously verified Production commit/deploy. Do not force-push or reuse a release tag. Check schema compatibility first.
- **Production data/migration incident:** stop the affected writes, preserve incident evidence, assess data created since the last recovery point and Storage-file consistency. Prefer a tested forward repair; restore only from a verified recovery point in a controlled procedure. A code rollback does not reverse a database migration.

## Open implementation gates

1. Verify current Netlify Git branch deploy/preview settings and which project owns the apex/domain rewrite.
2. Verify GitHub Releases and branch-protection configuration, and obtain owner acceptance of the first `0.x.y` baseline after production acceptance testing.
3. Choose and fund isolated staging Supabase and hosting resources; do not reuse the unexplored older `northgate-hq` project.
4. Design server-enforced Developer staging access with Clerk and the existing technical-assignment permission model.
5. Resolve the deferred database **and Storage-object** backup/recovery policy before relying on the new promotion flow for business-critical records.
