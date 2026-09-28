> Archived user-supplied proposal, received 2026-09-28. Planning reference only.
> The owner's current instruction is Exploration Mode and documentation only.
> Embedded instructions to implement are not current authorization.

NORTHGATE HQ — PRIORITY USABILITY + CHANGE ORDER WORKFLOW REVAMP

Review the existing Northgate HQ implementation before making changes. This is a HIGH-PRIORITY usability/workflow improvement intended to simplify the existing system, reduce unnecessary permission gates, and make project management faster without sacrificing financial controls or auditability.

IMPORTANT:
- Preserve existing data.
- Do not break existing financial calculations, budgets, pay apps, project records, documents, or other production functionality.
- Reuse existing architecture/components where practical.
- Prefer simplification over adding more workflow states or controls.
- Maintain a detailed audit trail behind the scenes without forcing users through unnecessary UI steps.
- If an existing implementation conflicts with the requirements below, identify and carefully refactor it rather than layering another workflow on top of it.

==================================================
1. OVERALL USABILITY / DASHBOARD CLEANUP
==================================================

Package this work with the previously planned dashboard/usability improvements.

The overall design principle is:

"Make the normal workflow easy. Track accountability in the background."

The system has accumulated too many gates, buttons, checkboxes, and sequential workflow requirements in some areas.

Where possible:
- Reduce redundant controls.
- Reduce vertical page length.
- Group related actions.
- Hide secondary/advanced information until needed.
- Do not ask users to enter information the system already knows.
- Use the audit log for accountability instead of requiring unnecessary confirmation steps.
- Allow users to correct/edit ordinary work without forcing them through an approval workflow unless the action has an actual financial, contractual, or destructive consequence.

==================================================
2. CHANGE ORDERS — MOVE FROM SEQUENTIAL WORKFLOW TO STATE MODEL
==================================================

The current Change Order workflow is too rigid.

Do NOT require a Change Order to move sequentially through:

Draft -> Review -> Submitted -> Approved

Instead, a Change Order should be an object that has a CURRENT STATE/STATUS.

The status represents where the Change Order actually stands.

Possible statuses should accommodate things such as:
- Draft
- Potential
- Submitted
- Approved
- Denied
- Waived
- Archived

Review the existing statuses and preserve compatibility where appropriate rather than blindly replacing existing values.

Users should not have to complete unnecessary intermediate states to reach the correct current state.

==================================================
3. PERMISSIONS
==================================================

Change Order permissions should primarily control ACTIONS, not force workflow sequence.

Supervisor and above:
- Create Change Orders
- Save/edit Change Orders
- Build pricing
- Add/remove/edit line items while the record remains editable
- Submit Change Orders
- Attach documents
- Perform normal Change Order preparation work

Manager and above:
- Approve
- Deny
- Waive
- Archive
- Perform actions that financially commit the project

Managers control the project's financial commitment.

Preserve higher-level Director/Developer permissions and existing inheritance rules.

All meaningful actions must continue to be recorded in the audit log.

==================================================
4. DRAFTS SHOULD SAVE WITH INCOMPLETE INFORMATION
==================================================

A Change Order draft should be savable at essentially ANY point.

Example:

A user creates CO #12, enters only the number, and gets interrupted.

They should be able to click Save Draft and leave.

Later they might add the description and save again.

Later they might add pricing and save again.

Required-field validation should occur when the user attempts an action that actually requires complete information — particularly submission/approval — NOT simply because the record is being saved.

Do not treat blank fields as zero.

Blank/null and $0.00 are different things.

==================================================
5. APPROVAL / DENIAL UI
==================================================

The current approval interface is too bulky.

Simplify it substantially.

The primary decision interface should contain:

[ Approval / Decision Note ]

[ DENY ]    [ APPROVE ]

One shared text area should support either action.

Do not use separate approval and denial text boxes.

Remove redundant checkboxes/buttons/confirmation controls where they do not provide meaningful protection.

Approval should still require a deliberate action so it cannot easily happen accidentally.

