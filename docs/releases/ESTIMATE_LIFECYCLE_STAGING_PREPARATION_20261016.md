# Combined estimate Staging candidate — 2026-10-16

Ryan approved Staging deployment of standalone approval and archive/restore after
checks pass. Production promotion is withheld for his review. This document
supersedes earlier local-only approval-status notes; it is preparation, not a
deployment receipt. Single integration owner: this task on Ryan_Northgate.

## Integrated source

Baseline main a504f88; standalone 76c8083 reconciled as f82bfd1 and 873049f;
archive/restore 01ca121 integrated as cbe2d11, with diagnosis 98bd38e as dfb29cb.
Preserved v0.8.0/EOS, v0.7.3 promotion repair, tax/card handoff guard, calculator,
notes and labor-rate behavior. No changes to other checkouts or customer records.

Integration fixes: promoted personal sources retain the history message/read-only
state while official submission uses the configurable modal; pending standalone
review cannot be hidden through either directory archive or an old archive RPC.
Both actions serialize on the estimate header. Approval/archive/restore retain
the same immutable snapshot and exact pre-archive status.

## Checked dependencies and explicit migration order

Current Staging site: 431ce717-1a06-45a0-9d7a-8acd06a67dde,
https://staging.rnsolutions.net. Preflight published deploy
6ad0bc79a0ccfa5fa7fa9a2e, code 79b18c73ca37217b41b25aef729856d4d224c74a.
Staging Supabase: fazfwzbuesvzhgodckiw. Production is not a deployment target.

Read-only function hashes confirm shared archive/header/auth functions and the
v2 financial mapper match between environments. Staging still has the original
promotion function 742dcfe5660cc13392dbb870bb319d56, whereas Production has
71bbbcef4ee5f7bffddccf9fa6ee5385. Staging also lacks proposal charges. Therefore:

1. WAIT for the parent's final released CO security commit and reconcile it into
   this candidate before pushing/deploying Staging. Do not infer completion from
   a moving branch or race another release owner.
2. Revalidate refs, exact target, function hashes and data fingerprints. Integrate
   Staging history with a normal merge; never force-push over either environment.
3. Apply `20261016111126_staging_estimate_dependency_reconciliation.sql` first.
   It directly reaches the accepted promotion definition without installing the
   historical incident pause. Exact old/new hashes fail closed on drift. It then
   installs the accepted proposal-charge source; no record writes are included.
4. Apply `20261015171453_estimate_lifecycle_archive_restore.sql`, then
   `20261016110350_standalone_estimate_review_v080.sql`. These are new RPC/table/
   trigger additions; do not bulk replay all repository migrations. Record actual
   applied registry identities because MCP generates ledger timestamps.
5. Deploy the exact reviewed commit through the existing Staging Git connection,
   using that site's existing Staging-only configuration. Verify commit/deploy
   identity, banner, assets, deep links, Supabase target, RPC ACLs/RLS and unchanged
   customer-data fingerprints. No live customer test estimates or deletes.

Do not replay the Production-only EOS bootstrap onto existing Staging scorecard
objects. Its release receipt confirms the accepted EOS contract already matches.
Reconcile the final CO fix's own SQL requirements when supplied by its owner.

## Local evidence

337 named tests pass across src/tests/test (earlier 320 count omitted src tests).
Build passes with synthetic Development values; existing chunk warning only.
Standalone actual shell/router/editor UI passes at 1440px and 390px, including
review/approval/handoff, official archive error/retry/restore, promoted personal
read-only state and independent personal archive/restore. Existing modal, notes,
labor-rate and proposal-charge UI scripts pass with external requests blocked.
Archive component and standalone/lifecycle database suites pass; exact staging
dependency SQL passes in the standalone fixture. Existing promotion incident
regression passes against synthetic records.

Real local PostgreSQL 17.10 separate-session tests observe actual lock waits and
verify duplicate submit/approve/handoff idempotence, competing decisions/reasons,
submitted-save rejection, both archive-versus-submit orders, and personal
archive/restore contention. Local server is stopped after tests. Personal scope
authorization is synthetic; official estimate permission helpers use captured
fixtures. Shared databases are 17.6; live JWT/account acceptance remains distinct.
Evidence: ignored `.temp/standalone-checks` JSON/logs/desktop-mobile PNGs;
`scripts/verify-standalone-estimate-postgres.ps1` provides the repeatable local run.

## Current release boundary

No push, migration application or deployment has yet occurred for this combined
candidate. Staging approval is already granted; the remaining release dependency
is the parent's final CO security commit. No additional confirmation is requested.
Signed-in owner acceptance will be reported only after reaching the deployed app;
no owner-login gate has yet been encountered. Production remains unchanged by
this task and requires separate promotion approval.
