# Northgate HQ v2.0 — Handoff Log
### Repository: RNSolutions-electrical/Northgate-HQ-v2.0
### Rule: Append only. Never edit prior entries. Entries are permanent record.
### Before writing a new entry: read the last entry number and increment. Never reuse a number.

---

## Entry 001

**Date:** 2026-05-29
**Updated by:** Claude
**Phase:** Pre-build — Architecture Lock and Schema Planning
**Session type:** Architecture Review + Schema Planning

### Current Project State
v2.0 is a clean-slate rebuild of Northgate HQ on a locked architecture.
v1 (`Northgate-HQ`) remains intact as a working backup — do not touch it.
All infrastructure is new and separate from v1.

### Infrastructure
- GitHub: `RNSolutions-electrical/Northgate-HQ-v2.0`
- Supabase: New project — same naming scheme as repo
- Netlify: New deployment — v1 remains live separately
- Clerk: Shared with v1 — same publishable key
- Google Sheets: `Northgate HQ — Master Data Workbook` (ID: `1mD_d0tyZy1wEuJtxIkTyRhL9cy-s1PchH6-3OOL7L94`)

### Documents in This Repo
- `HANDOFF.md` — this file, cumulative session log
- `docs/ARCHITECTURE.md` — Architecture Lock Document v2.1, authoritative
- `docs/INVENTORY_SCHEMA.md` — Inventory Schema Plan v2.3, ready for SQL

### What Has Been Decided (Full Summary)
**AI Roles:** Claude = architecture reviewer/drift detector. Codex = implementation
driver/debugger. Architecture Lock Document = source of truth. Ryan = final authority.
Mid-build trigger: pause for Claude review if a decision affects schema, relationships,
module boundaries, permissions, audit logging, snapshots, source-of-truth rules,
financial logic, inventory logic, or cross-module communication.

**Primary entity naming:** Jobs (not Projects). Table is `jobs`. Nav item is "Jobs."
Project Management is a feature set within a Job, not a separate entity.

**Core architectural rules (non-negotiable):** Inventory balances transaction-derived
only; Jobs are source of truth after creation; approved estimate snapshots immutable
(DB trigger); permissions server-authoritative; audit logging cannot be bypassed; Dev
Console actions always logged; no duplicate source-of-truth; no direct DB edits outside
controlled tools; cost at time of transaction always stored; change orders are financial
records not documents; per-line-item transaction destinations from day one; physical
locations vs transaction destinations are distinct; archive over delete; snapshot
immutability DB-enforced.

**Cost structure order (locked):** Material markup → Overhead → Profit (independent
percentages, sequential).

**Permissions:** Roles — Developer, Administrator, Project Manager, Estimator, Field
Supervisor, User (Field Tech). Flags: see Architecture Lock Document Section 17.

**Google Sheets:** Master Data Workbook is the bulk data entry interface. App UI handles
one-off edits for authorized users. Supabase is the live source of truth — Sheets is not.

**Data in the Google Sheet (as of this entry):** Materials — hundreds of live rows with
full cascade (broad_category → sub_category → sub_category_2 → sub_category_3 → size);
Employees — real team data; Vehicles — E-101 (2019 Chevrolet Express 2500); Cost Codes —
Northgate Division 16 electrical codes; Assemblies — E-REC-001; Inventory Levels — bins
A111, C211–C224 with real stock data.

**Known data cleanup needed before import:** Material_Categories has blank field_name on
some sub_category_2 rows; Cost_Codes code `16,050.00` needs to be plain text `16050`.

### What Was Completed in Pre-Build
- Architecture Lock Document v2.1 finalized
- AI Development Roles document finalized
- Inventory Schema Plan reviewed across versions (v1 → v2.1 → v2.2 → v2.3)
- All schema conflicts with Phase 1 resolved: material_code kept as canonical key;
  4-level cascade kept as text columns; Phase 1 table names kept; vehicle_bins restored;
  min_quantity added to bin_items; Clerk user IDs locked as TEXT; target_quantity added
  to transaction_items; change_logs column names locked to Phase 1; void_expired_carts()
  replaces pg_cron (free tier).
- Repository named Northgate-HQ-v2.0; new Supabase project to be created.

### Next Steps (in order)
1. Codex generates migration SQL from docs/INVENTORY_SCHEMA.md (v2.3)
2. Ryan creates new Supabase project and runs migration SQL
3. Codex sets up v2.0 repo structure and base React + Vite app
4. Codex wires Clerk auth and Supabase client
5. Codex builds inventory cart checkout workflow
6. Claude does architecture alignment check before cart system build
7. Update this HANDOFF.md after each step

### Open Questions / Concerns
None currently blocking. Schema is locked and ready for SQL generation.

### Architecture Drift Warnings
None active at this time.

---

## Entry 002

**Date:** 2026-05-29
**Updated by:** ChatGPT
**Phase:** Migration Review — Inventory Balance Finalization
**Session type:** Cross-model implementation review / fresh-session handoff

### Current Active Repository
Correct working repo: `RNSolutions-electrical/Northgate-HQ-v2.0`.
Do NOT use `RNSolutions-electrical/Northgate-Estimator-V2.0` — that was a repo-name
confusion during a previous session. GitHub access confirmed for the correct repo.

### Migration Review Status
Codex generated the first full Phase 1 Inventory migration. ChatGPT reviewed and found
the original `update_inventory_balance()` trigger mishandled physical count corrections
(summed all `physical_count_correction.target_quantity` values instead of treating the
latest approved correction as a new baseline). Codex revised. Claude flagged two concerns:
UUID ordering is not chronological and should not be a ledger tie-breaker; pending and
rejected rows should not affect official balances. Both accepted.

### Locked Migration Adjustments Since v2.3
- `transaction_items` must include `ledger_sequence BIGINT GENERATED ALWAYS AS IDENTITY`
- Index: `idx_txn_items_bin_status_ledger ON transaction_items(bin_item_id, status, ledger_sequence)`
- `update_inventory_balance()` uses only `status = 'approved'` rows
- pending/rejected rows stay in log but do not affect `inventory_balances.quantity`
- A physical_count_correction becomes baseline only when `status = 'approved'`
- Latest correction selected by `ORDER BY ledger_sequence DESC`
- Cart checkout/finalization must explicitly mark inventory-moving rows `approved`

### Required Next Claude Review
Does approved-only balance align with lock document? Is ledger_sequence the correct
ordering mechanism? Should checkout mark rows approved immediately? Does separating
transaction-log status from job-cost approval need to be added to the lock document?

### Important Architectural Concern
There is now a likely distinction between inventory movement approval and
job-cost/accounting approval. Current migration uses a single `transaction_items.status`.
If inventory is physically finalized but job-cost approval is still pending, one status
may not be enough long-term. Working assumption: `status = 'approved'` means inventory
movement is official and affects on-hand balance; job-cost approval may need a separate
future field/table/status. Review before building cart checkout.

### Architecture Drift Warnings
Do not let pending/rejected rows affect balances. Do not use UUID order for sequencing.
Do not merge physical movement approval with accounting/job-cost approval without explicit
architectural decision. Do not run the migration until Claude completes final review.

---

## Entry 003

**Date:** 2026-05-31
**Updated by:** Codex
**Phase:** Phase 1 Inventory Migration Revision
**Session type:** Migration update / architecture alignment

### Decisions Applied This Session
- Inventory cost valuation invariant preserved: every job-cost effect valued at catalog
  unit_cost at the moment of transaction, stored in `unit_cost_at_time`, signed by direction.
- App job-cost remains partial by design — internal-stock movements only. Direct/AP
  purchases that never enter stock do not touch the app.
- `transaction_items.status` remains physical-only. `approved` means the physical movement
  is official and affects on-hand balance. It does NOT mean job-cost, accounting, AP,
  invoice, or reconciliation approval.
- `ledger_sequence` remains a deterministic tie-breaker, not real-world event order.
- `occurred_at` introduced as physical movement event time, distinct from `created_at`.

### Migration Changes Made
- Added `ledger_sequence BIGINT GENERATED ALWAYS AS IDENTITY` on transaction_items.
- Added `occurred_at TIMESTAMPTZ` to transaction_items.
- Added constraint preventing approved rows from having null occurred_at.
- Updated `update_inventory_balance()`: serialize recomputes per bin_item_id via
  `pg_advisory_xact_lock`; calculate from approved rows only; select latest count
  correction by `occurred_at DESC, ledger_sequence DESC`; sum approved movements after
  the latest correction; keep corrections as baselines not additive; recalc both old and
  new bins if bin_item_id changes; sort/dedupe affected bin IDs before locking to prevent
  deadlocks.
- Added minimal canonical `vendors` table.

