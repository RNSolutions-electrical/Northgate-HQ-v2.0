# Silas guided Change Order — Staging implementation and review

Date: 2026-09-23. Scope: Development/Staging only; no Production promotion.

## Audit and adaptation

- Dashboard **Ask HQ** previously opened `/silas` directly into AI chat. The Silas route, `useSilas` setting, and existing chat remain; the route now offers guided Change Order help separately from AI chat. The existing `silas_enabled` database field is interpreted as **AI assistance enabled**, not availability of deterministic guidance. A Developer control reuses the existing field and RLS policy.
- Jobs → Change Orders already had one authoritative `change_orders`/`change_order_lines` model, a manual editor, draft-save RPC, submit/approval RPCs, permission checks, and user-attributed audit logs. The guide uses those records and the existing draft-save RPC; it does not create parallel Change Orders, estimate pricing logic, routes, or permissions.
- The prior Staging migration permits uncoded draft lines but rejects uncoded submission. Guidance can therefore save useful incomplete lines without inventing financial codes. It cannot submit, approve, or post.
- Project selection in Silas uses the existing jobs read policy. Project-launched guidance receives its current Job. Both entry points mount the same `GuidedChangeOrder` component.

## Data and workflow

- Staging migration `20260923205626_guided_change_order_drafts.sql` adds nullable JSONB `change_orders.guided_state` and the `save_guided_change_order_draft` RPC. The RPC calls `save_job_change_order_draft`, retains its permission/audit gates, then stores section, line-item, skipped/complete, and resume state on the same draft. Guidance state has a size/type check and user-attributed audit entry.
- Staging migration `20260923210036_guided_change_order_stale_guard.sql` compares the last saved draft timestamp before any guided rewrite. If a manual/concurrent edit is newer, guidance fails with an actionable error instead of silently overwriting it.
- Scope and line-item descriptions map to ordinary Change Order fields. Material, labor, equipment, subcontract, other, and markup amounts map to the existing breakdown fields; no new pricing engine is introduced. Detailed working notes remain internal, not in the client-facing line description.
- Navigation is non-linear: Overall change, Line items, Review. Changes autosave to the real draft; Save draft and Save & exit are also explicit. The checklist distinguishes an incomplete saved draft from **Ready for Review**, which is a guidance flag only and never submits. Existing manual edit remains first-class and can open the same draft.
- `silas_enabled=false` hides AI chat but leaves guided Change Orders accessible. Deterministic steps do not invoke the AI endpoint.

## Risks and acceptance

- The existing `can_create_change_orders` permission remains the save gate. Silas cannot create drafts for field users who lack it. Any broader field-draft policy is a separate business-permission decision; do not loosen it to demonstrate the feature.
- The new column must exist before deploying code that selects it. Both migrations are Staging-only. Production requires a separate release/migration decision after acceptance.
- UI acceptance still needed: project and Dashboard entry points, navigation and autosave/resume, multi-line pricing, checklist, AI-off behavior, opening the ordinary editable draft, manual-edit stale conflict, and phone-sized layout. Database tests used rollback transactions and retained no sample Change Orders.
