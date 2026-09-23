# Environment and release workflow — implementation draft

**Status (2026-09-23):** Preparatory implementation on `development`. The independent Netlify staging project and a persistent, data-less Supabase branch exist, but no application has been deployed to staging. Schema replay and structural parity are verified. The separate invite-only Clerk staging instance has verified DNS and issued SSL certificates. Netlify verified the staging domain DNS, but its site certificate has not yet been observed as issued. The staging Netlify project has no environment variables. Developer-only access, authentication against the staging database, and end-to-end isolation are not yet verified. Staging is **not** ready for testers.

## Vocabulary

- **Production:** the live Northgate HQ application at `rnsolutions.net/northgate`, regardless of version number.
- **Staging:** completed development awaiting owner/developer acceptance at `staging.rnsolutions.net`. Infrastructure is being provisioned; the app is not deployed there.
- **Development:** active work, including incomplete features. Not user-facing by default.
- **Release:** a known code commit, database migration set and deployment record carrying an immutable `v0.x.y` tag and corresponding GitHub Release. `1.0.0` is reserved for the first company-wide release.

Historical `V1`–`V5`, the repository name, and `package.json` `3.0.0` are development-generation labels, **not** official SemVer releases. No formal baseline version has been assigned yet.

## Branch and environment map

| Branch | Purpose | Deployment | Database |
| --- | --- | --- | --- |
| `main` | Production source; currently deployed automatically by the existing Netlify site | `rnsolutions.net/northgate` | Existing production Supabase `keogysnoukbendfkfjcn` |
| `staging` | Accepted integration candidate; locally created from production baseline | Dedicated Netlify site `northgate-hq-staging`, not yet deployed | Persistent data-less Supabase branch `fazfwzbuesvzhgodckiw`; structural schema parity verified |
| `development` | Active feature work; locally created from production baseline | No production deployment | Must not default to production for test writes |

All three branches were initialized locally from production commit `0340cdf8cc4a93f41cce8ed5a40553161e86314f` on 2026-09-22. `development` was published only after adding a build/runtime guard that rejects non-production builds configured for the Production Supabase project; `main` remains unchanged. The separate Netlify site ID is `431ce717-1a06-45a0-9d7a-8acd06a67dde`; Wix DNS `staging` is a verified CNAME to `northgate-hq-staging.netlify.app`. The staging Supabase branch ID is `aa1505f5-2c98-4a4c-b66c-1d60a2f8723f`, project ref `fazfwzbuesvzhgodckiw`, with `persistent=true` and `with_data=false`. **Do not deploy the app yet:** an access boundary and isolated build/function configuration are still missing. Do **not** push `staging` or enable a staging deploy until those gates and an end-to-end isolation test pass. Keep legacy recovery/backup branches and untracked local output intact.

### Staging database repair and parity evidence (2026-09-23)

The production migration ledger omits several older foundation SQL files that nevertheless exist in the repository and production schema. A data-less branch initially replayed only part of that schema and failed. On **staging only**, the missing documents/jobs/inventory foundations, granular permission-overrides foundation, and Silas foundation were applied from existing repository SQL; an identical historical schedule migration was marked applied only after its SQL matched byte-for-byte. A missing schedule archive guard function/trigger and seven function definitions were restored to match production. No production schema or data was changed.

The branch now reports `FUNCTIONS_DEPLOYED`. Read-only comparisons show 102 public tables, identical public column layouts, 165 identical RLS policies, identical public trigger definitions, 300 public functions with matching definition fingerprint, and one storage bucket in both environments. Staging has zero jobs, inventory items, user-permission rows, or stored objects; production data was not copied. Staging has 198 migration records versus production's 186 because repository foundations were added to repair replay. This is structural parity evidence, **not** proof of JWT/auth configuration, permission grants, Edge Function secrets, or a successful staging application write test.

### Separate Clerk staging authentication

The `Northgate HQ Staging` Clerk application (`app_3Jj9hf14nPCLsVNJN3zGVHWdkg1`) was created in the existing RN Solutions, LLC Hobby workspace. Its development and production-grade staging instances are **Invite-only**. The production-grade instance is `ins_3JjCGiMRcR9BsAEnuux0vhFxEV9` at `staging.rnsolutions.net`, configured as a **secondary application** so its API uses `clerk.staging.rnsolutions.net` instead of the existing primary `clerk.rnsolutions.net`. The user completed the production-instance creation in Clerk after an approval guard halted Codex's attempt. On 2026-09-23, its native Supabase integration was enabled and the isolated staging Supabase branch's Third-Party Auth was configured with `https://clerk.staging.rnsolutions.net` (verified enabled in both dashboards). Application invitations for `crncmk@gmail.com` and `ryan@thenorthgategroup.com` are pending, each with a 30-day link expiry. These are application-user invitations, not Clerk dashboard-workspace membership; no Developer role has yet been assigned. Clerk currently lists unlimited applications and a custom domain on Hobby, but use of premium features could require a paid upgrade. The staging Netlify site remains undeployed.