### Checkout / Finalization Requirements
Mark physical movement rows approved when stock physically moves; stamp `occurred_at = NOW()`;
snapshot `unit_cost_at_time` from catalog at moment of issue/return; do not use
`transaction_items.status` for any financial/accounting approval.

### Still Requires Final Review
Revised migration prepared but must be reviewed by Ryan/ChatGPT before running. Do not run yet.

---

## Entry 004

**Date:** 2026-05-31
**Updated by:** Codex
**Phase:** Phase 1 Inventory Migration File Generation
**Session type:** Migration artifact creation / pre-run review

### What Was Completed
Created the Phase 1 Inventory SQL migration file:
`supabase/migrations/202605310001_phase_1_inventory.sql`. Generated from
docs/INVENTORY_SCHEMA.md v2.3 plus the approved Entry 003 balance-trigger revisions.
Included approved-row-only balance calc, occurred_at ordering, ledger_sequence tie-breaker,
per-bin advisory locks, sorted/deduped lock order, corrections as baselines, the minimal
vendors table, occurred_at, ledger_sequence, approved-row constraint, balance indexes, cart
tables, vehicle stock tables, utility functions, triggers, and the Grand Master Inventory view.

### Important Notes
Supabase CLI not installed in workspace, so the file was created directly using the
timestamped migration filename convention. Migration NOT yet run. Requires final review.

---

## Entry 005

**Date:** 2026-05-31
**Updated by:** Codex
**Phase:** Phase 1 Inventory Migration Runtime Fixes
**Session type:** Migration review fix / pre-run review

### What Was Completed
Updated `update_inventory_balance()` in both the migration file and
docs/INVENTORY_SCHEMA.md so trigger code only references OLD/NEW in valid operations.
Replaced the affected-bin subquery with explicit TG_OP branches: INSERT uses
NEW.bin_item_id; DELETE uses OLD.bin_item_id; UPDATE uses both. Kept sorted/deduped
advisory-lock order by unnesting the affected-bin array. Updated `block_snapshot_mutation()`
so DELETE returns OLD and UPDATE returns NEW.

### Important Notes
Migration NOT yet run. Still requires final Ryan/ChatGPT review before execution.

---

## Entry 006

**Date:** 2026-05-31
**Updated by:** Codex
**Phase:** Phase 1 Inventory Migration Applied
**Session type:** Supabase migration execution / post-run verification

### What Was Completed
Confirmed projects: v1 backup `northgate-hq / qpbuzinkjbjbvcdwvdfu`; v2 target
`northgate-hq-v2.0 / keogysnoukbendfkfjcn`. Confirmed v2 migration history empty before
applying. Applied the reviewed Phase 1 Inventory migration to the v2 project only.
Supabase recorded it as version `20260531173603`, name `phase_1_inventory`. Ran
post-migration balance tests with temporary `codex-test-*` records, then cleaned them up.

### Verification Completed
Pending insert did not affect balance; updating to `approved` with occurred_at affected
balance; approved physical_count_correction reset the baseline; approved movement after
correction adjusted from the new baseline; rejected rows did not affect balances; zero
remaining codex-test-* rows after cleanup.

### Important Notes
Migration run only against v2 (`keogysnoukbendfkfjcn`). v1 backup not selected, not modified.

### Next Steps
Begin wiring the app to v2 Supabase when Ryan is ready. Build cart checkout/finalization so
physical movements set `status = 'approved'`, `occurred_at = NOW()`, `unit_cost_at_time` =
current catalog cost. Import/seed real inventory data after Google Sheets cleanup.

---

## Entry 007

**Date:** 2026-06-02
**Updated by:** Claude
**Phase:** Phase 1 Inventory — Post-Migration Architecture Review
**Session type:** Architecture Review (mid-build trigger: inventory balance + status semantics)

### What Was Reviewed
Reviewed the applied Phase 1 migration (Entries 003–006) against the Architecture Lock
Document. Focus: ledger_sequence / approved-only balance behavior and the
`transaction_items.status` semantics flagged for Claude review in Entry 002.

### Findings
**Technical implementation — approved, no changes needed.** ledger_sequence is the correct
deterministic ordering mechanism. occurred_at separated from created_at is correct and was
a good addition not in the v2.3 plan; backdated-entry handling via
`occurred_at DESC, ledger_sequence DESC` is sound. pg_advisory_xact_lock per bin with
sorted/deduped lock order is proper concurrency safety. Approved-only balances and
physical-count-correction-as-baseline logic fix the original additive bug.

**Architecture decision resolved — status semantics.** The shift of
`transaction_items.status` from "job-cost approval" (original Section 14) to "physical
movement approval" (implemented) is CORRECT. Physical movement and accounting approval are
genuinely separate events with different reviewers and timing. They cannot share one field.

### Decisions Made This Session
- `transaction_items.status` = physical movement approval only. Approved by Ryan.
- Job-cost/accounting approval = separate mechanism, reserved for Financials phase. When a
  transaction has `destination_type = 'job'`, it will generate a separate job-cost entry
  with its own approval lifecycle. Not built now.
- Lock document updated: Section 14 rewritten as "Two Distinct Approval Concepts"
  (14a/14b/14c). Constitutional rules 15 and 16 added.

### Lock Document Changes
- Section 14 "Pending Job Cost Review" → "Two Distinct Approval Concepts" with subsections
  for physical movement (14a), reserved job-cost approval (14b), app job-cost scope (14c).
- Constitutional rule 15: physical movement approval and accounting approval never merged.
- Constitutional rule 16: only approved rows affect balances; ordering uses occurred_at with
  ledger_sequence tie-breaker, never UUID order.

### What Codex Needs to Know
Migration as applied is architecturally sound — no rework. `transaction_items.status` is
physical-movement-only; do not use it for accounting meaning when building cart checkout.
Cart checkout sets `status = 'approved'`, `occurred_at = NOW()`, `unit_cost_at_time` =
catalog cost at issue/return. Do not build the job-cost approval mechanism yet.

### Next Steps (in order)
1. Codex builds inventory cart checkout/finalization (unblocked)
2. Resolve Google Sheets cleanup before import
3. Import/seed real inventory master data into v2 Supabase
4. Wire app to v2 Supabase project
5. Update HANDOFF.md after cart checkout is built

### Architecture Drift Warnings
CARRIED FORWARD (now resolved): "Do not merge physical movement and accounting approval" —
resolved this session, promoted to constitutional rule 15. Closed.
ACTIVE: When the Financials phase builds job-cost approval, it must use a separate
field/table — never repurpose `transaction_items.status`.

---

## Entry 008

**Date:** 2026-06-02
**Updated by:** ChatGPT
**Phase:** App Bootstrap / Netlify Deployment Recovery
**Session type:** Front-end wiring, repo repair, deployment troubleshooting
**Note:** This entry was originally mislabeled "Entry 007." Corrected to 008.

### What Was Completed
Confirmed working repo `RNSolutions-electrical/Northgate-HQ-v2.0`. Confirmed Phase 1
migration already applied and verified in v2 Supabase. Began front-end wiring after finding
app folders existed but several core files were missing/empty/incorrect. Fixed Netlify build
failures in sequence: missing root `package.json`; invalid `vite.config.js` (contained
package JSON instead of Vite config); missing `src/App.jsx`; missing
`src/hooks/usePermissions.js`; Netlify serving old 404 deploy instead of latest successful
deploy. Confirmed preview deploy worked. Published to production. Confirmed production URL
works: `https://northgate-hq-v2.netlify.app/`.

### Files Confirmed / Created / Repaired
`package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`,
`src/services/supabaseClient.js`, `src/hooks/usePermissions.js`, `public/_redirects`.
App shell includes Clerk provider, signed-out landing, sign-in button, signed-in dashboard
shell, UserButton, temporary permissions hook, Supabase client init check.

### Current App State
App builds and deploys successfully. UI is a temporary starter shell, NOT the final
interface. Current dashboard cards: Dashboard Shell, Clerk Auth, Supabase Client. The
temporary permissions hook hardcodes role `Developer`, division `Admin`,
`canAccessDeveloper: true`, `canManageInventory: true`, `canViewFinancials: true`. Temporary
only — must be replaced with server-authoritative permissions.

### Important Netlify Notes
Production: `https://northgate-hq-v2.netlify.app/`. The production 404 was caused by the
successful deploy not being published, not by repo code. Settings: build `npm run build`,
publish `dist`, production branch `main`.

### Important Warnings
Do not treat current `usePermissions.js` as real security — temporary scaffold only.
Permission enforcement must become server-authoritative per the lock document. Do not build
inventory checkout until Clerk auth, Supabase connectivity, and app shell behavior are
confirmed in production. The app currently only proves the deployment shell works; it does
not yet prove DB reads/writes or Clerk-to-Supabase user mapping.