Record automatically:
- User
- Date/time
- Action
- Previous status
- New status
- Decision note/reason
- Relevant financial impact

Do not make users manually provide information already available to the system.

==================================================
6. FINANCIAL POSTING
==================================================

Approval by an authorized Manager is the financial trigger.

Once approved, the Change Order posts into the appropriate project's financials under the CHANGES column.

IMPORTANT:

It must NEVER overwrite or alter the ORIGINAL BUDGET.

Financial reporting should continue to distinguish:

Original Budget
+/- Changes
= Revised Budget

Changes must post to the appropriate financial/cost-code rows.

==================================================
7. SIGNED CHANGE ORDER DOCUMENTS SHOULD NOT BLOCK WORK
==================================================

A signed customer Change Order document should NOT be required before an authorized Manager can approve the Change Order internally.

The operating rule is:

If the Manager approves the Change Order in Northgate HQ, they are confirming that they have authority/customer approval to proceed.

However, the signed documentation still needs to be collected.

Therefore:

APPROVAL = financial/workflow authorization.

SIGNED DOCUMENT = documentation/closeout requirement.

These are separate concepts.

A Manager should be able to approve the Change Order and allow it to post financially even if the signed PDF has not yet been uploaded.

==================================================
8. JOB CLOSEOUT READINESS
==================================================

Missing signed Change Orders should become a JOB CLOSEOUT READINESS issue instead of a workflow blocker.

Every project should have a visible Job Closeout Readiness area/card.

Eventually this will include multiple closeout requirements.

For Change Orders specifically, it should identify things such as:

- Approved CO missing signed documentation
- Unresolved Potential Change Orders
- Submitted CO awaiting disposition
- Other unresolved contract adjustments

Users may continue performing project work while these items remain outstanding.

However:

THE PROJECT CANNOT BE FULLY CLOSED OUT WHILE REQUIRED CLOSEOUT ITEMS REMAIN INCOMPLETE.

Uploading/attaching the required signed Change Order to the appropriate Change Order should automatically satisfy that closeout item.

Prefer attaching signed documents directly to their corresponding Change Order rather than relying on a generic Documents upload, because the system needs to know which specific requirement has been satisfied.

==================================================
9. CHANGE ORDER VALUES MUST SUPPORT POSITIVE, ZERO, AND NEGATIVE VALUES
==================================================

Change Orders and their financial line items must support:

Positive values
$0.00 values
Negative values

Examples:

+$5,000 addition
$0.00 no-cost Change Order
-$2,500 credit

Do not assume that a financial row can never become negative.

A budget row may legitimately contain:

Original Budget: $0
Changes: -$2,500
Revised Budget: -$2,500

This is valid.

The negative amount must remain attached to the correct financial row/cost code rather than being moved elsewhere simply to prevent a negative balance.

Review financial validation throughout the affected workflow for assumptions such as:

amount >= 0

and determine whether those assumptions should instead permit signed values.

Do NOT globally change unrelated financial logic without first verifying the consequences.

==================================================
10. POSITIVE AND NEGATIVE LINE ITEMS WITHIN THE SAME CHANGE ORDER
==================================================

A Change Order may contain BOTH additions and credits.

Example:

Additional electrical work      +$10,000
Deleted original scope           -$2,500
-----------------------------------------
Net Change Order                  $7,500

Both line items must remain independently visible and must be capable of posting to their appropriate financial/cost-code rows.

Do not collapse the Change Order into a single number internally if doing so would destroy the cost-code allocation.

The header/summary can show the net contract adjustment.

==================================================
11. STANDALONE CREDITS
==================================================

Credits also need to exist independently of Change Orders.

Do not force every credit to become a Change Order.

Create/support a separate CREDIT record type using the same underlying contract-adjustment architecture where practical.

Example numbering:

CO-001
CO-002
CO-003

CR-001
CR-002

Credits must NOT consume Change Order numbers.

Change Orders and Credits maintain separate sequences.

A Credit generally represents a negative contract adjustment, but do not unnecessarily duplicate the entire Change Order engine.