The following five CNAME records were added in Wix on 2026-09-23. Their names are relative to `rnsolutions.net`; the existing `staging` → Netlify record and production Clerk records were left unchanged. All five resolved to the listed targets in a DNS lookup, and Clerk verified Frontend API, Account portal and Email (3/3) with SSL certificates issued.

| Name | Value |
| --- | --- |
| `clerk.staging` | `frontend-api.clerk.services` |
| `accounts.staging` | `accounts.clerk.services` |
| `clkmail.staging` | `mail.e9a6fckoysdq.clerk.services` |
| `clk._domainkey.staging` | `dkim1.e9a6fckoysdq.clerk.services` |
| `clk2._domainkey.staging` | `dkim2.e9a6fckoysdq.clerk.services` |

Netlify's `northgate-hq-staging` Domain management reported **DNS verification was successful** again on 2026-09-23, but HTTPS still read **Waiting on DNS propagation** and the site had no deploy. Do not bypass the browser's certificate warning. Netlify provisions its certificate automatically; recheck Domain management → HTTPS before testing.

### Staging readiness work that can proceed without deployment

1. Configure the **staging Netlify project only** with `VITE_APP_ENV=staging`, `VITE_BASE_PATH=/`, the staging Supabase URL `https://fazfwzbuesvzhgodckiw.supabase.co`, its own publishable/anon key, and the staging Clerk publishable key. Do not copy production keys. The staging Netlify environment-variable inventory was empty on 2026-09-23. Keep keys in Netlify settings, never in tracked files.
2. Inventory server-side function variables separately: `SUPABASE_URL` and `SUPABASE_ANON_KEY` must resolve to the staging branch when a function is enabled. Leave `NORTHGATE_READ_TOOLS_ENABLED` off until its staging auth/data-access test passes. Review other function secrets and third-party integrations before enabling them.
3. Validate Clerk ↔ staging Supabase JWT integration and issuer/audience, staging RLS with an authorized Developer identity, and denial for a non-Developer identity. Invite only designated staging testers; invite-only Clerk signup by itself is not a Developer authorization boundary. Prefer email sign-in for the first smoke test unless Google SSO is explicitly configured for this separate app.
4. Verify the exact staging commit, build-time banner/title, root-path assets and deep links, database and Storage writes, and function target. Confirm a staging-only test write is absent from Production. Do not test with production records.
5. Confirm Netlify's certificate is issued and the browser opens `https://staging.rnsolutions.net` without a warning. The site will still be empty until a deliberate staging deploy is made after the above gates.

The Vite config defaults `VITE_BASE_PATH` to `/northgate` for Production. The former `netlify.toml` build-environment value was removed locally because Netlify gives file-based variables precedence over site variables; the staging site now has an explicit `VITE_BASE_PATH=/`. Verify both paths in build output before promotion. The existing build guard blocks non-production builds targeting the known Production Supabase project, but it does not validate every key or enforce Developer access on the server.

### Initial staging identity decision (2026-09-23)

The owner selected **email sign-in**, with `CRNCMK@gmail.com` for Developer work and `Ryan@thenorthgategroup.com` for testing ordinary user roles. The second account must not receive Developer authority merely to enter staging. Clerk's separate staging instance is invite-only; no user invitations or role grants had been made when this decision was recorded. The initial access boundary can admit only these two invited identities while the existing staging-database permissions control their different application roles. Validate invite-only enforcement and deny an uninvited identity before considering the site ready. If access is later broadened, define an explicit, server-enforced staging-access permission instead of treating Director or ordinary User as Developer.

The current application requests Clerk tokens with the legacy `supabase` JWT template in many call sites. The separate staging Clerk instance has no matching template, and the staging Supabase branch had no Third-Party Auth provider when inspected. Before deployment, choose one compatible path and test it end to end. The preferred long-term path is Clerk's native Supabase integration and session token with a staging-only adaptation that does not change Production's token behavior; do not copy Production's JWT signing secret or use a Production token in staging. Supabase and Clerk both document the legacy template integration as deprecated.

The staging Netlify site has `VITE_APP_ENV=staging`, `VITE_BASE_PATH=/`, `VITE_SUPABASE_URL=https://fazfwzbuesvzhgodckiw.supabase.co`, and staging-only Clerk/Supabase publishable keys in its build environment. Staging-only `SUPABASE_URL` and `SUPABASE_ANON_KEY` are configured for functions; read tools remain disabled. None of these values were put in tracked files, and no deployment has been made. The application now has a shared token adapter: Production retains the legacy Clerk `supabase` template, while Staging requests a native Clerk session token. Local focused tests and a staging build passed on 2026-09-23; the Clerk/Supabase provider trust and end-to-end RLS test remain pending.

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

The preparatory `development` commit already provides an environment-derived banner/title and fails builds or local development that identify as Staging/Development while targeting the known Production Supabase project. This is an additional guard, **not** a replacement for isolated infrastructure, server-side authorization or deployment settings. The existing production build remains unmodified until a deliberate promotion.

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