### Next Steps
Manual production test (landing, sign-in, dashboard, UserButton, Supabase card). Add a real
Supabase health/read test. Replace temporary permission scaffold with a proper
user/permission lookup. Add module layout/navigation shell. Begin Inventory module UI
(catalog read view, storage hierarchy browser, cart scaffold, checkout/finalization). Before
checkout/finalization, confirm with Claude that the status / physical-vs-accounting approval
separation is still aligned.

### Architecture Drift Warnings
Temporary front-end permissions hook is not compliant as a final permission system. Do not
allow client-side permission checks to become authoritative. Do not confuse successful
deployment with completed app functionality. Inventory checkout must create physical movement
rows with `status = 'approved'`, `occurred_at = NOW()`, `unit_cost_at_time` = current catalog cost.

---

## Entry 009 — ALIGNMENT / SYNC POINT

**Date:** 2026-06-03
**Updated by:** Claude
**Phase:** Cross-model sync before Inventory UI build
**Session type:** Reconciliation — single source of truth reset

> Purpose: get both models and Ryan on the same page before further building.
> If anything below conflicts with an earlier entry, THIS entry and the
> Architecture Lock Document win. Read this first.

### Entry Numbering Correction
Two entries were both labeled "Entry 007." Corrected: Entry 007 = Claude post-migration
review (2026-06-02). Entry 008 = ChatGPT app bootstrap (2026-06-02, was mislabeled 007).
Entry 009 = this sync point. Going forward: read the last entry number and increment, never reuse.

### Current State of Truth (confirmed facts)
**Infrastructure:** Repo `RNSolutions-electrical/Northgate-HQ-v2.0`; v2 Supabase
`northgate-hq-v2.0 / keogysnoukbendfkfjcn`; v1 backup `northgate-hq / qpbuzinkjbjbvcdwvdfu`
(untouched); production `https://northgate-hq-v2.netlify.app/`; Netlify build `npm run build`,
publish `dist`, branch `main`.
**Database:** Phase 1 Inventory migration APPLIED and verified in v2 only. Version
`20260531173603` / `phase_1_inventory`. Balance behavior tested and passed.
**App:** Builds and deploys. Current UI is a temporary starter shell, NOT final. Clerk
provider, signed-out landing, sign-in, dashboard shell, UserButton, Supabase init check working.

### What Is LOCKED (do not revisit without lock document update)
1. `transaction_items.status` = physical movement approval ONLY (Section 14a + Rule 15).
2. Job-cost/accounting approval = separate mechanism, reserved for Financials phase (14b).
3. Only `approved` rows affect `inventory_balances`; ordering uses occurred_at +
   ledger_sequence, never UUID order (Rule 16).
4. Cart checkout sets `status='approved'`, `occurred_at=NOW()`, `unit_cost_at_time` = catalog cost.
5. All 14 original constitutional rules plus rules 15, 16, 17 are in force.
6. The status-semantics review ChatGPT requested in Entry 008 step 6 is ALREADY DONE
   (Entry 007). Does not need repeating.

### What Is TEMPORARY and MUST Be Replaced
The `usePermissions.js` scaffold hardcodes Developer / Admin / full access. Violates
Constitutional Rule 4. Acceptable only as deployment bootstrap. Corrections required:
- The real server-authoritative hook already exists from Phase 1 (reads user_permissions by
  Clerk ID, caches, auto-creates row with safe defaults). RESTORE it — do not write a new system.
- Until restored, flip the default from full-access to LEAST privilege. Full access is the
  most dangerous possible default.

### Required Action — Documents Out of Sync
Claude's Entry 007 updated the lock document (Section 14 rewrite, rules 15-16; rule 17 added
in this session). If the repo's `docs/ARCHITECTURE.md` lacks these, push the updated version
now. Both models must read the same lock document.
Checklist:
- [ ] Updated ARCHITECTURE.md (Section 14 rewrite + rules 15, 16, 17) in repo
- [ ] HANDOFF.md entries renumbered (007 Claude, 008 ChatGPT, 009 this)
- [ ] This full HANDOFF.md committed to repo

### Agreed Next Steps (in order — hard gate noted)
1. Push updated ARCHITECTURE.md and this reconciled HANDOFF.md to repo.
2. Manual production smoke test: landing → sign-in → dashboard → UserButton → Supabase init.
3. Add a real Supabase health/read test (harmless table or view).
4. **HARD GATE:** Restore the real server-authoritative `usePermissions` hook and confirm
   Clerk → Supabase user mapping. Nothing that writes to the DB is built before this.
   Read-only catalog view MAY proceed in parallel.
5. Add module layout/navigation shell.
6. Inventory module UI: (a) catalog read view — OK now, read only; (b) storage hierarchy
   browser; (c) cart scaffold; (d) checkout/finalization — ONLY after step 4 clears.
7. Resolve Google Sheets cleanup before real data import (blank field_name rows; cost code
   `16,050.00` → `16050`).
8. Update HANDOFF.md after each step.

### Open Questions / Concerns
None blocking once documents are synced and the permission hook is restored.

### Architecture Drift Warnings (active)
- ACTIVE: Temporary usePermissions scaffold hardcodes full access. Restore to
  server-authoritative before any write-capable UI. Default must be least-privilege if it remains.
- ACTIVE (Financials phase): Job-cost approval must use a separate field/table — never
  repurpose `transaction_items.status`.
- CLOSED: "Don't merge physical movement and accounting approval" — resolved Entry 007,
  promoted to Constitutional Rule 15.

---

## Entry 010

**Date:** 2026-06-08
**Updated by:** Claude
**Phase:** Phase 1 (Inventory) — concurrent UI/platform architecture decision
**Session type:** Advisory / architecture decision — mobile & UI strategy

### Context
Ryan asked, in general terms, about (a) offline-capable apps, (b) shipping native
apps to the app stores, and (c) the React Native vs Flutter vs Capacitor trade-offs.
Northgate HQ itself was confirmed to remain ONLINE-based — Supabase is the live
source of truth; HQ is not an offline-first design. Out of that discussion Ryan made
two forward-looking UI/platform decisions for Northgate HQ.

### Decisions Made This Session
- **Responsive web UI is a foundational build requirement.** The Northgate HQ web app
  must be built mobile/tablet-responsive from the first screen, not desktop-only.
  Rationale: the HQ UI has not been built yet, so designing responsiveness in now
  avoids costly retrofit later (consistent with the "design before build" principle).
  — Approved: Ryan.
- **React Native companion app added as a reserved future phase.** A native,
  app-store-distributed companion app focused on field-inventory workflows (QR
  scanning, stock/vehicle lookups, on-site job-usage logging, push notifications),
  reading from and writing to the same Supabase source of truth as the web app. Built
  only after core HQ is stable. — Approved: Ryan.

### Why the Companion App Is Low Architectural Risk
Supabase already exposes the API and enforces auth/RLS, so the companion app is almost
purely a new front-end against the existing back-end. No second database, no sync
layer, no separate server. Server-authoritative permissions (Constitutional Rule 4)
continue to apply to the second client. This fits the Scope Control Rule (Section 28):
preserve the clean path now, build later.

### Lock Document Changes
- Bumped to **v2.2**.
- Section 26 "Mobile and Desktop Behavior" expanded: added Ryan's Decision on
  responsive-from-the-start as a foundational requirement (explicitly distinct from
  the user-customizable layout presets in Section 27, Phase 4), and added a "Future
  Phase — React Native Companion App (reserved, not now)" subsection documenting the
  companion app's architecture and constraints.
- No constitutional rules added. The responsive baseline is documented as a Section 26
  build requirement. Ryan may elevate it to a numbered Constitutional Rule (Rule 18) in
  a future update if he wants it carried with that weight.

### Schema Changes
None this session.

### What Codex Needs to Know
- When the HQ UI is built, build it responsive from the start — phone/tablet layouts
  are a foundational requirement, NOT a Phase 4 add-on. Basic responsiveness is not the
  same as the customizable layout presets in Section 27, Phase 4.
- Do not start the React Native companion app yet. It is a reserved future phase.
- The companion app, when built, must use the same Supabase project and the same
  server-authoritative permission checks — never a separate data store or a permission
  bypass.

### What Claude Needs to Know
- Mobile/UI strategy is now documented in Section 26 (v2.2). Future reviews touching UI
  build order should confirm responsiveness is being designed in from the start.
- Verified this session: the live repo's `docs/ARCHITECTURE.md` already contains the
  Section 14 rewrite (Two Distinct Approval Concepts, 14a/14b/14c) and Constitutional
  Rules 15, 16, 17. The Entry 009 checklist item "Updated ARCHITECTURE.md in repo" is
  therefore satisfied.

