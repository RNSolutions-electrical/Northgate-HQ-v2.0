# V5 permission and usability repository mapping

**Mode:** Production Mode

**Package:** `Northgate_HQ_Codex_Implementation_Package_v5.zip`

**Approval:** Ryan approved the entire package as design intent on 2026-09-20. Proposed workbook rows are therefore implementation inputs, subject to repository reconciliation, security review, and controlled production rollout.
**Production boundary:** Local implementation is authorized. Production migrations and deployment require separate approval.

## Current baseline

- Repository baseline: `9b2d16c` on `origin/main` before this milestone.
- Production database: Supabase project `keogysnoukbendfkfjcn` (`northgate-hq-v2.0`).
- Protected Primary lookup was performed read-only and resolved exactly one active record. The stable Clerk subject is stored only in the migration; runtime protection does not compare email addresses.
- Temporary `can_developer_data_correction` Pay App deletion remains in force by explicit approval. It is an exception to the ordinary business-authority model and remains marked for later narrowing/removal.

## Repository mapping

| Package item | Existing source of truth | Current state | Required delta |
| --- | --- | --- | --- |
| MAP-01 / AUD-035 estimating and inventory prices | `financial_line_catalogue`; estimating catalogue and inventory material catalogue/resolver | Partial. The financial catalogue currently supplies project budget lines; estimating and inventory already have catalogue logic, but the package's explicit precedence and immutable source/value snapshots are not unified. | Define one price-resolution contract: explicit inventory price, including zero, wins; otherwise use the current estimating master price. Snapshot source and value into estimates and valuation events. Do not rewrite historical values. |
| MAP-02 / AUD-063-064 service-call edits and cost imports | `jobs` + `svc_service_profiles`; service billing, stages, invoices, payments, voids | Partial. Pre-billing fields, billing, percentage charges, voids, and stage catalogue exist. A previewed, idempotent QuickBooks-style cost import with reconciliation is not yet a complete production workflow. | Add a separate import/staging model rather than treating `svc_service_profiles` as the cost ledger. Preserve approved invoices and source-row identity. Implement preview, mapping, duplicate detection, reconciliation, and acceptance tests using the two supplied reports. |
| MAP-03 / AUD-018, AUD-020, AUD-065 action routing | Change Order RPCs and Jobs UI; Add-On Tools registry/workspaces | Partial-to-implemented. Change Order certify/deny/approve/revise/archive/void paths and Add-On Tools exist, but v5 action IDs are not yet a central authorization vocabulary. | Inventory every mutation and bind it to a canonical action, state guard, scope check, and audit behavior. Preserve distinct draft denial versus official submitted denial. Do not merge Tools/Vehicles with Add-On Tools. |
| MAP-04 forecast workflow | `job_budget_lines` monthly/completion forecast fields and Financials UI | Partial. Completion forecast defaults and line-level edits exist. There is no complete deadline-driven PM forecast cycle with locked originals, pinned prior baseline, revisions, and America/New_York due-state enforcement. | Add forecast periods/submissions/revisions without replacing job budget lines as the financial source. Assigned PM authority is Manager+ and scoped to assigned project/division. |
| MAP-05 Emergency Override | No equivalent session-bound workflow | Missing. Existing Developer correction tools are discrete permissions, not an emergency session. | Implement only after the central evaluator: Primary-only reauthentication, server session, 15-minute idle expiry, global banner, atomic recovery capture, ZIP export, conflict-aware restore, and fail-closed mutation handling. |

## Authorization architecture findings

Northgate already has a mature permission base:

- `user_permissions` stores the active role and Department.
- `permission_templates` and `user_permission_templates` provide live-linked defaults.
- `user_permission_overrides` provides audited individual overrides.
- `effective_permissions_for_user()` resolves the caller's effective permissions.
- Project/job helpers enforce project and Department scope for many financial paths.
- `SECURITY DEFINER` RPCs are the established controlled-write boundary.

The v5 implementation must extend this system rather than create a parallel grant store. The main gaps are:

1. a canonical action/state/scope evaluator shared by controlled RPCs;
2. explicit grant provenance returned to the UI for “why access” explanations;
3. stable Primary protection and non-delegable Developer administration;
4. consistent draft/proposal/master-save primitives;
5. systematic route/RPC coverage tests.

## Milestone 1: protected Primary identity foundation

Local migration `20260920173000_primary_identity_foundation.sql`:

