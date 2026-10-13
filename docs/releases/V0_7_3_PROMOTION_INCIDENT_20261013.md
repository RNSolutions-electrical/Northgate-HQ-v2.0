# Northgate HQ v0.7.3 — Production promotion incident repair

Ryan explicitly authorized this narrow Production incident mitigation. The
unrelated standalone-estimate approval candidate remains local and unpublished.

## Scope and cause

Only `public.apply_v5_estimate_promotion(uuid,integer,text,text)` was changed,
in two controlled function-definition migrations. No table/record deletion,
estimate approval, job/service creation, compute upgrade, permission change,
broad migration replay or frontend change occurred.

The September submission adapter projects `working_copy.payload-'reviewProposals'`
into the official destination. Promotion compared it against the full payload
and raised application SQLSTATE 40001 at line 55. Both sampled pending requests
had matching owner/version/full source hash and matched the projected payload.
The relevant functions/caller predate today's v0.7.2 release. Production's live
caller makes one POST RPC per reviewer action, with no retry loop; the pinned
PostgREST JS SDK does not retry POST. PostgREST's documented server-side 40001
retry issue is the likely amplifier; its deployed version/original HTTP actor
were not established. No customer mutation RPC was invoked to reproduce it.

## Containment and repair sequence

1. Captured the exact Production definition, owner, ACL, search_path and pending
   request identity/version/hash metadata in `.temp/promotion-incident/`.
   Original definition MD5: `742dcfe5660cc13392dbb870bb319d56`.
   Exact function recovery round-trip passed in disposable PostgreSQL. This is
   a verified function-level recovery point, not a claimed full database backup.
2. Tested and applied `20261013223023_pause_estimate_promotion_incident` at
   **22:30:23 UTC**. A first-statement PT503 guard prevented all promotion writes.
   Backend 2175645 emitted its last 40001 at 22:30:23.874 and one PT503 at
   22:30:23.892; backend 2175652 emitted its last 40001 at 22:30:23.882 and one
   PT503 at 22:30:23.886. Both old sessions then disappeared. No broad cancellation
   was used or needed; the non-retrying pause stopped the precisely observed loops.
3. Verified no active promotion, zero promotion errors/new paused requests in
   22:31–22:35, and a flat rollback counter for more than six minutes before
   removing the guard. Both customer destinations remained pending version 1
   with unchanged hashes. Thus old requests did not resume into successful writes.
4. Actual-function synthetic tests passed, then applied
   `20261013223745_fix_estimate_promotion_conflicts` at **22:37:45 UTC**.
   The comparison now uses the same projected payload while retaining the
   full source hash/version/owner and destination hash/version checks. Its
   three explicit application-conflict raises use PT409, not serialization
   SQLSTATE 40001. Genuine database serialization errors are not rewritten.
5. Final definition MD5: `71bbbcef4ee5f7bffddccf9fa6ee5385`. No pause remains.
   Owner `postgres`, ACL `{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}`
   and `search_path=public, pg_temp` are identical to the captured baseline.
   Live read-only predicate checks confirm both affected payloads now match
   the projection; both customer destinations still remain pending/version 1.

The two filenames match the actual Production migration ledger. Both migrations
fail closed if the expected definition/anchors have drifted. Nothing else was
replayed. Do not manually rerun already-applied migrations or restore the old
40001 definition into a live endpoint.

## Recovery evidence

Before containment, matching logs ran at 6,000 events/minute at 22:17 and 22:18
across two sessions. Database-wide rollbacks increased 188,006 between 22:19:12
and 22:21:55 (about 1,151/second); these are database-wide counters, not an exact
RPC invocation count. At 22:31:10, 22:37:24 and 22:41:21 the rollback counter was
identically **19,738,967**. The post-repair 22:38–22:40 window had zero matching
promotion/40001 errors and no active promotion query was observed.

The emailed CPU threshold was >80%; current CPU percentage could not be read
independently. Retry/error/rollback recovery is verified; total user impact,
the original HTTP actor, provider retry version and CPU telemetry remain unknown.
No edge-log rows were returned for the bounded diagnostic window.

## Validation

- `scripts/verify-promotion-incident.mjs` passed in a fresh in-memory PGlite
  database using captured actual promotion/completion functions and current
  Workbench structure validation. Reproduces the original failure locally;
  proves PT503/no writes and exact recovery; validates projection, full source
  owner/version/hash and destination version/hash rejection, PT409 conflicts,
  role/inactive/department rejection, one official draft on retry, unchanged
  private annotations, separate linked proposals retained, and atomic rollback
  if the completion audit fails. Authorization decisions use synthetic fixture
  profiles; no live account claims or multi-session load test are claimed.
- Complete existing named regression command passed **308/308**:
  `node --test tests/*.test.js tests/*.test.mjs test/*.test.js`.
- No frontend files, packages, functions, notes/calculator/labor implementation,
  security grants or RLS policies changed. Existing public frontend remains
  v0.7.2 code `b4529347a4c79119971d620cfce738630e027c98`, Netlify ready deploy
  `6ace81232c40f252dfd1bb70`; no new frontend deployment is necessary.
- Security advisor read reports existing global findings, including the generic
  [authenticated SECURITY DEFINER execution notice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
  The incident function's existing explicit role grant/auth checks/search_path
  remain unchanged. Unrelated advisor issues were not remediated in this incident.

## Release/recovery discipline and follow-up

Record these migrations and tests on `main` as a database-only patch release,
using `[skip ci]` to preserve the already-verified web deployment. Existing tags
are immutable and untouched. Staging remains at `8858de8`; standalone feature
commit `76c8083` and its migration remain unpublished/unapplied.

If a regression appears, re-contain this endpoint with a reviewed non-retrying
pause and forward repair from the preserved definition. Preserve pending source
records, linked requests, notes and audit history; do not clear statuses or
auto-promote customer records as recovery. No full database restore was used.

Reviewers should reload the queue and make a fresh explicit decision. No real
customer promotion was used as a smoke test. A separately authorized labeled
fixture can verify authenticated end-to-end HTTP behavior later. Other modules'
application 40001 raises remain outside this narrow incident and need separate
review; no blanket SQLSTATE rewrite was made.

Primary references: [PostgREST retry defect/fix](https://github.com/PostgREST/postgrest/pull/4222),
[custom HTTP SQLSTATE documentation](https://docs.postgrest.org/en/v13/references/errors.html#raise-errors-with-http-status-codes).