### Next Steps (in order)
1. Push this v2.2 ARCHITECTURE.md and this HANDOFF.md (Entry 010) to the repo.
2. HARD GATE unchanged (from Entry 009): restore the server-authoritative
   `usePermissions` hook and confirm Clerk → Supabase user mapping before any
   write-capable UI. Read-only catalog view may proceed in parallel.
3. Continue the Inventory module per the Section 29 build order.
4. Resolve Google Sheets cleanup before real data import (blank field_name rows; cost
   code `16,050.00` → `16050`).
5. Update HANDOFF.md after each step.

### Open Questions / Concerns
- Does Ryan want the responsive-from-the-start requirement elevated to a numbered
  Constitutional Rule (Rule 18), or is its placement in Section 26 sufficient? Left in
  Section 26 pending Ryan's call.

### Architecture Drift Warnings
- CARRIED FORWARD (active): Temporary `usePermissions` scaffold hardcodes full access.
  Restore to server-authoritative before any write-capable UI; default must be
  least-privilege if it remains. (From Entry 009.)
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate
  field/table — never repurpose `transaction_items.status`. (From Entry 009.)
- NEW (advisory, future companion-app phase): When/if the React Native companion app is
  built, it must not become a path around server-authoritative permissions and must not
  introduce a second source of truth. Carry forward until the companion app phase begins.

---

## Entry 011

**Date:** 2026-06-08
**Updated by:** Claude
**Phase:** Phase 1 (Inventory) — Architecture Lock Document maintenance
**Session type:** Constitutional rule addition / lock document update

### Context
Ryan reviewed the open question carried forward from Entry 010: whether the
responsive-from-the-start requirement should be elevated from a Section 26 build
directive to a numbered Constitutional Rule. After Claude explained the practical
difference (Section 26 placement is a strong directive but does not trigger the
same mandatory Claude review that a Constitutional Rule violation does), Ryan
approved elevation.

### Decisions Made This Session
- **Constitutional Rule 18 added:** "Responsive UI is a Foundational Build
  Requirement." Any UI component, layout, or module built desktop-only without
  phone/tablet responsiveness designed in from the start is a constitutional
  violation and triggers a mandatory Claude review before proceeding. This rule
  governs basic responsive layout and is explicitly distinct from the
  user-customizable layout presets in Section 27 (Phase 4). — Approved: Ryan.

### Lock Document Changes
- Bumped to **v2.3**.
- Constitutional Rule 18 added to Section 24 (after Rule 17).
- Section 26 Ryan's Decision note updated to cross-reference Rule 18 and note
  the v2.3 elevation.
- Version header updated to v2.3.
- Repository structure reference updated to v2.3.

### Schema Changes
None this session.

### What Codex Needs to Know
- Responsive-from-the-start is now Constitutional Rule 18 — the same weight as
  server-authoritative permissions (Rule 4) or transaction-derived balances (Rule 1).
  It is not a suggestion. Every UI screen, component, and module must be built with
  phone/tablet viewports from the moment it is first written. No desktop-first
  builds with a plan to "make it responsive later."
- This does NOT mean the Phase 4 layout customization presets (Section 27) should
  be built now. Basic responsiveness (columns stack, nav collapses, controls are
  touch-friendly) is the baseline Rule 18 requires.

### What Claude Needs to Know
- Rule 18 is now in force. Future mid-build reviews that touch any UI module should
  confirm responsiveness is being designed in, not deferred.
- The open question from Entry 010 is now closed.

### Next Steps (in order — unchanged from Entry 010)
1. Push this v2.3 ARCHITECTURE.md and this HANDOFF.md (Entry 011) to the repo.
2. HARD GATE unchanged (from Entry 009): restore the server-authoritative
   `usePermissions` hook and confirm Clerk → Supabase user mapping before any
   write-capable UI. Read-only catalog view may proceed in parallel.
3. Continue the Inventory module per the Section 29 build order.
4. Resolve Google Sheets cleanup before real data import (blank field_name rows;
   cost code `16,050.00` → `16050`).
5. Update HANDOFF.md after each step.

### Open Questions / Concerns
None. The Entry 010 open question is resolved and closed.

### Architecture Drift Warnings
- CARRIED FORWARD (active): Temporary `usePermissions` scaffold hardcodes full
  access. Restore to server-authoritative before any write-capable UI; default
  must be least-privilege if it remains. (From Entry 009.)
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a
  separate field/table — never repurpose `transaction_items.status`.
  (From Entry 009.)
- CARRIED FORWARD (advisory, future companion-app phase): When/if the React
  Native companion app is built, it must not become a path around
  server-authoritative permissions and must not introduce a second source of
  truth. (From Entry 010.)

---

## Entry 012

**Date:** 2026-06-08
**Updated by:** ChatGPT
**Phase:** Phase 1 (Inventory) — Permissions hard gate repair
**Session type:** Implementation / security alignment

### What Was Completed
- Replaced the temporary `src/hooks/usePermissions.js` scaffold that hardcoded Developer/Admin/full-access permissions.
- Added authenticated Supabase client support in `src/services/supabaseClient.js` so the app can send a Clerk-generated Supabase JWT to Supabase.
- Added `supabase/migrations/202606080001_user_permissions.sql` to create the `user_permissions` table, default role-permission mapping function, and `get_or_create_user_permissions()` RPC.
- Updated the dashboard permission card in `src/App.jsx` so it now displays server-backed permission source, role, and division instead of labeling the role as temporary.
- Tightened the permission RPC so the requested Clerk user ID must match `auth.jwt() ->> 'sub'`; this prevents one authenticated user from requesting another user's permissions.
- Removed front-end role-default expansion from `usePermissions`; the hook now uses only server-returned `effective_permissions` and fails closed to deny-all/default-deny if lookup fails.

### Decisions Made This Session
- Permission defaults are calculated in Supabase, not in the React hook, to preserve the server-authoritative permissions rule. — Approved by Architecture Lock Document Rule 4.
- Missing, failed, signed-out, or unreadable permission state defaults to least privilege / deny-all. — Approved by Architecture Lock Document Rule 4 and Entry 009 hard gate.
- The UI may display permission state for transparency, but those displayed values are not treated as security enforcement. — Approved by Architecture Lock Document Rule 4.

### Schema Changes
- Added `user_permissions` table with Clerk user ID, display name, email, role, division, JSONB permission overrides, active flag, and timestamps.
- Added `default_permissions_for_role(role)` function to calculate canonical role defaults server-side.
- Added `get_or_create_user_permissions(p_clerk_user_id, p_display_name, p_email)` RPC with `SECURITY DEFINER` and a JWT subject match check.
- Enabled RLS on `user_permissions`.
- Added self-select RLS policy for matching Clerk subject.
- Added deny-all client insert/update/delete policies so direct client mutation is blocked.

### What Codex Needs to Know
- The temporary full-access permissions scaffold is removed.
- The hard gate is partially cleared in code, but final clearance requires applying the migration to v2 Supabase and confirming Clerk's `supabase` JWT template returns a token whose `sub` matches the Clerk user ID.
- Do not build write-capable UI until the migration has been applied and a production sign-in confirms the dashboard permission source is `server`, not `error-default-deny`.
- Current first-time users are auto-created as role `User` with least-privilege effective permissions. Ryan's/admin user's row must be manually elevated in Supabase or through a future controlled Dev Console/admin workflow before protected modules unlock.

### What Claude Needs to Know
- Permission resolution has moved to a server-backed RPC and no longer relies on client-side hardcoded Developer/Admin access.
- This implementation is intended to satisfy Constitutional Rule 4, but it depends on Supabase JWT/Clerk configuration being correct in the live environment.
- Any future role/permission changes should be made server-side or through controlled admin/Dev Console workflows, not by adding role-default expansion back into the React hook.

### Next Steps (in order)
1. Apply `supabase/migrations/202606080001_user_permissions.sql` to the v2 Supabase project.
2. Confirm Clerk has a `supabase` JWT template configured and that `auth.jwt() ->> 'sub'` matches the signed-in Clerk user ID.
3. Sign into production and confirm the dashboard permission card shows `Source: server`.
4. Elevate Ryan/admin account in `user_permissions` to the correct role/division using a controlled Supabase/admin step until Dev Console user management exists.
5. Only after the above checks pass, proceed with write-capable inventory UI.

### Open Questions / Concerns
- The GitHub connector could not run the app build or apply the Supabase migration; those steps still need to be executed/verified in the project environment.
- Clerk's `supabase` JWT template must exist. If it does not, the hook will fail closed and show `error-default-deny`.

