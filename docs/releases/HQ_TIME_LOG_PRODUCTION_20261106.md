# HQ Time Log selective Production promotion

## Scope and release candidate

Ryan requested Developer Tools as the sidebar workspace and authorized Production
promotion to verify the existing assistant account. The candidate is based on
Production main `d0ce0ba30dca6282b29cd6ca9a6c726d4e72c39e`. Only the time-log
feature, its Developer Tools navigation correction, tests and release records
are included. Unrelated Staging EOS/estimate changes remain excluded.

Developer Tools opens HQ Time Log. Ordinary Add-On Tools and Developer
administration stay separate. The nested workspace heading/highlight is corrected;
route and server permission gates are unchanged. No compensation agreement or
payroll action is implied by the recorded time.

## Database receipt

Applied only to Production Supabase `keogysnoukbendfkfjcn` after fresh dependency,
identity and name-collision preflight. Source migration:
`20261106114145_developer_hq_time_log.sql`, SHA-256
`ba9ebc8a5bc0e9bdf2185c09d7387424a40dad6fc1f3fb6ea0104e54f3ab6c5d`.
Production's hosted ledger version is **20261106122025**, name
`developer_hq_time_log`. The source filename matches the earlier Staging ledger;
do not replay the migration to reconcile those timestamps.

The transactional migration creates only new tracker tables/functions/indexes,
policies/triggers and grants on new objects. It does not rewrite operational
records or change an existing identity, role or protected binding. Eight
before/after preservation fingerprints match, including existing auth helpers,
full permission/technical-assignment/binding records and public schema definitions,
policies, triggers and ACLs. No credential or tracker-only grant was added.

Rollback-only Production SQL smoke passed canonical Developer create/archive/
restore/timer/idempotency/audit checks and real assistant/ordinary/anonymous denial.
After rollback, tracker entries, audit rows and optional grants are all zero.
These SQL-role tests are not proof of the assistant's live JWT/browser integration.

Advisor changes are limited to expected default-deny private allowlist INFO,
checked default-performer SECURITY DEFINER warning and two unused-index INFOs.
No new error or anonymous-definer warning appeared. WAL archiving was active;
a separately usable backup/PITR recovery point was not verified. No old data was
rewritten and no full restore is proposed. Forward-fix the feature if needed;
preserve future tracker entries and immutable audit history.

## Verification

- Production candidate explicit suite: 399 passed, one existing skip, zero failures.
- Production-identity Vite compile passed with dummy build-only public values;
  these values are not deployment configuration or live-auth evidence.
- Isolated PostgreSQL migration and security tests passed.
- Thirteen focused model/navigation tests, three rendered workspace shell cases,
  and twelve mocked tracker runtime scenarios passed.
- Existing Staging feature passed actual Developer sign-in, manual save,
  notes/items/focused estimates, reload, immutable history, clock-in/out and active
  reload. Both synthetic Staging sessions were stopped and recoverably archived.
- Desktop/mobile Staging visuals and native datetime keyboard mock tests passed.

## Access and remaining release checks

The verified Production assistant account is active but its legacy Developer
label is not a canonical Developer assignment. The current gate intentionally
denies it. A tracker-only grant can be separately approved without granting
HQ-wide technical privileges. None is included in this release.

The Production frontend deploy and signed-in read-only checks are pending at this
checkpoint. Do not claim live assistant access before verifying the actual
account. Production smoke must not create real work sessions. Concurrent hosted
requests and independent signed-in cross-browser persistence remain unexercised.

Review path after deployment: https://rnsolutions.net/northgate/hq-time.

## Verified Production publication

PR #3 merged to main as `39f7e1566965840ce8d3d5778373777156703aa6`.
Its tree `c92d1dc34997618d6a4bb6ced4165a49d20812c7` is identical to the
tested selective candidate. Netlify Production deploy
`6aedc80928dba70a48eb1484` is ready/current, published
2026-11-06 12:29:28.258 UTC, from that exact commit. The secret scan examined
1,129 files with no matches. Review https://rnsolutions.net/northgate/hq-time.

The preview check failed before publication because its existing Netlify
deploy-preview configuration omitted explicit `VITE_APP_ENV`. The repository's
environment guard correctly stopped that build. Neither the guard nor hosting
settings were weakened. The separately authorized normal main/Production build
succeeded.

The Developer Tools workspace is now published. Existing role/credential records
remain unchanged. Read-only Production browser QA and separately approved
tracker-only assistant access verification remain in progress at this receipt;
do not interpret this deploy as a verified assistant login or write. No Production
work session was created. Staging remains on its independent tracker build; no
whole-branch synchronization or unrelated feature promotion occurred.

## Deployed read-only browser verification

The existing Production Primary Developer session successfully loaded the empty
tracker, including all dates and archived entries. Developer Tools heading and
active highlight are correct. Blank manual drawer open/close and Back/Forward
pass without saving. Desktop/mobile layout passes, with table scrolling contained
and no drawer horizontal overflow. Browser warning/error capture was empty.
Loaded bundle `index-CJfRVY3f.js` references the Production Supabase host; individual
requests were not independently sampled. No Production save or timer was created.
This verifies the Primary Developer session, not the assistant's separate login.
The assistant grant/session verification remains pending outside this code release.
