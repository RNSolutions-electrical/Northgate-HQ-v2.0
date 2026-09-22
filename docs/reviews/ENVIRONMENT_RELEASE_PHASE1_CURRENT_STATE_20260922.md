# Northgate HQ environment and release safety — Phase 1 current state

**Date:** 2026-09-22

**Scope:** Read-only audit and proposal. No branch, application, Netlify, Supabase, DNS, or backup configuration was changed. This report is not a release and should not trigger deployment.
**Observed production sync marker:** `COPPER-ORBIT-20260922-001`

## 1. Current-state architecture and deployment map

| Layer | Observed state | Evidence / qualification |
| --- | --- | --- |
| Source | `RNSolutions-electrical/Northgate-HQ-v2.0`, local working repository `northgate-hq-v2-current` | `origin/main` and local `main` both at `0340cdf8cc4a93f41cce8ed5a40553161e86314f`. The tracked tree is clean. Numerous **untracked** `dist-*`, `output`, `prototypes`, and alternate `node_modules` directories exist and must be preserved until individually classified. |
| Production code branch | `main` | Netlify production deploy `6ab2d90c269cd800087bc95c` reports branch `main`, commit `0340cdf`, state `ready`, published 2026-09-22 19:38 UTC. A push to `main` is therefore a production release risk. |
| Production web | `https://rnsolutions.net/northgate/` | Netlify project `northgate-hq-v2` (`16adb4ff-83a9-4440-8aad-fcb820d55cac`) reports `https://rnsolutions.net` as its primary URL. The deployed app is mounted under `/northgate`; its route and JavaScript asset returned HTTP 200 after the latest release. `DEPLOY.md` describes a two-site proxy; the exact current DNS/proxy ownership was **not** independently proven by this audit and must be confirmed before changing domains. |
| Build | Vite / React; Netlify `npm ci && npm run build`, publish `dist`; `VITE_BASE_PATH=/northgate` in `netlify.toml` | `package.json` says `3.0.0`; this is a historical generation label, **not** evidence of a formal 3.0 software release. No `.github` Actions directory was present in this checkout. Netlify's Git-connected deploy remains the operative automatic-deployment path. |
| Production browser configuration | Netlify environment has `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; `VITE_BASE_PATH` is in `netlify.toml` | Only variable **names** and the Supabase project reference were inspected; secret/key values are intentionally omitted. The configured Supabase URL resolves to `keogysnoukbendfkfjcn`. No staging-specific variable set was found. |
| Production database | Supabase project `northgate-hq-v2.0` (`keogysnoukbendfkfjcn`), PostgreSQL 17, region `us-east-2` | This is the live project referenced by Netlify and release migrations. The Supabase organization is on the Pro plan. Existing auth uses Clerk JWTs with Supabase RLS/RPCs, not a separate staging identity boundary. |
| Other Supabase project | `northgate-hq` (`qpbuzinkjbjbvcdwvdfu`), region `us-east-1` | Existing older project. Its data, security, use and recovery role were **not** established. Do not relabel, reset, seed or point staging at it without an explicit inventory. No non-default database branch was listed for the live project. |
| Supabase functions/files | `afc-release` Edge Function is active; function source is tracked under `supabase/functions/`. About 199 local migration files are tracked. | Storage buckets, object bytes, function secrets, direct database settings and actual backup inventory require a separate privileged read-only audit before implementation. |
| Alternate web projects | Netlify also lists `northgatehq` and `northgate-estimator-ai-takeoff`. | Their current deploys are older. Neither was verified as staging or as the live `/northgate` source. Do not repurpose them without a separate domain, build and data-access audit. |

### Branches and recovery references

- Local and remote: `main` is current and production-facing.
- `origin/feature/job-financial-forecasting` is **241 commits behind** `main` and has no commits ahead; it is not a current development branch.
- `origin/northgate-hq-v3-rebuild`, `origin/v2-preserved-before-v3-rebuild`, `origin/codex/macbook-handoff-20260826`, `origin/codex/job-transactions-log`, and the local backup/checkpoint/recovery branches preserve history. They are not demonstrated staging deploy sources; do not delete them.
- Existing Git tags: `v2-final-before-v3-rebuild` and `backup-northgate-hq-20260826-c484a1e`. These are historical recovery labels, not SemVer releases. GitHub Release objects were not confirmed.
- The adjacent `northgate-hq-v3` directory is an older, separate non-Git working copy with its own `.env`, build output and prototype migration notes. It is operationally sensitive until its deployments and local-only work are reconciled, but it should not become staging by assumption.

## 2. Historical version interpretation and proposal

The labels do not identify formal releases. `V1` appears to denote the original application generation; `V2` the long-lived repository/backend and its pre-rebuild UI; `V3` the UI rebuild and current `package.json`/directory naming. `V4` is not reliably mapped from the audited evidence and must remain **unclassified** pending owner/history confirmation. `V5` names a September 2026 implementation package and ongoing permission/financial reconciliation, not a shipped major release. Historical documents and tags should retain their names as history.

**Proposed release baseline, not yet adopted:** after a known-good acceptance point, tag the exact production commit as the first formal `v0.5.0` (or another agreed `0.x.x` baseline). Bugfixes become `0.5.1`, etc.; staging candidates may use `0.6.0-rc.1`; active development may be described as `0.7.0-dev`. Do not retroactively rename Git history or claim `package.json` `3.0.0` is a real SemVer release. Update package/app display version only during a separately approved release migration. `1.0.0` remains the first company-wide release.

## 3. Proposed Development → Staging → Production architecture

1. Retain `main` as Production because it currently drives the live Netlify deploy. Protect it and stop direct feature pushes before broader beta; document emergency hotfix handling.
2. Create a new `staging` branch from the **verified production commit**, not from an old feature/rebuild branch. Create a separate `development` branch from that same baseline for unfinished work. Names are proposals until Netlify build-branch dependencies are confirmed.
3. Create a separate Netlify staging site (or a deliberately configured independent branch deploy) at `staging.rnsolutions.net`, with branch-scoped build variables, an environment-derived staging banner/title, and no automatic promotion. Confirm who owns DNS and the `/northgate` proxy before editing either.
4. Enforce Developer-only staging access at an edge/server boundary in addition to Northgate application permissions. A client-side route guard alone cannot protect downloaded bundles or prevent backend calls. Confirm how Clerk JWTs and Developer technical assignment are verified server-side without granting Director business authority. Keep production auth behavior unchanged.
5. Create a **new, isolated Supabase staging project or suitably isolated persistent branch** after cost/security review. Never use the production URL/key as staging defaults. Reapply versioned schema, RLS, storage policies, Edge Functions and secrets; use sanitized or synthetic fixtures. Verify a staging write and a production non-write before opening staging to testers. A separate development database may follow if active development needs isolation from staging acceptance tests.
6. Promote only accepted commits, not a moving branch by assumption. Record the commit, migration set, database recovery point, acceptance evidence, tag and GitHub Release. Apply backward-compatible database changes in the approved environment/order; promote to production deliberately and verify the exact deployed commit.

## 4. Backup and recovery assessment

Git history and the two existing tags preserve code; no formal SemVer release archive or verified offsite code archive was established. Local untracked build/output copies are **not** a reliable release archive. Netlify may retain previous deploy artifacts, but that is not a database recovery strategy.

Supabase reports the organization as **Pro**. Its current [backup documentation](https://supabase.com/docs/guides/platform/backups) says Pro projects receive daily backups with a seven-day dashboard window; this alone cannot provide eight weekly recovery points. The live project's actual backup inventory, optional PITR setting, retention, recoverability and restore permissions were **not verified**. Database backups omit Storage object bytes; restoring database metadata alone will not recover deleted files. A weekly eight-point policy therefore needs separately approved secure offsite storage or another supported arrangement, with encrypted credentials, Storage-object coverage, retention costs, monitoring and a restoration drill. Do not schedule exports or change retention yet. Before any substantial migration, confirm an actual restorable recovery point and a tested restore-to-isolated-environment procedure.

## 5. Risks and unknowns

1. Direct `main` pushes can cause production UI changes during an active user session; the 2026-09-22 deploy demonstrated this coupling.
2. Production and local development currently share the same Supabase project/Clerk app by design; local tests or unfinished migrations can affect real beta data.
3. Netlify reports one app project whose primary URL is the apex, while `DEPLOY.md` describes a separate landing-site proxy. Domain/proxy ownership must be reconciled before creating `staging.rnsolutions.net`.
4. An older Supabase project, older Netlify projects and the separate `northgate-hq-v3` directory exist; none is verified disposable or suitable for staging.
5. Pro's stated seven-day backup window does not meet the proposed eight-week target, and database backups do not include Storage objects.
6. The live Supabase backup list/PITR state, storage buckets, production secret inventory, and GitHub Release inventory were not exposed by the read-only tools used here. Treat them as implementation gates, not positive findings.
7. Several repository documents and `package.json` call the app `v2`/`v3`, and `V5` names a feature package. These labels could be mistaken for formal releases without an explicit vocabulary note.

## 6. Exact proposed implementation sequence and rollback

**Gate A — verify and preserve:** owner confirms this report, the true domain/proxy ownership, live Netlify build branch, GitHub Release inventory, live backup/PITR status, and any local-only work in the older directory. Record the currently live commit/deploy/database migration head; check production restore capability before changing CI/CD.

**Gate B — release controls:** agree first `0.x.x` baseline; create immutable tag and GitHub Release from a known-good production commit; write release notes and migration manifest. Configure branch protection/review controls without rewriting history. Rollback: remove newly added protection rules if they impede urgent recovery; leave original tags/releases intact.

**Gate C — branch isolation:** create `development` and `staging` from the verified baseline; keep `main` and current Netlify production settings unchanged. Confirm new branches do not deploy to the production site. Rollback: stop using the new branches; no production code/data change is required.

**Gate D — isolated staging data/auth:** provision isolated Supabase, apply/test schema and RLS, configure Clerk/JWT integration and sanitized fixtures; prove both staging write and production non-write. Rollback: disable staging access/deployment; do not redirect it to production data.

**Gate E — independent staging web:** configure staging-only Netlify/DNS, environment banner/title, server-enforced Developer access, and build metadata. Test desktop/mobile, auth, data access and deep links. Rollback: disable the staging site/DNS only; production remains on its original site/branch.

**Gate F — promotion and recovery drill:** rehearse a feature through development → staging → accepted tag/release → production, including pre-migration recovery point, immutable deploy identification, smoke tests and a restore-to-isolated-environment drill. For a failed **code-only** release, redeploy the previous known-good commit/deploy without force-pushing. For a failed **database** change, prefer a tested forward-fix; restore only from a verified recovery point after assessing data created since it and Storage-object consistency. Never assume a frontend rollback reverses a migration.

## Approval boundary

Phase 1 ends with this document. No Phase 2–10 implementation, cleanup, migration, branch creation, tag, deploy, backup job or DNS change is authorized by this audit alone.