### Architecture Drift Warnings
- UPDATED: Temporary `usePermissions` scaffold hardcoded full access — code-level scaffold removed, but carry forward until migration is applied and live Clerk → Supabase permission lookup is verified.
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate field/table — never repurpose `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): When/if the React Native companion app is built, it must not become a path around server-authoritative permissions and must not introduce a second source of truth.

---

## Entry 013

**Date:** 2026-06-09
**Updated by:** Claude
**Phase:** Phase 1 (Inventory) — Pre-build architecture review: write-capable inventory UI
**Session type:** Architecture review / build sequence confirmation

### Context
Ryan confirmed the permissions hard gate work from Entry 012 is complete (code side). The team is now proceeding with the write-capable inventory UI build. Ryan proposed the following build sequence and Claude reviewed it for architectural alignment before handoff to ChatGPT.

### Build Sequence Confirmed (in order)
1. Read-only catalog confirmation — verify catalog view works against live v2 Supabase; confirm permission card shows `Source: server` (hard gate live-verification step).
2. Storage hierarchy browser — read-only unit → shelf → bay → bin browser; must be responsive from first screen (Constitutional Rule 18).
3. Cart scaffold — display-only cart UI; no DB writes until Step 4.
4. Add-to-cart writes — first real writes; hard gate must be confirmed live in production before this step begins.
5. Checkout/finalization writes — most locked rules apply; see non-negotiables below.

### Non-Negotiable Rules for Checkout/Finalization (Constitutional, do not deviate)
- `transaction_items.status = 'approved'` = physical movement only. Never job-cost or accounting approval. (Rule 15)
- `occurred_at = NOW()` stamped at checkout — separate from `created_at`. (Rule 16)
- `unit_cost_at_time` = current catalog `price_per_unit` at moment of issue. Never back-calculated after the fact. (Rule 9)
- Per-line-item `destination_type` and `destination_id` on `transaction_items` from day one — not only at transaction header. (Rule 11)
- Only `approved` rows trigger `update_inventory_balance()`. `pending` and `rejected` rows stay in log, never affect `quantity_on_hand`. (Rule 16)
- Balance ordering: `occurred_at DESC, ledger_sequence DESC`. Never UUID order.

### Commonly Missed Detail — Vehicle Snapshot at Cart Open (Section 11, locked)
When a cart row is created, the user's current active vehicle assignment must be captured as a snapshot on the cart at that moment. It must NOT be re-queried at checkout. The vehicle recorded is the one assigned at cart-open time, regardless of any subsequent vehicle reassignment. This is locked in Section 11 and is expensive to retrofit if skipped.

### Process Clarification Approved This Session
Going forward, whenever either model produces an updated HANDOFF.md or ARCHITECTURE.md, the deliverable must be the **complete file** — all prior entries intact, new content appended. Ryan downloads the complete file, verifies it, uploads it to the repo, and retains a local backup. Partial diffs or "just the new section" outputs are not acceptable.

### What Codex Needs to Know
- Hard gate is code-complete (Entry 012) but not yet live-verified. Step 1 of the build sequence IS the live verification. If production shows `error-default-deny`, stop and resolve Clerk JWT template before proceeding.
- Vehicle snapshot at cart-open is a locked Section 11 requirement — build it into the first cart write, not as a follow-up.
- Every screen in this sequence must be responsive from the moment it is first written (Constitutional Rule 18).
- Complete HANDOFF.md and ARCHITECTURE.md (all entries, full files) must be produced at the end of each session.

### What Claude Needs to Know
- Build sequence reviewed and approved this session.
- Process correction made: complete files required on every update.
- Hard gate live-verification is Step 1 of the build sequence — it has not yet been confirmed in production.

### Next Steps (in order)
1. ChatGPT executes the build sequence (Steps 1–5 above).
2. Apply `supabase/migrations/202606080001_user_permissions.sql` to v2 Supabase if not yet done (prerequisite for Step 1 live-verification).
3. Elevate Ryan/admin row in `user_permissions` after migration is applied.
4. Update complete HANDOFF.md after each build step.

### Open Questions / Concerns
None blocking.

### Architecture Drift Warnings
- CARRIED FORWARD (active): Hard gate code-complete but not live-verified. Confirm `Source: server` in production before write-capable UI (Step 4+).
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate field/table — never repurpose `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 014

**Date:** 2026-06-09
**Updated by:** ChatGPT
**Phase:** Phase 1 (Inventory) — Permissions gate cleared, read-only Inventory UI, and staged seed/import
**Session type:** Live verification / implementation / Supabase seed / drift repair

### What Was Completed
- Read the uploaded canonical `ARCHITECTURE.md` v2.3 and `HANDOFF.md` baseline before proceeding.
- Confirmed the build should continue under the Entry 013 sequence: read-only confirmation, storage hierarchy browser, display-only cart scaffold, add-to-cart writes, checkout/finalization writes.
- Confirmed the live permissions hard gate in production after prior Entry 012 work:
  - production dashboard showed `Source: server` after RPC/JWT troubleshooting;
  - Ryan/admin account was elevated in `user_permissions` to `Developer / Admin`;
  - one active `Developer / Admin` permission row exists in v2 Supabase.
- Added a responsive read-only Inventory confirmation UI to production code.
- Added `src/hooks/useInventoryReadModel.js` for authenticated, read-only Supabase inventory counts and preview reads.
- Updated `src/App.jsx` to show:
  - server permission card;
  - live inventory counts;
  - catalog preview;
  - storage browser preview;
  - empty states when live data is absent.
- Added/updated `src/styles.css` with responsive layout rules from the first implementation pass, in alignment with Constitutional Rule 18.
- Updated `src/main.jsx` to load the stylesheet.
- Confirmed before seeding that the live v2 inventory tables were empty.
- Seeded existing Phase 1 inventory-safe tables from the Northgate HQ Master Data Workbook, using controlled staged data:
  - `cost_codes`: 14 rows
  - `items`: 29 rows
  - `vehicles`: 1 row
  - `storage_units`: 2 rows
  - `shelves`: 2 rows
  - `bays`: 3 rows
  - `bins`: 9 rows
  - `bin_items`: 9 rows
- Created the initial quantity for `A111 / COND-EMT-050` through an approved `physical_count_correction` transaction item, not by manually setting `inventory_balances`.
- Verified seed results after import:
  - `inventory_transactions`: 1
  - `transaction_items`: 1
  - `inventory_balances`: 1
  - `grand_master_inventory_view`: 9 rows
  - verified balance: `A111 / COND-EMT-050 / quantity 25`.
- Intentionally did **not** import Employees or Assemblies because the current v2 schema does not yet expose destination tables for them.
- Detected a regression/drift where production again showed `Source: error-default-deny` after seed work.
- Checked Supabase logs and found the same permission RPC bug: `column reference "clerk_user_id" is ambiguous`.
- Reapplied the corrected `get_or_create_user_permissions(...)` RPC with qualified aliases and `ON CONFLICT ON CONSTRAINT user_permissions_clerk_user_id_key`.
- Ryan confirmed the app looked much better after the RPC fix, and the inventory panel showed live seeded data.

### Decisions Made This Session
- Proceeded with a controlled staged seed rather than a full workbook import because the Drive export path could not be reliably decoded through the connector and because not all workbook domains have destination tables yet. — Approved by implementation safety and source-of-truth rules.
- Initial stock quantity was seeded through an approved physical count correction transaction instead of direct balance manipulation. — Required by Constitutional Rule 1 and Rule 16.
- Employees and Assemblies were deferred instead of forced into incorrect tables. — Required by the no-duplicate-source-of-truth rule and module-boundary discipline.
- The next build step remains display-only cart scaffold. No cart writes should begin until Ryan explicitly resumes that step. — Approved by Entry 013 build sequence.

### Schema Changes
- No new application tables were added this session.
- Attempted import-tracking table migration was blocked by the connector safety layer and was not applied.
- Existing live RPC `get_or_create_user_permissions(...)` was replaced/reapplied to fix the ambiguous `clerk_user_id` reference.
- Data was inserted into existing Phase 1 tables only.

### Code / File Changes
- `src/hooks/useInventoryReadModel.js` — added authenticated read-only inventory read model.
- `src/App.jsx` — replaced the starter dashboard content with responsive read-only Inventory confirmation and storage browser UI.
- `src/styles.css` — updated responsive application styling.
- `src/main.jsx` — imported `styles.css`.
- Prior repo migration file `supabase/migrations/202606090002_fix_user_permissions_rpc_ambiguous_column.sql` exists to represent the RPC ambiguity fix in repository history.