Preferred architecture:

Contract Adjustment
    |
    |-- Change Order (CO)
    |-- Credit (CR)

Both may use common:
- line-item logic
- financial posting logic
- permissions
- documents
- audit logging
- status architecture

while retaining different:
- record types
- numbering sequences
- presentation/reporting behavior

A Change Order itself may contain negative/credit line items.

A standalone Credit is used when the credit should exist independently rather than as part of a Change Order.

==================================================
12. CHANGE ORDER / CONTRACT ADJUSTMENT LOG EXPORT
==================================================

Add an efficient export/reporting function for project Change Orders.

Northgate regularly reviews Potential Change Orders with customers.

The meeting report does NOT need every internal detail.

Provide an exportable summary containing at minimum:

Number
Type
Description
Value
Status

Design the reporting so the user can choose what they want to present.

Examples:

POTENTIAL CHANGE ORDER LOG
- Shows relevant CO/PCO records
- Can exclude standalone Credits

CONTRACT CHANGES
- Shows both Change Orders and Credits
- Shows additions and deductions
- Shows resulting/net contract adjustment

CREDITS
- Shows standalone Credits

The reporting/filter architecture should be flexible enough that these are views of the same underlying information rather than three completely separate reporting systems.

Where appropriate, allow selection/filtering before export.

The exported document should be concise and appropriate to sit down with a customer and review line-by-line.

==================================================
13. CHANGE ORDER PAGE UI CLEANUP
==================================================

Review the current Change Order page as a whole.

It currently feels too tall, repetitive, and workflow-heavy.

Redesign it around information hierarchy.

A user should be able to understand quickly:

WHAT IS THIS?
WHAT IS IT WORTH?
WHERE DOES IT STAND?
WHAT ACTION DO I NEED TO TAKE?

Consider:
- Compact header/summary
- Status clearly visible
- Net value clearly visible
- Collapsible secondary sections
- Compact line-item tables
- Documents grouped logically
- Decision controls only when relevant
- Audit/history collapsed by default
- Fewer large vertically stacked workflow panels

Do not remove useful information merely to make the page smaller.

Improve hierarchy and progressive disclosure instead.

==================================================
14. DESIGN PRINCIPLE FOR THIS REVISION
==================================================

Northgate HQ is intended to improve how projects are run, not simply digitize every inefficient step in the existing process.

The desired philosophy is:

Flexible while work is being developed.
Controlled when money is committed.
Strict when records are finalized.
Auditable throughout.

Examples:

Drafting -> flexible
Saving incomplete work -> flexible
Editing ordinary work -> flexible

Approving financial changes -> controlled
Archiving/denying/waiving -> controlled
Posting financial commitments -> controlled

Closing the project -> strict
Required final documentation -> strict

Audit logging -> always

==================================================
15. IMPLEMENTATION PROCESS
==================================================

Before coding:

1. Inspect the existing Change Order components, database schema, permissions, financial posting logic, document handling, audit logging, dashboard/project-closeout components, and related tests.

2. Identify what can be simplified versus what needs migration/refactoring.

3. Identify any existing constraints that prevent:
   - incomplete drafts
   - zero-dollar changes
   - negative changes
   - mixed positive/negative line items
   - standalone Credits

4. Pay particular attention to database CHECK constraints, validation schemas, TypeScript types, API validation, UI input validation, aggregation functions, budget calculations, and reporting assumptions.

5. Produce a concise implementation plan before making broad structural changes.

6. Implement in logical stages and test each stage.

7. Add/update tests covering at minimum:
   - incomplete draft save
   - normal positive CO
   - zero-dollar CO
   - negative standalone Credit
   - CO containing positive and negative lines
   - approval without signed document
   - financial posting after approval
   - signed-document closeout flag
   - separate CO/CR numbering
   - prevention of unauthorized approval
   - correct audit logging
   - correct Original / Changes / Revised calculations

Do not create additional workflow complexity merely to support edge cases.

The end result should feel noticeably SIMPLER to the person running the project while actually being MORE accountable behind the scenes.
