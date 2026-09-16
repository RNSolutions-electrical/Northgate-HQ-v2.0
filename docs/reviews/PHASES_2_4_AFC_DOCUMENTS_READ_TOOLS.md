# Phases 2–4: AFC, Documents and Northgate read tools

## Release authorization and database verification — 2026-09-16

Ryan explicitly requested commit and deployment. All four migrations are applied; filenames were aligned to Supabase's recorded versions: checklist 20260916103538, AFC 20260916103702, sections 20260916103706, read audit 20260916103711. An initial AFC attempt rolled back because it rebuilt the override allowlist from role defaults and omitted the separately granted Developer correction capability. The corrected migration extends the existing constraint, preserves that grant, and passes a new regression (40 isolated database checks total).

Actual-schema rollback-only suites now pass for both checklist finalization gates and unchanged $72.97 pricing/handoffs, AFC draft/replay/version/reviewer checks, service-only release/missing-file rollback/immutable archive, original destinations, document classification and read auditing. Test fixtures account for live required grant-audit columns and the existing transaction-NOW document timestamp trigger. No test jobs/studies/files/storage metadata/audits, reviewer grants or historical classifications remain. Existing correction permission remains intact.

AFC Edge Function afc-release version 1 is ACTIVE (ID 81a63b35-d563-4148-bf35-722453d1e892), bundle SHA-256 0a42bff0f95de542d08f4b7d5abe7347a180162fd81059b4fb595c8cdc1f6b3c. Browser preflight 204, missing-token denial 401 and forged-token denial 400 passed. It uses its custom caller-scoped Clerk/PostgREST check with the legacy gateway JWT check disabled. Authenticated browser uploads and physical printer acceptance remain unclaimed.

