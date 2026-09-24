# Project responsibility and scoped access — proposed rules

**Status:** Design proposal for Ryan's approval; no permission migration or rollout authorized.
**Environment:** Develop and validate on isolated Staging first. Production remains unchanged.

## Existing system to preserve

- `job_responsibilities` holds at most one assignee for each of four named slots: Superintendent, Construction Project Manager, Electrical Project Manager, and Electrical Lead. Changes are audited. These are currently informational.
- `job_user_assignments` records project participation (`member`, `lead`, `superintendent`, `project_manager`). It is many-users-per-Job and already participates in My Work, but does not presently grant Job or financial access by itself.
- Job read/edit access is currently based on the Job's department (legacy `division`) and any linked `job_sub_divisions`, plus the user's effective permission. Effective permissions come from role/department defaults or a named template, then individual overrides. The v5 action catalogue additionally has business-role floors and scope rules.
- Developer is technical access, separate from business approval authority. The four named slots must not become an alternate role or permission system.

## Recommended decision rule

Authorize an action only if **all** applicable checks pass: active user; appropriate business-role floor; effective granular capability with explicit individual denial winning; authorized department/Job scope; qualifying project assignment where that specific action requires one; and record-state guard. Assignment identifies *where* an existing capability can be exercised, not *what* capability the user has. No UI-only enforcement.

For example, an Electrical Project Manager with budget-approval capability may approve eligible Electrical Job budget actions only if the action's scoped rule permits that Job and all approval/state checks pass. Assigning that slot to a User without budget-approval capability grants no budget edit or approval. Conversely, a Manager's existing cross-project capability is not revoked merely because the Manager lacks a named slot, unless a particular action is deliberately changed to require one after compatibility testing.

## Proposed scope by responsibility

| Assignment | Operational effect | Financial effect by default | Management/approval effect by default |
| --- | --- | --- | --- |
| Superintendent | Appears in My Work; can be a routing target for assigned-Job operational tasks where existing capability allows | No new financial access; any project-budget view still requires `can_view_project_financials` and applicable protected-line permission | No budget/CO/Pay App approval grant |
| Construction Project Manager | Appears in My Work; can be designated owner for Construction-side project tasks | Existing financial permissions still required | May satisfy an explicit “assigned PM” scope rule, but only with Manager+ business rank and the action's own permission |
| Electrical Project Manager | Same, for Electrical-side work | Same | Same, scoped to Electrical-side action where that distinction is relevant |
| Electrical Lead | Appears in My Work; operational task routing within existing authority | No new financial access | No financial approval grant |
| Project member (`job_user_assignments`) | Appears in My Work; eligible for ordinary assigned tasks | No new financial access | No management/approval grant |

One person may hold multiple named slots, and one Job may have many participating members. The named PM slots are canonical responsibility labels; the generic `project_manager` membership role must not be treated as a second independent PM appointment. Before enabling any PM-gated action, reconcile current records so the two representations cannot disagree silently.

## Read and write boundaries

1. **Job visibility:** Preserve current department/linked-department access pending Ryan's decision on cross-department assignments. My Work must not be used as proof that sensitive Job data is readable; every detail fetch rechecks Job RLS.
2. **Operational fields and tasks:** A named assignee may receive routing/notifications, but writes still need the existing granular permission and record-state check. Future task-allocation rights should be separate from adding/removing project members.
3. **Project budgets and actuals:** Continue line-level financial RLS. Assignment does not grant `can_view_project_financials`; protected categories continue to require `can_view_protected_project_financials`. Derived totals, alerts, exports and Silas context must use the same visible scope.
4. **Financial edits, CO posting, SOV and Pay App approval:** Do not infer these from an assignment. Require the existing action permission, business-role floor, department/Job scope, state guard and any specific assigned-PM requirement. Do not switch the proposed `CFG-009`/`AUD-016` CO-posting scope until its compatibility hold and test plan are resolved.
5. **Developer and emergency authority:** No named project assignment supplies Developer access, broad correction rights, or Primary Emergency Override.
6. **Explicit deny:** A user's individual deny overrides any template or role default and cannot be rescued by assignment. An exception, if ever needed, must be a separately approved, auditable permission grant—not an implicit role side effect.

## Assignment administration and lifecycle

- Keep one named assignee per slot and many project members. Use active employee records only. One employee may occupy multiple slots when intentional.
- Manager/Director with existing Job-management permission may change named slots; use current server RPC and automatic before/after audit. Assignment changes should not require prose for routine correction. Removing a user from a Job or revoking a permission should take effect on the next server read/action.
- Project membership changes remain governed by the existing assignment action and audit. Avoid duplicate writes to both tables unless an atomic, explicitly defined synchronization rule is approved.
- On department change, deactivation, reassignment or Job archive, pending work should be visibly reassigned or marked unowned; do not silently route to a former assignee. Existing history retains the former actor/assignee.
- Show permission provenance separately from responsibility: “You are Electrical PM” does not imply “You can approve budgets.” If an action is unavailable, explain whether the missing piece is role, granular capability, department/Job scope, appointment, or workflow state without leaking protected data.

## Staged implementation once rules are approved

1. Inventory every Job-related RLS policy/RPC and classify its action as read, operational write, financial write, approval, or destructive correction. Record actual present behavior and flag `job_user_assignments`/`job_responsibilities` inconsistencies.
2. Specify which *individual actions* require an assigned PM (rather than applying a broad site-wide PM rule). Keep current behavior until migration and owner acceptance are ready.
3. Add only the minimum scoped evaluator/constraints needed; reuse the v5 action catalogue, effective permission resolver and existing assignment tables. Do not create a parallel permissions table.
4. Rehearse on Staging with Manager, Director, Supervisor, User and technical Developer accounts; same-department and cross-department Jobs; explicit grant/deny; assignment removal; protected-line RLS; archived/inactive users; and stale sessions. Compare pre/post permissions to detect unintended access loss or expansion.
5. Promote separately from the Staging feature queue with migration rehearsal, recovery point, release notes and explicit owner approval.

## Owner decisions needed before enforcement

1. If an Electrical employee is assigned to a Construction Job but does not already have Construction Job access, should assignment grant **basic operational Job visibility only**, or should a Manager separately add an authorized department/Job access link? Recommendation: explicit access link for now; no implicit cross-department grant.
2. Should the two named Project Manager slots be the only appointments that satisfy future assigned-PM gates, with the generic `project_manager` member role treated as participation metadata? Recommendation: yes, after reconciling existing records and confirming that no current CO workflow depends on the generic role.
