# Tool availability backend release checklist

## Local candidate

- Migration: `20261116112903_tool_availability_controls.sql`.
- All 17 tools initially enabled. Dashboard and Developer Tools cannot be disabled.
- Disable calls are rejected until enforcement is explicitly reviewed and the current API session reports `pgrst.db_pre_request=public.hq_tool_pre_request`.
- Active developer exemption is evaluated from the existing server-side permission function and active account table, not a client flag. Existing module permission checks still apply.
- Per-tool optimistic versions and immutable, transactional change history prevent stale toggles and record the actor and before/after states.
- Data API hook maps 391 source/migration resources (286 functions, 105 relations). Unknown business endpoints fail closed while any tool is disabled. Identity/bootstrap calls remain subject to their own original checks.
- Mapped base tables receive additional restrictive RLS policies, not replacement grants/policies. Constant guard calls use initplans.
- Four existing filtered directory/ledger views receive an outer availability predicate. Their existing columns, grants, and filtering semantics are preserved instead of blindly changing them to security-invoker views.
- `northgate-files` storage gets a restrictive policy by actual AFC, health-inspection, job, estimate, and document path ownership. Other buckets are untouched.
- `tool_addons`, `tool_addon_access`, and `northgate_tool_reads` are shared infrastructure, not the Tool Inventory module.
- Reports, Accounting, and Add-On Tools are presentation workspaces over shared data; hiding their workspace is not revocation of records legitimately available through another enabled workspace. No data is deleted.

## Hosted facts verified read-only on staging

The public base tables are RLS-enabled. Four named views lacked security-invoker, which is why this candidate wraps them rather than changing their existing authorization semantics. `pg_graphql` is not installed: `graphql_public.graphql` is a stub returning an extension-not-enabled error. The authenticator role has no existing `pgrst.db_pre_request`. Storage has separate AFC, inspection and document policies. These facts must be rechecked immediately before activation.

## Activation (requires root's specific approval, staging only)

1. Confirm the exact staging project, current backup/checkpoint and unchanged production. Recheck authenticator hook configuration, `pg_graphql` absence, map coverage, existing view definitions and storage policies. If another pre-request hook exists, stop and chain/review it rather than replacing it.
2. Apply the migration to staging. It does not disable anything or configure PostgREST. Verify all 17 rows enabled, audit empty, no direct authenticated writes to private tables, and function privileges/search paths.
3. Publish the reviewed application code, including the authenticated Silas/edge gates, to staging only. This requires specific public-source approval.
4. Configure the staging API hook only after approval:

```sql
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.hq_tool_pre_request';
NOTIFY pgrst, 'reload config';
```

5. Check through an actual authenticated Data API request that the hook is loaded. Do not treat local `set_config` tests as proof of hosted activation. Validate ordinary and developer access, direct RPC/table requests, the four views, future storage reads/writes and the service endpoints. Keep every tool enabled until that review is complete.
6. Record the coverage attestation only after the deployed server paths are verified:

```sql
UPDATE hq_tool_private.enforcement
SET reviewed=true, reviewed_at=now(),
    review_notes='Staging: exact release, hook, map, view/storage and server endpoint checks verified; GraphQL disabled'
WHERE singleton;
```

7. Run a bounded disable/re-enable test on an authorized staging-only module, checking real API denial for a non-developer, developer access and original permission limits, nav/direct routes, stale toggle rejection, no data loss, and audit history. Restore its enabled state. Keep Estimator and Daybook enabled throughout.

## Limits and dependencies

Disabling an owning tool can make shared data or downstream operations in other workspaces unavailable (e.g., Inventory stock in Estimates; Jobs handoff; Documents attachments). The console should explain this. Existing local downloads and already-issued signed URLs cannot be retroactively revoked by this feature. GraphQL must not be enabled without a new enforcement review; the readiness predicate rejects new disabling while that extension is installed. Existing roles and API secrets remain trusted administration boundaries, not end-user toggle bypass mechanisms.

The map is deliberately fail-closed for unknown Data API entry points while any tool is disabled. Re-run source inventory generation and review ownership whenever new endpoints/modules are added; do not treat the heuristic generator as automatic approval. Generated maps are snapshots, not live database introspection.

## Local validation completed

`node --test tests/toolAvailabilityDatabase.test.mjs` passed against fresh local PGlite. Tests cover authorized/unauthorized mutation, active/inactive developer, stale versions, idempotence, immutable audit, readiness lock, protected tools, mapped/unmapped RPC denial, spoofed headers, restrictive base tables, definer-view outer guards, storage reads/writes, developer exemption, re-enable recovery and retained records. Approved staging migration and API configuration are now installed; production is untouched. See current verification below.

## Staging verification update

- Original migration, read-only `tool_api_guard_status`, and authenticator pre-request activation applied to staging only under explicit approval.
- Public-key actual HTTP status probe returned 200 / true, proving the API session loaded the configured hook. Probe exposes one boolean, no user/config strings/business data.
- Approved Tools-only disable test returned HTTP 401 / SQLSTATE 42501 / "This tool is currently unavailable" for zero-row direct table request. Tools restored to enabled version 3, two audit entries. Estimator/Daybook remained enabled.
- Four guarded views, 99 restrictive policies, private RLS/grants and GraphQL absence verified through hosted catalog checks.
- `reviewed` remains false pending final dependency checks and deployment of server gates. Authenticated live UI has NOT been tested; user browser was not disturbed. SQL claim fixtures are not a replacement for live authenticated UI testing.
- Additive dependency closure migration conservatively propagates module dependencies through public function bodies to fixed point. This includes shared-function chains and reviewed fixed dynamic-SQL target literals. Shared auth/bootstrap/controls excluded. It can block more cross-workspace operations than the direct ownership map. Changes to functions require renewed dependency review; arbitrary future constructed dynamic identifiers cannot be proven covered by source-name matching.
- Local regression verifies three-hop SECURITY DEFINER Estimates-to-Jobs dependency blocks an ordinary API request while Estimates remains enabled, preserves active developer behavior, and restores ordinary access after re-enable.