### Data Seeded / Imported
- `cost_codes`: 14
- `items`: 29
- `vehicles`: 1
- `storage_units`: 2
- `shelves`: 2
- `bays`: 3
- `bins`: 9
- `bin_items`: 9
- `inventory_transactions`: 1
- `transaction_items`: 1
- `inventory_balances`: 1
- `grand_master_inventory_view`: 9 rows

### What Codex Needs to Know
- Read-only inventory confirmation is now implemented and live.
- Staged seed data exists in v2 Supabase and should be treated as real testable seed data, not throwaway UI mock data.
- The UI has not created any carts, cart items, checkout rows, or user-driven inventory movement.
- The only quantity-changing row created this session was an approved physical count correction for initial seed balance.
- The next step is the display-only cart scaffold.
- The first real cart write must snapshot the user's current active vehicle assignment at cart-open time and must not re-query that vehicle at checkout.
- Do not bypass the server-backed `usePermissions` hook or add client-side role defaults.
- If `Source: error-default-deny` appears again, check the `get_or_create_user_permissions(...)` RPC first for the `clerk_user_id` ambiguity regression.

### What Claude Needs to Know
- Entry 013's hard gate warning is now resolved: production reached `Source: server`, and Ryan/admin is `Developer / Admin`.
- Read-only Inventory UI and staged seed/import were completed without crossing into write-capable cart or checkout UI.
- The seed preserved the transaction-derived balance rule by using an approved physical count correction instead of manually setting balance values.
- No architecture rule was intentionally changed, but Section 29 of `ARCHITECTURE.md` was updated to reflect current build state; document version is bumped to v2.4 for synchronization.
- Employees and Assemblies remain deferred because destination tables are not present in the current v2 schema.

### Next Steps (in order)
1. Let Ryan rest / pause development.
2. On resume, confirm production still shows `Source: server` and live inventory counts.
3. Build display-only cart scaffold — no writes yet.
4. Before first cart write, confirm active vehicle assignment lookup/snapshot design.
5. Implement first cart row write only after the vehicle snapshot rule is satisfied.
6. Add-to-cart writes.
7. Checkout/finalization writes only after cart writes are verified and all locked transaction rules are explicitly checked.
8. Plan schema/import path for Employees and Assemblies before importing those workbook tabs.

### Open Questions / Concerns
- Need a durable import tracking/audit mechanism for future bulk imports; attempted table creation was blocked by connector safety, so this was not added.
- Need to decide whether staged seed data should be expanded to a fuller workbook import after proper import tooling exists.
- Need destination tables for Employees and Assemblies before those workbook tabs can be imported safely.
- Need to ensure the RPC ambiguity fix remains durable across future migrations/deploys; repo migration file exists, but live drift reappeared once and should be watched.

### Architecture Drift Warnings
- CLOSED: Entry 013 hard gate warning — live production permission source reached `server`, and Ryan/admin row is `Developer / Admin`.
- CLOSED: Temporary full-access `usePermissions` scaffold — replaced with server-backed hook and live verified.
- CARRIED FORWARD (active, next implementation step): First cart write must snapshot active vehicle assignment at cart creation, not checkout.
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate field/table — never repurpose `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 015

**Date:** 2026-06-09
**Updated by:** ChatGPT
**Phase:** Phase 1 (Inventory) — Cart-open security gate and first controlled cart write
**Session type:** Implementation / security alignment / pre-Claude review checkpoint

### What Was Completed
- Stopped before add-to-cart implementation to inspect whether the existing cart schema could support the Section 11 vehicle snapshot requirement.
- Confirmed the current cart tables are named `inventory_carts` and `inventory_cart_items`, not `carts` / `cart_items`.
- Confirmed `inventory_carts.active_vehicle_id` exists and can hold the cart-open vehicle snapshot.
- Confirmed no user-to-vehicle assignment table currently exists in the v2 schema, so the first cart-open implementation snapshots `NULL` for `active_vehicle_id` when no active assignment source is available.
- Found a Rule 4 security issue before implementing cart writes: `inventory_carts` and `inventory_cart_items` did not have RLS enabled and had no policies.
- Applied live Supabase migration `secure_inventory_cart_open_rpc` to:
  - enable RLS on `inventory_carts`;
  - enable RLS on `inventory_cart_items`;
  - allow users to select only their own carts and cart items;
  - deny direct client insert/update/delete on both cart tables;
  - add controlled server RPC `open_inventory_cart(p_user_name, p_active_vehicle_id)`.
- Added matching repo migration file:
  - `supabase/migrations/202606090003_secure_inventory_cart_open_rpc.sql`
- Added app hook:
  - `src/hooks/useInventoryCart.js`
- Updated `src/App.jsx` to wire the Cart Open tab to the controlled `open_inventory_cart` RPC.
- Updated UI build marker to `Inventory cart open build: 2026-06-09.4`.
- Preserved the boundary that add-to-cart, cart-item writes, checkout, and inventory movement remain disabled.

### Decisions Made This Session
- Do not allow direct client mutation of cart tables. Cart writes must go through controlled server functions/RPCs with Clerk JWT validation. — Required by Architecture Rule 4.
- The first cart write may create or return an active cart only; it must not create cart item rows, reserve stock, move inventory, or write `transaction_items`. — Required by Entry 013 build sequence and inventory transaction rules.
- Because no active user-to-vehicle assignment source exists yet, the first cart-open RPC passes and stores `NULL` for `active_vehicle_id`, and the UI explicitly displays “No active vehicle assignment found.” — Implementation decision pending Claude review for whether a proper assignment table should be created before add-to-cart.
- Add-to-cart implementation is paused pending Claude review of this checkpoint. — Ryan requested document update for Claude before proceeding.

### Schema Changes
- RLS enabled on `inventory_carts`.
- RLS enabled on `inventory_cart_items`.
- Added self-select policies for authenticated users to read only their own cart/cart-item records.
- Added deny-all direct client insert/update/delete policies for both cart tables.
- Added `open_inventory_cart(p_user_name TEXT DEFAULT NULL, p_active_vehicle_id UUID DEFAULT NULL)` RPC as `SECURITY DEFINER`.
- `open_inventory_cart` validates `auth.jwt() ->> 'sub'` and uses that subject as the authoritative `user_id`.
- `open_inventory_cart` creates a cart with:
  - `user_id` from JWT subject;
  - `user_name` from provided display name or JWT subject fallback;
  - `active_vehicle_id` from provided snapshot value, currently `NULL` from the app because no active assignment source exists;
  - `status = 'active'`;
  - `expires_at = NOW() + INTERVAL '24 hours'`.
- `open_inventory_cart` returns an existing non-expired active cart for the same user instead of creating duplicates.

### Code / File Changes
- `supabase/migrations/202606090003_secure_inventory_cart_open_rpc.sql` — added RLS, policies, and controlled cart-open RPC.
- `src/hooks/useInventoryCart.js` — added hook that calls `open_inventory_cart` with the Clerk/Supabase JWT.
- `src/App.jsx` — wired Cart Open tab to the RPC and updated UI text to reflect the first controlled cart write.
- `src/styles.css` — already contained the responsive cart scaffold styling from the prior step; no additional style change was required for the cart-open hook beyond existing classes.

### What Codex Needs to Know
- The first controlled cart write is now implemented as cart-open only.
- Do not implement add-to-cart until Claude reviews whether `NULL` vehicle snapshot handling is acceptable without an active vehicle assignment table.
- Direct table mutation for carts is now intentionally blocked by RLS. Future cart mutations should use controlled RPCs.
- Add-to-cart should be implemented as a separate controlled RPC with server-side checks for:
  - authenticated Clerk subject;
  - active cart owned by the signed-in user;
  - valid `bin_item_id` and `item_id` relationship;
  - quantity > 0;
  - permission to perform inventory transactions;
  - no inventory balance movement until checkout/finalization.
- Checkout/finalization remains untouched and must still follow all locked rules: `status = 'approved'`, `occurred_at = NOW()`, `unit_cost_at_time` snapshot, per-line destination fields, and approved rows only affecting balances.

### What Claude Needs to Know
- A pre-write security issue was found: cart tables had no RLS. This was fixed before the first cart write.
- The implemented RPC satisfies the server-authoritative direction by using the Clerk JWT subject and blocking direct client cart mutation.
- The schema has `inventory_carts.active_vehicle_id`, so the cart-open snapshot field exists.
- The schema does **not** yet have a user/employee active vehicle assignment table. The app currently passes `NULL` for `p_active_vehicle_id` and clearly displays that no active vehicle assignment was found.
- Claude should review whether it is acceptable to proceed to add-to-cart with cart-open snapshots allowed to be `NULL`, or whether the employee/user active vehicle assignment model should be designed before add-to-cart.
- No cart items, inventory movements, or checkout records were created in this step.

### Next Steps (in order)
1. Ryan sends updated `ARCHITECTURE.md` and `HANDOFF.md` to Claude.
2. Claude reviews the cart-open security/RLS implementation and the `NULL` active-vehicle snapshot fallback.
3. If Claude approves, verify in production:
   - `Source: server`;
   - Cart Open tab loads;
   - Open Cart succeeds;
   - cart status changes to active;
   - vehicle snapshot displays “No active vehicle assignment found.”
4. After review and verification, build controlled add-to-cart RPC.
5. Keep checkout/finalization disabled until add-to-cart writes are verified.

### Open Questions / Concerns
- Should an active user-to-vehicle assignment table be created before add-to-cart, or is `NULL` cart-open snapshot acceptable until the Employee/Vehicles module matures?
- Should `open_inventory_cart` also validate an inventory permission flag server-side through `user_permissions.effective_permissions`, or is the current JWT-user validation plus RLS sufficient for this early cart-open step? This should be reviewed before add-to-cart.
- Need future audit/import tracking for bulk imports; carried forward from Entry 014.
- Need destination tables/import path for Employees and Assemblies; carried forward from Entry 014.

### Architecture Drift Warnings
- CLOSED: Cart tables without RLS — fixed before first cart write by enabling RLS and blocking direct mutation.
- CARRIED FORWARD (active, Claude review requested): First cart write snapshots `NULL` for active vehicle because no active user-to-vehicle assignment source exists yet.
- CARRIED FORWARD (active, next implementation step): Add-to-cart must be a controlled server RPC; do not use direct client table mutation.
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate field/table — never repurpose `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 016

