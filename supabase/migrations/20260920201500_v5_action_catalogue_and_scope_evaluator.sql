-- Full v5 action catalogue and scoped authorization decision contract.
-- Existing production RPCs are not redirected in this migration; consumers
-- move only after their action/context tests pass.

ALTER TABLE public.authorization_actions
  ADD COLUMN base_authority text;

INSERT INTO public.authorization_actions(
  action_id, action_key, module, description, minimum_business_role,
  required_permission, special_authority, capability, scope_rule,
  state_guard, specification_status, base_authority
) VALUES
  ('AUD-018', 'v5.aud_018', 'Change Orders', 'change_orders: certify', 'Supervisor', NULL, 'none', 'CAN_APPROVE', 'PROJECT_ACCESS', 'Certification is not official submission or financial posting. Apply scope and master-save reason/audit. Verify the code path against this policy.', 'CONFIRMED', 'Supervisor+'),
  ('AUD-020', 'v5.aud_020', 'Change Orders', 'change_orders: deny', 'Supervisor', NULL, 'none', 'CAN_APPROVE', 'PROJECT_ACCESS', 'Do not use the unsubmitted-draft denial capability for submitted/official change orders. Division Director may exercise scoped PM authority with a reason.', 'CONFIRMED', 'Supervisor+'),
  ('AUD-025', 'v5.aud_025', 'Employees / Permissions', 'employee_profiles: update', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'SELF_OR_MANAGED_EMPLOYEE', 'User+ edits own Notes/To Do. Other employee administration remains under its existing authority; account/role/grant changes remain Director within division or explicit Developer grant administration.', 'CONFIRMED', 'User+'),
  ('AUD-035', 'v5.aud_035', 'Estimating', 'financial_line_catalogue: update', NULL, NULL, 'none', 'CAN_EDIT', 'NONE', 'Explicit inventory price, including zero, takes precedence. Catalogue fallback changes current reference price only; historical estimates, transactions and inventory valuation retain snapshots. Inventory explicit-price changes follow Price Updates approval.', 'VERIFY_MAPPING', 'CUSTOM'),
  ('AUD-063', 'v5.aud_063', 'Service Calls', 'svc_service_profiles: import', NULL, NULL, 'none', 'CAN_CONTRIBUTE', 'SERVICE_CALL_ACCESS', 'Accessible service calls before billing approval: User+ saves enterable information with one reason for the whole change set. Supervisor+ promotes to an official numbered job and prepares billing; Manager+ approves billing. After approval, including billed calls, Director+ applies revisions. Imports after approval are staged for Director review. Preview match/reconciliation; preserve legitimate payroll allocations and zero lines. No silent overwrite or deletion.', 'VERIFY_MAPPING', 'CUSTOM'),
  ('AUD-064', 'v5.aud_064', 'Service Calls', 'svc_service_profiles: update', NULL, NULL, 'none', 'CAN_CONTRIBUTE', 'SERVICE_CALL_ACCESS', 'Keep identifying name/number and Original; numbered revisions carry an EDITED indicator after billing. One reason produces an automatic internal-only note and field-level audit. Preserve issued invoice and approval history; customer-facing documents exclude internal notes.', 'VERIFY_MAPPING', 'CUSTOM'),
  ('AUD-007', 'v5.aud_007', 'Inventory', 'bin_items: archive', 'Manager', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Manager+ or explicitly assigned Inventory Administrator may archive within inventory scope. Preserve history. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'Manager+'),
  ('CFG-019', 'v5.cfg_019', 'Inventory', 'Write-off / cost change proposal (split actions)', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'NONE', 'One save and one reason for all proposed changes. Each item audited. Known loss is an approval action item for Inventory Administrator or division Director; do not disguise it as a count correction.', 'CONFIRMED', 'User+'),
  ('CFG-050', 'v5.cfg_050', 'Admin / Audit', 'Enter / leave Primary Emergency Override Mode', NULL, NULL, 'primary', 'CAN_ADMIN', 'NONE', 'Reauthenticate at entry; one session reason. Persistent red banner and Leave Emergency Override Mode on every page. After 15 minutes inactivity require reauthentication to continue. Log all actions; block mutations if before/after audit capture cannot be guaranteed.', 'CONFIRMED', 'PRIMARY_ONLY'),
  ('POL-008', 'v5.pol_008', 'Jobs / Projects', 'Define project/financial scoped profiles', NULL, NULL, 'none', 'CAN_ADMIN', 'PROJECT_ACCESS', 'Superintendent/Electrical Lead: assigned-project budget view and suggestions only; no financial edits. Profit requires Manager+ plus authorized financial scope. Users see operational quantities, labor hours and progress.', 'CONFIRMED', 'CUSTOM'),
  ('POL-009', 'v5.pol_009', 'Admin / Audit', 'Primary and delegated Developer governance', NULL, NULL, 'primary', 'CAN_ADMIN', 'NONE', 'Only Primary may grant can_manage_developers. Recipients have equivalent administrative/technical authority and may manage other Developer assignments, but cannot regrant this permission, change Primary access or enter Emergency Override Mode.', 'CONFIRMED', 'PRIMARY_ONLY'),
  ('AUD-001', 'v5.aud_001', 'Estimating', 'assemblies: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'Shared-library creation/publication and edits are separate destinations. Managers may create new shared entries; edits to existing shared entries require Estimating Manager or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-002', 'v5.aud_002', 'Estimating', 'assemblies: update', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'Shared-library creation/publication and edits are separate destinations. Managers may create new shared entries; edits to existing shared entries require Estimating Manager or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-003', 'v5.aud_003', 'Estimating', 'assembly_items: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'Shared-library creation/publication and edits are separate destinations. Managers may create new shared entries; edits to existing shared entries require Estimating Manager or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-004', 'v5.aud_004', 'Estimating', 'assembly_items: update', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'Shared-library creation/publication and edits are separate destinations. Managers may create new shared entries; edits to existing shared entries require Estimating Manager or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-005', 'v5.aud_005', 'Inventory', 'bays: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ prepares new content or a restoration proposal. Destructive live changes require the applicable approval at master save. Known loss, inventory price requests and historical valuation changes follow separate actions. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-006', 'v5.aud_006', 'Inventory', 'bays: update', 'Supervisor', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Users freely prepare changes in a working copy. Supervisor+ or Inventory Administrator applies ordinary count/content corrections. Known loss becomes a write-off action item for Inventory Administrator or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Supervisor+'),
  ('AUD-008', 'v5.aud_008', 'Inventory', 'bin_items: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ prepares new content or a restoration proposal. Destructive live changes require the applicable approval at master save. Known loss, inventory price requests and historical valuation changes follow separate actions. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-009', 'v5.aud_009', 'Inventory', 'bin_items: restore', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ prepares new content or a restoration proposal. Destructive live changes require the applicable approval at master save. Known loss, inventory price requests and historical valuation changes follow separate actions. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-010', 'v5.aud_010', 'Inventory', 'bins: archive', 'Manager', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Manager+ or explicitly assigned Inventory Administrator may archive within inventory scope. Preserve history. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Manager+'),
  ('AUD-011', 'v5.aud_011', 'Inventory', 'bins: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ prepares new content or a restoration proposal. Destructive live changes require the applicable approval at master save. Known loss, inventory price requests and historical valuation changes follow separate actions. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-012', 'v5.aud_012', 'Inventory', 'bins: restore', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ prepares new content or a restoration proposal. Destructive live changes require the applicable approval at master save. Known loss, inventory price requests and historical valuation changes follow separate actions. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-013', 'v5.aud_013', 'Inventory', 'bins: update', 'Supervisor', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Users freely prepare changes in a working copy. Supervisor+ or Inventory Administrator applies ordinary count/content corrections. Known loss becomes a write-off action item for Inventory Administrator or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Supervisor+'),
  ('AUD-014', 'v5.aud_014', 'Admin / Audit', 'change_logs_export: create', 'Manager', NULL, 'none', 'CAN_VIEW', 'NONE', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'PROPOSED', 'Manager+'),
  ('AUD-015', 'v5.aud_015', 'Change Orders', 'change_order_allocations: update', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'User+ may save own working drafts or proposed changes. Applying project financial edits requires assigned PM authority in own project/division or division Director. Already approved/posted financial edits require Director-approved revision. Preserve one shared reason and item-level audit.', 'PROPOSED', 'User+'),
  ('AUD-016', 'v5.aud_016', 'Change Orders', 'change_order_financial_postings: create', 'Manager', NULL, 'none', 'CAN_COMMIT', 'ASSIGNED_PM_OR_DIRECTOR', 'After approval/posting, further financial edits require affected-division Director approval through a revision. Preserve original, shared reason and audit. Forecasts follow their separate lock/revise rules.', 'PROPOSED', 'Manager+'),
  ('AUD-017', 'v5.aud_017', 'Change Orders', 'change_orders: archive', 'Manager', NULL, 'none', 'CAN_COMMIT', 'PROJECT_ACCESS', 'Archive requires Manager+ in the applicable scope. Preserve history. No automatic archive grant from a specialist title.', 'PROPOSED', 'Manager+'),
  ('AUD-019', 'v5.aud_019', 'Change Orders', 'change_orders: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'PROPOSED', 'User+'),
  ('AUD-021', 'v5.aud_021', 'Change Orders', 'change_orders: update', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'User+ may save own working drafts or proposed changes. Applying project financial edits requires assigned PM authority in own project/division or division Director. Already approved/posted financial edits require Director-approved revision. Preserve one shared reason and item-level audit.', 'PROPOSED', 'User+'),
  ('AUD-022', 'v5.aud_022', 'Documents', 'documents: archive', 'Manager', NULL, 'none', 'CAN_COMMIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Archive requires Manager+ in the applicable scope. Preserve history. No automatic archive grant from a specialist title.', 'PROPOSED', 'Manager+'),
  ('AUD-023', 'v5.aud_023', 'Documents', 'documents: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'PROPOSED', 'User+'),
  ('AUD-024', 'v5.aud_024', 'Documents', 'documents: update', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'User+ edits own working drafts or submits proposed changes. Supervisor+ approves ordinary destructive active-record changes before save/post. Approved/history changes require revisions and existing higher approval.', 'PROPOSED', 'User+'),
  ('AUD-026', 'v5.aud_026', 'Estimating', 'estimate_pricing_lines: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-027', 'v5.aud_027', 'Estimating', 'estimate_pricing_lines: update', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-028', 'v5.aud_028', 'Estimating', 'estimate_snapshots: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-029', 'v5.aud_029', 'Estimating', 'estimate_workbenches: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-030', 'v5.aud_030', 'Estimating', 'estimate_workbenches: update', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-031', 'v5.aud_031', 'Estimating', 'estimate_workflow_handoffs: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-032', 'v5.aud_032', 'Estimating', 'estimates: archive', 'Manager', NULL, 'none', 'CAN_COMMIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Archive requires Manager+ in the applicable scope. Preserve history. No automatic archive grant from a specialist title.', 'PROPOSED', 'Manager+'),
  ('AUD-033', 'v5.aud_033', 'Estimating', 'estimates: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-034', 'v5.aud_034', 'Estimating', 'estimates: update', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-036', 'v5.aud_036', 'Add-On Tools', 'health_inspections: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'PROPOSED', 'User+'),
  ('AUD-037', 'v5.aud_037', 'Inventory', 'items: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ prepares new content or a restoration proposal. Destructive live changes require the applicable approval at master save. Known loss, inventory price requests and historical valuation changes follow separate actions. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-044', 'v5.aud_044', 'Pay Applications', 'job_pay_applications: delete', 'Director', NULL, 'none', 'CAN_ADMIN', 'PROJECT_ACCESS', 'Director+ within scope for permanent deletion, including drafts. Existing no-delete restrictions remain. Inventory Administrator and Developer do not bypass this floor. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'Director+'),
  ('AUD-038', 'v5.aud_038', 'Inventory', 'items: update', 'Supervisor', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Users freely prepare changes in a working copy. Supervisor+ or Inventory Administrator applies ordinary count/content corrections. Known loss becomes a write-off action item for Inventory Administrator or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Supervisor+'),
  ('AUD-039', 'v5.aud_039', 'Jobs / Budget', 'job_budget_lines: archive', 'Manager', NULL, 'none', 'CAN_COMMIT', 'PROJECT_ACCESS', 'Archive requires Manager+ in the applicable scope. Preserve history. No automatic archive grant from a specialist title.', 'PROPOSED', 'Manager+'),
  ('AUD-047', 'v5.aud_047', 'Jobs / Projects', 'job_user_assignments: create', NULL, NULL, 'none', 'CAN_ADMIN', 'PROJECT_ACCESS', 'Superintendents/Electrical Leads may allocate tasks to existing team members but cannot add users to the project. See V4-006 and V4-007.', 'CONFIRMED', 'CUSTOM'),
  ('AUD-040', 'v5.aud_040', 'Jobs / Budget', 'job_budget_lines: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'PROPOSED', 'User+'),
  ('AUD-049', 'v5.aud_049', 'Jobs / Projects', 'jobs: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'No official job number or posting from a personal draft. Save in the owner workspace until submitted and approved. Preserve source work and attribution on promotion.', 'CONFIRMED', 'User+'),
  ('AUD-041', 'v5.aud_041', 'Jobs / Budget', 'job_budget_lines: update', 'Manager', NULL, 'none', 'CAN_EDIT', 'ASSIGNED_PM_OR_DIRECTOR', 'After approval/posting, further financial edits require affected-division Director approval through a revision. Preserve original, shared reason and audit. Forecasts follow their separate lock/revise rules.', 'PROPOSED', 'Manager+'),
  ('AUD-042', 'v5.aud_042', 'Jobs / Budget', 'job_buyout_lines: archive', 'Manager', NULL, 'none', 'CAN_COMMIT', 'PROJECT_ACCESS', 'Archive requires Manager+ in the applicable scope. Preserve history. No automatic archive grant from a specialist title.', 'PROPOSED', 'Manager+'),
  ('AUD-043', 'v5.aud_043', 'Jobs / Budget', 'job_buyout_vendor_quotes: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'PROPOSED', 'User+'),
  ('AUD-045', 'v5.aud_045', 'Pay Applications', 'job_pay_applications: update', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'User+ may save own working drafts or proposed changes. Applying project financial edits requires assigned PM authority in own project/division or division Director. Already approved/posted financial edits require Director-approved revision. Preserve one shared reason and item-level audit.', 'PROPOSED', 'User+'),
  ('AUD-046', 'v5.aud_046', 'Jobs / Budget', 'job_revenue_lines: update', 'Manager', NULL, 'none', 'CAN_EDIT', 'ASSIGNED_PM_OR_DIRECTOR', 'After approval/posting, further financial edits require affected-division Director approval through a revision. Preserve original, shared reason and audit. Forecasts follow their separate lock/revise rules.', 'PROPOSED', 'Manager+'),
  ('AUD-048', 'v5.aud_048', 'Jobs / Projects', 'jobs: archive', 'Manager', NULL, 'none', 'CAN_COMMIT', 'PROJECT_ACCESS', 'Archive requires Manager+ in the applicable scope. Preserve history. No automatic archive grant from a specialist title.', 'PROPOSED', 'Manager+'),
  ('AUD-050', 'v5.aud_050', 'Jobs / Projects', 'jobs: update', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'User+ edits own working drafts or submits proposed changes. Supervisor+ approves ordinary destructive active-record changes before save/post. Approved/history changes require revisions and existing higher approval.', 'PROPOSED', 'User+'),
  ('AUD-051', 'v5.aud_051', 'Add-On Tools', 'panel_directories: create', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'PROPOSED', 'User+'),
  ('AUD-052', 'v5.aud_052', 'Add-On Tools', 'panel_directories: delete', 'Director', NULL, 'none', 'CAN_ADMIN', 'PROJECT_ACCESS_IF_ATTACHED', 'Director+ within scope for permanent deletion, including drafts. Existing no-delete restrictions remain. Inventory Administrator and Developer do not bypass this floor. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Director+'),
  ('AUD-053', 'v5.aud_053', 'Employees / Permissions', 'permission_templates: permission change', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Centralized grants, one reason, before/after audit, additive revocation and last-admin guard. Only Primary grants can_manage_developers. Delegates cannot affect Primary via user, role, template, group or inherited settings.', 'PROPOSED', 'Director+'),
  ('AUD-054', 'v5.aud_054', 'Inventory', 'shelves: archive', 'Manager', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Manager+ or explicitly assigned Inventory Administrator may archive within inventory scope. Preserve history. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Manager+'),
  ('AUD-055', 'v5.aud_055', 'Inventory', 'shelves: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ prepares new content or a restoration proposal. Destructive live changes require the applicable approval at master save. Known loss, inventory price requests and historical valuation changes follow separate actions. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-056', 'v5.aud_056', 'Inventory', 'shelves: delete', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Director+ within scope for permanent deletion, including drafts. Existing no-delete restrictions remain. Inventory Administrator and Developer do not bypass this floor. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Director+'),
  ('AUD-057', 'v5.aud_057', 'Inventory', 'shelves: update', 'Supervisor', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Users freely prepare changes in a working copy. Supervisor+ or Inventory Administrator applies ordinary count/content corrections. Known loss becomes a write-off action item for Inventory Administrator or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Supervisor+'),
  ('AUD-058', 'v5.aud_058', 'Inventory', 'storage_units: archive', 'Manager', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Manager+ or explicitly assigned Inventory Administrator may archive within inventory scope. Preserve history. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Manager+'),
  ('AUD-059', 'v5.aud_059', 'Inventory', 'storage_units: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ prepares new content or a restoration proposal. Destructive live changes require the applicable approval at master save. Known loss, inventory price requests and historical valuation changes follow separate actions. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-060', 'v5.aud_060', 'Inventory', 'storage_units: delete', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Director+ within scope for permanent deletion, including drafts. Existing no-delete restrictions remain. Inventory Administrator and Developer do not bypass this floor. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Director+'),
  ('AUD-061', 'v5.aud_061', 'Inventory', 'storage_units: restore', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ prepares new content or a restoration proposal. Destructive live changes require the applicable approval at master save. Known loss, inventory price requests and historical valuation changes follow separate actions. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'User+'),
  ('AUD-062', 'v5.aud_062', 'Inventory', 'storage_units: update', 'Supervisor', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Users freely prepare changes in a working copy. Supervisor+ or Inventory Administrator applies ordinary count/content corrections. Known loss becomes a write-off action item for Inventory Administrator or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Supervisor+'),
  ('AUD-065', 'v5.aud_065', 'Add-On Tools', 'tool_addon_access: permission change', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Centralized grants, one reason, before/after audit, additive revocation and last-admin guard. Only Primary grants can_manage_developers. Delegates cannot affect Primary via user, role, template, group or inherited settings.', 'CONFIRMED', 'Director+'),
  ('AUD-066', 'v5.aud_066', 'Tools & Vehicles', 'tools: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'New asset draft only. Manager+ approves the new asset record (CFG-034). Ordinary destructive changes require Supervisor+.', 'PROPOSED', 'User+'),
  ('AUD-067', 'v5.aud_067', 'Tools & Vehicles', 'tools: update', 'Supervisor', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'PROPOSED', 'Supervisor+'),
  ('AUD-068', 'v5.aud_068', 'Inventory', 'transaction_items: physical count correction', 'Supervisor', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Users freely prepare changes in a working copy. Supervisor+ or Inventory Administrator applies ordinary count/content corrections. Known loss becomes a write-off action item for Inventory Administrator or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'PROPOSED', 'Supervisor+'),
  ('AUD-069', 'v5.aud_069', 'Employees / Permissions', 'user_permission_overrides: permission change', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Centralized grants, one reason, before/after audit, additive revocation and last-admin guard. Only Primary grants can_manage_developers. Delegates cannot affect Primary via user, role, template, group or inherited settings.', 'PROPOSED', 'Director+'),
  ('AUD-070', 'v5.aud_070', 'Employees / Permissions', 'user_permission_templates: permission change', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Centralized grants, one reason, before/after audit, additive revocation and last-admin guard. Only Primary grants can_manage_developers. Delegates cannot affect Primary via user, role, template, group or inherited settings.', 'PROPOSED', 'Director+'),
  ('CFG-001', 'v5.cfg_001', 'Jobs / Projects', 'Create standard project', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'No official job number or posting from a personal draft. Save in the owner workspace until submitted and approved. Preserve source work and attribution on promotion.', 'CONFIRMED', 'User+'),
  ('CFG-002', 'v5.cfg_002', 'Service Calls', 'Create service call', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'No official job number or posting from a personal draft. Save in the owner workspace until submitted and approved. Preserve source work and attribution on promotion.', 'CONFIRMED', 'User+'),
  ('CFG-003', 'v5.cfg_003', 'Jobs / Projects', 'Edit basic project info', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'NONE', 'Ordinary destructive changes to active project fields require Supervisor+ approval before save. Use revisions for historical/approved records.', 'CONFIRMED', 'User+'),
  ('CFG-004', 'v5.cfg_004', 'Jobs / Budget', 'Edit non-posted budget lines', 'Manager', NULL, 'none', 'CAN_EDIT', 'ASSIGNED_PM_OR_DIRECTOR', 'After approval/posting, further financial edits require affected-division Director approval through a revision. Preserve original, shared reason and audit. Forecasts follow their separate lock/revise rules.', 'CONFIRMED', 'Manager+'),
  ('CFG-005', 'v5.cfg_005', 'Jobs / Budget', 'Commit official financial baseline', 'Manager', NULL, 'none', 'CAN_COMMIT', 'ASSIGNED_PM_OR_DIRECTOR', 'After approval/posting, further financial edits require affected-division Director approval through a revision. Preserve original, shared reason and audit. Forecasts follow their separate lock/revise rules.', 'CONFIRMED', 'Manager+'),
  ('CFG-006', 'v5.cfg_006', 'Change Orders', 'Draft/edit change order', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'CONFIRMED', 'User+'),
  ('CFG-007', 'v5.cfg_007', 'Change Orders', 'Submit change order', 'Manager', NULL, 'none', 'CAN_SUBMIT', 'NONE', 'Formal submission only after Manager+ approval within scope. Internal review submission remains available to the draft author.', 'CONFIRMED', 'Manager+'),
  ('CFG-008', 'v5.cfg_008', 'Change Orders', 'Upload signed customer CO', 'Supervisor', NULL, 'none', 'CAN_EDIT', 'NONE', 'Preserve this specific Supervisor+ workflow. User+ can create contributions/proposals. Destructive changes cannot be saved/posted without this authority. Preserve prior approved versions.', 'CONFIRMED', 'Supervisor+'),
  ('CFG-009', 'v5.cfg_009', 'Change Orders', 'Post approved CO to financials', 'Manager', NULL, 'none', 'CAN_COMMIT', 'ASSIGNED_PM_OR_DIRECTOR', 'After approval/posting, further financial edits require affected-division Director approval through a revision. Preserve original, shared reason and audit. Forecasts follow their separate lock/revise rules.', 'CONFIRMED', 'Manager+'),
  ('CFG-010', 'v5.cfg_010', 'Cross-App', 'Add append-only internal note', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'NONE', 'Available to everyone on records they can access. Append-only notes/flags do not edit protected data or grant visibility into otherwise restricted records.', 'CONFIRMED', 'User+'),
  ('CFG-011', 'v5.cfg_011', 'Cross-App', 'Flag record for review', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'NONE', 'Available to everyone on records they can access. Append-only notes/flags do not edit protected data or grant visibility into otherwise restricted records.', 'CONFIRMED', 'User+'),
  ('CFG-012', 'v5.cfg_012', 'Pay Applications', 'Create/edit own draft pay app', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'CONFIRMED', 'User+'),
  ('CFG-013', 'v5.cfg_013', 'Pay Applications', 'Review/revise draft pay app', 'Supervisor', NULL, 'none', 'CAN_EDIT', 'NONE', 'Preserve this specific Supervisor+ workflow. User+ can create contributions/proposals. Destructive changes cannot be saved/posted without this authority. Preserve prior approved versions.', 'CONFIRMED', 'Supervisor+'),
  ('CFG-014', 'v5.cfg_014', 'Pay Applications', 'Finalize/submit pay app', 'Manager', NULL, 'none', 'CAN_SUBMIT', 'ASSIGNED_PM_OR_DIRECTOR', 'After approval/posting, further financial edits require affected-division Director approval through a revision. Preserve original, shared reason and audit. Forecasts follow their separate lock/revise rules.', 'CONFIRMED', 'Manager+'),
  ('CFG-015', 'v5.cfg_015', 'Pay Applications', 'Void/reverse submitted pay app', 'Director', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Director+ creates an audited void/reversal or new revision linked to the original. Do not directly rewrite historical/approved data.', 'CONFIRMED', 'Director+'),
  ('CFG-016', 'v5.cfg_016', 'Estimating', 'Draft/edit estimate workbench', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'User+'),
  ('CFG-017', 'v5.cfg_017', 'Estimating', 'Finalize/submit estimate externally', 'Manager', NULL, 'none', 'CAN_SUBMIT', 'ASSIGNED_PM_OR_DIRECTOR', 'After approval/posting, further financial edits require affected-division Director approval through a revision. Preserve original, shared reason and audit. Forecasts follow their separate lock/revise rules.', 'CONFIRMED', 'Manager+'),
  ('CFG-018', 'v5.cfg_018', 'Inventory', 'Routine inventory count adjustment', 'Supervisor', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Supervisor+ or Inventory Administrator applies count corrections. Known loss/damage/unusable stock creates a write-off approval action item for Inventory Administrator or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'Supervisor+'),
  ('AUD-071', 'v5.aud_071', 'Employees / Permissions', 'user_permissions: permission change', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Centralized grants, one reason, before/after audit, additive revocation and last-admin guard. Only Primary grants can_manage_developers. Delegates cannot affect Primary via user, role, template, group or inherited settings.', 'PROPOSED', 'Director+'),
  ('CFG-020', 'v5.cfg_020', 'Inventory', 'Permanent inventory deletion', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Director+ within scope for permanent deletion, including drafts. Existing no-delete restrictions remain. Inventory Administrator and Developer do not bypass this floor. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'Director+'),
  ('CFG-021', 'v5.cfg_021', 'Documents', 'Upload/tag/version documents', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'CONFIRMED', 'User+'),
  ('CFG-022', 'v5.cfg_022', 'Documents', 'Destructive document purge', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Director+ within scope for permanent deletion, including drafts. Existing no-delete restrictions remain. Inventory Administrator and Developer do not bypass this floor. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'Director+'),
  ('CFG-023', 'v5.cfg_023', 'Schedule', 'Routine schedule/task edit', 'Supervisor', NULL, 'none', 'CAN_EDIT', 'NONE', 'Preserve Original; applied edits create numbered revisions. Compare Current to Original shows dates, durations, dependencies, assignments, and added/removed tasks.', 'CONFIRMED', 'Supervisor+'),
  ('CFG-024', 'v5.cfg_024', 'Schedule', 'Lock official schedule baseline', 'Manager', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Preserve Manager+/assigned-PM baseline lock authority. Original remains immutable; subsequent schedule edits are numbered revisions with Compare Current to Original.', 'CONFIRMED', 'Manager+'),
  ('CFG-025', 'v5.cfg_025', 'Reports', 'Reports module', NULL, NULL, 'none', 'CAN_NONE', 'NONE', 'Disabled. The universal defaults do not enable this module.', 'CONFIRMED', 'CAN_NONE'),
  ('CFG-026', 'v5.cfg_026', 'Accounting', 'Accounting module', NULL, NULL, 'none', 'CAN_NONE', 'NONE', 'Disabled. The universal defaults do not enable this module.', 'CONFIRMED', 'CAN_NONE'),
  ('CFG-027', 'v5.cfg_027', 'Employees / Permissions', 'Create employee record', 'Manager', NULL, 'none', 'CAN_EDIT', 'NONE', 'Preserve the specific Manager+ employee-record creation exception. General User+ contributions do not grant employee administration.', 'CONFIRMED', 'Manager+'),
  ('CFG-028', 'v5.cfg_028', 'Employees / Permissions', 'Activate Northgate HQ account', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Centralized grants, one reason, before/after audit, additive revocation and last-admin guard. Only Primary grants can_manage_developers. Delegates cannot affect Primary via user, role, template, group or inherited settings.', 'CONFIRMED', 'Director+'),
  ('CFG-029', 'v5.cfg_029', 'Employees / Permissions', 'Assign/change global role', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Centralized grants, one reason, before/after audit, additive revocation and last-admin guard. Only Primary grants can_manage_developers. Delegates cannot affect Primary via user, role, template, group or inherited settings.', 'CONFIRMED', 'Director+'),
  ('CFG-030', 'v5.cfg_030', 'Tools & Vehicles', 'Check out / return asset', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'CONFIRMED', 'User+'),
  ('CFG-031', 'v5.cfg_031', 'Tools & Vehicles', 'Report damage/loss/maintenance', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'NONE', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'CONFIRMED', 'User+'),
  ('CFG-032', 'v5.cfg_032', 'Tools & Vehicles', 'Reassign asset', 'Supervisor', NULL, 'none', 'CAN_EDIT', 'NONE', 'Preserve this specific Supervisor+ workflow. User+ can create contributions/proposals. Destructive changes cannot be saved/posted without this authority. Preserve prior approved versions.', 'CONFIRMED', 'Supervisor+'),
  ('CFG-033', 'v5.cfg_033', 'Tools & Vehicles', 'Create new asset record for approval', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'Draft only until Manager+ approval under CFG-034.', 'CONFIRMED', 'User+'),
  ('CFG-034', 'v5.cfg_034', 'Tools & Vehicles', 'Approve new asset record', 'Manager', NULL, 'none', 'CAN_APPROVE', 'NONE', 'Preserve Manager+ approval of new assets. User+ draft creation does not activate an asset.', 'CONFIRMED', 'Manager+'),
  ('CFG-035', 'v5.cfg_035', 'Tools & Vehicles', 'Edit normal asset information', 'Supervisor', NULL, 'none', 'CAN_EDIT', 'NONE', 'Preserve this specific Supervisor+ workflow. User+ can create contributions/proposals. Destructive changes cannot be saved/posted without this authority. Preserve prior approved versions.', 'CONFIRMED', 'Supervisor+'),
  ('CFG-036', 'v5.cfg_036', 'Tools & Vehicles', 'Retire/dispose preserving history', 'Manager', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Manager+ retires/archives the asset while preserving history. Permanent deletion requires Director+.', 'CONFIRMED', 'Manager+'),
  ('CFG-037', 'v5.cfg_037', 'Tools & Vehicles', 'Permanently delete asset/history', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Director+ within scope for permanent deletion, including drafts. Existing no-delete restrictions remain. Inventory Administrator and Developer do not bypass this floor. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'Director+'),
  ('CFG-038', 'v5.cfg_038', 'Service Calls', 'Edit active service call', 'User', NULL, 'none', 'CAN_EDIT', 'SERVICE_CALL_ACCESS', 'Pre-billing-approval field changes use one save/reason and item-level audit. User+ editing does not grant job promotion, billing approval, company-pricing administration, archive/delete or post-approval revision authority.', 'CONFIRMED', 'User+'),
  ('CFG-039', 'v5.cfg_039', 'Service Calls', 'Add labor/materials/photos/docs/notes', 'User', NULL, 'none', 'CAN_EDIT', 'SERVICE_CALL_ACCESS', 'Pre-billing-approval field changes use one save/reason and item-level audit. User+ editing does not grant job promotion, billing approval, company-pricing administration, archive/delete or post-approval revision authority.', 'CONFIRMED', 'User+'),
  ('CFG-040', 'v5.cfg_040', 'Service Calls', 'Modify within approved pricing', 'User', NULL, 'none', 'CAN_EDIT', 'SERVICE_CALL_ACCESS', 'Pre-billing-approval field changes use one save/reason and item-level audit. User+ editing does not grant job promotion, billing approval, company-pricing administration, archive/delete or post-approval revision authority.', 'CONFIRMED', 'User+'),
  ('CFG-041', 'v5.cfg_041', 'Service Calls', 'Override company pricing', 'Manager', NULL, 'none', 'CAN_EDIT', 'NONE', 'Manager+ company-pricing override for an active call before billing approval. No inventory price/valuation change implied. After billing approval require Director+ revision. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'Manager+'),
  ('CFG-042', 'v5.cfg_042', 'Service Calls', 'Mark field work complete', 'Supervisor', NULL, 'none', 'CAN_EDIT', 'NONE', 'Preserve this specific Supervisor+ workflow. User+ can create contributions/proposals. Destructive changes cannot be saved/posted without this authority. Preserve prior approved versions.', 'CONFIRMED', 'Supervisor+'),
  ('CFG-043', 'v5.cfg_043', 'Service Calls', 'Prepare billing', 'Supervisor', NULL, 'none', 'CAN_EDIT', 'NONE', 'Preserve this specific Supervisor+ workflow. User+ can create contributions/proposals. Destructive changes cannot be saved/posted without this authority. Preserve prior approved versions.', 'CONFIRMED', 'Supervisor+'),
  ('CFG-044', 'v5.cfg_044', 'Service Calls', 'Approve service call for billing', 'Manager', NULL, 'none', 'CAN_COMMIT', 'SERVICE_CALL_ACCESS', 'Proposal/estimate remains editable in working copies until billing approval. Preserve approval version and audit all applied changes. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'Manager+'),
  ('CFG-045', 'v5.cfg_045', 'Service Calls', 'Revise service call after billing approval', 'Director', NULL, 'none', 'CAN_COMMIT', 'SERVICE_CALL_ACCESS', 'Keep identifying name/number and Original; numbered revisions carry an EDITED indicator after billing. One reason produces an automatic internal-only note and field-level audit. Preserve issued invoice and approval history; customer-facing documents exclude internal notes. Primary-only emergency bypass remains separate.', 'CONFIRMED', 'Director+'),
  ('CFG-046', 'v5.cfg_046', 'Service Calls', 'Void/reverse/historical override', 'Director', NULL, 'none', 'CAN_COMMIT', 'SERVICE_CALL_ACCESS', 'Keep identifying name/number and Original; numbered revisions carry an EDITED indicator after billing. One reason produces an automatic internal-only note and field-level audit. Preserve issued invoice and approval history; customer-facing documents exclude internal notes. Primary-only emergency bypass remains separate.', 'CONFIRMED', 'Director+'),
  ('CFG-047', 'v5.cfg_047', 'Admin / Audit', 'View operational audit log', 'Manager', NULL, 'none', 'CAN_VIEW', 'NONE', 'Preserve Manager+ operational audit visibility. Technical diagnostics remain separately scoped.', 'CONFIRMED', 'Manager+'),
  ('CFG-048', 'v5.cfg_048', 'Admin / Audit', 'Change company-wide defaults', 'Director', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'CONFIRMED', 'Director+'),
  ('CFG-049', 'v5.cfg_049', 'Admin / Audit', 'Configure permission capability matrix', NULL, NULL, 'none', 'CAN_ADMIN', 'NONE', 'Additional Developer technical configuration authority. No business approval bypass; protected Primary access and exclusive permission/mode cannot be changed by delegates or ordinary Developers.', 'CONFIRMED', 'SCOPED_ONLY'),
  ('AUD-072', 'v5.aud_072', 'Employees / Permissions', 'user_permissions: update', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Centralized grants, one reason, before/after audit, additive revocation and last-admin guard. Only Primary grants can_manage_developers. Delegates cannot affect Primary via user, role, template, group or inherited settings.', 'PROPOSED', 'Director+'),
  ('CFG-051', 'v5.cfg_051', 'Admin / Audit', 'Enable/disable production module', NULL, NULL, 'none', 'CAN_ADMIN', 'NONE', 'Both required. Director authorization must cover the affected scope; division Director is not automatically company-wide. Module enablement does not grant business access.', 'CONFIRMED', 'CUSTOM'),
  ('CFG-052', 'v5.cfg_052', 'Admin / Audit', 'Purge audit history', NULL, NULL, 'none', 'CAN_NONE', 'NONE', 'Preserve confirmed prohibition in the normal UI, including for Directors and Developers. Director+ deletion floor does not override this prohibition.', 'CONFIRMED', 'CAN_NONE'),
  ('CFG-053', 'v5.cfg_053', 'Estimating', 'Use shared assemblies/pricing', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'User+'),
  ('CFG-054', 'v5.cfg_054', 'Estimating', 'Create estimate-specific custom assembly', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'User+'),
  ('CFG-055', 'v5.cfg_055', 'Estimating', 'Propose shared library change', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'NONE', 'Save durable personal estimate/assembly work even outside business authority scope, using accessible data. Supervisor+ approval promotes work to official use. External submission keeps its stricter gate. Shared-library and inventory requests are independent linked destinations. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'User+'),
  ('CFG-056', 'v5.cfg_056', 'Estimating', 'Approve/apply change to existing shared assembly', 'Director', NULL, 'none', 'CAN_APPROVE', 'NONE', 'User+ may prepare proposals. Existing shared library entries are changed only after destination approval. Archive remains Manager-equivalent; permanent deletion remains Director+ subject to history prohibition.', 'CONFIRMED', 'Director+'),
  ('CFG-057', 'v5.cfg_057', 'Estimating', 'Routine pricing/labor maintenance', 'Director', NULL, 'none', 'CAN_EDIT', 'NONE', 'Does not grant inventory valuation or current inventory price updates. Open estimates/revisions may selectively adopt approved updates; committed estimates remain unchanged.', 'CONFIRMED', 'Director+'),
  ('CFG-058', 'v5.cfg_058', 'Estimating', 'Change company-wide estimating defaults', 'Director', NULL, 'none', 'CAN_EDIT', 'NONE', 'Company-wide defaults require explicit company-wide business scope. A division Director may change division-scoped defaults only; Developer configuration capability does not grant business approval.', 'CONFIRMED', 'Director+'),
  ('CFG-059', 'v5.cfg_059', 'Estimating', 'Retire assembly/catalog item', 'Manager', NULL, 'none', 'CAN_EDIT', 'NONE', 'Preserve this stricter estimating-library authority. Open estimates/revisions may selectively adopt newer pricing; approved estimates remain unchanged with an informational update badge.', 'CONFIRMED', 'Manager+'),
  ('CFG-060', 'v5.cfg_060', 'Estimating', 'Delete shared library history', NULL, NULL, 'none', 'CAN_NONE', 'NONE', 'Preserve confirmed prohibition in the normal UI, including for Directors and Developers. Director+ deletion floor does not override this prohibition.', 'CONFIRMED', 'CAN_NONE'),
  ('POL-001', 'v5.pol_001', 'Cross-App', 'Create/contribute ordinary content', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'NONE', 'Do not expose restricted source records/system-generated fields or activate permissions. Save Draft preserves work. Apply/Submit checks the destination, record state and approval authority.', 'CONFIRMED', 'User+'),
  ('POL-002', 'v5.pol_002', 'Cross-App', 'Commit ordinary destructive changes', 'Supervisor', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Audit every changed field/item under the shared save ID and reason. Save pending proposals without modifying active records. Approval binds the exact reviewed version.', 'CONFIRMED', 'Supervisor+'),
  ('POL-003', 'v5.pol_003', 'Cross-App', 'Archive any record', 'Manager', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Manager+ archive floor within scope. Inventory Administrator explicitly receives equivalent inventory archive capability. Preserve history.', 'CONFIRMED', 'Manager+'),
  ('POL-004', 'v5.pol_004', 'Cross-App', 'Permanently delete a record', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Explicit no-delete restrictions remain. No automatic specialist or Developer bypass.', 'CONFIRMED', 'Director+'),
  ('POL-005', 'v5.pol_005', 'Cross-App', 'Create revision of approved/history record', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'NONE', 'Keep identifying name and job/service number. Preserve Original and Revision 1, 2, etc. Add an automatic internal-only note with supplied reason, actor, time and change summary; exclude it from customer-facing output.', 'CONFIRMED', 'User+'),
  ('POL-006', 'v5.pol_006', 'Employees / Permissions', 'Manage module/project/user grants', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'Centralized grants, one reason, before/after audit, additive revocation and last-admin guard. Only Primary grants can_manage_developers. Delegates cannot affect Primary via user, role, template, group or inherited settings.', 'CONFIRMED', 'Director+'),
  ('POL-007', 'v5.pol_007', 'Inventory', 'Inventory Administrator scoped capabilities', NULL, NULL, 'none', 'CAN_COMMIT', 'NONE', 'Includes scoped inventory archive, count correction, organization, write-off/cost capabilities and approval of known-loss and price-update exceptions. Permanent delete remains Director+; grant management remains separate. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'SCOPED_ONLY'),
  ('AUD-073', 'v5.aud_073', 'Tools & Vehicles', 'vehicle_assignments: create', 'Supervisor', NULL, 'none', 'CAN_EDIT', 'NONE', 'User+ may create/contribute and prepare proposals. Supervisor+ approval/authority before ordinary destructive changes reach active records. Preserve stricter approvals below. Historical/approved records use revisions.', 'PROPOSED', 'Supervisor+'),
  ('AUD-074', 'v5.aud_074', 'Tools & Vehicles', 'vehicles: create', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'New asset draft only. Manager+ approves the new asset record (CFG-034). Ordinary destructive changes require Supervisor+.', 'PROPOSED', 'User+'),
  ('POL-010', 'v5.pol_010', 'Jobs / Budget', 'Draft budget/revenue change proposal', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'PROJECT_ACCESS', 'Non-posted financial edits retain CFG-004 Supervisor+ authority. Baseline posting retains CFG-005 approval.', 'CONFIRMED', 'User+'),
  ('POL-011', 'v5.pol_011', 'Schedule', 'Create schedule/task proposal', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'PROJECT_ACCESS_IF_ATTACHED', 'User+ can propose schedule changes. Assigned Superintendent/Electrical Lead may revise schedules and allocate tasks to existing project members. Only assigned PM staffs the project. Original and revision history retained.', 'CONFIRMED', 'User+'),
  ('V3-001', 'v5.v3_001', 'Change Orders', 'Record official denial of submitted CO', 'Director', NULL, 'none', 'CAN_COMMIT', 'PROJECT_ACCESS', 'Division Director can exercise PM authority within division with a reason and audit.', 'CONFIRMED', 'Director+'),
  ('V3-002', 'v5.v3_002', 'Inventory', 'Record inventory write-off', 'Manager', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Known loss/damage/unusable stock identified during a count routes as an action item to Inventory Administrator or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'Manager+'),
  ('V3-003', 'v5.v3_003', 'Inventory', 'Change recorded unit cost / valuation data', 'Manager', NULL, 'none', 'CAN_COMMIT', 'NONE', 'Preserve historical transactions. Estimating Manager alone cannot change inventory valuation. Cross-module requests route to Inventory Administrator or division Director. One master save and one reason per change set. Audit every changed field/item separately under the shared reason and save ID.', 'CONFIRMED', 'Manager+'),
  ('V3-004', 'v5.v3_004', 'Inventory', 'Approve known-loss / cross-module inventory action item', 'Director', NULL, 'none', 'CAN_APPROVE', 'NONE', 'Carry forward the original shared reason. Record every affected quantity/value and the approval.', 'CONFIRMED', 'Director+'),
  ('V3-005', 'v5.v3_005', 'Jobs / Projects', 'Division Director exercises assigned-PM authority', 'Director', NULL, 'none', 'CAN_COMMIT', 'PROJECT_ACCESS', 'One reason and thorough audit; within division only. Approved/posted financial edits still require Director approval and preserved revision. Primary Emergency Override Mode is separate.', 'CONFIRMED', 'Director+'),
  ('V3-006', 'v5.v3_006', 'Cross-App', 'Save durable unpublished work', 'User', NULL, 'none', 'CAN_EDIT', 'NONE', 'Use accessible data only. No official job number, posting, stock change or external submission. Declined/returned proposals remain available. No automatic deletion based on user tier.', 'CONFIRMED', 'User+'),
  ('V3-007', 'v5.v3_007', 'Cross-App', 'Submit unpublished work for review', 'User', NULL, 'none', 'CAN_SUBMIT', 'NONE', 'Submission creates an approval item, not an official job or customer communication. One reason reused by linked destinations when required.', 'CONFIRMED', 'User+'),
  ('V3-008', 'v5.v3_008', 'Jobs / Projects', 'Approve promotion to official job / service call', 'Supervisor', NULL, 'none', 'CAN_APPROVE', 'PROJECT_ACCESS_IF_ATTACHED', 'Default to next available job number; Supervisor+ may override. Prevent duplicate numbers. Preserve source work and avoid double counting. External estimate submission retains CFG-017.', 'CONFIRMED', 'Supervisor+'),
  ('V3-009', 'v5.v3_009', 'Estimating', 'Create new assembly in shared library', 'Manager', NULL, 'none', 'CAN_COMMIT', 'NONE', 'No default right to edit existing shared entries. Estimating Manager manages existing shared library content. Preserve history.', 'CONFIRMED', 'Manager+'),
  ('V3-010', 'v5.v3_010', 'Estimating', 'Manage existing shared assembly / pricing / labor', 'Director', NULL, 'none', 'CAN_ADMIN', 'NONE', 'No automatic inventory cost/valuation access. Manager-equivalent library archive; Director+ permanent delete only where not prohibited. Company-wide defaults require separate scope.', 'CONFIRMED', 'Director+'),
  ('V3-011', 'v5.v3_011', 'Estimating', 'Save material price override in estimate/project', 'User', NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS_IF_ATTACHED', 'Draft save is unrestricted within accessible work. Applying to official project/approved estimate follows its existing gate. Never rewrite historical estimates.', 'CONFIRMED', 'User+'),
  ('V3-012', 'v5.v3_012', 'Inventory', 'Request inventory price update from estimate', 'User', NULL, 'none', 'CAN_SUBMIT', 'NONE', 'Include item, unit, current/proposed price, source estimate/project, requester, scope and shared reason. Estimate override remains saved if inventory request is pending or declined.', 'CONFIRMED', 'User+'),
  ('V3-013', 'v5.v3_013', 'Inventory', 'Approve and apply inventory price update', 'Director', NULL, 'none', 'CAN_APPROVE', 'NONE', 'Recheck current price if changed since request. Preserve old price, reason, source, actor and approver. Never rewrite historical estimates, transactions or recorded valuation.', 'CONFIRMED', 'Director+'),
  ('V3-014', 'v5.v3_014', 'Inventory', 'View price history', 'User', NULL, 'none', 'CAN_VIEW', 'NONE', 'Respect existing inventory-price visibility. This row adds no access to restricted inventory. Audit metadata visibility follows existing access.', 'CONFIRMED', 'User+'),
  ('V3-015', 'v5.v3_015', 'Cross-App', 'Receive and review approval notifications', 'Director', NULL, 'none', 'CAN_VIEW', 'NONE', 'Route by module and division; visibility does not independently grant approval. Keep current pending/approved/returned/declined status and link to the exact request.', 'CONFIRMED', 'Director+'),
  ('V3-016', 'v5.v3_016', 'Cross-App', 'Save linked destination changes independently', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'NONE', 'Do not block saved estimate work on inventory/library approval. Within one dependent destination change set, avoid partial application; show exactly what is saved, pending or applied.', 'CONFIRMED', 'User+'),
  ('FCT-001', 'v5.fct_001', 'Forecasting', 'Prepare / save monthly forecast draft', NULL, NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'Use previous period last locked forecast, not actual costs. For first forecast enter opening cumulative per cost code, including explicit zero. One entry method calculates period spending and cumulative total.', 'CONFIRMED', 'SCOPED_ONLY'),
  ('FCT-002', 'v5.fct_002', 'Forecasting', 'Complete monthly project forecasting', NULL, NULL, 'none', 'CAN_COMMIT', 'PROJECT_ACCESS', 'Required: project/division, assigned PM, reporting month, due date, forecast-through date, every applicable cost-code forecast and completion estimate; system records lock actor/time/version. Each code has explicit values or No Change carrying its prior locked values. Blank is not zero. Negative period spend or completion below cumulative requires explanation within the shared reason, not Director approval.', 'CONFIRMED', 'SCOPED_ONLY'),
  ('FCT-003', 'v5.fct_003', 'Forecasting', 'View forecast dashboard badge / open workflow', NULL, NULL, 'none', 'CAN_VIEW', 'PROJECT_ACCESS', 'Unfinished initial monthly work past its recorded due date is Overdue; preserve Incomplete/Started state. A locked original stays Complete while a revision is in progress, with Revision in progress indicator. Keep late completion history.', 'CONFIRMED', 'SCOPED_ONLY'),
  ('V4-001', 'v5.v4_001', 'Admin / Audit', 'Grant can_manage_developers', NULL, NULL, 'primary', 'CAN_ADMIN', 'NONE', 'Only Primary may grant can_manage_developers. Recipients have equivalent administrative/technical authority and may manage other Developer assignments, but cannot regrant this permission, change Primary access or enter Emergency Override Mode.', 'CONFIRMED', 'PRIMARY_ONLY'),
  ('V4-002', 'v5.v4_002', 'Admin / Audit', 'Manage other Developer assignments', NULL, NULL, 'manage_developers', 'CAN_ADMIN', 'NONE', 'No onward grant of can_manage_developers, no Primary-access changes, and no exclusive emergency override. Audit all changes.', 'CONFIRMED', 'SCOPED_ONLY'),
  ('V4-003', 'v5.v4_003', 'Jobs / Projects', 'View company-wide project financials as PM', 'Manager', NULL, 'none', 'CAN_VIEW', 'PM_COMPANY_VIEW', 'Keep company-wide PM visibility configurable and flagged for future review. Profit requires Manager+; all PMs meet that role floor. Viewing never grants cross-division editing.', 'CONFIRMED', 'Manager+'),
  ('V4-004', 'v5.v4_004', 'Jobs / Projects', 'Suggest financial edits outside owned division', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'PROJECT_ACCESS', 'Suggestions stay pending; affected-division assigned PM or Director approves. If already approved/posted, Director approval is required. No new financial visibility implied.', 'CONFIRMED', 'User+'),
  ('V4-005', 'v5.v4_005', 'Jobs / Projects', 'View profit values', 'Manager', NULL, 'none', 'CAN_VIEW', 'PROJECT_ACCESS', 'Apply profit restrictions to UI, reports, exports and breakdowns directly revealing profit. A Manager+ holder can view only within their authorized financial scope.', 'CONFIRMED', 'Manager+'),
  ('V4-006', 'v5.v4_006', 'Jobs / Projects', 'Assign users to project', 'Manager', NULL, 'none', 'CAN_ADMIN', 'ASSIGNED_PM_OR_DIRECTOR', 'No staffing right from Superintendent/Electrical Lead. Staffing does not grant protected PM roles, financial access or elevated permissions.', 'CONFIRMED', 'Manager+'),
  ('V4-007', 'v5.v4_007', 'Schedule', 'Assign tasks to existing project members', NULL, NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'No project membership changes or elevated access. Schedule-affecting assignments retain revision history.', 'CONFIRMED', 'SCOPED_ONLY'),
  ('V4-008', 'v5.v4_008', 'Jobs / Projects', 'Approve field progress', 'Supervisor', NULL, 'none', 'CAN_APPROVE', 'PROJECT_ACCESS', 'Separate from financial approval, schedule reassignment and staffing.', 'CONFIRMED', 'Supervisor+'),
  ('V4-009', 'v5.v4_009', 'Jobs / Projects', 'Update own task status/progress and evidence', 'User', NULL, 'none', 'CAN_CONTRIBUTE', 'OWN_ASSIGNED_TASK', 'Field progress approval is Supervisor+ or assigned Superintendent/Electrical Lead. Schedule edits and reassignment are separately controlled.', 'CONFIRMED', 'User+'),
  ('V4-010', 'v5.v4_010', 'Schedule', 'Compare current schedule to Original', 'User', NULL, 'none', 'CAN_VIEW', 'PROJECT_ACCESS', 'Keep Original and numbered revisions. Comparison appears when an Original exists; no additional edit authority.', 'CONFIRMED', 'User+'),
  ('V4-011', 'v5.v4_011', 'Forecasting', 'Change monthly forecast due date', NULL, NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'Audit previous/new due dates and shared reason; retain late history. Reporting month, due date and forecast-through date are separate fields.', 'CONFIRMED', 'SCOPED_ONLY'),
  ('V4-012', 'v5.v4_012', 'Forecasting', 'Unlock / revise locked forecast', NULL, NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'Preserve Original, revision numbers, lock actor/date/time and internal change note. Complete remains visible with Revision in progress while editing.', 'CONFIRMED', 'SCOPED_ONLY'),
  ('V4-013', 'v5.v4_013', 'Forecasting', 'Adopt revised prior forecast baseline', NULL, NULL, 'none', 'CAN_EDIT', 'PROJECT_ACCESS', 'Never silently rebase a later forecast. Preserve source forecast/version and old/new starting amounts. Recalculate derived fields under the selected input method; locked targets use revision workflow.', 'CONFIRMED', 'SCOPED_ONLY'),
  ('V4-014', 'v5.v4_014', 'Admin / Audit', 'Export Emergency Override recovery package', NULL, NULL, 'primary', 'CAN_ADMIN', 'NONE', 'Capture deleted records, relationships and file versions before mutation. No secrets/tokens in export. Durable server capture supports later retry. External effects cannot be reversed by JSON; show coverage limitations.', 'CONFIRMED', 'PRIMARY_ONLY'),
  ('V4-015', 'v5.v4_015', 'Admin / Audit', 'Review and apply emergency recovery', NULL, NULL, 'primary', 'CAN_ADMIN', 'NONE', 'No blind restore. Audit restoration and preserve current versions. Files need retained versions; external effects such as sent emails are not reversed by JSON.', 'CONFIRMED', 'PRIMARY_ONLY')
ON CONFLICT (action_id) DO UPDATE SET
  action_key = EXCLUDED.action_key,
  module = EXCLUDED.module,
  description = EXCLUDED.description,
  minimum_business_role = EXCLUDED.minimum_business_role,
  required_permission = EXCLUDED.required_permission,
  special_authority = EXCLUDED.special_authority,
  capability = EXCLUDED.capability,
  scope_rule = EXCLUDED.scope_rule,
  state_guard = EXCLUDED.state_guard,
  specification_status = EXCLUDED.specification_status,
  base_authority = EXCLUDED.base_authority,
  is_active = true,
  updated_at = now();

ALTER TABLE public.job_user_assignments
  ADD COLUMN assignment_role text NOT NULL DEFAULT 'member'
  CHECK (assignment_role IN ('member', 'lead', 'superintendent', 'project_manager'));

CREATE FUNCTION public.enforce_project_manager_business_rank()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE target_rank text;
BEGIN
  IF NEW.assignment_role = 'project_manager' AND NEW.unassigned_at IS NULL THEN
    SELECT business_role INTO target_rank
    FROM public.user_permissions
    WHERE clerk_user_id = NEW.user_id AND is_active;
    IF public.business_role_rank(target_rank) < public.business_role_rank('Manager') THEN
      RAISE EXCEPTION 'Assigned Project Managers must have Manager or Director business rank' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER enforce_project_manager_business_rank_trigger
  BEFORE INSERT OR UPDATE OF user_id, assignment_role, unassigned_at
  ON public.job_user_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_project_manager_business_rank();

CREATE FUNCTION public.current_permission_provenance(p_permission_flag text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  profile public.user_permissions%ROWTYPE;
  override_row public.user_permission_overrides%ROWTYPE;
  assigned_template public.permission_templates%ROWTYPE;
  default_template public.permission_templates%ROWTYPE;
  effective jsonb;
BEGIN
  SELECT * INTO profile FROM public.user_permissions
  WHERE clerk_user_id = actor AND is_active LIMIT 1;
  IF profile.id IS NULL THEN RETURN jsonb_build_object('source', 'none', 'granted', false); END IF;
  effective := public.effective_permissions_for_user(profile.role, profile.division, profile.permission_overrides);
  IF p_permission_flag = 'can_access_developer' THEN
    RETURN jsonb_build_object('source', 'technical_assignment', 'granted', public.user_has_technical_assignment(actor, 'developer'));
  ELSIF p_permission_flag = 'can_manage_developers' THEN
    RETURN jsonb_build_object('source', 'protected_primary_or_non_delegable_grant', 'granted', public.user_can_manage_developers(actor));
  END IF;
  SELECT * INTO override_row FROM public.user_permission_overrides
  WHERE user_id = actor AND permission_flag = p_permission_flag AND is_active
  ORDER BY granted_at DESC LIMIT 1;
  IF override_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('source', 'individual_override', 'source_id', override_row.id, 'granted', override_row.granted);
  END IF;
  SELECT template.* INTO assigned_template
  FROM public.user_permission_templates assignment
  JOIN public.permission_templates template ON template.id = assignment.template_id
  WHERE assignment.user_id = actor;
  IF assigned_template.id IS NOT NULL AND assigned_template.permissions ? p_permission_flag THEN
    RETURN jsonb_build_object('source', 'assigned_template', 'source_id', assigned_template.id,
      'source_name', assigned_template.name, 'granted', COALESCE((assigned_template.permissions->>p_permission_flag)::boolean, false));
  END IF;
  SELECT * INTO default_template FROM public.permission_templates
  WHERE default_role = profile.role AND default_division = COALESCE(profile.division, 'Unassigned');
  IF default_template.id IS NOT NULL AND default_template.permissions ? p_permission_flag THEN
    RETURN jsonb_build_object('source', 'default_template', 'source_id', default_template.id,
      'source_name', default_template.name, 'granted', COALESCE((default_template.permissions->>p_permission_flag)::boolean, false));
  END IF;
  RETURN jsonb_build_object('source', 'role_default', 'business_role', profile.business_role,
    'legacy_role', profile.role, 'granted', COALESCE((effective->>p_permission_flag)::boolean, false));
END
$function$;

CREATE FUNCTION public.current_scoped_authorization_decision(
  p_action_id text,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  actor text := auth.jwt()->>'sub';
  profile public.user_permissions%ROWTYPE;
  action public.authorization_actions%ROWTYPE;
  permissions jsonb;
  job_id uuid;
  target_user_id text := nullif(p_context->>'target_user_id', '');
  authority_allowed boolean := false;
  scope_allowed boolean := false;
  authority_source text := 'none';
  scope_source text := 'none';
  permission_source jsonb;
  denial text;
BEGIN
  IF nullif(actor, '') IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', p_action_id, 'denial', 'authentication_required');
  END IF;
  SELECT * INTO profile FROM public.user_permissions
  WHERE clerk_user_id = actor AND is_active LIMIT 1;
  IF profile.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', p_action_id, 'denial', 'active_profile_required');
  END IF;
  SELECT * INTO action FROM public.authorization_actions
  WHERE action_id = p_action_id AND is_active;
  IF action.action_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', p_action_id, 'denial', 'unknown_or_inactive_action');
  END IF;
  IF action.special_authority = 'primary' THEN
    authority_allowed := public.current_user_is_primary();
    authority_source := 'protected_primary';
  ELSIF action.special_authority = 'manage_developers' THEN
    authority_allowed := public.user_can_manage_developers(actor);
    authority_source := 'can_manage_developers';
  ELSIF action.base_authority IN ('CUSTOM', 'SCOPED_ONLY', 'CAN_NONE')
        AND action.minimum_business_role IS NULL
        AND action.required_permission IS NULL THEN
    denial := 'action_mapping_required';
  ELSE
    authority_allowed := public.business_role_rank(profile.business_role) >= public.business_role_rank(action.minimum_business_role);
    authority_source := 'business_role';
    IF authority_allowed AND action.required_permission IS NOT NULL THEN
      permissions := public.effective_permissions_for_user(profile.role, profile.division, profile.permission_overrides);
      authority_allowed := COALESCE((permissions->>action.required_permission)::boolean, false);
      permission_source := public.current_permission_provenance(action.required_permission);
      authority_source := 'business_role_and_permission';
    END IF;
  END IF;
  IF denial IS NULL AND NOT authority_allowed THEN denial := 'insufficient_authority'; END IF;
  IF denial IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', action.action_id, 'action_key', action.action_key,
      'denial', denial, 'authority_source', authority_source, 'permission_source', permission_source,
      'business_role', profile.business_role, 'scope_rule', action.scope_rule);
  END IF;
  BEGIN
    job_id := nullif(p_context->>'job_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('allowed', false, 'action_id', action.action_id, 'denial', 'invalid_job_context');
  END;
  CASE action.scope_rule
    WHEN 'NONE' THEN
      scope_allowed := true; scope_source := 'global_action';
    WHEN 'PROJECT_ACCESS' THEN
      scope_allowed := job_id IS NOT NULL AND public.current_user_can_access_job(job_id);
      scope_source := 'project_access';
    WHEN 'PROJECT_ACCESS_IF_ATTACHED' THEN
      scope_allowed := job_id IS NULL OR public.current_user_can_access_job(job_id);
      scope_source := CASE WHEN job_id IS NULL THEN 'not_attached' ELSE 'project_access' END;
    WHEN 'ASSIGNED_PM_OR_DIRECTOR' THEN
      scope_allowed := job_id IS NOT NULL AND (
        (profile.business_role = 'Director' AND public.current_user_can_access_job(job_id))
        OR EXISTS (
          SELECT 1 FROM public.job_user_assignments assignment
          WHERE assignment.job_id = job_id AND assignment.user_id = actor
            AND assignment.assignment_role = 'project_manager' AND assignment.unassigned_at IS NULL
        )
      );
      scope_source := CASE WHEN profile.business_role = 'Director' THEN 'division_director' ELSE 'assigned_project_manager' END;
    WHEN 'SERVICE_CALL_ACCESS' THEN
      scope_allowed := job_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.jobs job WHERE job.id = job_id AND job.job_type = 'service_call' AND job.archived_at IS NULL)
        AND public.current_user_can_access_job(job_id);
      scope_source := 'service_call_access';
    WHEN 'SELF_OR_MANAGED_EMPLOYEE' THEN
      scope_allowed := target_user_id = actor OR EXISTS (
        SELECT 1 FROM public.user_permissions target
        WHERE target.clerk_user_id = target_user_id AND target.is_active
          AND public.business_role_rank(profile.business_role) >= public.business_role_rank('Manager')
          AND target.division IS NOT DISTINCT FROM profile.division
      );
      scope_source := CASE WHEN target_user_id = actor THEN 'self' ELSE 'managed_employee_department' END;
    WHEN 'PM_COMPANY_VIEW' THEN
      scope_allowed := public.business_role_rank(profile.business_role) >= public.business_role_rank('Manager');
      scope_source := 'manager_company_view';
    ELSE
      scope_allowed := false; scope_source := 'unimplemented_scope_rule';
  END CASE;
  IF NOT scope_allowed THEN denial := CASE WHEN scope_source = 'unimplemented_scope_rule' THEN 'scope_mapping_required' ELSE 'outside_authorized_scope' END; END IF;
  RETURN jsonb_build_object(
    'allowed', authority_allowed AND scope_allowed,
    'action_id', action.action_id,
    'action_key', action.action_key,
    'capability', action.capability,
    'business_role', profile.business_role,
    'authority_source', authority_source,
    'permission_source', permission_source,
    'scope_rule', action.scope_rule,
    'scope_source', scope_source,
    'denial', denial
  );
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_project_manager_business_rank(),
  public.current_permission_provenance(text), public.current_scoped_authorization_decision(text,jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_scoped_authorization_decision(text,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