Security advisors changed only as expected: four RPC-only AFC tables have RLS with direct writes revoked and no table policies; eight new authenticated guarded SECURITY DEFINER endpoints. Existing anonymous endpoints, mutable-search-path and view findings did not increase. References: [RPC-only table policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [authenticated function review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

The pending choices remain default-denied AFC review and unchanged historical classifications. The external MCP route is unexposed and its OAuth connection is unconfigured; internal read tools remain disabled. Earlier local-only status and unapplied-migration statements below describe the pre-release checkpoint and are superseded by this section. Frontend publication and the final sync marker will be recorded after verification.


## Status — 2026-09-15

Local release candidate following the completed Estimate Finalization Checklist (HANDOFF 266). Ryan requested continuation into phases 2–4 of the existing “9/15/26 NGG HQ update” plan. No live migration, account grant, commit, push or deployment has occurred for these changes. The durable live marker remains **CEDAR-ESTIMATE-HANDOFF-20260915-001**.

Two rollout choices remain pending: AFC reviewer recipients (both Ryan Noel accounts or existing estimate-approval authority), and classification of ambiguous historical documents (leave unclassified or default to the job department). The implementation currently defaults AFC review authority to denied and preserves historical document classifications. The phase 4 external OAuth connection is not configured; the bounded read tools and transport foundation are implemented locally.

## Phase 2 — Available Fault Current add-on

- Native, permission-gated Add-On Tools workspace; shared studies, whole-document drafts, stable equipment IDs, optimistic versions, idempotent saves and account-scoped in-memory unsaved edits. Existing canonical Jobs records represent both jobs and service calls.
- Radial utility calculation with branching equipment, serial conductor segments, identical parallel sets, downstream transformers and guarded reparenting. Separate equipment/fault names and source references are retained.
- Optional independent open-transfer generator cases, explicit L–N sources and neutral loops, motor screening groups and referenced external engineering results. Blank optional inputs remain unmodeled. Partially entered or invalid applicable inputs block new PDF/label outputs.
- Engine scope is scalar radial 1–600 V. No automatic L–G calculation, parallel source network solution, inverter/UPS model, motor decay or network attenuation of motor screening contributions. Downstream transformer L–N requires explicit secondary source data. The UI and reports distinguish these limits, entered external results, the highest-case envelope and numerical nameplate comparisons. A numerical comparison does not establish equipment suitability or a governing fault.
- Draft report/selected label exports; fixed 4×3 or 6×4 label geometry. Reviewed releases preserve the original report, all-label batch, individual equipment labels and complete input/result JSON. Historical revisions retain their original equipment and destination names.
- One canonical engine/renderer under `supabase/functions/_shared/afc/` is reused by browser wrappers and the trusted release function. Engine `northgate-afc/1.0.0`; preset data `eaton-2014-table4-600v-single-conductors`.

### Source and calculations

The supplied AFC ZIP was inspected without executing its legacy HTML. Original package SHA-256: `976405B46F1595D10367DCF088DDCB66EEBE42EB6D76C1D9723438A5174EBDF3`. The newer optional-layers instructions informed scope. Imported original JSON is preserved; customer files and extracted source stay outside tracked source files.

All 84 conductor C presets were checked against [Eaton Electrical Formulas, Table 4](https://www.eaton.com/content/dam/eaton/products/electrical-circuit-protection/fuses/solution-center/bus-ele-tech-lib-electrical-formulas.pdf). Independent published examples cover transformer/feeder/downstream-transformer and center-tapped L–N cases with a 0.2% tolerance for published rounding. Generator screening scope was compared with [Schneider Electric's generator protection reference](https://www.electrical-installation.org/enwiki/Generator_protection). Tests use synthetic studies; no real installation validation is claimed.

### Security and immutable release

`20260916103702_afc_shared_studies.sql` adds `afc_studies`, `afc_revisions`, `afc_files`, `afc_requests`, the add-on and explicit `can_review_afc_studies` capability. All new tables have RLS; authenticated direct writes are revoked. Active accounts, add-on access, existing department/destination scopes and management authority are rechecked by controlled RPCs. No role or user receives reviewer authority automatically.

The permission-template editor allows the new explicit Developer reviewer exception while preserving its existing template and unrelated override protections. Relinking requires authority to both destinations; released history remains attached to its captured destination.

The `afc-release` Edge Function authenticates the caller through user-scoped PostgREST/Clerk authorization before privileged work, reloads authoritative inputs, recalculates, renders all artifacts, uploads unique private paths and verifies every stored byte hash. A service-only finalizer rechecks current actor authority, version, reviewer and job snapshot, then atomically commits the immutable revision, canonical Documents references, status and audit. Browser-supplied results/actor IDs are ignored. Replays return an existing receipt.

The reserved `afc/` storage prefix denies authenticated uploads, replacements and deletes. Reads require committed file metadata and authorized scope. Generic document maintenance cannot alter archived AFC artifacts. Failed releases may leave private unreferenced upload objects; they never become a released document or overwrite history. Orphan retention/cleanup is an operational follow-up, not an automatic deletion task.

`supabase/config.toml` disables the legacy gateway JWT check only for `afc-release`; the function's first user-scoped authorization RPC verifies the actual Clerk token. Service credentials remain inside Supabase. `deno.json` and `deno.lock` pin dependencies. The release currently renders individual labels and uploads serially; maximum-size Edge runtime performance still needs acceptance testing.

## Phase 3 — Documents sections and actions

`20260916103706_document_sections.sql` adds nullable `documents.document_section`: Construction, Electrical or General. NULL appears as Unclassified. Section is organizational metadata; it does not grant access or change department, ownership, path or file contents.

- Main Documents and shared Job/Service Call documents provide section counts/filtering, document type, destination, date and search controls. The global index reads all visible pages and resolves change-order/service-call destination references.
- Shared Open, Download and Open print view actions re-read canonical metadata under current RLS before retrieving the original file. PDF/image printing uses the browser's native view. Other formats retain original-application printing.
- Legacy HTML print/open previews are parsed inertly and rebuilt with an allowlisted text/table tree; scripts, active attributes and external resources are excluded. The original file remains downloadable.
- Managers can classify mutable records through a locked, expected-version, audited RPC using existing owner-management authority. Signed/source-owned/immutable records remain protected. Existing file edit/archive/upload behavior is retained.
- Future AFC reports/labels and inspection/electrical-testing document types default to Electrical. No historical row is reclassified by this migration. The live read-only inventory contained 20 visible records with mixed document purposes; division alone does not settle their intended section.
- Job and Service Call documents can open linked AFC studies. Released AFC artifacts expose original-file actions, without generic edit/archive controls.

## Phase 4 — Read-only foundation

`netlify/functions/_shared/northgateReadTools.mjs` implements five bounded tools:

| Tool | Purpose |
| --- | --- |
| `get_job_summary` | Authorized operational job summary |
| `get_service_call` | Authorized operational service-call summary |
| `search_catalog` | Search visible materials and aliases |
| `resolve_material` | Reuse the canonical resolver; preserve ambiguity and confirmation |
| `get_inventory_location` | Authorized location/stock information; unknown quantities remain null |

Tools use the caller's user-scoped Supabase client, existing RLS/read helpers and effective capabilities. They expose no dynamic SQL/table/RPC argument, business write, price or financial projection, model-provider call or service credential. Material search caps at 10,000 visible records and inventory stock at 1,000 rows, with explicit incomplete indicators. No result automatically selects material or invents stock quantities.

`20260916103711_northgate_read_tools_audit.sql` adds RLS-protected operational read auditing and a 120-request/minute per-actor limit. A successful audit start precedes business reads; the success audit must complete before returning data. Audit inspection requires an active Developer account. Audit writes record tool usage; they do not alter business records.

The internal `northgate-read` POST function uses the existing Clerk/Supabase session and is disabled unless `NORTHGATE_READ_TOOLS_ENABLED=true`. It is not an external MCP OAuth endpoint. `northgateMcp.mjs` provides a tested stateless JSON Streamable HTTP transport factory with tool metadata, origins, protocol negotiation and auth challenges, but has no public route.

An external ChatGPT/Codex connection still needs a real OAuth issuer and protected-resource metadata, issuer/signature/expiry/resource-audience/scope validation, approved PKCE callbacks and a separate per-user database credential or approved exchange. Ordinary Supabase session tokens must not be passed off as MCP resource tokens. References: [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth), [MCP server integration](https://developers.openai.com/plugins/build/mcp-server), [MCP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization). No external AI client is connected by this local change.

## Verification

- **113 Node tests pass**, including published AFC examples, graph/optional-case/import validation, release authority and byte-integrity behavior, checklist behavior, resolver/stock boundaries and MCP/internal endpoint behavior.
- **39 isolated AFC/Documents/read-audit database checks pass** with actual prior auth function snapshots: RLS denial, stale/replay handling, immutable history, missing-file rollback, captured destination, direct-write rejection, classification/audit protections and explicit reviewer exception. The estimate-checklist SQL suite also passes. This is isolated PGlite verification, not live migration acceptance.
- AFC and Documents browser checks pass at 1440 px and 390 px: edit/save failure retention, results/release history, invalid export prevention, section/search/date filtering, destination references and safe HTML preview. Existing document audit/edit/restore/archive/upload regressions pass at desktop, tablet and phone widths. Browser transport is mocked.
- Edge `deno check` passed. The final production-configured local frontend build passed at `.temp/inspection-production-check-1789518619958`, main `index-VgyQ6dT-.js`, Workbench `WorkbenchRoute-CuTYhN8m.js`. Existing xlsx mixed-import and bundle-size warnings remain.
- Synthetic report pages and individual labels were rendered and visually checked; desktop/phone screenshots were inspected. Actual label printer output, signed-in production acceptance, live storage release, multi-session contention and maximum-size load remain release checks.
- Live read-only checks confirmed migration patch anchors, the preserved document-owner enum and existing inventory-view account/department enforcement. No production data was changed.

Reproduction entry points: `npm test`, `scripts/verify-afc-db.mjs`, `scripts/verify-afc-ui.mjs`, `scripts/verify-document-sections-ui.mjs`, existing `scripts/verify-document-audit.mjs`, and `scripts/verify-estimate-checklist-db.mjs`. Database scripts use the existing temporary PGlite runtime; UI scripts require the configured Playwright module and Edge. Test artifacts remain ignored under `.temp/`.

## Release sequence and remaining decisions

1. Resolve the two pending business choices above. Keep default-denied reviewer access and unclassified historical files unless changed explicitly. Do not reuse the earlier inspection-review grant as an AFC grant.
2. Inspect current remote/main and live schema drift; preserve historical local `dist-*` directories. Revalidate existing checklist and all three migrations against the current linked project before applying them. The ordered unapplied set is `20260916103538`, `20260916103702`, `20260916103706`, `20260916103711`.
3. Obtain release authorization for this concrete candidate, then apply migrations, verify policies/RPC grants/audit behavior on the real schema, deploy the AFC Edge Function and verify denied/authorized release paths. Grant only the chosen reviewer/add-on recipients using existing permission management.
4. Publish the tested frontend and Netlify functions from an exact commit. Keep the internal read endpoint disabled until its authenticated operational smoke checks pass. Preserve `silas-chat`, existing configuration and integrations. Run signed-in desktop/phone acceptance, stale/retry tests, immutable archive download checks, destination scope denial and print/device checks.
5. Configure and independently accept the external OAuth/MCP adapter before exposing its public route or claiming a ChatGPT/Codex connection. Do not add an administrator/service-key bypass.
6. Record actual migration versions, commit/deploy IDs, asset/hash checks and a new durable sync marker only after verified release. If application rollback is needed, preserve additive schema and all draft/revision/files/audit history; disable the affected feature/endpoint rather than deleting records.

No package.json or frontend lockfile change was required. Existing dependency-audit findings remain recorded in the earlier estimate handoff release documentation.