**Date:** 2026-06-09
**Updated by:** Claude
**Phase:** Phase 1 (Inventory) — Cart-open security review + vehicle snapshot model decision
**Session type:** Architecture review (mid-build trigger: permissions + cart write + vehicle snapshot)

### Context
Reviewed Entry 015 (ChatGPT cart-open implementation + RLS fix) at Ryan's request before add-to-cart. Two open questions were posed: (1) is a NULL active-vehicle snapshot acceptable without a user→vehicle assignment table; (2) should `open_inventory_cart` validate an inventory permission flag server-side. Ryan reviewed the findings and supplied the business model for vehicle stock.

### Review Findings — Entry 015 Implementation (approved as-is)
- RLS enabled on `inventory_carts` / `inventory_cart_items` before the first cart write — closes a real Rule 4 / Section 17 gap. Self-select read policies + deny-all client mutation + `SECURITY DEFINER` RPC is the correct pattern and matches the `user_permissions` approach (Entry 012).
- `open_inventory_cart` uses `auth.jwt() ->> 'sub'` as the authoritative `user_id` and ignores any client-claimed identity. Correct.
- Cart-open writes only a cart row — no cart items, no stock reservation, no `transaction_items`, no balance movement. Respects the Entry 013 build sequence and Rules 1/16.
- Return-existing-active-cart instead of duplicating. Sound.

