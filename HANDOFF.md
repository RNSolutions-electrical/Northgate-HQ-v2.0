# Northgate HQ v2.0 — Handoff Log
### Repository: RNSolutions-electrical/Northgate-HQ-v2.0
### Rule: Append only. Never edit prior entries. Entries are permanent record.
### Before writing a new entry: read the last entry number and increment. Never reuse a number.

## Entry Format Standard

Every HANDOFF entry uses this exact structure. The header block is mandatory;
body sections are included when they apply, always in this order; omit a section
only if it is genuinely empty.

```
## Entry NNN[ — optional short title]

**Date:** YYYY-MM-DD
**Updated by:** <Claude | Codex | Ryan>
**Phase:** <phase / milestone>
**Session type:** <implementation | review | decision | alignment>

### Context
### What Was Completed   (implementation)  — or —
### Review Findings       (review)          — or —
### Decisions Made This Session (locked)    (decision)
### Schema Changes
### Code / File Changes
### Lock Document Changes
### What Codex Needs to Know
### What Claude Needs to Know
### Next Steps (in order)
### Open Questions / Concerns
### Architecture Drift Warnings

---
```

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

### Review Findings
- RLS enabled on `inventory_carts` / `inventory_cart_items` before the first cart write — closes a real Rule 4 / Section 17 gap. Self-select read policies + deny-all client mutation + `SECURITY DEFINER` RPC is the correct pattern and matches the `user_permissions` approach (Entry 012).
- `open_inventory_cart` uses `auth.jwt() ->> 'sub'` as the authoritative `user_id` and ignores any client-claimed identity. Correct.
- Cart-open writes only a cart row — no cart items, no stock reservation, no `transaction_items`, no balance movement. Respects the Entry 013 build sequence and Rules 1/16.
- Return-existing-active-cart instead of duplicating. Sound.