- binds `primary` to the confirmed stable Clerk subject;
- keeps the binding in an RLS-enabled, non-client-readable table;
- adds `current_user_is_primary()` and target-aware helper functions;
- derives `can_manage_developers` server-side for Primary only;
- prevents other accounts from directly changing Primary role, Department, active state, overrides, or template assignment;
- prevents other accounts from modifying a default/assigned template that governs Primary access;
- excludes `can_manage_developers` from generic template and override editing;
- preserves the approved Developer Data Correction exception.

This milestone intentionally does **not** add onward `can_manage_developers` grants. That requires a dedicated, non-delegable grant RPC and last-administrator tests in the next permission milestone.

## Controlled implementation sequence

1. **Primary identity foundation** — local migration and client permission visibility.
2. **Canonical action registry/evaluator** — local foundation added for global actions; unknown and not-yet-mapped scoped actions fail closed.
3. **Developer technical assignment** — local technical-assignment table, legacy access backfill, Primary-controlled assignment RPC, and audited revocation added. `can_manage_developers` delegation remains a later dedicated grant.

Legacy `Developer` profiles receive `Director` as their initial business rank while their Developer access is backfilled into the separate technical-assignment table. This preserves day-one authority during the model split; future business-rank changes are explicit and independently audited.

4. **Full action catalogue and scoped decisions** — all 179 v5 workbook actions are seeded locally with their approved authority, capability, scope, state guard, and specification status. The scoped evaluator covers project access, optional attached-project access, assigned-PM/Director access, service-call access, self/managed-employee access, and PM company view. Unsupported custom/scoped rules remain fail-closed. Project assignments now distinguish member, lead, superintendent, and project manager; active project managers must hold Manager or Director business rank.
5. **Master Save and proposals** — local reusable primitives now retain owner-scoped working copies, idempotent Save retries, optimistic versions, one change set/shared reason, independent destination payloads and outcomes, and item-level before/after audit entries. Review decisions bind the exact destination version and SHA-256 payload. Generic review can return or decline work; it cannot mark work applied. Each module must perform its live write and call the private completion hook in the same transaction, so an approval cannot exist without its corresponding live application.
   - **First integration: My Estimates.** Every active user receives server-derived personal-work access. Users without official estimating authority see only private Workbench drafts; authorized estimators can switch between official estimates and My Estimates. Personal drafts cannot approve, hand off, or write shared catalogue/library records.
   - **First atomic adapter: official Estimate promotion.** A POL-002 Supervisor+ reviewer may promote an exact submitted personal Estimate payload within Department scope. Official estimate creation, Workbench creation, audit, attribution, and destination completion share one database transaction. The generic review endpoint still cannot apply it.
   - **Estimate submission and review queue.** A constrained Estimate endpoint fixes the destination and action instead of accepting client-selected authority. Submitted personal drafts are locked, reviewers see only pending Department-scoped POL-002 destinations, and every promote, return, or decline decision is bound to the exact submitted version and payload hash. Promotion uses the atomic official-Estimate adapter; return and decline preserve the personal draft and its workflow history.
6. **Module reconciliation** — Change Orders, Jobs/Financials, inventory/estimating, service calls.
7. **Forecast cycle.**
8. **Emergency Override and recovery.**
9. **Migration rehearsal, advisors, production approval, then deployment.**

## Validation gates

- No email comparison in runtime Primary authorization.
- Default deny when permission data cannot be loaded.
- Generic permission templates cannot grant `can_manage_developers`.
- Non-Primary users cannot modify Primary through role, override, assignment, or governing-template paths.
- Primary retains the currently approved Developer Data Correction capability.
- Every controlled mutation is authorized server-side and audited atomically.
- New public-schema tables have explicit grants and RLS; private authorization tables are not exposed to clients.
- Production migration and deployment remain blocked pending Ryan's separate approval.

## September 21 extension: full material catalogue and stock review (local)

Ryan requested aliases, vendor-derived average prices/links, source labor inputs
with unit conversion, notes, and optional stock/location observations. Implemented
locally under `20260921221242_full_material_catalogue_stock_review.sql`, using the
existing catalogue and v5 change sets. Suggested quantity is optional; reviewer
confirmation is required. Ryan explicitly permits a qualified submitter to perform
the separate review step on their own request.

Default-denied Inventory Manager/Inventory Administrator flags are exposed through
the existing templates/overrides. This slice maps them to Department-scoped stock
review, with the existing Developer assignment also authorized. Other Inventory
powers are not implicitly broadened. No production migration, grants or deployment
have occurred. See [implementation and rollout](FULL_MATERIAL_CATALOGUE_STOCK_REVIEW.md).