### Decisions Made This Session (locked)
1. **Cart-open is gated by `can_inventory_transactions` server-side.** `open_inventory_cart` must read the caller's effective permission from `user_permissions.effective_permissions` (keyed off the JWT subject) and fail closed if false. JWT validation establishes identity (authentication); it does not establish authorization. Cart-open is a server write into an inventory table, so Rule 4 / Section 17 require the permission check at the DB/API layer. Required before add-to-cart. — Approved by Rule 4; Ryan.
2. **NULL active-vehicle snapshot is correct, not merely tolerated.** A NULL-vehicle cart is a legitimate, common state. Add-to-cart and checkout must treat NULL as valid, never an error. The user→vehicle assignment table is NOT a prerequisite for building add-to-cart. — Approved: Ryan.
3. **Vehicle snapshot is server-derived, never client-passed.** The `p_active_vehicle_id` client parameter on `open_inventory_cart` is removed/ignored; the snapshot is computed server-side. This mirrors the client-claimed-user_id fix already applied to the permission RPC. — Approved by Rule 4 / Section 11; Ryan.
4. **Vehicle stock-carrying model (Ryan's decision).** Whether a cart captures a vehicle snapshot is determined by a stock-carrying criterion at the vehicle level, attached to the user via an active assignment:
   - Vehicles carry an explicit stock-carrying flag (`vehicles.holds_stock BOOLEAN NOT NULL DEFAULT FALSE`), distinct from the existing classification (Residential/Commercial/Service/Other). Classification is the vehicle's role; the flag is whether it is tracked as a persistent inventory location.
   - A user→vehicle active-assignment link attaches a vehicle to a user.
   - Cart-open server logic: snapshot the user's assigned vehicle **iff** that vehicle `holds_stock = TRUE`; otherwise snapshot NULL.
   - Business rationale (Ryan): not all employees drive a company vehicle; of those who do, only vans that hold stock for extended periods (e.g., Miguel's and Fabian's) need inventory tracking. Transient stock carried in a truck used office→job (e.g., the operations manager's truck) is not tracked at the vehicle level; those carts snapshot NULL and simply record who handled the material.
   — Approved: Ryan.

### Distinction Preserved (no conflation)
The cart-open vehicle snapshot (the stock-carrying vehicle a user operates from) is distinct from the per-line checkout destination (`transaction_items.destination_type = 'vehicle'`). Section 11 already separates these; this decision does not merge them. Material transported on a vehicle for a job is still coded to the job, not the vehicle.

### Schema Changes (locked, to implement — none applied by Claude this session)
- `open_inventory_cart`: add server-side `can_inventory_transactions` check (fail closed); drop/ignore the `p_active_vehicle_id` client parameter.
- `vehicles.holds_stock BOOLEAN NOT NULL DEFAULT FALSE` — add now (schema-first), even though only a couple of vehicles will be flagged.
- User→vehicle active-assignment link (minimal table or column) — design locked; build before Miguel/Fabian van stock is tracked. Not required to build add-to-cart.

### Lock Document Changes
- ARCHITECTURE.md bumped to v2.5.
- Section 11 clarified: cart-open gated by `can_inventory_transactions` server-side; vehicle snapshot is server-derived (never client-passed) and is populated only when the user's active vehicle `holds_stock`; NULL-vehicle carts are valid and must not error.
- Section 16 expanded: added the `vehicles.holds_stock` flag and the user→vehicle active-assignment concept, with business rationale; classification must not be overloaded to mean "carries stock."
- No new constitutional rule added; both clarifications follow from existing Rule 4 and Section 11. Ryan may elevate "every inventory write is gated by the relevant permission flag server-side" to a numbered rule if he wants constitutional weight.

### What Codex Needs to Know
- Add the `can_inventory_transactions` server-side check to `open_inventory_cart` and remove the client `p_active_vehicle_id` parameter before building add-to-cart.
- Add-to-cart may proceed now; it does not touch the vehicle snapshot, and NULL-vehicle carts are valid. Build it as a controlled `SECURITY DEFINER` RPC with: authenticated Clerk subject; active cart owned by that subject; valid `bin_item_id` / `item_id` relationship; quantity > 0; `can_inventory_transactions` check; no balance movement until checkout.
- Vehicle snapshot logic, when built: server-side lookup of the user's active assignment; snapshot only if `holds_stock = TRUE`, else NULL. Never accept the vehicle ID from the client.
- Add `vehicles.holds_stock` now (schema-first). Build the user→vehicle assignment link before onboarding van stock for Miguel/Fabian.
- Checkout/finalization remains untouched and must follow all locked rules (Rules 9, 11, 15, 16): `status = 'approved'`, `occurred_at = NOW()`, `unit_cost_at_time` snapshot, per-line destinations, approved-only balance effect.

### What Claude Needs to Know
- Entry 015 cart-open + RLS implementation reviewed and approved with one required change (permission gate) folded in.
- Vehicle snapshot model is now decided: stock-carrying flag at vehicle level + user assignment → server-derived snapshot; NULL is the correct value for non-stock-carrying users and carts.
- Future reviews touching cart/checkout should confirm the snapshot is server-derived and the permission gate is present on every cart-write RPC.

### Next Steps (in order)
1. Codex adds the `can_inventory_transactions` server-side check to `open_inventory_cart` and removes the `p_active_vehicle_id` client parameter.
2. Add the `vehicles.holds_stock` column (schema-first).
3. Production verification: `Source: server`; Cart Open loads; Open Cart succeeds; status → active; vehicle displays "No active vehicle assignment found"; AND a least-privilege user with `can_inventory_transactions = false` is denied cart-open.
4. Build the controlled add-to-cart RPC (NULL-vehicle carts valid).
5. Design/build the user→vehicle active-assignment link before van stock onboarding; wire the server-derived snapshot at that point.
6. Keep checkout/finalization disabled until add-to-cart writes are verified.
7. Confirm minor items: `active_vehicle_id` UUID vs `vehicles` PK type and the UUID↔TEXT boundary at `transaction_items.destination_id`; `user_name` fallback should not store the raw Clerk sub (prefer `user_permissions.display_name` or NULL); `expires_at` 24h window matches the `void_expired_carts()` sweep.

### Open Questions / Concerns
- Confirm exact column/table naming for `holds_stock` and the user→vehicle assignment link when the migration is written.
- Confirm "one active cart per user" is the intended model vs. multiple concurrent carts.
- Carried forward: durable import/audit tracking for bulk imports; destination tables / import path for Employees and Assemblies.

### Architecture Drift Warnings
- CLOSED: Cart-open lacked a server-side permission check — decided this session; `can_inventory_transactions` gate required before add-to-cart.
- CARRIED FORWARD (active, next step): `active_vehicle_id` is structurally present but unsourced. When the user→vehicle assignment link is built, cart-open must populate the snapshot server-side (assigned vehicle iff `holds_stock`), and the client must never supply it. Do not leave it silently NULL after the assignment source exists.
- CARRIED FORWARD (active, next step): Add-to-cart must be a controlled server RPC gated by `can_inventory_transactions`; no direct client table mutation.
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate field/table — never repurpose `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 017

**Date:** 2026-06-09
**Updated by:** Claude
**Phase:** Phase 1 (Inventory) — Express Checkout / Manager Override design lock
**Session type:** Architecture decision (mid-build trigger: new transaction-completeness concept, permissions, audit, Dev Console)

### Context
Following the cart-open review (Entry 016), Ryan proposed an express-checkout / manager-override path: a worker in a hurry physically takes material now, records minimal info, and a manager/admin completes and approves it afterward. This introduces a new "transaction completeness" concept, new permission flags, a reason-gated developer override, and a deferred-completion ("finish later") capability. Design locked here; implementation scheduled after the normal cart checkout path exists.

### Decisions Made This Session (locked)
1. **Express checkout is a controlled "take now, complete later" path, not a bypass.** The physical removal is real immediately, so the transaction is written `status='approved'`, `occurred_at=NOW()`, `unit_cost_at_time` snapshotted on creation — inventory balance stays correct (Rules 1, 9, 16). Express checkout never sets a balance directly and never skips the ledger.
2. **"Needs completion" is a third, distinct concept.** A `requires_completion` flag (plus the worker's short-answer fields stored as provisional notes) marks the transaction for admin follow-up. It is NOT `transaction_items.status` (Rule 15) and NOT the Financials-phase job-cost approval (14b). It is transaction completeness — documented as Section 14d.
3. **Worker initiates; approver completes + approves.** The worker initiates and fills the short-answer form. An approver fills in real quantities, destination(s)/job number(s), and cost code(s), then approves. Approval is blocked until the required structured fields are present — this, not the passcode, is the real enforcement against rubber-stamping, and it is where Section 11's "destination required" is satisfied.
4. **Passcode is an approver-side deliberateness gate, per-user.** The approver enters their own passcode to finalize approval; verified server-side, stored hashed. It is NOT the authorization (the permission flag is) — its purpose is conscious action and protection against an unattended logged-in device. — Reframed by Ryan: the passcode is for the approver, not the worker.
5. **New permission flags (Section 17 lock update):**
   - `can_express_checkout` — initiate an express take. Defaults ON for every role that has `can_inventory_transactions`, so today it behaves as "anyone with inventory rights can initiate," but it is independently revocable per user with no code change. — Approved: Ryan (chose the separate flag because the marginal cost is ~zero given the flag list was already being edited, and it converts "rework code if abused" into "flip a flag if abused").
   - `can_approve_express_checkout` — complete + approve (passcode required). Defaults Developer/Administrator only; expandable to division managers by granting the flag.
   - `can_defer_completion` — save partial progress / "finish later." Defaults Developer only, per Ryan's "reserved solely for me, or select permissions."
6. **Approver routing is permission-based, not hardcoded.** Today the only approver is Ryan (Developer); modeling the approver set as holders of `can_approve_express_checkout` lets a division manager be added later by granting the flag. Express items surface as an in-app worklist now; email/push deferred to the companion-app phase. — Ryan floated developer-only routing for simplicity; resolved as a permission-gated set that currently contains only him.
7. **"Finish later" is non-blocking by design.** Worklist items are queue-based, never modal — the user is never locked out of the rest of the app while a task is pending. `can_defer_completion` holders may additionally save partial completion progress and resume.
8. **Developer override: process, not ledger.** A Developer may override a human workflow gate (self-approve an express item, force-close a completion task) ONLY with a mandatory reason written to the audit trail. This does not violate Rules 5/6 — those forbid skipping the audit log, not having elevated power; a reason-required, always-logged override is the intended expression of that authority. The override does NOT extend to structural invariants: balances are never set directly and locked snapshots are never edited, even by the Developer, even with a reason. Balance corrections go through a Physical Count Correction transaction (itself audited). — Confirmed by Ryan: "override the process, not the ledger" matches exactly.
9. **Mandatory audit entries (Rules 5, 6).** Every express take, every completion/approval, and every developer override is audited — who, when, passcode-verified for approvals, items and quantities, short-answer fields, and override reason where applicable.

### Sequencing
Express checkout is built AFTER the normal cart checkout/finalization path. Checkout establishes how an approved transaction with a destination and `unit_cost_at_time` is written; express checkout is that write minus the confirmed destination, plus the completeness flag, passcode, audit, and deferred-completion handling. Building checkout first avoids a duplicated transaction-write path.

### Schema Changes (locked, to implement — none applied this session)
- `requires_completion BOOLEAN` (default FALSE) and provisional short-answer note field(s) on the relevant transaction record — exact naming finalized at migration time.
- Approver passcode storage (hashed, server-verified) — mechanism finalized at implementation.
- Three new permission flags added to the role-defaults function and `user_permissions` mapping.

### Lock Document Changes
- ARCHITECTURE.md bumped to v2.6.
- Section 14: added 14d "Transaction Completeness — Express Checkout / Manager Override."
- Section 17: added `can_express_checkout`, `can_approve_express_checkout`, `can_defer_completion` with role defaults.
- Section 22 (Dev Console): added the reason-gated developer override and the explicit "process, not ledger" boundary.
- No constitutional rule changed. The developer override is reconciled with existing Rules 5/6, not an exception to them.

### What Codex Needs to Know
- Do not build express checkout yet — sequenced after normal cart checkout.
- When built: express take creates an approved physical-movement transaction immediately (balance correct), destination fields provisional, `requires_completion = TRUE`. Never use `transaction_items.status` for completeness.
- Approval blocked until required structured fields (destination, cost code, quantity) are filled; approver passcode verified server-side (hashed).
- Gate initiate on `can_express_checkout`, approve on `can_approve_express_checkout`, defer/partial-save on `can_defer_completion` — all server-side.
- Developer override requires a logged reason and may only override workflow gates, never the balance ledger or locked snapshots.
- All express/override actions are audited.

### What Claude Needs to Know
- A third approval-adjacent concept ("transaction completeness") now exists in 14d, distinct from physical-movement approval (14a) and job-cost approval (14b).
- Future reviews touching checkout or the Dev Console should confirm completeness is its own field, the override is reason-gated and process-only, and the new flags are enforced server-side.

### Next Steps (in order)
1. Continue the current build sequence: finish add-to-cart, then normal cart checkout/finalization.
2. Build express checkout / manager override after checkout exists, per Section 14d.
3. Add the three new flags to the role-defaults function and `user_permissions` mapping when express checkout is implemented.
4. Implement approver passcode (hashed, server-verified) and the routed completion worklist (in-app first).

### Open Questions / Concerns
- Confirm final field naming (`requires_completion`, short-answer note fields) at migration time.
- Decide the in-app worklist surface (badge/queue location) when its UI is built.
- Carried forward: durable import/audit tracking; Employees/Assemblies destination tables.

### Architecture Drift Warnings
- CARRIED FORWARD (active, when express checkout is built): completeness must be its own field — never `transaction_items.status` (Rule 15) and never the job-cost approval field.
- CARRIED FORWARD (active, when express checkout is built): developer override is reason-gated and process-only; structural invariants (balances, locked snapshots) are never overridden — correct via Physical Count Correction transactions.
- CARRIED FORWARD (active, next step): `active_vehicle_id` snapshot must be server-derived when the assignment source exists (Entry 016).
- CARRIED FORWARD (active, next step): add-to-cart must be a controlled server RPC gated by `can_inventory_transactions` (Entry 016).
- CARRIED FORWARD (active, Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---