### Decisions Made This Session (locked)
1. **Cart-open is gated by `can_inventory_transactions` server-side.** `open_inventory_cart` must read the caller's effective permission from `user_permissions.effective_permissions` (keyed off the JWT subject) and fail closed if false. JWT validation establishes identity (authentication); it does not establish authorization. Cart-open is a server write into an inventory table, so Rule 4 / Section 17 require the permission check at the DB/API layer. Required before add-to-cart. — Approved by Rule 4; Ryan.
2. **NULL active-vehicle snapshot is correct, not merely tolerated.** A NULL-vehicle cart is a legitimate, common state. Add-to-cart and checkout must treat NULL as valid, never an error. The user→vehicle assignment table is NOT a prerequisite for building add-to-cart. — Approved: Ryan.
3. **Vehicle snapshot is server-derived, never client-passed.** The `p_active_vehicle_id` client parameter on `open_inventory_cart` is removed/ignored; the snapshot is computed server-side. This mirrors the client-claimed-user_id fix already applied to the permission RPC. — Approved by Rule 4 / Section 11; Ryan.
4. **Vehicle stock-carrying model (Ryan's decision).** Whether a cart captures a vehicle snapshot is determined by a stock-carrying criterion at the vehicle level, attached to the user via an active assignment:
   - Vehicles carry an explicit stock-carrying flag (`vehicles.holds_stock BOOLEAN NOT NULL DEFAULT FALSE`), distinct from the existing classification (Residential/Commercial/Service/Other).
   - A user→vehicle active-assignment link attaches a vehicle to a user.
   - Cart-open server logic: snapshot the user's assigned vehicle iff that vehicle `holds_stock = TRUE`; otherwise snapshot NULL.
   - Business rationale: not all employees drive a company vehicle; of those who do, only vans that hold stock for extended periods need inventory tracking. Transient stock carried in a truck used office→job is not tracked at the vehicle level; those carts snapshot NULL and simply record who handled the material.

### Schema Changes
- `open_inventory_cart`: add server-side `can_inventory_transactions` check (fail closed); drop/ignore the `p_active_vehicle_id` client parameter.
- `vehicles.holds_stock BOOLEAN NOT NULL DEFAULT FALSE` — add now (schema-first), even though only a couple of vehicles will be flagged.
- User→vehicle active-assignment link — design locked; build before Miguel/Fabian van stock is tracked. Not required to build add-to-cart.

### Lock Document Changes
- ARCHITECTURE.md bumped to v2.5.
- Section 11 clarified: cart-open gated by `can_inventory_transactions` server-side; vehicle snapshot is server-derived (never client-passed) and is populated only when the user's active vehicle `holds_stock`; NULL-vehicle carts are valid and must not error.
- Section 16 expanded: added the `vehicles.holds_stock` flag and the user→vehicle active-assignment concept.

### What Codex Needs to Know
- Add the `can_inventory_transactions` server-side check to `open_inventory_cart` and remove the `p_active_vehicle_id` client parameter before building add-to-cart.
- Add-to-cart may proceed now; it does not touch the vehicle snapshot, and NULL-vehicle carts are valid. Build it as a controlled `SECURITY DEFINER` RPC with authenticated Clerk subject, active cart owned by that subject, valid `bin_item_id` / `item_id` relationship, quantity > 0, `can_inventory_transactions` check, and no balance movement until checkout.
- Vehicle snapshot logic, when built: server-side lookup of the user's active assignment; snapshot only if `holds_stock = TRUE`, else NULL. Never accept the vehicle ID from the client.
- Checkout/finalization remains untouched and must follow all locked rules (Rules 9, 11, 15, 16): `status = 'approved'`, `occurred_at = NOW()`, `unit_cost_at_time` snapshot, per-line destinations, approved-only balance effect.

### What Claude Needs to Know
- Entry 015 cart-open + RLS implementation reviewed and approved with one required change (permission gate) folded in.
- Vehicle snapshot model is now decided: stock-carrying flag at vehicle level + user assignment → server-derived snapshot; NULL is the correct value for non-stock-carrying users and carts.

### Next Steps (in order)
1. Codex adds the `can_inventory_transactions` server-side check to `open_inventory_cart` and removes the `p_active_vehicle_id` client parameter.
2. Add the `vehicles.holds_stock` column (schema-first).
3. Production verification: `Source: server`; Cart Open loads; Open Cart succeeds; status → active; vehicle displays "No active vehicle assignment found"; AND a least-privilege user with `can_inventory_transactions = false` is denied cart-open.
4. Build the controlled add-to-cart RPC (NULL-vehicle carts valid).
5. Design/build the user→vehicle active-assignment link before van stock onboarding; wire the server-derived snapshot at that point.
6. Keep checkout/finalization disabled until add-to-cart writes are verified.

### Open Questions / Concerns
- Confirm exact column/table naming for `holds_stock` and the user→vehicle assignment link when the migration is written.
- Confirm "one active cart per user" is the intended model vs. multiple concurrent carts.
- Carried forward: durable import/audit tracking for bulk imports; destination tables / import path for Employees and Assemblies.

### Architecture Drift Warnings
- CLOSED: Cart-open lacked a server-side permission check — decided this session; `can_inventory_transactions` gate required before add-to-cart.
- CARRIED FORWARD (active, next step): `active_vehicle_id` is structurally present but unsourced. When the user→vehicle assignment link is built, cart-open must populate the snapshot server-side (assigned vehicle iff `holds_stock`), and the client must never supply it.
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
Following the cart-open review (Entry 016), Ryan proposed an express-checkout / manager-override path: a worker in a hurry physically takes material now, records minimal info, and a manager/admin completes and approves it afterward. This introduces a new "transaction completeness" concept, new permission flags, a reason-gated developer override, and a deferred-completion capability. Design locked here; implementation scheduled after the normal cart checkout path exists.

### Decisions Made This Session (locked)
1. **Express checkout is a controlled "take now, complete later" path, not a bypass.** The physical removal is real immediately, so the transaction is written `status='approved'`, `occurred_at=NOW()`, `unit_cost_at_time` snapshotted on creation — inventory balance stays correct (Rules 1, 9, 16). Express checkout never sets a balance directly and never skips the ledger.
2. **"Needs completion" is a third, distinct concept.** A `requires_completion` flag marks the transaction for admin follow-up. It is NOT `transaction_items.status` and NOT the Financials-phase job-cost approval.
3. **Worker initiates; approver completes + approves.** The worker initiates and fills the short-answer form. An approver fills in real quantities, destination(s)/job number(s), and cost code(s), then approves. Approval is blocked until the required structured fields are present.
4. **Passcode is an approver-side deliberateness gate, per-user.** The approver enters their own passcode to finalize approval; verified server-side, stored hashed. It is NOT the authorization.
5. **New permission flags:** `can_express_checkout`, `can_approve_express_checkout`, `can_defer_completion`.
6. **Approver routing is permission-based, not hardcoded.** Today the only approver is Ryan (Developer); modeling the approver set as holders of `can_approve_express_checkout` lets a division manager be added later by granting the flag.
7. **"Finish later" is non-blocking by design.** Worklist items are queue-based, never modal; holders of `can_defer_completion` may additionally save partial completion progress and resume.
8. **Developer override: process, not ledger.** A Developer may override a human workflow gate ONLY with a mandatory reason written to the audit trail. The override does NOT extend to structural invariants: balances are never set directly and locked snapshots are never edited.
9. **Mandatory audit entries.** Every express take, completion/approval, and developer override is audited.

### Sequencing
Express checkout is built AFTER the normal cart checkout/finalization path.

### Schema Changes
- `requires_completion BOOLEAN` and provisional short-answer note field(s) on the relevant transaction record — exact naming finalized at migration time.
- Approver passcode storage (hashed, server-verified) — mechanism finalized at implementation.
- Three new permission flags added to the role-defaults function and `user_permissions` mapping.

### Lock Document Changes
- ARCHITECTURE.md bumped to v2.6.
- Section 14: added 14d "Transaction Completeness — Express Checkout / Manager Override."
- Section 17: added `can_express_checkout`, `can_approve_express_checkout`, `can_defer_completion` with role defaults.
- Section 22: added the reason-gated developer override and the explicit "process, not ledger" boundary.

### What Codex Needs to Know
- Do not build express checkout yet — sequenced after normal cart checkout.
- When built: express take creates an approved physical-movement transaction immediately (balance correct), destination fields provisional, `requires_completion = TRUE`. Never use `transaction_items.status` for completeness.
- Approval blocked until required structured fields are filled; approver passcode verified server-side.
- Gate initiate on `can_express_checkout`, approve on `can_approve_express_checkout`, defer/partial-save on `can_defer_completion` — all server-side.
- Developer override requires a logged reason and may only override workflow gates, never the balance ledger or locked snapshots.

### What Claude Needs to Know
- A third approval-adjacent concept (transaction completeness) now exists in 14d, distinct from physical-movement approval and job-cost approval.

### Next Steps (in order)
1. Continue the current build sequence: finish add-to-cart, then normal cart checkout/finalization.
2. Build express checkout / manager override after checkout exists, per Section 14d.
3. Add the three new flags to the role-defaults function and `user_permissions` mapping when express checkout is implemented.
4. Implement approver passcode and the routed completion worklist.

### Open Questions / Concerns
- Confirm final field naming (`requires_completion`, short-answer note fields) at migration time.
- Decide the in-app worklist surface when its UI is built.
- Carried forward: durable import/audit tracking; Employees/Assemblies destination tables.

### Architecture Drift Warnings
- CARRIED FORWARD (active, when express checkout is built): completeness must be its own field — never `transaction_items.status` and never the job-cost approval field.
- CARRIED FORWARD (active, when express checkout is built): developer override is reason-gated and process-only; structural invariants are never overridden.
- CARRIED FORWARD (active, next step): `active_vehicle_id` snapshot must be server-derived when the assignment source exists.
- CARRIED FORWARD (active, next step): add-to-cart must be a controlled server RPC gated by `can_inventory_transactions`.
- CARRIED FORWARD (active, Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 018

**Date:** 2026-06-10
**Updated by:** ChatGPT / Codex-style implementation session
**Phase:** Phase 1 Inventory — Cart open, add-to-cart, and normal checkout verified
**Session type:** Implementation checkpoint + Claude architecture review request

### Context
Ryan confirmed the updated `HANDOFF.md` through Entry 017 was in the repository before implementation resumed. Work proceeded from the Entry 016/017 sequence: harden cart-open first, then controlled add-to-cart, then normal cart checkout/finalization. Express checkout / manager override remained intentionally out of scope.

### What Was Completed
1. **Cart-open corrections required by Entry 016 were implemented and verified.** Added `vehicles.holds_stock`, replaced `open_inventory_cart` so active vehicle snapshot is not client-supplied, used JWT `sub` as authoritative user ID, and checked `can_inventory_transactions` server-side.
2. **Permission defaults were updated live in Supabase.** Added v2.6 express-related flags to `default_permissions_for_role`: `can_express_checkout`, `can_approve_express_checkout`, `can_defer_completion`.
3. **Controlled add-to-cart was implemented and verified.** Added `add_inventory_cart_item(p_cart_id, p_bin_item_id, p_quantity)` as a `SECURITY DEFINER` RPC. Add-to-cart inserts/increments `inventory_cart_items`; it does not reserve stock, move inventory, create `transaction_items`, or affect balances.
4. **Stocked-bin candidate source was added.** Added `inventory_cart_candidates_view` so the UI uses real stocked `bin_items`, not catalog-only `items` rows.
5. **Normal checkout/finalization was implemented and verified.** Added `finalize_inventory_cart(p_cart_id, p_destination_type, p_destination_id, p_note)` as a `SECURITY DEFINER` RPC. It writes approved `transaction_items` with `status='approved'`, `occurred_at=NOW()`, and `unit_cost_at_time=items.price_per_unit`.
6. **Production behavior was verified by Ryan.** Verified path: Open Cart → Add Item → Checkout to Office → Supabase ledger/balance updates appeared correctly.

### Code / File Changes
- Repo commits:
  - `a2a8e98` — Add vehicle holds stock flag migration
  - `ffc9e14` — Harden open inventory cart permission gate
  - `fd5d125` — Remove client vehicle parameter from cart open hook
  - `868c27a` — Add inventory cart item RPC
  - `9bcdc4f` — Add inventory cart candidates view
  - `cdb4675` — Load inventory cart candidates from stocked bins
  - `9de4814` — Wire cart candidates to add-to-cart RPC
  - `b72ce95` — Add cart item hook action
  - `afc72ee` — Add inventory cart checkout RPC
  - `52c48b1` — Add inventory cart checkout hook action
  - `701873f` — Expose inventory cart checkout button

### What Claude Needs to Know
- Please review this implementation against `docs/ARCHITECTURE.md` v2.6 and HANDOFF Entries 016–017.
- Specific review questions covered destination handling, office semantics, per-line destinations, express flags, repo migration drift, and whether to proceed to destination selection UI.

### Next Steps (in order)
1. Claude reviews the cart-open / add-to-cart / normal checkout path.
2. If approved, proceed to destination-selection UI with per-line support.
3. Keep express checkout deferred.

### Open Questions / Concerns
- Express checkout / manager override is still not built.
- Developer override is still not built.
- Approver passcode is still not built.
- User-to-vehicle active assignment source is still not built; vehicle snapshot remains NULL by design until that exists.
- Repo still needs a clean migration representation for the live `default_permissions_for_role` update that added v2.6 express flags.
- Destination tables/imports for employees/jobs/service calls/assemblies remain future work.
- Durable import/audit tracking remains future work.

### Architecture Drift Warnings
- CARRIED FORWARD: repo migration representation for permission-default function needed.
- CARRIED FORWARD: user→vehicle assignment source absent.
- CARRIED FORWARD: express checkout / manager override deferred.

---

## Entry 019

**Date:** 2026-06-10
**Updated by:** Claude
**Phase:** Phase 1 Inventory — Review of Entry 018 (cart-open hardening, add-to-cart, normal checkout)
**Session type:** Architecture review

### Context
Reviewed the implemented cart-open → add-to-cart → normal checkout path against the canonical v2.6 lock document and HANDOFF through Entry 017.

### Review Findings
- The implemented cart-open → add-to-cart → normal checkout path is sound and aligns with the locked inventory, permission, cost, and audit rules. **Milestone 4C approved.**
- Rule 1: PASS. Approved `transaction_items` written; balance trigger derives; no direct balance writes.
- Rule 4: PASS. RPCs gate on `can_inventory_transactions` server-side via `default_permissions_for_role || overrides`; JWT `sub` authoritative.
- Rule 5: PASS for material movement. Inventory transaction log satisfies movement audit.
- Rule 9 / Section 13: PASS. `unit_cost_at_time = items.price_per_unit`.
- Rule 11: PASS structurally. Destinations are written at the line level and schema supports differing destinations, but UI/finalize should become per-line-capable now.
- Rule 15: PASS. `status='approved'` means physical movement.
- Rule 16: PASS. Only approved rows affect balances.

### Decisions Made This Session (locked)
- Cart-level destination is acceptable for the milestone, but the next destination UI should be per-line-capable.
- `office` as a type-only destination is acceptable if office is treated as a singleton consumption destination. If office later holds tracked stock, it becomes a transfer/location model instead.
- Express flags may exist live before express implementation; no concern while dormant.
- Repo migration drift for `default_permissions_for_role` must be corrected soon.
- Overdraw/concurrency protection should be added to add-to-cart/finalize before real multi-user reliance.

### Schema Changes
None applied by Claude.

### Code / File Changes
None by Claude.

### What Codex Needs to Know
- Build destination selection UI per-line-capable.
- Add overdraw/concurrency protection with row/advisory locks and negative-balance guard.
- Commit a clean repo migration for `default_permissions_for_role` express flags.
- Confirm `inventory_transactions` header captures acting user and timestamp.

### What Claude Needs to Know
- Milestone 4C approved. The next risks are hardening/sequencing, not rule violations.

### Next Steps (in order)
1. Confirm the repo is on v2.6 / Entry 017.
2. Commit the `default_permissions_for_role` migration.
3. Build the destination-selection UI — per-line-capable, server-validated.
4. Add the overdraw/concurrency guard to add-to-cart and finalize.
5. Confirm the express per-role default values match Section 17.
6. Later: express checkout / manager override per Section 14d.

### Open Questions / Concerns
- Confirm office destination semantics before making it permanent.
- Confirm service-call cost treatment and whether user removals are intentionally not job-costed.

### Architecture Drift Warnings
- CARRIED FORWARD (active, before next deploy/rebuild): repo migration for the live `default_permissions_for_role` update is uncommitted — live ≠ repo.
- NEW (active, destination-UI step): expose per-line destinations in `finalize`/UI now; do not harden a cart-level-only path.
- NEW (active, destination-UI step): add overdraw/concurrency protection to `add_inventory_cart_item` and `finalize_inventory_cart`.
- NEW (active, before office is permanent): define office destination semantics — consumption (`remove_stock`) vs tracked storage location (`Transfer Location`).
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags must gate express RPCs.
- CARRIED FORWARD (active, next step): user→vehicle assignment source still absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 020

**Date:** 2026-06-11
**Updated by:** Codex
**Phase:** Phase 1 Inventory — Read-path stabilization, per-line checkout, cart durability
**Session type:** Implementation

### Context
Work completed in the active repo/Supabase on 2026-06-11, following the Entry 018/019 normal-checkout milestone and the Entry 019 recommendation to expose per-line destinations.

### What Was Completed
- **Inventory read-path stabilization.** Optional destination-reference reads (`user_permissions`, `vehicles`) were made fail-soft so they no longer block the inventory panel. Marker `Inventory destination reference build: 2026-06-11.2`.
- **Per-line normal checkout.** Added a 5-argument overload of `public.finalize_inventory_cart(p_cart_id uuid, p_destination_type text default null, p_destination_id text default null, p_note text default null, p_line_destinations jsonb default null)`. Per-line checkout validates destinations line-by-line and writes per-line destination data to `transaction_items`. The legacy 4-argument checkout remains available.
- **Destination source dropdowns.** UI loads user and vehicle destination references when available; Jobs and service calls remain manual IDs.
- **Durable cart item read.** Added `public.read_inventory_cart_items(p_cart_id uuid)`. Cart open, add-item, and checkout reload line items from the server; line display shows material/bin detail. Marker `Inventory durable cart read build: 2026-06-11.3`.
- **Draft destination persistence.** Destination selections saved locally as cart-keyed drafts; survive reloads/refresh/reopen; clear after checkout. Marker `Inventory draft destination build: 2026-06-11.4`.
- **Remove mistaken cart line.** Added `public.remove_inventory_cart_item(p_cart_item_id uuid)`, gated by `can_inventory_transactions`. UI exposes a per-line Remove button. Marker `Inventory removable cart line build: 2026-06-11.5`.
- **Seeded additional test inventory** from the Master Data Workbook (`Inventory_Levels`): 9 stocked EMT materials with positive balances.

### Schema Changes
- New RPCs: `read_inventory_cart_items`, `remove_inventory_cart_item`; 5-arg `finalize_inventory_cart` overload.

### Code / File Changes
- UI: destination dropdowns, durable cart read, draft destination persistence, per-line remove.
- Repo commits:
  - `a553af1` Add cart item read RPC
  - `23798bc` Reload cart items from server
  - `a3ab076` Show reloaded cart item details
  - `1d761b7` Preserve draft cart destinations across reloads
  - `c83bc15` Add cart item remove RPC
  - `881a68f` Wire remove cart item hook action
  - `439a430` Expose remove cart item action

### What Codex Needs to Know
- Per-line checkout is now implemented (5-arg finalize with `p_line_destinations`), satisfying Entry 019 Rule 11 recommendation. Legacy 4-arg path retained.
- All new writes route through `SECURITY DEFINER` RPCs gated by `can_inventory_transactions`; no direct client table mutation.

### What Claude Needs to Know
- Per-line checkout and cart durability are implemented.

### Next Steps (in order)
1. Verify per-line checkout in production.
2. Continue hardening candidate picker and destination reference scoping.
3. Keep express checkout deferred.

### Open Questions / Concerns
- Candidate picker still needs more usable search/quantity controls.
- Candidate/destination reference reads need division/RLS review.

### Architecture Drift Warnings
- CARRIED FORWARD (active): overdraw/concurrency guard still recommended on add/finalize (Entry 019).
- CARRIED FORWARD (active): confirm `inventory_cart_candidates_view` and destination-reference reads respect division separation / RLS.

---

## Entry 021

**Date:** 2026-06-11
**Updated by:** Codex
**Phase:** Phase 1 Inventory — Milestone 4I, Cart Candidate Picker v1
**Session type:** Implementation

### Context
Replaced the temporary `cartCandidates.slice(0, 3)` test display with a usable stocked-material picker.

### What Was Completed
- Removed the `cartCandidates.slice(0, 3)` limiter; candidate source now requests up to 50 stocked rows from `inventory_cart_candidates_view`.
- Added a search box filtering stocked candidates by material code, item name, and bin code.
- Added a per-candidate quantity input: defaults to 1, clamped client-side to [1, `quantity_on_hand`].
- Add routes the selected quantity through existing `cartState.addItem` → existing RPCs. No direct table mutation added.
- Preserved existing behavior: open/add/remove, server cart reload, draft destination persistence, per-line checkout, user/vehicle destination dropdowns.
- Express checkout and job/service-call source pickers intentionally not added.
- Build marker `Inventory candidate picker build: 2026-06-11.6`.

### Schema Changes
None.

### Code / File Changes
- `src/App.jsx`, `src/hooks/useInventoryReadModel.js`, `src/styles.css`.
- Removed duplicate lowercase `src/app.jsx` from tracking (`git rm --cached`); canonical file is `src/App.jsx`.
- `npm run build` passed.

### What Codex Needs to Know
- 4I is implemented and builds, but browser smoke test was not completed at the time of this entry.

### What Claude Needs to Know
- Candidate Picker v1 is implemented with client-side search against fetched rows; server-side/full inventory search remains future hardening.

### Next Steps (in order)
1. Browser-verify Milestone 4I.
2. Resolve candidate/destination reference division scoping.
3. Continue cart checkout stabilization.

### Open Questions / Concerns
- Client search filters only the 50 fetched rows; move search server-side before stocked items exceed fetch limit.

### Architecture Drift Warnings
- CARRIED FORWARD (active): client search filters only the 50 fetched rows; move search server-side before stocked items exceed the fetch limit.
- CARRIED FORWARD (active): confirm `inventory_cart_candidates_view` respects division separation / RLS.

---

## Entry 022

**Date:** 2026-06-12
**Updated by:** Claude
**Phase:** Documentation reconciliation + Milestone 4I review
**Session type:** Review + documentation standardization

### Context
Ryan paused code work to repair the coordination documents after the canonical set drifted from the build. Diagnosis: canonical `ARCHITECTURE.md` was still v2.4 while code depended on v2.5/v2.6 decisions, and `HANDOFF.md` had clean entries only through 014 while later work was captured in non-standard addendum form. This entry reconciles both documents and adds Constitutional Rule 19 to prevent recurrence.

### Decisions Made This Session (locked)
- **Constitutional Rule 19 added** (ARCHITECTURE → v2.7): the coordination documents are the versioned source of truth and must stay consistent — append-only sequential entries, one identical entry format, and canonical filenames never renamed.
- **Section 34 added** (Documentation Standard): canonical filenames, file-handling protocol, append-only correction protocol, and single entry-format template.
- **HANDOFF reconciled to gapless sequential entries** through Entry 022. The old consolidated addendum was converted into proper entries.

### Review Findings
- Milestone 4I reviewed against ARCHITECTURE v2.6. No drift found.
- Write boundary preserved — picker is read + UI; writes go through existing RPCs; no direct table mutation.
- Client quantity clamping is acceptable UX; RPC checks remain authoritative.
- 10→50 read limit fine for v1; move search server-side before stock exceeds the fetch limit.
- Lowercase `src/app.jsx` removal correct; verify with `git ls-files src/` that only `App.jsx` remains tracked.
- Status: builds but not browser-verified — run manual smoke path before marking verified.
- Verify `inventory_cart_candidates_view` division/RLS scoping.

### Lock Document Changes
- ARCHITECTURE.md → v2.7: Rule 19 (Section 24); Section 34 "Documentation Standard."
- HANDOFF.md: Entry Format Standard preamble added at top; Entries 015–022 present in standard format.

### What Codex Needs to Know
- The canonical HANDOFF is now sequential through Entry 022. The next entry is 023.
- Every entry must follow Section 34 / HANDOFF-preamble format exactly.
- Canonical filenames are `ARCHITECTURE.md` and `HANDOFF.md` — never rename or suffix them.
- Build against ARCHITECTURE v2.7.

### What Claude Needs to Know
- Canonical docs are reconciled and consistent. Future reviews start from v2.7 / Entry 022.

### Next Steps (in order)
1. Ryan commits the reconciled `ARCHITECTURE.md` (v2.7) and `HANDOFF.md` to the repo and Current Docs.
2. Resume code: commit the uncommitted `default_permissions_for_role` migration; add the overdraw/concurrency guard; verify Milestone 4I end-to-end in the browser.
3. Continue per-line destination UI hardening; confirm candidate-view division scoping.
4. Express checkout / manager override remains deferred until the normal path is fully verified.

### Open Questions / Concerns
- Confirm the live `default_permissions_for_role` per-role default values match Section 17 before express is built.

### Architecture Drift Warnings
- RESOLVED: canonical ARCHITECTURE / HANDOFF drift — reconciled this entry; Rule 19 added to prevent recurrence.
- CARRIED FORWARD (active): uncommitted `default_permissions_for_role` migration — live ≠ repo (Entry 019).
- CARRIED FORWARD (active): overdraw/concurrency guard on add/finalize (Entry 019).
- CARRIED FORWARD (active): confirm `inventory_cart_candidates_view` + destination-reference reads respect division separation / RLS.
- CARRIED FORWARD (active): Milestone 4I not browser-verified yet.
- CARRIED FORWARD (next step): user→vehicle assignment source absent; vehicle snapshot NULL by design.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 023

**Date:** 2026-06-12
**Updated by:** ChatGPT
**Phase:** Phase 1 Inventory — Milestone 4I committed, checkout hardening, ledger backfill, Apply to All controls
**Session type:** Implementation review / documentation update

### Context
After documentation alignment was resolved (ARCHITECTURE v2.7 and HANDOFF through Entry 022), Codex completed and pushed Milestone 4I plus related pre-commit hardening and cart checkout fixes. Ryan reported the pushed HEAD as `c215bc7bcae5c4a1a96ea05b5d40dfdbc771749a`. The working tree after push was clean. HANDOFF was not edited during the implementation pass, so this entry records the completed work and verification.

### What Was Completed
- **Milestone 4I Cart Candidate Picker v1 was committed and pushed.** Commit `cc34b3c` replaced the temporary `cartCandidates.slice(0, 3)` display with a stocked material picker, search by material code/item name/bin code, and per-candidate quantity input clamped between 1 and `quantity_on_hand`.
- **Scoped inventory/reference reads were committed and pushed.** Commit `cc34b3c` also added `supabase/migrations/202606120001_harden_inventory_reference_division_scope.sql`, replacing/adding division-scoped views for cart candidates, destination users, and destination vehicles.
- **Vehicle reference view was corrected for the active schema.** Commit `aa4849d` fixed the vehicle destination view to match the actual live `vehicles` schema.
- **Checkout ledger balance hardening was committed and pushed.** Commit `f7e0c64` added `supabase/migrations/202606120002_harden_per_line_cart_checkout_balance.sql`, updating the 5-arg `finalize_inventory_cart` RPC so per-line checkout no longer incorrectly requires cart-level `destination_id`/unknown-note validation when `p_line_destinations` is supplied. It also aggregates checkout quantity by `bin_item_id` to prevent multi-line same-bin overdraw from slipping past per-line checks.
- **Inventory balance ledger baseline was backfilled.** Commit `f7e0c64` also added `supabase/migrations/202606120003_backfill_inventory_balance_ledger_baseline.sql`, inserting approved `physical_count_correction` ledger baseline rows so the transaction ledger matches the current seeded `inventory_balances`.
- **Apply Destination to All Lines controls were committed and pushed.** Commit `c215bc7` added Apply Destination to All Lines controls above the per-line cart destination controls. The UI supports destination type, destination ID where required, and note; applies chosen draft values to every active cart line; keeps individual line editing available afterward; and preserves local draft destination persistence.
- **Checkout Selected Destinations was diagnosed and fixed.** Ryan had encountered the generic app error: `Cart action failed. Check permissions, destination requirements, available balance, or deployment status.` Supabase logs showed `POST /rest/v1/rpc/finalize_inventory_cart` returning 400, with earlier errors including `destination_id is required for this destination type` and later errors including `new row for relation "inventory_balances" violates check constraint "inventory_balances_quantity_nonnegative"`.
- **Production migrations were applied live** to v2 Supabase project `keogysnoukbendfkfjcn`:
  - `202606120001_harden_inventory_reference_division_scope.sql`
  - `202606120002_harden_per_line_cart_checkout_balance.sql`
  - `202606120003_backfill_inventory_balance_ledger_baseline.sql`
- **Data repair was performed through ledger baseline rows, not direct balance override.** After explicit approval, the production baseline migration inserted 9 approved `physical_count_correction` transaction items totaling target quantity `389`.
- **Ryan retested successfully.** `Checkout Selected Destinations` worked after the migrations/repairs. Push to GitHub main worked.
- **Build status:** `npm run build` passed before commits.

### Schema Changes
- Added/updated scoped reference views via `202606120001_harden_inventory_reference_division_scope.sql`:
  - `public.inventory_cart_candidates_view`
  - `public.inventory_destination_users_view`
  - `public.inventory_destination_vehicles_view`
- Updated/hardened 5-arg `public.finalize_inventory_cart(...)` via `202606120002_harden_per_line_cart_checkout_balance.sql`:
  - skips cart-level destination validation when per-line JSON destinations are supplied;
  - aggregates requested checkout quantity by `bin_item_id`;
  - prevents multi-line same-bin overdraw from escaping per-line balance checks.
- Added ledger baseline data repair via `202606120003_backfill_inventory_balance_ledger_baseline.sql`:
  - inserted 9 approved `physical_count_correction` `transaction_items`;
  - total target quantity: `389`;
  - purpose was to align seeded `inventory_balances` with transaction-derived ledger baselines.

### Code / File Changes
- Current pushed HEAD: `c215bc7bcae5c4a1a96ea05b5d40dfdbc771749a`.
- Recent commits pushed to `main`:
  - `cc34b3c` — Add inventory cart candidate picker and scoped references
  - `aa4849d` — Fix vehicle reference view for active schema
  - `f7e0c64` — Harden inventory cart checkout ledger balance
  - `c215bc7` — Add apply all cart destination controls
- Files/modules affected included:
  - `src/App.jsx`
  - `src/hooks/useInventoryReadModel.js`
  - `src/styles.css`
  - duplicate lowercase `src/app.jsx` removed from Git tracking
  - Supabase migrations listed above

### Lock Document Changes
- None. ARCHITECTURE.md remains v2.7.

### What Codex Needs to Know
- Milestone 4I is committed and pushed through HEAD `c215bc7bcae5c4a1a96ea05b5d40dfdbc771749a`.
- The Apply to All destination UI is now part of the cart destination flow.
- Checkout Selected Destinations is working after the per-line finalize fix and ledger-baseline backfill.
- The three 20260612 migrations were applied live to project `keogysnoukbendfkfjcn`.
- The physical-count-correction backfill was a ledger repair, not a manual balance override; it is aligned with the transaction-derived balance rule because it created approved `physical_count_correction` ledger rows.
- Do not start express checkout yet. Normal checkout should be stabilized and inspected before adding another write path.

### What Claude Needs to Know
- The documentation conflict was resolved before this implementation was finalized; ARCHITECTURE is v2.7 and HANDOFF was current through Entry 022 at the start of this pass.
- The previously carried-forward migration drift for `default_permissions_for_role` appears resolved in repo by `202606110001_add_express_permission_defaults.sql`.
- The overdraw/concurrency concern was addressed for per-line checkout quantity aggregation and negative-balance prevention, and the live checkout failure exposed and fixed a deeper ledger-baseline mismatch.
- The candidate/reference division scoping concern was addressed by server-side scoped views.
- The baseline backfill touched production inventory history and should be reviewed as a ledger repair: it inserted approved `physical_count_correction` rows, preserving the rule that balances are transaction-derived.

### Next Steps (in order)
1. Confirm Netlify production is deployed to HEAD `c215bc7bcae5c4a1a96ea05b5d40dfdbc771749a`.
2. Run one clean post-fix production checkout test and inspect the resulting `inventory_transactions`, `transaction_items`, and `inventory_balances` rows.
3. Build a cart transaction/history review surface before express checkout, so normal checkout effects are easy to inspect.
4. Continue carrying forward unresolved future work: user→vehicle active assignment source, office destination semantics, service-call/job modules, import/audit tracking, and express checkout/manager override.

### Open Questions / Concerns
- Confirm that the Netlify production deploy is actually serving HEAD `c215bc7bcae5c4a1a96ea05b5d40dfdbc771749a`.
- Confirm via one clean post-fix test that `transaction_items` and `inventory_balances` reflect the expected after-checkout state.
- Office destination semantics still need to be finalized before office becomes permanent: singleton consumption destination (`remove_stock`) vs tracked storage location (`transfer_location`).
- User→vehicle active assignment source is still absent; vehicle snapshot remains NULL by design until that exists.
- Express checkout, manager override, approver passcode, and completion worklist remain deferred.

### Architecture Drift Warnings
- RESOLVED: Milestone 4I browser verification / checkout path — Ryan retested and `Checkout Selected Destinations` worked.
- RESOLVED: candidate/destination reference division scoping — implemented via server-side scoped views.
- RESOLVED: overdraw/concurrency gap for multi-line same-bin checkout — hardened by aggregating checkout quantity by `bin_item_id` and preserving negative-balance protection.
- RESOLVED: live seeded balances without corresponding ledger baselines — repaired by approved `physical_count_correction` ledger baseline rows.
- CARRIED FORWARD (active): confirm Netlify production deploy is on HEAD `c215bc7bcae5c4a1a96ea05b5d40dfdbc771749a`.
- CARRIED FORWARD (active): inspect one clean post-fix checkout transaction in Supabase to confirm normal path remains transparent and auditable.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is treated as permanent behavior.
- CARRIED FORWARD (next step): user→vehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 024

**Date:** 2026-06-12
**Updated by:** Claude
**Phase:** Phase 1 Inventory — Review of Entry 023 (4I commit, checkout hardening, ledger backfill) + test/opening quantity handling
**Session type:** Review + decision proposal

### Context
Review of Entry 023, requested by Codex (specifically the production ledger backfill). Ryan also disclosed the root cause of the checkout failure: he edited inventory quantities directly in Supabase to test different materials. It was a mistake, but it surfaced a latent problem (seeded balances had no ledger baseline) before it could grow. This entry records the review and proposes a sanctioned approach to test and opening quantities.

### Review Findings — Entry 023
- Documentation alignment confirmed resolved: ARCHITECTURE v2.7, HANDOFF current; Entry 023 written in standard format with the correct sequential number. The Rule 19 standard is holding.
- Resolved warnings carried forward from prior reviews — all approved:
  - Division scoping on candidate/reference reads — server-side scoped views (`202606120001`).
  - Overdraw/concurrency — checkout quantity aggregated by `bin_item_id` plus `inventory_balances_quantity_nonnegative` constraint as the hard floor.
  - `default_permissions_for_role` repo drift — resolved in-repo by `202606110001`.
- Per-line finalize fix (skip cart-level destination validation when `p_line_destinations` is supplied; aggregate by `bin_item_id`) — correct.
- Apply Destination to All Lines UI — the per-line-capable + cart-level-convenience pattern recommended in Entry 019. Correct.
- **Ledger baseline backfill — APPROVED as a correct repair.** Root cause: seeded `inventory_balances` had no corresponding ledger rows (a latent Rule 1 violation). The first real checkout made the balance trigger compute a negative value (only the removal existed, no baseline behind it), tripping `inventory_balances_quantity_nonnegative`. The fix inserted 9 approved `physical_count_correction` rows totaling 389 (matches the seeded EMT quantities exactly: 100+25+35+45+55+15+10+5+99), so balances are now transaction-derived. Sanctioned mechanism (Section 12), explicit approval obtained, the transaction-derived rule preserved.
  - VERIFY: the baseline rows carry catalog `unit_cost_at_time` so inventory valuation is not $0.
  - VERIFY: the corrections are audited per Section 12 (a migration insert may bypass the in-app audit hook), or are explicitly documented as a one-time setup backfill.

### Root Cause (logged)
The 023 checkout failure originated from direct edits to inventory quantities in Supabase during testing. Direct edits to `inventory_balances` bypass the ledger and violate Rule 1 (balances are transaction-derived) and Rule 8 (no direct DB edits outside controlled tools). This was an honest testing mistake; it usefully exposed that the seed process had the same flaw. Corrective principle, already in force and restated: quantities are never set by editing `inventory_balances` directly — only through approved ledger transactions (`physical_count_correction` or `add_stock`).

### Proposed Decision — Test & Opening Quantity Handling (pending Ryan confirm)
One mechanism, used at three moments:
1. **Sanctioned quantity entry.** A "Set/Adjust Quantity" admin action that takes a target quantity, computes the delta, and writes a `physical_count_correction` (delta) transaction. This is not throwaway test scaffolding — it is the real production physical-count feature. Open choice: build this RPC now (removes the direct-edit temptation that caused the failure) vs. keep doing manual tagged count-correction inserts until later.
2. **Tag pre-release adjustments.** Every quantity change made before go-live is a `physical_count_correction` carrying a clear marker (e.g. note/reason `pre-release testing`) so test data is unambiguously identifiable.
3. **Go-live reset.** At go-live, clear the pre-release test ledger (all test data), then load verified opening balances as fresh count-correction rows dated at go-live. Clean, transaction-derived ledger from day one.
Across all three: nothing ever writes `inventory_balances` directly.

### Decisions Made This Session (locked)
- Restated existing rules with teeth: direct `inventory_balances` edits are forbidden for everyone, including manual Supabase edits during testing. All quantity establishment/adjustment goes through approved ledger transactions (Rule 1 / Rule 8).

### Lock Document Changes
- None yet. On Ryan's confirmation of the quantity-handling approach, lock it in the relevant inventory section (Section 12 transaction types and/or Section 23 balance cache) and bump the ARCHITECTURE version.

### What Codex Needs to Know
- Never edit `inventory_balances` directly. Use `physical_count_correction` / `add_stock` transactions for all quantity changes, test or real.
- Verify the backfill rows' `unit_cost_at_time` and audit-trail status (above).
- Pending Ryan confirm: a "Set/Adjust Quantity" admin RPC (count-correction-backed) may be the next small build; it doubles as the production physical-count feature and as the go-live opening-balance tool.

### What Claude Needs to Know
- Root cause of the 023 failure was a direct DB edit, not a logic error in the checkout path. The corrective approach is proposed above and pending confirmation.

### Next Steps (in order)
1. Confirm Netlify is serving HEAD `c215bc7`; run one clean post-fix checkout and inspect the resulting `inventory_transactions` / `transaction_items` / `inventory_balances` rows (from Entry 023).
2. Ryan confirms the test/opening-quantity approach; then lock it in ARCHITECTURE and bump the version.
3. (Likely) build the Set/Adjust Quantity admin RPC (count-correction-backed) as both the test tool and the real physical-count feature.
4. Build the transaction-history review surface before express checkout.

### Open Questions / Concerns
- Choose: build the Set/Adjust Quantity RPC now vs. manual tagged count-correction inserts for testing until later.
- Backfill rows: confirm `unit_cost_at_time` and audit-trail status.
- Carried: office destination semantics; user→vehicle assignment source.

### Architecture Drift Warnings
- NEW (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities (Rule 1 / Rule 8). Pre-release test adjustments use count-correction and are tagged for go-live cleanup.
- CARRIED FORWARD (active): confirm Netlify deploy on HEAD `c215bc7`; inspect one clean post-fix checkout in Supabase.
- CARRIED FORWARD (active): verify backfill rows carry `unit_cost_at_time` and are audited or documented as a one-time setup backfill.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent (consumption vs storage location).
- CARRIED FORWARD (next step): user→vehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 025

**Date:** 2026-06-12  
**Updated by:** ChatGPT  
**Phase:** Phase 1 Inventory — Milestone 4J Developer-only count correction tool functional  
**Session type:** Implementation documentation update

### Context
After Entry 024 reviewed the direct `inventory_balances` edit problem and proposed a sanctioned quantity adjustment mechanism, Ryan proceeded with the next milestone: a Developer-only Set / Adjust Quantity tool backed by `physical_count_correction` ledger transactions. Ryan reported that the Developer count tool appears to be functioning properly. This entry records the reported functional state and carries forward remaining verification items.

### What Was Completed
- **Milestone 4J Developer-only count correction tool appears functional.**
- A controlled Set / Adjust Quantity workflow was built to replace direct testing edits to `inventory_balances`.
- The tool is intended to write approved `physical_count_correction` ledger rows rather than directly setting `inventory_balances`.
- The workflow supports the testing/pre-release need identified in Entry 024: Ryan can adjust quantities safely without breaking the transaction-derived balance model.
- Ryan reported that the Developer count tool is functioning properly.

### Schema Changes
- A controlled RPC for setting inventory count quantity was added or expected to have been added during 4J.
- The exact migration filename, RPC signature, and commit hash still need to be confirmed by Codex and recorded in the next implementation entry if not already documented.

### Code / File Changes
- Developer-only count correction UI and supporting hook/RPC wiring were added or expected to have been added during 4J.
- The exact pushed commit hash and changed files still need to be confirmed.

### Lock Document Changes
- None. ARCHITECTURE.md remains v2.7.

### What Codex Needs to Know
- The Developer-only count correction tool is the approved replacement for direct `inventory_balances` edits during testing.
- The RPC must enforce Developer-only access server-side, not merely hide the UI.
- All quantity adjustments must continue to create ledger transactions, preferably `physical_count_correction`, and must never directly edit `inventory_balances`.
- Before starting 4K, confirm:
  - the 4J commit hash;
  - the migration filename;
  - the RPC name/signature;
  - that the migration was applied live to project `keogysnoukbendfkfjcn`;
  - that production is deployed to the 4J commit;
  - that the Developer-only gate is enforced server-side.

### What Claude Needs to Know
- Entry 024's proposed corrective path has moved from proposal to implementation: a Developer-only physical count / set quantity tool exists and is reportedly functional.
- This mitigates the direct-edit testing risk by providing a controlled ledger-backed path.

### Next Steps (in order)
1. Confirm and record the exact 4J commit hash, migration filename, RPC signature, and live migration/deploy status.
2. Build Milestone 4K: Inventory Transaction History / Review Surface before Express Checkout.
3. Continue to defer Express Checkout, Manager Override, approver passcode, and completion worklist until normal transaction history is inspectable.

### Open Questions / Concerns
- Exact 4J commit hash and migration filename were not recorded in this entry.
- Confirm whether the 4J commit has been pushed to GitHub and whether Netlify is serving it.
- Confirm the RPC is Developer-only server-side, not merely hidden in the UI.
- Confirm baseline/setup and pre-release count-correction rows carry `unit_cost_at_time` and enough note/reason/audit context for future cleanup.
- Office destination semantics remain unresolved.
- User→vehicle active assignment source remains absent; vehicle snapshot remains NULL by design until it exists.

### Architecture Drift Warnings
- RESOLVED / MITIGATED: direct quantity testing by editing `inventory_balances` now has a controlled replacement path through the Developer-only count correction tool.
- CARRIED FORWARD (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities (Rule 1 / Rule 8).
- CARRIED FORWARD (active): verify exact 4J commit hash, migration filename, RPC signature, pushed/deployed status, and live Developer-only enforcement.
- CARRIED FORWARD (active): build transaction/history review surface before Express Checkout so normal checkout and count corrections are inspectable.
- CARRIED FORWARD (active): verify backfill and count-correction rows carry `unit_cost_at_time` and are audited or documented as one-time setup/pre-release rows.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent (consumption vs storage location).
- CARRIED FORWARD (next step): user→vehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 026

**Date:** 2026-06-15
**Updated by:** Claude
**Phase:** Phase 1 Inventory — Review of Milestone 4K (Transaction History Review Surface) + 4J gate verification + ledger verification
**Session type:** Review

### Context
Claude reviewed the 4K review packet: the `read_inventory_transaction_history` RPC plus a TransactionHistoryPanel UI/hook, bundled with 4J Developer-only gate verification, numeric-input UX fix, and ledger verification queries. The 4K migration `202606150001` was staged but not yet applied live at the time of review.

### Review Findings — Milestone 4K
- **APPROVED to commit and apply live.** Developer-only-first visibility is accepted as the safe first version.
- **Read-only confirmed.** The RPC is SELECT-only; the hook calls only `read_inventory_transaction_history`; no insert/update/delete is introduced.
- **Permission gate passes Rule 4.** The RPC is `SECURITY DEFINER`, uses `auth.jwt() ->> 'sub'`, requires an active `user_permissions` row, fails closed without a caller, and requires `caller.role = 'Developer'`.
- **Division scoping.** Developer-only-for-now is the conservative choice because the division-scoped read rule is not locked yet. History must not be widened beyond Developer until division scoping and per-role field visibility are defined.
- **Responsive behavior.** The history toolbar collapses below 900px and the table converts to mobile cards below 640px. This aligns with Rule 18.
- **Numeric input fix.** Cart candidate quantity now stores in-progress values as strings, allows temporary blank state while editing, and clamps only on blur/Add. Server-side validation remains authoritative.

### Verification Closures
- 4J Developer-only gate is enforced server-side in `set_inventory_count_quantity` with a fail-closed `caller.role <> 'Developer'` check.
- Baseline backfill rows carry `unit_cost_at_time` (9 rows, 0 null; zeros only where catalog price is genuinely 0).
- Developer count-correction rows carry `unit_cost_at_time` (6 rows, all 9.17).
- Clean post-fix normal checkout was inspected: `remove_stock` header, 4 line items, `destination_type = user`, `unit_cost_at_time` populated, and actor recorded.
- Cached `inventory_balances` match the ledger-derived calculation with zero mismatches across 9 rows.
- Transaction headers record actor (`user_id` + `performed_by_name`) and timestamps.

### Code / File Changes (reviewed, not yet committed at review time)
- New: `src/hooks/useInventoryTransactionHistory.js`.
- New: `supabase/migrations/202606150001_inventory_transaction_history_review.sql`.
- Modified: `src/App.jsx` for TransactionHistoryPanel and numeric input fix.
- Modified: `src/styles.css` for history and responsive rules.

### Minor / Housekeeping
- `GRANT EXECUTE ... TO anon` is unnecessary because the body fails closed, but harmless.
- `cart_id` returns NULL because current ledger rows do not store cart ID. Acceptable for now.
- `.netlify/` is untracked and must not be committed.

### Lock Document Changes
- None. ARCHITECTURE remains v2.7.
- Candidate principle, not locked yet: read/history surfaces default to Developer-only until a division-scoped read rule is defined.

### What Codex Needs to Know
- 4K is approved: commit as `Add inventory transaction history review surface`, apply migration `202606150001` live to `keogysnoukbendfkfjcn`, then runtime-test the history RPC from the app.
- Keep the surface read-only.
- Do not widen visibility beyond Developer until the division-scoping read rule is defined and applied.
- Add `.netlify/` to `.gitignore` if needed and do not commit `.netlify/`.

### What Claude Needs to Know
- 4K is the verification lens that closed the 4J gate, backfill unit-cost verification, clean checkout inspection, ledger integrity, and transaction-header audit completeness items.
- The ledger is now confirmed healthy and transaction-derived.

### Next Steps (in order)
1. Commit 4K, apply migration `202606150001` live, and runtime-test the history RPC from the app.
2. Improve actor display in the history surface so records show the readable display name where available instead of raw Clerk IDs.
3. Define the division-scoped read rule before exposing history or any broad read surface beyond Developer.
4. Resolve office destination semantics (consumption vs storage location).
5. Continue deferring Express Checkout / Manager Override until the normal path + history are verified in the live UI.

### Open Questions / Concerns
- Whether to lock the "read surfaces are Developer-only until division-scoping is defined" principle in ARCHITECTURE.
- Office destination semantics.
- User→vehicle assignment source remains absent; vehicle snapshot NULL by design until it exists.

### Architecture Drift Warnings
- RESOLVED: 4J Developer-only gate server enforcement; backfill/count-correction `unit_cost_at_time`; clean checkout inspection; balance/ledger integrity; transaction-header audit completeness.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): improve transaction history actor display to prefer display name/email over raw Clerk user ID.
- CARRIED FORWARD (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): apply 4K migration live and runtime-test the RPC.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (next step): user→vehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 027

**Date:** 2026-06-15
**Updated by:** ChatGPT
**Phase:** Phase 1 Inventory — Current lock-in checkpoint after Claude 4K approval
**Session type:** Handoff consolidation / next-step sequencing

### Context
Ryan asked to lock in the current state and generate updated coordination documents before proceeding further. Claude approved Milestone 4K to commit and apply live, and Ryan asked that the transaction history actor display-name improvement be added as one of the next steps. Ryan also asked whether an ARCHITECTURE update was needed.

### What Was Completed
- Consolidated the current handoff through Entry 027.
- Recorded Claude's 4K approval and current next-step sequence.
- Added a specific next step to improve transaction history actor display so history rows prefer a readable display name/email over raw Clerk user IDs.
- Confirmed that no ARCHITECTURE update is required for this checkpoint because no new architecture rule has been locked. ARCHITECTURE remains v2.7.

### Decisions Made This Session
- **No ARCHITECTURE bump for actor display-name polish.** Showing display names in transaction history is an implementation/display improvement, not an architecture change. The read path remains Developer-only and read-only.
- **Do not lock the Developer-only read-surface convention yet.** The current convention remains: broad/sensitive read surfaces stay Developer-only until a division-scoped read rule is designed. Ryan may later decide to lock this into ARCHITECTURE, but for now the actual locked decision should wait until the real division-scoped read rule is defined.
- **Actor display should prefer readable names.** The next implementation should update `read_inventory_transaction_history` to prefer `inventory_transactions.performed_by_name`, then `user_permissions.display_name`, then `user_permissions.email`, and only show raw Clerk ID as the final fallback.

### Schema Changes
- None in this documentation checkpoint.
- Expected next implementation will update the 4K history RPC/read path only; it should remain read-only and Developer-only.

### Code / File Changes
- No code changed by this documentation checkpoint.
- `HANDOFF.md` updated through Entry 027.
- `ARCHITECTURE.md` not changed; v2.7 remains current.

### What Codex Needs to Know
- Proceed from HANDOFF Entry 027 and ARCHITECTURE v2.7.
- Commit 4K as approved if it has not already been committed, using: `Add inventory transaction history review surface`.
- Apply migration `202606150001_inventory_transaction_history_review.sql` live to Supabase project `keogysnoukbendfkfjcn` if it has not already been applied.
- Runtime-test the Transactions tab from the app after the migration exists.
- Improve history actor display so rows show a readable display name/email instead of raw Clerk ID wherever possible.
- Keep the history surface read-only and Developer-only until division-scoped read rules are designed.
- Do not start Express Checkout, Manager Override, approver passcode, or completion worklist yet.
- Do not edit `inventory_balances` directly.

### What Claude Needs to Know
- 4K was approved by Claude and is ready for commit/live migration/runtime test.
- Actor display-name polish was added as a next implementation step.
- No ARCHITECTURE update was made; v2.7 remains current.
- The decision whether to lock Developer-only read surfaces until division scoping exists remains open and should be revisited when the division-scoped read rule is designed.

### Next Steps (in order)
1. If not already done, commit 4K with message: `Add inventory transaction history review surface`.
2. If not already done, apply migration `202606150001_inventory_transaction_history_review.sql` live to `keogysnoukbendfkfjcn`.
3. Runtime-test the Transactions tab from the app and confirm history rows return.
4. Update history actor display so rows prefer: `performed_by_name` → `user_permissions.display_name` → `user_permissions.email` → raw Clerk `user_id` fallback.
5. Define the division-scoped read rule before exposing history or any broad/sensitive read surface beyond Developer.
6. Resolve office destination semantics: office as singleton consumption destination vs tracked storage/transfer location.
7. Keep Express Checkout / Manager Override deferred until the normal path and history surface are verified live.

### Open Questions / Concerns
- Has 4K been committed and pushed after Claude approval?
- Has migration `202606150001` been applied live and runtime-tested from the app?
- Should read surfaces remain Developer-only by convention only, or should this be locked into ARCHITECTURE before division scoping is designed?
- Office destination semantics remain unresolved.
- User→vehicle assignment source remains absent; vehicle snapshot NULL by design until it exists.

### Architecture Drift Warnings
- CARRIED FORWARD (active): apply 4K migration live and runtime-test the RPC from the app if not already done.
- CARRIED FORWARD (active): improve history actor display to prefer readable display name/email over raw Clerk user ID.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (next step): user→vehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 028

**Date:** 2026-06-15
**Updated by:** Claude
**Phase:** Coordination / governance — escalation protocol locked
**Session type:** Decision

### Context
Ryan asked to lock the "when must Claude be involved" routing rule into the architecture so it is canonical rather than living only in a pasted prompt (which would itself be a drift risk — the exact failure mode Rule 19 exists to prevent). He will then start fresh chats across all models from the updated ARCHITECTURE and HANDOFF.

### Decisions Made This Session (locked)
- **Escalation protocol locked into Section 30 (AI Development Roles); ARCHITECTURE → v2.8.** Core principle: Claude is required when an architectural decision is being *made* or a locked rule is *touched* — not when a settled decision is being *implemented*. Codex MUST route to Claude before proceeding when work involves: any ARCHITECTURE.md change; a new decision not already covered by the lock document; anything touching a locked invariant (ledger/balances, permissions, audit, approval/status meaning, cost snapshots, per-line destinations, source-of-truth, no-direct-DB-edit); schema changes; a new inventory/money/permission write path; build-sequence/ordering questions; conflicts with the lock doc or a prior HANDOFF decision; a constitutional-rule violation flag; starting a deferred major feature (express checkout/manager override, developer override, division-scoped read rule, Financials/job-cost, RN companion app); documentation drift; or anything touching live production data/repair.
- **Proceed-without-Claude conditions (all must hold):** implements an already-locked decision; no change to schema/permissions/ledger/audit/constitutional rules; a read-only surface in an approved scope, or a bug fix / UX-styling / refactor leaving invariants untouched; test/seed quantities via `physical_count_correction` only, never direct `inventory_balances` edits.
- **Required routing verdict:** every Codex work summary ends with exactly one line — `No Claude review needed — within locked decisions (ARCHITECTURE v__, HANDOFF Entry __).` or `Claude review required before proceeding — [trigger].` This makes "if Codex says bring it to Claude, do it" a reliable rule.
- Tie-breaker recorded: if a trigger is even arguably hit (especially invariants or schema), route to Claude; an unnecessary review is cheap, a missed one on a locked invariant is an expensive retrofit.

### Lock Document Changes
- ARCHITECTURE → v2.8: Section 30 gains the "When Claude Must Be Involved (Escalation Protocol)" subsection, expanding the existing Mid-Build Review Trigger into a decision-ready MUST/PROCEED rule plus the required routing verdict.
- No constitutional rule added; the protocol lives in Section 30 (roles/process). Ryan may elevate it to a numbered rule later if he wants it to carry constitutional weight and trigger mandatory review flags.

### What Codex Needs to Know
- Read Section 30's escalation protocol and apply it. End every work summary with the routing-verdict line.
- Build against ARCHITECTURE **v2.8** and HANDOFF **Entry 028**.
- All prior next-steps stand: commit/apply/runtime-test 4K (`202606150001`); improve history actor display (`performed_by_name` → `display_name` → `email` → raw Clerk ID); keep history read-only and Developer-only until the division-scoped read rule is defined; resolve office destination semantics; keep Express Checkout deferred.

### What Claude Needs to Know
- The routing rule is now canonical in Section 30, not just a pasted prompt. Future sessions start from v2.8 / Entry 028.

### Next Steps (in order)
1. Ryan commits ARCHITECTURE v2.8 and HANDOFF (through Entry 028) to the repo and `Current Docs`; prior versions to `Outdated`.
2. Ryan starts fresh chats across all models from these two documents.
3. Resume Phase 1 inventory per the carried-forward next steps: commit/apply/runtime-test 4K; actor display-name improvement; then define the division-scoped read rule and resolve office semantics.

### Open Questions / Concerns
- Whether to later elevate the escalation protocol to a numbered constitutional rule.
- Has 4K been committed, the migration applied live, and the Transactions tab runtime-tested?
- Office destination semantics; user→vehicle assignment source (carried).

### Architecture Drift Warnings
- RESOLVED: routing rule was a working convention / pasted prompt only — now canonical in Section 30 (v2.8).
- CARRIED FORWARD (active): apply 4K migration `202606150001` live and runtime-test the history RPC from the app.
- CARRIED FORWARD (active): improve history actor display to prefer readable display name/email over raw Clerk user ID.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities (Rule 1 / Rule 8).
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent (consumption vs storage/transfer location).
- CARRIED FORWARD (next step): user→vehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 029

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Phase 1 Inventory — Milestone 4K closeout and transaction-history actor display polish
**Session type:** Implementation / live verification / documentation update

### Context
Work resumed from ARCHITECTURE v2.8 and HANDOFF Entry 028. The repo copy of the coordination documents was behind the canonical files Ryan provided at session start, so `docs/ARCHITECTURE.md` was synced to v2.8 and `HANDOFF.md` was synced through Entry 028 before this entry was appended. No new architecture decision was made during that sync; Codex used Claude's already-authored v2.8 / Entry 028 content as the source.

### What Was Completed
- Confirmed 4K was already committed locally at `906051d` with message `Add inventory transaction history review surface`.
- Confirmed the 4K migration file exists in repo: `supabase/migrations/202606150001_inventory_transaction_history_review.sql`.
- Confirmed the 4K migration was already applied live in Supabase project `keogysnoukbendfkfjcn` as migration `20260615203424` / `inventory_transaction_history_review`.
- Implemented transaction-history actor display polish in commit `d617d6c` (`Polish inventory transaction history actor display`).
- Updated the history read path so `actor_name` now prefers `inventory_transactions.performed_by_name`, then `user_permissions.display_name`, then `user_permissions.email`, then raw Clerk `user_id`.
- Updated the Transactions table/mobile card UI to display the resolved actor.
- Kept the history surface read-only and Developer-only.
- Did not add permission flags, widen role access, define division-scoped read rules, edit `inventory_balances`, add quantity adjustments, start Express Checkout, alter office semantics, or start user→vehicle assignment work.

### Schema Changes
- No table, column, permission-flag, ledger, audit, balance, destination-semantics, or write-path schema change was made.
- Added a follow-up RPC replacement migration:
  - `supabase/migrations/202606160001_inventory_transaction_history_actor_display.sql`
- The migration only replaces existing function `public.read_inventory_transaction_history(integer, text, text)` with the same return shape and Developer-only gate, adding a read-only `LEFT JOIN` to `user_permissions` for actor fallback display.

### Code / File Changes
- Already-present 4K commit:
  - `906051d` — `Add inventory transaction history review surface`
- New implementation commit:
  - `d617d6c` — `Polish inventory transaction history actor display`
- Files changed by `d617d6c`:
  - `src/App.jsx`
  - `src/styles.css`
  - `supabase/migrations/202606160001_inventory_transaction_history_actor_display.sql`
- Documentation files synced/updated in this documentation pass:
  - `docs/ARCHITECTURE.md` synced to v2.8 from the provided canonical copy.
  - `HANDOFF.md` synced through Entry 028 from the provided canonical copy, then Entry 029 appended.
- `.netlify/` remained ignored and was not staged or committed.
- `4K_REVIEW_PACKET.md` remained untracked and was not staged or committed.

### Live Migration / Runtime Test Status
- Live migration status:
  - `20260615203424` / `inventory_transaction_history_review` was already applied.
  - `20260616105748` / `inventory_transaction_history_actor_display` was applied successfully.
- Live RPC verification:
  - With the active Developer Clerk subject, `read_inventory_transaction_history(5, NULL, NULL)` returned history rows.
  - Returned rows showed readable actor display (`Christopher Noel`) instead of only the raw Clerk user ID.
  - A fake / non-permissioned subject failed closed with `active user permission record is required`.
  - Function-definition inspection confirmed the Developer gate remains present and no `INSERT`, `UPDATE`, or `DELETE` keywords exist in the RPC body.
- Browser/runtime limitation:
  - `npm run build` passed.
  - A local browser app test could not be completed because local Vite env vars were not present in the shell and the in-app browser backend failed before navigation. The verified live runtime evidence for this pass is the production Supabase RPC result above.

### Build Result
- `cmd /c npm run build` passed.

### Lock Document Changes
- No new architecture rule or decision was authored by Codex.
- Repo `docs/ARCHITECTURE.md` was synced to the already-authored Claude v2.8 canonical copy supplied by Ryan.
- HANDOFF remains append-only; Entry 029 was appended after Entry 028.

### What Codex Needs to Know
- The Inventory Transaction History surface remains read-only and Developer-only.
- The live history RPC now resolves actor display using `performed_by_name` → `display_name` → `email` → raw Clerk ID.
- The division-scoped read rule is still not designed and history must not be exposed beyond Developer until Claude/Ryan lock that rule.
- Do not start Express Checkout, Manager Override, approver passcode, completion worklist, office semantics, user→vehicle assignment, or division-scoped read work from this entry.
- Continue never editing `inventory_balances` directly.

### What Claude Needs to Know
- 4K was already committed and already applied live before this pass.
- Codex applied only the already-requested actor-display polish through a read-only replacement of the existing Developer-only history RPC.
- No permission widening, ledger/balance change, destination-semantics change, or new write path was introduced.
- Browser UI verification remains the only incomplete runtime item because local env/browser automation was unavailable; live RPC verification succeeded.

### Next Steps (in order)
1. If Ryan wants visual confirmation, test the production Transactions tab from a logged-in Developer browser session and confirm the Actor column/card field is visible.
2. Keep the history surface Developer-only until the division-scoped read rule is designed and locked.
3. Resolve office destination semantics before office is treated as permanent behavior.
4. Continue carrying forward user→vehicle assignment source work for the future vehicle snapshot phase.
5. Keep Express Checkout / Manager Override deferred until normal transaction history and scoping are fully settled.

### Open Questions / Concerns
- Browser UI verification of the Transactions tab still needs a logged-in Developer browser session because local runtime env was unavailable and in-app browser automation failed before navigation.
- Division-scoped history visibility remains intentionally undefined and must not be inferred in this pass.
- Office destination semantics remain unresolved.
- User→vehicle active assignment source remains absent; vehicle snapshot remains NULL by design until it exists.

### Architecture Drift Warnings
- RESOLVED: 4K commit status — commit `906051d` exists locally.
- RESOLVED: 4K live migration status — `inventory_transaction_history_review` exists live.
- RESOLVED: actor display polish — implemented and applied live with readable actor fallback order.
- RESOLVED: build check — `npm run build` passed.
- CARRIED FORWARD (active): production UI/browser visual verification from a logged-in Developer session.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (next step): user→vehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.8, HANDOFF Entry 028).

---

## Entry 030

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Coordination documents — HANDOFF encoding normalization
**Session type:** Documentation repair

### Context
Ryan paused acceptance of the HANDOFF diff after a large external deletion count appeared. Claude reviewed and cleared the Rule 20 repair plan for encoding-only normalization. This entry records the documentation-format repair only.

### What Was Completed
- Removed the UTF-8 BOM from `HANDOFF.md`.
- Normalized `HANDOFF.md` line endings to LF with exactly one trailing newline.
- Verified the `## Entry Format Standard` preamble is present near the top of `HANDOFF.md`.
- Confirmed mojibake glyphs were repaired for em dash and right-arrow characters.
- Added repo-root `.gitattributes` to enforce LF normalization.
- Added repo-root `.editorconfig` to document UTF-8, LF endings, final newline, and no trailing-whitespace trimming.
- Ran `git add --renormalize .` after adding text-normalization rules.
- Verified Entries 001–028 remained unchanged after normalization except for the cleared formatting/encoding repair scope.

### Schema Changes
- None.

### Code / File Changes
- `HANDOFF.md` encoding and line-ending normalization only, plus this Entry 030.
- Added `.gitattributes`.
- Added `.editorconfig`.

### Lock Document Changes
- None. ARCHITECTURE.md was not changed.

### What Codex Needs to Know
- Treat coordination-document encoding normalization as documentation repair only.
- Keep future edits UTF-8 without BOM and LF-normalized.
- Do not use PowerShell UTF-8-with-BOM writes for coordination documents.

### What Claude Needs to Know
- This repair followed the Claude-reviewed Rule 20 plan surfaced to Ryan.
- No code, schema, permission, ledger, audit, destination-semantics, or feature work was performed.

### Next Steps (in order)
1. Ryan reviews the verification output for the encoding repair.
2. Resume implementation only after Ryan accepts the repaired documentation diff.

### Open Questions / Concerns
- None for this encoding repair.

### Architecture Drift Warnings
- RESOLVED: `HANDOFF.md` BOM removed.
- RESOLVED: `HANDOFF.md` line endings normalized to LF.
- RESOLVED: `HANDOFF.md` Entry Format Standard preamble verified present.
- RESOLVED: HANDOFF mojibake glyphs corrected.

### Routing Verdict
Claude review required before proceeding — already reviewed/cleared this session per Rule 20; report verification output for final confirmation.

---

## Entry 031

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Phase 1 Inventory — Milestone 4L Add All cart picker UI
**Session type:** Implementation

### Context
Work resumed after Milestone 4K was committed and closed per Entry 029. Ryan asked Codex to first visually verify the production Transactions tab from a logged-in Developer browser session, then proceed to Milestone 4L only if it could be implemented as UI-only through the existing approved `add_inventory_cart_item(p_cart_id, p_bin_item_id, p_quantity)` RPC.

The repo `docs/ARCHITECTURE.md` was already v2.9 at session start. HANDOFF still ended at Entry 030, so this clean append also records the current v2.9 baseline without editing prior entries.

### What Was Completed
- Attempted production browser verification for the Transactions tab from the logged-in browser path. The browser-control bridge failed before it could attach to Chrome or the in-app browser, so visual verification remains carried forward.
- Implemented Milestone 4L as UI-only cart picker polish:
  - stocked candidate quantity inputs now default to `0`;
  - single-row `Add` now requires a quantity greater than `0`;
  - added an `Add All` button for stocked candidate rows with quantity greater than `0`;
  - `Add All` calls the existing `cartState.addItem` path once per selected row, preserving the existing `add_inventory_cart_item(p_cart_id, p_bin_item_id, p_quantity)` RPC as the only write path;
  - successfully added rows reset their quantity inputs back to `0`.
- Kept server-side validation authoritative. The UI clamps only for input hygiene and does not bypass RPC validation.

### Schema Changes
- None.

### Code / File Changes
- `src/App.jsx`
  - Default cart candidate quantity changed from `1` to `0`.
  - Added selected-row counting and sequential `Add All` handling through the existing cart hook.
  - Kept single-row add on the existing `cartState.addItem` path.
- `src/styles.css`
  - Added responsive toolbar styling for the search + `Add All` control group.
- `HANDOFF.md`
  - Appended this Entry 031 only.

### Lock Document Changes
- None. `docs/ARCHITECTURE.md` was not edited during this pass.
- Current repo baseline is `docs/ARCHITECTURE.md` v2.9, which includes Rule 20 and preserves the v2.8 Section 30 routing rule.

### What Codex Needs to Know
- Milestone 4L was implemented as UI-only.
- Do not replace this with a batch RPC unless Ryan/Claude explicitly approve a new write-path design.
- `Add All` is intentionally a client-side loop over the existing sanctioned add-to-cart RPC.
- The cart still does not reserve stock, create `transaction_items`, affect `inventory_balances`, change schema, change permissions, or alter checkout/finalization behavior.
- Express Checkout, Manager Override, approver passcode, completion worklist, division-scoped read rules, office destination semantics, and user→vehicle assignment remain out of scope.

### What Claude Needs to Know
- No schema, permission, ledger, audit, destination-semantics, checkout, or balance behavior was changed.
- No direct mutation of cart tables was introduced in React; the UI continues to call the existing cart hook.
- The only write-capable call added by this milestone is repeated use of the existing approved `add_inventory_cart_item` RPC via `cartState.addItem`.
- Production Transactions-tab visual verification is still incomplete because browser automation could not attach to a logged-in Developer browser session.

### Next Steps (in order)
1. Ryan or a working logged-in browser session visually verifies the production Transactions tab for Developer.
2. Ryan tests the 4L picker in production or a logged-in local session: open cart, enter quantities greater than `0` for multiple stocked rows, click `Add All`, and confirm only selected rows are added.
3. Keep history Developer-only until the division-scoped read rule is designed and locked.
4. Resolve office destination semantics before office is treated as permanent behavior.
5. Continue carrying forward user→vehicle assignment source work for the future vehicle snapshot phase.
6. Keep Express Checkout / Manager Override deferred.

### Open Questions / Concerns
- Production visual verification of the Transactions tab remains blocked in Codex because both Chrome and in-app browser automation failed before navigation.
- `Add All` is not all-or-nothing. Because no batch RPC was introduced, earlier rows may be added before a later row fails server validation.
- Division-scoped history visibility remains intentionally undefined.
- Office destination semantics remain unresolved.

### Architecture Drift Warnings
- RESOLVED: 4L stayed UI-only and used the existing approved `add_inventory_cart_item` RPC path.
- RESOLVED: build check passed with `cmd /c npm run build`.
- CARRIED FORWARD (active): production UI/browser visual verification from a logged-in Developer session.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (next step): user→vehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.9, HANDOFF Entry 031).

---

## Entry 032

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Phase 1 Inventory — Milestone 4M Add All cart picker polish
**Session type:** Implementation

### Context
Work resumed after Milestone 4L was pushed at commit `a1fd0455f318387cf8d256a0fc60e3cdde9fc52e`. Ryan asked Codex to verify the v2.9 / Entry 031 baseline, attempt production UI/browser verification, and push the next safe step only if it remained UI-only and continued using the existing approved `cartState.addItem(...)` / `add_inventory_cart_item(p_cart_id, p_bin_item_id, p_quantity)` path.

### What Was Completed
- Confirmed local `main` matched `origin/main` at `a1fd0455f318387cf8d256a0fc60e3cdde9fc52e` before implementation.
- Confirmed `docs/ARCHITECTURE.md` is v2.9.
- Confirmed HANDOFF ended at Entry 031 before this append.
- Attempted production browser verification through the logged-in Chrome path. The browser-control bridge failed before attaching to Chrome, so production visual verification remains carried forward and was not claimed as complete.
- Implemented Milestone 4M as UI-only Add All / cart picker polish:
  - selected-row count and selected total quantity are shown in the stocked candidate picker;
  - `Add All` shows progress while the client-side add loop is running;
  - `Add All` and single-row `Add` remain disabled when quantity is `0`;
  - successful rows reset to `0`;
  - failed rows keep their entered quantities;
  - per-row success/failure messages are surfaced;
  - added a `Clear Quantities` button;
  - improved the empty/guard message when no rows have quantity greater than `0`;
  - improved responsive layout for the picker status controls.

### Schema Changes
- None.

### Code / File Changes
- Implementation commit: `c64f6767a54887609ed0bd54d5d5d6b19a9696df` (`Polish cart picker Add All feedback`).
- Push result for implementation commit: `a1fd045..c64f676  main -> main`.
- Files changed in implementation commit:
  - `src/App.jsx`
  - `src/styles.css`
- This documentation entry appends Entry 032 only.

### Lock Document Changes
- None. `docs/ARCHITECTURE.md` was not edited.

### What Codex Needs to Know
- 4M stayed UI-only.
- The Add All behavior remains a client-side loop over the existing sanctioned `cartState.addItem(...)` hook path.
- No new RPC, batch server function, schema, migration, permission, ledger, balance, checkout, finalization, division-scoped read rule, office semantics, user→vehicle assignment, Express Checkout, Manager Override, approver passcode, or completion worklist work was started.
- Production UI/browser verification remains blocked from Codex until browser automation can attach to a logged-in Developer browser session.

### What Claude Needs to Know
- No architecture-trigger work was performed.
- No direct mutation of `inventory_cart_items`, `inventory_balances`, or `transaction_items` was introduced.
- The only write-capable app path used by the changed UI remains the existing approved `cartState.addItem(...)` path.

### Next Steps (in order)
1. Ryan or a working logged-in browser session visually verifies the production Transactions tab for Developer and confirms the Actor column/card field shows a readable actor name.
2. Ryan tests the 4M picker in production or a logged-in local session: open cart, enter quantities greater than `0` for multiple stocked rows, click `Add All`, confirm selected rows add, successful rows reset to `0`, and any failed rows keep their quantities.
3. Keep history Developer-only until the division-scoped read rule is designed and locked.
4. Resolve office destination semantics before office is treated as permanent behavior.
5. Continue carrying forward user→vehicle assignment source work for the future vehicle snapshot phase.
6. Keep Express Checkout / Manager Override deferred.

### Open Questions / Concerns
- Production visual verification remains blocked in Codex because the Chrome browser-control bridge failed before attaching to the logged-in session.
- `Add All` remains intentionally not all-or-nothing because no batch RPC was introduced.
- Division-scoped history visibility remains intentionally undefined.
- Office destination semantics remain unresolved.

### Architecture Drift Warnings
- RESOLVED: 4M stayed UI-only and used the existing approved `cartState.addItem(...)` path.
- RESOLVED: build check passed with `cmd /c npm run build`.
- RESOLVED: implementation commit pushed to `origin/main`.
- CARRIED FORWARD (active): production UI/browser visual verification from a logged-in Developer session.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (next step): user→vehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.9, HANDOFF Entry 031).

---
