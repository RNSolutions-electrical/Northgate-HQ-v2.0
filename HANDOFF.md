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

## Entry 033 — Vehicle assignment and destination display doctrine

**Date:** 2026-06-16
**Updated by:** ChatGPT
**Phase:** Architecture — Vehicle assignment and destination display doctrine
**Session type:** decision / documentation cross-clearance

### Context
Ryan routed the transaction-history destination display question for architecture review because readable labels such as `Miguel's Van` or `Ryan's Truck` depend on the unresolved user→vehicle assignment model. Claude proposed ARCHITECTURE v2.10 wording for Section 16, covering a dedicated time-bounded `vehicle_assignments` bridge table, stable vehicle display labels, and read-path-only destination display resolution. Under Constitutional Rule 20, ChatGPT then reviewed and cleared the actual v2.10 lock wording before Codex applies the architecture edit.

### Decisions Made This Session (locked)
- ARCHITECTURE v2.10 is cleared for application under Rule 20.
- The active user→vehicle assignment model is a dedicated time-bounded bridge table, `vehicle_assignments`, keyed by Clerk user ID and permitting at most one active assignment per user.
- Vehicle assignment history is preserved by closing prior rows with `unassigned_at` and inserting a new active row; assignments are not rewritten in place or deleted.
- Vehicles carry a stable required human-readable unit label, `vehicles.display_name`, independent of who is assigned to the vehicle.
- Transaction-history destination labels are read-path-only display resolution. Stored structural destination fields remain `transaction_items.destination_type` + `destination_id`.
- Vehicle destination display uses the current vehicle unit label, optionally adorned with the historical operator resolved from assignment history at the transaction `occurred_at` time.
- Operator names are contextual adornments, not vehicle identity.
- No display strings are snapshotted onto transactions in this decision.
- Checkout/finalization behavior is unchanged.

### Schema Changes
- None applied in this entry.
- ARCHITECTURE v2.10 defines future schema expectations only:
  - `vehicle_assignments` bridge table.
  - `vehicles.display_name TEXT NOT NULL` as the stable unit label.
  - Partial unique index enforcing at most one active assignment per user.

### Code / File Changes
- Prepared updated coordination documents:
  - `ARCHITECTURE.md` updated to v2.10 with Section 16 user→vehicle assignment and destination display doctrine.
  - `HANDOFF.md` appended with this Entry 033.
- No app code, migrations, RPCs, permissions, ledger logic, checkout logic, or production data were changed by this documentation entry.

### Lock Document Changes
- ARCHITECTURE.md bumped from v2.9 to v2.10.
- Section 16 now concretizes:
  - `vehicle_assignments` as the user→vehicle assignment source.
  - `vehicles.display_name` as the stable vehicle unit label.
  - destination display resolution as read-path only.
  - structural destination IDs unchanged.
  - point-in-time historical operator association from assignment history.
  - no checkout/finalization change.

### What Codex Needs to Know
- Apply ARCHITECTURE v2.10 exactly as cleared, preserving the Rule 20 cleanup that `vehicles.display_name` is treated as a required stable unit label and that operator names are contextual adornments.
- Do not implement the `vehicle_assignments` table, `vehicles.display_name` migration, destination display joins, cart-open assignment lookup, or any UI changes unless explicitly instructed after the architecture update is accepted.
- The immediate Codex task is documentation-only unless Ryan gives a separate implementation prompt.
- Preserve HANDOFF append-only behavior and do not rewrite prior entries.

### What Claude Needs to Know
- ChatGPT cleared the proposed v2.10 Section 16 wording under Rule 20 with two cleanup edits:
  - `vehicles.display_name` should be treated as a stable required unit label.
  - historical operator names are contextual adornments and not vehicle identity.
- The architecture decision is ready for Codex to apply as a documentation update.

### Next Steps (in order)
1. Codex applies ARCHITECTURE v2.10 and this HANDOFF Entry 033 as a documentation-only update.
2. Verify ARCHITECTURE says v2.10 and HANDOFF is gapless through Entry 033.
3. Verify UTF-8 without BOM, LF line endings, and no mojibake.
4. After Ryan accepts the documentation diff, choose the next implementation step separately.
5. Keep transaction history Developer-only until the division-scoped read rule is designed and locked.
6. Keep office destination semantics unresolved until separately reviewed.
7. Keep Express Checkout / Manager Override deferred.

### Open Questions / Concerns
- Actual implementation of `vehicle_assignments` and `vehicles.display_name` still needs a future Codex prompt and may require migrations.
- Destination display resolution implementation is not part of this documentation-only update.
- Division-scoped history visibility remains intentionally undefined.
- Office destination semantics remain unresolved.

### Architecture Drift Warnings
- RESOLVED: v2.10 wording received Rule 20 cross-clearance from ChatGPT after Claude proposal.
- CARRIED FORWARD (active): implement no user→vehicle assignment schema or destination display read path until Ryan explicitly starts that implementation step.
- CARRIED FORWARD (active): production UI/browser visual verification from a logged-in Developer session.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.10, HANDOFF Entry 033).

---

## Entry 034 — Vehicle assignment foundation and destination labels

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Phase 1 Inventory — Milestone 4N vehicle assignment foundation and destination labels
**Session type:** implementation

### Context
Ryan instructed Codex to proceed with the v2.10-approved Section 16 implementation while staying inside ARCHITECTURE v2.10 / HANDOFF Entry 033. The approved scope was limited to `vehicles.display_name`, the Clerk-keyed `vehicle_assignments` bridge, server-side cart-open vehicle snapshot derivation, and Developer-only read-path transaction-history destination display labels.

### What Was Completed
- Implemented the approved Section 16 database foundation in migration `202606160002_vehicle_assignments_destination_display.sql`.
- Added `vehicles.display_name TEXT NOT NULL` and backfilled the current vehicle with the existing safe label `E-101`.
- Added `vehicle_assignments` keyed by Clerk `user_id`, with a time-bounded assignment model and a partial unique index enforcing at most one active assignment per user.
- Inserted no assignment seed rows because the live project currently has no explicit Miguel/Fabian/Ryan user-to-vehicle mapping to preserve. This avoids inventing assignment data.
- Replaced `open_inventory_cart(TEXT)` internals so the active vehicle snapshot is derived server-side from `vehicle_assignments` joined to active vehicles with `holds_stock = TRUE`.
- Updated the Developer-only transaction-history RPC read path to return `destination_label` without changing stored `transaction_items.destination_type` or `destination_id`.
- Updated the React history formatter to prefer the RPC-provided `destination_label` before falling back to the structural destination fields.

### Schema Changes
- Added `public.vehicles.display_name TEXT NOT NULL`.
- Added `public.vehicle_assignments`:
  - `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
  - `user_id TEXT NOT NULL`
  - `vehicle_id UUID NOT NULL REFERENCES public.vehicles(id)`
  - `assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `unassigned_at TIMESTAMPTZ`
  - `assigned_by TEXT`
  - `note TEXT`
- Added partial unique index `ux_vehicle_assignments_active_user` on `(user_id)` where `unassigned_at IS NULL`.
- Added lookup index `idx_vehicle_assignments_vehicle_time` on `(vehicle_id, assigned_at, unassigned_at)`.
- Enabled RLS on `vehicle_assignments`.

### Code / File Changes
- Implementation commit: `f29fb8b` (`Implement vehicle assignment foundation and history labels`).
- Push result for implementation commit: `faa0c0f..f29fb8b  main -> main`.
- Files changed in implementation commit:
  - `src/App.jsx`
  - `supabase/migrations/202606160002_vehicle_assignments_destination_display.sql`
- This documentation entry appends Entry 034 only.

### Lock Document Changes
- None. `docs/ARCHITECTURE.md` remained v2.10 and was not edited.

### What Codex Needs to Know
- `open_inventory_cart` still accepts only `p_user_name`; no client-supplied vehicle ID was added.
- Cart-open snapshots `active_vehicle_id` only when the active assignment points to an active vehicle with `holds_stock = TRUE`; otherwise the snapshot remains `NULL`.
- Transaction history remains read-only and Developer-only.
- Destination display labels are read-path-only:
  - user destinations resolve display name, then email, then raw ID;
  - vehicle destinations resolve current vehicle display name and optionally the point-in-time assigned operator;
  - office displays `Office`;
  - job and service-call destinations keep raw IDs until those modules exist;
  - unresolved references fall back to raw destination ID.

### What Claude Needs to Know
- The implementation stayed within the v2.10 decision.
- No checkout/finalization behavior was changed.
- No ledger or balance behavior was changed.
- No direct `inventory_balances` writes were introduced.
- No `transaction_items` meaning was changed.
- No permissions were widened.
- No division-scoped read rule, office semantics, Express Checkout, Manager Override, approver passcode, completion worklist, employee-module identity model, unrelated production data repair, or vehicle stock onboarding work was started.

### Next Steps (in order)
1. Ryan provides the explicit user-to-vehicle mappings before any assignment seed rows are added.
2. Production UI/browser visual verification from a logged-in Developer session remains carried forward.
3. Keep transaction history Developer-only until the division-scoped read rule is designed and locked.
4. Keep office destination semantics unresolved until separately reviewed.
5. Keep Express Checkout / Manager Override deferred.

### Open Questions / Concerns
- No active assignment rows exist yet because no explicit mapping was available in the live data.
- The current live vehicle `E-101` has `holds_stock = FALSE`, so cart-open will snapshot `NULL` until a valid active stock-holding assignment exists.
- Browser visual verification was not completed in this pass.

### Architecture Drift Warnings
- RESOLVED: live migration `20260616202416 vehicle_assignments_destination_display` is applied.
- RESOLVED: build check passed with `cmd /c npm run build`.
- RESOLVED: live verification confirmed `vehicles.display_name`, `vehicle_assignments`, `ux_vehicle_assignments_active_user`, cart-open assignment derivation, cart-open no client vehicle ID, and Developer-only read-only history guards.
- CARRIED FORWARD (active): production UI/browser visual verification from a logged-in Developer session.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.10, HANDOFF Entry 033).

---

## Entry 035 — transaction-history production bugfix

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Phase 1 Inventory — transaction-history production bugfix
**Session type:** implementation

### Context
Ryan reported that the production Transactions tab showed `Transaction history failed to load. Confirm Developer role and deployed RPC.` after the v2.10-approved vehicle assignment and destination label implementation. The fix scope was limited to the existing read-only, Developer-only transaction-history RPC and frontend parsing/display if needed.

### What Was Completed
- Confirmed Supabase API logs showed `POST /rest/v1/rpc/read_inventory_transaction_history` returning HTTP 400.
- Confirmed Supabase Postgres logs showed the failing error: `invalid input syntax for type uuid: "user_3DuPNUmxDtcYaes5rVbtmFJ21jX"`.
- Reproduced the failure with the active Developer Clerk subject by setting local JWT claims and calling `read_inventory_transaction_history(5, NULL, NULL)`.
- Identified the bug in the vehicle destination join: `ti.destination_id::UUID` could be evaluated for non-UUID destination IDs even when the regex guard was false.
- Applied live hotfix migration `20260616204359 fix_history_destination_uuid_guard`.
- Added repo migration `202606160003_fix_history_destination_uuid_guard.sql`.
- Replaced only the existing `read_inventory_transaction_history(INTEGER, TEXT, TEXT)` body, preserving the same signature and return shape.
- Changed the vehicle destination path to compute a guarded nullable UUID in `destination_vehicle_key` before joining `vehicles`.
- Verified the active Developer-context RPC now returns rows, including user destinations resolving to `Christopher Noel` and vehicle destinations resolving to `E-101`.
- Verified a fake Clerk subject fails closed with `active user permission record is required`.
- Verified Netlify production deploy is ready at commit `4e53608d656df69d375a6f9470fbc57315fcc92a`.

### Schema Changes
- No table schema changes.
- No new table, column, permission, or data repair was introduced.
- Existing v2.10 `vehicles.display_name` and `vehicle_assignments` model was preserved.

### Code / File Changes
- Hotfix commit: `4e53608d656df69d375a6f9470fbc57315fcc92a` (`Fix transaction history vehicle destination UUID guard`).
- Push result: `9d818b4..4e53608  main -> main`.
- Files changed:
  - `supabase/migrations/202606160003_fix_history_destination_uuid_guard.sql`
- This documentation entry appends Entry 035 only.

### Lock Document Changes
- None. `docs/ARCHITECTURE.md` remained v2.10 and was not edited.

### What Codex Needs to Know
- The frontend hook was not changed because it already calls the live signature with `p_limit`, `p_transaction_type`, and `p_search`.
- Corrected RPC signature remains `read_inventory_transaction_history(integer, text, text)`.
- Corrected return shape still includes `destination_label`.
- The RPC remains read-only and Developer-only:
  - Developer guard present.
  - SQL inspection showed no `INSERT`, `UPDATE`, or `DELETE` keywords in the function definition.
- Production visual verification through Chrome was attempted, but the browser-control bridge failed before attaching with `CreateProcessAsUserW failed: 5`; visual verification remains carried forward.

### What Claude Needs to Know
- No v2.10 architecture decision changed.
- Structural destination IDs remain unchanged.
- Destination labels remain read-path only.
- No checkout/finalization behavior was changed.
- No add-to-cart behavior was changed.
- No cart-open behavior was changed.
- No ledger or balance behavior was changed.
- No direct `inventory_balances` edits were made.
- No permissions were widened.
- No division-scoped reads, office semantics, Express Checkout, Manager Override, approver passcode, completion worklist, or destination identity redesign work was started.

### Next Steps (in order)
1. Ryan visually verifies the production Transactions tab from a logged-in Developer browser session.
2. Keep transaction history Developer-only until the division-scoped read rule is designed and locked.
3. Keep office destination semantics unresolved until separately reviewed.
4. Keep Express Checkout / Manager Override deferred.

### Open Questions / Concerns
- Browser visual verification remains blocked in Codex because Chrome automation cannot attach in this environment.
- No active assignment seed rows exist yet because no explicit user-to-vehicle mapping has been provided.

### Architecture Drift Warnings
- RESOLVED: production RPC failure root cause identified as unsafe UUID cast during read-path destination label resolution.
- RESOLVED: live RPC now returns rows for active Developer subject `user_3DuPNUmxDtcYaes5rVbtmFJ21jX`.
- RESOLVED: fake subject fails closed.
- RESOLVED: build check passed with `cmd /c npm run build`.
- RESOLVED: Netlify production deploy is ready at hotfix commit `4e53608d656df69d375a6f9470fbc57315fcc92a`.
- CARRIED FORWARD (active): production UI/browser visual verification from a logged-in Developer session.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits — only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table — never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.10, HANDOFF Entry 034).

---

## Entry 036 — Inventory Count surface (read-only) + office-retirement discovery

**Date:** 2026-06-17
**Updated by:** Codex
**Phase:** Phase 1 Inventory — count review and office-retirement discovery
**Session type:** implementation / discovery

### Context
Ryan instructed Codex to split the work into two safe phases: Phase A read-only discovery for retiring `office` as a material destination, and Phase B a read-only Inventory Count surface. The actual office-retirement row migration, function edits, and constraint tightening were explicitly not authorized in this task and remain gated on ARCHITECTURE v2.11 being committed to the repo and Claude reviewing the Phase A findings.

### What Was Completed
- Discarded the superseded local migration `supabase/migrations/202606170001_inventory_count_correction_surface.sql` because it replaced `set_inventory_count_quantity` and changed destination semantics.
- Ran Phase A read-only discovery against Supabase project `keogysnoukbendfkfjcn`.
- Found 18 live `transaction_items.destination_type = 'office'` rows:
  - 15 `physical_count_correction` rows.
  - 3 `remove_stock` rows.
- Inspected and reported the 3 `remove_stock` + `office` rows in full for Claude review.
- Dumped and reported the full live definitions of:
  - `set_inventory_count_quantity(uuid,numeric,text)`;
  - `finalize_inventory_cart(uuid,text,text,text)`;
  - `finalize_inventory_cart(uuid,text,text,text,jsonb)`;
  - `read_inventory_transaction_history(integer,text,text)`.
- Built the read-only Inventory Count & Correction surface without any correction write path.
- Added searchable/filterable physical bin/material count review using existing read paths only.
- Added transient client-side counted quantity inputs and variance display (`counted - system`) that stores nothing.
- Added count history per bin/material using the existing Developer-only transaction-history read path.
- Added client-side print/export styling for the loaded count sheet.

### Schema Changes
- None.
- No migration was created, applied, or kept for this task.
- No tables, columns, constraints, functions, RPCs, rows, ledger records, or balances were changed.

### Code / File Changes
- Removed the superseded untracked migration file:
  - `supabase/migrations/202606170001_inventory_count_correction_surface.sql`
- Added read-only count data loading:
  - `src/hooks/useInventoryCountSheet.js`
- Updated the Inventory module UI:
  - `src/App.jsx`
  - `src/styles.css`
- The count surface now loads from existing read access (`inventory_cart_candidates_view` plus read-only lookup tables) instead of a new view.
- Removed all local Set Quantity / correction-submit wiring from the count surface.

### Lock Document Changes
- None.
- Repo `docs/ARCHITECTURE.md` remained v2.10 during this task.
- Office retirement remains gated until ARCHITECTURE v2.11 is committed to the repo and Claude reviews the Phase A findings.

### What Codex Needs to Know
- The Inventory Count surface is read-only. It does not call `set_inventory_count_quantity`.
- Counted quantities are local UI state only and are not persisted.
- The old correction write hook still exists in the repo from earlier work, but the count surface no longer imports or calls it.
- Existing checkout UI still contains pre-v2.11 `office` destination behavior; it was not edited in this task because the office-retirement migration/function cleanup was explicitly deferred.
- Live office-row discovery must be reviewed before any office-retirement migration proceeds.

### What Claude Needs to Know
- Phase A found 3 non-correction `office` rows, all `remove_stock` rows created by normal cart checkout from the v2 UI:
  - `7debe811-2c0b-4325-b903-939b88b4e90f`, transaction `6e783067-c245-4c99-9fce-1cf07afa0477`, quantity `5`, created `2026-06-10 19:13:58.558076+00`.
  - `0ff9c7cb-5b88-4d8b-9c53-e7bae787a961`, transaction `3a906897-992f-4e2d-b28c-66b5b0a395a3`, quantity `8`, created `2026-06-10 19:14:32.243944+00`.
  - `fc0d1ab4-174b-48df-9d5e-9071644a604a`, transaction `328d5072-3e1e-47c3-87fa-9066a5c3de01`, quantity `2`, created `2026-06-10 20:40:30.418558+00`.
- All 3 rows have `performed_by_name = Christopher Noel`, `user_id = user_3DuPNUmxDtcYaes5rVbtmFJ21jX`, `status = approved`, `destination_id = NULL`, and notes reading `Normal cart checkout to office destination from v2 UI`.
- No office rows were re-tagged, nulled, deleted, or otherwise modified.
- No office-retirement function edits or destination constraint changes were made.

### Next Steps (in order)
1. Ryan/Claude review the Phase A office-row and function-definition findings.
2. Commit repo ARCHITECTURE v2.11 before any office-retirement implementation proceeds.
3. After Claude approval, retire `office` as a material destination in the required order: stop writers, re-tag approved rows as directed, then tighten the constraint.
4. Keep the Inventory Count surface read-only until the correction write path is explicitly re-approved under the updated architecture.

### Open Questions / Concerns
- The 3 `remove_stock` + `office` rows need a Claude/Ryan decision before any migration can classify or re-tag them.
- Browser visual verification was not completed in this pass.

### Architecture Drift Warnings
- OPEN: division-scoped read rule remains undefined; transaction history stays Developer-only.
- OPEN: office retirement is in progress but gated on ARCHITECTURE v2.11 in repo plus Claude review of the Phase A findings.
- CARRIED FORWARD: Return-to-Inventory, Buyout, and Tools locations are reserved but not built.
- CARRIED FORWARD: no direct `inventory_balances` edits; balances remain transaction-derived only.

### Routing Verdict
Claude review required before proceeding — office-retirement migration/function edits await Claude review of the Phase A findings and v2.11 in repo.

---

## Entry 037 — Office disposition resolved (ARCHITECTURE v2.11)

**Date:** 2026-06-17
**Updated by:** Claude
**Phase:** Inventory (Stage 1) — semantics lock
**Session type:** Architecture decision (lock)

### Decisions Made This Session (locked)
- `destination_type` records OUTBOUND disposition only; NULL for inbound/non-movement (Add Stock, Return-to-Inventory, Physical Count Correction).
- `'office'` is a physical location, NOT a material disposition; removed from the material `destination_type` enum (Sections 9, 11).
- Physical Count Correction → `destination_type = NULL`.
- Return-to-Inventory and Buyout reserved as defined-but-unbuilt; tools-at-office is a Tools-module location.
- Section 16 display: NULL destinations labeled from transaction type, never "Office."

### Schema Changes
- None applied in this entry.
- ARCHITECTURE v2.11 locks the future migration expectation:
  - existing pre-release physical-count correction rows with `destination_type = 'office'` migrate to NULL;
  - the 3 pre-release `remove_stock` office test checkout rows from Entry 036 re-tag to `unknown` with provenance note;
  - the `transaction_items_destination_type_check` constraint is tightened only after writers stop producing `office` and all existing `office` rows are resolved.

### Code / File Changes
- `docs/ARCHITECTURE.md` updated from v2.10 to v2.11.
- `HANDOFF.md` appended with this Entry 037.
- No app code, migrations, RPCs, permissions, checkout/finalization logic, ledger logic, balance logic, or production rows were changed by this documentation entry.

### Lock Document Changes
- ARCHITECTURE v2.11 resolves office disposition semantics:
  - `office` is removed from material destination options.
  - `destination_type` means outbound disposition.
  - inbound/non-movement transactions use `destination_type = NULL`.
  - Physical Count Correction writes NULL destination.
  - Return-to-Inventory, Buyout, and Tools office-location concepts remain reserved and unbuilt.

### What Codex Needs to Know
- Codex may execute office retirement as Entry 038 only after confirming this Entry 037 and ARCHITECTURE v2.11 are present in the repo.
- Required execution order: stop all `office` writers, re-tag existing rows, then tighten the destination constraint.
- The 3 `remove_stock` + `office` rows from Entry 036 are confirmed pre-release test checkouts and should re-tag to `unknown` with provenance note, not be reversed or deleted.
- Do not touch `inventory_balances`, quantities, ledger semantics, checkout/finalization behavior beyond removing `office`, vehicle bins, reorder/min-max, Return-to-Inventory, Buyout, or Tools features.

### What Claude Needs to Know
- The 3 non-correction office rows were settled by their own notes as pre-release UI test checkouts, not real ongoing disposition.
- The gate in Entry 036 worked as intended by preventing silent NULLing of outbound rows.
- Office retirement implementation remains a separate Entry 038 execution step.

### Next Steps (in order)
1. Codex executes office retirement as Entry 038: fix the 4 functions plus checkout UI, re-tag rows, and tighten the constraint.
2. Verify zero `office` rows remain and the tightened constraint rejects `office` while allowing NULL.
3. Keep transaction history Developer-only until the division-scoped read rule is designed and locked.

### Open Questions / Concerns
- Production browser verification remains carried forward.

### Architecture Drift Warnings
- RESOLVED: office destination semantics.
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED (not built): Return-to-Inventory, Buyout, Tools locations.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.11, HANDOFF Entry 037).

---

## Entry 038 — Office retirement executed

**Date:** 2026-06-17
**Updated by:** Codex
**Phase:** Inventory (Stage 1) — office destination retirement
**Session type:** implementation

### Context
Ryan supplied Claude's final retirement packet after Entry 036 discovery. ARCHITECTURE v2.11 and Entry 037 were committed first, satisfying the precondition to execute the office-retirement implementation. The allowed scope was limited to removing `office` as a material destination, re-tagging the known pre-release rows, and tightening the destination constraint. Return-to-Inventory, Buyout, and Tools locations remain reserved and unbuilt.

### What Was Completed
- Confirmed repo `docs/ARCHITECTURE.md` is v2.11 and Section 11 excludes `office`.
- Confirmed HANDOFF was gapless through Entry 037 before implementation.
- Added migration `supabase/migrations/202606170002_retire_office_destination.sql`.
- Applied live Supabase migration `20260617135522 retire_office_destination` to project `keogysnoukbendfkfjcn`.
- Stopped all known `office` writers:
  - `set_inventory_count_quantity(uuid,numeric,text)` now writes `destination_type = NULL` for physical count corrections.
  - `finalize_inventory_cart(uuid,text,text,text)` no longer accepts `office` in destination validation.
  - `finalize_inventory_cart(uuid,text,text,text,jsonb)` no longer accepts `office` in header or per-line destination validation.
  - `read_inventory_transaction_history(integer,text,text)` no longer maps `office` to `Office`; NULL destinations label from transaction type.
- Removed Office from the checkout destination picker in `src/App.jsx`.
- Added client-side stale-draft normalization so old local `office` destination drafts resolve to `unknown` instead of being sent back to checkout.
- Re-tagged the 3 confirmed pre-release `remove_stock` office test checkout rows to `destination_type = 'unknown'` with appended provenance note `(retired office destination v2.11)`.
- Re-tagged the 15 pre-release physical count correction rows from `destination_type = 'office'` to `destination_type = NULL`.
- Tightened `transaction_items_destination_type_check` so valid non-NULL destination types are now only:
  - `job`
  - `service_call`
  - `vehicle`
  - `user`
  - `vendor_return`
  - `scrap`
  - `unknown`

### Schema Changes
- Existing check constraint `transaction_items_destination_type_check` was dropped and recreated without `office`.
- No new table or column was added.
- No quantity, cost, balance, checkout finalization, or ledger movement semantics were changed.

### Code / File Changes
- Added:
  - `supabase/migrations/202606170002_retire_office_destination.sql`
- Updated:
  - `src/App.jsx`
  - `HANDOFF.md`
- No `inventory_balances` write path was introduced.
- No Set Quantity write surface was built.

### Lock Document Changes
- None in this entry.
- ARCHITECTURE v2.11 was already committed in Entry 037 before this implementation.

### What Codex Needs to Know
- Live office retirement is complete.
- Query verification after migration:
  - `transaction_items.destination_type = 'office'`: zero rows.
  - 15 `physical_count_correction` rows now have `destination_type = NULL`.
  - 3 pre-release test checkout rows now have `destination_type = 'unknown'` and provenance notes.
  - no public function definitions still contain the `'office'` literal.
  - rollback-only constraint test returned `office_rejected` and `null_allowed`.
  - Developer transaction history still loads.
  - physical count correction history now labels NULL destinations as `Count correction`.
- The migration uses exact live function-definition replacements and fails closed if expected office literals are absent or unexpected office literals remain.

### What Claude Needs to Know
- The 3 outbound pre-release office test rows were not reversed or deleted; they were classified as `unknown` per Entry 037.
- No production quantity repair was performed.
- No `inventory_balances` rows were directly edited.
- No Return-to-Inventory, Buyout, Tools-location, Express Checkout, Manager Override, passcode, completion worklist, vehicle-bin, or reorder/min-max work was started.

### Next Steps (in order)
1. Visually verify production checkout no longer offers Office as a destination after deployment.
2. Keep transaction history Developer-only until the division-scoped read rule is designed and locked.
3. Keep Return-to-Inventory, Buyout, and Tools-location concepts reserved until their own milestones.

### Open Questions / Concerns
- Production browser visual verification remains carried forward.

### Architecture Drift Warnings
- RESOLVED: office destination semantics and live `office` destination retirement.
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED (not built): Return-to-Inventory, Buyout, Tools locations.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.11, HANDOFF Entry 038).

---

## Entry 039 — Count Intake locked (ARCHITECTURE v2.12)

**Date:** 2026-06-17
**Updated by:** Claude
**Phase:** Inventory (Stage 1) — count intake write surface
**Session type:** Architecture decision (lock)

### Context
Ryan requested a shelf-by-shelf, bay-by-bay, bin-by-bin inventory intake workflow so physical material counts can be entered through the app and made official while the rest of Northgate HQ continues to be built. The decision was routed to Claude because allowing the UI to add material to bins touches source-of-truth boundaries between the material catalog, physical bin structure, `bin_items`, and transaction-derived balances.

ARCHITECTURE v2.12 locks the Count Intake subsection in Section 23. The update is narrow and localized: the count intake workflow is allowed to create structural `bin_items` from the UI only through a controlled atomic server RPC, while all official quantity establishment continues to use the existing `physical_count_correction` mechanic.

### Decisions Made This Session (locked)
- Official quantity establishment uses `physical_count_correction` only with `destination_type = NULL`.
- No new transaction type is introduced for count intake.
- `inventory_balances` must never be written directly.
- No cached or structural quantity may be written directly to `bin_items`.
- `bin_item` creation from count intake is structural only: find-or-create `(bin, item)`, opens at zero, and quantity comes solely from the following correction.
- Count intake uses one atomic server RPC: find-or-create the `bin_item` and apply the existing count-correction path in one transaction.
- The count intake RPC must not fork a parallel correction path.
- Existing catalog items only. Missing catalog items must be added through the Materials workbook / catalog flow first.
- The count screen must not become an in-UI catalog editor.
- No temporary or unknown material rows are allowed from the count intake UI.
- Zero is a valid count. Counting to zero sets the balance to zero through `physical_count_correction` and preserves the `bin_item` and its history.
- Audit requirements: who counted, when, prior system quantity, counted quantity, variance, and required reason/note.
- Reason/note text is sufficient for this version. A structured count-type field is reserved for later only if reporting requires it.
- Permissions are server-authoritative:
  - read: `can_manage_inventory`;
  - correction-write plus `bin_item` creation: Developer/Admin only;
  - catalog creation: deferred and not available in this milestone.

### Schema Changes
- None applied in this entry.
- ARCHITECTURE v2.12 locks the future implementation expectation for Count Intake, including an atomic intake RPC and structural `bin_item` creation rules.

### Code / File Changes
- No app code, migrations, RPCs, functions, production rows, balances, or ledger data were changed by this architecture entry.

### Lock Document Changes
- `docs/ARCHITECTURE.md` updated from v2.11 to v2.12.
- Section 23 now includes the Count Intake subsection locking the official count intake mechanic:
  - atomic find-or-create `bin_item` plus physical count correction;
  - existing catalog items only;
  - zero count supported;
  - Developer/Admin write gate;
  - no direct `inventory_balances` writes;
  - no new transaction type;
  - no second source of truth.

### What Codex Needs to Know
- Codex may build Inventory Count Intake Mode as Entry 040 only after confirming ARCHITECTURE v2.12 and this Entry 039 are present in the repo.
- Build against the locked Section 23 Count Intake rules.
- The load-bearing implementation decision is the single atomic RPC. Do not split `bin_item` creation and count correction into two client-driven writes.
- The intake RPC must find-or-create the `(bin_id, item_id)` `bin_item`, opening at zero, then apply the same correction path used by `set_inventory_count_quantity`.
- Count corrections must write `destination_type = NULL`.
- Existing catalog items only. Do not create/edit catalog items or temporary material rows from the count UI.
- Count-to-zero is valid and must preserve the `bin_item`.
- Do not change checkout/finalization, ledger semantics, office/destination semantics, Return-to-Inventory, Buyout, Tools, vehicle bins, reorder/min-max, Express Checkout, Manager Override, or transaction-history visibility.

### What Claude Needs to Know
- The Count Intake workflow is locked narrowly in ARCHITECTURE v2.12 to prevent a second source of truth.
- The count workflow is allowed to become write-enabled only through the atomic RPC pattern described above.
- Catalog creation remains outside this milestone.

### Next Steps (in order)
1. Commit ARCHITECTURE v2.12 and this HANDOFF Entry 039 to the repo.
2. Codex builds Count Intake Mode as Entry 040 under v2.12 / Entry 039.
3. Verify the atomic intake RPC is the only new write path.
4. Verify `bin_item` creation opens at zero and quantity is established only through `physical_count_correction`.
5. Verify count-to-zero preserves the `bin_item`.
6. Keep transaction history Developer-only until the division-scoped read rule is designed and locked.

### Open Questions / Concerns
- Exact intake RPC name and signature will be finalized during implementation, but the behavior is locked.
- Structured count-type reporting remains reserved, not built.

### Architecture Drift Warnings
- OPEN: division-scoped read rule remains undefined; history remains Developer-only.
- RESERVED (not built): Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout, Manager Override, reorder/min-max, structured count-type field.
- CARRIED FORWARD: no direct `inventory_balances` edits; balances remain transaction-derived only.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.12, HANDOFF Entry 039).

---

## Entry 040 — Inventory Count Intake Mode built

**Date:** 2026-06-17
**Updated by:** Codex
**Phase:** Inventory (Stage 1) — count intake write surface
**Session type:** implementation

### Context
Built Inventory Count Intake Mode under ARCHITECTURE v2.12 / Entry 039 after confirming the repo contained the v2.12 Count Intake lock and HANDOFF Entry 039. The load-bearing rule was preserved: official intake is one client call to one atomic server RPC that find-or-creates the structural `bin_item` and then applies the existing `physical_count_correction` mechanism in the same database transaction.

### What Was Completed
- Committed implementation as `d94108f099799b92c047a9e2792837e11fc38640` (`Build inventory count intake mode`).
- Added migration `supabase/migrations/202606170003_inventory_count_intake_mode.sql`.
- Applied live Supabase migration `20260617150535 inventory_count_intake_mode` to v2 project `keogysnoukbendfkfjcn`.
- Added `public.intake_inventory_count(p_bin_id uuid, p_item_id uuid, p_counted_quantity numeric, p_reason text)`.
- Updated `public.set_inventory_count_quantity(uuid,numeric,text)` so count-correction writes remain `destination_type = NULL` and Developer/Admin can use the correction mechanic required by v2.12.
- Added `src/hooks/useInventoryCountIntake.js` as the only new client write hook; it calls `intake_inventory_count`.
- Expanded `src/hooks/useInventoryCountSheet.js` to load physical storage units, shelves, bays, bins, existing bin/material rows, and active catalog items for intake selection.
- Added `InventoryCountIntakePanel` in `src/App.jsx` and routed the Inventory Count tab to it.
- Added storage-path navigation: Storage Unit → Shelf → Bay → Bin.
- Added existing-bin-item count entry with counted quantity, required reason, variance, and Record action.
- Added selected-bin catalog-item intake for existing catalog items only.
- Added count-to-zero support through the same count intake path.
- Added result messaging showing prior system quantity, counted quantity, variance, and bin item.
- Updated count styling in `src/styles.css` for the intake card, path controls, reason controls, responsive layout, and row messages.

### Schema Changes
- No new table or column was added.
- No direct `inventory_balances` write path was introduced.
- No quantity was stored directly on `bin_items`.
- No catalog item creation/editing path was added.
- No new transaction type was added.

### Code / File Changes
- Added:
  - `src/hooks/useInventoryCountIntake.js`
  - `supabase/migrations/202606170003_inventory_count_intake_mode.sql`
- Updated:
  - `src/App.jsx`
  - `src/hooks/useInventoryCountSheet.js`
  - `src/styles.css`
  - `HANDOFF.md`

### Lock Document Changes
- None in this entry.
- ARCHITECTURE v2.12 and HANDOFF Entry 039 were committed first in `f43c02e8b9d2956f38f60d72a6a7696c8a455d6a`.

### What Codex Needs to Know
- Intake write path is one client call: `useInventoryCountIntake.recordCount(...)` → `intake_inventory_count(...)`.
- `intake_inventory_count(...)` performs structural `bin_items` find-or-create, opening at zero (`min_quantity = 0` only), then calls `set_inventory_count_quantity(...)`.
- Live signature verified:
  - `intake_inventory_count(p_bin_id uuid, p_item_id uuid, p_counted_quantity numeric, p_reason text)`
  - returns `bin_item_id`, transaction IDs, prior system quantity, counted quantity, variance, reason, quantity on hand, status, occurred_at, and created flag.
- Live definition proof verified:
  - intake RPC calls `public.set_inventory_count_quantity`;
  - count correction uses `physical_count_correction`;
  - count correction writes `destination_type = NULL`;
  - intake RPC has no `INSERT/UPDATE` against `inventory_balances`.
- Rollback-only Developer verification:
  - existing bin/material count returned prior `57`, counted `57`, variance `0`, status `approved`, `created_bin_item = false`;
  - new bin/material count-to-zero returned prior `0`, counted `0`, variance `0`, quantity_on_hand `0`, status `approved`, `created_bin_item = true`;
  - fake subject failed closed with `active user permission record is required`;
  - rollback verification left zero test `inventory_transactions` and zero test `transaction_items`.
- Browser status: local Vite server responded `200` at `http://127.0.0.1:5173`, but in-app browser automation could not attach because the browser runtime failed with `CreateProcessAsUserW failed: 5`; no visual browser verification was claimed.
- Build result: `npm run build` passed.

### What Claude Needs to Know
- The single atomic RPC boundary was preserved; Codex did not split bin-item creation and count correction into two client writes.
- No `inventory_balances` rows were directly edited.
- No checkout/finalization, ledger/balance semantics, office/destination semantics, Return-to-Inventory, Buyout, Tools locations, vehicle bins, vehicle stock onboarding, reorder/min-max, low-stock thresholds, Express Checkout, Manager Override, or transaction-history visibility work was started.
- Catalog creation remains outside the count UI.
- Structured count-type field remains reserved and unbuilt.

### Next Steps (in order)
1. Visually verify the production Inventory Count tab after GitHub/Netlify deployment.
2. If desired, remove the now-unused legacy `InventoryCountCorrectionPanel` component in a later cleanup-only pass.
3. Keep transaction history Developer-only until the division-scoped read rule is designed and locked.

### Open Questions / Concerns
- Production browser verification remains carried forward.
- Admin-role live write behavior is locked by the RPC definition, but the current live user table only exposed a Developer test user during verification.

### Architecture Drift Warnings
- OPEN: division-scoped read rule remains undefined; history remains Developer-only.
- RESERVED (not built): Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout, Manager Override, reorder/min-max, structured count-type field.
- CARRIED FORWARD: no direct `inventory_balances` edits; balances remain transaction-derived only.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.12, HANDOFF Entry 039).

---

## Entry 041 — Count Intake UI usability polish

**Date:** 2026-06-17
**Updated by:** Codex
**Phase:** Inventory (Stage 1) — count intake usability
**Session type:** implementation

### Context
After Entry 040 built Inventory Count Intake Mode, Ryan manually tested the update and confirmed that the count intake workflow appeared to be working. The remaining problem was usability: the count intake input card did not fit horizontally on the screen, forcing left/right scrolling to fill in values. Ryan requested a UI-only improvement pass while preserving the existing Unit → Shelf → Bay → Bin narrowing workflow and without changing count logic, RPCs, schema, ledger behavior, or permissions.

### What Was Completed
- Improved the Inventory Count Intake UI layout so the input/card area uses more available screen width.
- Reduced the need for horizontal scrolling while entering count values.
- Preserved the existing storage-path narrowing workflow:
  - Storage Unit
  - Shelf
  - Bay
  - Bin
- Preserved the existing count-intake behavior and write path.
- Ryan tested the update and reported that everything appears to be working.
- Ryan noted that the UI is still not final and can be improved further later.

### Schema Changes
- None.
- No migration was added for this UI polish pass.
- No database tables, columns, constraints, functions, RPCs, ledger rows, balances, or production data were changed by this entry.

### Code / File Changes
- Count Intake UI/layout styling was updated.
- Expected affected areas:
  - `src/App.jsx`
  - `src/styles.css`
- Exact commit hash and file diff should be confirmed from the Codex work summary or Git history if needed.

### Lock Document Changes
- None.
- ARCHITECTURE remained v2.12 during this UI-only implementation.

### What Codex Needs to Know
- Entry 041 was a UI-only Count Intake usability pass.
- Do not treat this as approval to change count-intake logic, schema, permissions, ledger behavior, or RPC behavior.
- The Count Intake write path remains the Entry 040 / v2.12 atomic intake RPC path.
- The UI can be polished further later, but any structural removal/retirement of mistakenly added `bin_items` requires the v2.13 lock and the following Entry 042 decision.

### What Claude Needs to Know
- Ryan manually tested the Count Intake UI polish and reported that the update appears to be working.
- No architecture decision was changed by the UI polish.
- Ryan still wants a controlled way to retire mistakenly added `bin_items`, which is handled by the separate v2.13 / Entry 042 architecture decision.

### Next Steps (in order)
1. Commit ARCHITECTURE v2.13 and Entry 042 before any `bin_item` retirement implementation.
2. Codex builds `bin_item` retirement as Entry 043 under v2.13 / Entry 042.
3. Continue to keep transaction history Developer-only until the division-scoped read rule is designed and locked.

### Open Questions / Concerns
- Exact Entry 041 commit hash and detailed file diff should be confirmed from the repo if needed.
- Count Intake UI may need further usability refinement later.

### Architecture Drift Warnings
- OPEN: division-scoped read rule remains undefined; history remains Developer-only.
- RESERVED (not built): Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout, Manager Override, reorder/min-max, structured count-type field.
- CARRIED FORWARD: no direct `inventory_balances` edits; balances remain transaction-derived only.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.12, HANDOFF Entry 040).

---

## Entry 042 — bin_item retirement locked (ARCHITECTURE v2.13)

**Date:** 2026-06-17
**Updated by:** Claude
**Phase:** Inventory (Stage 1) — structural correction (retire mistaken bin_item)
**Session type:** Architecture decision (lock)

### Decisions (locked → ARCHITECTURE v2.13, Section 23; builds on Rule 13 / Section 18)
- Retiring a mistakenly added bin_item = ARCHIVE (Rule 13 / Section 18), never hard-delete.
- Zero-balance precondition: a bin_item may be archived only when its ledger-derived
  balance is 0. Non-zero must first be zeroed via physical_count_correction.
- Structural action, NOT a transaction: writes no ledger row, changes no quantity.
- One Developer/Admin-only RPC (can_archive_records): validates balance=0, sets archive
  metadata, records audit. No client-side delete / direct table mutation.
- Audit: archived_at / archived_by / archive_reason (added if absent).
- Archived bin_items hidden from active count/intake/bin views; preserved in history.

### Schema Changes
- None applied in this entry.
- ARCHITECTURE v2.13 locks the future implementation expectation:
  - archive metadata on `bin_items` if absent;
  - zero-balance precondition before archive;
  - Developer/Admin-only controlled retirement RPC;
  - no ledger row and no quantity change as part of retirement.

### Code / File Changes
- `docs/ARCHITECTURE.md` updated from v2.12 to v2.13.
- `HANDOFF.md` appended with this Entry 042.
- No app code, migrations, RPCs, functions, production rows, balances, or ledger data were changed by this architecture entry.

### Lock Document Changes
- ARCHITECTURE v2.13 adds the `bin_item Retirement` rule to Section 23.
- The new rule applies the existing archive-over-delete convention to mistaken `bin_items`, with the inventory-specific safeguard that only zero-balance `bin_items` may be retired.

### What Codex Needs to Know
- Codex builds `bin_item` retirement as Entry 043 only after confirming ARCHITECTURE v2.13 and this Entry 042 are present in the repo.
- Retiring a `bin_item` means archive / soft-retire only.
- Do not hard-delete `bin_items`.
- Do not hard-delete ledger or transaction history.
- Do not create a ledger row as part of retirement.
- Do not zero or change quantity inside the retirement RPC.
- If the balance is non-zero, the operator must first use physical count correction to zero the balance, then retire the `bin_item`.
- The retirement RPC must be Developer/Admin-only and server-authoritative, using `can_archive_records`.
- Archived `bin_items` should be hidden from active count/intake/bin views and preserved in history.

### What Claude Needs to Know
- The stale-file concern was resolved before this decision was finalized. The real repository document was confirmed as v2.12 / Entry 040 before v2.13 was applied.
- The retirement rule is intentionally narrow and builds on existing Rule 13 / Section 18 archive behavior.
- The only new inventory-specific lock is the zero-balance precondition before archiving a `bin_item`.

### Next Steps (in order)
1. Codex builds `bin_item` retirement as Entry 043 per v2.13.
2. Verify retirement rejects non-zero balances.
3. Verify retirement writes no ledger row, no inventory transaction, and no quantity change.
4. Verify archived `bin_items` are hidden from active count/intake/bin views and preserved in history.

### Open Questions / Concerns
- Exact retirement RPC name and signature will be finalized during implementation, but the behavior is locked.
- UI placement may be Dev Console, inline Count Intake, or both, as long as the same controlled RPC is used.

### Architecture Drift Warnings
- OPEN: division-scoped read rule remains undefined; history remains Developer-only.
- RESERVED (not built): Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout, Manager Override, reorder/min-max, structured count-type field.
- CARRIED FORWARD: no direct `inventory_balances` edits; balances remain transaction-derived only.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 042).

---

## Entry 043 — bin_item retirement built

**Date:** 2026-06-17
**Updated by:** Codex
**Phase:** Inventory (Stage 1) — structural correction (retire mistaken bin_item)
**Session type:** implementation

### Context
Built `bin_item` retirement under ARCHITECTURE v2.13 / HANDOFF Entry 042 after confirming the repo contained the v2.13 `bin_item Retirement` subsection and Entry 042. The implementation is archive / soft-retire only: zero-balance precondition, no hard delete, no ledger row, no inventory transaction, no quantity change, no direct `inventory_balances` write, and no checkout/finalization change.

### What Was Completed
- Added `bin_items` archive metadata:
  - `archived_at TIMESTAMPTZ`
  - `archived_by TEXT`
  - `archive_reason TEXT`
- Added controlled server RPC:
  - `public.retire_bin_item(p_bin_item_id uuid, p_reason text)`
- Added rollback-verified zero-balance enforcement:
  - non-zero balance rejects with instruction to use physical count correction first;
  - zero-balance retirement sets only archive metadata and writes archive audit.
- Added archive audit support by allowing `action = 'archive'` in `change_logs_action_check`.
- Hardened direct client mutation on `bin_items`:
  - `anon` / `authenticated` now have only `SELECT`;
  - archive writes go through the controlled RPC.
- Updated active views to hide archived `bin_items`:
  - `inventory_cart_candidates_view`
  - `grand_master_inventory_view`
- Updated count RPCs to reject retired `bin_items`:
  - `set_inventory_count_quantity(uuid,numeric,text)`
  - `intake_inventory_count(uuid,uuid,numeric,text)`
- Added inline Count Intake retirement UI for Developer/Admin users with `can_archive_records`.
- Added required reason prompt before retirement submit.
- Added non-zero UI message directing the operator to record a zero physical count before retirement.
- Preserved Entry 041 Count Intake layout polish; no horizontal-scroll-inducing table column was added for the retirement reason prompt.

### Schema Changes
- Added:
  - `supabase/migrations/202606170004_bin_item_retirement.sql`
  - `supabase/migrations/202606170005_harden_bin_item_retirement_grants.sql`
- Live Supabase migrations applied to v2 project `keogysnoukbendfkfjcn`:
  - `20260617193446 bin_item_retirement`
  - `20260617193808 harden_bin_item_retirement_grants`
- No quantity column was added.
- No new transaction type was added.
- No `inventory_balances` write path was introduced.

### Code / File Changes
- Added:
  - `src/hooks/useBinItemRetirement.js`
  - `supabase/migrations/202606170004_bin_item_retirement.sql`
  - `supabase/migrations/202606170005_harden_bin_item_retirement_grants.sql`
- Updated:
  - `src/App.jsx`
  - `src/styles.css`
  - `HANDOFF.md`
- Existing documentation updates present before implementation:
  - `docs/ARCHITECTURE.md` v2.13
  - `HANDOFF.md` Entry 042

### Verification
- `git status`:
  - branch `main`, behind `origin/main` by 4;
  - current HEAD `6ac86ff1b1b2031a774bdcbd05879d6f2fc97189`;
  - local changes present in docs, app, styles, hook, and migrations.
- Local migration list includes:
  - `202606170004_bin_item_retirement.sql`
  - `202606170005_harden_bin_item_retirement_grants.sql`
- Live migration status includes:
  - `20260617193446 bin_item_retirement`
  - `20260617193808 harden_bin_item_retirement_grants`
- RPC signature verified live:
  - `retire_bin_item(p_bin_item_id uuid, p_reason text)`
  - returns `bin_item_id`, `bin_id`, `item_id`, `bin_code`, `material_code`, `item_name`, `ledger_balance`, `archived_at`, `archived_by`, `archive_reason`.
- Rollback-only live verification:
  - non-zero candidate rejected: `bin_item balance is 187. Use physical count correction to zero it before retirement.`
  - zero-balance candidate archived inside rollback transaction.
  - `transaction_items` count stayed `63 -> 63`.
  - `inventory_transactions` count stayed `35 -> 35`.
  - `inventory_balances` total stayed `600 -> 600`.
  - archive audit count changed `0 -> 1` only inside rollback transaction.
  - rollback left `archived_at IS NOT NULL` count at `0`.
- Proof retire RPC writes no ledger row:
  - live function definition has no `INSERT INTO public.transaction_items`.
- Proof retire RPC writes no inventory transaction:
  - live function definition has no `INSERT INTO public.inventory_transactions`.
- Proof no direct `inventory_balances` write path introduced:
  - live `retire_bin_item` definition has no `inventory_balances` reference.
  - static scan found only pre-existing trigger/backfill balance write paths.
- Proof no hard deletes:
  - static scan found no `DELETE FROM bin_items`, `DELETE FROM transaction_items`, or `DELETE FROM inventory_transactions`.
- Proof archived items hidden from active views:
  - rollback archived row absent from `inventory_cart_candidates_view`.
  - rollback archived row absent from `grand_master_inventory_view`.
  - both active views contain `bi.archived_at IS NULL`.
- Proof archived items remain preserved for history/reporting:
  - rollback archived row remained joinable through `bin_items`.
  - transaction history RPC joins `transaction_items -> bin_items` and does not filter `bi.archived_at IS NULL`.
- Proof checkout/finalization was not changed:
  - no checkout/finalization files or RPCs were edited in this pass.
  - live `finalize_inventory_cart` functions remain present.
- Proof office/destination semantics were not changed:
  - this pass did not edit destination type validation or office retirement logic.
- Permission proof:
  - retirement write is Developer/Administrator/Admin role-gated server-side.
  - `can_archive_records` is respected server-side.
  - fake subject failed closed with `active user permission record is required`.
  - Developer with rollback-only `can_archive_records=false` failed with `can_archive_records permission is required to retire a bin item`.
  - `anon` / `authenticated` direct `bin_items` table grants are now `SELECT` only.
- `npm.cmd run build` passed.
- Local Vite server responded `200` at `http://127.0.0.1:5173`.
- Browser verification status:
  - in-app Browser automation could not attach because the browser runtime failed with `CreateProcessAsUserW failed: 5`;
  - no visual browser verification is claimed.
- HANDOFF is gapless through Entry 043.
- Encoding clean:
  - checked modified docs/code/migrations for BOM: none found;
  - checked modified docs/code/migrations for CRLF/CR-only: none found;
  - mojibake sentinel scan: clean.

### Permissions
- Developer/Admin-only UI surface:
  - inline Count Intake `Retire` action is shown only when server permissions are loaded, the role is Developer/Administrator/Admin, and `can_archive_records` is true.
- Server-authoritative enforcement:
  - `retire_bin_item` authenticates from `auth.jwt() ->> 'sub'`;
  - verifies an active `user_permissions` row;
  - verifies Developer/Administrator/Admin role;
  - verifies `can_archive_records`;
  - rejects missing reason;
  - validates ledger-derived balance is zero before archive.
- Direct client mutation:
  - `anon` / `authenticated` direct `bin_items` privileges are `SELECT` only.

### Lock Document Changes
- None in this entry.
- ARCHITECTURE v2.13 and HANDOFF Entry 042 were already present before implementation.

### What Codex Needs to Know
- `retire_bin_item` is the only new retirement write path.
- Retirement is structural only:
  - no ledger row;
  - no inventory transaction;
  - no quantity change;
  - no direct `inventory_balances` write.
- Active count/intake/cart candidate/grand master views hide archived `bin_items`.
- Transaction history remains Developer-only and preserves archived `bin_items`.
- The Count Intake UI now has an inline Developer/Admin `Retire` action for zero-balance bin/material rows.
- The in-app Browser issue is environmental and remains unresolved in Codex: `CreateProcessAsUserW failed: 5`.

### What Claude Needs to Know
- Codex implemented the exact v2.13 / Entry 042 locked decision.
- A verification pass caught remaining direct `TRUNCATE`/`TRIGGER`/`REFERENCES` grants on `bin_items`; Codex added and applied `harden_bin_item_retirement_grants` so `anon` / `authenticated` now retain only `SELECT`.
- No production bin item was left archived during verification; retirement proof was rollback-only.
- No checkout/finalization, ledger/balance semantics, office/destination semantics, Return-to-Inventory, Buyout, Tools locations, vehicle bins, vehicle stock onboarding, reorder/min-max, low-stock thresholds, Express Checkout, Manager Override, or transaction-history visibility work was started.

### Next Steps (in order)
1. Ryan visually verifies the Count Intake retirement action in the deployed app after the code is pushed/deployed.
2. Keep transaction history Developer-only until the division-scoped read rule is designed and locked.
3. Keep Return-to-Inventory, Buyout, Tools locations, vehicle bins, Express Checkout, Manager Override, reorder/min-max, structured count-type field, and catalog creation from count UI reserved until their own milestones.

### Open Questions / Concerns
- Browser automation could not attach in Codex due `CreateProcessAsUserW failed: 5`; local Vite served successfully, but no automated visual browser verification was claimed.
- The repo is behind `origin/main` by 4 at the time of this entry; pull/rebase coordination may be needed before publishing.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout, Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 042).

---

## Entry 044 — ALIGNMENT / SYNC POINT

**Date:** 2026-06-17
**Updated by:** Claude
**Phase:** Coordination / governance — re-baseline after HANDOFF lineage reconciliation
**Session type:** Alignment / sync point

### Context
A multi-session inventory run (office retirement v2.11, Count Intake v2.12, bin_item
retirement v2.13) was followed by a git/documentation divergence: origin/main had been
regressed to a stale HANDOFF (Entry 039) by out-of-band uploads, while the local working
tree held a divergent HANDOFF fork (missing the Entry Format Standard preamble, untitled
033-035 headings, stale 024/025 wording) that was the only source of Entries 040-043.
Migration 0005 was applied live but unpublished in git. This entry records the
reconciliation and re-baselines all collaborators.

### Reconciliation performed
- Identified the canonical HANDOFF lineage (preamble + titled 033-035 headings) and
  restored it as the base for Entries 001-039.
- Appended the genuinely-new Entries 040-043 onto the canonical lineage; result is
  gapless 001-043, clean encoding (no BOM, LF, no mojibake).
- Published migration 202606170005_harden_bin_item_retirement_grants.sql (already applied
  live) so the repo matches the live DB.
- Reconciled with a fast-forward + clean commit (no force-push, no history rewrite).

### Verified synced state (origin/main == local at 5a3f551)
- docs/ARCHITECTURE.md = Version 2.13.
- HANDOFF.md gapless through Entry 043; Entry Format Standard preamble present; titled
  033-035 headings present.
- Live Supabase (keogysnoukbendfkfjcn) migrations applied through
  20260617193808 harden_bin_item_retirement_grants (0004 + 0005), matching the repo.
- Codex and ChatGPT both re-baselined and acknowledged this state.

### Root cause + locked discipline
- Recurring root cause across this run: more than one source of truth for the
  coordination docs (OneDrive-synced stale copies, stale manual uploads, a GitHub
  web-UI "upload files" commit, and a forked local HANDOFF lineage).
- Discipline (in force): the git clone is the ONLY place ARCHITECTURE/HANDOFF are read,
  edited, or committed. Never edit/commit/upload these docs from a OneDrive-synced folder
  or via the GitHub web UI. Always pull from origin and verify versions/entry numbers
  against origin before acting. Entry numbers come from the actual current HANDOFF.

### Roles reaffirmed
- Claude: architecture review, lock-doc maintenance, build-sequence validation.
- ChatGPT: assembles Codex prompts, clears version-bump wording (Rule 20 cross-clearance).
- Codex: implementation against the committed lock doc; routes architecture-sensitive
  items to Claude; ends summaries with a routing verdict.
- Ryan: final authority; sole committer of ARCHITECTURE/HANDOFF.

### Drift Warnings (carry forward)
- OPEN: division-scoped read rule; transaction history remains Developer-only until locked.
- RESERVED (not built): Return-to-Inventory, Buyout, Tools locations, vehicle bins /
  van-stock onboarding, Express Checkout, Manager Override, reorder/min-max & low-stock
  thresholds, structured count-type field, catalog-item creation from the count UI.

### Routing Verdict
No Claude review needed — alignment/sync record within locked decisions
(ARCHITECTURE v2.13, HANDOFF Entry 044).

---

## Entry 045 - Review Repeats UI toggle built

**Date:** 2026-06-18
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Count Intake usability / review tooling
**Session type:** implementation

### Context
Ryan requested a UI-only "Review Repeats" toggle on the Inventory Count / Count Intake
surface. The requested behavior was read/filter/display-only: identify rows where
meaningful identifying fields repeat, while excluding quantity and category fields and
without modifying records, schema, RPCs, permissions, ledger behavior, count correction
behavior, bin_item retirement behavior, transaction history, or inventory balances.

### What Was Completed
- Added a local React repeat-review index for loaded count-sheet rows.
- Added a "Review Repeats" checkbox toggle to the Inventory Count & Correction and
  Inventory Count Intake toolbars.
- When enabled, the count views filter to rows that have at least one repeated meaningful
  identifying value.
- Added repeat summary chips showing repeated field groups and match counts.
- Added per-row repeat chips so operators can see why a row appears in repeat review.
- Repeat detection covers material code, material name, bin code, storage unit, shelf,
  bay, full storage path, manufacturer part number fields when present, vendor part
  number fields when present, manufacturer / manufacturer detail, and description.
- Quantity and category fields remain excluded from repeat detection.

### Schema Changes
- None.
- No migration was added.
- No database table, column, constraint, function, RPC, permission, ledger row,
  transaction history row, bin_item retirement rule, count correction behavior, or
  inventory balance behavior was changed.

### Code / File Changes
- Updated `src/App.jsx`:
  - added repeat-review field definitions and local grouping/filtering helpers;
  - added Review Repeats toggle state to both count surfaces;
  - added repeat summary and per-row repeat chips for desktop and mobile count views.
- Updated `src/hooks/useInventoryCountSheet.js`:
  - expanded the read-only item load to carry existing item metadata needed for repeat
    review, including manufacturer, manufacturer_sub, description, and optional part
    number field aliases when present.
- Updated `src/styles.css`:
  - added styles for the Review Repeats toggle, summary panel, and repeat chips.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- Review Repeats is UI-only and computed from already loaded count-sheet data.
- It is not a dedupe, merge, archive, retire, correction, or cleanup workflow.
- Do not add write behavior to this toggle.
- The repeat index intentionally excludes quantity and category fields.
- Part-number repeat detection uses optional item-field aliases if those columns exist;
  the locked Phase 1 item schema already includes manufacturer, manufacturer_sub, and
  description.

### What Claude Needs to Know
- This was a display/filter usability tool only and did not change architecture,
  schema, permissions, inventory movement, count correction, transaction history, or
  balances.
- No new cleanup or deduplication workflow was introduced.
- No Claude review was needed because the work stayed within UI-only display behavior.

### Next Steps (in order)
1. Ryan visually verifies the Review Repeats toggle in the deployed app after the code is
   pushed/deployed.
2. Keep transaction history Developer-only until the division-scoped read rule is designed
   and locked.
3. Keep Return-to-Inventory, Buyout, Tools locations, vehicle bins, Express Checkout,
   Manager Override, reorder/min-max, structured count-type field, and catalog creation
   from count UI reserved until their own milestones.

### Open Questions / Concerns
- In-app Browser verification could not run in Codex because the browser runtime failed
  with `CreateProcessAsUserW failed: 5`.
- A local dev-server launch attempt also failed to produce a listening endpoint during
  this session, but `npm.cmd run build` passed.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 045).

---

## Entry 046 - Review Repeats runtime hotfix

**Date:** 2026-06-18
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Count Intake usability hotfix
**Session type:** implementation

### Context
After Entry 045 was pushed, Ryan reported a production console crash:
`Uncaught ReferenceError: reviewRepeats is not defined`. The Review Repeats UI had been
rendered in the Inventory Count Intake panel, but the Intake component was missing its
local `reviewRepeats` state and repeat-review derived values.

### What Was Completed
- Added missing `reviewRepeats` / `setReviewRepeats` state to `InventoryCountIntakePanel`.
- Added the Intake panel repeat-review memo, base filtered rows, repeat-filtered rows,
  and visible repeat group calculation.
- Added the missing Review Repeats toggle control to the Intake toolbar.
- Confirmed `npm.cmd run build` passes after the fix.

### Schema Changes
- None.
- No migration, RPC, permission, ledger, count correction, bin_item retirement,
  transaction history, or inventory balance behavior was changed.

### Code / File Changes
- Updated `src/App.jsx` only.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- Entry 045 had a runtime-only gap in the Intake component.
- The hotfix keeps Review Repeats UI-only and read/filter/display-only.
- Build passes, but in-app Browser verification remains blocked by the known local browser
  runtime issue.

### What Claude Needs to Know
- This was a UI runtime bugfix only.
- No architecture-sensitive behavior was changed.

### Next Steps (in order)
1. Ryan refreshes the deployed app after Netlify deploys the hotfix and confirms the Count
   Intake page no longer crashes.
2. Review the separate Clerk development-key warning and duplicate GoTrue client warning
   later as deployment/config cleanup, not as part of this UI hotfix.

### Open Questions / Concerns
- Clerk development-key and duplicate GoTrue client console warnings remain separate from
  the fixed `reviewRepeats` crash.
- In-app Browser verification could not run in Codex due the known
  `CreateProcessAsUserW failed: 5` browser runtime failure.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 046).

---

## Entry 047 - Count Intake location hierarchy search polish

**Date:** 2026-06-18
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Count Intake usability / search polish
**Session type:** implementation

### Context
Ryan requested the next safe Count Intake UI milestone. Required pre-work was completed:
pulled from `origin/main`, confirmed the remote branch was already up to date, confirmed
`origin/main` was the source of truth, confirmed `docs/ARCHITECTURE.md` is v2.13,
confirmed `HANDOFF.md` is current and gapless through Entry 046, and inspected the
current Count Intake / Inventory Count implementation before coding.

Review Repeats / Show Repeated Values was already implemented, so it was not rebuilt,
duplicated, renamed, or refactored. Verification result:
- Review Repeats is UI-only and computed locally from loaded count-sheet rows.
- It does not merge, delete, archive, retire, correct, or modify records.
- It excludes quantity and category-only matches.
- It flags repeated meaningful values including material code, item name, bin code, unit,
  shelf, bay, storage path, part-number aliases when available, manufacturer fields, and
  description.

### What Was Completed
- Added shared Count Intake / Inventory Count search helpers for compact location hierarchy
  matching.
- Supported compact hierarchy searches:
  - `C` = Unit C;
  - `C1` = Unit C / Shelf 1;
  - `C11` = Unit C / Shelf 1 / Bay 1;
  - `C111` = Unit C / Shelf 1 / Bay 1 / Bin 1.
- Added ordinary text matching against visible location fields where practical:
  - storage unit code / name;
  - shelf code / label;
  - bay code / label;
  - bin code / label;
  - full storage path.
- Kept existing material-oriented search behavior for normal non-hierarchy searches.
- Updated search placeholders to surface the `C111` style pattern.
- Applied the same search behavior to both Inventory Count & Correction and Inventory
  Count Intake views.

### Schema Changes
- None.
- No migration was added.
- No database table, column, constraint, function, RPC, permission, ledger row,
  transaction history row, bin_item retirement rule, count correction behavior, write path,
  or inventory balance behavior was changed.

### Code / File Changes
- Updated `src/App.jsx` only:
  - added search normalization helpers;
  - added compact location-code construction;
  - added shared count-row search matching;
  - replaced ad hoc row search checks in both count views with the shared matcher;
  - updated search input placeholders.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- This was a read/filter/display-only UI polish pass.
- Do not treat compact location search as a new data model or source of truth.
- The search helper derives display/search tokens from existing loaded row fields only.
- Review Repeats remains unchanged except for verification.

### What Claude Needs to Know
- No architecture-sensitive behavior changed.
- No schema, permissions, ledger, count correction, transaction history, bin_item
  retirement, inventory balance, or write-path behavior changed.
- Deferred features remain deferred.

### Next Steps (in order)
1. Ryan visually verifies compact searches such as `C`, `C1`, `C11`, and `C111` in the
   deployed app after this code is pushed/deployed.
2. Keep transaction history Developer-only until the division-scoped read rule is designed
   and locked.
3. Keep Return-to-Inventory, Buyout, Tools locations, vehicle bins, Express Checkout,
   Manager Override, reorder/min-max, structured count-type field, and catalog creation
   from count UI reserved until their own milestones.

### Open Questions / Concerns
- In-app Browser verification remains blocked in Codex by the known
  `CreateProcessAsUserW failed: 5` browser runtime issue.
- Clerk development-key and duplicate GoTrue client console warnings remain separate
  deployment/config cleanup items.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 047).

---

## Entry 048 - Milestone 4O Count Intake production verification

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 4O Count Intake production verification
**Session type:** review

### Context
Ryan requested Milestone 4O: production verification and UI-only polish for the Inventory
Count / Count Intake surfaces. Required first actions were completed before any review:
`git pull --ff-only origin main` returned already up to date; local `main` and
`origin/main` both resolved to commit `ebcc863`; `docs/ARCHITECTURE.md` was confirmed as
v2.13; `HANDOFF.md` was confirmed gapless through Entry 047; Entry 047 was confirmed
committed and pushed in the current history.

Production browser automation was not available in this Codex session. The previously
advertised in-app Browser skill file was absent from the local plugin cache and no
browser-client surface was exposed. Therefore, no authenticated visual verification is
claimed in this entry.

### Review Findings
- Production deploy inclusion was verified non-visually by fetching
  `https://northgate-hq-v2.netlify.app/` and its current Vite bundle
  `assets/index-DttO_ovG.js`; the deployed bundle contains the Entry 047 search placeholder
  `Material, C111, bin, shelf, bay, or unit`, the `Review Repeats` UI marker, and the
  `Storage path` repeat-review marker.
- Compact location hierarchy behavior was statically verified in `src/App.jsx`:
  - `buildCompactLocationCode()` derives unit/shelf/bay/bin compact codes from loaded row
    fields;
  - `matchesCountRowSearch()` treats `^[a-z]\d{0,3}$` searches as hierarchy searches;
  - `C`, `C1`, `C11`, and `C111` therefore map to unit, shelf, bay, and bin prefixes.
- Ordinary location text search was statically verified against visible location fields:
  storage unit code/name, shelf code/label, bay code/label, bin code/label, and full
  storage path.
- Existing material search remains present for non-hierarchy searches through
  `getCountRowSearchValues()`, which includes material code and item name.
- Review Repeats was not rebuilt, duplicated, renamed, or refactored. Static review
  confirmed the existing feature still uses local loaded-row data, excludes quantity and
  category-only repeat fields, and includes material/location/part/description fields when
  available.
- Archived/retired `bin_items` remain hidden from active count/intake views because
  `useInventoryCountSheet()` still reads rows from `inventory_cart_candidates_view`, and
  the active retirement migration defines that view with `bi.archived_at IS NULL`.
- The Retire action remains gated in `src/App.jsx` by Developer/Admin role plus
  `permissions.canArchiveRecords`, and the write path remains the existing
  `useBinItemRetirement()` hook calling the existing `retire_bin_item` RPC.
- Searching/filtering/reviewing rows introduce no writes. Static scan found no new
  insert/update/delete/RPC/schema/ledger/balance references in the relevant UI files for
  this milestone.
- `npm.cmd run build` passed.

### Schema Changes
- None.
- No migration was added.
- No database table, column, constraint, function, RPC, permission, ledger row,
  transaction history row, checkout/finalization behavior, count correction behavior,
  bin_item retirement behavior, office destination semantics, or inventory balance behavior
  was changed.

### Code / File Changes
- None.
- No app code or CSS was changed in this milestone.
- Only this HANDOFF entry was appended.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- Milestone 4O was verification-only because the deployed bundle and static source review
  showed Entry 047 code is present and aligned.
- Do not claim authenticated visual production verification from this session.
- Browser/runtime limitation remains active for Codex visual QA in this environment.
- No UI polish was applied because no clear safe UI-only bug was found from static review.

### What Claude Needs to Know
- This milestone did not change architecture, schema, permissions, ledger behavior,
  count correction behavior, bin_item retirement behavior, transaction history visibility,
  checkout/finalization, or any deferred feature.
- The only limitation is that visual production verification remains carried forward due
  unavailable browser automation.

### Next Steps (in order)
1. Ryan performs manual production visual verification of Count Intake searches `C`, `C1`,
   `C11`, `C111`, ordinary location text, material search, Review Repeats, and Retire
   visibility.
2. Keep transaction history Developer-only until the division-scoped read rule is designed
   and locked.
3. Keep Return-to-Inventory, Buyout, Tools locations, vehicle bins, Express Checkout,
   Manager Override, reorder/min-max, structured count-type field, and catalog creation
   from count UI reserved until their own milestones.

### Open Questions / Concerns
- Authenticated production browser verification could not be completed in Codex because
  browser automation was unavailable in this session.
- Clerk development-key and duplicate GoTrue client console warnings remain separate
  deployment/config cleanup items.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 048).

---

## Entry 049 - Production config warning cleanup / duplicate client diagnostic

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 4P production config warning cleanup
**Session type:** implementation

### Context
Ryan requested Milestone 4P: diagnostic-first cleanup for two production console warnings
carried forward from Entry 048: Clerk development-key warning and duplicate Supabase
GoTrue client warning. Required first actions were completed before code changes:
`git pull --ff-only origin main` returned already up to date; local `main` and
`origin/main` both resolved to commit `bfec081`; `docs/ARCHITECTURE.md` was confirmed as
v2.13; `HANDOFF.md` was confirmed gapless through Entry 048; and the repo copies of
`docs/ARCHITECTURE.md` / `HANDOFF.md` were used rather than stale local coordination docs.

### What Was Completed
- Diagnosed the Clerk development-key warning:
  - production bundle inspection found one embedded `pk_test_` Clerk publishable key token
    and no `pk_live_` Clerk publishable key token;
  - no key value was printed or committed;
  - code inspection confirmed the app reads `VITE_CLERK_PUBLISHABLE_KEY` from Vite env and
    does not hardcode a Clerk key.
- Determined the Clerk warning requires environment/dashboard cleanup outside Codex:
  - Ryan should check Netlify project environment variable `VITE_CLERK_PUBLISHABLE_KEY`,
    especially the production context;
  - Ryan should use the Clerk production publishable key from the correct Clerk production
    instance, not a development `pk_test_` key;
  - no production environment variable was changed in Codex.
- Diagnosed the duplicate GoTrue client warning:
  - the repo had two Supabase client modules: `src/services/supabaseClient.js` and
    `src/lib/supabaseClient.js`;
  - app code was using the services path, while the lib path separately initialized a
    Supabase client if imported later;
  - `createSupabaseClient()` was also creating Clerk-token Supabase clients with default
    Supabase auth persistence, which can create multiple GoTrue clients under the same
    browser storage key.
- Cleaned up Supabase client initialization safely:
  - disabled Supabase JS internal auth persistence/session URL detection for
    `createSupabaseClient()`;
  - kept Clerk JWT authorization behavior unchanged by preserving the explicit
    `Authorization: Bearer <token>` global header;
  - changed `src/lib/supabaseClient.js` to re-export the existing services client path so
    future imports do not create a second independent Supabase client.
- Ran `npm.cmd run build` successfully.
- Static scan confirmed only one direct `createClient()` call remains in `src`.

### Schema Changes
- None.
- No migration was added.
- No database table, column, constraint, function, RPC, permission, user_permissions
  behavior, Clerk JWT template, ledger behavior, transaction history visibility,
  inventory balance behavior, count correction behavior, bin_item retirement behavior,
  checkout/finalization behavior, or deferred feature was changed.

### Code / File Changes
- Updated `src/services/supabaseClient.js`:
  - added Supabase auth options `persistSession: false`, `autoRefreshToken: false`, and
    `detectSessionInUrl: false`;
  - preserved existing URL/key validation and Clerk token global header behavior.
- Updated `src/lib/supabaseClient.js`:
  - replaced the duplicate direct Supabase client initialization with a re-export from
    `../services/supabaseClient.js`.
- Updated `HANDOFF.md` with this Entry 049.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- The Clerk development-key warning is not fixed in code because the deployed bundle is
  receiving a development Clerk publishable key from configuration.
- Do not hardcode or fabricate a Clerk production key.
- The safe code cleanup addressed only duplicate Supabase client initialization and
  GoTrue session persistence behavior.
- Clerk JWT permission logic and server-authoritative permission behavior were not changed.

### What Claude Needs to Know
- No architecture-sensitive inventory behavior changed.
- No schema, migration, RPC, permission model, ledger, history visibility, balance,
  count-correction, retirement, checkout/finalization, or deferred feature work was done.
- No Claude review was required because the code change was limited to client initialization
  cleanup and did not alter auth/permission semantics.

### Next Steps (in order)
1. Ryan updates/checks Netlify production env variable `VITE_CLERK_PUBLISHABLE_KEY` to use
   the Clerk production publishable key (`pk_live_...`) from the correct Clerk production
   instance, then triggers/reviews a production deploy.
2. Ryan verifies the production console no longer shows the Clerk development-key warning
   after the environment variable is corrected and redeployed.
3. Ryan verifies the duplicate GoTrue client warning no longer appears after this client
   cleanup deploys.
4. Keep transaction history Developer-only until the division-scoped read rule is designed
   and locked.

### Open Questions / Concerns
- Actual Netlify/Clerk environment variable values were not read, printed, changed, or
  committed by Codex.
- Production browser automation remains unavailable in this Codex session, so console
  verification after deploy remains manual.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 049).

---

## Entry 050 - Milestone 4Q production console verification closeout

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 4Q production console verification
**Session type:** review

### Context
Ryan requested Milestone 4Q: production console verification and manual QA closeout after
Entry 049. Required first actions were completed before review: `git pull --ff-only origin
main` returned already up to date; local `main` and `origin/main` both resolved to commit
`3542085`; `docs/ARCHITECTURE.md` was confirmed as v2.13; `HANDOFF.md` was confirmed
gapless through Entry 049; and the repo copies of `docs/ARCHITECTURE.md` / `HANDOFF.md`
were used rather than stale local coordination docs.

Authenticated production browser verification was not available in this Codex session.
The in-app Browser client/skill was absent from the local plugin cache, so no visual
browser or authenticated console verification is claimed in this entry.

### Review Findings
- Production deploy inclusion for Entry 049 was verified non-visually by fetching
  `https://northgate-hq-v2.netlify.app/` and the current production Vite bundle
  `assets/index-Bjdtwx30.js`.
- The production bundle includes the Entry 049 Supabase client cleanup markers:
  `persistSession`, `autoRefreshToken`, and `detectSessionInUrl` are present in the
  deployed bundle.
- Static scan confirmed only one direct Supabase `createClient()` call remains in `src`:
  `src/services/supabaseClient.js`.
- `src/lib/supabaseClient.js` re-exports `createSupabaseClient` and `supabase` from
  `../services/supabaseClient.js` and no longer creates a second client.
- `src/services/supabaseClient.js` uses:
  - `persistSession: false`;
  - `autoRefreshToken: false`;
  - `detectSessionInUrl: false`.
- No Clerk key is hardcoded in source. Static scan found only
  `VITE_CLERK_PUBLISHABLE_KEY` usage in `src/main.jsx`.
- No secrets were printed or committed.
- The production bundle still contains one `pk_test_` Clerk publishable key token and no
  `pk_live_` Clerk publishable key token. This means the Clerk development-key warning is
  still expected until Ryan updates Netlify production `VITE_CLERK_PUBLISHABLE_KEY` to the
  correct Clerk production publishable key and redeploys.
- The production bundle still includes the Count Intake `C111` placeholder and
  `Review Repeats` marker, confirming the prior Count Intake UI code remains deployed.
- `npm.cmd run build` passed.

### Schema Changes
- None.
- No migration was added.
- No database table, column, constraint, function, RPC, permission, Clerk JWT template
  behavior, `user_permissions` behavior, ledger behavior, transaction history visibility,
  inventory balance behavior, count correction behavior, bin_item retirement behavior,
  checkout/finalization behavior, or deferred feature was changed.

### Code / File Changes
- None.
- No app code or CSS changed in this milestone.
- Only this HANDOFF entry was appended.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- Milestone 4Q was verification-only.
- Do not claim authenticated production console/browser verification from this session.
- Entry 049 code is deployed, but the Clerk development-key warning cannot be closed until
  Netlify production `VITE_CLERK_PUBLISHABLE_KEY` is changed to a Clerk `pk_live_...`
  publishable key outside Codex.
- No secrets were exposed or committed.

### What Claude Needs to Know
- No architecture-sensitive behavior changed.
- No schema, migration, RPC, permission model, Clerk JWT template, `user_permissions`,
  ledger, history visibility, balance, count-correction, retirement, checkout/finalization,
  or deferred feature work was done.

### Next Steps (in order)
1. Ryan updates Netlify production `VITE_CLERK_PUBLISHABLE_KEY` to the correct Clerk
   production publishable key (`pk_live_...`) and redeploys.
2. Ryan manually verifies the production console after redeploy:
   - Clerk development-key warning is gone;
   - duplicate GoTrue client warning is gone;
   - sign-in works;
   - permission source remains server;
   - Inventory Count loads;
   - Count Intake hierarchy search still works for `C`, `C1`, `C11`, and `C111`;
   - Review Repeats still works;
   - Retire action remains gated to Developer/Admin with `can_archive_records`.
3. Keep transaction history Developer-only until the division-scoped read rule is designed
   and locked.

### Open Questions / Concerns
- Authenticated production browser verification could not be completed in Codex because
  browser automation was unavailable in this session.
- The deployed Clerk key is still a development publishable key as of this verification.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 050).

---

## Entry 051 - Production Auth Recovery / Permission Verification

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Production auth recovery verification
**Session type:** review

### Context
Ryan requested Entry 051 as a documentation-only verification entry after manually
completing production Clerk / Netlify / DNS / JWT configuration recovery. Required first
actions were completed before this entry was appended: `git pull --ff-only origin main`
returned already up to date; local `main` and `origin/main` both resolved to commit
`4b0afe9`; `docs/ARCHITECTURE.md` was confirmed as v2.13; `HANDOFF.md` was confirmed
gapless through Entry 050; and the repo copies of `docs/ARCHITECTURE.md` / `HANDOFF.md`
were used rather than stale local coordination docs.

### Review Findings
- Ryan verified the production app loads from the `rnsolutions.net` custom domain.
- Ryan verified Clerk production login works.
- Ryan verified server permissions are restored.
- Ryan verified the app gets past "Waiting on server permissions."
- Ryan verified the permissions source shows `server`.
- Ryan verified Developer/Admin access is restored.
- Ryan verified Inventory Count loads.
- Ryan reported the production smoke check appears in order.
- The resolved production configuration issue is recorded as:
  - Netlify production Clerk key was moved to production key usage;
  - the app must be opened from the `rnsolutions.net` custom domain, not
    `northgate-hq-v2.netlify.app`;
  - Clerk production JWT template / signing configuration was corrected so Supabase can
    decode the token;
  - Supabase permission RPC no longer returns `PGRST301` / `401`;
  - current production Clerk user permissions are restored.

### Schema Changes
- None.
- No migration was added.
- No database table, column, constraint, function, RPC, RLS policy, permission logic,
  ledger behavior, transaction history visibility, inventory balance behavior, count
  correction behavior, bin_item retirement behavior, checkout/finalization behavior, or
  reserved feature was changed.

### Code / File Changes
- None.
- No app code changed.
- Only this HANDOFF entry was appended.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- Production auth recovery was completed manually by Ryan outside Codex.
- Use the `rnsolutions.net` custom domain for production auth validation, not the Netlify
  subdomain.
- Server-authoritative permissions are restored in production according to Ryan's manual
  verification.
- Do not change Clerk JWT templates, permission RPCs, `user_permissions`, RLS, or
  inventory behavior from this entry.

### What Claude Needs to Know
- This was documentation-only verification of production auth recovery.
- No architecture-sensitive code, schema, permissions logic, ledger behavior, inventory
  behavior, or deferred feature work was changed.
- The production domain / Clerk production key / Clerk JWT template / Supabase permission
  decode path has been restored according to Ryan's manual verification.

### Next Steps (in order)
1. Continue using the `rnsolutions.net` custom domain for production QA.
2. Keep transaction history Developer-only until the division-scoped read rule is designed
   and locked.
3. Keep Return-to-Inventory, Buyout, Tools locations, vehicle bins, Express Checkout,
   Manager Override, reorder/min-max, structured count-type field, and catalog creation
   from count UI reserved until their own milestones.

### Open Questions / Concerns
- None blocking for this production auth recovery record.
- Future production auth checks should explicitly use the custom domain because Clerk
  production domain settings matter.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 050).

---

## Entry 052 - Milestone 4R Count Intake QA polish

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 4R Count Intake QA polish
**Session type:** implementation

### Context
Ryan requested Milestone 4R: Count Intake usability and QA-confidence polish after
production auth recovery. Required first actions were completed before implementation:
`git pull --ff-only origin main` returned already up to date; local `main` and
`origin/main` both resolved to commit `4bc7374`; `docs/ARCHITECTURE.md` was confirmed as
v2.13; `HANDOFF.md` was confirmed gapless through Entry 051; the repo copies of
`docs/ARCHITECTURE.md` / `HANDOFF.md` were used rather than stale local coordination docs;
and Entry 051 was confirmed to document production auth recovery.

### What Was Completed
- Added selected-path breadcrumb chips to Count Intake so Unit / Shelf / Bay / Bin context
  is easier to scan.
- Added a small Count Intake guard panel stating that recorded quantities create official
  count corrections through the existing intake path, zero is valid, and catalog items
  must already exist.
- Improved search label/helper text while preserving the existing compact location search
  behavior for `C`, `C1`, `C11`, and `C111`.
- Clarified that selected-bin catalog-item intake is separate from existing stocked rows.
- Added a form note under selected-bin catalog intake stating that the action records an
  official count correction for the selected bin/material pair.
- Added an "Existing bin/material rows" section header with visible row count and a
  Review Repeats-aware title.
- Improved the no-results empty state to mention search, path, category, and repeat
  filters.
- Added responsive CSS for the new guard panel and section header.

### Schema Changes
- None.
- No migration was added.
- No database table, column, constraint, function, RPC signature/body, RLS policy,
  permission model, Clerk/Supabase JWT behavior, `user_permissions` logic, ledger behavior,
  transaction item meaning, inventory balance behavior, count correction behavior, bin_item
  retirement behavior, checkout/finalization behavior, destination semantics, transaction
  history visibility, or reserved feature was changed.

### Code / File Changes
- Updated `src/App.jsx`:
  - added selected-path segment display values;
  - added Count Intake guard text;
  - improved selected path display and selected-bin intake copy;
  - added an existing-row section header and clearer empty state.
- Updated `src/styles.css`:
  - added styles for field hints, the guard panel, breadcrumb chips, form note, and the
    existing-row section header;
  - added responsive handling for the new Count Intake polish elements.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- This was UI-only Count Intake polish.
- Count Intake hierarchy search behavior (`C`, `C1`, `C11`, `C111`) remains implemented
  through the existing search matcher and was not rewritten.
- Review Repeats remains display/filter-only.
- Retire action visibility remains controlled by existing Developer/Admin +
  `can_archive_records` UI gating and the existing `retire_bin_item` hook/RPC.
- Count-to-zero remains valid because `isDraftReady()` still accepts counted quantities
  greater than or equal to zero.
- Intake still uses the existing `useInventoryCountIntake()` hook and `intake.recordCount`
  calls only.

### What Claude Needs to Know
- No architecture-sensitive behavior changed.
- No schema, migrations, RPCs, permissions, ledger behavior, inventory balances, count
  correction behavior, bin_item retirement semantics, checkout/finalization, destination
  semantics, transaction history visibility, division-scoped read rule, or reserved feature
  work was done.

### Next Steps (in order)
1. Ryan manually verifies the Count Intake polish in production on the `rnsolutions.net`
   custom domain.
2. Verify in production that Count Intake searches `C`, `C1`, `C11`, and `C111` still
   behave correctly, Review Repeats still works, Retire visibility remains gated, and no
   Clerk production-domain / Supabase `401` / `PGRST301` errors appear.
3. Keep transaction history Developer-only until the division-scoped read rule is designed
   and locked.

### Open Questions / Concerns
- Authenticated browser verification could not be completed in Codex because browser
  automation was unavailable in this session.
- The first `npm.cmd run build` attempt hit a transient Vite/Rolldown path-emission error;
  a clean standalone rerun passed successfully.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 052).

---

## Entry 053 - Milestone 4S site favicon / app icon polish

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 4S static site icon polish
**Session type:** implementation

### Context
Ryan requested Milestone 4S to update the production site favicon for Northgate HQ using
the supplied `R-N Solutions.png` source image. Required first actions were completed
before implementation: `git pull --ff-only origin main` returned already up to date;
local `main` matched `origin/main`; `docs/ARCHITECTURE.md` was confirmed as v2.13; the
repo copies of `docs/ARCHITECTURE.md` / `HANDOFF.md` were used rather than stale local
coordination docs; and HANDOFF numbering was confirmed to contain Entries 001 through
052. Note: pre-existing file-order drift remains from prior work because Entry 052 appears
before Entry 051 in the file; this entry was appended normally as Entry 053 without
silently repairing coordination-document order.

### What Was Completed
- Generated browser-safe static icon assets from Ryan's supplied R-N Solutions source
  image:
  - `public/favicon.ico`;
  - `public/favicon-32x32.png`;
  - `public/apple-touch-icon.png`;
  - `public/app-icon-512.png`.
- Cropped around the bright logo mark before resizing so the favicon remains more legible
  at small browser-tab sizes.
- Updated `index.html` with favicon, PNG icon, Apple touch icon, and theme-color metadata.

### Schema Changes
- None.
- No migration was added.
- No database table, column, constraint, function, RPC, RLS policy, permission logic,
  Clerk/Supabase config, ledger behavior, transaction history visibility, inventory
  balance behavior, Count Intake behavior, checkout/finalization behavior, or reserved
  feature was changed.

### Code / File Changes
- Added static icon assets under `public/`.
- Updated `index.html` metadata only.
- No React app logic, state, hooks, Supabase client code, Clerk config, schema, migration,
  RPC, permission, inventory, ledger, checkout, transaction history, or reserved feature
  files were changed.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- This milestone is static asset / HTML metadata polish only.
- The favicon should cache-bust naturally with the next Netlify deployment because the
  committed public assets and `index.html` changed.
- Browser verification was not claimed unless performed in a later session.

### What Claude Needs to Know
- No architecture-sensitive behavior changed.
- No schema, migrations, RPCs, permissions, Clerk/Supabase auth behavior, inventory
  behavior, ledger behavior, transaction history visibility, Count Intake behavior,
  checkout/finalization, or reserved feature work was done.

### Next Steps (in order)
1. Let Netlify deploy the pushed static asset / metadata change.
2. Ryan can hard-refresh production on the `rnsolutions.net` custom domain and confirm the
   browser tab / pinned icon uses the new R-N Solutions mark.
3. Keep transaction history Developer-only until the division-scoped read rule is designed
   and locked.

### Open Questions / Concerns
- None blocking for this static asset milestone.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - static asset / metadata polish only.

---

## Entry 054 - Milestone 4T Count Intake field-use QA notes

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 4T Count Intake field-use clarity
**Session type:** implementation

### Context
Ryan requested Milestone 4T to improve field-use clarity around Inventory Count / Count
Intake after production auth recovery and Count Intake QA polish. Required first actions
were completed before implementation: `git pull --ff-only origin main` returned already
up to date; local `main` matched `origin/main` at `8cef094`; `docs/ARCHITECTURE.md` was
confirmed as v2.13; HANDOFF numbering was confirmed to contain Entries 001 through 053
with no missing numbers or duplicate entry numbers; and the repo copies of
`docs/ARCHITECTURE.md` / `HANDOFF.md` were used rather than stale coordination docs. The
pre-existing file-order drift remains from prior work because Entry 052 appears before
Entry 051 in the file; this entry was appended normally as Entry 054 without silently
repairing coordination-document order.

### What Was Completed
- Added a compact "How to use this screen" help block to the Inventory Count Intake UI.
- The help block explains:
  - Unit / Shelf / Bay / Bin path narrowing;
  - `C`, `C1`, `C11`, and `C111` search shortcuts;
  - counted quantity as an official physical count correction;
  - zero as a valid count;
  - Reason / Custom note use;
  - zero-first, then-retire handling for mistaken bin/material rows;
  - Retire as archive-only with no quantity change and no ledger transaction.
- Added presentation-only CSS for the new help block, including mobile stacking.
- Added `docs/COUNT_INTAKE_FIELD_GUIDE.md` as a practical operator-facing guide and QA
  checklist. It does not create a new architecture rule.

### Verification
- `npm.cmd run build` passed.
- Static scan confirmed no migration files were added or changed.
- Static scan of the diff found no Supabase RPC/function definition changes.
- Static scan of the diff found no direct `inventory_balances`, `transaction_items`, or
  `inventory_transactions` write-path changes.
- Static review confirmed Count Intake still uses the existing `intake.recordCount`
  calls in `src/App.jsx` and the existing `intake_inventory_count` RPC inside
  `src/hooks/useInventoryCountIntake.js`.
- Static review confirmed Retire remains isolated to the existing
  `useBinItemRetirement()` hook and existing `retire_bin_item` RPC.
- Browser verification was not performed or claimed because browser automation was not
  available in this Codex session.

### Schema Changes
- None.
- No migration was added.
- No database table, column, constraint, function, RPC signature/body, RLS policy,
  permission model, Clerk/Supabase JWT behavior, `user_permissions` logic, ledger
  behavior, transaction item meaning, inventory balance behavior, count correction
  behavior, bin_item retirement rule, checkout/finalization behavior, destination
  semantics, transaction history visibility, division-scoped read rule, or reserved
  feature was changed.

### Code / File Changes
- Updated `src/App.jsx`:
  - added static Count Intake field-use help text;
  - rendered a compact help block in the Count Intake surface.
- Updated `src/styles.css`:
  - added presentation-only styles for the help block and responsive stacking.
- Added `docs/COUNT_INTAKE_FIELD_GUIDE.md`:
  - operator-facing field guide and quick QA checklist for Count Intake.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- This milestone was UI/documentation-only.
- Count Intake behavior, hook usage, and approved RPC path were not changed.
- Review Repeats remains display/filter-only.
- Retire remains Developer/Admin + `can_archive_records` gated and archive-only through
  the existing hook/RPC.
- Count-to-zero remains valid.

### What Claude Needs to Know
- No architecture-sensitive behavior changed.
- No schema, migrations, RPCs, permissions, ledger behavior, balance behavior, count
  correction behavior, bin_item retirement semantics, destination semantics, transaction
  history visibility, division-scoped read rules, or reserved feature work was done.

### Next Steps (in order)
1. Let Netlify deploy the pushed UI/documentation-only change.
2. Ryan can verify the Count Intake help block on desktop and mobile widths in production
   on the `rnsolutions.net` custom domain.
3. Keep transaction history Developer-only until the division-scoped read rule is designed
   and locked.

### Open Questions / Concerns
- Authenticated browser verification was not available in this Codex session, so visual
  rendering checks are carried forward for Ryan/manual production QA.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - UI/documentation-only within locked Count Intake and bin_item retirement rules.

---

## Entry 055 - Milestone 4U Production Inventory Smoke Test Closeout

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 4U production smoke closeout
**Session type:** verification / documentation

### Context
Ryan requested Milestone 4U as a production inventory smoke-test closeout after production
auth recovery and recent Count Intake / UI polish work. Required first actions were
completed before this entry was appended: `git pull --ff-only origin main` returned
already up to date; local `main` matched `origin/main` at `77f354c`; `docs/ARCHITECTURE.md`
was confirmed as v2.13; HANDOFF numbering was confirmed to contain Entries 001 through
054 with no missing numbers or duplicate entry numbers; and the repo copies of
`docs/ARCHITECTURE.md` / `HANDOFF.md` were used rather than stale coordination docs. The
pre-existing file-order drift remains from prior work because Entry 052 appears before
Entry 051 in the file; this entry was appended normally as Entry 055 without silently
repairing coordination-document order.

### Ryan-Reported Production Status
- Ryan reports everything appears to be in order so far after production auth recovery and
  recent Count Intake / UI polish work.
- Ryan previously verified production auth recovery on the `rnsolutions.net` custom
  domain, Clerk production login, server permission recovery, Developer/Admin access, and
  Inventory Count loading.
- In this Codex session, authenticated browser automation / browser-console inspection was
  not available, so the following production checklist items were not independently
  browser-verified by Codex:
  - Clerk production login;
  - app getting past "Waiting on server permissions";
  - permission source showing `server`;
  - Ryan's user showing Developer/Admin access;
  - Inventory Count authenticated loading;
  - Count Intake searches `C`, `C1`, `C11`, and `C111`;
  - ordinary location text search;
  - material search;
  - Review Repeats interaction;
  - Retire action visibility gating;
  - Retire archive-only behavior in the live UI;
  - browser console absence of Clerk development-key warnings, Clerk production-domain
    origin errors, Supabase `PGRST301` / JWT decode errors, or Supabase `401` permission
    failures.
- Duplicate GoTrue warning status could not be determined by Codex in this session because
  browser-console verification was unavailable. Ryan did not report observing the warning
  in this milestone prompt.

### Codex Verification Completed
- `npm.cmd run build` passed.
- Public production HTTP check for `https://rnsolutions.net/` returned HTTP `200`.
- The production HTML returned the expected `Northgate HQ v2.0` title.
- The production HTML included favicon metadata.
- Deployed-bundle text checks found the recent Count Intake / UI markers:
  - `How to use this screen`;
  - `C111`;
  - `Review Repeats`;
  - Retire help text;
  - `count-help-panel` CSS.
- Static scan confirmed no migration files were added or changed before this HANDOFF-only
  entry.
- Static review confirmed Count Intake still uses the existing `intake.recordCount`
  calls in `src/App.jsx` and the existing `intake_inventory_count` RPC inside
  `src/hooks/useInventoryCountIntake.js`.
- Static review confirmed Retire remains isolated to the existing
  `useBinItemRetirement()` hook and existing `retire_bin_item` RPC.

### Schema Changes
- None.
- No migration was added.
- No database table, column, constraint, function, RPC signature/body, RLS policy,
  permission model, Clerk/Supabase JWT behavior, `user_permissions` logic, ledger
  behavior, transaction item meaning, inventory balance behavior, count correction
  behavior, bin_item retirement rule, checkout/finalization behavior, destination
  semantics, transaction history visibility, division-scoped read rule, or reserved
  feature was changed.

### Code / File Changes
- None.
- No app behavior changed.
- Only this HANDOFF entry was appended.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.13.

### What Codex Needs to Know
- This was verification/documentation-only.
- Do not claim authenticated browser or console verification from this session.
- Public production HTTP/deployed-bundle checks passed, but authenticated UI and console
  checks remain Ryan/manual unless a browser-control session is available later.
- Count Intake and Retire write paths were not changed.

### What Claude Needs to Know
- No architecture-sensitive behavior changed.
- No schema, migrations, RPCs, permissions, ledger behavior, balance behavior, count
  correction behavior, bin_item retirement semantics, destination semantics, transaction
  history visibility, division-scoped read rules, or reserved feature work was done.

### Next Steps (in order)
1. Ryan may complete or repeat authenticated production browser QA on the `rnsolutions.net`
   custom domain, including console review for Clerk, Supabase, and duplicate GoTrue
   warnings.
2. Keep transaction history Developer-only until the division-scoped read rule is designed
   and locked.
3. Keep Return-to-Inventory, Buyout, Tools locations, vehicle bins, Express Checkout,
   Manager Override, reorder/min-max, structured count-type field, and catalog creation
   from count UI reserved until their own milestones.

### Open Questions / Concerns
- Authenticated browser verification and browser-console verification were not available
  in this Codex session.
- Duplicate GoTrue warning status remains unverified by Codex for this closeout.

### Architecture Drift Warnings
- OPEN: division-scoped read rule; history remains Developer-only.
- RESERVED: Return-to-Inventory, Buyout, Tools, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field.

### Routing Verdict
No Claude review needed - verification/documentation-only within locked ARCHITECTURE v2.13.

---

## Entry 056 - Milestone 5 Prep v2.14 lock docs and HANDOFF repair

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5 Prep lock-document update
**Session type:** documentation / Rule 20 repair

### Context
Ryan requested Milestone 5 Prep to apply the Rule 20-cleared v2.14 lock-document deltas
and repair HANDOFF Entry 051 / Entry 052 physical order only. This was documentation-only:
no Milestone 5A implementation, app code, migrations, Supabase changes, Netlify changes,
Clerk changes, or production configuration changes were authorized or performed.

Required first actions were completed before editing: `git pull --ff-only origin main`
returned already up to date; local `main` matched `origin/main` at `a255b67`;
`docs/ARCHITECTURE.md` was confirmed as v2.13 before editing; HANDOFF numbering was
confirmed gapless through Entry 055; Entry 051 was confirmed to physically appear after
Entry 052 before repair; and the repo clone copies of `docs/ARCHITECTURE.md` and
`HANDOFF.md` were used rather than stale coordination docs, OneDrive-synced stale copies,
or GitHub web UI uploads.

Claude produced the Milestone 5 lock-document delta proposal. ChatGPT cleared the v2.14
package under Rule 20. Codex applied the cleared documentation package for Ryan so the
coordination docs were not manually mis-edited.

### What Was Completed
- Updated `docs/ARCHITECTURE.md` from v2.13 to v2.14.
- Locked the Inventory module-completion milestone scope.
- Added Section 10 QR payload and web scanner scope:
  - location QR payloads use `https://<app-domain>/scan/location/<location_uuid>`;
  - UUID is the stable structural identifier, not human-readable codes such as `A111`;
  - typed route format is `/scan/<entity_type>/<uuid>`;
  - QR generation remains locations-only for now;
  - the web scanner is in scope now and is not blocked by the reserved React Native
    companion app;
  - scanner behavior is navigation/read-resolution only and is not a permission bypass.
- Updated Section 17 with `can_view_all_divisions` and clarified division visibility:
  - Developer role defaults to cross-division read;
  - Admin division defaults to cross-division read through effective permission;
  - Administrator role outside Admin division remains own-division unless individually
    granted `can_view_all_divisions`;
  - `can_view_financials` governs job/project OH&P and margin, not inventory cost.
- Added new Section 17a, Division-Scoped Read Rule:
  - cross-division read via `can_view_all_divisions`;
  - own-division full read for Administrator, Project Manager, Estimator, and Field
    Supervisor;
  - self-scoped read for Field Tech / User own carts and transactions within division;
  - reuse of the existing division anchor from the `202606120001` scoped reference views;
  - server-authoritative reads only, with no client-side row filtering as the source of
    truth;
  - inventory cost open within authorized inventory scope;
  - `can_view_financials` not used as an inventory cost gate;
  - full-division history gated by `can_manage_inventory`;
  - self-scoped my-transactions surface gated by `can_inventory_transactions`;
  - the division-scoped-read drift warning closed for Inventory;
  - same pattern carried forward as the template for future tools, vehicles, and jobs
    read access.
- Replaced Section 25 with Label Template Designer scope:
  - Avery 5164 for unit/shelf/bay placards;
  - Avery 8160 for bin labels;
  - data-driven geometry;
  - per-field include/exclude toggles;
  - optional QR per template;
  - per-field styling for color, alignment, bold, underline, and opacity;
  - live preview;
  - individual and unit/shelf/bay/bin printing;
  - QR content from Section 10 payloads;
  - print-to-PDF via `react-pdf` with exact sheet positioning;
  - saved/named reusable templates;
  - locked `label_templates` schema block.
- Applied the light-touch Section 29 build-sequence wording edits without renumbering.
- Repaired HANDOFF physical order so Entry 051 now appears before Entry 052.
- Appended this Entry 056 at the end of HANDOFF.

### Schema Changes
- None applied.
- No migration was added.
- No Supabase schema, RPC, permission, RLS, ledger, inventory balance, count correction,
  bin_item retirement, destination semantics, transaction history, checkout/finalization,
  Netlify, Clerk, or production configuration change was made.
- ARCHITECTURE v2.14 now locks the future `label_templates` table shape, but no database
  implementation was created in this milestone.

### Code / File Changes
- Updated `docs/ARCHITECTURE.md` only for v2.14 lock-document text.
- Updated `HANDOFF.md` only for Entry 051 / Entry 052 physical-order repair and Entry 056.
- No app code, package files, Netlify files, Supabase files, migrations, screenshots,
  pasted brief files, or scratch files were changed or staged.

### Lock Document Changes
- ARCHITECTURE updated from v2.13 to v2.14.
- HANDOFF repaired so Entry 051 physically appears before Entry 052.
- HANDOFF remains gapless through Entry 056.

### What Codex Needs to Know
- Milestone 5A has not started.
- The next implementation step is ChatGPT/Codex 5A staged implementation, using
  ARCHITECTURE v2.14 and HANDOFF Entry 056 as the source of truth.
- Division-scoped reads must be server-authoritative and use the locked Section 17a tiers.
- Inventory cost is visible within authorized inventory scope; `can_view_financials` is not
  the inventory cost gate.
- QR payload identity is UUID-based, with `/scan/<entity_type>/<uuid>` typed routes.
- Label Template Designer is locked conceptually, including the `label_templates` table
  shape, but is not implemented yet.

### What Claude Needs to Know
- Codex applied only the Rule 20-cleared documentation deltas and HANDOFF presentation
  repair.
- No implementation, schema, migration, RPC, permission, ledger, balance, count-correction,
  bin_item retirement, destination semantics, transaction history, or reserved-feature work
  was performed.
- Entry 051 / Entry 052 content was not edited; only physical order was repaired.

### Next Steps (in order)
1. Proceed to ChatGPT/Codex Milestone 5A staged implementation only after confirming
   ARCHITECTURE v2.14 and HANDOFF Entry 056 are present in the repo.
2. Keep implementation scoped to the v2.14 locked sequence.
3. Route to Claude before any change that touches schema, RPCs, permissions, ledger,
   balances, destination semantics, transaction history visibility, or reserved features
   beyond the cleared v2.14 scope.

### Open Questions / Concerns
- None blocking for the documentation update.
- Milestone 5A implementation remains intentionally unstarted.

### Architecture Drift Warnings
- RESOLVED for Inventory: division-scoped-read rule is now locked in Section 17a.
- RESERVED: Return-to-Inventory, Buyout, Tools locations, vehicle bins, Express Checkout,
  Manager Override, reorder/min-max, structured count-type field, catalog creation from
  count UI.

### Routing Verdict
No Claude review needed - architecture deltas and HANDOFF reorder required and received ChatGPT Rule 20 cross-clearance before Ryan/Codex commit.

---

## Entry 057 - Milestone 5A v2.14 Read-Rule Foundation

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5A read-rule foundation
**Session type:** implementation / migration / static verification

### Context
Ryan requested Milestone 5A to implement the ARCHITECTURE v2.14 Division-Scoped Read
Rule foundation. Required first actions were completed before implementation:
`git pull --ff-only origin main` returned already up to date; local `main` matched
`origin/main`; `docs/ARCHITECTURE.md` was confirmed as v2.14; HANDOFF was confirmed
gapless through Entry 056; Entry 051 was confirmed to physically appear before Entry
052; and the repo clone copies of the coordination docs were used, not stale attachment
or external coordination copies.

### What Was Completed
- Added the read-only `can_view_all_divisions` capability to the canonical permission
  surface.
- Updated role defaults so only the Developer role receives `can_view_all_divisions`
  by role default.
- Added `public.effective_permissions_for_user(...)` so Admin-division users receive
  `can_view_all_divisions` through division-aware effective permission resolution where
  division is known, rather than by fudging the Administrator role seed.
- Preserved override-last behavior: explicit per-user overrides are applied after role
  defaults and Admin-division effective defaults.
- Updated `public.get_or_create_user_permissions()` to return effective permissions.
- Updated existing scoped reference views to use the same caller division anchor from
  the 202606120001 scoped reference view pattern:
  - `inventory_cart_candidates_view`;
  - `inventory_destination_users_view`;
  - `inventory_destination_vehicles_view`.
- Updated `public.read_inventory_transaction_history(...)` to follow Section 17a:
  - cross-division read for effective `can_view_all_divisions`;
  - own-division full read for Administrator, Project Manager, Estimator, and Field
    Supervisor with `can_manage_inventory`;
  - self-scoped own transaction read for users with `can_inventory_transactions`.
- Kept filtering server-authoritative in the RPC/view layer. No client-side-only row
  filtering was introduced as a source of truth.
- Updated the transaction history UI gate so authorized non-Developer users can request
  the server-authoritative history RPC when their server permissions allow it.
- Added client permission mapping for `can_view_all_divisions`.

### Schema Changes
- Added migration `supabase/migrations/20260622200351_v214_read_rule_foundation.sql`.
- No table schema was changed.
- No direct `inventory_balances` write path was added.
- No checkout/finalization, count correction, count intake, bin_item retirement,
  destination semantics, ledger behavior, transaction history meaning, QR/scanner
  behavior, label-template behavior, or reserved feature implementation was changed.

### Code / File Changes
- Updated `src/hooks/usePermissions.js` to include `can_view_all_divisions` in the deny
  defaults and camel-case permission mapping.
- Updated `src/App.jsx` transaction history read gating and empty/locked copy to align
  with the server-side division read rule.
- Inventory cost fields remain visible within allowed row scope; `unit_cost_at_time`
  remains returned by the history RPC and rendered in the UI.
- `can_view_financials` was not wired to inventory cost visibility.

### Verification
- `npm.cmd run build` passed.
- Static scan confirmed no direct `inventory_balances` insert/update/delete path was
  added.
- Static scan confirmed no checkout/finalization functions were changed in the new
  migration.
- Static scan confirmed `can_view_financials` was not introduced as an inventory cost
  gate.
- Static scan confirmed QR/scanner and label-template features were not implemented.
- Local Supabase migration application was attempted with `npx.cmd supabase db reset
  --local --no-seed`, but could not run because Docker Desktop/local engine access was
  unavailable in this Codex environment.
- No live migration was applied; live application requires Ryan approval.
- Browser verification was not available in this Codex session and is not claimed.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.14.
- HANDOFF remains gapless through Entry 057.

### What Codex Needs to Know
- Admin-division cross-division visibility is an effective-permission layer, not an
  Administrator role default.
- A non-Developer Administrator, Project Manager, Estimator, or Field Supervisor outside
  the Admin division remains own-division unless explicitly granted
  `can_view_all_divisions`.
- Field Tech/User transaction history access is self-scoped to their own transactions
  within their division when `can_inventory_transactions` is true.
- Fake, missing, or unauthorized subjects should fail closed through the server-side RPC.
- Inventory costs are visible within authorized inventory row scope and are not governed
  by `can_view_financials`.

### What Claude Needs to Know
- The implementation reused the existing 202606120001 division anchor pattern.
- Developer role default and Admin-division default were kept separate.
- No schema tables, ledger behavior, balances, checkout/finalization behavior, count
  correction behavior, count intake behavior, bin_item retirement semantics, destination
  semantics, QR/scanner behavior, label-template behavior, or reserved features were
  changed.
- Local migration execution remains unverified only because Docker/local Supabase was
  unavailable in this environment.

### Next Steps (in order)
1. Ryan should approve and perform live migration application or provide a local Docker
   Supabase environment so the migration can be applied and tested against a database.
2. After deployment, verify transaction history as Developer, Admin-division user,
   non-Admin-division Administrator/Project Manager/Estimator/Field Supervisor, and
   Field Tech/User self-scoped access.
3. Continue to later v2.14 milestones only after confirming the read-rule foundation is
   deployed and behaving as expected.

### Open Questions / Concerns
- Local database reset/apply was blocked by missing Docker Desktop/local engine access.
- Authenticated browser verification was not available from this Codex session.

### Architecture Drift Warnings
- CLOSED for this milestone: Inventory division-scoped read-rule foundation is implemented
  according to ARCHITECTURE v2.14 Section 17a.
- RESERVED: QR generator/scanner, Label Template Designer, Grand Master UI surface,
  accounting export, location management UI, Return-to-Inventory, Buyout, Tools locations,
  vehicle bins, van-stock onboarding, Express Checkout, Manager Override, reorder/min-max,
  structured count-type field, and catalog creation from count UI.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.14, HANDOFF Entry 056).

---

## Entry 058 - Milestone 5A.1 v2.14 Read-Rule Live Apply Verification

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5A.1 live migration apply / verification
**Session type:** live Supabase migration apply / static and database verification

### Context
Ryan requested Milestone 5A.1 to apply and verify the v2.14 read-rule foundation
migration from Entry 057 against live Supabase project `keogysnoukbendfkfjcn`.
Required first actions were completed before live apply: `git pull --ff-only origin main`
returned already up to date; local `main` matched `origin/main` at `b8fc14b`; HEAD was
confirmed as commit `b8fc14b`; `docs/ARCHITECTURE.md` was confirmed as v2.14; HANDOFF
was confirmed gapless through Entry 057; and the repo clone files were used rather than
stale coordination docs or attachment copies.

The repo was not linked to Supabase through local CLI config, and the local Supabase CLI
was not authenticated. The Supabase connector was used instead after confirming the live
project list included `keogysnoukbendfkfjcn` as `northgate-hq-v2.0`.

### What Was Completed
- Identified the pending 5A migration:
  `supabase/migrations/20260622200351_v214_read_rule_foundation.sql`.
- Validated the migration before apply:
  - it implements the v2.14 read-rule foundation only;
  - it keeps Developer role default and Admin-division effective default separate;
  - it does not grant cross-division visibility to Administrator role outside Admin
    division by role default;
  - it reuses the existing 202606120001 scoped reference view division-anchor pattern;
  - it keeps inventory cost visible within allowed row scope;
  - it does not use `can_view_financials` as an inventory cost gate;
  - it does not introduce direct `inventory_balances` writes;
  - it does not change checkout/finalization, count correction, count intake,
    bin_item retirement, destination semantics, QR/scanner behavior, label-template
    behavior, or Financials/job-cost behavior.
- Applied the committed 5A SQL to live Supabase using the Supabase migration connector.
- Confirmed live migration history now includes `20260622204514 v214_read_rule_foundation`.
  The connector assigned the live migration version timestamp; the applied SQL corresponds
  to the committed local file `20260622200351_v214_read_rule_foundation.sql`.

### Post-Apply Verification
- Migration history confirmed `v214_read_rule_foundation` is applied live.
- Permission-layer SQL checks confirmed:
  - Developer role default has `can_view_all_divisions = true`;
  - Administrator role default has `can_view_all_divisions = false`;
  - Administrator in Admin division receives effective `can_view_all_divisions = true`;
  - Administrator in Electrical division remains effective `can_view_all_divisions = false`;
  - explicit Admin-division false override wins over the Admin-division default.
- Transaction-history function source check confirmed:
  - `can_view_financials` is not used by `read_inventory_transaction_history`;
  - `unit_cost_at_time` remains returned;
  - `can_view_all_divisions` is used for cross-division read scope;
  - the self-scoped predicate `tx.user_id = jwt_subject` remains present.
- Developer-context live RPC smoke check completed successfully and returned transaction
  history rows.
- No-JWT live RPC smoke check failed closed with `authenticated Clerk JWT is required`.
- `npm.cmd run build` passed after live apply.
- Static scan remained clean for prohibited deletes, table drops/alters/creates, direct
  `inventory_balances` writes, checkout/finalization, count correction, count intake,
  bin_item retirement, QR/scanner, and label-template changes.

### Schema Changes
- Live Supabase now has the v2.14 read-rule foundation migration applied.
- No schema tables were changed.
- No ad-hoc SQL outside the committed 5A migration SQL was used for implementation.
- No production Clerk, Netlify, or environment variables were modified.

### Code / File Changes
- No app code changed in this milestone.
- HANDOFF was updated with this Entry 058 only.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.14.
- HANDOFF remains gapless through Entry 058.

### What Codex Needs to Know
- Live Supabase migration history records the applied migration as
  `20260622204514 v214_read_rule_foundation` because the Supabase connector assigned the
  live migration version.
- The committed local migration file remains
  `20260622200351_v214_read_rule_foundation.sql`; its SQL is what was applied live.
- Future migration-history work should be aware of that version/name difference before
  running CLI migration repair or push operations.
- Authenticated browser verification was not available in this Codex session and is not
  claimed here.

### What Claude Needs to Know
- The live apply matched the locked 5A implementation and post-apply database checks.
- Developer role default and Admin-division effective default remain separate.
- `can_view_financials` was not introduced as an inventory cost gate.
- No ledger, balance, checkout/finalization, count correction, count intake, bin_item
  retirement, destination semantics, QR/scanner, label-template, or Financials/job-cost
  behavior was changed.
- The only caution is migration-history version bookkeeping due to connector-assigned
  live version `20260622204514` versus committed local file version `20260622200351`.

### Next Steps (in order)
1. Ryan may perform authenticated browser smoke verification on the `rnsolutions.net`
   custom domain:
   - login works;
   - Source shows server;
   - Developer/Admin access works;
   - Inventory Count loads;
   - Transaction History loads for Developer;
   - no Supabase 401 / PGRST301;
   - no Clerk production-domain error.
2. Before the next Supabase CLI migration push/repair, account for the live connector
   migration version `20260622204514 v214_read_rule_foundation`.
3. Proceed to the next v2.14 milestone only after Ryan is satisfied with production
   browser smoke results.

### Open Questions / Concerns
- Authenticated browser verification was not available from this Codex session.
- Migration history version bookkeeping should be handled intentionally in a later
  coordination step if the CLI expects the committed local timestamp exactly.

### Architecture Drift Warnings
- CLOSED for this milestone: the v2.14 read-rule foundation has been applied and verified
  live at the database level.
- RESERVED: QR generator/scanner, Label Template Designer, Grand Master UI surface,
  accounting export, location management UI, Return-to-Inventory, Buyout, Tools locations,
  vehicle bins, van-stock onboarding, Express Checkout, Manager Override, reorder/min-max,
  structured count-type field, and catalog creation from count UI.

### Routing Verdict
No Claude review needed - live migration/apply verification only for locked implementation (ARCHITECTURE v2.14, HANDOFF Entry 057).

---

## Entry 059 - Milestone 5B Location Management UI + QR Generator Foundation

**Date:** 2026-06-22
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5B location management / QR foundation
**Session type:** UI implementation / static verification / read-only database check

### Context
Ryan requested Milestone 5B to add a safe Location Management UI foundation and QR
generator for existing storage locations only. Required first actions were completed
before implementation: `git pull --ff-only origin main` returned already up to date;
local `main` matched `origin/main` at `1bdd182`; `docs/ARCHITECTURE.md` was confirmed
as v2.14; HANDOFF was confirmed gapless through Entry 058; Entry 058 was confirmed to
document the 5A.1 live migration apply; and the repo clone files were used rather than
stale coordination docs or attachment copies.

### What Was Completed
- Added a new Inventory tab: `Locations & QR`.
- Added a read-only Location Management panel for the existing storage hierarchy:
  - Unit;
  - Shelf;
  - Bay;
  - Bin.
- Reused the existing `useInventoryCountSheet` read path for `storage_units`, `shelves`,
  `bays`, and `bins`; no new Supabase table, view, RPC, RLS, or permission behavior was
  introduced.
- Built hierarchy records from existing stable UUID primary keys and displayed:
  - type;
  - human-readable code;
  - label/name;
  - parent path;
  - division where available.
- Added location search and type filtering for the hierarchy.
- Added QR URL generation for existing location rows only.
- Added QR SVG rendering, SVG download, and print support for the selected location.
- Added UI copy explaining that QR identity is the stable UUID and that renaming display
  codes should not invalidate printed labels.
- Deferred create, rename, and archive controls because no locked safe server-side
  location write APIs were surfaced in this milestone.

### QR Payload Details
- QR URLs are generated by `src/lib/locationQr.js`.
- Runtime app origin uses `window.location.origin` so production opened from
  `rnsolutions.net` emits that domain.
- Optional future app-origin override points are isolated in the helper:
  `VITE_APP_ORIGIN` or `VITE_APP_URL`.
- Payload format is:
  `https://<app-domain>/scan/location/<location_uuid>`.
- The encoded identity is the stable location UUID only.
- Human-readable codes such as `A111` are displayed beside the QR for operator clarity
  but are not encoded as identity.

### Schema Changes
- None.
- No migration was added.
- No Supabase live schema change was made.
- A read-only live database check confirmed the existing storage hierarchy counts and
  UUID presence:
  - `storage_units`: 2;
  - `shelves`: 2;
  - `bays`: 3;
  - `bins`: 9;
  - each location table has UUID primary key values available.

### Code / File Changes
- Updated `src/App.jsx`:
  - added hierarchy record construction;
  - added `LocationManagementPanel`;
  - added the `Locations & QR` inventory tab;
  - added read-only QR download/print actions.
- Updated `src/styles.css` for the location hierarchy and QR layout.
- Added `src/lib/locationQr.js` for deterministic app-origin and location QR URL helpers.
- Added `src/lib/qrCode.js` for browser-safe SVG QR generation without a new dependency.

### Verification
- `npm.cmd run build` passed.
- Local QR helper smoke test generated an SVG for
  `https://rnsolutions.net/scan/location/<uuid>`.
- Static scan confirmed no migration files were added or changed.
- Static scan confirmed no changes to Supabase hooks/services, transaction history hooks,
  permissions hooks, or 5A read-rule migration files.
- Static scan confirmed no direct `inventory_balances` write path was added.
- Static scan confirmed QR payload helper uses `/scan/location/<uuid>`.
- Static review confirmed QR payload generation uses selected location `id`, not
  human-readable location code, material code, bin_item id, catalog item id, transaction
  id, or compact path.
- Authenticated browser verification was not available in this Codex session and is not
  claimed here.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.14.
- HANDOFF remains gapless through Entry 059.

### What Codex Needs to Know
- Location Management is read-only in this milestone.
- QR generation is locations-only and limited to existing Unit/Shelf/Bay/Bin rows.
- QR download/print support is basic SVG output, not the future Label Template Designer.
- The camera-based scanner, scan target contents page, Avery templates, and
  `label_templates` work remain unbuilt.
- Future scan targets must still resolve server-side and respect read rules; QR is not a
  permission bypass.

### What Claude Needs to Know
- No schema, RPC, RLS, permission flag, ledger, balance, checkout/finalization, count
  correction, count intake, bin_item retirement, destination semantics, transaction
  history read-rule, `can_view_all_divisions`, `can_view_financials`, inventory cost,
  QR scanner, label-template, or Financials/job-cost behavior was changed.
- Create/rename/archive location writes were intentionally deferred rather than invented
  client-side.

### Next Steps (in order)
1. Ryan may perform authenticated browser smoke verification on the `rnsolutions.net`
   custom domain:
   - Source shows server;
   - `Locations & QR` loads;
   - Unit/Shelf/Bay/Bin hierarchy displays;
   - selected QR URL matches `/scan/location/<location_uuid>`;
   - displayed code remains visible beside the QR;
   - no Supabase 401 / PGRST301;
   - no Clerk production-domain error.
2. Route to Claude before adding location create, rename, or archive if new schema, RPCs,
   RLS, or permission behavior are required.
3. Keep scanner, Label Template Designer, Grand Master UI, and accounting export reserved
   for their own milestones.

### Open Questions / Concerns
- Authenticated browser verification was not available from this Codex session.
- Location write APIs were not identified as locked/safe in this milestone, so write
  controls remain deferred.

### Architecture Drift Warnings
- OPEN for later milestones: camera-based web scanner and scan target contents page.
- RESERVED: Label Template Designer, `label_templates`, Avery 5164/8160 designer, Grand
  Master UI surface, accounting export, Return-to-Inventory, Buyout, Tools locations,
  vehicle bins, van-stock onboarding, Express Checkout, Manager Override, reorder/min-max,
  structured count-type field, and catalog creation from count UI.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.14, HANDOFF Entry 058).

---

## Entry 060 - Milestone 5C Web QR Scanner + Scan Route

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5C web QR scanner / scan route
**Session type:** UI implementation / route handling / static verification

### Context
Ryan requested Milestone 5C to add the web QR scanner and scan route for location QR
payloads only. Required first actions were completed before implementation:
`git pull --ff-only origin main` returned already up to date; local `main` matched
`origin/main` at `1b9cb41`; `docs/ARCHITECTURE.md` was confirmed as v2.14; HANDOFF was
confirmed gapless through Entry 059; Entry 059 was confirmed to document the 5B Location
QR foundation; and the repo clone files were used rather than stale coordination docs or
attachment copies.

### What Was Completed
- Added in-app route handling for `/scan/location/<location_uuid>`.
- Added a read-only scan result view for location QR payloads.
- Added a `Scan QR` tab under Inventory.
- Added a web camera scanner UI that uses the browser-native `BarcodeDetector` API when
  available.
- Added clean fallback messaging for:
  - unsupported native QR detection;
  - missing camera API;
  - non-secure HTTP contexts;
  - denied or unavailable camera permission.
- Added manual-entry fallback for pasted scan payloads.
- Added scan-result contents display using the existing inventory location/count read path.
- Kept scan result display read-only with no inventory create, update, checkout, count,
  transfer, return, retirement, or destination actions.

### Payload Handling
- Accepted payload formats:
  - `https://<app-domain>/scan/location/<location_uuid>`;
  - `/scan/location/<location_uuid>`;
  - bare `<location_uuid>` for manual entry.
- Unsupported payloads are rejected gracefully with user-facing scanner copy.
- Non-location entity types remain unsupported.
- A111-style compact codes and human-readable location codes are not accepted as identity.
- Location resolution uses the stable UUID from the typed payload.

### Schema Changes
- None.
- No migration was added.
- No live Supabase schema change was made.
- No new dependency was added.

### Code / File Changes
- Updated `src/lib/locationQr.js`:
  - added scan path generation;
  - added payload parsing/validation for location QR payloads.
- Updated `src/App.jsx`:
  - added lightweight browser path handling;
  - added `/scan/location/<uuid>` result rendering;
  - added `LocationScannerPanel`;
  - added `LocationScanResult`;
  - added the `Scan QR` Inventory tab.
- Updated `src/styles.css`:
  - added responsive scanner, manual-entry, and scan-result styles.

### Verification
- `npm.cmd run build` passed.
- Parser smoke test confirmed:
  - full `https://rnsolutions.net/scan/location/<uuid>` payload routes correctly;
  - relative `/scan/location/<uuid>` payload routes correctly;
  - bare UUID manual entry routes correctly;
  - `/scan/material/<uuid>` is rejected;
  - `A111` is rejected.
- Static scan confirmed no migration files were added or changed.
- Static scan confirmed no package/dependency file was changed.
- Static scan confirmed no Supabase hooks/services were changed.
- Static scan confirmed no 5A read-rule, transaction-history, permission, or
  `can_view_all_divisions` behavior was changed.
- Static scan confirmed no direct `inventory_balances` write path was added.
- Static scan confirmed no checkout/finalization function was changed.
- Static review confirmed scan result resolves by location UUID, not human-readable code.
- Authenticated browser/camera verification was not available in this Codex session and is
  not claimed here.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.14.
- HANDOFF remains gapless through Entry 060.

### What Codex Needs to Know
- The web scanner is browser-native: no scanner dependency was added.
- Camera scanning requires HTTPS and browser support for `BarcodeDetector`.
- Manual scan payload entry is always available as the fallback.
- The scan result view uses the existing storage hierarchy/count read path and requires
  server permission source plus `can_manage_inventory`.
- Scanner and scan result views are read-only and are not a permission bypass.

### What Claude Needs to Know
- No schema, RPC, RLS, permission flag, ledger, balance, checkout/finalization, count
  correction, count intake, bin_item retirement, destination semantics, transaction
  history read-rule, `can_view_all_divisions`, `can_view_financials`, inventory cost,
  label-template, non-location QR entity, or Financials/job-cost behavior was changed.
- Non-location QR entities remain unbuilt.
- Location create/rename/archive remains unbuilt.

### Next Steps (in order)
1. Ryan may perform authenticated browser/camera smoke verification on the
   `rnsolutions.net` custom domain:
   - Source shows server;
   - `Scan QR` tab loads;
   - camera permission prompt appears on supported browsers;
   - manual entry of a 5B location QR URL routes to `/scan/location/<uuid>`;
   - scan result displays the correct human-readable location path;
   - unsupported payloads are rejected without crashing;
   - no Supabase 401 / PGRST301;
   - no Clerk production-domain error.
2. Keep Label Template Designer, Grand Master UI, accounting export, and non-location QR
   entity support reserved for their own milestones.
3. Route to Claude before any scan result action becomes write-capable or before adding
   new schema/RPC/RLS/permission behavior.

### Open Questions / Concerns
- Authenticated browser and camera verification were not available from this Codex session.
- Native camera scanning depends on browser `BarcodeDetector` support; manual entry remains
  the fallback where unsupported.

### Architecture Drift Warnings
- CLOSED for this milestone: camera-based web scanner and `/scan/location/<uuid>` route
  are implemented for location payloads only.
- RESERVED: non-location QR entities, React Native companion app, Label Template
  Designer, `label_templates`, Avery 5164/8160 designer, Grand Master UI surface,
  accounting export, location create/rename/archive, Return-to-Inventory, Buyout, Tools
  locations, vehicle bins, van-stock onboarding, Express Checkout, Manager Override,
  reorder/min-max, structured count-type field, and catalog creation from count UI.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.14, HANDOFF Entry 059).

---

## Entry 061 - Milestone 5C.1 Chrome-Compatible QR Scanner Fallback

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5C.1 Chrome scanner fallback
**Session type:** UI implementation / dependency addition / static verification

### Context
Ryan requested Milestone 5C.1 after Chrome showed the scanner message:
`This browser does not support native QR detection. Use manual entry.` Required first
actions were completed before implementation: `git pull --ff-only origin main` returned
already up to date; local `main` matched `origin/main` at `203911f`;
`docs/ARCHITECTURE.md` was confirmed as v2.14; HANDOFF was confirmed gapless through
Entry 060; Entry 060 was confirmed to document the location-only scanner route; and the
repo clone files were used rather than stale coordination docs or attachment copies.

### What Was Completed
- Added a Chrome-compatible camera decoding fallback for location QR scanning.
- Preserved the native `BarcodeDetector` path when the browser supports QR detection.
- Added QR support detection using `BarcodeDetector.getSupportedFormats()` when available.
- Changed the previous native-unsupported terminal branch into an automatic compatibility
  camera scanner path.
- Added scanner mode display while the camera is active:
  - Native scanner;
  - Compatibility scanner;
  - manual entry remains available.
- Preserved manual scan payload entry as a fallback, not the only Chrome path.
- Preserved route handling through `/scan/location/<location_uuid>`.

### Payload Handling
- Accepted payload formats remain:
  - `https://<app-domain>/scan/location/<location_uuid>`;
  - `/scan/location/<location_uuid>`;
  - bare `<location_uuid>` for manual entry.
- Unsupported payloads are rejected through the existing parser.
- Non-location entity types remain unsupported.
- Human-readable location codes remain display labels only and are not accepted as scan
  identity.
- Scan result routing still resolves by stable location UUID.

### Schema Changes
- None.
- No migration was added.
- No live Supabase schema change was made.
- No RPC, RLS, permission, ledger, balance, checkout/finalization, count correction,
  count intake, bin_item retirement, destination semantics, or transaction-history
  behavior was changed.

### Code / File Changes
- Updated `src/App.jsx`:
  - added the `jsqr` import;
  - added native QR detector support checks;
  - added video-frame QR decoding fallback for browsers without native QR support;
  - kept scanner behavior read-only and location-only.
- Updated `package.json`:
  - added `jsqr`.
- Added `package-lock.json`.

### Verification
- `npm.cmd run build` passed.
- Parser smoke test confirmed:
  - full `https://rnsolutions.net/scan/location/<uuid>` payload routes correctly;
  - relative `/scan/location/<uuid>` payload routes correctly;
  - bare UUID manual entry routes correctly;
  - `/scan/material/<uuid>` is rejected;
  - `A111` is rejected.
- Static scan confirmed no migration files were added or changed.
- Static scan confirmed no Supabase hooks/services were changed.
- Static scan confirmed no docs or architecture files were changed.
- Static scan confirmed no direct `inventory_balances` write path was added.
- Static scan confirmed no checkout/finalization function was changed.
- Static review confirmed no scan result write action was added.
- Authenticated browser/camera verification was not available in this Codex session and is
  not claimed here.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.14.
- HANDOFF remains gapless through Entry 061.

### What Codex Needs to Know
- Chrome no longer has to rely on manual entry solely because native `BarcodeDetector`
  support is unavailable.
- The camera scanner now chooses native QR detection first, then falls back to `jsqr`.
- Manual entry remains present for HTTPS, permission, camera, or scan-quality issues.
- Scanner and scan result views remain read-only and are not a permission bypass.

### What Claude Needs to Know
- No schema, RPC, RLS, permission flag, ledger, balance, checkout/finalization, count
  correction, count intake, bin_item retirement, destination semantics, transaction
  history read-rule, `can_view_all_divisions`, `can_view_financials`, inventory cost,
  label-template, non-location QR entity, or Financials/job-cost behavior was changed.
- Non-location QR entities remain unbuilt.
- Location create/rename/archive remains unbuilt.

### Next Steps (in order)
1. Ryan may perform authenticated Chrome/camera smoke verification on the
   `rnsolutions.net` custom domain:
   - Source shows server;
   - `Scan QR` tab loads;
   - Start Camera opens a camera stream;
   - Chrome displays Compatibility scanner when native QR detection is unavailable;
   - a 5B location QR routes to `/scan/location/<uuid>`;
   - manual entry of a location QR URL still routes correctly;
   - unsupported payloads are rejected without crashing;
   - no Supabase 401 / PGRST301;
   - no Clerk production-domain error.
2. Keep Label Template Designer, Grand Master UI, accounting export, and non-location QR
   entity support reserved for their own milestones.
3. Route to Claude before any scan result action becomes write-capable or before adding
   new schema/RPC/RLS/permission behavior.

### Open Questions / Concerns
- Authenticated browser and camera verification were not available from this Codex
  session.
- Real-device scan performance should be confirmed in Chrome against printed and
  screen-displayed location QR codes.

### Architecture Drift Warnings
- CLOSED for this milestone: Chrome-compatible camera fallback for location QR scanning.
- RESERVED: non-location QR entities, React Native companion app, Label Template
  Designer, `label_templates`, Avery 5164/8160 designer, Grand Master UI surface,
  accounting export, location create/rename/archive, Return-to-Inventory, Buyout, Tools
  locations, vehicle bins, van-stock onboarding, Express Checkout, Manager Override,
  reorder/min-max, structured count-type field, and catalog creation from count UI.

### Routing Verdict
No Claude review needed - Chrome-compatible scanner fallback within locked scan behavior (ARCHITECTURE v2.14, HANDOFF Entry 060).

---

## Entry 062 - Milestone 5C.3 Prep v2.15 Scan Destination Behavior Lock

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5C.3 Prep lock-document update
**Session type:** Documentation-only architecture lock update

### Context
Ryan requested Milestone 5C.3 Prep to apply the Rule 20-cleared v2.15 Scan
Destination Behavior lock-document delta before running the planned Milestone
5C.2 implementation. This session intentionally did not implement 5C.2.
Required first actions were completed before editing: `git pull --ff-only origin
main` returned already up to date; local `main` matched `origin/main` at
`5948537`; `docs/ARCHITECTURE.md` was confirmed as v2.14 before editing;
HANDOFF was confirmed gapless through Entry 061; no stale coordination docs
were used; and work was performed only from the git clone.

### What Was Completed
- Updated `docs/ARCHITECTURE.md` to v2.15.
- Added new Section 10a: Scan Destination Behavior.
- Locked scan destination pages as division-scoped, location-scoped views and
  action entry points.
- Locked that scan destination pages dispatch into the existing cart/checkout
  and `physical_count_correction` engines.
- Locked that scan pages must not reimplement cart, transaction, or balance
  logic.
- Locked that scan pages introduce no new transaction type and change no balance
  derivation.
- Locked authentication before contents.
- Locked server-resolved, fail-closed behavior under Rule 4.
- Locked that unauthorized scans do not confirm whether a location exists.
- Locked bin pages as the action level.
- Locked unit, shelf, and bay pages as read + navigation surfaces where actions
  occur at bin level.
- Locked that no generic ambiguous +/- controls are allowed.
- Locked that scan pages initiate no location-to-location/bin-to-bin movement
  and do not surface Transfer Location.
- Locked multi-bin batch cart actions from hierarchy levels as RESERVED.
- Locked that current contents/balances reads are broader than
  transaction-history self-scope, which still governs history reads only.
- Locked that label layout may vary by level through
  `label_templates.scope_level`, while QR payload remains unchanged.
- Preserved the v2.14 summary as prior/history text.

### Schema Changes
- None.
- No migration was added.
- No live Supabase schema change was made.
- No RPC, RLS, permission, ledger, balance, checkout/finalization, count
  correction, count intake, bin_item retirement, destination semantics,
  transaction-history, Clerk, Netlify, or app behavior was changed.

### Code / File Changes
- Updated `docs/ARCHITECTURE.md`.
- Updated `HANDOFF.md`.
- No app code was changed.
- No package, Netlify, Supabase, migration, screenshot, attachment, scratch, or
  proposal file was committed.

### Verification
- Confirmed `docs/ARCHITECTURE.md` now says v2.15.
- Confirmed Section 10a exists after Section 10 and before Section 11.
- Confirmed HANDOFF is gapless through Entry 062.
- Confirmed Entry 062 appears only once.
- Confirmed only `docs/ARCHITECTURE.md` and `HANDOFF.md` were staged.
- Confirmed the Claude proposal/brief attachment was not staged.
- Confirmed no app implementation work was performed.
- Confirmed Milestone 5C.2 was not implemented as part of this prep milestone.

### Lock Document Changes
- ARCHITECTURE advanced from v2.14 to v2.15.
- New Section 10a locks Scan Destination Behavior.
- HANDOFF remains gapless through Entry 062.

### What Codex Needs to Know
- Milestone 5C.2 remains queued for implementation after this documentation
  commit.
- Scan destination behavior is now canonical in ARCHITECTURE v2.15 Section 10a.
- First build sequence is read-before-write: location-scoped
  contents/navigation first, then action bindings to existing engines.
- Scan pages are not a permission bypass and must fail closed generically.
- Bin pages are the action level; unit/shelf/bay pages are read + navigation
  only.
- QR payload remains `/scan/location/<uuid>` and identity remains the UUID.

### What Claude Needs to Know
- This was a Rule 20-cleared documentation application only.
- No schema, RPC, RLS, permission flag, ledger, balance, checkout/finalization,
  count correction, count intake, bin_item retirement, destination semantics,
  transaction history read-rule, `can_view_all_divisions`,
  `can_view_financials`, inventory cost, label-template mechanism,
  non-location QR entity, or Financials/job-cost behavior was changed.
- Scan destination pages must use existing cart/checkout and
  `physical_count_correction` engines rather than reimplementing transaction,
  cart, or balance logic.

### Next Steps (in order)
1. Proceed to the planned Milestone 5C.2 implementation only after this v2.15
   lock-document commit is in place.
2. Build the read-first location-scoped contents/navigation view before adding
   action bindings.
3. Route to Claude before any implementation touches schema, RPCs, RLS,
   permissions, ledger behavior, balance derivation, transaction-history scope,
   destination semantics, or reserved features.

### Open Questions / Concerns
- None for this documentation-only milestone.

### Architecture Drift Warnings
- CLOSED for this milestone: v2.15 Scan Destination Behavior is now locked in
  Section 10a.
- RESERVED: Milestone 5C.2 implementation, scan page write/action bindings,
  multi-bin batch cart actions, non-location QR entities, React Native companion
  app, Label Template Designer implementation, `label_templates`, Avery
  5164/8160 designer implementation, Grand Master UI surface, accounting export,
  location create/rename/archive, Return-to-Inventory, Buyout, Tools locations,
  vehicle bins, van-stock onboarding, Express Checkout, Manager Override,
  reorder/min-max, structured count-type field, and catalog creation from count
  UI.

### Routing Verdict
No Claude review needed - Rule 20-cleared documentation update applied as instructed (ARCHITECTURE v2.15, HANDOFF Entry 062).

---

## Entry 063 - Milestone 5C.2 v2.15 Scan Destination Read-First Hierarchy Pages

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5C.2 read-first scan destination pages
**Session type:** UI implementation / read-path reuse / static verification

### Context
Ryan requested Milestone 5C.2 after v2.15 Section 10a was locked by Entry 062.
Required first actions were completed before implementation: `git pull --ff-only
origin main` returned already up to date; local `main` matched `origin/main` at
`c9ad6a4`; `docs/ARCHITECTURE.md` was confirmed as v2.15; Section 10a Scan
Destination Behavior was confirmed present; HANDOFF was confirmed gapless
through Entry 062; the Milestone 5C scanner route was confirmed present; the
Milestone 5C.1 Chrome-compatible scanner fallback was confirmed present; and no
stale coordination docs were used.

### What Was Completed
- Implemented read-first scan destination pages for location QR scans.
- Added level-aware scan destination resolution for:
  - Unit;
  - Shelf;
  - Bay;
  - Bin.
- Preserved UUID-based scan identity and `/scan/location/<location_uuid>` route
  behavior.
- Added scoped human-readable location code/path display.
- Added hierarchy navigation:
  - Bin pages navigate up to Bay, Shelf, and Unit;
  - Bay pages navigate up to Shelf/Unit and down to Bins;
  - Shelf pages navigate up to Unit and down to Bays/Bins;
  - Unit pages navigate down to Shelves/Bays/Bins.
- Added grouped read displays:
  - Bin scan shows current material rows in that bin;
  - Bay scan shows bins under the bay and material rows grouped by bin;
  - Shelf scan shows bay/bin/material contents grouped by bay/bin;
  - Unit scan shows shelf/bay/bin/material contents grouped by shelf/bay/bin.
- Added read-first UI copy:
  - "Scan result actions are read-first in this version."
  - "Cart staging and count correction will be wired to existing engines in a
    later milestone."
- Added clearer empty states for unavailable scan targets, no bins, no shelves,
  no material rows under scope, and no contents in a bin.
- Kept scan destination components isolated so bin-level action bindings can be
  added later without rewriting the read view.

### Schema Changes
- None.
- No migration was added.
- No live Supabase schema change was made.
- No RPC, RLS, permission, ledger, balance, checkout/finalization, count
  correction, count intake, bin_item retirement, destination semantics,
  transaction-history read-rule, `can_view_all_divisions`,
  `can_view_financials`, inventory cost, Location QR payload, scanner payload,
  Clerk, Netlify, or Financials/job-cost behavior was changed.

### Code / File Changes
- Updated `src/App.jsx`:
  - added scan destination hierarchy model helpers;
  - replaced the flat scan result contents table with level-aware read-first
    scan destination components;
  - reused existing `useInventoryCountSheet` read path and existing
    `/scan/location/<uuid>` route helper.
- Updated `src/styles.css`:
  - added responsive hierarchy navigation and grouped contents styling.
- No hooks, services, Supabase files, migrations, package files, architecture
  docs, or scan parser files were changed.

### Verification
- `npm.cmd run build` passed.
- Parser smoke test confirmed:
  - full `https://rnsolutions.net/scan/location/<uuid>` payload routes
    correctly;
  - relative `/scan/location/<uuid>` payload routes correctly;
  - bare UUID manual entry routes correctly;
  - `/scan/material/<uuid>` is rejected;
  - `A111` is rejected.
- Static scan confirmed no migration files were added or changed.
- Static scan confirmed no Supabase hooks/services were changed.
- Static scan confirmed no package files were changed.
- Static scan confirmed no architecture docs were changed.
- Static scan confirmed no direct `inventory_balances` write path was added.
- Static scan confirmed no checkout/finalization function was changed.
- Diff review confirmed newly added scan-page buttons are navigation-only and
  route through `buildLocationScanPath()`.
- Diff review confirmed no scan-page cart staging, count correction, transfer,
  retire, checkout, quantity adjustment, plus/minus, note/reason form, or other
  inventory-changing action was added.
- Authenticated browser/camera verification was not available in this Codex
  session and is not claimed here.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.
- HANDOFF remains gapless through Entry 063.

### What Codex Needs to Know
- Scan destination pages now implement the read-before-write step from v2.15
  Section 10a.
- Unit/Shelf/Bay/Bin scan pages are level-aware and use existing server-backed
  read paths.
- Bin-level cart/count action bindings remain deferred to a later milestone.
- Hierarchy navigation is read/navigation only and continues to route by UUID.
- Human-readable location codes and paths remain display text only.
- Unsupported scan payload behavior from 5C/5C.1 is unchanged.

### What Claude Needs to Know
- No schema, RPC, RLS, permission flag, ledger, balance, checkout/finalization,
  count correction, count intake, bin_item retirement, destination semantics,
  transaction history read-rule, `can_view_all_divisions`,
  `can_view_financials`, inventory cost, label-template mechanism,
  non-location QR entity, or Financials/job-cost behavior was changed.
- No new read-only RPC/view was required.
- No scan page write/action binding was added.

### Next Steps (in order)
1. Ryan may perform authenticated browser smoke verification on the
   `rnsolutions.net` custom domain:
   - Source shows server;
   - manual entry or scan of valid Unit/Shelf/Bay/Bin QR opens the correct
     scoped page;
   - human-readable path displays;
   - hierarchy navigation works up/down;
   - contents display correctly where data exists;
   - scan pages remain read-first with no inventory-changing buttons;
   - unsupported payloads are rejected gracefully;
   - Chrome scanner fallback still works;
   - no Supabase 401 / PGRST301;
   - no Clerk production-domain error.
2. Keep bin-level cart/count action bindings deferred until a later milestone.
3. Route to Claude before adding scan-page write actions, new RPCs/views,
   non-location QR entities, human-code scan identity, transaction-history
   changes, ledger/balance/checkout/count changes, permission changes, or any
   reserved feature.

### Open Questions / Concerns
- Authenticated browser and camera verification were not available from this
  Codex session.
- Real production data should be used to visually confirm Unit/Shelf/Bay/Bin
  grouping and empty states.

### Architecture Drift Warnings
- CLOSED for this milestone: read-first scan destination hierarchy pages for
  Unit/Shelf/Bay/Bin.
- RESERVED: bin-level action bindings, cart staging from scan pages, count
  correction from scan pages, multi-bin batch cart actions, Transfer Location
  surfacing from scan pages, non-location QR entities, React Native companion
  app, Label Template Designer implementation, `label_templates`, Avery
  5164/8160 designer implementation, Grand Master UI surface, accounting export,
  location create/rename/archive, Return-to-Inventory, Buyout, Tools locations,
  vehicle bins, van-stock onboarding, Express Checkout, Manager Override,
  reorder/min-max, structured count-type field, and catalog creation from count
  UI.

### Routing Verdict
No Claude review needed - read-first scan destination hierarchy within locked behavior (ARCHITECTURE v2.15, HANDOFF Entry 062).

---

## Entry 064 - Milestone 5C.2a Manual Location Code Entry Closeout

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5C.2a manual scan fallback closeout
**Session type:** Verification / documentation closeout

### Context
Ryan requested Milestone 5C.2a to close out the manual-entry refinement after
Milestone 5C.2 read-first scan destination hierarchy pages. First-action checks
confirmed a sequencing mismatch: the manual-entry refinement had already been
committed and pushed as `d96e73e` (`Refine scan manual location lookup`) before
this closeout request. Local `main` matched `origin/main` at `d96e73e`;
`docs/ARCHITECTURE.md` was confirmed as v2.15; Section 10a remains present;
HANDOFF was confirmed gapless through Entry 063; and no stale coordination docs
were used.

### What Was Completed
- Verified the manual-entry fallback now accepts location codes as lookup
  shortcuts.
- Verified manual-entry lookup supports human-readable examples such as:
  - Unit code: `C`;
  - Shelf code: `C2`;
  - Bay code: `C21`;
  - Bin code: `C211`.
- Verified manual-entry lookup resolves through the existing loaded
  Unit/Shelf/Bay/Bin hierarchy.
- Verified exact single manual-code matches route to
  `/scan/location/<resolved_location_uuid>`.
- Verified no-match manual entry shows `No matching location found.`
- Verified ambiguous manual entry shows a disambiguation list rather than
  guessing.
- Verified the UI copy now says: `Scan a Northgate HQ location QR, paste a QR
  link, or enter a location code like C211.`

### Identity / Scanner Behavior
- QR identity remains UUID-only.
- Human-readable location codes are convenience lookup shortcuts only.
- Human-readable codes are not encoded or treated as permanent scan identity.
- Camera QR parsing remains strict and location-only.
- Unsupported non-location QR payloads remain rejected gracefully by the existing
  scan payload parser.

### Schema Changes
- None.
- No migration was added.
- No live Supabase schema change was made.
- No RPC, RLS, permission, ledger, balance, checkout/finalization, count
  correction, Count Intake, `physical_count_correction`, bin_item retirement,
  destination semantics, transaction-history read-rule,
  `can_view_all_divisions`, `can_view_financials`, inventory cost, Location QR
  payload generation, Clerk, Netlify, or Financials/job-cost behavior was
  changed.

### Code / File Changes
- Manual-entry refinement code was already committed in `d96e73e`:
  - `src/App.jsx`;
  - `src/styles.css`.
- This closeout commit updates `HANDOFF.md`.
- No Supabase files, migrations, hooks/services, package files, architecture
  docs, or scan parser files were changed in this closeout.

### Verification
- `npm.cmd run build` passed.
- Parser smoke test confirmed:
  - full `https://rnsolutions.net/scan/location/<uuid>` payload routes
    correctly;
  - relative `/scan/location/<uuid>` payload routes correctly;
  - bare UUID manual entry routes correctly;
  - `/scan/material/<uuid>` is rejected;
  - `A111` is rejected by strict QR parsing;
  - `C211` is rejected by strict QR parsing and remains manual UI lookup only.
- Static scan confirmed `allowCodeLookup` is used only for manual submit.
- Static scan confirmed camera-decoded QR payloads still call strict
  `handlePayload(rawValue)` without manual code lookup enabled.
- Static scan confirmed no Supabase/hooks/services/package/architecture/scan
  parser files changed.
- Static diff review confirmed no write paths or inventory-changing controls
  were added.
- Static review confirmed scan result pages remain read-first and do not expose
  cart/count/transfer/retire/checkout buttons.
- Authenticated browser/camera verification was not available in this Codex
  session and is not claimed here.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.
- HANDOFF remains gapless through Entry 064.

### What Codex Needs to Know
- Manual entry can resolve human-readable location codes as lookup shortcuts, but
  scan identity remains UUID-only.
- Camera QR parsing remains strict and location-only.
- Manual lookup routing still lands on `/scan/location/<resolved_uuid>`.
- No scan-page write actions were added.

### What Claude Needs to Know
- No schema, RPC, RLS, permission flag, ledger, balance, checkout/finalization,
  count correction, Count Intake, `physical_count_correction`, bin_item
  retirement, destination semantics, transaction-history read-rule,
  `can_view_all_divisions`, `can_view_financials`, inventory cost, QR payload
  generation, label-template mechanism, non-location QR entity, or
  Financials/job-cost behavior was changed.
- Human-readable codes remain lookup shortcuts only, not QR identity.

### Next Steps (in order)
1. Ryan may perform authenticated browser smoke verification on the
   `rnsolutions.net` custom domain:
   - manual entry of `/scan/location/<uuid>` routes correctly;
   - manual entry of a full same-domain scan URL routes correctly;
   - manual entry of a bare UUID routes correctly;
   - manual entry of `C`, `C2`, `C21`, and `C211` resolves when exactly one
     matching visible location exists;
   - no-match manual entry shows `No matching location found.`;
   - ambiguous manual entry shows a disambiguation list;
   - unsupported non-location QR payloads are rejected gracefully;
   - camera QR scanning remains strict and location-only;
   - scan result pages remain read-first with no inventory-changing buttons.
2. Keep bin-level cart/count action bindings deferred until a later milestone.
3. Route to Claude before treating human-readable codes as QR identity, loosening
   camera QR parsing, adding schema/RPC/RLS/permission behavior, adding
   inventory-changing actions, or touching ledger/balance/checkout/count,
   bin_item retirement, destination, transaction-history, `can_view_financials`,
   or inventory cost behavior.

### Open Questions / Concerns
- Authenticated browser and camera verification were not available from this
  Codex session.

### Architecture Drift Warnings
- CLOSED for this milestone: manual location code entry lookup closeout.
- RESERVED: human-readable codes as QR identity, non-location QR entities,
  scan-page write/action bindings, cart staging from scan pages, count
  correction from scan pages, multi-bin batch cart actions, Transfer Location
  surfacing from scan pages, React Native companion app, Label Template Designer
  implementation, `label_templates`, Avery 5164/8160 designer implementation,
  Grand Master UI surface, accounting export, location create/rename/archive,
  Return-to-Inventory, Buyout, Tools locations, vehicle bins, van-stock
  onboarding, Express Checkout, Manager Override, reorder/min-max, structured
  count-type field, and catalog creation from count UI.

### Routing Verdict
No Claude review needed - manual-entry lookup refinement within locked scan behavior (ARCHITECTURE v2.15, HANDOFF Entry 063).

---

## Entry 065 - Milestone 5D Label Template Designer Foundation + Hierarchy Summary Polish

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5D label template foundation
**Session type:** Implementation / static verification

### Context
Ryan requested Milestone 5D to add the Label Template Designer foundation and
hierarchy summary polish under ARCHITECTURE v2.15. First-action checks confirmed
local `main` was pulled and matched `origin/main`; `docs/ARCHITECTURE.md` is
v2.15; Section 10a remains present; HANDOFF was gapless through Entry 064; and
no stale coordination docs were used. Milestones 5C.2 and 5C.2a were already
committed and pushed before this work began.

### What Was Completed
- Added the `label_templates` foundation migration file.
- Added a Label Designer tab under the Inventory surface.
- Added a reusable template editor foundation for:
  - Avery 5164 Unit/Shelf/Bay placards;
  - Avery 8160 Bin labels;
  - optional QR field;
  - include/exclude toggles for QR, location code, location path, display label,
    and contents summary;
  - per-field color, alignment, opacity, bold, and underline controls.
- Added live preview using the existing Section 10 scan payload format:
  `/scan/location/<uuid>`.
- Added saved-template read/create/update/archive UI using the new
  `label_templates` table path.
- Added archive-over-delete behavior for saved templates.
- Added display-only hierarchy summaries to Location Management and scan
  hierarchy navigation cards.

### Schema / Migration Notes
- Added `supabase/migrations/202606230001_label_templates_foundation.sql`.
- The migration creates `public.label_templates` with:
  - `id`;
  - `name`;
  - `avery_template`;
  - `scope_level`;
  - `include_qr`;
  - `layout`;
  - `created_by`;
  - `created_at`;
  - `archived_at`.
- RLS is enabled.
- Active templates are selectable by authenticated users with
  `can_manage_inventory`.
- Insert/update/archive is limited to Developer/Admin users with
  `can_manage_inventory`.
- No DELETE policy or DELETE grant was added.
- No live Supabase migration was applied by Codex; Ryan/Supabase must apply the
  migration through the approved deployment path.

### QR / Scan Identity Behavior
- QR payload generation remains UUID-only.
- Label preview uses `/scan/location/<uuid>`.
- Human-readable location codes remain lookup shortcuts only.
- No non-location QR entity behavior was added.
- No scan-page cart/count/transfer/retire/checkout action bindings were added.

### Hierarchy Summary Polish
- Location Management rows now show display-only child/location contents
  summaries from already loaded Unit/Shelf/Bay/Bin and inventory count sheet
  data.
- Scan hierarchy up/down navigation cards now show display-only summaries from
  existing readable data.
- No new read RPC was added for hierarchy summaries.
- No inventory write path was added.

### Code / File Changes
- `src/App.jsx`
  - Added data-driven Avery template geometry constants.
  - Added label template draft/preview/editor UI.
  - Added label template read/save/archive calls through the existing Supabase
    client path.
  - Added hierarchy summary helpers using existing loaded location/count data.
- `src/styles.css`
  - Added responsive Label Designer and preview styling.
- `supabase/migrations/202606230001_label_templates_foundation.sql`
  - Added the `label_templates` table, RLS policies, index, comments, and grants.
- `HANDOFF.md`
  - Added this Entry 065.

### Verification
- `npm.cmd run build` passed.
- `git diff --check` passed.
- Static scan confirmed no new direct `inventory_balances` write path was added.
- Static review confirmed no checkout/finalization, ledger, count correction,
  transaction history, bin_item retirement, destination semantics, or inventory
  balance behavior was changed.
- Static review confirmed the label preview keeps `/scan/location/<uuid>` as
  the QR payload.
- Static review confirmed template archival updates `archived_at` and does not
  delete rows.
- Static review confirmed no live Supabase migration was applied.
- Browser verification was not available in this Codex session and is not
  claimed here.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.
- HANDOFF remains gapless through Entry 065.

### What Codex Needs to Know
- Label Template Designer is a foundation surface, not a final print/PDF engine.
- Avery geometry is data-driven for 5164 and 8160.
- Saved templates require the new `label_templates` migration to be applied in
  Supabase before production save/archive operations work.
- QR identity remains the stable location UUID.
- The hierarchy summaries are display-only and use existing loaded data.

### What Claude Needs to Know
- This milestone added one schema migration for `label_templates`, as requested
  by the locked Milestone 5D scope.
- No live database migration was applied from Codex.
- No schema/RPC/RLS behavior outside `label_templates` was changed.
- No ledger, balance, checkout/finalization, count correction, bin_item
  retirement, transaction-history, destination semantics, permission model,
  Clerk/Supabase JWT, `can_view_financials`, inventory cost, or reserved feature
  behavior was changed.

### Next Steps (in order)
1. Ryan should apply the `label_templates` migration through the approved
   Supabase deployment path before relying on saved label templates in
   production.
2. Ryan may perform authenticated production smoke verification:
   - Label Designer tab appears for inventory users;
   - Developer/Admin with `can_manage_inventory` can create/update/archive label
     templates after migration application;
   - non-Developer/Admin inventory users can preview/read but cannot manage
     templates;
   - QR preview routes to `/scan/location/<uuid>`;
   - Location Management and scan hierarchy summaries render cleanly.
3. Future label milestones may add print/PDF exact positioning and batch
   selection after the foundation is verified.

### Open Questions / Concerns
- Production save/archive behavior is expected to fail gracefully until the
  `label_templates` migration is applied.
- Browser and authenticated production verification were not available from this
  Codex session.

### Architecture Drift Warnings
- CLOSED for this milestone: Label Template Designer foundation and display-only
  hierarchy summary polish.
- RESERVED: final print/PDF exact positioning, scan-page write/action bindings,
  non-location QR entities, Grand Master UI surface, accounting export, location
  create/rename/archive, Return-to-Inventory, Buyout, Tools locations, vehicle
  bins, van-stock onboarding, Express Checkout, Manager Override,
  reorder/min-max, structured count-type field, catalog creation from count UI,
  ledger changes, balance changes, checkout/finalization changes, count
  correction changes, bin_item retirement semantic changes, transaction-history
  visibility changes, destination semantic changes, and permission model
  changes.

### Routing Verdict
No Claude review needed - Label Template Designer foundation and display-only hierarchy summaries within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 065).

---

## Entry 066 - Milestone 5D.1 Apply and Verify Label Templates Migration

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5D.1 live migration verification
**Session type:** Live Supabase migration apply / verification / documentation

### Context
Ryan requested Milestone 5D.1 to apply and verify only the committed
`label_templates` foundation migration from Milestone 5D. First-action checks
confirmed local `main` was pulled and already up to date; local `HEAD` matched
`origin/main` at `6fb56b1`; `docs/ARCHITECTURE.md` was confirmed as v2.15;
Section 10a and Section 25 remain present; HANDOFF was confirmed gapless through
Entry 065; and no stale coordination docs were used. The target Supabase project
was confirmed as `keogysnoukbendfkfjcn` / `northgate-hq-v2.0`.

### What Was Completed
- Identified the committed but unapplied migration:
  `supabase/migrations/202606230001_label_templates_foundation.sql`.
- Verified the migration matches ARCHITECTURE v2.14/v2.15 Section 25.
- Confirmed the migration creates only `public.label_templates`.
- Confirmed the migration preserves archive-over-delete behavior.
- Confirmed the migration does not create or modify unrelated tables.
- Applied only the `label_templates` foundation migration to live Supabase.
- Confirmed live migration history now includes:
  - version `20260623174852`;
  - name `label_templates_foundation`.

### Table / Column Verification
- Confirmed `public.label_templates` exists.
- Confirmed columns:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`;
  - `name TEXT NOT NULL`;
  - `avery_template TEXT NOT NULL`;
  - `scope_level TEXT`;
  - `include_qr BOOLEAN NOT NULL DEFAULT true`;
  - `layout JSONB NOT NULL`;
  - `created_by TEXT NOT NULL`;
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
  - `archived_at TIMESTAMPTZ`.
- Confirmed `scope_level` is nullable, so `NULL` remains valid for any location
  level.
- Confirmed `label_templates_scope_level_check` allows `unit`, `shelf`, `bay`,
  and `bin`.
- Confirmed `archived_at` exists and is nullable.
- Confirmed the active-template index exists:
  `idx_label_templates_active_scope` on `(scope_level, avery_template, name)`
  where `archived_at IS NULL`.

### RLS / Grants / Archive Verification
- Confirmed RLS is enabled on `public.label_templates`.
- Confirmed policies exist for:
  - inventory template SELECT;
  - Developer/Admin template INSERT;
  - Developer/Admin template UPDATE.
- Confirmed authenticated role grants are limited to `SELECT`, `INSERT`, and
  `UPDATE`.
- Confirmed no authenticated/anon DELETE grant exists.
- Confirmed no DELETE policy exists.
- Supabase changelog review noted the 2026-04-28 breaking change that new tables
  may not be automatically exposed to the Data API; this migration already
  includes explicit authenticated grants with RLS.

### Test Template Verification
- Inserted one safe verification template with `scope_level = NULL`.
- Confirmed the insert accepted `NULL` scope level.
- Archived the verification template by setting `archived_at`.
- Confirmed active verification rows: `0`.
- Confirmed archived verification rows: `1`.
- No hard-delete cleanup was performed.

### App / Static Verification
- `npm.cmd run build` passed.
- Static scan confirmed Label Designer code still references `label_templates`
  through the existing app client path.
- Static scan confirmed QR payload behavior remains `/scan/location/<uuid>`.
- Static scan confirmed human-readable code/path remains display text only.
- Static scan confirmed no scan-page cart/count/transfer/checkout action was
  introduced by this milestone.
- No app code, migration file, schema file, RPC, hook/service, package file, or
  production environment variable was changed in this milestone.

### Browser Verification
- Authenticated browser verification was not performed in this Codex session and
  is not claimed here.
- Because the table now exists live, the prior table-missing condition for saved
  label templates should be resolved; Ryan should still perform production UI
  smoke verification from the `rnsolutions.net` custom domain.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.
- HANDOFF remains gapless through Entry 066.

### What Codex Needs to Know
- `label_templates_foundation` is now applied live in Supabase project
  `keogysnoukbendfkfjcn`.
- The test verification row remains archived, not deleted.
- Saved template operations now have the required live table path.
- Browser verification of the Label Designer UI remains a Ryan/manual follow-up.

### What Claude Needs to Know
- No schema changes beyond the locked `label_templates` migration were applied.
- No ad-hoc database changes outside the committed migration were made, except
  the safe archived verification row.
- No Clerk, Netlify, environment variable, scan behavior, QR identity, ledger,
  balance, checkout, count correction, bin_item retirement, destination
  semantics, `can_view_financials`, inventory cost visibility, transaction
  history, or reserved feature behavior was changed.

### Next Steps (in order)
1. Ryan may smoke test production from the `rnsolutions.net` custom domain:
   - Source shows server;
   - Label Designer loads without table-missing errors;
   - Avery 5164 and 8160 options appear;
   - Developer/Admin with `can_manage_inventory` can save, reload, and archive a
     test template;
   - no Supabase 401/PGRST301 and no Clerk production-domain error.
2. Continue future label work only within Section 25 unless a new architecture
   decision is routed to Claude first.

### Open Questions / Concerns
- Authenticated browser verification was unavailable from this Codex session.

### Architecture Drift Warnings
- CLOSED for this milestone: live application and verification of the locked
  `label_templates` foundation migration.
- RESERVED: final print/PDF exact positioning, scan-page write/action bindings,
  non-location QR entities, Grand Master UI surface, accounting export, location
  create/rename/archive, Return-to-Inventory, Buyout, Tools locations, vehicle
  bins, van-stock onboarding, Express Checkout, Manager Override,
  reorder/min-max, structured count-type field, catalog creation from count UI,
  ledger changes, balance changes, checkout/finalization changes, count
  correction changes, bin_item retirement semantic changes, transaction-history
  visibility changes, destination semantic changes, permission model changes,
  and inventory cost visibility changes.

### Routing Verdict
No Claude review needed - live migration/apply verification only for locked Label Template Designer foundation (ARCHITECTURE v2.15, HANDOFF Entry 065).

---

## Entry 067 - Milestone 5E Label Designer Print/PDF + Template Management Polish

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5E label designer polish
**Session type:** UI implementation / static verification / documentation

### Context
Ryan requested Milestone 5E to make the Label Template Designer more usable for
template management, live preview, and printable output while staying within the
existing `label_templates` schema. First-action checks confirmed local `main`
was pulled and already up to date; local `HEAD` matched `origin/main` at
`d9197d7`; `docs/ARCHITECTURE.md` was confirmed as v2.15; Section 10a and
Section 25 remain present; HANDOFF was confirmed gapless through Entry 066; and
Entry 066 documents the live `label_templates` migration apply. A live Supabase
check confirmed `public.label_templates` exists in project
`keogysnoukbendfkfjcn`.

### What Was Completed
- Improved active template list handling.
- Added a `Show archived` template view/filter.
- Kept archived templates hidden from the active list by default.
- Made archived templates preview-only in the UI.
- Kept archive behavior as `archived_at` update only.
- Improved save/create/update messaging so success messages survive template
  reloads.
- Improved Avery selection behavior:
  - choosing Avery 8160 moves the draft to Bin scope;
  - choosing Avery 5164 clears Bin scope if needed;
  - scope mismatch warnings are displayed instead of silently changing locked
    behavior.
- Added browser print output for:
  - the selected preview label;
  - the current scoped set of locations.
- Browser print output uses the centralized Avery geometry from
  `AVERY_LABEL_TEMPLATES`.
- Live preview continues to reflect field toggles and styling choices.

### Print / PDF Notes
- No new dependency was added.
- Exact `react-pdf` output remains deferred.
- This milestone implemented browser print output with documented limitations.
- Print output uses:
  - `avery_template` for geometry key;
  - `layout.fields` for field include/style/position values;
  - `include_qr` for QR visibility;
  - selected/scoped location records from already loaded hierarchy data.
- Avery 5164 and 8160 geometry remains centralized and data-driven.
- 8160 output uses smaller print font sizes and clipped label cells to fit the
  smaller label stock.

### QR / Identity Behavior
- QR payload remains `/scan/location/<uuid>`.
- Label print output calls the existing QR helper and encodes the location UUID.
- Human-readable location code/path remains printed display text only.
- Human-readable codes were not encoded or treated as permanent QR identity.
- No non-location QR entity behavior was added.

### Permissions / Template Persistence
- Label viewing/printing remains gated by the existing inventory read gate.
- Template create/update/archive controls remain visible only for
  Developer/Admin users with `can_manage_inventory`.
- No new permission flag was added.
- Template persistence still uses the existing `label_templates` columns:
  - `name`;
  - `avery_template`;
  - `scope_level`;
  - `include_qr`;
  - `layout`;
  - `created_by`;
  - `archived_at`.
- No hard-delete UI or code path was added.

### Hierarchy Summaries
- No new hierarchy summary data source was added.
- The existing display-only hierarchy summary helper remains in use for preview
  and print output.
- No schema, migration, RPC, RLS, or new Supabase read behavior was added for
  summaries.

### Code / File Changes
- `src/App.jsx`
  - Added label print document/window helpers.
  - Added shared label value/render helpers.
  - Added active/archived template filter state.
  - Added print-selected and print-scoped label actions.
  - Improved Avery/scope handling and template management messaging.
- `src/styles.css`
  - Added compact status chips and print action styling for the Label Designer.
- No migrations were added.
- No package/dependency files were changed.

### Verification
- `npm.cmd run build` passed.
- `git diff --check` passed.
- Static scan confirmed no migration files were added.
- Static diff scan confirmed no `label_templates` schema changes were made.
- Static diff scan confirmed no direct `inventory_balances` write path was
  introduced.
- Static diff scan confirmed no checkout/finalization functions were changed.
- Static diff scan confirmed no scan-page inventory-changing actions were added.
- Static review confirmed QR payload still uses `/scan/location/<uuid>`.
- Static review confirmed human-readable code/path remains display text only.
- Static review confirmed template archive uses `archived_at` and not hard
  delete.
- Static review confirmed unauthorized users do not receive template management
  controls.
- Static review confirmed 5164 and 8160 use data-driven geometry.
- Static review confirmed browser print output was implemented without adding a
  dependency.

### Browser Verification
- Authenticated browser verification was not performed in this Codex session and
  is not claimed here.
- Production smoke verification remains a Ryan/manual follow-up.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.
- HANDOFF remains gapless through Entry 067.

### What Codex Needs to Know
- Label Designer now has active/archived template filtering, preview-only
  archived templates, and browser print output.
- Exact PDF/react-pdf output is still deferred.
- Label print output depends on browser print settings; use 100% scale for Avery
  stock.
- No package dependency was added.

### What Claude Needs to Know
- No schema change was made.
- No new permission flag was added.
- No scan behavior, QR identity rule, ledger, balance, checkout/finalization,
  count correction, bin_item retirement, destination semantics,
  `can_view_financials`, inventory cost visibility, transaction-history, or
  Financials/job-cost behavior was changed.
- Scan actions, Grand Master UI, accounting export, and non-location QR entities
  remain unbuilt.

### Next Steps (in order)
1. Ryan may smoke test production from the `rnsolutions.net` custom domain:
   - Source shows server;
   - Label Designer loads;
   - Avery 5164 and 8160 can be selected;
   - a template can be saved, loaded, updated, and archived;
   - archived templates disappear from the active list;
   - archived templates appear in the archived view;
   - preview updates when toggles/styling change;
   - QR preview and print output point to `/scan/location/<uuid>`;
   - browser print opens for selected label and scoped sheet;
   - no Supabase 401/PGRST301 and no Clerk production-domain error.
2. Defer exact `react-pdf` sheet positioning until the browser-print workflow is
   verified with real Avery stock.

### Open Questions / Concerns
- Browser print was not visually verified in this Codex session.
- Exact PDF output remains deferred.

### Architecture Drift Warnings
- CLOSED for this milestone: Label Designer template management polish and
  browser print output.
- RESERVED: exact react-pdf output, scan-page write/action bindings,
  non-location QR entities, Grand Master UI surface, accounting export, location
  create/rename/archive, Return-to-Inventory, Buyout, Tools locations, vehicle
  bins, van-stock onboarding, Express Checkout, Manager Override,
  reorder/min-max, structured count-type field, catalog creation from count UI,
  ledger changes, balance changes, checkout/finalization changes, count
  correction changes, bin_item retirement semantic changes, transaction-history
  visibility changes, destination semantic changes, permission model changes,
  and inventory cost visibility changes.

### Routing Verdict
No Claude review needed - Label Designer polish within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 066).

---

## Entry 068 - Milestone 5E.0 Label Designer React Render Hotfix

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5E.0 production render hotfix
**Session type:** Narrow UI bugfix / static verification / documentation

### Context
Ryan reported a production crash after Milestone 5E: React minified error #31,
`object with keys {width, height}`. The report also noted recurring Supabase
GoTrue multiple-client warnings, but those were not assumed to be the immediate
crash. First-action checks confirmed local `main` was pulled and already up to
date; local `HEAD` matched `origin/main` at `1f86b26`; `docs/ARCHITECTURE.md`
was confirmed as v2.15; Section 10a and Section 25 remain present; HANDOFF was
confirmed gapless through Entry 067, which also confirms gaplessness through
Entry 066; and Entries 065/066 document Milestone 5D and 5D.1 completion. No
stale coordination docs were used.

### Root Cause
- Confirmed the React error was caused by raw object rendering in the Label
  Designer Avery template UI.
- `AVERY_LABEL_TEMPLATES` used the property name `label` twice per template:
  - first as the human-readable display name;
  - then as the geometry object `{ width, height }`.
- JavaScript kept the second `label` property, so JSX rendered
  `{template.label}` / `{AVERY_LABEL_TEMPLATES[draft.avery_template]?.label}`
  as the raw geometry object.
- That matches React error #31: object with keys `{width, height}`.

### What Was Completed
- Renamed the human-readable Avery template name to `displayName`.
- Preserved `label` as the geometry object used for label dimensions.
- Added safe formatting helpers for Avery template display text:
  - `formatLabelMeasurement`;
  - `formatLabelSize`;
  - `formatAveryTemplateLabel`.
- Updated the Avery sheet `<select>` to render a formatted string instead of a
  geometry object.
- Updated the Label Designer `Sheet:` fact to render a formatted string instead
  of a geometry object.
- Preserved existing preview, print, save, archive, and template management
  behavior.

### Code / File Changes
- `src/App.jsx`
  - Narrow render hotfix only.
- No `src/styles.css` change.
- No migration, Supabase file, hook/service, package file, or architecture doc
  change.

### Verification
- `npm.cmd run build` passed.
- Static search confirmed no `template.label` JSX render path remains.
- Static search confirmed Avery geometry object usage remains limited to numeric
  sizing/print calculations or formatted text helpers.
- Static review confirmed Avery 5164 and 8160 geometry now displays as readable
  text, for example `Avery 5164 Placard / 4 in x 3.33 in`.
- Static diff scan confirmed no migration files were added.
- Static diff scan confirmed no Supabase/hooks/services/package files changed.
- Static diff scan confirmed no direct `inventory_balances` write path was
  introduced.
- Static diff scan confirmed no checkout/finalization, scan action,
  `physical_count_correction`, bin_item retirement, destination semantics,
  transaction history, `can_view_all_divisions`, `can_view_financials`,
  inventory cost visibility, or inventory-changing behavior was changed.

### Browser Verification
- Local browser verification was blocked by missing local `VITE_SUPABASE_URL`.
- Production browser access reached the `rnsolutions.net` sign-in screen, but
  authenticated Label Designer verification was not available in this Codex
  session.
- Therefore Codex does not claim authenticated browser verification.
- The reported GoTrue warning was not addressed in this hotfix and should remain
  a separate follow-up diagnostic unless Ryan still observes it after this
  render fix deploys.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.
- HANDOFF remains gapless through Entry 068.

### What Codex Needs to Know
- The 5E production crash was a Label Designer render bug, not a schema or
  Supabase migration issue.
- The `label` property in `AVERY_LABEL_TEMPLATES` is now geometry-only.
- The human-readable Avery template name is `displayName`.
- Any future JSX display should use `formatAveryTemplateLabel(...)` or
  `displayName`, not the raw geometry object.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, permission, QR payload, scan destination,
  ledger, balance, checkout/finalization, Count Intake,
  `physical_count_correction`, bin_item retirement, destination semantics,
  transaction-history, `can_view_all_divisions`, `can_view_financials`,
  inventory cost visibility, or reserved feature behavior was changed.
- GoTrue duplicate-client warnings were not investigated or changed in this
  hotfix.

### Next Steps (in order)
1. Ryan may verify production after deploy:
   - open `rnsolutions.net`;
   - Source shows server;
   - open Label Designer;
   - select Avery 5164 and 8160;
   - confirm no React error #31;
   - confirm Avery sizes render as readable text;
   - confirm preview still renders;
   - note whether the GoTrue duplicate-client warning still appears.
2. If the GoTrue warning remains noisy, handle it in a separate diagnostic
   milestone rather than this render hotfix.

### Open Questions / Concerns
- Authenticated production Label Designer verification was unavailable from this
  Codex session.

### Architecture Drift Warnings
- CLOSED for this milestone: narrow Label Designer raw-object render hotfix.
- RESERVED: schema changes, `label_templates` schema changes, Supabase client
  refactors, GoTrue duplicate-client cleanup, QR payload changes, scan action
  changes, ledger changes, balance changes, checkout/finalization changes,
  count correction changes, bin_item retirement semantic changes,
  transaction-history visibility changes, destination semantic changes,
  permission model changes, `can_view_financials` changes, inventory cost
  visibility changes, and all reserved features.

### Routing Verdict
No Claude review needed - narrow React render hotfix within locked Label Designer behavior (ARCHITECTURE v2.15, HANDOFF Entry 066).

---

## Entry 069 - Milestone 5E.1 Label Designer Layout + Contents Summary Polish

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5E.1 label designer polish
**Session type:** UI implementation / static verification / documentation

### Context
Ryan requested Milestone 5E.1 to improve Label Designer contents summaries, QR
layout controls, and print geometry reliability after the 5E.0 render hotfix.
First-action checks confirmed local `main` was pulled and already up to date;
local `HEAD` matched `origin/main` at `25f1281`; `docs/ARCHITECTURE.md` was
confirmed as v2.15; Section 10a and Section 25 remain present; HANDOFF was
confirmed gapless through Entry 068; the 5E.0 render hotfix was committed and
pushed; and live Supabase project `keogysnoukbendfkfjcn` still has
`public.label_templates`. No stale coordination docs were used.

### What Was Completed
- Improved hierarchy and label contents summaries to include material names from
  existing readable inventory rows.
- Added deterministic material-name summary helpers:
  - one bin material shows the actual material name;
  - two or three bin materials are listed cleanly;
  - larger material sets show the first two names plus a `+ N more` count;
  - bay/shelf/unit summaries use the same conservative list-first behavior
    rather than invented category guesses.
- Added QR layout controls for:
  - X position;
  - Y position;
  - width;
  - height.
- QR layout controls update `layout.fields.qr`, preserving the existing
  `label_templates.layout` JSONB shape.
- Existing templates without explicit QR position/size continue to receive safe
  defaults from `DEFAULT_LABEL_FIELDS.qr`.
- Updated print guidance to call out 100% scale, no fit-to-page, and printer
  margin settings.

### Print Geometry Polish
- Audited Avery 5164 and 8160 geometry definitions.
- Kept sheet geometry centralized in `AVERY_LABEL_TEMPLATES`.
- Added explicit `pitch` values to the centralized geometry:
  - Avery 5164: whole sheet, label size, margins, columns, rows, horizontal
    pitch, and vertical pitch are defined centrally.
  - Avery 8160: whole sheet, label size, margins, columns, rows, horizontal
    pitch, and vertical pitch are defined centrally.
- Browser print placement now uses explicit pitch values instead of deriving
  placement from label size plus gutters at the print callsite.
- Exact PDF / `react-pdf` output remains deferred.

### QR / Identity Behavior
- QR payload remains `/scan/location/<uuid>`.
- QR identity remains the stable location UUID.
- Human-readable code/path remains display text only.
- No human-readable code was encoded into QR payloads.
- No non-location QR entity behavior was added.

### Code / File Changes
- `src/App.jsx`
  - Added material-name summary helpers.
  - Added explicit Avery pitch values and geometry detail formatting.
  - Updated print placement to use centralized pitch.
  - Added QR position/size controls that write to `layout.fields.qr`.
- `src/styles.css`
  - Added responsive styling for the QR layout control panel.
- No migrations were added.
- No Supabase files, hooks/services, package files, or architecture docs were
  changed.

### Verification
- `npm.cmd run build` passed.
- `git diff --check` passed.
- Static scan confirmed no migration files were added.
- Static scan confirmed `label_templates` schema was not changed.
- Static scan confirmed no Supabase/hooks/services/package files changed.
- Static diff scan confirmed no direct `inventory_balances` write path was
  introduced.
- Static diff scan confirmed no checkout/finalization functions were changed.
- Static diff scan confirmed no scan-page inventory-changing actions were added.
- Static review confirmed QR payload still uses `/scan/location/<uuid>`.
- Static review confirmed human-readable location code/path remains display text
  only.
- Static review confirmed QR size and position update `layout.fields.qr`.
- Static review confirmed templates missing QR size/position render with safe
  defaults.
- Static review confirmed contents summaries include material names where data
  exists and do not invent category language.
- Static review confirmed Avery 5164 and 8160 geometry definitions include whole
  sheet geometry and explicit pitch values.
- Static review confirmed preview does not render raw geometry objects as React
  children.

### Browser Verification
- Authenticated browser verification was not performed in this Codex session and
  is not claimed here.
- Production smoke verification remains a Ryan/manual follow-up.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.
- HANDOFF remains gapless through Entry 069.

### What Codex Needs to Know
- Label summaries now prefer material names from the already loaded inventory
  rows.
- QR placement/size lives in `layout.fields.qr`, not in a new schema column.
- Avery print placement now uses explicit centralized pitch values.
- Browser print remains the current print path; exact PDF remains deferred.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, permission, QR payload, scan destination,
  ledger, balance, checkout/finalization, Count Intake,
  `physical_count_correction`, bin_item retirement, destination semantics,
  transaction-history, `can_view_all_divisions`, `can_view_financials`,
  inventory cost visibility, or reserved feature behavior was changed.
- No new summary backend, RPC, view, table, or permission flag was added.

### Next Steps (in order)
1. Ryan may verify production after deploy:
   - open `rnsolutions.net`;
   - Source shows server;
   - open Label Designer;
   - select Avery 5164 and 8160;
   - change QR X/Y/width/height;
   - save/load a template and confirm QR layout persists;
   - preview a stocked bin and confirm material names appear in the contents
     summary;
   - test browser print preview for obvious sheet skew;
   - confirm no Supabase 401/PGRST301 and no Clerk production-domain error.
2. Defer exact PDF output until browser print alignment is checked against real
   Avery stock.

### Open Questions / Concerns
- Authenticated production Label Designer verification was unavailable from this
  Codex session.
- Browser print alignment still needs real printer/stock validation.

### Architecture Drift Warnings
- CLOSED for this milestone: Label Designer contents summary, QR layout, and
  print geometry polish.
- RESERVED: schema changes, `label_templates` schema changes, new summary
  backend/RPC/view, new permission flags, QR payload changes, scan action
  changes, ledger changes, balance changes, checkout/finalization changes,
  count correction changes, bin_item retirement semantic changes,
  transaction-history visibility changes, destination semantic changes,
  permission model changes, `can_view_financials` changes, inventory cost
  visibility changes, exact PDF output, and all reserved features.

### Routing Verdict
No Claude review needed - Label Designer layout and summary polish within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 069).

---

## Entry 070 - Milestone 5F Grand Master UI Surface

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5F Grand Master UI surface
**Session type:** UI implementation / static verification / documentation

### Context
Ryan requested Milestone 5F to add a read-only Grand Master / Inventory
Overview surface using existing readable inventory data only. First-action
checks confirmed local `main` was pulled and already up to date; local `HEAD`
matched `origin/main` at `815c51c`; `docs/ARCHITECTURE.md` was confirmed as
v2.15; HANDOFF was confirmed gapless through Entry 069; Milestone 5E.1 was
committed and pushed; and no stale coordination docs were used. Entry 069 also
had the exact current-entry routing-verdict typo Ryan warned about, so Codex
repaired only `HANDOFF Entry 068` to `HANDOFF Entry 069` before appending this
entry.

### What Was Completed
- Added a new `Grand Master` tab as the first Inventory module surface.
- Added a read-only `GrandMasterOverviewPanel` backed by the existing
  `useInventoryCountSheet` read path.
- Displayed consolidated authorized inventory rows with:
  - material name and material code;
  - category;
  - quantity on hand;
  - unit cost and extended value when already present in the authorized read
    row;
  - division from the existing visible row/location data;
  - Unit / Shelf / Bay / Bin path and location labels;
  - stocked vs empty status.
- Added empty-location display rows for bins that have no active bin/material
  rows returned by the existing read path.
- Added summary cards for:
  - stocked locations;
  - empty locations;
  - total stocked rows;
  - total quantity;
  - known stored value;
  - visible rows after filters.
- Added read-only filters/search for:
  - material/code/location text;
  - compact location shortcuts such as `C111`;
  - Unit;
  - Shelf;
  - Bay;
  - Bin;
  - category;
  - visible division;
  - stocked vs empty.
- Added a manual Refresh button that only reloads the existing read hook.

### Sync / Last-Updated Behavior
- Implemented last-updated/client-refresh status using the existing
  `lastLoadedAt` value from `useInventoryCountSheet`.
- Deeper backend sync-health was not invented because no existing backend
  mechanism was available or needed for this milestone.
- The UI states this explicitly as `Sync health: client last-loaded only`.

### Read-Only / Scope Notes
- The Grand Master surface uses existing server-side read rules and the data
  already returned to the signed-in user.
- No client-side-only permission override was added.
- Inventory cost is displayed within the authorized inventory row scope when
  cost data is already returned.
- `can_view_financials` was not used as an inventory-cost gate.
- No write buttons, inventory-changing controls, checkout controls, count
  correction controls, scan actions, retirement controls, or export generation
  were added to the Grand Master surface.

### Code / File Changes
- `src/App.jsx`
  - Added Grand Master row-building/search helpers.
  - Added the `GrandMasterOverviewPanel`.
  - Added the `Grand Master` tab and made it the first Inventory module tab.
- `src/styles.css`
  - Added table/mobile responsive styling for the Grand Master surface.
- `HANDOFF.md`
  - Repaired the Entry 069 routing-verdict typo specifically called out by
    Ryan.
  - Appended this Entry 070.
- No architecture docs, migrations, Supabase files, hooks/services, package
  files, schema, RLS, grants, or RPC definitions were changed.

### Verification
- `npm.cmd run build` passed.
- `git diff --check` passed.
- HANDOFF was rechecked as gapless through Entry 069 before this append.
- Static scan confirmed only `HANDOFF.md`, `src/App.jsx`, and `src/styles.css`
  changed.
- Static diff confirmed no migration files were added.
- Static diff confirmed no schema/Supabase/RLS/grants files were changed.
- Static diff confirmed no new RPC/view was added.
- Static diff confirmed no direct `inventory_balances` write path was
  introduced.
- Static diff confirmed no checkout/finalization functions were changed.
- Static diff confirmed no inventory-changing controls were added.
- Static scan confirmed `can_view_financials` was not added as an
  inventory-cost gate.
- Static review confirmed QR/scan/label behavior was not changed.

### Browser Verification
- Authenticated production browser verification was not performed in this Codex
  session and is not claimed here.
- Ryan/manual production verification remains needed after deploy:
  - open `rnsolutions.net`;
  - Source shows server;
  - open the Grand Master tab;
  - confirm rows load;
  - confirm filters/search work;
  - confirm location paths display;
  - confirm summary cards display;
  - confirm no write controls are present;
  - confirm no Supabase 401/PGRST301;
  - confirm no Clerk production-domain error.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.
- HANDOFF remains append-only aside from the Ryan-specified current-entry typo
  repair in Entry 069.

### What Codex Needs to Know
- Grand Master is a UI-only overview surface.
- It derives its rows from the existing count sheet/read path; there is no new
  backend, RPC, view, table, or permission flag.
- Sync-health is intentionally limited to client last-loaded/refresh state.
- Empty locations are derived from already readable Bin records and returned
  bin/material rows.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, grant, permission, QR payload, scan
  destination, ledger, balance, checkout/finalization, Count Intake,
  `physical_count_correction`, bin_item retirement, destination semantics,
  transaction-history, `can_view_all_divisions`, `can_view_financials`,
  inventory cost visibility, Financials/job-cost, or reserved feature behavior
  was changed.
- No accounting export, scan-page cart staging, scan-page count correction
  action binding, checkout from scan pages, plus/minus scan controls,
  multi-bin batch cart actions, Transfer Location surfacing, non-location QR
  generation, native companion app, location create/rename/archive,
  Return-to-Inventory, Buyout, Tools locations, vehicle bins, van-stock
  onboarding, Express Checkout, Manager Override, reorder/min-max,
  low-stock thresholds, structured count-type fields, or catalog creation from
  count UI was built.

### Next Steps (in order)
1. Ryan may verify the Grand Master tab in production after deploy.
2. If production data reveals missing fields in the existing read path, route
   any new read-only RPC/view/schema request to Claude before implementation.
3. Proceed to accounting export only as a separate milestone.

### Open Questions / Concerns
- Authenticated production verification was unavailable from this Codex session.
- Backend sync-health remains deferred because this milestone did not add a new
  backend mechanism.

### Architecture Drift Warnings
- CLOSED for this milestone: read-only Grand Master UI surface.
- RESERVED: accounting export generation, new read-only RPC/view, schema/RLS/
  permission changes, inventory-changing actions, ledger changes, balance
  changes, checkout/finalization changes, count correction changes, bin_item
  retirement semantic changes, destination semantic changes, transaction-history
  behavior changes, QR payload behavior changes, scan action behavior changes,
  Financials/job-cost behavior, and all reserved features.

### Routing Verdict
No Claude review needed - read-only Grand Master UI surface within locked Inventory module-completion decisions (ARCHITECTURE v2.15, HANDOFF Entry 070).

---

## Entry 071 - Milestone 5G Inventory Search Refinement

**Date:** 2026-06-23
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5G search refinement
**Session type:** implementation

### Context
Ryan requested inventory search refinement so Grand Master / Inventory Overview
search no longer requires exact word order and handles common material-search
format differences such as inch marks, case, spacing, punctuation, and simple
plural/singular variants. Scope was explicitly client-side only if the
authorized inventory data is already loaded, with no schema, migration, RPC,
RLS, backend search index, balance, ledger, checkout, count correction, or
permission changes.

### What Was Completed
- Added deterministic tokenized client-side search helpers in `src/App.jsx`.
- Search now normalizes:
  - case;
  - extra spaces;
  - straight/curly quote and inch marks;
  - common hyphen/dash/underscore separators;
  - practical slash spacing while preserving fraction tokens such as `1/2`.
- Search now expands simple plural/singular tokens such as:
  - `connector` / `connectors`;
  - `coupling` / `couplings`.
- Grand Master search now matches rows when every query token appears somewhere
  in the searchable row text, regardless of word order.
- Compact location code text remains searchable, so combined searches such as
  `C211 connector` can match rows when the compact location and material token
  are both present.
- The shared count-sheet row matcher now uses the same tokenized search model
  for existing authorized inventory rows.
- Searchable row values include already-loaded row fields such as material code,
  material name, category label, category tiers, unit of measure, description,
  manufacturer/vendor part numbers, division, storage path, visible location
  labels/codes, and compact location code.

### Schema Changes
- None.
- No migrations, schema changes, RLS changes, grants, RPCs, backend search
  functions, or database indexes were added.

### Code / File Changes
- `src/App.jsx`
  - Expanded `normalizeSearchText`.
  - Added tokenization, simple singular/plural expansion, searchable token-set,
    and all-token match helpers.
  - Updated Grand Master and shared count-row search to use all-token matching
    while preserving compact-location matching.
- `HANDOFF.md`
  - Appended this Entry 071.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.

### What Codex Needs to Know
- Inventory search remains client-side and filters only rows already returned by
  the existing authorized read path.
- Accounting Export is still not implemented as a separate surface in the
  current app; no export generation was added.
- If Accounting Export later shares this row matcher, it will inherit the
  tokenized search behavior.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, grant, permission, QR payload, scan
  destination, ledger, balance, checkout/finalization, Count Intake write path,
  `physical_count_correction`, bin_item retirement, destination semantics,
  transaction-history, `can_view_all_divisions`, `can_view_financials`,
  inventory cost visibility, Financials/job-cost, or reserved feature behavior
  was changed.
- Search filtering remains a read-only UI refinement over already-authorized
  loaded rows.

### Next Steps (in order)
1. Ryan may verify the Grand Master tab in production after deploy with:
   - `1/2 emt connectors`;
   - `connector emt 1/2`;
   - `emt set screw`;
   - `C211 connector`.
2. When Accounting Export is built as a separate milestone, reuse the same
   search helper if it filters the same authorized inventory row model.

### Open Questions / Concerns
- Authenticated production verification was unavailable from this Codex session.
- Accounting Export is not yet built, so Codex could only confirm that no
  separate Accounting Export filter exists to update in this milestone.

### Architecture Drift Warnings
- CLOSED for this milestone: client-side read-only inventory search refinement.
- RESERVED: accounting export generation, backend search/RPC/view/index work,
  schema/RLS/permission changes, inventory-changing actions, ledger changes,
  balance changes, checkout/finalization changes, count correction changes,
  bin_item retirement semantic changes, destination semantic changes,
  transaction-history behavior changes, QR payload behavior changes, scan action
  behavior changes, Financials/job-cost behavior, and all reserved features.

### Routing Verdict
No Claude review needed - client-side read-only search refinement within locked Inventory module-completion decisions (ARCHITECTURE v2.15, HANDOFF Entry 071).

---

## Entry 072 - Milestone 5G.1 Accounting Export Foundation

**Date:** 2026-06-24
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5G.1 accounting export foundation
**Session type:** implementation

### Context
Ryan requested the first Accounting Export Foundation surface for inventory /
accounting review without changing backend, schema, RLS, permissions, or any
locked inventory invariant. First-action checks were completed: `git pull
origin main` reported already up to date; local `main` and `origin/main`
matched at commit `72736a2d82d5de29e4a5973f3c90a13f7867bcd5`;
`docs/ARCHITECTURE.md` was confirmed as Version 2.15; `HANDOFF.md` was
confirmed gapless through Entry 071; and only the canonical repo
`HANDOFF.md` and `docs/ARCHITECTURE.md` were used for coordination.

Entry 071 state was confirmed before implementation:
- Grand Master UI surface exists.
- Inventory Search Refinement is implemented client-side.
- Accounting Export was not yet implemented as a separate surface.
- Existing search helpers may be reused when filtering the same authorized
  inventory row model.

The working tree already contained the local Entry 071 changes in `src/App.jsx`
and `HANDOFF.md`, so this milestone was built on top of that active local state
without discarding it.

### What Was Completed
- Added a new `Accounting Export` Inventory tab.
- Added a read-only `AccountingExportPreviewPanel`.
- Reused the existing `useInventoryCountSheet` authorized read path.
- Reused `buildGrandMasterRows` so the export preview uses the same loaded row
  model as Grand Master / Inventory Overview.
- Reused the Milestone 5G tokenized `matchesGrandMasterSearch` behavior for
  export-preview search.
- Added export-preview filters for:
  - search;
  - Unit;
  - Shelf;
  - Bay;
  - Bin;
  - category;
  - visible division;
  - stocked vs empty.
- Added export-ready preview columns for:
  - material code;
  - material name;
  - category;
  - quantity on hand;
  - unit cost where already present in authorized rows;
  - extended value where computable from loaded quantity and unit cost;
  - division;
  - Unit / Shelf / Bay / Bin;
  - compact location code and storage path;
  - stocked vs empty status.
- Added summary cards for:
  - visible rows;
  - stocked rows;
  - empty locations;
  - total quantity;
  - known export value.
- Added a clear on-screen note that this is a client-side export preview /
  accounting review foundation, not a finalized accounting integration.
- Added a purely client-side CSV download for the currently visible authorized
  preview rows.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend export jobs, or database indexes
  were added.

### Code / File Changes
- `src/App.jsx`
  - Added client-side CSV formatting/download helpers.
  - Added export-preview column definitions.
  - Added `AccountingExportPreviewPanel`.
  - Added the `Accounting Export` Inventory tab and render branch.
- `src/styles.css`
  - Added scoped Accounting Export preview table/action/mobile styles.
- `HANDOFF.md`
  - Appended this Entry 072.
- No architecture docs, migrations, Supabase files, hooks/services, package
  files, schema, RLS, grants, or RPC definitions were changed.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.

### What Codex Needs to Know
- Accounting Export now has a foundation preview surface inside Inventory.
- It is read-only and client-side over already-authorized loaded rows.
- The CSV button creates a local browser download from the currently visible
  preview rows only; it does not create backend export files or jobs.
- This is not a Financials/job-cost approval workflow and does not change
  accounting semantics.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, grant, permission, QR payload, scan
  destination, ledger, balance, checkout/finalization, Count Intake write path,
  `physical_count_correction`, bin_item retirement, destination semantics,
  transaction-history, `can_view_all_divisions`, `can_view_financials`,
  inventory cost visibility, Financials/job-cost, or reserved feature behavior
  was changed.
- Accounting Export Foundation is a read-only UI preview over already-authorized
  inventory rows, plus an optional client-side CSV download from visible rows.

### Next Steps (in order)
1. Ryan may verify production after deploy:
   - open `rnsolutions.net`;
   - Source shows server;
   - open Inventory -> Accounting Export;
   - confirm preview rows load;
   - confirm filters/search match Grand Master behavior;
   - confirm summary cards update from visible rows;
   - optionally download CSV and confirm it contains only currently visible
     preview rows;
   - confirm no write controls or accounting-approval workflow are present.
2. If future Accounting Export requires backend jobs, scheduled exports,
   storage buckets, new accounting fields, Financials/job-cost approval, or new
   permission gates, route to Claude before implementation.

### Open Questions / Concerns
- Authenticated browser verification was unavailable from this Codex session and
  is not claimed.
- The CSV is intentionally basic and client-side only; finalized accounting
  integration remains future work.

### Architecture Drift Warnings
- CLOSED for this milestone: read-only Accounting Export Foundation preview.
- RESERVED: finalized accounting integration, backend export jobs, storage
  export files, schema/RLS/permission changes, inventory-changing actions,
  ledger changes, balance changes, checkout/finalization changes, count
  correction changes, bin_item retirement semantic changes, destination
  semantic changes, transaction-history behavior changes, QR payload behavior
  changes, scan action behavior changes, Financials/job-cost behavior, and all
  reserved features.

### Routing Verdict
No Claude review needed - within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 072).

---

## Entry 073 - Milestone 5G.1 Follow-Up Accounting Export Visibility + Development Status Card

**Date:** 2026-06-24
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5G.1 follow-up
**Session type:** implementation

### Context
Ryan reported that production still showed only the old Inventory Count &
Correction `Print / Export` button and did not show the new Accounting Export
tab/surface. Codex was instructed not to assume 5G.1 was visually verified and
to add a development-only status card so Ryan can quickly tell whether
production has caught up to the latest milestone.

First-action checks were completed:
- `git pull origin main` reported already up to date.
- Local `main` matched `origin/main` at
  `72736a2d82d5de29e4a5973f3c90a13f7867bcd5`.
- `docs/ARCHITECTURE.md` was confirmed as Version 2.15.
- `HANDOFF.md` was confirmed gapless through Entry 072 before this append.
- Netlify production project `northgate-hq-v2` was queried through the Netlify
  connector.
- Netlify production deploy `6a3bbccbba108e41830bd18b` was ready and serving
  commit `72736a2d82d5de29e4a5973f3c90a13f7867bcd5`.

### What Was Completed
- Diagnosed the production visibility issue:
  - the production commit `72736a2d82d5de29e4a5973f3c90a13f7867bcd5` does not
    contain `Accounting Export`, `AccountingExportPreviewPanel`, or the new
    development status card;
  - that same production commit only contains the older Inventory Count &
    Correction `Print / Export` buttons;
  - therefore Ryan's production observation matches a deploy/commit mismatch,
    not successful visual verification of 5G.1.
- Confirmed the local working tree does include the Accounting Export tab in
  the same Inventory `module-tabs` group Ryan uses.
- Confirmed the local Accounting Export surface is rendered by the
  `activeTab === 'accounting-export'` branch.
- Confirmed the new CSV/download control is inside `AccountingExportPreviewPanel`
  only and is now labeled `Download Preview CSV`.
- Confirmed the old `Print / Export` buttons remain separate Count / Count
  Intake controls and are not the Accounting Export preview.
- Confirmed normal screen/mobile CSS does not hide `.module-tabs`; the only
  `.module-tabs` hide rule is inside `@media print`.
- Renamed the Accounting Export panel heading to `Accounting Export Preview`
  so the surface identifies itself clearly.
- Added a development-only `DevelopmentStatusCard` near the top dashboard card
  group.
- Updated the header build marker to the same current static marker.

### Development Status Card
The development card is hardcoded and UI-only. It displays:
- Most recent change:
  `Milestone 5G.1 follow-up - Accounting Export visibility / Development Status card`
- Related HANDOFF:
  `Entry 073`
- Architecture:
  `v2.15`
- Current step:
  `Accounting Export Foundation verification and UI reachability`
- Build marker:
  `Accounting export visibility build: 2026-06-24.1`
- Deployment note:
  production was checked before this patch and was serving `72736a2`; if the
  card is visible, production has caught the follow-up UI.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend export jobs, or database indexes
  were added.

### Code / File Changes
- `src/App.jsx`
  - Added `DEVELOPMENT_STATUS`.
  - Added `DevelopmentStatusCard`.
  - Updated the app header build note to the current build marker.
  - Updated Accounting Export headings to `Accounting Export Preview`.
  - Renamed the Accounting Export CSV button to `Download Preview CSV`.
- `src/styles.css`
  - Added scoped development status card styles.
  - Adjusted the dashboard grid to fit four top status cards on desktop.
- `HANDOFF.md`
  - Appended this Entry 073.
- No architecture docs, migrations, Supabase files, hooks/services, package
  files, schema, RLS, grants, or RPC definitions were changed.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.

### What Codex Needs to Know
- Production deploy status confirmed the live site was still serving commit
  `72736a2`, which predates the local Accounting Export tab and Entry 073
  development status card.
- The Accounting Export tab is locally reachable in the Inventory tab list
  immediately after Grand Master.
- If Ryan still cannot see Accounting Export after deployment, first check for
  whether the development status card/build marker is visible.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, grant, permission, QR payload, scan
  destination, ledger, balance, checkout/finalization, Count Intake write path,
  `physical_count_correction`, bin_item retirement, destination semantics,
  transaction-history, `can_view_all_divisions`, `can_view_financials`,
  inventory cost visibility, Financials/job-cost, or reserved feature behavior
  was changed.
- This was a UI-only deploy/visibility diagnostic and development status marker
  patch.

### Next Steps (in order)
1. Deploy/push the current local UI changes so production moves beyond commit
   `72736a2`.
2. Ryan may verify production after deploy:
   - confirm the top development status card is visible;
   - confirm the header build note says
     `Accounting export visibility build: 2026-06-24.1`;
   - open Inventory and confirm the `Accounting Export` tab appears immediately
     after `Grand Master`;
   - open the tab and confirm the heading says `Accounting Export Preview`;
   - confirm the button says `Download Preview CSV`;
   - confirm the old Inventory Count & Correction `Print / Export` button
     remains separate.

### Open Questions / Concerns
- Authenticated browser verification was unavailable from this Codex session and
  is not claimed.
- Production will not show Entry 073 until the current local changes are pushed
  and deployed.

### Architecture Drift Warnings
- CLOSED for this milestone: Accounting Export visibility follow-up and
  development status card.
- RESERVED: finalized accounting integration, backend export jobs, storage
  export files, schema/RLS/permission changes, inventory-changing actions,
  ledger changes, balance changes, checkout/finalization changes, count
  correction changes, bin_item retirement semantic changes, destination
  semantic changes, transaction-history behavior changes, QR payload behavior
  changes, scan action behavior changes, Financials/job-cost behavior, and all
  reserved features.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 072).

---

## Entry 074 - Milestone 5G.2 Accounting Export Usability + CSV Verification

**Date:** 2026-06-24
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Milestone 5G.2 accounting export usability
**Session type:** implementation

### Context
Ryan requested Milestone 5G.2 to harden the Accounting Export Preview as a
clearer accounting review/export surface while keeping the work UI/client-side
only. First-action checks were completed: `git pull origin main` reported
already up to date; local `main` matched `origin/main` at
`8aadafa567e48e2842c007e96ede32bbc7d46391`; `docs/ARCHITECTURE.md` was
confirmed as Version 2.15; `HANDOFF.md` was confirmed gapless through Entry
073; the working tree was clean before changes; and code inspection confirmed
the Accounting Export tab plus Development Status card existed from the prior
milestone.

### What Was Completed
- Improved the Accounting Export Preview summary cards:
  - visible rows;
  - stocked rows;
  - empty / zero-quantity rows;
  - total quantity;
  - known inventory value where unit cost is present;
  - rows missing cost.
- Updated the Accounting Export Preview explanatory copy to clearly state:
  `Development preview — generated from currently authorized inventory rows.
  Not a finalized accounting integration.`
- Added the 5G.2 build marker to the export preview facts:
  `Accounting export usability build: 2026-06-24.2`.
- Added a visible `Print export: deferred` fact so the old Count print button is
  not confused with Accounting Export.
- Improved table structure by splitting location into separate accounting review
  columns:
  - Unit;
  - Shelf;
  - Bay;
  - Bin;
  - Storage Path / Compact Location.
- Added safe display fallback handling for missing export table values.
- Preserved existing tokenized search/filter behavior over authorized loaded
  rows.
- Updated the client-side CSV export filename to:
  `northgate-inventory-accounting-export-preview-YYYY-MM-DD.csv`.
- Kept CSV export client-side only and scoped to currently visible/filtered
  authorized preview rows.
- Updated the Development Status card to:
  - Most recent change: `Milestone 5G.2 - Accounting Export usability / CSV
    verification`;
  - Related HANDOFF: `Entry 074`;
  - Architecture: `v2.15`;
  - Current step: `Accounting Export preview hardening`;
  - Build marker: `Accounting export usability build: 2026-06-24.2`.

### Print Behavior
- No Accounting Export print button was added in this pass.
- Clean print styling was intentionally deferred because the current print CSS
  is count-sheet oriented, and CSV remains the safe export mechanism for this
  milestone.
- The old Inventory Count / Count Intake `Print / Export` controls remain
  separate and were not reused for Accounting Export.

### CSV Behavior
- CSV export remains generated entirely in the browser.
- CSV includes headers.
- CSV exports only the currently visible/filtered Accounting Export Preview
  rows that were already returned through the authorized inventory read path.
- Currency and numeric columns export as plain numeric cell values where data is
  available; missing cost/value fields export blank.
- No hidden unauthorized data is exported.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend export jobs, or database indexes
  were added.

### Code / File Changes
- `src/App.jsx`
  - Updated `DEVELOPMENT_STATUS` to Entry 074 / Milestone 5G.2.
  - Added export display helpers for missing values and quantity formatting.
  - Updated Accounting Export summary metrics.
  - Updated Accounting Export preview copy, facts, table columns, and CSV
    filename.
- `src/styles.css`
  - Adjusted Accounting Export table width for the expanded review columns.
- `HANDOFF.md`
  - Appended this Entry 074.
- No architecture docs, migrations, Supabase files, hooks/services, package
  files, schema, RLS, grants, or RPC definitions were changed.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.

### What Codex Needs to Know
- Accounting Export Preview remains UI/client-side only.
- CSV is the only Accounting Export output mechanism in 5G.2.
- Accounting Export print remains intentionally deferred until a clean,
  scoped print layout is worth adding.
- Development Status now points to Entry 074 and the 5G.2 build marker.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, grant, permission, QR payload, scan
  destination, ledger, balance, checkout/finalization, Count Intake write path,
  `physical_count_correction`, bin_item retirement, destination semantics,
  transaction-history permissions, `can_view_all_divisions`,
  `can_view_financials`, inventory cost visibility, Financials/job-cost, or
  reserved feature behavior was changed.
- This was a UI-only accounting export usability and CSV verification pass over
  already-authorized inventory rows.

### Next Steps (in order)
1. Ryan may verify production after deploy:
   - confirm the Development Status card shows Entry 074 and
     `Accounting export usability build: 2026-06-24.2`;
   - open Inventory -> Accounting Export;
   - confirm the heading says `Accounting Export Preview`;
   - confirm the note says the preview is generated from currently authorized
     inventory rows and is not a finalized accounting integration;
   - confirm summary cards include rows missing cost;
   - filter/search visible rows and download CSV;
   - confirm the CSV filename includes
     `northgate-inventory-accounting-export-preview`;
   - confirm the old Count print/export button remains separate.
2. Add a scoped Accounting Export print layout only in a future milestone if
   Ryan wants a print-ready accounting review page.

### Open Questions / Concerns
- Authenticated browser verification was unavailable from this Codex session and
  is not claimed.
- Print export remains deferred by design for this pass.

### Architecture Drift Warnings
- CLOSED for this milestone: Accounting Export usability and CSV verification.
- RESERVED: finalized accounting integration, backend export jobs, storage
  export files, schema/RLS/permission changes, inventory-changing actions,
  ledger changes, balance changes, checkout/finalization changes, count
  correction changes, bin_item retirement semantic changes, destination
  semantic changes, transaction-history behavior changes, QR payload behavior
  changes, scan action behavior changes, Financials/job-cost behavior, and all
  reserved features.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 073).

---

## Entry 075 - Inventory Count Print Sheet Patch

**Date:** 2026-06-24
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Inventory Count print patch
**Session type:** implementation

### Context
Ryan reported that the Inventory Count & Correction `Print / Export` button was
printing the whole app/webpage layout instead of a useful count sheet. The goal
was to replace the webpage-style print behavior with a basic formatted count
table, staying UI/client-side only.

First-action checks were completed:
- `git pull origin main` reported already up to date.
- Local `main` matched `origin/main` at
  `43f7112f42520708e98a8e2a3154689c523ea144`.
- `docs/ARCHITECTURE.md` was confirmed as Version 2.15.
- `HANDOFF.md` was confirmed gapless through Entry 074.
- The working tree was clean before changes.
- The current count print buttons and print CSS were inspected.

### What Was Completed
- Added a dedicated print-only `CountPrintSheet` component.
- Replaced the old count-button label `Print / Export` with `Print Count Sheet`
  on both existing count surfaces:
  - Inventory Count & Correction;
  - Inventory Count Intake.
- The print-only count sheet uses the existing filtered/visible authorized rows
  and existing local counted-quantity draft state.
- Printed output now includes:
  - `Northgate HQ - Inventory Count Sheet`;
  - print timestamp;
  - row count;
  - selected client-side filter/search summary where available;
  - Unit;
  - Shelf;
  - Bay;
  - Bin;
  - Material Code;
  - Material Name / Description;
  - System Qty;
  - Counted Qty;
  - Variance;
  - Notes / Initials.
- Added print-specific CSS that hides app chrome, tabs, filters, buttons,
  cards, side panels, and the interactive count table during print.
- Added compact, black/white, landscape-friendly print table styling with
  repeating table headers.

### Print Behavior
- The old whole-webpage print behavior was replaced/scoped for count printing.
- Clicking `Print Count Sheet` still uses browser print, but the print stylesheet
  now displays the dedicated formatted count table instead of the app screen.
- Authenticated browser print-preview verification was unavailable from this
  Codex session and is not claimed.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend print/export services, or database
  indexes were added.

### Code / File Changes
- `src/App.jsx`
  - Added `CountPrintSheet`.
  - Added count print filter summaries for the existing count screens.
  - Updated count print button labels to `Print Count Sheet`.
- `src/styles.css`
  - Added hidden-on-screen count print sheet styles.
  - Added print CSS for the dedicated count sheet table.
- `HANDOFF.md`
  - Appended this Entry 075.
- No architecture docs, migrations, Supabase files, hooks/services, package
  files, schema, RLS, grants, or RPC definitions were changed.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.

### What Codex Needs to Know
- Inventory Count printing is now handled by a dedicated print-only table, not
  the interactive app/webpage layout.
- The count print table is read-only/client-side and reflects currently visible
  filtered rows plus local counted quantity draft values.
- No count recording, count correction, retirement, balance, ledger, checkout,
  transaction history, scan, Accounting Export, or Financials behavior changed.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, grant, permission, QR payload, scan
  destination, ledger, balance, checkout/finalization, Count Intake write path,
  `physical_count_correction`, bin_item retirement, destination semantics,
  transaction-history permissions, `can_view_all_divisions`,
  `can_view_financials`, inventory cost visibility, Accounting Export,
  Financials/job-cost, or reserved feature behavior was changed.
- This was a UI-only print formatting patch for Inventory Count.

### Next Steps (in order)
1. Ryan may verify production after deploy:
   - open Inventory -> Inventory Count & Correction;
   - set any desired filters/search;
   - enter sample counted quantities if desired;
   - click `Print Count Sheet`;
   - confirm print preview shows only the formatted count table, not the full
     webpage/dashboard.
2. If further polish is needed, tune only print CSS/table columns in a follow-up
   UI-only patch.

### Open Questions / Concerns
- Authenticated browser print-preview verification was unavailable from this
  Codex session and is not claimed.

### Architecture Drift Warnings
- CLOSED for this milestone: Inventory Count print sheet patch.
- RESERVED: backend export/print services, schema/RLS/permission changes,
  inventory-changing actions, ledger changes, balance changes,
  checkout/finalization changes, count correction changes, bin_item retirement
  semantic changes, destination semantic changes, transaction-history behavior
  changes, QR payload behavior changes, scan action behavior changes,
  Accounting Export behavior, Financials/job-cost behavior, and all reserved
  features.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 074).

---

## Entry 076 - 2026-06-24 - Milestone 5G.3 Accounting Export Grouping, Totals, and Print/Export Polish

**Phase:** Inventory (Stage 1) - Accounting Export Foundation polish
**Session type:** implementation

### Context
Ryan requested Milestone 5G.3 polish for the Accounting Export Preview surface:
grouped review modes, grouped totals, current-view CSV behavior, scoped print
polish, removal of the large dark print/export filler area, and a refreshed
development status marker.

First-action checks were completed:
- `git pull origin main` reported already up to date.
- Local `main` matched `origin/main` at
  `029e39515bea0aba4d6c8b3130a8b5e92a396eec`.
- `docs/ARCHITECTURE.md` was confirmed as Version 2.15.
- `HANDOFF.md` was confirmed gapless through Entry 075.
- The working tree was clean before changes.

### What Was Completed
- Added Accounting Export review modes:
  - Detail rows;
  - By category;
  - By location;
  - By stocked status;
  - By division.
- Added grouped summary rows calculated client-side from the currently filtered,
  already-authorized Accounting Export preview rows.
- Grouped summary rows include:
  - group label;
  - row count;
  - stocked row count;
  - empty / zero row count;
  - total quantity;
  - known inventory value where cost exists;
  - rows missing cost.
- Updated CSV download behavior so it exports the current Accounting Export
  view:
  - detail mode downloads detail rows;
  - grouped modes download grouped summary rows;
  - filenames include the view token and date, such as
    `northgate-inventory-accounting-detail-YYYY-MM-DD.csv` and
    `northgate-inventory-accounting-by-category-YYYY-MM-DD.csv`.
- Added scoped Accounting Export print support:
  - `Print Export Preview` prints a dedicated Accounting Export preview sheet;
  - print output includes `Northgate HQ - Accounting Export Preview`;
  - print output includes printed date/time, current view, and row/group count;
  - print output uses the active detail or grouped view;
  - app chrome, buttons, tabs, development status card, backgrounds, and the
    large dark filler/footer area are hidden for Accounting Export print output.
- Kept the development-preview warning:
  - `Development preview - generated from currently authorized inventory rows. Not a finalized accounting integration.`
- Added the grouping explanation:
  - `Grouping and totals are calculated client-side from the currently authorized inventory rows.`
- Updated the Development Status card to:
  - Most recent change:
    `Milestone 5G.3 - Accounting Export grouping / totals / print polish`;
  - Related HANDOFF: `Entry 076`;
  - Architecture: `v2.15`;
  - Current step: `Accounting Export review modes`;
  - Build marker: `Accounting export grouping build: 2026-06-24.3`.

### Verification
- `npm run build` passed.
- Static implementation review confirmed the change uses the existing
  client-side Accounting Export / Grand Master inventory row model and
  reuses the already-authorized rows returned to the signed-in user.
- Authenticated browser and print-preview verification were unavailable from
  this Codex session and are not claimed.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend export jobs, backend print
  services, or database indexes were added.

### Code / File Changes
- `src/App.jsx`
  - Added Accounting Export review-mode options and grouped summary helpers.
  - Added current-view CSV export behavior.
  - Added `AccountingExportPrintSheet`.
  - Updated Accounting Export visible facts and development status marker.
- `src/styles.css`
  - Added grouped Accounting Export table styling.
  - Added scoped Accounting Export print styles.
  - Hid nonessential chrome/dev/status/background UI for Accounting Export
    print output.
- `HANDOFF.md`
  - Appended this Entry 076.
- No architecture docs, migrations, Supabase files, hooks/services, package
  files, schema, RLS, grants, or RPC definitions were changed.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.

### What Codex Needs to Know
- Accounting Export Preview now has detail and grouped review modes.
- Grouping, totals, CSV generation, and print output are all client-side and
  operate only on currently authorized preview rows.
- Accounting Export CSV and print behavior are scoped to the active Accounting
  Export view and remain separate from the Inventory Count print sheet.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, grant, permission, backend export job,
  backend print service, storage, QR payload, scan destination, ledger, balance,
  checkout/finalization, Count Intake write path, `physical_count_correction`,
  bin_item retirement, destination semantics, transaction-history permissions,
  `can_view_all_divisions`, `can_view_financials`, inventory cost visibility,
  Financials/job-cost, or reserved feature behavior was changed.
- This was a UI/client-side Accounting Export polish milestone.

### Next Steps (in order)
1. Ryan may verify production after push/deploy:
   - open Inventory -> Accounting Export;
   - switch between Detail rows, By category, By location, By stocked status,
     and By division;
   - confirm grouped totals reflect the visible filtered rows;
   - download CSV from detail and grouped views and confirm filenames/content;
   - use `Print Export Preview` and confirm only the Accounting Export preview
     sheet prints.
2. If print layout needs additional column tuning, keep follow-up changes
   UI/client-side only.

### Open Questions / Concerns
- Authenticated browser and print-preview verification were unavailable from
  this Codex session and are not claimed.

### Architecture Drift Warnings
- CLOSED for this milestone: Accounting Export grouped review modes, totals,
  current-view CSV behavior, and scoped print polish.
- RESERVED: backend export jobs, backend print services, schema/RLS/permission
  changes, inventory-changing actions, ledger changes, balance changes,
  checkout/finalization changes, count correction changes, bin_item retirement
  semantic changes, destination semantic changes, transaction-history behavior
  changes, QR payload behavior changes, scan action behavior changes,
  Financials/job-cost behavior, and all reserved features.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 075).

---

## Entry 077 - 2026-06-24 - Targeted Accounting Export Print Parent Card CSS Fix

**Phase:** Inventory (Stage 1) - Accounting Export print polish
**Session type:** implementation

### Context
Ryan reported that Accounting Export print/export output still showed a large
dark blue box after the printable table/content. The inspect-only finding
identified the likely source as the Inventory parent wrapper:
`<article className="card card--wide">` in `InventoryReadOnlyPanel`.

First-action checks were completed:
- `git pull origin main` reported already up to date.
- Local `main` matched `origin/main` at
  `80731162dfab9dc3023ccea43e8e4639b9fb403b`.
- `docs/ARCHITECTURE.md` was confirmed as Version 2.15.
- `HANDOFF.md` was confirmed gapless through Entry 076.
- The working tree was clean before changes.
- The relevant Accounting Export print CSS and Inventory wrapper path were
  inspected before editing.

### What Was Completed
- Added a targeted `@media print` CSS fix scoped to Accounting Export print
  output.
- The fix uses the mounted Accounting Export panel as the selector hook:
  - `.dashboard-grid:has(.accounting-export-panel)`;
  - `.card.card--wide:has(.accounting-export-panel)`;
  - `.card.card--wide:has(.accounting-export-panel) > :not(.accounting-export-panel)`.
- The parent `.card.card--wide` / Inventory wrapper chrome is neutralized for
  Accounting Export print output only.
- Non-print siblings inside the Inventory parent card are hidden for Accounting
  Export print output, while `.accounting-export-print-sheet` remains visible.
- The Accounting Export print panel/sheet are forced to white background,
  no border, no shadow, no filler min-height, and zero print padding.
- Blank page space after printable content is intentional.

### Verification
- `npm run build` passed.
- `git diff --check` passed.
- Changed files were limited to `src/styles.css` before this HANDOFF append.
- Static scan confirmed no migration files were added.
- Static scan confirmed no Supabase/RLS/grant/permission/backend behavior
  changed.
- Static scan confirmed no inventory balance, ledger, checkout/finalization,
  Count Intake write path, count correction, bin_item retirement, QR/scan,
  transaction history permission, destination semantic, Accounting Export
  authorization, or Financials/job-cost behavior changed.
- Authenticated print-preview verification was unavailable from this Codex
  session and is not claimed.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend export jobs, backend print
  services, or database indexes were added.

### Code / File Changes
- `src/styles.css`
  - Added targeted Accounting Export print CSS to hide/neutralize the wide
    Inventory parent card chrome and non-print children.
- `HANDOFF.md`
  - Appended this Entry 077.
- No app data logic, CSV logic, grouping logic, filters, row calculations,
  authorization, backend files, hooks/services, package files, schema, RLS,
  grants, or RPC definitions were changed.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.

### What Codex Needs to Know
- The dark-blue Accounting Export print box was a print-layout artifact from
  the parent `.card.card--wide` Inventory wrapper remaining visible around the
  Accounting Export print sheet.
- The fix is CSS-only and print-scoped to the Accounting Export mounted panel.
- Inventory Count print behavior was not intentionally changed.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, grant, permission, backend export job,
  backend print service, storage, QR payload, scan destination, ledger, balance,
  checkout/finalization, Count Intake write path, `physical_count_correction`,
  bin_item retirement, destination semantics, transaction-history permissions,
  `can_view_all_divisions`, `can_view_financials`, inventory cost visibility,
  Accounting Export authorization, Financials/job-cost, or reserved feature
  behavior was changed.
- This was a targeted UI/CSS print fix.

### Next Steps (in order)
1. Ryan may verify production after push/deploy:
   - open Inventory -> Accounting Export;
   - click `Print Export Preview`;
   - confirm print output shows only the Accounting Export printable sheet/table;
   - confirm the large dark-blue parent card/filler box is gone;
   - confirm blank page space after content is white/empty.
2. If further print polish is needed, keep follow-up changes UI/CSS-only.

### Open Questions / Concerns
- Authenticated print-preview verification was unavailable from this Codex
  session and is not claimed.

### Architecture Drift Warnings
- CLOSED for this milestone: targeted Accounting Export print parent-card CSS
  bugfix.
- RESERVED: backend export jobs, backend print services, schema/RLS/permission
  changes, inventory-changing actions, ledger changes, balance changes,
  checkout/finalization changes, count correction changes, bin_item retirement
  semantic changes, destination semantic changes, transaction-history behavior
  changes, QR payload behavior changes, scan action behavior changes,
  Accounting Export authorization changes, Financials/job-cost behavior, and
  all reserved features.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 076).

---

## Entry 078 - Targeted Inventory Count Print Parent Card CSS Fix

**Date:** 2026-06-25
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Inventory Count print polish
**Session type:** implementation

### Context
Ryan reported that Inventory Count & Correction print/export output still
showed the same large dark-blue parent-card/filler box after the count
sheet/table content. Accounting Export print had already been fixed with a
targeted parent-card print CSS selector, and the request was to apply the same
principle to Inventory Count while preserving normal screen layout.

First-action checks were completed:
- `git pull origin main` reported already up to date.
- Local `main` matched `origin/main` at
  `d45d5310dfa6d0c2fbe44d968b2aeb4865fb8f8a`.
- `docs/ARCHITECTURE.md` was confirmed as Version 2.15.
- `HANDOFF.md` was confirmed gapless through Entry 077.
- The working tree was clean before changes, aside from a local git-ignore
  permission warning from `C:\Users\Ryan/.config/git/ignore`.
- The recent Accounting Export print CSS fix was inspected before editing.
- The Inventory Count print button, `.count-print-sheet`, `.count-workspace`,
  and parent Inventory wrapper path were inspected before editing.

### What Was Completed
- Identified the actual Inventory Count print parent/wrapper source as
  `InventoryReadOnlyPanel`'s `<article className="card card--wide">`, with the
  active count tab mounting `.count-workspace` and `.count-print-sheet` inside
  that parent card.
- Added a targeted `@media print` CSS fix scoped to Inventory Count print
  output using the mounted count print sheet as the selector hook:
  - `.dashboard-grid:has(.count-print-sheet)`;
  - `.dashboard-grid:has(.count-print-sheet) > .card:not(:has(.count-print-sheet))`;
  - `.card.card--wide:has(.count-print-sheet)`;
  - `.card.card--wide:has(.count-print-sheet) > :not(.count-workspace)`;
  - `.count-workspace > :not(.count-print-sheet)`.
- The Inventory parent `.card.card--wide` chrome/background is now neutralized
  for Inventory Count print output only.
- Non-print dashboard cards, parent-card children, controls, history panel,
  app chrome, card backgrounds, shadows, filler spacing, and count workspace
  siblings are hidden/neutralized for Inventory Count print output.
- The dedicated Inventory Count printable sheet remains visible with white
  background, no border, no shadow, zero print padding, and no filler
  min-height.
- The existing Accounting Export print fix was preserved and not changed.
- Blank page space after printable content remains intentional.

### Verification
- `npm.cmd run build` passed. A direct `npm run build` invocation was blocked
  by local PowerShell script execution policy before the build started, so the
  Windows npm command shim was used.
- `git diff --check` passed.
- Changed source files were limited to `src/styles.css` before this HANDOFF
  append.
- Static scan confirmed no migration files were added.
- Static scan confirmed no Supabase/RLS/grant/permission/backend behavior
  changed.
- Static scan confirmed no inventory balance, ledger, checkout/finalization,
  Count Intake write path, count correction, bin_item retirement, QR/scan,
  transaction-history permission, destination semantic, Accounting Export
  authorization, or Financials/job-cost behavior changed.
- Authenticated print-preview verification was unavailable from this Codex
  session and is not claimed.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend export jobs, backend print
  services, or database indexes were added.

### Code / File Changes
- `src/styles.css`
  - Added targeted Inventory Count print CSS to hide/neutralize the wide
    Inventory parent card chrome, sibling dashboard cards, and non-print count
    workspace children.
- `HANDOFF.md`
  - Appended this Entry 078.
- No app data logic, count write logic, Accounting Export behavior, backend
  files, hooks/services, package files, schema, RLS, grants, or RPC definitions
  were changed.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.

### What Codex Needs to Know
- The dark-blue Inventory Count print box was a print-layout artifact from the
  parent `.card.card--wide` Inventory wrapper and surrounding dashboard/card
  chrome remaining in the print layout around `.count-print-sheet`.
- The fix is CSS-only and print-scoped to the mounted Inventory Count print
  sheet.
- Accounting Export print behavior was preserved.

### What Claude Needs to Know
- No schema, migration, Supabase, RLS, grant, permission, backend export job,
  backend print service, storage, QR payload, scan destination, ledger, balance,
  checkout/finalization, Count Intake write path,
  `physical_count_correction`, bin_item retirement, destination semantics,
  transaction-history permissions, `can_view_all_divisions`,
  `can_view_financials`, inventory cost visibility, Accounting Export
  authorization, Financials/job-cost, or reserved feature behavior was changed.
- This was a targeted UI/CSS print fix for Inventory Count.

### Next Steps (in order)
1. Ryan may verify production after push/deploy:
   - open Inventory -> Inventory Count & Correction;
   - click `Print Count Sheet`;
   - confirm print output shows only the Inventory Count printable sheet/table;
   - confirm the large dark-blue parent card/filler box is gone;
   - confirm blank page space after content is white/empty.
2. If further print polish is needed, keep follow-up changes UI/CSS-only.

### Open Questions / Concerns
- Authenticated print-preview verification was unavailable from this Codex
  session and is not claimed.

### Architecture Drift Warnings
- CLOSED for this milestone: targeted Inventory Count print parent-card CSS
  bugfix.
- RESERVED: backend export jobs, backend print services, schema/RLS/permission
  changes, inventory-changing actions, ledger changes, balance changes,
  checkout/finalization changes, Count Intake write path changes, count
  correction changes, bin_item retirement semantic changes, destination
  semantic changes, transaction-history behavior changes, QR payload behavior
  changes, scan action behavior changes, Accounting Export authorization
  changes, Financials/job-cost behavior, and all reserved features.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 077).

---

## Entry 079 - Milestone 5H.1 Bin Scan Add-to-Cart Entry Point

**Date:** 2026-06-25
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Scan destination action bindings
**Session type:** implementation

### Context
Ryan requested Milestone 5H.1: add a safe Add-to-Cart entry point on
bin-level scan destination pages so a field user who scans a bin can begin
adding material from that scanned bin through the existing cart/checkout flow.
The milestone was explicitly UI/client-side binding only and prohibited new
schema, RPC, permission, transaction, checkout, balance, QR payload, route
structure, transfer, return, buyout, Express Checkout, or Manager Override
behavior.

First-action checks were completed:
- `git pull origin main` reported already up to date.
- Local `main` matched `origin/main` at
  `2491ff28841e856072f4050c0616287a57303641`.
- `docs/ARCHITECTURE.md` was confirmed as Version 2.15.
- `HANDOFF.md` was confirmed gapless through Entry 078.
- The working tree was clean before changes, aside from the existing local
  git-ignore permission warning from `C:\Users\Ryan/.config/git/ignore`.
- Architecture Sections 10, 10a, 11, 17a, 23, 24, and 30 were checked for QR,
  scan destination behavior, cart/checkout, transaction/balance, permission,
  count-correction, and routing constraints.
- The scan destination page, scan route parser, existing cart candidate picker,
  `useInventoryCart`, and the approved cart RPC path were inspected before
  coding.

### What Was Completed
- Added a bin-level scan page action card that appears only when the resolved
  scan destination is a bin.
- The action button text is:
  `Add material from this bin to cart`.
- The helper text states:
  `Uses the existing cart checkout flow. Inventory is not changed until checkout is completed.`
- The scan page action does not call any Supabase write RPC directly. It routes
  to the existing dashboard Inventory Cart tab with scanned-bin context in the
  dashboard query string:
  `/?inventoryTab=cart&scanBinId=<bin_uuid>&scanBinCode=<display_code>`.
- Added dashboard query parsing so `inventoryTab=cart` opens the existing Cart
  Checkout tab and passes scanned-bin context into the already-built
  `CartScaffold`.
- Updated `CartScaffold` to use scanned-bin context as a client-side candidate
  filter by existing `bin_id`.
- The existing cart/add-to-cart flow is reused unchanged:
  - users still open a cart through the existing `open_inventory_cart` RPC;
  - users still enter quantities in the existing stocked-bin candidate picker;
  - adding still calls `useInventoryCart().addItem()`;
  - `useInventoryCart().addItem()` still calls the existing
    `add_inventory_cart_item` RPC;
  - checkout/finalization remains in the existing Cart Destinations area and
    existing `finalize_inventory_cart` path.
- Added a scanned-bin context panel inside the Cart tab so the user can see the
  scanned bin, understand that checkout is unchanged, and clear the scanned-bin
  filter to show all stocked candidates.
- Added the required empty state for scanned bins with no authorized stocked
  rows:
  `No authorized stocked material was found for this scanned bin.`
- Non-bin scan destinations do not show the bin-specific Add-to-Cart action.
- Updated the scan page note to state that scan pages dispatch into existing
  inventory workflows and that bin cart staging does not change inventory until
  checkout.
- Increased the existing authorized cart candidate read window in the frontend
  read hook from 50 to 1000 rows so a scanned-bin filter is not accidentally
  starved by the prior preview limit. This still reads from the existing
  `inventory_cart_candidates_view` and does not change authorization.
- Updated the Development Status card:
  - Most recent change:
    `Milestone 5H.1 — Bin scan Add-to-Cart entry point`;
  - Related HANDOFF: `Entry 079`;
  - Architecture: `v2.15`;
  - Current step: `Scan destination action bindings`;
  - Build marker: `Scan Add-to-Cart build: 2491ff28`.

### Verification
- `cmd /c npm run build` passed. Vite reported only the existing chunk-size
  warning.
- `git diff --check` passed. Git emitted a line-ending normalization warning
  for `src/hooks/useInventoryReadModel.js`; the actual diff in that file is one
  query-limit line.
- Changed source files before this HANDOFF append were limited to:
  - `src/App.jsx`;
  - `src/hooks/useInventoryReadModel.js`;
  - `src/styles.css`.
- Static scan confirmed no migration files were added.
- Static scan confirmed no Supabase/RLS/grant/permission/backend behavior
  changed.
- Static scan confirmed no cart engine, transaction engine, balance mutation,
  checkout/finalization, Count Intake write path, physical count correction,
  bin_item retirement, QR payload, scan route structure, transaction-history
  permission, destination semantic, Accounting Export authorization, or
  Financials/job-cost behavior changed.
- Authenticated browser verification was unavailable from this Codex session
  and is not claimed.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend handlers, database indexes, or
  backend action services were added.

### Code / File Changes
- `src/App.jsx`
  - Added dashboard inventory query parsing for cart tab/scanned-bin context.
  - Added `buildScanCartPath()`.
  - Added `ScanBinCartEntry`.
  - Added bin-only scan action rendering.
  - Passed scanned-bin context into `InventoryReadOnlyPanel` and `CartScaffold`.
  - Added scanned-bin filtering and clear-filter behavior inside the existing
    cart candidate picker.
  - Updated Development Status card values for Milestone 5H.1.
- `src/hooks/useInventoryReadModel.js`
  - Increased the existing authorized cart candidate read limit from 50 to
    1000 rows.
- `src/styles.css`
  - Added responsive styling for the scan Add-to-Cart entry panel and scanned
    cart context panel.
- `HANDOFF.md`
  - Appended this Entry 079.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.

### What Codex Needs to Know
- Bin-level scan pages now provide a UI entry point into the existing cart flow.
- The scan page itself does not stage a cart line, create a transaction, mutate
  inventory balances, or finalize checkout.
- The handoff from scan page to cart is client-side navigation to the dashboard
  cart tab with scanned-bin context. The Cart tab then filters the existing
  authorized cart candidate list by `bin_id`.
- All cart writes remain through the pre-existing `useInventoryCart` hook and
  existing cart RPCs.

### What Claude Needs to Know
- No schema, migration, Supabase table, new RPC, RLS, grant, permission flag,
  backend handler, backend action service, Clerk/auth, QR payload, scan route
  structure, ledger, balance, checkout/finalization, Count Intake write path,
  `physical_count_correction`, bin_item retirement, destination semantic,
  transaction-history permission, Accounting Export authorization,
  Financials/job-cost, Express Checkout, Manager Override, transfer,
  Return-to-Inventory, buyout, or reserved feature behavior was changed.
- This was a UI/client-side binding from the bin scan page into the already
  approved cart/add-to-cart workflow.

### Next Steps (in order)
1. Ryan may verify production after push/deploy:
   - scan or manually open a bin QR route;
   - confirm only bin-level scan pages show
     `Add material from this bin to cart`;
   - click the action and confirm the dashboard opens Inventory -> Cart
     Checkout with the scanned bin context panel visible;
   - open a cart through the existing cart button;
   - enter quantity on an authorized stocked material from that bin;
   - confirm Add uses the existing cart line workflow and inventory is not
     changed until checkout;
   - confirm non-bin scan pages do not show the bin-specific action.
2. Keep any follow-up scan action work within the existing cart/checkout or
   count-correction engines unless Claude review is triggered.

### Open Questions / Concerns
- Authenticated browser verification was unavailable from this Codex session
  and is not claimed.
- The Cart tab still depends on the existing authorized
  `inventory_cart_candidates_view`; if a scanned bin has no authorized stocked
  row in that view, the empty state is shown and no workaround is attempted.

### Architecture Drift Warnings
- CLOSED for this milestone: bin-level scan Add-to-Cart entry point.
- RESERVED: schema/RLS/permission changes, new cart engines, new transaction
  engines, direct balance writes, checkout/finalization changes, Count Intake
  write path changes, physical count correction changes, bin_item retirement
  semantic changes, QR payload changes, scan route structure changes,
  transaction-history permission changes, destination semantic changes,
  Accounting Export authorization changes, Financials/job-cost behavior,
  location-to-location transfers, multi-bin batch actions, vehicle-bin stock
  onboarding, Return-to-Inventory, buyout, Express Checkout, Manager Override,
  backend handlers, backend action services, and all reserved features.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 078).

---

## Entry 080 - Milestone 5H.2 Bin Scan Count Correction Entry Point

**Date:** 2026-06-25
**Updated by:** Codex
**Phase:** Inventory (Stage 1) - Scan destination action bindings
**Session type:** implementation

### Context
Ryan requested Milestone 5H.2: add a safe Count Correction entry point on
bin-level scan destination pages so a field user who scans a bin can begin a
count correction using the existing Inventory Count & Correction / Count Intake
flow. The milestone was explicitly UI/client-side binding only and prohibited
new schema, RPCs, permission changes, transaction engines, balance paths, count
correction backend paths, QR payload changes, scan route structure changes, and
all reserved workflows.

The prior session summary referenced HANDOFF Entry 078 in its routing verdict
even though Entry 079 had been appended. Before coding, HANDOFF was checked:
Entry 079 is present and the file is gapless through Entry 079. The Entry
078/079 mismatch was treated as a routing-reference typo, and this entry uses
the correct latest handoff number after append.

First-action checks were completed:
- `git pull origin main` reported already up to date.
- Local `main` matched `origin/main` at
  `83d237056b79d2e655ef68068838c572ed82fed9`.
- `docs/ARCHITECTURE.md` was confirmed as Version 2.15.
- `HANDOFF.md` was confirmed gapless through Entry 079 before this append.
- The working tree was clean before changes, aside from the existing local
  git-ignore permission warning from `C:\Users\Ryan/.config/git/ignore`.
- Architecture Sections 10, 10a, 11, 12, 17a, 23, 24, and 30 were checked for
  QR, scan destination behavior, Count Intake, physical count correction,
  transaction/balance, permission, and routing constraints.
- The scan destination page, scan route parser, existing Inventory Count Intake
  UI, `useInventoryCountIntake`, and existing count submission path were
  inspected before coding.

### What Was Completed
- Added a bin-level scan page Count Correction action that appears only when
  the resolved scan destination is a bin.
- The action button text is:
  `Correct count for this bin`.
- The helper text states:
  `Uses the existing Inventory Count & Correction flow. Inventory is not changed until the count correction is submitted through the approved path.`
- The scan page action does not call any Supabase write RPC directly. It routes
  to the existing dashboard Inventory Count tab with scanned-bin context in the
  dashboard query string:
  `/?inventoryTab=count&scanBinId=<bin_uuid>&scanBinCode=<display_code>`.
- Extended the 5H.1 dashboard query parser so scanned-bin context is routed to
  the Cart tab only for `inventoryTab=cart` and to the Count tab only for
  `inventoryTab=count`.
- Added `buildScanCountPath()` alongside the existing scan cart path helper.
- Updated `InventoryCountIntakePanel` to accept scanned-bin context.
- When opened from a scanned bin, the Count Intake screen:
  - shows a scanned-bin context panel;
  - preselects the scanned bin path when hierarchy data is loaded;
  - narrows existing authorized count rows to the scanned `bin_id`;
  - preserves existing search/category/repeat filters within that scanned-bin
    context;
  - provides `Show all count rows` to clear the scanned-bin context and return
    to the normal count view.
- Existing count submission behavior is reused unchanged:
  - existing bin/material count rows still use the current `Record` /
    `Record Count` controls;
  - new catalog-item count intake still uses the selected bin in the existing
    Count Intake form;
  - submissions still go through `useInventoryCountIntake().recordCount()`;
  - `useInventoryCountIntake().recordCount()` still calls the existing
    `intake_inventory_count` RPC.
- Added the required scanned-bin empty state:
  `No authorized material rows were found for this scanned bin.`
- Non-bin scan destinations do not show the bin-specific Count Correction
  action.
- Updated the scan page note to state that bin cart staging and count correction
  use existing approved flows and do not change inventory until those workflows
  are completed.
- Updated the Development Status card:
  - Most recent change:
    `Milestone 5H.2 — Bin scan Count Correction entry point`;
  - Related HANDOFF: `Entry 080`;
  - Architecture: `v2.15`;
  - Current step: `Scan destination action bindings`;
  - Build marker: `Scan Count Correction build: 83d23705`.

### Verification
- `cmd /c npm run build` passed. Vite reported only the existing chunk-size
  warning. An initial build attempt hit a transient Vite/Rolldown HTML emit path
  error for `index.html`; an immediate rerun passed with no code changes.
- `git diff --check` passed.
- Changed source files before this HANDOFF append were limited to:
  - `src/App.jsx`;
  - `src/styles.css`.
- Static scan confirmed no migration files were added.
- Static scan confirmed no Supabase/RLS/grant/permission/backend behavior
  changed.
- Static scan confirmed no new Count Intake backend path,
  `physical_count_correction` RPC behavior change, transaction engine, balance
  mutation, cart checkout behavior, bin_item retirement, QR payload, scan route
  structure, transaction-history permission, destination semantic, Accounting
  Export behavior, or Financials/job-cost behavior changed.
- Authenticated browser verification was unavailable from this Codex session
  and is not claimed.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend handlers, database indexes, or
  backend action services were added.

### Code / File Changes
- `src/App.jsx`
  - Imported `ClipboardCheck` for the Count Correction action button.
  - Updated Development Status values for Milestone 5H.2.
  - Added scanned-bin count route context parsing.
  - Added `buildScanCountPath()`.
  - Added `getCountPathFiltersForBin()`.
  - Added `ScanBinCountEntry`.
  - Rendered the bin-only Count Correction action on scan pages.
  - Passed scanned-bin count context into `InventoryReadOnlyPanel` and
    `InventoryCountIntakePanel`.
  - Added scanned-bin filtering, path preselection, context panel, and
    clear-context behavior to the existing Count Intake UI.
- `src/styles.css`
  - Added responsive styling for the scan Count Correction entry panel and the
    scanned-bin count context panel.
- `HANDOFF.md`
  - Appended this Entry 080.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.15.

### What Codex Needs to Know
- Bin-level scan pages now provide both:
  - Add-to-Cart entry point from 5H.1;
  - Count Correction entry point from 5H.2.
- The Count Correction scan action is client-side navigation into the existing
  Inventory Count tab with scanned-bin context. It does not submit counts from
  the scan page.
- All count writes remain in the pre-existing Count Intake UI and existing
  `useInventoryCountIntake` / `intake_inventory_count` path.
- The prior Entry 078/079 routing mismatch was a summary/reference typo; the
  actual HANDOFF file is gapless and now continues through Entry 080.

### What Claude Needs to Know
- No schema, migration, Supabase table, new RPC, RLS, grant, permission flag,
  backend handler, backend action service, Clerk/auth, QR payload, scan route
  structure, ledger, balance, cart checkout, Count Intake backend path,
  `physical_count_correction` RPC behavior, bin_item retirement, destination
  semantic, transaction-history permission, Accounting Export, Financials/job-
  cost, Express Checkout, Manager Override, transfer, Return-to-Inventory,
  buyout, or reserved feature behavior was changed.
- This was a UI/client-side binding from the bin scan page into the already
  approved Inventory Count & Correction / Count Intake workflow.

### Next Steps (in order)
1. Ryan may verify production after push/deploy:
   - scan or manually open a bin QR route;
   - confirm only bin-level scan pages show
     `Correct count for this bin`;
   - click the action and confirm the dashboard opens Inventory -> Inventory
     Count & Correction with the scanned-bin context panel visible;
   - confirm the visible count rows are narrowed to the scanned bin;
   - submit a count only through the existing Count Intake controls if desired;
   - confirm non-bin scan pages do not show the bin-specific Count Correction
     action.
2. Keep any follow-up scan action work within the existing cart/checkout or
   Count Intake / physical count correction engines unless Claude review is
   triggered.

### Open Questions / Concerns
- Authenticated browser verification was unavailable from this Codex session
  and is not claimed.
- The Count tab still depends on the existing authorized count rows loaded
  through `useInventoryCountSheet`; if a scanned bin has no authorized material
  rows, the required empty state is shown and no workaround is attempted.

### Architecture Drift Warnings
- CLOSED for this milestone: bin-level scan Count Correction entry point.
- RESERVED: schema/RLS/permission changes, new Count Intake backend paths,
  physical count correction RPC changes, new transaction engines, direct
  balance writes, cart checkout changes, bin_item retirement semantic changes,
  QR payload changes, scan route structure changes, transaction-history
  permission changes, destination semantic changes, Accounting Export behavior,
  Financials/job-cost behavior, location-to-location transfers, multi-bin batch
  actions, vehicle-bin stock onboarding, Return-to-Inventory, buyout, Express
  Checkout, Manager Override, backend handlers, backend action services, and all
  reserved features.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.15, HANDOFF Entry 080).

---

## Entry 081 - Standard Codex Operating Instructions adopted (ARCHITECTURE v2.16, new Section 35)

**Date:** 2026-06-25
**Updated by:** Codex
**Phase:** Documentation / coordination doctrine
**Session type:** implementation

### Context
Ryan identified Codex prompt length and usage burn as a coordination problem.
Claude reviewed the proposed Standard Codex Operating Instructions and applied
five tightening edits. ChatGPT then Rule 20 cross-cleared the adoption, and Ryan
authorized this adoption pass.

This was a documentation / lock-document adoption task only. No app-code,
schema, backend, RLS, permission, auth, transaction, ledger, inventory balance,
checkout, Count Intake, QR/scan, Accounting Export, Financials/job-cost,
Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, or Manager
Override behavior was changed.

First-action checks were completed:
- `git pull origin main` reported already up to date.
- Local `main` matched `origin/main` at
  `435e259c66256eeda4efa8779d3f32bcc21a9469`.
- The working tree was clean before changes, aside from the existing local
  git-ignore permission warning from `C:\Users\Ryan/.config/git/ignore`.
- `docs/ARCHITECTURE.md` was confirmed as Version 2.15 before changes.
- Section 34 was confirmed as the last ARCHITECTURE section before changes.
- `HANDOFF.md` was confirmed gapless through Entry 080 before this append.
- Standard Codex Operating Instructions were confirmed not already present in
  ARCHITECTURE or HANDOFF before changes.

### What Was Completed
- Adopted Standard Codex Operating Instructions as standing operating doctrine.
- Advanced ARCHITECTURE from v2.15 to v2.16.
- Added new `## 35. Standard Codex Operating Instructions (locked v2.16 — Entry 081)`.
- Added the v2.16 version-line clause describing:
  - reusable task classification buckets;
  - the Bucket 2 positive confirmation gate;
  - protected-scope rules with Section 10a / v2.15 references for
    cross-location transfers and multi-bin batch actions;
  - explicit RLS-bypass prohibition;
  - explicit direct `inventory_balances` write-path verification;
  - standard start procedure;
  - HANDOFF requirement;
  - routing verdict;
  - short-prompt footer.
- Preserved the prior v2.15 version history text in the ARCHITECTURE version
  line.
- Added Section 35H as the canonical short footer future Codex prompts may use.
- Appended this HANDOFF Entry 081.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend handlers, database indexes, or
  backend action services were added.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated the version line from v2.15 to v2.16.
  - Added new Section 35 after Section 34.
- `HANDOFF.md`
  - Appended this Entry 081.
- No `src/` files, migrations, Supabase files, package files, Clerk/auth files,
  backend/RPC files, or app behavior files were changed.

### Lock Document Changes
- ARCHITECTURE advanced from v2.15 to v2.16.
- New Section 35 is now locked as canonical Standard Codex Operating
  Instructions.

### What Codex Needs to Know
- Future Codex prompts may use the Section 35H short footer instead of
  restating the full operating instructions.
- Codex must classify future tasks using Section 35B before coding.
- Bucket 2 Existing-Flow Binding tasks require positive confirmation that the
  existing flow accepts the new context without modification.
- Protected scope is listed in Section 35C and must not be touched without an
  existing lock or Claude routing.
- Section 35E verification and Section 35G routing verdicts are now canonical.

### What Claude Needs to Know
- ChatGPT Rule 20 cross-cleared the v2.16 / Section 35 adoption before this
  pass.
- Ryan authorized adoption.
- No source behavior or protected implementation scope changed.
- This entry documents the adoption of coordination doctrine only.

### Next Steps (in order)
1. Future Codex prompts may reference the Section 35H short footer.
2. Continue feature work under ARCHITECTURE v2.16 and HANDOFF Entry 081.
3. Route any protected-scope or architecture-sensitive task through Claude per
   Sections 30 and 35.

### Open Questions / Concerns
- None.

### Architecture Drift Warnings
- CLOSED for this milestone: Standard Codex Operating Instructions adoption.
- No app-code, schema, backend, RLS, permission, transaction, ledger, balance,
  checkout, Count Intake, QR/scan, Accounting Export, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, cross-location transfer, or multi-bin batch action behavior changed.

### Routing Verdict
No Claude review needed — Rule 20 cross-cleared adoption applied (ARCHITECTURE v2.16, HANDOFF Entry 081).

---

## Entry 082 - Selected Path count material-code search fixed

**Date:** 2026-06-25
**Updated by:** Codex
**Phase:** Inventory Count Intake / Selected Path search
**Session type:** implementation

### Context
Ryan reported that Count Loaded Stock search finds material code `C222` as
`3/4" EMT Compression Couplings`, while the Selected Path count tool returns no
results for `C222`. Ryan clarified that searching by the actual material code
also does not return the item in Selected Path count.

Section 35 classification: Bucket 1 — Safe UI/client-side search/filter bugfix.
The task was limited to already-loaded, already-authorized count rows and did
not require backend, schema, RLS, permission, or write-path changes.

### What Was Completed
- Compared Count Loaded Stock / Grand Master search behavior against Selected
  Path count search behavior.
- Found that `matchesCountRowSearch` treated short hierarchy-looking search
  values such as `C222` as location-only searches.
- Updated the Selected Path count row matcher so count rows always include
  material fields, including `material_code`, while preserving compact
  location-code matching.
- Preserved selected-path filters for storage unit, shelf, bay, bin, scan-bin
  context, category, and Review Repeats.
- Preserved Count Intake submission and write behavior.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend handlers, database indexes, or
  backend action services were added or changed.

### Code / File Changes
- `src/App.jsx`
  - Updated `matchesCountRowSearch` so token matching always searches
    `getCountRowSearchValues(row)`, which includes `row.material_code`.
  - Retained `compactLocationCode` and `compactLocationMatch` for selected-path
    hierarchy searches.
- `HANDOFF.md`
  - Appended this Entry 082.

### Verification
- Confirmed `getCountRowSearchValues(row)` includes `row.material_code`.
- Confirmed the Selected Path filters still run before the row search result is
  returned.
- Confirmed no broader fetch was added; `useInventoryCountSheet` was unchanged.
- Confirmed no Count Intake submission/write hook changed.
- Confirmed no Supabase, migration, backend, schema, RLS, permission, or
  `inventory_balances` direct-write path changed.
- `git diff -- src\hooks\useInventoryCountSheet.js src\hooks\useInventoryCountIntake.js src\hooks\useInventoryCountCorrection.js supabase`
  returned no changes.
- `npm.cmd run build` passed.

### Open Questions / Concerns
- Authenticated browser verification was unavailable from this Codex session
  and is not claimed.
- PowerShell blocked `npm run build` through `npm.ps1` because local script
  execution is disabled; `npm.cmd run build` was used successfully instead.

### Architecture Drift Warnings
- CLOSED for this milestone: Selected Path count material-code search bugfix.
- No protected scope changed: schema, RLS, grants, permissions, backend/RPC,
  Clerk/auth/login, inventory balance mutation logic, ledger behavior,
  transaction tables, checkout/finalization, Count Intake write path,
  `physical_count_correction`, bin item retirement, QR payload, scan route
  structure, transaction-history permissions, destination semantics, Accounting
  Export, Financials/job-cost, Return-to-Inventory, buyout, vehicle-bin stock,
  Express Checkout, Manager Override, cross-location transfer behavior, and
  multi-bin batch actions were untouched.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.16, HANDOFF Entry 082).

---

## Entry 083 - Tool Catalogue Foundation locked (ARCHITECTURE v2.17, new Section 36)

**Date:** 2026-06-25
**Updated by:** Codex
**Phase:** Documentation / Tool Catalogue architecture doctrine
**Session type:** implementation

### Context
Ryan requested a foundation for logging company tool inventory.

The locked feature term is `Tool Catalogue`, not `Tool Inventory`. This phase
is a catalogue/logging surface only, not a tracking/check-out system.

Because this future feature introduces a new Supabase table and RLS, it is
Architecture-sensitive under Section 35. Claude reviewed and approved the Tool
Catalogue Foundation with edits. ChatGPT Rule 20 cross-cleared the adoption
with corrected numbering, and Ryan authorized this adoption pass.

Corrected numbering: Claude's draft referred to the Tool Catalogue entry as
Entry 082, but Entry 082 already exists for the Selected Path count
material-code search fix. Tool Catalogue adoption is Entry 083.

### What Was Completed
- Advanced ARCHITECTURE from v2.16 to v2.17.
- Added new `## 36. Tool Catalogue (locked v2.17 — Entry 083)`.
- Locked Tool Catalogue as a catalogue/logging foundation, not a checkout,
  tracking, custody, transfer, QR-label, vehicle-storage, or history-ledger
  system.
- Locked the future `public.tools` schema foundation, including:
  - `division_id` FK to `divisions(id)`;
  - soft-archive columns;
  - nullable `tool_number` and `serial_number`;
  - required `name`;
  - CHECK-constrained `condition` and `status`;
  - plain text placeholder fields for `home_location`, `current_location`, and
    `assigned_to`;
  - deferred `purchase_price` and `vendor`.
- Locked partial unique indexes for non-null `tool_number` and `serial_number`.
- Locked future RLS/permission doctrine:
  - read by own division or `can_view_all_divisions`;
  - write/create/edit/archive by `can_manage_inventory` within division scope;
  - hard delete never;
  - no new permission flags in this phase;
  - `can_view_financials` is not a Tool Catalogue field gate.
- Locked the first permitted UI surface and helper copy.
- Reserved checkout/check-in, assignment history, custody chain, QR labels,
  scan pages, transfers, vehicle-bin tool storage, employee/job linked
  assignments, maintenance/inspection/calibration logs, repair history,
  purchase accounting/depreciation, attachments/photos/receipts, canonical
  accounting import/export, tool-specific permission flags, tool ledger, and
  tool audit table for future architecture clearance.
- Appended this HANDOFF Entry 083.

### Schema Changes
- None in this pass.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend handlers, database indexes, or
  backend action services were added.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated the version line from v2.16 to v2.17.
  - Added new Section 36 after Section 35.
- `HANDOFF.md`
  - Appended this Entry 083.
- No app-code, migration, schema, RLS, permission, ledger, balance,
  transaction, auth, or UI behavior changed in this docs-only pass.

### Lock Document Changes
- ARCHITECTURE advanced from v2.16 to v2.17.
- Section 36 now canonically locks the Tool Catalogue Foundation.
- HANDOFF remains gapless through Entry 083.

### What Codex Needs to Know
- Future Tool Catalogue implementation must be built in two steps:
  1. Migration first.
  2. UI second.
- Before writing the migration, Codex must confirm:
  - the existing `updated_at` trigger function name from live repo migrations;
  - user profile/RLS patterns;
  - Clerk auth helper/function pattern;
  - `divisions` table shape.
- Do not add `purchase_price` or `vendor` in the first Tool Catalogue
  migration.
- Do not add tool-specific permission flags, audit tables, tool ledgers,
  attachments, checkout/check-in, QR labels, vehicle/bin linkage, job linkage,
  assignment history, tracking history, custody chain, transfers, or purchase
  accounting behavior without future architecture clearance.

### What Claude Needs to Know
- Claude reviewed and approved the Tool Catalogue Foundation with edits.
- ChatGPT Rule 20 cross-cleared adoption with corrected numbering.
- Entry 083 was used because Entry 082 was already consumed by the Selected
  Path count material-code search fix.
- No implementation, migration, RLS, permission, or runtime behavior was
  changed in this pass.

### Next Steps (in order)
1. Future Codex implementation prompt should start with migration inspection:
   updated_at trigger function, user profile/RLS pattern, Clerk auth helper, and
   `divisions` table shape.
2. Implement the locked Tool Catalogue migration.
3. Implement the locked first Tool Catalogue UI surface only after the migration
   shape is verified.

### Open Questions / Concerns
- None.

### Architecture Drift Warnings
- CLOSED for this milestone: Tool Catalogue Foundation adoption.
- No app-code, migration, schema, backend, RLS, permission, transaction, ledger,
  balance, checkout, Count Intake, QR/scan, Accounting Export,
  Financials/job-cost, Return-to-Inventory, buyout, vehicle-bin stock, Express
  Checkout, Manager Override, Tool Catalogue runtime behavior, cross-location
  transfer, or multi-bin batch action behavior changed.

### Routing Verdict
No Claude review needed — Rule 20 cross-cleared adoption applied (ARCHITECTURE v2.17, HANDOFF Entry 083).

---

## Entry 084 - Section 36 Tool Catalogue division correction (ARCHITECTURE v2.18)

**Date:** 2026-06-25
**Updated by:** Codex
**Phase:** Documentation / Tool Catalogue architecture correction
**Session type:** implementation

### Context
Codex correctly stopped during Tool Catalogue migration preflight for Milestone
5I.1 before writing a migration.

The blocker was that Section 36 required
`division_id uuid not null references divisions(id)`, but the current repo
migration chain does not define `public.divisions` or a UUID division
convention.

Existing app convention uses `division text`, including
`user_permissions.division` and `items.division`.

Claude reviewed and approved correcting Section 36. ChatGPT Rule 20
cross-cleared the correction, and Ryan authorized this docs-only correction
pass.

### What Was Completed
- Advanced ARCHITECTURE from v2.17 to v2.18.
- Corrected Section 36 so the Tool Catalogue first migration uses
  `division text not null`.
- Replaced the stale `division_id uuid not null references divisions(id)`
  requirement for the Tool Catalogue first migration.
- Clarified that Tool Catalogue RLS must use the existing text-division
  convention:
  - `user_permissions.division`;
  - `items.division`;
  - `auth.jwt() ->> 'sub'`;
  - `user_permissions.clerk_user_id`;
  - `effective_permissions_for_user(...)`;
  - `can_view_all_divisions`;
  - `can_manage_inventory`.
- Added `divisions` table / UUID-based division normalization to the reserved
  future architecture list.
- Preserved the rest of the Tool Catalogue foundation: single `public.tools`
  table, text CHECK constraints for `condition` and `status`, partial unique
  indexes, soft archive, no new permission flags, no audit table, no
  attachments, and reserved tracking/checkout features.
- Appended this HANDOFF Entry 084.

### Schema Changes
- None in this pass.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend handlers, database indexes, or
  backend action services were added.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated the version line from v2.17 to v2.18.
  - Corrected Section 36 to use `division text not null`.
  - Reserved divisions table / UUID-based division normalization for a future
    architecture-cleared milestone.
- `HANDOFF.md`
  - Appended this Entry 084.
- No app-code, migration, schema, RLS, permission, ledger, balance,
  transaction, auth, or UI behavior changed in this docs-only correction.

### Lock Document Changes
- ARCHITECTURE advanced from v2.17 to v2.18.
- Section 36 now matches the current app schema convention for division scope.
- HANDOFF remains gapless through Entry 084.

### What Codex Needs to Know
- Next step is Milestone 5I.1 Tool Catalogue Migration Foundation using the
  corrected Section 36 schema.
- The first Tool Catalogue migration must use `division text not null`, not
  `division_id uuid references divisions(id)`.
- Do not introduce a `divisions` table or UUID-based division normalization as
  part of Tool Catalogue. That is reserved for a dedicated
  architecture-cleared milestone.
- Future Tool Catalogue RLS must follow the existing text-division convention
  and Clerk/user-permissions pattern.

### What Claude Needs to Know
- The v2.17 Section 36 division FK assumption was corrected through Rule 20.
- ChatGPT cross-cleared the correction.
- No implementation, migration, RLS, permission, or runtime behavior changed in
  this pass.

### Next Steps (in order)
1. Resume Milestone 5I.1 Tool Catalogue Migration Foundation.
2. Inspect existing migrations for the `updated_at` trigger function and
   text-division RLS conventions.
3. Create the Tool Catalogue migration using `division text not null`.

### Open Questions / Concerns
- None.

### Architecture Drift Warnings
- CLOSED for this milestone: Section 36 Tool Catalogue division correction.
- No app-code, migration, schema, backend, RLS, permission, transaction, ledger,
  balance, checkout, Count Intake, QR/scan, Accounting Export,
  Financials/job-cost, Return-to-Inventory, buyout, vehicle-bin stock, Express
  Checkout, Manager Override, Tool Catalogue runtime behavior, cross-location
  transfer, or multi-bin batch action behavior changed.

### Routing Verdict
No Claude review needed — Rule 20 cross-cleared correction applied (ARCHITECTURE v2.18, HANDOFF Entry 084).

---

## Entry 085 - Tool Catalogue Migration Foundation (Milestone 5I.1)

**Date:** 2026-06-25
**Updated by:** Codex
**Phase:** Tool Catalogue / migration foundation
**Session type:** implementation

### Context
Milestone 5I.1 is the first runtime implementation step for Tool Catalogue.
ARCHITECTURE v2.18 Section 36 locks the corrected migration foundation:
migration first, UI second, `public.tools` with `division text not null`, and
no divisions table / UUID division normalization.

Classification: Architecture-sensitive implementation of an already-cleared
Section 36 design.

Before writing SQL, Codex confirmed the existing repo conventions:
- updated_at trigger function: `touch_user_permissions_updated_at()`;
- Clerk convention: `auth.jwt() ->> 'sub'`;
- user ID column: `user_permissions.clerk_user_id`;
- division column: `user_permissions.division`;
- permission function: `public.effective_permissions_for_user(up.role, up.division, up.permission_overrides)`;
- permission flags: `can_view_all_divisions`, `can_manage_inventory`.

### What Was Completed
- Added migration `supabase/migrations/202606250001_tool_catalogue_foundation.sql`.
- Created the canonical `public.tools` table foundation.
- Used `division text not null`; no `division_id` field and no `divisions`
  table were introduced.
- Added `condition` CHECK constraint with allowed values `good`, `fair`,
  `poor`, `damaged`, `unknown`, or null.
- Added `status` CHECK constraint with allowed values `active`, `inactive`,
  `retired`, and `missing`, defaulting to `active`.
- Added partial unique indexes:
  - `tools_tool_number_unique` on `tool_number` where non-null;
  - `tools_serial_number_unique` on `serial_number` where non-null.
- Added `trg_touch_tools_updated_at` using the existing
  `touch_user_permissions_updated_at()` trigger function.
- Enabled RLS on `public.tools`.
- Added RLS policies:
  - `tools_division_select` for own-division reads or
    `can_view_all_divisions`;
  - `tools_inventory_manager_insert` for `can_manage_inventory` within the
    user's own division;
  - `tools_inventory_manager_update` for `can_manage_inventory` within the
    user's own division.
- Granted only `SELECT`, `INSERT`, and `UPDATE` on `public.tools` to
  authenticated users.
- Did not create a DELETE policy or DELETE grant.
- No UI was built.
- No reserved tool-tracking features were added.

### Schema Changes
- Added new table `public.tools`.
- Added two partial unique indexes on `public.tools`.
- Added one `updated_at` trigger on `public.tools`.
- Enabled RLS and added new RLS policies only for `public.tools`.
- No existing tables, existing RLS policies, grants, permissions, RPCs,
  inventory balances, ledger behavior, transaction behavior, checkout behavior,
  Count Intake behavior, QR/scan behavior, Accounting Export behavior,
  Financials/job-cost behavior, Return-to-Inventory, buyout, vehicle-bin stock,
  Express Checkout, Manager Override, or existing Inventory behavior changed.

### Code / File Changes
- `supabase/migrations/202606250001_tool_catalogue_foundation.sql`
  - New migration for the Tool Catalogue foundation.
- `HANDOFF.md`
  - Appended this Entry 085.
- No `src/` files, package files, existing migrations, hooks, services,
  routes, tabs, forms, or UI files were changed.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.18.
- HANDOFF remains gapless through Entry 085.

### What Codex Needs to Know
- Tool Catalogue migration foundation now exists.
- The next implementation step is the Tool Catalogue UI.
- UI work must consume the approved `public.tools` schema and must not add
  checkout/check-in, assignment history, custody chain, QR labels, scan pages,
  transfers, vehicle/bin linkage, job linkage, maintenance logs, repair
  history, purchase accounting/depreciation, attachments/photos/receipts,
  canonical accounting import/export, tool-specific permission flags, a tool
  ledger, a tool audit table, `division_id`, or a `divisions` table.

### What Claude Needs to Know
- This pass implemented the already-cleared v2.18 Section 36 migration
  foundation.
- No UI or reserved Tool Catalogue runtime behavior was built.
- No existing schema/RLS/permission behavior changed.
- Supabase CLI was unavailable in this local environment, so local/live
  migration application was not performed and is not claimed.

### Next Steps (in order)
1. Apply or verify the new migration in the target Supabase environment.
2. Build the locked Tool Catalogue UI surface.
3. Keep reserved Tool Catalogue features out of the UI until future
   architecture clearance.

### Open Questions / Concerns
- Supabase local/live migration verification was not completed because the
  `supabase` CLI was not available in this environment.
- `npm run build` was blocked by PowerShell script execution policy, so
  `npm.cmd run build` was used successfully.

### Architecture Drift Warnings
- CLOSED for this milestone: Tool Catalogue migration foundation.
- RESERVED: UI, checkout/check-in, assignment history, custody chain, QR labels,
  scan pages, transfers, vehicle-bin tool storage, employee-linked
  assignments, job/project-linked assignments, maintenance/inspection/
  calibration logs, repair history, purchase accounting/depreciation,
  attachments/photos/receipts, canonical accounting import/export,
  tool-specific permission flags, tool ledger, tool audit table, divisions
  table, and UUID-based division normalization.
- No protected inventory behavior changed: inventory balances, ledger,
  transaction behavior, checkout/finalization, Count Intake, QR/scan behavior,
  Accounting Export, Financials/job-cost, Return-to-Inventory, buyout,
  vehicle-bin stock, Express Checkout, Manager Override, and existing Inventory
  behavior were untouched.

### Routing Verdict
No Claude review needed — implementing locked Tool Catalogue Foundation (ARCHITECTURE v2.18, HANDOFF Entry 085).

---

## Entry 086 - Tool Catalogue UI (Milestone 5I.2)

**Date:** 2026-06-26
**Updated by:** Codex
**Phase:** Tool Catalogue / first UI
**Session type:** implementation

### Context
Milestone 5I.2 is the second Tool Catalogue implementation step under
ARCHITECTURE v2.18 Section 36. The migration foundation from Entry 085 is
already present, and this pass adds the first Supabase-backed Tool Catalogue
UI only.

Classification: Architecture-sensitive implementation of an already-locked
Tool Catalogue UI surface.

### What Was Completed
- Added a Tool Catalogue tab inside the existing inventory module shell.
- Added the locked Tool Catalogue title and helper copy:
  "Catalogue-only foundation. Tool checkout, assignments, QR labels, vehicle
  storage, and tracking history are reserved for future milestones."
- Added live Supabase reads from `public.tools` using only the approved
  Section 36 columns.
- Added search across tool number, name, category, brand, model, serial
  number, description, home location, current location, assigned-to text, and
  notes.
- Added category, status, condition, and Show archived filters.
- Added active/default table and mobile list views with the first recommended
  Tool Catalogue columns.
- Added the required empty state text:
  "No tools have been added yet."
- Added an add/edit form for approved editable fields only.
- Create uses the existing current-user `permissions.division` convention and
  inserts `division` into `public.tools`.
- Edit updates approved editable fields only and does not change `division`.
- Added soft archive behavior that updates `archived_at`, `archived_by`,
  optional `archive_reason`, and `status = 'retired'`.
- No hard delete behavior was added.
- Updated the Development Status card to Milestone 5I.2 / Entry 086 /
  ARCHITECTURE v2.18 / Tool Catalogue / build marker `092da08`.

### Schema Changes
- None.
- No migrations were added or edited.
- No schema, RLS, grants, permission flags, RPCs, backend functions, storage,
  indexes, or database behavior changed.

### Code / File Changes
- `src/App.jsx`
  - Added Tool Catalogue constants, filters, add/edit form, table/mobile list,
    Supabase read/create/update/soft-archive behavior, tab registration, and
    Development Status updates.
- `src/styles.css`
  - Added Tool Catalogue layout, toolbar, form, responsive table/mobile, and
    archived-row styling.
- `HANDOFF.md`
  - Appended this Entry 086.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.18.
- HANDOFF remains gapless through Entry 086.

### What Codex Needs to Know
- Tool Catalogue UI now exists as a catalogue-only foundation.
- It intentionally uses the existing `can_manage_inventory` write gate and
  current-user `division` value from `usePermissions`.
- Cross-division visible rows remain read-only in the UI; writes are limited to
  the current user division and remain server-enforced by RLS.
- The UI does not expose archive metadata in the normal edit form.

### What Claude Needs to Know
- This pass implemented the already-locked Tool Catalogue UI.
- No migration, schema, RLS, permission, backend, inventory balance, ledger,
  checkout, Count Intake, QR/scan, Accounting Export, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, or existing Inventory behavior changed.
- Browser verification was attempted against `http://127.0.0.1:5173/`, but
  the local app failed before render because `VITE_SUPABASE_URL` was not set in
  the dev-server environment. Authenticated Tool Catalogue verification was not
  completed in this Codex session.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Build completed with Vite's chunk-size warning only.
- Confirmed no migrations were added or edited in this pass.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no new permission flags were added.
- Confirmed no DELETE behavior was added.
- Confirmed no checkout/check-in, QR labels, assignment history, tracking
  ledger, vehicle/bin linkage, accounting behavior, or reserved Tool Catalogue
  features were added.
- Confirmed no direct `inventory_balances` write path was added.
- Browser verification was attempted but blocked by missing local
  `VITE_SUPABASE_URL`; no authenticated visual verification is claimed.

### Next Steps (in order)
1. Perform authenticated browser verification with a user whose server
   permissions include a division and `can_manage_inventory`.
2. Begin logging company tools in Tool Catalogue.
3. Reserve checkout/check-in, QR labels, assignments, vehicle storage, and
   tracking history for future architecture-cleared milestones.

### Open Questions / Concerns
- Browser/authenticated verification was blocked by missing local
  `VITE_SUPABASE_URL` in the dev-server environment.

### Architecture Drift Warnings
- CLOSED for this milestone: first Tool Catalogue UI.
- RESERVED: checkout/check-in, assignment history, custody chain, QR labels,
  scan pages, transfers, vehicle-bin tool storage, employee-linked
  assignments, job/project-linked assignments, maintenance/inspection/
  calibration logs, repair history, purchase accounting/depreciation,
  attachments/photos/receipts, canonical accounting import/export,
  tool-specific permission flags, tool ledger, tool audit table, divisions
  table, and UUID-based division normalization.
- No protected inventory behavior changed: inventory balances, ledger,
  transaction behavior, checkout/finalization, Count Intake, QR/scan behavior,
  Accounting Export, Financials/job-cost, Return-to-Inventory, buyout,
  vehicle-bin stock, Express Checkout, Manager Override, and existing Inventory
  behavior were untouched.

### Routing Verdict
No Claude review needed — implementing locked Tool Catalogue UI (ARCHITECTURE v2.18, HANDOFF Entry 086).

---

## Entry 087 - Dashboard Width / Layout Usability Pass (Milestone 5I.3)

**Date:** 2026-06-26
**Updated by:** Codex
**Phase:** Dashboard layout usability
**Session type:** implementation

### Context
Milestone 5I.3 is a Safe UI/CSS layout pass under ARCHITECTURE v2.18 and
Section 35. Ryan visually verified the Tool Catalogue UI from Entry 086 and
identified the next usability issue: the desktop dashboard/app content was too
narrow, causing excessive vertical stacking and avoidable horizontal scrolling
inside content areas.

Classification: Safe UI/CSS task.

### What Was Completed
- Widened the shared desktop app content container.
- Added a shared `--app-content-width` CSS variable with a desktop cap of
  `1600px` and viewport-based width behavior.
- Updated `.app-header__inner` to use the shared app content width.
- Updated `.app-main` to use the shared app content width.
- Preserved the existing centered layout and balanced left/right margins.
- Preserved existing dashboard grid, card, table wrapper, mobile list, and
  responsive stacking behavior.
- Reduced artificial horizontal scrolling pressure for Inventory, Accounting
  Export, Count Intake, Tool Catalogue, and other wide table views by widening
  their parent shell.
- Updated the Development Status card to Milestone 5I.3 / Entry 087 /
  ARCHITECTURE v2.18 / Layout usability / build marker `3f85fe7`.

### Schema Changes
- None.
- No migrations were added or edited.
- No schema, RLS, grants, permission flags, RPCs, backend functions, storage,
  indexes, auth, routes, or database behavior changed.

### Code / File Changes
- `src/styles.css`
  - Added `--app-content-width: min(96vw, 1600px)`.
  - Changed `.app-header__inner` from the old 1180px cap to the shared width.
  - Changed `.app-main` from the old 1180px cap to the shared width.
- `src/App.jsx`
  - Updated the Development Status card values only.
- `HANDOFF.md`
  - Appended this Entry 087.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.18.
- HANDOFF remains gapless through Entry 087.

### What Codex Needs to Know
- The desktop dashboard shell is intentionally wider after this pass.
- The change is shared at the app container level rather than one-off table or
  Tool Catalogue styling.
- Existing table horizontal scrolling remains available where the table is
  genuinely wider than the viewport.
- Mobile/tablet breakpoint rules were not changed.

### What Claude Needs to Know
- This was a Safe UI/CSS layout pass only.
- No behavior, data fetching, write behavior, permissions, schema, RLS,
  backend, auth, routes, Tool Catalogue CRUD/archive, Inventory, Cart,
  Checkout, Count Intake, QR/scan, Accounting Export, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, or existing runtime behavior changed.
- Authenticated browser verification was not completed in this Codex session.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Build completed with Vite's chunk-size warning only.
- Confirmed changed files are UI/client-side only: `src/styles.css` and
  `src/App.jsx`, plus this HANDOFF append.
- Confirmed no migrations were added or edited.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no new routes or data behavior changed.
- Confirmed no Tool Catalogue CRUD/archive behavior changed.
- Confirmed no existing Inventory/Cart/Checkout/Count Intake/QR/Accounting
  Export behavior changed.

### Manual Verification Notes For Ryan
- Open the app on desktop.
- Confirm main content is wider and centered.
- Confirm margins are roughly even left/right.
- Confirm Inventory and Tool Catalogue views require less horizontal scrolling.
- Confirm mobile/tablet layout still works.

### Next Steps (in order)
1. Visually verify the widened dashboard on a desktop browser.
2. Check Tool Catalogue and Inventory wide-table views for reduced horizontal
   scrolling.
3. Check one tablet/mobile viewport to confirm the existing stacking still
   feels good.

### Open Questions / Concerns
- Authenticated browser verification was unavailable/not completed in this
  local Codex session.

### Architecture Drift Warnings
- CLOSED for this milestone: desktop dashboard width/layout usability pass.
- No protected runtime behavior changed: schema, RLS, grants, permissions,
  backend behavior, auth, routes, inventory balances, ledger, transaction
  behavior, checkout/finalization, Count Intake, QR/scan behavior, Accounting
  Export, Tool Catalogue CRUD/archive, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, and existing Inventory behavior were untouched.

### Routing Verdict
No Claude review needed — Safe UI/CSS layout pass (ARCHITECTURE v2.18, HANDOFF Entry 087).

---

## Entry 088 - Dev-only Layout Tuner (Milestone 5I.4)

**Date:** 2026-06-26
**Updated by:** Codex
**Phase:** Dashboard layout tuning dev tool
**Session type:** implementation

### Context
Milestone 5I.4 is a Safe UI/client-side dev tooling task under ARCHITECTURE
v2.18 and Section 35. Entry 087 widened the dashboard shell; this pass adds a
URL-gated local layout tuner so Ryan can visually tune layout variables without
repeated CSS adjustment passes.

Classification: Safe UI/client-side dev tooling task.

### What Was Completed
- Added a dev-only Layout Tuner panel gated behind `layoutTuner=1`.
- The tuner is not added to normal navigation and does not render when the URL
  flag is absent.
- Added localStorage-only persistence under `northgate.layoutTuner.v1`.
- Added live CSS-variable application through `document.documentElement`.
- Added Reset behavior that clears the localStorage key, restores defaults,
  and keeps the panel open.
- Added Copy CSS behavior that copies a `:root { ... }` variable snippet for a
  later commit.
- Added a collapsible floating panel with sliders and numeric inputs.
- Updated layout CSS variables so the tuner can adjust app width, page gutter,
  dashboard card gap, dashboard card padding, and table density.
- Updated the Development Status card to Milestone 5I.4 / Entry 088 /
  ARCHITECTURE v2.18 / Dev-only layout tuner / build marker `07a2f44`.

### CSS Variables Exposed
- `--app-content-max`
- `--app-content-vw`
- `--app-page-gutter`
- `--dashboard-card-gap`
- `--dashboard-card-padding`
- `--dense-table-font-size`
- `--dense-table-cell-padding-y`
- `--dense-table-cell-padding-x`

### Selectors Affected
- `.app-header__inner`
- `.app-main`
- `.dashboard-grid`
- `.card`
- `.data-table`
- `.data-table th`
- `.data-table td`
- `.layout-tuner` and child Layout Tuner controls

### Schema Changes
- None.
- No migrations were added or edited.
- No Supabase, schema, RLS, grants, permission flags, RPCs, backend functions,
  storage, indexes, auth, routes, or database behavior changed.

### Code / File Changes
- `src/App.jsx`
  - Added Layout Tuner field definitions, URL flag detection, localStorage
    helpers, live CSS-variable application, Copy CSS, Reset, and the gated
    floating panel.
  - Updated Development Status values.
- `src/styles.css`
  - Added default layout CSS variables.
  - Rewired the existing shared layout/table/card selectors to use those
    variables.
  - Added Layout Tuner panel styles.
- `HANDOFF.md`
  - Appended this Entry 088.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.18.
- HANDOFF remains gapless through Entry 088.

### What Codex Needs to Know
- Layout Tuner is a local/dev convenience only.
- It appears only when the current URL contains `layoutTuner=1`.
- It uses browser localStorage only and must not become a production settings
  system.
- Normal app usage without `layoutTuner=1` uses the committed CSS defaults.

### What Claude Needs to Know
- This was a Safe UI/client-side dev tooling pass only.
- No behavior, data fetching, write behavior, permissions, schema, RLS,
  backend, auth, routes, Tool Catalogue CRUD/archive, Inventory, Cart,
  Checkout, Count Intake, QR/scan, Accounting Export, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, or existing runtime behavior changed.
- Authenticated browser verification was not completed in this Codex session.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Build completed with Vite's chunk-size warning only.
- Confirmed changed files are UI/client-side only: `src/App.jsx` and
  `src/styles.css`, plus this HANDOFF append.
- Confirmed no migrations were added or edited.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no route/data/write behavior changed.
- Confirmed no Tool Catalogue CRUD/archive behavior changed.
- Confirmed no Inventory/Cart/Checkout/Count Intake/QR/Accounting Export
  behavior changed.
- Confirmed tuner render is gated by `layoutTuner=1` in the current URL.

### Manual Verification Notes For Ryan
- Open the app normally and confirm Layout Tuner is not visible.
- Open the app with `?layoutTuner=1` and confirm the panel appears.
- Adjust content width and confirm the dashboard changes live.
- Refresh and confirm localStorage keeps the tuned values.
- Click Reset and confirm defaults return.
- Click Copy CSS and confirm the variable snippet copies.
- Confirm no app data behavior changes.

### Next Steps (in order)
1. Use `?layoutTuner=1` on desktop to dial in preferred layout values.
2. Copy the CSS snippet after choosing values.
3. Send the snippet back for a small follow-up commit that updates defaults.

### Open Questions / Concerns
- Authenticated browser verification was unavailable/not completed in this
  local Codex session.

### Architecture Drift Warnings
- CLOSED for this milestone: dev-only layout tuner.
- No protected runtime behavior changed: schema, RLS, grants, permissions,
  backend behavior, auth, routes, inventory balances, ledger, transaction
  behavior, checkout/finalization, Count Intake, QR/scan behavior, Accounting
  Export, Tool Catalogue CRUD/archive, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, and existing Inventory behavior were untouched.

### Routing Verdict
No Claude review needed — Safe UI/client-side dev layout tuner (ARCHITECTURE v2.18, HANDOFF Entry 088).

---

## Entry 089 - UI Design System Preview / Tool Catalogue Skin (Milestone 5J.1)

**Date:** 2026-06-29
**Updated by:** Codex
**Phase:** Tool Catalogue / UI design preview
**Session type:** implementation

### Context
Milestone 5J.1 is a Safe UI/client-side style preview task under ARCHITECTURE
v2.18 and Section 35. The attached Claude Design CSS was used as a visual
reference for the Northgate navy/gold/light operations-dashboard direction, but
its broad prototype selectors were not pasted into the live global stylesheet.

Classification: Safe UI/client-side Tool Catalogue design preview.

### What Was Completed
- Added an opt-in Tool Catalogue design preview gated by `designPreview=1`.
- Normal Tool Catalogue rendering remains on the existing classes unless the
  URL flag is present.
- Added the Tool Catalogue-only wrapper class `tool-catalogue-skin` when the
  preview flag is active.
- Added scoped design tokens behind `.tool-catalogue-skin`, including:
  - navy `#0D1F3C`;
  - gold `#C8922A`;
  - light page/card surfaces;
  - soft borders/shadows;
  - semantic badge colors for ok/warn/error/info states.
- Applied the preview skin to the real Tool Catalogue surface and real data:
  - header/helper area;
  - helper/info note;
  - search/filter toolbar;
  - table view;
  - mobile list cards;
  - add/edit form panel;
  - archive action button styling;
  - loading/muted, empty, and alert states.
- Added visual-only Tool Catalogue badge tone classes for preview status and
  condition display.
- Updated the Development Status card to Milestone 5J.1 / Entry 089 /
  ARCHITECTURE v2.18 / UI design preview / build marker `9693baa`.

### URL Flag Behavior
- Implemented `designPreview=1` gating.
- Normal app use without `designPreview=1` does not add `tool-catalogue-skin`.
- The existing `layoutTuner=1` dev tool remains unchanged.

### Selectors / Wrappers Added or Changed
- Added URL helper:
  - `hasDesignPreviewFlag(path)`
- Added prop flow:
  - `Dashboard` -> `InventoryReadOnlyPanel` -> `ToolCataloguePanel`
- Added wrapper class:
  - `.tool-catalogue-skin`
- Added scoped CSS selectors under:
  - `.cart-panel.tool-catalogue-skin`
  - `.tool-catalogue-skin .card__header`
  - `.tool-catalogue-skin .tool-catalogue__note`
  - `.tool-catalogue-skin .tool-catalogue__layout`
  - `.tool-catalogue-skin .tool-catalogue__list-panel`
  - `.tool-catalogue-skin .tool-catalogue__form-panel`
  - `.tool-catalogue-skin .tool-toolbar`
  - `.tool-catalogue-skin .tool-form`
  - `.tool-catalogue-skin .table-wrap`
  - `.tool-catalogue-skin .tool-table`
  - `.tool-catalogue-skin .tool-catalogue__badge`
  - `.tool-catalogue-skin .empty-state`
  - `.tool-catalogue-skin .alert`
  - `.tool-catalogue-skin .mobile-item`

### Schema Changes
- None.
- No migrations were added or edited.
- No Supabase schema, RLS, grants, permission flags, RPCs, backend functions,
  storage, indexes, auth, routes, or database behavior changed.

### Code / File Changes
- `src/App.jsx`
  - Updated Development Status values.
  - Added `designPreview=1` URL flag detection.
  - Passed the preview flag down to the Tool Catalogue panel.
  - Added `tool-catalogue-skin` only when the flag is active.
  - Added visual-only Tool Catalogue badge tone class helper.
- `src/styles.css`
  - Added scoped `.tool-catalogue-skin` design preview tokens and component
    styling.
  - Kept prototype/global selectors such as `.app`, `.body`, `.content`,
    `.card`, `.btn`, and `.badge` out of global application scope.
- `HANDOFF.md`
  - Appended this Entry 089.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.18.
- HANDOFF remains gapless through Entry 089.

### What Codex Needs to Know
- This preview is intentionally Tool Catalogue-only.
- The preview uses the real Tool Catalogue data and existing behavior.
- The preview is URL-gated with `designPreview=1`.
- The attached prototype CSS was adapted into scoped selectors rather than
  applied globally.

### What Claude Needs to Know
- This was a Safe UI/client-side style preview task only.
- No behavior, data fetching, write behavior, permissions, schema, RLS,
  backend, auth, routes, Tool Catalogue CRUD/archive, Inventory, Cart,
  Checkout, Count Intake, QR/scan, Accounting Export, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, or existing runtime behavior changed.
- Authenticated browser verification was not completed in this Codex session.

### Verification
- Section 35 start procedure completed:
  - pulled `origin/main` with fast-forward-only pull;
  - local `main` now matches `origin/main` at `9693baa`;
  - working tree was clean before implementation after the pull.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Build completed with Vite's chunk-size warning only.
- Confirmed changed files are UI/client-side only: `src/App.jsx` and
  `src/styles.css`, plus this HANDOFF append.
- Confirmed no migrations were added or edited.
- Confirmed `git diff --name-only -- supabase` is empty.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no route/data/write behavior changed, except reading the harmless
  `designPreview=1` URL flag.
- Confirmed no direct `inventory_balances` write path was added.
- Confirmed no Tool Catalogue create/edit/archive behavior changed.
- Confirmed no Inventory/Cart/Checkout/Count Intake/QR/Accounting Export
  behavior changed.
- Confirmed broad prototype CSS classes were not globally applied.
- Confirmed `tool-catalogue-skin` is added only when `designPreview=1` is
  present.

### Manual Verification Notes For Ryan
- Open normal Tool Catalogue and confirm expected behavior.
- Open Tool Catalogue with `?designPreview=1`.
- Confirm Tool Catalogue looks closer to the attached design system.
- Confirm search/filter/add/edit/archive still work.
- Confirm no page-level horizontal scrolling.
- Confirm no overlapping UI.
- Confirm mobile/tablet still stack cleanly.
- Confirm other app areas were not unexpectedly restyled.

### Next Steps (in order)
1. Visually verify normal Tool Catalogue without `designPreview=1`.
2. Visually verify Tool Catalogue with `?designPreview=1`.
3. If the direction feels right, choose whether to keep it URL-gated longer or
   graduate it into the default Tool Catalogue styling in a later UI-only pass.

### Open Questions / Concerns
- Authenticated browser verification was unavailable/not completed in this
  local Codex session.
- Vite still reports the existing chunk-size warning after a successful build.

### Architecture Drift Warnings
- CLOSED for this milestone: Tool Catalogue design preview skin.
- No protected runtime behavior changed: schema, RLS, grants, permissions,
  backend behavior, auth, routes, inventory balances, ledger, transaction
  behavior, checkout/finalization, Count Intake, QR/scan behavior, Accounting
  Export, Tool Catalogue CRUD/archive, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, and existing Inventory behavior were untouched.

### Routing Verdict
No Claude review needed — Safe UI/client-side Tool Catalogue design preview (ARCHITECTURE v2.18, HANDOFF Entry 089).

---

## Entry 090 - Deliverable App Shell / Navigation UI (Milestone 5J.2)

**Date:** 2026-06-29
**Updated by:** Codex
**Phase:** App shell / deliverable navigation UI
**Session type:** implementation

### Context
Milestone 5J.2 is a Safe UI/client-side app-shell styling task under
ARCHITECTURE v2.18 and Section 35. The prior Tool Catalogue design preview
from Entry 089 was directionally correct, and this pass starts applying the
same Northgate deliverable UI direction to normal app use instead of leaving it
only behind `designPreview=1`.

Classification: Safe UI/client-side app-shell styling task.

### What Was Completed
- Updated the normal app shell toward the submitted prototype/design direction:
  - light content background;
  - navy sticky top header;
  - gold active navigation accents;
  - white cards with soft borders/shadows;
  - compact operations-dashboard spacing.
- Added a real top navigation strip in the header.
- Top navigation uses existing client navigation/query handling only:
  - Dashboard;
  - Tool Catalogue;
  - Scan QR;
  - Cart;
  - Count;
  - Accounting.
- Reworked the top-level dashboard content from one all-purpose grid into:
  - a status-card grid;
  - a full-width workflow/status banner;
  - the existing live Inventory module below it.
- Converted the existing Inventory module tab list into a deliverable-style
  left module sidebar without changing tab state or module behavior.
- Preserved the Development Status card and updated it to Milestone 5J.2 /
  Entry 090 / ARCHITECTURE v2.18 / Deliverable UI shell / build marker
  `a88a558`.
- Added shared deliverable visual treatment for common cards, panels, tables,
  inputs, buttons, badges, empty states, alerts, and mobile item cards.
- Kept the prior `designPreview=1` Tool Catalogue preview flag in place.
- Kept the prior `layoutTuner=1` dev-only Layout Tuner in place.

### App Shell / Navigation Strategy
- Adopted a top-nav plus module-sidebar structure rather than replacing the app
  with prototype screens.
- The top nav calls the existing `navigateTo('/?inventoryTab=...')` path that
  was already used by scan/cart/count deep links.
- The Inventory module sidebar still uses the existing `activeTab` React state
  and the same `setActiveTab(...)` handlers.
- No mock screens or fake data were introduced.

### Selectors / Components Added or Changed
- `src/App.jsx`
  - Updated `DEVELOPMENT_STATUS`.
  - Added `shellNavTab`.
  - Added `.app-brand`.
  - Added `.app-top-nav`.
  - Added `.app-nav-item`.
  - Added `.shell-status-grid`.
  - Added `.inventory-module-card`.
  - Added `.inventory-module-shell`.
  - Added `.module-sidebar`.
  - Added `.module-sidebar__header`.
  - Added `.module-content`.
  - Preserved existing module tab buttons and active-tab handlers.
- `src/styles.css`
  - Added deliverable shell tokens:
    - `--ng-navy`;
    - `--ng-gold`;
    - `--ng-page-bg`;
    - `--ng-card-bg`;
    - `--ng-border`;
    - semantic status variables.
  - Restyled:
    - `.app-shell`;
    - `.app-header`;
    - `.app-header__inner`;
    - `.app-top-nav`;
    - `.app-nav-item`;
    - `.app-main`;
    - `.card`;
    - `.status-pill`;
    - `.count-card`;
    - `.module-sidebar`;
    - `.module-tabs`;
    - `.module-tab`;
    - shared panels/tables/buttons/forms/alerts/empty states/mobile cards.
  - Added responsive collapse rules for the new module sidebar and top nav.

### Schema Changes
- None.
- No migrations were added or edited.
- No Supabase schema, RLS, grants, permission flags, RPCs, backend functions,
  storage, indexes, auth, routes, or database behavior changed.

### Code / File Changes
- `src/App.jsx`
  - Updated Development Status values.
  - Added top navigation markup using existing client navigation.
  - Rewrapped dashboard status cards.
  - Rewrapped existing Inventory module tabs into a sidebar shell.
- `src/styles.css`
  - Added deliverable shell design tokens and normal-use shell styling.
  - Added shared light dashboard component styling.
  - Added responsive top-nav/sidebar behavior.
- `HANDOFF.md`
  - Appended this Entry 090.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.18.
- HANDOFF remains gapless through Entry 090.

### What Codex Needs to Know
- This is a normal-use deliverable shell pass, not a hidden preview.
- The prior Tool Catalogue `designPreview=1` preview remains available.
- The new top nav is a UI shortcut into existing tab/query behavior.
- Inventory module tab behavior is still local React state.
- Existing real modules and real data paths remain in place.

### What Claude Needs to Know
- This was a Safe UI/client-side app-shell styling pass only.
- No behavior, data fetching, write behavior, permissions, schema, RLS,
  backend, auth, Tool Catalogue CRUD/archive, Inventory, Cart, Checkout, Count
  Intake, QR/scan, Accounting Export, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, or existing runtime behavior changed.
- Authenticated browser verification was not completed in this Codex session.

### Verification
- Section 35 start checks:
  - local `main` and `origin/main` both pointed at `a88a558`;
  - `docs/ARCHITECTURE.md` remains v2.18;
  - HANDOFF was current through Entry 089;
  - the working tree already contained uncommitted Entry 089 changes from the
    immediately prior milestone and those changes were preserved.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Build completed with Vite's chunk-size warning only.
- Confirmed changed files are UI/client-side only: `src/App.jsx` and
  `src/styles.css`, plus this HANDOFF append.
- Confirmed no migrations were added or edited.
- Confirmed `git diff --name-only -- supabase` is empty.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no auth behavior changed.
- Confirmed no direct `inventory_balances` write path was added.
- Confirmed no Tool Catalogue data behavior changed.
- Confirmed no Inventory/Cart/Checkout/Count Intake/QR/Accounting Export
  behavior changed.
- Confirmed existing app sections/tabs remain present in the module sidebar.
- Confirmed no prototype mock data replaced real app data.
- Confirmed no intentional page-level horizontal scrolling was introduced.

### Manual Verification Notes For Ryan
- Open the app normally.
- Confirm the app shell/navigation looks closer to the submitted prototype.
- Confirm Development Status/current-status info is still visible.
- Confirm all existing main sections are still accessible.
- Confirm Tool Catalogue still loads and add/edit/archive behavior still works.
- Confirm Inventory still loads and normal actions are still accessible.
- Confirm Cart/Checkout/Count/QR/Accounting Export access was not broken.
- Confirm no overlapping UI.
- Confirm no page-level horizontal scrolling.
- Confirm laptop/mobile widths remain usable.

### Next Steps (in order)
1. Visually verify the normal app shell on desktop.
2. Check the new module sidebar at laptop and mobile widths.
3. Decide which individual module surfaces should receive deeper per-module
   polish next, starting with the highest-traffic workflows.

### Open Questions / Concerns
- Authenticated browser verification was unavailable/not completed in this
  local Codex session.
- Vite still reports the existing chunk-size warning after a successful build.

### Architecture Drift Warnings
- CLOSED for this milestone: deliverable app shell/navigation UI pass.
- No protected runtime behavior changed: schema, RLS, grants, permissions,
  backend behavior, auth, inventory balances, ledger, transaction behavior,
  checkout/finalization, Count Intake, QR/scan behavior, Accounting Export,
  Tool Catalogue CRUD/archive, Financials/job-cost, Return-to-Inventory,
  buyout, vehicle-bin stock, Express Checkout, Manager Override, and existing
  Inventory behavior were untouched.

### Routing Verdict
No Claude review needed — Safe UI/client-side deliverable app shell pass (ARCHITECTURE v2.18, HANDOFF Entry 090).

---

## Entry 091 - Development Dashboard Visibility Toggle (Milestone 5J.2a)

**Date:** 2026-06-29
**Updated by:** Codex
**Phase:** App shell / development dashboard visibility
**Session type:** implementation

### Context
Milestone 5J.2a is a Safe UI/client-side toggle task under ARCHITECTURE v2.18
and Section 35. Entry 090 moved the app toward the deliverable shell, but Ryan
still needs an easy way to hide the development/status dashboard area and see a
team-facing UI without deleting the development information.

Classification: Safe UI/client-side development dashboard visibility toggle.

### What Was Completed
- Added a header toggle for the development/status dashboard area.
- Toggle labels:
  - visible state: `Hide Dev Dashboard`;
  - hidden state: `Show Dev Dashboard`.
- Added browser-local persistence under `northgate.showDevDashboard`.
- Default visibility remains visible unless localStorage contains `"false"`.
- When hidden, the following development/status area does not render and does
  not take layout space:
  - Dashboard Shell card;
  - Server Permissions card;
  - Supabase Client card;
  - Development Status card;
  - Cart Write Gate / Per-Line Checkout status card.
- When shown again, the same development/status cards render normally.
- Updated the Development Status card values to Milestone 5J.2a / Entry 091 /
  ARCHITECTURE v2.18 / Dev dashboard visibility toggle / build marker
  `a88a558`.

### Toggle / Storage Details
- Toggle location: normal app shell header, next to the primary navigation and
  before the user menu.
- localStorage key: `northgate.showDevDashboard`.
- Stored values:
  - `"true"` when visible;
  - `"false"` when hidden.
- This is a browser preference only and is not a security boundary.
- No backend settings or permission rules were added.

### Selectors / Components Added or Changed
- `src/App.jsx`
  - Added `DEV_DASHBOARD_STORAGE_KEY`.
  - Added `readDevDashboardVisibility()`.
  - Added `writeDevDashboardVisibility(isVisible)`.
  - Added `showDevDashboard` state in `Dashboard`.
  - Added header button `.dev-dashboard-toggle`.
  - Wrapped the development/status dashboard cards in conditional rendering.
- `src/styles.css`
  - Added `.dev-dashboard-toggle`.
  - Added responsive mobile treatment for `.dev-dashboard-toggle`.

### Schema Changes
- None.
- No migrations were added or edited.
- No Supabase schema, RLS, grants, permission flags, RPCs, backend functions,
  storage, indexes, auth, routes, or database behavior changed.

### Code / File Changes
- `src/App.jsx`
  - Updated Development Status values.
  - Added localStorage-backed visibility helpers.
  - Added the Dev Dashboard header toggle.
  - Conditionally renders the dev/status card area.
- `src/styles.css`
  - Added the toggle styling.
- `HANDOFF.md`
  - Appended this Entry 091.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.18.
- HANDOFF remains gapless through Entry 091.

### What Codex Needs to Know
- The dev dashboard is visible by default.
- Hiding it removes the development/status cards from layout flow.
- The preference is per-browser localStorage only.
- The real Inventory module remains visible and usable when the dev dashboard
  is hidden.
- The toggle does not change permissions, auth, data fetching, or module
  behavior.

### What Claude Needs to Know
- This was a Safe UI/client-side toggle task only.
- No behavior, data fetching, write behavior, permissions, schema, RLS,
  backend, auth, Tool Catalogue CRUD/archive, Inventory, Cart, Checkout, Count
  Intake, QR/scan, Accounting Export, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, or existing runtime behavior changed.
- Authenticated browser verification was not completed in this Codex session.

### Verification
- Section 35 start checks:
  - local `main` and `origin/main` both pointed at `a88a558`;
  - `docs/ARCHITECTURE.md` remains v2.18;
  - HANDOFF was current through Entry 090 in the working tree;
  - the working tree already contained uncommitted Entry 089 and Entry 090
    changes from the immediately prior milestones and those changes were
    preserved.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Build completed with Vite's chunk-size warning only.
- Confirmed changed files are UI/client-side only: `src/App.jsx` and
  `src/styles.css`, plus this HANDOFF append.
- Confirmed no migrations were added or edited.
- Confirmed `git diff --name-only -- supabase` is empty.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no auth behavior changed.
- Confirmed no module data/write behavior changed.
- Confirmed no direct `inventory_balances` write path was added.
- Static code review confirmed hiding the dev dashboard removes the status card
  branch from rendering, leaving no placeholder element.
- Static code review confirmed showing the dev dashboard restores the same
  branch.
- Static code review confirmed refresh persistence uses
  `northgate.showDevDashboard`.

### Manual Verification Notes For Ryan
- Open the app and find the Dev Dashboard toggle.
- Hide the dev dashboard.
- Confirm the Inventory Command Center / Development Status dashboard area
  disappears.
- Confirm the page closes the gap and looks like the team-facing UI.
- Refresh and confirm it stays hidden.
- Show it again and confirm the cards return.
- Confirm Inventory, Tool Catalogue, Cart, Count, QR/scan, and Accounting
  Export access still works.

### Next Steps (in order)
1. Visually verify the toggle in normal app use.
2. Refresh once with the dashboard hidden and once with it shown.
3. Decide whether the toggle should remain always visible in the shell or move
   behind a dev-only affordance later.

### Open Questions / Concerns
- Authenticated browser verification was unavailable/not completed in this
  local Codex session.
- Vite still reports the existing chunk-size warning after a successful build.
- The toggle is client-side convenience only and is not a permission/security
  boundary.

### Architecture Drift Warnings
- CLOSED for this milestone: development dashboard visibility toggle.
- No protected runtime behavior changed: schema, RLS, grants, permissions,
  backend behavior, auth, inventory balances, ledger, transaction behavior,
  checkout/finalization, Count Intake, QR/scan behavior, Accounting Export,
  Tool Catalogue CRUD/archive, Financials/job-cost, Return-to-Inventory,
  buyout, vehicle-bin stock, Express Checkout, Manager Override, and existing
  Inventory behavior were untouched.

### Routing Verdict
No Claude review needed — Safe UI/client-side development dashboard visibility toggle (ARCHITECTURE v2.18, HANDOFF Entry 091).

---

## Entry 092 - Workspace Navigation / Dev Dashboard Separation (Milestone 5J.3)

**Date:** 2026-06-29
**Updated by:** Codex
**Phase:** App shell / workspace navigation separation
**Session type:** implementation

### Context
Milestone 5J.3 is a Safe UI/client-side navigation/layout task under
ARCHITECTURE v2.18 and Section 35. Recent work moved the app toward the
deliverable UI shell and added a Dev Dashboard visibility toggle. This pass
separates top-level workspaces from inventory tool navigation and moves
development/status content out of normal Inventory screens.

Classification: Safe UI/client-side navigation/layout task.

### What Was Completed
- Added top-level workspace routing/state through the existing client-side URL
  query model.
- Top nav now represents workspaces/pages:
  - Dashboard;
  - Inventory;
  - Jobs;
  - Estimating;
  - Tools;
  - Employees;
  - Vehicles;
  - Developer.
- Inventory remains the default workspace for normal app entry.
- Inventory left nav remains the tool/view navigation for existing inventory
  tools.
- Added a top-level Tools workspace that renders the existing real Tool
  Catalogue behavior with a Tools workspace sidebar.
- Added clean Coming Soon workspace panels for:
  - Dashboard;
  - Jobs;
  - Estimating;
  - Employees;
  - Vehicles.
- Moved development/status cards into a clearly labeled Developer Dashboard
  workspace.
- Normal Inventory workspace no longer renders the Dashboard Shell, Server
  Permissions, Supabase Client, Development Status, or Cart Write Gate cards
  above the selected tool.
- Updated the Dev Dashboard toggle so:
  - default browser state is hidden unless localStorage contains `"true"`;
  - `Show Dev Dashboard` opens the Developer workspace and shows the
    development/status dashboard;
  - `Hide Dev Dashboard` hides the Developer Dashboard content and persists the
    preference under `northgate.showDevDashboard`;
  - selecting a non-Developer workspace returns to the clean team-facing view.
- Changed visible label `Grand Master` to `Inventory Overview`.
- Updated the Development Status card values to Milestone 5J.3 / Entry 092 /
  ARCHITECTURE v2.18 / Deliverable UI shell / build marker `a88a558`.

### Workspace / Navigation Strategy
- Top nav controls the active workspace using `?workspace=...`.
- Old deep links with `?inventoryTab=...` still resolve to the Inventory
  workspace.
- Inventory tool nav still uses existing `activeTab` state and existing
  `setActiveTab(...)` handlers.
- Tools workspace reuses the existing `ToolCataloguePanel`.
- Coming Soon workspaces are placeholders only and contain no fake workflow
  behavior or mock operational data.

### Selectors / Components Added or Changed
- `src/App.jsx`
  - Added `WORKSPACES`.
  - Added `activeWorkspace` to dashboard route context.
  - Added `ComingSoonWorkspace`.
  - Added `ToolsWorkspace`.
  - Added `DeveloperDashboard`.
  - Reworked top-nav buttons to select workspaces.
  - Reworked normal main content to render only the active workspace.
  - Moved development/status cards into `DeveloperDashboard`.
  - Changed visible `Grand Master` copy to `Inventory Overview`.
- `src/styles.css`
  - Added `.developer-dashboard`.
  - Added `.workspace-placeholder`.

### Schema Changes
- None.
- No migrations were added or edited.
- No Supabase schema, RLS, grants, permission flags, RPCs, backend functions,
  storage, indexes, auth, routes, or database behavior changed.

### Code / File Changes
- `src/App.jsx`
  - Updated Development Status values.
  - Added workspace navigation/rendering.
  - Added Developer Dashboard separation.
  - Added Coming Soon workspace panels.
  - Updated visible `Grand Master` labels to `Inventory Overview`.
- `src/styles.css`
  - Added workspace placeholder and Developer Dashboard layout styling.
- `HANDOFF.md`
  - Appended this Entry 092.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.18.
- HANDOFF remains gapless through Entry 092.

### What Codex Needs to Know
- Top nav now represents workspaces/pages.
- Left nav inside Inventory represents Inventory tools/views.
- Developer/status content should live under the Developer workspace, not above
  normal Inventory tools.
- Inventory remains the default workspace.
- The `grand-master` internal identifier and CSS class remain for stability;
  only user-visible labels changed to `Inventory Overview`.
- This is not a route/security model; it is client-side workspace organization.

### What Claude Needs to Know
- This was a Safe UI/client-side navigation/layout task only.
- No behavior, data fetching, write behavior, permissions, schema, RLS,
  backend, auth, Tool Catalogue CRUD/archive, Inventory, Cart, Checkout, Count
  Intake, QR/scan, Accounting Export, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, or existing runtime behavior changed.
- Authenticated browser verification was not completed in this Codex session.

### Verification
- Section 35 start checks:
  - local `main` and `origin/main` both pointed at `a88a558`;
  - `docs/ARCHITECTURE.md` remains v2.18;
  - HANDOFF was current through Entry 091 in the working tree;
  - the working tree already contained uncommitted Entry 089, Entry 090, and
    Entry 091 changes from the immediately prior milestones and those changes
    were preserved.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Build completed with Vite's chunk-size warning only.
- Confirmed changed files are UI/client-side only: `src/App.jsx` and
  `src/styles.css`, plus this HANDOFF append.
- Confirmed no migrations were added or edited.
- Confirmed `git diff --name-only -- supabase` is empty.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no auth behavior changed.
- Confirmed no module data/write behavior changed.
- Confirmed no direct `inventory_balances` write path was added.
- Static code review confirmed Inventory workspace renders without the
  development/status dashboard branch by default.
- Static code review confirmed Developer workspace renders the development
  dashboard branch when opened from top navigation.
- Static code review confirmed visible `Grand Master` strings were removed from
  `src/App.jsx` and replaced with `Inventory Overview`.
- Static code review confirmed existing Inventory tools remain present in the
  Inventory sidebar.
- Static code review confirmed Tool Catalogue remains reachable from both the
  Inventory sidebar and the top-level Tools workspace.
- Static code review confirmed Coming Soon workspaces render placeholders only.

### Manual Verification Notes For Ryan
- Open app normally.
- Confirm top nav shows workspaces/pages.
- Confirm left nav changes based on active workspace.
- Open Inventory.
- Confirm Inventory Command Center/dev notes do not appear by default.
- Confirm `Inventory Overview` replaces `Grand Master`.
- Navigate Inventory tools from the left nav.
- Confirm selected tool is the only main content visible.
- Open Developer workspace/dashboard.
- Confirm developer/status information is there and clearly labeled.
- Open Coming Soon workspaces and confirm they are clean placeholders.
- Confirm Inventory, Tool Catalogue, Cart, Count, QR/scan, and Accounting
  Export access still works.

### Next Steps (in order)
1. Visually verify workspace navigation on desktop.
2. Check mobile/laptop wrapping for the top nav and Inventory sidebar.
3. Decide whether the top-level Tools workspace should eventually replace or
   simply mirror the Inventory sidebar Tool Catalogue entry.

### Open Questions / Concerns
- Authenticated browser verification was unavailable/not completed in this
  local Codex session.
- Vite still reports the existing chunk-size warning after a successful build.
- Workspace navigation is client-side organization only and is not a
  permission/security boundary.

### Architecture Drift Warnings
- CLOSED for this milestone: workspace navigation and dev dashboard separation.
- No protected runtime behavior changed: schema, RLS, grants, permissions,
  backend behavior, auth, inventory balances, ledger, transaction behavior,
  checkout/finalization, Count Intake, QR/scan behavior, Accounting Export,
  Tool Catalogue CRUD/archive, Financials/job-cost, Return-to-Inventory,
  buyout, vehicle-bin stock, Express Checkout, Manager Override, and existing
  Inventory behavior were untouched.

### Routing Verdict
No Claude review needed — Safe UI/client-side workspace navigation and dev dashboard separation (ARCHITECTURE v2.18, HANDOFF Entry 092).

---

## Entry 093 - Deliverable Shell Styling Global Pass (Milestone 5J.4)

**Date:** 2026-06-29
**Updated by:** Codex
**Phase:** App shell / deliverable UI polish
**Session type:** implementation

### Context
Milestone 5J.4 is a Safe UI/client-side global styling pass under
ARCHITECTURE v2.18 and Section 35. Entry 092 already separated workspaces,
Inventory left navigation, Coming Soon pages, and the Developer Dashboard. This
pass maps the submitted Northgate HQ v2 design CSS direction onto the real app
selectors without replacing live modules with prototype markup or mock data.

Classification: Safe UI/client-side global styling pass.

The pasted milestone brief referenced HANDOFF Entry 091, but the local canonical
HANDOFF was already gapless through Entry 092. This entry was therefore appended
as Entry 093 to preserve the required sequential log.

### What Was Completed
- Applied the Northgate navy/gold/light operations-dashboard visual language to
  the real app shell and shared UI elements.
- Polished top workspace navigation with clearer active state, hover state,
  compact spacing, and responsive wrapping behavior.
- Polished Inventory and Tools left navigation/sidebar surfaces while keeping
  existing tool/view routing intact.
- Updated shared page/content spacing, card borders, shadows, padding, headers,
  badges, buttons, table shells, filter/search rows, mobile item cards, alerts,
  empty states, Coming Soon panels, and Developer Dashboard panels.
- Added scoped table overflow refinements so wide operational tables remain
  contained inside their table wrappers rather than creating intentional
  page-level horizontal scroll.
- Preserved the prior `layoutTuner=1` dev tool and `designPreview=1` Tool
  Catalogue preview behavior.
- Updated the Development Status card values to Milestone 5J.4 / Entry 093 /
  ARCHITECTURE v2.18 / Deliverable UI polish / build marker `4513851`.

### Visual Styling Strategy
- Used the submitted Northgate HQ v2 design CSS as a visual reference.
- Reused existing real selectors and CSS variables instead of pasting broad
  prototype selectors such as `.app`, `.content`, `.card`, `.btn`, or `.badge`
  wholesale.
- Kept styling additive and scoped to the current React app shell and shared
  component classes.
- Preserved live data modules and existing workflow entry points.

### Selectors / Components Added or Changed
- `:root` design tokens:
  - added panel, raised shadow, radius, and focus-ring variables;
  - adjusted content width, gutters, card gap, and dense table sizing defaults.
- Shell / navigation:
  - `.app-shell`;
  - `.app-header`;
  - `.app-header__inner`;
  - `.app-brand`;
  - `.app-top-nav`;
  - `.app-nav-item`;
  - `.dev-dashboard-toggle`;
  - `.app-main`.
- Shared UI:
  - `.card`;
  - `.card__header`;
  - `.card__icon`;
  - `.status-pill`;
  - `.primary-button`;
  - `.secondary-button`;
  - `.secondary-button--danger`;
  - `.empty-state`;
  - `.alert`.
- Workspace/module surfaces:
  - `.inventory-module-card`;
  - `.inventory-module-shell`;
  - `.module-sidebar`;
  - `.module-tab`;
  - `.module-content`;
  - `.workspace-placeholder`;
  - `.developer-dashboard`;
  - `.developer-dashboard-hidden`;
  - `.development-status-card`;
  - `.development-status-grid`.
- Inventory / Tool Catalogue shared surfaces:
  - `.cart-panel`;
  - `.tool-catalogue`;
  - `.tool-catalogue__list-panel`;
  - `.tool-catalogue__form-panel`;
  - `.tool-toolbar`;
  - `.tool-form`;
  - `.count-section-header`;
  - `.count-toolbar`;
  - `.history-toolbar`;
  - `.cart-apply-all`;
  - `.count-correction-form`;
  - `.count-intake-form`;
  - `.table-wrap`;
  - `.data-table`;
  - `.tool-table`;
  - `.grand-master-table`;
  - `.history-table`;
  - `.accounting-export-table`;
  - `.mobile-list` and module-specific mobile lists.
- Responsive breakpoints:
  - added a 1200px shell/dashboard breakpoint;
  - expanded existing 900px and 640px responsive behavior.

### Schema Changes
- None.
- No migrations were added or edited.
- No Supabase schema, RLS, grants, permission flags, RPCs, backend functions,
  storage, indexes, auth, routes, or database behavior changed.

### Code / File Changes
- `src/App.jsx`
  - Updated Development Status metadata only.
- `src/styles.css`
  - Added and adjusted deliverable shell, navigation, sidebar, shared card,
    button, badge, form, table, panel, Tool Catalogue, Inventory, Developer
    Dashboard, Coming Soon, and responsive styling.
- `HANDOFF.md`
  - Appended this Entry 093.

### Lock Document Changes
- None.
- ARCHITECTURE remains v2.18.
- HANDOFF remains gapless through Entry 093.

### What Codex Needs to Know
- This was a styling/layout consistency pass only.
- Normal team-facing workspaces remain clean; Developer Dashboard content stays
  inside the Developer workspace.
- Tool Catalogue behavior remains the real `ToolCataloguePanel`; no reserved
  Tool Catalogue features were added.
- Inventory Overview, Count, Cart/Checkout, QR/scan, and Accounting Export
  behavior were not altered.
- The prior `designPreview=1` and `layoutTuner=1` flags remain intact.

### What Claude Needs to Know
- This was a Safe UI/client-side styling task only.
- No architecture decision was made or changed.
- No behavior, data fetching, write behavior, permissions, schema, RLS,
  backend, auth, Tool Catalogue CRUD/archive, Inventory, Cart, Checkout, Count
  Intake, QR/scan, Accounting Export, Financials/job-cost,
  Return-to-Inventory, buyout, vehicle-bin stock, Express Checkout, Manager
  Override, or existing runtime behavior changed.
- Authenticated browser verification was not completed in this Codex session.

### Verification
- Section 35 start checks:
  - working tree was clean before changes;
  - `docs/ARCHITECTURE.md` remains v2.18;
  - HANDOFF was current through Entry 092 in the working tree;
  - task classified as Safe UI/client-side global styling pass.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Build completed with Vite's chunk-size warning only.
- Confirmed changed files are UI/client-side only: `src/App.jsx` and
  `src/styles.css`, plus this HANDOFF append.
- Confirmed `git diff --name-only -- supabase` is empty.
- Confirmed no migrations were added or edited.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no auth behavior changed.
- Confirmed no module data/write behavior changed.
- Confirmed no direct `inventory_balances` write path was added.
- Static code review confirmed existing workspaces remain represented in the
  top navigation.
- Static code review confirmed existing Inventory tools remain represented in
  the Inventory sidebar.
- Static code review confirmed Tool Catalogue remains reachable through the
  current UI and still uses the existing real component.
- Static code review confirmed Developer Dashboard remains separate from normal
  workspaces.
- Static code review confirmed Coming Soon pages remain placeholder panels only.
- Static code review confirmed no prototype/mock data replaced real app data.
- Authenticated browser verification was unavailable/not completed, so no
  visual browser verification is claimed.

### Manual Verification Notes For Ryan
- Open app normally.
- Confirm top nav looks polished and active workspace is clear.
- Confirm left nav looks polished and active tool is clear.
- Confirm normal workspaces do not show dev notes by default.
- Confirm Developer Dashboard still shows development/status information.
- Confirm Coming Soon pages look intentional.
- Confirm Inventory Overview, Count, Cart/Checkout, QR/scan, and Accounting
  Export remain accessible.
- Confirm Tool Catalogue remains accessible and add/edit/archive behavior still
  works.
- Confirm no page-level horizontal scrolling.
- Confirm no overlapping UI.
- Confirm mobile/tablet widths remain usable.

### Next Steps (in order)
1. Perform authenticated visual QA on desktop, tablet, and mobile widths.
2. Check the widest Tool Catalogue, Inventory Overview, and Accounting Export
   tables with real data to confirm overflow stays scoped to the table wrapper.
3. Decide whether the top-level Tools workspace should eventually replace or
   simply mirror the Inventory sidebar Tool Catalogue entry.

### Open Questions / Concerns
- Authenticated browser verification was unavailable/not completed in this
  local Codex session.
- Vite still reports the existing chunk-size warning after a successful build.
- The milestone brief's requested handoff/routing entry number was stale
  relative to the local canonical HANDOFF; this entry preserves the gapless log
  as Entry 093.

### Architecture Drift Warnings
- CLOSED for this milestone: deliverable shell styling global pass.
- No protected runtime behavior changed: schema, RLS, grants, permissions,
  backend behavior, auth, inventory balances, ledger, transaction behavior,
  checkout/finalization, Count Intake, QR/scan behavior, Accounting Export,
  Tool Catalogue CRUD/archive, Financials/job-cost, Return-to-Inventory,
  buyout, vehicle-bin stock, Express Checkout, Manager Override, and existing
  Inventory behavior were untouched.

### Routing Verdict
No Claude review needed — Safe UI/client-side deliverable shell styling pass (ARCHITECTURE v2.18, HANDOFF Entry 093).

---

## Entry 094 - Job Material Workflow architecture locked (ARCHITECTURE v2.19, new Section 37)

**Date:** 2026-06-29
**Updated by:** Codex
**Phase:** Milestone 5K.1 - Job Material Workflow architecture lock adoption
**Session type:** alignment

### Context
Milestone 5K.1 is a docs-only architecture lock adoption. Ryan provided the
Claude-reviewed and ChatGPT cross-cleared Job Material Workflow architecture
text and instructed Codex to apply it to the canonical repo documents only.

Classification: docs-only architecture lock adoption already Claude-reviewed
and ChatGPT cross-cleared.

### What Was Completed
- Updated `docs/ARCHITECTURE.md` from v2.18 to v2.19.
- Added new Section 37: Job Material Workflow — Demand, Issue, Buyout, Return.
- Locked the Job Material Workflow domain for future gated implementation
  slices.
- Locked demand layer vs movement layer separation:
  - Job Material List / `job_materials` is demand/planning only;
  - it never writes balances;
  - it never creates transactions;
  - fulfillment is derived from the ledger.
- Locked Issue to Job as an Assign to Job movement through the existing
  Inventory Cart / Checkout engine only.
- Locked that no parallel job stock movement write path is permitted.
- Locked Buyout as derived and demand-side:
  - requested minus net issued per line;
  - status is demand/procurement state;
  - no inventory movement;
  - no ledger row;
  - no auto-post to Financials.
- Locked Return-to-Inventory as future 5K.5 scope via a Return-from-Job inbound
  RPC.
- Locked the future Return-from-Job RPC gate on `can_inventory_transactions`.
- Locked that the future Return-from-Job RPC follows the existing Section 11
  checkout RPC pattern and never writes `inventory_balances` directly.
- Locked that no new transaction types are introduced.
- Locked that reservations are not part of the 5K series.
- Locked that "Allocation" is reserved for a future reservation concept and
  must not be used for movement terminology.
- Locked the `jobs` table as a hard prerequisite before any 5K implementation
  slice.
- Locked that Jobs foundation is Bucket 3 / Architecture-sensitive and requires
  its own Claude review before Codex implementation.
- Locked the milestone sequence:
  5K.1 → Jobs foundation → 5K.2 → 5K.3 → 5K.4 → 5K.5.
- No code, schema, RPC, RLS, permission, backend, balance, checkout,
  transaction, UI, or runtime behavior was implemented.

### Schema Changes
- None applied.
- Section 37 reserves future schema slices but does not create migrations.
- No migrations were added or edited.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated version line to v2.19.
  - Added new Section 37 after Section 36.
- `HANDOFF.md`
  - Appended this Entry 094.

### Lock Document Changes
- ARCHITECTURE advanced from v2.18 to v2.19.
- New Section 37 locks the Job Material Workflow architecture:
  - demand/movement layer separation;
  - Job Material List as demand/planning only;
  - Issue to Job through existing Cart / Checkout only;
  - Buyout as derived demand-side state;
  - Return-to-Inventory as future 5K.5 via Return-from-Job inbound RPC;
  - no new transaction types;
  - no reservations / no "Allocation" movement terminology;
  - Jobs table prerequisite;
  - Jobs foundation requires its own Claude review;
  - 5K milestone sequence.
- HANDOFF remains gapless through Entry 094.

### What Codex Needs to Know
- 5K.1 is docs-only. Do not treat it as implementation permission.
- Future Jobs foundation must go to Claude as its own Bucket 3 review before
  Codex implementation.
- No 5K implementation slice may proceed unless the slice is Claude-reviewed or
  Section 37 already locks the exact shape and the work implements that shape
  without changing protected behavior.
- Job Material List is demand/planning only and cannot write balances or ledger
  rows.
- Issue to Job must go through the existing Inventory Cart / Checkout engine.
- Buyout is derived/demand-side and cannot auto-post to Financials.
- Return-to-Inventory is future 5K.5 and requires a new inbound RPC reviewed at
  that milestone.

### What Claude Needs to Know
- Codex applied the Claude-reviewed / ChatGPT cross-cleared lock text as a
  docs-only adoption.
- No implementation occurred.
- No schema, RLS, grant, permission, backend, balance, checkout, transaction,
  UI, auth, Jobs, Job Material List, Issue to Job, Buyout, or
  Return-to-Inventory behavior changed.

### Verification
- Section 35 start checks:
  - `git pull --ff-only origin main` completed and reported already up to date;
  - working tree was clean before changes;
  - `docs/ARCHITECTURE.md` was v2.18 with Section 36 as the last section;
  - HANDOFF was gapless through Entry 093;
  - task classified as docs-only architecture lock adoption already
    Claude-reviewed and ChatGPT cross-cleared.
- Confirmed `docs/ARCHITECTURE.md` is updated to v2.19.
- Confirmed new Section 37 is added after Section 36.
- Confirmed HANDOFF Entry 094 is appended.
- `git diff --check` passed.
- Build was skipped because this task changed documentation only and no app-code
  files changed.
- Confirmed changed files are docs-only:
  - `docs/ARCHITECTURE.md`;
  - `HANDOFF.md`.
- Confirmed no migrations were added or edited.
- Confirmed no `src` files changed.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no implementation of Jobs, Job Material List, Issue to Job, Buyout,
  or Return-to-Inventory occurred.

### Next Steps (in order)
1. Route Jobs foundation to Claude as its own Bucket 3 review before Codex
   implementation.
2. After Jobs foundation is reviewed and implemented, proceed only through the
   locked 5K sequence:
   5K.2 → 5K.3 → 5K.4 → 5K.5.
3. Keep each 5K implementation slice scoped to the reviewed slice and verify
   no protected behavior changes outside that slice.

### Open Questions / Concerns
- None for this docs-only adoption.
- Future Jobs foundation is explicitly not cleared by this entry for Codex
  implementation; it requires its own Claude review.

### Architecture Drift Warnings
- CLOSED for this milestone: Job Material Workflow architecture lock adoption.
- No runtime/protected behavior changed: schema, RLS, grants, permissions,
  backend behavior, auth, inventory balances, ledger, transaction behavior,
  checkout/finalization, Count Intake, QR/scan behavior, Accounting Export,
  Jobs, Job Material List, Issue to Job, Buyout, Return-to-Inventory, Tool
  Catalogue behavior, Financials/job-cost, vehicle-bin stock, Express Checkout,
  Manager Override, and existing Inventory behavior were untouched.

### Routing Verdict
No Claude review needed — docs-only architecture lock adoption already Claude-reviewed and ChatGPT cross-cleared (ARCHITECTURE v2.19, HANDOFF Entry 094).

---

## Entry 095 - Jobs Foundation locked (ARCHITECTURE v2.20, new Section 38)

**Date:** 2026-06-29
**Updated by:** Codex
**Phase:** Jobs Foundation architecture lock adoption
**Session type:** alignment

### Context
This milestone is a docs-only architecture lock adoption. Ryan provided the
Claude-reviewed and ChatGPT cross-cleared Jobs Foundation architecture lock and
instructed Codex to apply it to the canonical repo documents only.

Jobs Foundation is the prerequisite after Section 37 / Milestone 5K.1. It locks
the minimal `jobs` table and first Jobs workspace scope required before future
Job Material Workflow implementation slices.

Classification: docs-only Jobs Foundation architecture lock adoption already
Claude-reviewed and ChatGPT cross-cleared.

### What Was Completed
- Updated `docs/ARCHITECTURE.md` from v2.19 to v2.20.
- Added new Section 38: Jobs Foundation.
- Added a Section 5 cross-reference note pointing Jobs implementation details
  to Section 38.
- Locked the `jobs` table shape.
- Locked `division text not null` as the division-scoping convention.
- Locked `job_type` and `service_call_number` as included from day one per
  Section 5b.
- Locked `status` values:
  - `active`;
  - `on_hold`;
  - `complete`;
  - `cancelled`.
- Locked that `archived` is not a status value.
- Locked `job_number` as nullable and unique-when-non-null through a partial
  unique index.
- Locked soft archive only; no hard delete and no DELETE policy.
- Locked read permission as own division or `can_view_all_divisions`.
- Locked create permission as `can_create_jobs`.
- Locked edit/archive permission as `can_manage_jobs`.
- Locked that no new permission flags are introduced.
- Locked future Jobs workspace UI scope:
  - Jobs workspace/page;
  - list/table;
  - search/filter;
  - create/edit forms;
  - archive action;
  - detail/read view;
  - empty state;
  - status badge/display;
  - job type display.
- Locked reserved scope outside Jobs Foundation:
  - material workflow;
  - `job_materials`;
  - Issue to Job;
  - Buyout;
  - Return-to-Inventory;
  - QR/job tote labels;
  - phases/schedule;
  - employee assignments;
  - documents/photos;
  - financials;
  - estimates/contracts;
  - financial exports.
- No code, schema, RPC, RLS, permission, backend, balance, checkout,
  transaction, UI, or runtime behavior was implemented.

### Schema Changes
- None applied.
- Section 38 locks future Jobs Foundation schema shape but does not create a
  migration.
- No migrations were added or edited.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated version line to v2.20.
  - Added Section 5 cross-reference note to Section 38.
  - Added new Section 38 after Section 37.
- `HANDOFF.md`
  - Appended this Entry 095.

### Lock Document Changes
- ARCHITECTURE advanced from v2.19 to v2.20.
- New Section 38 locks Jobs Foundation:
  - `jobs` table foundation;
  - status and job type values;
  - `job_number` partial unique index;
  - `set_jobs_updated_at` trigger using the existing
    `touch_user_permissions_updated_at()` function;
  - RLS/permissions;
  - permitted first UI;
  - reserved features.
- Section 5 now points to Section 38 for Jobs implementation details.
- HANDOFF remains gapless through Entry 095.

### What Codex Needs to Know
- This entry is docs-only and does not implement Jobs Foundation.
- After Ryan commits v2.20 / Entry 095, Codex may implement Jobs Foundation
  migration and UI within the locked decisions, provided preflight confirms
  `can_create_jobs` and `can_manage_jobs` exist in the live schema.
- Jobs Foundation implementation must not include material workflow,
  `job_materials`, Issue to Job, Buyout, Return-to-Inventory, QR/job tote
  labels, phases, assignments, documents, financials, estimates/contracts, or
  financial exports.
- `archived` is not a job status. Archive via `archived_at`, `archived_by`, and
  `archive_reason`.

### What Claude Needs to Know
- Codex applied the Claude-reviewed / ChatGPT cross-cleared Jobs Foundation lock
  as a docs-only adoption.
- No implementation occurred.
- No schema, RLS, grant, permission, backend, balance, checkout, transaction,
  UI, auth, Jobs runtime, Job Material Workflow, Buyout, Return-to-Inventory,
  QR, assignments, documents, or financial behavior changed.

### Verification
- Section 35 start checks:
  - `git pull --ff-only origin main` completed and reported already up to date;
  - working tree was clean before changes;
  - `docs/ARCHITECTURE.md` was v2.19 with Section 37 canonical;
  - HANDOFF was gapless through Entry 094;
  - task classified as docs-only Jobs Foundation architecture lock adoption
    already Claude-reviewed and ChatGPT cross-cleared.
- Confirmed `docs/ARCHITECTURE.md` is updated to v2.20.
- Confirmed Section 38 is added after Section 37.
- Confirmed Section 5 cross-reference note is added.
- Confirmed HANDOFF Entry 095 is appended.
- `git diff --check` passed.
- Build was skipped because this task changed documentation only and no app-code
  files changed.
- Confirmed changed files are docs-only:
  - `docs/ARCHITECTURE.md`;
  - `HANDOFF.md`.
- Confirmed no migrations were added or edited.
- Confirmed no `src` files changed.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no implementation of Jobs Foundation occurred yet.

### Next Steps (in order)
1. Ryan commits v2.20 / Entry 095.
2. Codex may then implement Jobs Foundation migration and UI within the locked
   decisions, provided preflight confirms `can_create_jobs` and
   `can_manage_jobs` exist in the live schema.
3. Keep any future Jobs Foundation implementation strictly inside Section 38.

### Open Questions / Concerns
- None for this docs-only adoption.
- Future implementation must preflight-confirm `can_create_jobs` and
  `can_manage_jobs` before writing migration/RLS.

### Architecture Drift Warnings
- CLOSED for this milestone: Jobs Foundation architecture lock adoption.
- No runtime/protected behavior changed: schema, RLS, grants, permissions,
  backend behavior, auth, inventory balances, ledger, transaction behavior,
  checkout/finalization, Count Intake, QR/scan behavior, Accounting Export,
  Jobs runtime, Job Material Workflow, Buyout, Return-to-Inventory, Tool
  Catalogue behavior, Financials/job-cost, vehicle-bin stock, Express Checkout,
  Manager Override, and existing Inventory behavior were untouched.

### Routing Verdict
No Claude review needed — docs-only Jobs Foundation architecture lock adoption already Claude-reviewed and ChatGPT cross-cleared (ARCHITECTURE v2.20, HANDOFF Entry 095).

---

## Entry 096 - Jobs Foundation implemented

**Date:** 2026-06-29
**Updated by:** Codex
**Phase:** Jobs Foundation
**Session type:** implementation

### Context
Ryan instructed Codex to implement only the locked Jobs Foundation scope from
ARCHITECTURE v2.20 Section 38. The design was already Claude-reviewed and
ChatGPT-cross-cleared, so Codex did not reclassify or expand the milestone.

This implementation follows the Section 38 sequence:
1. Add the `public.jobs` migration.
2. Add the Jobs workspace UI.

### What Was Completed
- Added Jobs Foundation migration under `supabase/migrations`.
- Created `public.jobs` with `division TEXT NOT NULL` using the existing app
  division convention.
- Included `job_type` and `service_call_number` from day one.
- Locked `status` to:
  - `active`;
  - `on_hold`;
  - `complete`;
  - `cancelled`.
- Preserved the Section 38 rule that `archived` is not a status value.
- Added nullable `job_number` with a partial unique index.
- Added `updated_at` maintenance through the existing
  `touch_user_permissions_updated_at()` trigger function.
- Enabled RLS and added:
  - `jobs_read`;
  - `jobs_insert`;
  - `jobs_update`.
- Did not add a DELETE policy or DELETE grant.
- Added the Jobs workspace UI in the deliverable shell.
- Added list, search, status filter, division filter for authorized
  cross-division users, create form, edit form, archive action, detail/read
  view, status badge display, job type display, empty state, loading state, and
  error state.
- Added the locked helper copy that reserves material workflow and future job
  management features.

### Schema Changes
- Added `supabase/migrations/202606290001_jobs_foundation.sql`.
- `public.jobs` fields include the Section 38 foundation columns only.
- RLS read scope:
  - active non-archived jobs;
  - own division;
  - or `can_view_all_divisions`.
- RLS insert scope:
  - own division only;
  - gated by `can_create_jobs`.
- RLS update scope:
  - own division only;
  - gated by `can_manage_jobs`;
  - used for edit and soft archive.
- Soft archive uses `archived_at`, `archived_by`, and `archive_reason`.
- No hard delete path was introduced.

### UI Changes
- Added `JobsWorkspace` to `src/App.jsx`.
- Replaced the Jobs coming-soon placeholder with the active Jobs workspace.
- Jobs create uses the authenticated user's current division and does not allow
  arbitrary division entry.
- Jobs edit/archive controls are shown only when the row is in the user's own
  division and the user has `can_manage_jobs`.
- Jobs create controls are shown only with `can_create_jobs`.
- The UI reads/writes only approved Jobs Foundation fields.
- Added a `.jobs-table` width rule in `src/styles.css`.
- Updated the Development Status panel to mark Jobs Foundation / Entry 096.

### Explicitly Not Implemented
- No `job_materials`.
- No Issue to Job.
- No Buyout.
- No Return-to-Inventory.
- No QR labels or job tote labels.
- No phases or schedule.
- No employee assignments.
- No documents/photos.
- No financials, estimates/contracts, accounting, cost, or financial exports.
- No customer/client CRM features.
- No inventory balance behavior changes.
- No checkout, cart, count, QR/scan, Accounting Export, Tool Catalogue, vehicle,
  bin, or ledger behavior changes.

### Code / File Changes
- `supabase/migrations/202606290001_jobs_foundation.sql`
  - Added Jobs Foundation table, index, trigger, RLS policies, revokes, and
    grants.
- `src/App.jsx`
  - Added Jobs workspace data loading, filters, forms, detail view, and archive
    behavior.
- `src/styles.css`
  - Added Jobs table layout support.
- `HANDOFF.md`
  - Appended this Entry 096.

### Preflight / Existing Lock Confirmation
- Confirmed ARCHITECTURE is v2.20 with Section 38 canonical.
- Confirmed Section 37 remains the Job Material Workflow lock and was not
  implemented.
- Confirmed HANDOFF was gapless through Entry 095 before this append.
- Confirmed existing repo migrations define
  `touch_user_permissions_updated_at()`.
- Confirmed existing repo migrations define `user_permissions` with
  `clerk_user_id`, `division`, `role`, `permission_overrides`, and `is_active`.
- Confirmed existing repo migrations define
  `effective_permissions_for_user(p_role TEXT, p_division TEXT,
  p_permission_overrides JSONB)`.
- Confirmed `can_create_jobs` and `can_manage_jobs` are present in the repo's
  canonical permission defaults/effective permission model.
- Live Supabase schema was not queried in this local session; the migration was
  added to the repo and still needs to be applied through the project's normal
  Supabase migration/deploy process.

### Verification
- `git pull --ff-only origin main` completed and reported already up to date
  before implementation.
- Working tree was clean before implementation.
- `git diff --check` passed before this handoff append.
- `npm.cmd run build` passed.
- Static scan confirmed the new Jobs migration does not include
  `inventory_balances`, `job_materials`, or DELETE behavior.
- Static scan confirmed Jobs UI changes are limited to the locked Jobs
  Foundation workspace and required helper copy.
- Authenticated browser verification was not performed in this local session.
- Live Supabase migration application was not performed in this local session.

### Next Steps
1. Apply `202606290001_jobs_foundation.sql` through the normal Supabase
   migration path.
2. Verify the Jobs workspace with an authenticated user that has
   `can_create_jobs` and/or `can_manage_jobs`.
3. Continue future Job Material Workflow slices only after the Jobs Foundation
   migration is live.

### Open Questions / Concerns
- No architecture blocker found.
- Runtime Jobs UI depends on the new `public.jobs` table existing in Supabase.

### Architecture Drift Warnings
- CLOSED for this milestone: Jobs Foundation migration and workspace UI.
- Protected behavior remained unchanged: inventory balances, ledger,
  transactions, checkout/finalization, Count Intake, QR/scan, Accounting
  Export, Tool Catalogue, financial/job-cost behavior, vehicle-bin stock,
  Express Checkout, Manager Override, and existing Inventory behavior were not
  changed.
- Reserved Jobs and Job Material Workflow scope remained unimplemented except
  for the locked helper copy naming future reserved areas.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.20, HANDOFF Entry 096).

---

## Entry 097 - Job Material List locked (ARCHITECTURE v2.21, new Section 39)

**Date:** 2026-06-30
**Updated by:** Codex
**Phase:** Job Material List / architecture lock adoption
**Session type:** implementation

### Context
Jobs Foundation is implemented and live. Ryan instructed Codex to adopt the
Claude-reviewed and ChatGPT cross-cleared Job Material List architecture lock.

This is a docs-only architecture adoption. No code, schema, migration, RPC, RLS,
permission, backend, balance, checkout, transaction, UI, or runtime behavior was
implemented in this pass.

### What Was Completed
- Advanced ARCHITECTURE from v2.20 to v2.21.
- Added new `## 39. Job Material List (locked v2.21 — Entry 097)`.
- Locked Job Material List as the Section 37 demand layer.
- Locked `job_materials` as planning-only demand:
  - never writes `inventory_balances`;
  - never creates ledger transactions;
  - never reserves stock;
  - stores no fulfillment counter;
  - fulfillment remains derived later from ledger activity.
- Locked the `job_materials` table shape:
  - `job_id uuid not null references public.jobs(id)`;
  - `division text not null`;
  - `requested_quantity numeric not null check (requested_quantity > 0)`;
  - soft-archive fields;
  - `item_id` references the existing catalog `items` table;
  - exact `items` primary key column/type must be confirmed by Codex preflight
    before migration;
  - optional display-only `material_name_snapshot` and
    `material_code_snapshot`;
  - `created_by text null`.
- Explicitly excluded fulfillment/procurement/accounting/transaction fields:
  - no `issued_quantity`;
  - no `fulfilled_quantity`;
  - no `remaining_quantity`;
  - no `reserved_quantity`;
  - no `allocated_quantity`;
  - no `buyout_quantity`;
  - no `purchased_quantity`;
  - no `procurement_status`;
  - no `purchase_order_id`;
  - no `cost`;
  - no `vendor`;
  - no `checkout_transaction_id`;
  - no `return_transaction_id`;
  - no `line_number`;
  - no `unit_of_measure`;
  - no `source_note`.
- Locked read permission to own division or `can_view_all_divisions`.
- Locked write permission for insert/edit/archive to `can_manage_jobs`.
- Locked that Job Material List must not use `can_manage_inventory` as its
  table write gate.
- Aligned the Section 37 Job Material Workflow permission placeholder to point
  to Section 39 and `can_manage_jobs`.
- Locked no new permission flags and no hard delete / DELETE policy.
- Locked first UI scope:
  - lives inside Jobs workspace on the job detail view;
  - not Inventory workspace;
  - not a new top-level workspace;
  - add material lines from existing catalog items only;
  - edit requested quantity and note;
  - soft archive/remove line;
  - search/filter material lines;
  - empty/loading/error states;
  - display-only requested quantity count/sum;
  - no fulfillment/issued/remaining/buyout language;
  - "Issue to Job" affordance may appear disabled/coming soon only and must not
    be wired.
- Locked helper copy:
  `Job Material List is planning only. It records what the job needs; it does not reserve stock, issue inventory, create transactions, or update balances. Issue to Job, Buyout, and Return-to-Inventory are reserved for future milestones.`
- Appended this HANDOFF Entry 097.

### Schema Changes
- None.
- No migrations, schema changes, Supabase tables, RPCs, storage buckets, RLS
  policies, grants, permission flags, backend handlers, database indexes, or
  backend action services were added or changed.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated the version line from v2.20 to v2.21.
  - Added new Section 39 after Section 38.
  - Aligned the Section 37 Job Material List permission note with Section 39.
- `HANDOFF.md`
  - Appended this Entry 097.
- No source app code, styles, migrations, Supabase files, package files,
  backend/RPC files, auth files, or runtime behavior files were changed.

### Lock Document Changes
- ARCHITECTURE advanced from v2.20 to v2.21.
- Section 39 is now canonical for Job Material List.
- HANDOFF remains gapless through Entry 097.

### What Codex Needs to Know
- After Ryan commits v2.21 / Entry 097, Codex may implement Job Material List
  migration and UI within the locked decisions, provided preflight confirms the
  catalog `items` table primary key column/type.
- Job Material List is demand/planning only.
- It must not implement Issue to Job, Buyout, Return-to-Inventory,
  cart/checkout, transaction, balance, QR, accounting, or job-cost behavior.
- Write permission is `can_manage_jobs`, not `can_manage_inventory`.
- The UI belongs inside Jobs workspace on the job detail view.

### What Claude Needs to Know
- Claude reviewed the Job Material List architecture lock before this adoption.
- ChatGPT cross-cleared the lock.
- No implementation occurred in this pass.

### Next Steps (in order)
1. Ryan commits v2.21 / Entry 097.
2. Codex may implement Job Material List migration and UI within locked
   decisions after preflight confirms the catalog `items` table primary key
   column/type.
3. Keep Issue to Job, Buyout, and Return-to-Inventory reserved for 5K.3, 5K.4,
   and 5K.5 respectively.

### Open Questions / Concerns
- None for this docs-only adoption.
- Future implementation must preflight-confirm the existing catalog `items`
  table primary key column/type before writing the `job_materials.item_id`
  foreign key.

### Architecture Drift Warnings
- CLOSED for this milestone: Job Material List architecture lock adoption.
- No runtime/protected behavior changed: schema, RLS, grants, permissions,
  backend behavior, auth, inventory balances, ledger, transaction behavior,
  checkout/finalization, Count Intake, QR/scan behavior, Accounting Export,
  Jobs runtime, Job Material Workflow runtime, Issue to Job, Buyout,
  Return-to-Inventory, Tool Catalogue behavior, Financials/job-cost,
  vehicle-bin stock, Express Checkout, Manager Override, and existing Inventory
  behavior were untouched.

### Routing Verdict
No Claude review needed — docs-only Job Material List architecture lock adoption already Claude-reviewed and ChatGPT cross-cleared (ARCHITECTURE v2.21, HANDOFF Entry 097).

---

## Entry 098 - Job Material List implemented

**Date:** 2026-06-30
**Updated by:** Codex
**Phase:** Job Material List / migration foundation + Jobs detail UI
**Session type:** implementation

### Context
Ryan instructed Codex to implement Milestone 5K.2 within locked ARCHITECTURE
v2.21 Section 39. Classification was provided as Bucket 3 / architecture-
sensitive implementation, already Claude-reviewed and ChatGPT cross-cleared;
Codex did not reclassify.

### Preflight Confirmed Before Implementation
- Working tree was clean before implementation.
- `items.id` is the catalog primary key and is `UUID`.
- `public.jobs(id)` exists and is `UUID`.
- `touch_user_permissions_updated_at()` exists.
- `user_permissions` contains `clerk_user_id`, `division`, `role`, and
  `permission_overrides`.
- `effective_permissions_for_user(role, division, permission_overrides)`
  exists.
- `can_manage_jobs` exists in the permission model.
- Division convention is `text`; no `division_id` was introduced.
- No existing `public.job_materials` table was found.

### What Was Completed
- Added the Job Material List migration foundation.
- Added Job Material List UI inside the existing Jobs workspace job detail
  view.
- Added create, edit, refresh, search/filter, and soft archive/remove flows
  for planning material rows.
- Added empty, loading, error, and success states.
- Added requested-line count and requested-quantity sum display.
- Included the locked helper copy exactly:
  `Job Material List is planning only. It records what the job needs; it does not reserve stock, issue inventory, create transactions, or update balances. Issue to Job, Buyout, and Return-to-Inventory are reserved for future milestones.`
- Updated Development Status to:
  - Most recent: `Milestone 5K.2 - Job Material List`
  - Handoff Entry 098
  - Architecture v2.21
  - Current step: `Job Material List`
  - Build marker: current short commit `7be81b5`

### Schema Changes
- Added one migration:
  `supabase/migrations/202606300001_job_materials_foundation.sql`.
- Created `public.job_materials` with:
  - `id uuid primary key default gen_random_uuid()`;
  - `job_id uuid not null references public.jobs(id)`;
  - `division text not null`;
  - `created_at timestamptz not null default now()`;
  - `updated_at timestamptz not null default now()`;
  - soft archive fields: `archived_at`, `archived_by`, `archive_reason`;
  - `item_id uuid not null references public.items(id)`;
  - `requested_quantity numeric not null check (requested_quantity > 0)`;
  - `note text null`;
  - display-only snapshots: `material_name_snapshot`,
    `material_code_snapshot`;
  - `created_by text null`.
- Added trigger `set_job_materials_updated_at` using the existing
  `touch_user_permissions_updated_at()` function.
- Enabled RLS.
- Added policies:
  - `job_materials_read`: active rows only, own division or
    `can_view_all_divisions`;
  - `job_materials_insert`: own division and `can_manage_jobs`;
  - `job_materials_update`: active row, own division, and `can_manage_jobs`.
- Granted only `SELECT`, `INSERT`, and `UPDATE` to `authenticated`.
- Added no DELETE policy and no DELETE grant.

### UI / Code Changes
- `src/App.jsx`
  - Added Job Material List constants and helpers.
  - Added job material and catalog item Supabase reads.
  - Added insert/update soft-archive handlers.
  - Added material search/select from existing active, non-archived catalog
    items in the selected job division.
  - Added requested quantity and note create/edit UI.
  - Added line search/filter, table/mobile rendering, and refresh.
  - Preserved selected Jobs workspace and job detail behavior.
- `src/styles.css`
  - Added responsive Job Material List form/table styling.

### Preserved / Not Implemented
- Count Loaded Stock behavior unchanged.
- Selected Path count behavior unchanged.
- Count Intake submission/write behavior unchanged.
- Authorization behavior outside the new `job_materials` RLS unchanged.
- Inventory balances were not touched.
- No inventory ledger, transaction, checkout, cart, issue, buyout, return,
  reservation, allocation, fulfillment, financial, QR, accounting, or job-cost
  behavior was implemented.
- No new permission flags were added.
- No `can_manage_inventory` gate was used for Job Material List writes.
- No hard delete was added.
- Tool Catalogue behavior was unchanged.

### Verification
- `git diff --check` passed before and after this handoff append.
- `npm.cmd run build` passed.
- Static scan confirmed the migration has no prohibited Job Material List
  columns, no `division_id`, no inventory balance reference, no DELETE policy,
  and no DELETE grant.
- Static scan confirmed the expected migration anchors:
  `public.job_materials`, `public.jobs(id)`, `public.items(id)`,
  `division TEXT NOT NULL`, `set_job_materials_updated_at`,
  `job_materials_read`, `job_materials_insert`, `job_materials_update`, and
  `GRANT SELECT, INSERT, UPDATE`.
- Changed files are limited to the new migration, `src/App.jsx`,
  `src/styles.css`, and this `HANDOFF.md` append.
- No existing migrations were edited.
- Authenticated browser verification was not performed in this local session.
- Live Supabase migration application was not performed in this local session.

### Next Steps
1. Apply `202606300001_job_materials_foundation.sql` through the normal
   Supabase migration path.
2. Verify the Jobs workspace with an authenticated user that has
   `can_manage_jobs`.
3. Create, edit, and soft archive one Job Material List row from the job detail
   view after the migration is live.

### Open Questions / Concerns
- No architecture blocker found.
- Runtime Job Material List UI depends on the new `public.job_materials` table
  being applied in Supabase.

### Architecture Drift Warnings
- CLOSED for this milestone: Job Material List migration foundation and Jobs
  detail UI.
- Reserved future behavior remains unimplemented: Issue to Job, Buyout,
  Return-to-Inventory, cart/checkout, inventory transactions, balance writes,
  fulfillment counters, procurement, financials, job costing, QR, and
  accounting behavior.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.21, HANDOFF Entry 098).

---

## Entry 099 - Job Material List UI containment fix

**Date:** 2026-06-30
**Updated by:** Codex
**Phase:** Job Material List / UI containment bugfix
**Session type:** implementation

### Context
Ryan reported that the Job Material List form overflowed horizontally from the
visible card/container, blocking live app testing after opening a job detail.
This was classified as a safe UI/CSS containment bugfix.

### What Was Completed
- Added a Jobs-specific layout state class for selected job detail mode.
- Updated the selected job detail layout so the Job Material List is no longer
  constrained to the narrow right-side form column.
- Updated Job Material List CSS containment so the form and controls stay
  inside the visible card.
- Changed the Job Material List form grid to use responsive auto-fit columns.
- Added `min-width: 0` and `max-width: 100%` containment to the relevant
  Material List wrappers, controls, toolbar, helper copy, and locked edit row.
- Allowed Job Material List action buttons and helper copy to wrap cleanly.
- Kept dense table horizontal overflow scoped to the table wrapper only.

### Files Changed
- `src/App.jsx`
  - Added `jobs-foundation-layout` and selected-detail modifier class to the
    existing Jobs layout wrapper.
- `src/styles.css`
  - Updated `jobs-foundation-layout`, `job-material-list`,
    `job-material-form`, `job-material-toolbar`, and related Material List
    containment selectors.
- `HANDOFF.md`
  - Appended this Entry 099.

### Behavior / Data Safety
- No migrations were added or edited.
- No Supabase schema, RLS, grants, permissions, auth, backend, or data behavior
  changed.
- No `job_materials` create/edit/archive/query behavior changed.
- No Jobs Foundation behavior changed outside layout containment.
- No inventory/cart/checkout/count/QR/accounting behavior changed.
- No Tool Catalogue behavior changed.
- No direct `inventory_balances` write path was added.
- No Issue to Job, Buyout, Return-to-Inventory, hard delete, or reserved Job
  Material List behavior was added.

### Verification
- `git pull --ff-only origin main` completed and reported already up to date.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files are UI/client-side only plus this HANDOFF append:
  `src/App.jsx`, `src/styles.css`, `HANDOFF.md`.
- Static review confirmed no migration/schema/RLS/grant/permission/backend
  files were changed.
- Authenticated browser verification was not performed in this local session.

### Manual Verification Notes For Ryan
1. Open Jobs.
2. Open a job detail.
3. Confirm Job Material List stays inside the card.
4. Confirm Material search, Catalog material, Requested quantity, Note, Add
   Material Line, New Material Line, and Refresh controls are visible and
   usable.
5. Confirm no page-level horizontal scrolling.
6. Add a material line.
7. Edit requested quantity/note.
8. Archive/remove the material line.
9. Confirm no Issue to Job / Buyout / Return-to-Inventory behavior appears.

### Open Questions / Concerns
- No architecture blocker found.
- Authenticated visual verification remains a manual browser step.

### Architecture Drift Warnings
- CLOSED for this milestone: Job Material List UI containment.
- Protected runtime behavior remained unchanged.

### Routing Verdict
No Claude review needed — Safe UI/CSS Job Material List containment fix (ARCHITECTURE v2.21, HANDOFF Entry 099).

---

## Entry 100 - Job Material List material search/add fix

**Date:** 2026-06-30
**Updated by:** Codex
**Phase:** Job Material List / material search and add bugfix
**Session type:** implementation

### Context
Ryan reported that the Job Material List UI was now contained correctly, but
the material search/select/add flow still could not be completed. This was
classified as a safe UI/client-side bugfix within locked ARCHITECTURE v2.21
Section 39 behavior.

### Root Cause
- The Job Material List catalog loader was filtering `items` by the selected
  job division.
- Existing app catalog/count paths read active catalog items without that
  division filter.
- Valid catalog materials with global, blank, null, or otherwise non-matching
  `items.division` values could be hidden from the Material List select, which
  blocked search/select/add even though the materials existed.

### What Was Completed
- Fixed Job Material List catalog loading to read active, non-archived catalog
  `items` through the existing authorized client read path without the extra
  job-division filter.
- Expanded catalog select fields to include `description` and
  `unit_of_measure`.
- Expanded Material List catalog search to match material code, name,
  description, and unit of measure.
- Updated catalog option labels to include unit of measure when present.
- Improved add/save failure messaging so live Supabase insert errors surface in
  the UI during testing.
- Preserved the approved insert payload fields:
  `job_id`, `division`, `item_id`, `requested_quantity`, `note`,
  `material_name_snapshot`, `material_code_snapshot`, and `created_by`.

### Files Changed
- `src/App.jsx`
  - Updated Job Material List catalog select fields.
  - Updated catalog search matching.
  - Removed the overly strict catalog division filter.
  - Improved Job Material List save error message detail.
- `HANDOFF.md`
  - Appended this Entry 100.

### Behavior / Data Safety
- No migrations were added or edited.
- No Supabase schema, RLS, grants, permissions, auth, backend, or database
  behavior changed.
- No `job_materials` table shape, RLS policy, grant, or write path changed.
- No requested quantity validation rule changed; submit still requires a
  numeric quantity greater than zero.
- No edit requested quantity/note behavior changed.
- No soft archive/remove behavior changed.
- No Jobs Foundation behavior changed outside the Job Material List UI.
- No inventory/cart/checkout/count/QR/accounting behavior changed.
- No Tool Catalogue behavior changed.
- No direct `inventory_balances` write path was added.
- No Issue to Job, Buyout, Return-to-Inventory, hard delete, cart/checkout,
  transaction, fulfillment, remaining, reservation/allocation, procurement, or
  financial behavior was added.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files are UI/client-side only plus this HANDOFF append:
  `src/App.jsx`, `HANDOFF.md`.
- Static review confirmed no migration/schema/RLS/grant/permission/backend
  files were changed.
- Static review confirmed no auth, inventory/cart/checkout/count/QR/accounting,
  Tool Catalogue, or direct `inventory_balances` write path changed.
- Authenticated browser verification was not performed in this local session.

### Manual Verification Notes For Ryan
1. Open Jobs.
2. Open a job detail.
3. Search for a material, such as `1/2 EMT`.
4. Confirm matching catalog materials appear/select correctly.
5. Select a catalog material.
6. Enter requested quantity greater than zero.
7. Add Material Line.
8. Confirm the material line appears in the list.
9. Edit requested quantity/note.
10. Archive/remove the material line.
11. Confirm no Issue to Job / Buyout / Return-to-Inventory behavior appears.
12. Confirm Inventory, Cart/Checkout, Count, QR/scan, Accounting Export, and
    Tool Catalogue still work.

### Open Questions / Concerns
- No architecture blocker found.
- Authenticated visual/live add verification remains a manual browser step.

### Architecture Drift Warnings
- CLOSED for this milestone: Job Material List material search/add bugfix.
- Protected runtime behavior outside the approved Job Material List UI remained
  unchanged.

### Routing Verdict
No Claude review needed — Safe UI/client-side Job Material List material search/add fix (ARCHITECTURE v2.21, HANDOFF Entry 100).

---

## Entry 101 - Job Material List quantity validation fix

**Date:** 2026-06-30
**Updated by:** Codex
**Phase:** Job Material List / requested quantity validation bugfix
**Session type:** implementation

### Context
Ryan reported that the Job Material List material add flow was still rejecting
normal whole-number requested quantities. This was classified as a safe UI /
client-side bugfix within locked ARCHITECTURE v2.21 Section 39 behavior.

### Root Cause
- The requested quantity input was still carrying a narrow numeric constraint
  that did not line up cleanly with the locked `requested_quantity > 0` rule.
- That client-side constraint made the field behave more strictly than the
  database rule, so normal quantities like `1` could be blocked before submit.

### What Was Completed
- Relaxed the Job Material List requested quantity input configuration so it
  matches the locked rule instead of a tighter browser constraint.
- Kept submit-time validation aligned to `requested_quantity > 0`.
- Preserved the existing clear error message:
  `Requested quantity must be greater than zero.`

### Files Changed
- `src/App.jsx`
  - Updated the requested quantity input constraint to allow normal whole
    numbers while still supporting decimal entry.
- `HANDOFF.md`
  - Appended this Entry 101.

### Behavior / Data Safety
- No migrations were added or edited.
- No Supabase schema, RLS, grants, permissions, auth, backend, or database
  behavior changed.
- No Jobs Foundation behavior changed.
- No inventory/cart/checkout/count/QR/accounting behavior changed.
- No direct `inventory_balances` write path was added.
- No Issue to Job, Buyout, Return-to-Inventory, cart/checkout, inventory
  transaction, fulfillment, remaining, reservation/allocation, procurement, or
  financial behavior was added.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files are UI/client-side only plus this HANDOFF append:
  `src/App.jsx`, `HANDOFF.md`.
- Static review confirmed no migration/schema/RLS/grant/permission/backend
  files were changed.
- Static review confirmed no auth, inventory/cart/checkout/count/QR/accounting,
  or direct `inventory_balances` write path changed.
- Authenticated browser verification was not performed in this local session.

### Manual Verification Notes For Ryan
1. Open Jobs.
2. Open a job detail.
3. Search/select a catalog material.
4. Enter requested quantity `1`.
5. Add Material Line.
6. Confirm the material line appears.
7. Try requested quantity `0` and confirm it is rejected.
8. Try blank quantity and confirm it is rejected.
9. Confirm no Issue to Job / Buyout / Return-to-Inventory behavior appears.

### Open Questions / Concerns
- No architecture blocker found.
- Authenticated visual/live add verification remains a manual browser step.

### Architecture Drift Warnings
- CLOSED for this milestone: Job Material List requested quantity validation
  fix.
- Protected runtime behavior outside the approved Job Material List UI remained
  unchanged.

### Routing Verdict
No Claude review needed — Safe UI/client-side Job Material List quantity validation fix (ARCHITECTURE v2.21, HANDOFF Entry 101).

---

## Entry 102 - Issue to Job locked (ARCHITECTURE v2.22, new Section 40)

**Date:** 2026-06-30
**Updated by:** Codex
**Phase:** Issue to Job / architecture lock adoption
**Session type:** decision

### Context
Job Material List is live and verified through Entry 101. This session is a
docs-only adoption of the Claude-reviewed and ChatGPT cross-cleared Issue to
Job lock.

### Decisions Made This Session (locked)
- Added Section 40 to `docs/ARCHITECTURE.md`.
- Updated the architecture version from v2.21 to v2.22.
- Locked Issue to Job as a UI-only binding that closes a Cart / Checkout
  destination-selection gap.
- Locked that Section 11 already supports `destination_type = 'job'` /
  `destination_id`, so no schema or RPC change is required for the future
  implementation slice.
- Locked that the existing checkout RPC is the only writer.
- Locked that Job Material List issue actions hand off through the existing
  Cart / Checkout flow and do not write directly.

### Schema Changes
- None.
- No migrations, Supabase schema changes, RLS changes, grants, or permission
  changes were made.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated the version line to v2.22.
  - Added new Section 40 - Issue to Job.
  - Aligned Section 39 wording with the new lock so the document remains
    consistent.
- `HANDOFF.md`
  - Appended this Entry 102.

### What Codex Needs to Know
- No implementation occurred in this task.
- No App.jsx changes, styles changes, RPC changes, schema changes, or runtime
  changes were made.
- The locked future implementation slice is UI navigation/prefill only.
- Mandatory Codex preflight before implementation:
  - confirm the live `transaction_items.destination_type` CHECK includes
    `'job'`;
  - confirm `transaction_items.destination_id` is `TEXT`.
- After Ryan commits v2.22 / Entry 102, Codex may implement Issue to Job only
  if that preflight passes.

### What Claude Needs to Know
- The new Section 40 is docs-only and does not change runtime behavior.
- Issue to Job remains gated to the future existing-flow binding slice.

### Next Steps (in order)
1. Ryan commits `docs/ARCHITECTURE.md` and `HANDOFF.md`.
2. Codex may later implement Issue to Job only after the required live
   preflight confirms `transaction_items.destination_type` includes `'job'`
   and `destination_id` is `TEXT`.

### Open Questions / Concerns
- None for this docs-only adoption.

### Architecture Drift Warnings
- CLOSED for this milestone: docs-only Issue to Job lock adoption.
- No implementation/code/schema/RPC/UI/runtime changes were made.

### Routing Verdict
No Claude review needed — docs-only Issue to Job architecture lock adoption already Claude-reviewed and ChatGPT cross-cleared (ARCHITECTURE v2.22, HANDOFF Entry 102).

---

## Entry 103 - Issue to Job implemented

**Date:** 2026-06-30
**Updated by:** Codex
**Phase:** Issue to Job / UI binding implementation
**Session type:** implementation

### Context
Job Material List is live and verified through Entry 101. Ryan committed and
pushed the v2.22 / Entry 102 architecture lock, and this session implements
the Issue to Job UI binding within the locked Section 40 existing-flow slice.

### What Was Completed
- Added Job as a destination option in the existing Cart / Checkout UI.
- Added a division-scoped job picker backed by the live Jobs read path.
- Added an `Issue to Job` action on Job Material List lines.
- Wired the Job Material List action to a local handoff that routes into the
  existing Cart / Checkout flow with job + item context.
- Prefilled the Job destination selection and candidate search context when
  the handoff is used.
- Kept requested quantity as a suggestion only.
- Updated the development status card to reflect Milestone 5K.3.

### Schema Changes
- None.
- No migrations were added or edited.
- No Supabase schema, RLS, grant, or permission changes were made.

### Code / File Changes
- `src/App.jsx`
  - Added Issue to Job handoff helpers.
  - Added a job destination picker for Cart / Checkout.
  - Added Issue to Job navigation/prefill support from Job Material List
    rows.
  - Updated Jobs helper copy and Job Material List helper copy so the visible
    app text matches the new lock.
  - Updated the development status card values.
- `src/styles.css`
  - Added small job destination picker / summary styling.
- `HANDOFF.md`
  - Appended this Entry 103.

### What Codex Needs to Know
- Existing checkout/finalization remains the only inventory movement writer.
- The new Issue to Job behavior is navigation/prefill only.
- No direct RPC call is made from the Job Material List action.
- No direct write to `job_materials` or `inventory_balances` was added.
- Requested quantity is a suggestion only and can still be changed in checkout.
- Existing user and vehicle destinations remain unchanged.
- Tool Catalogue behavior remains unchanged.

### What Claude Needs to Know
- No schema or RPC changes were made.
- The change stays inside the locked Section 40 existing-flow binding.
- The Job picker uses the existing Jobs read pattern.

### Verification
- Repo preflight confirmed the local migration set already includes
  `transaction_items.destination_type` with `'job'` and `destination_id` as
  `TEXT`.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files are UI/client-side only plus this HANDOFF append:
  `src/App.jsx`, `src/styles.css`, `HANDOFF.md`.
- Static review confirmed no migrations, schema, RLS, grant, permission,
  backend, or auth files were changed.
- Static review confirmed no direct `inventory_balances` write path and no
  new transaction type were introduced.
- Authenticated browser verification was not performed in this local session.

### Manual Verification Notes For Ryan
1. Open Inventory Cart / Checkout.
2. Confirm destination options include User/Employee, Vehicle, and Job.
3. Select Job.
4. Search/select a job.
5. Confirm helper copy appears:
   `Issue to Job moves stock out of inventory through checkout. This is not a reservation.`
6. Complete a normal checkout to job if safe test inventory exists.
7. Confirm existing user/vehicle destination checkout still works or remains
   visually unchanged.
8. Open Jobs.
9. Open a job detail.
10. In Job Material List, click `Issue to Job` on a material line.
11. Confirm it routes to Cart/Checkout.
12. Confirm job destination is preselected.
13. Confirm material/item context or search context is carried forward if
   supported.
14. Confirm requested quantity is only a suggestion and can be changed.
15. Confirm no issued/fulfilled/remaining/buyout/return behavior appears.

### Open Questions / Concerns
- No architecture blocker found.
- Authenticated visual/live verification remains a manual browser step.

### Architecture Drift Warnings
- CLOSED for this milestone: Issue to Job UI binding.
- Protected runtime behavior outside the approved existing-flow binding
  remained unchanged.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.22, HANDOFF Entry 103).

---

## Entry 104 - Issue to Job helper copy runtime fix

**Date:** 2026-06-30
**Updated by:** Codex
**Phase:** Issue to Job / UI runtime bugfix
**Session type:** implementation

### Context
Ryan hit a runtime crash while testing the locked Issue to Job flow. The Cart /
Checkout destination UI was referencing `ISSUE_TO_JOB_HELPER_COPY` before that
constant existed in the module scope.

### What Was Completed
- Added the locked Issue to Job helper copy constant once at top-level scope.
- Kept the helper copy text consistent wherever the Job destination checkout UI
  renders.
- Confirmed the Issue to Job destination UI now reads the same locked copy
  string without a missing reference.

### Root Cause
- `ISSUE_TO_JOB_HELPER_COPY` was referenced by the Job destination rendering
  path in `src/App.jsx`, but the constant was not declared in that module.

### Schema / Backend / Data Safety
- None.
- No migrations were added or edited.
- No Supabase schema, RLS, grant, permission, RPC, or backend behavior changes
  were made.
- No transaction/finalization behavior changes were made.
- No direct `inventory_balances` write path was added.
- No writes to `job_materials` were added.
- No Buyout, Return-to-Inventory, reservation/allocation, issued, fulfilled, or
  remaining-quantity behavior was added.

### Supabase Client Check
- No new direct `createClient(...)` call was introduced by this fix.
- The repeated GoTrue warning was not traced to a new client construction path in
  this patch.
- Carry-forward note: if the warning persists in browser testing, it likely
  comes from the existing client pattern rather than this helper-copy fix.

### Code / File Changes
- `src/App.jsx`
  - Added `ISSUE_TO_JOB_HELPER_COPY` at module scope.
  - Left the locked Issue to Job UI behavior otherwise unchanged.
- `HANDOFF.md`
  - Appended this Entry 104.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files remain UI/client-side only plus this HANDOFF append:
  `src/App.jsx`, `HANDOFF.md`.
- No migrations, schema, RLS, grant, permission, RPC, or backend files were
  changed.
- Authenticated browser verification was not performed in this local session.

### Manual Verification Notes For Ryan
1. Hard refresh the deployed app.
2. Open Inventory Cart / Checkout.
3. Select Job destination.
4. Confirm the helper copy renders:
   `Issue to Job moves stock out of inventory through checkout. This is not a reservation.`
5. Confirm the page no longer crashes.
6. Open Jobs.
7. Open a job detail.
8. Click `Issue to Job` on a material line.
9. Confirm it routes to Cart/Checkout without crashing.
10. Confirm job destination is preselected if that was part of 5K.3.
11. Confirm no Buyout / Return-to-Inventory / issued / fulfilled / remaining
    behavior appears.

### Open Questions / Concerns
- No new blocker found.
- GoTrue warnings remain a carry-forward observation unless browser testing
  proves they are caused by something else.

### Architecture Drift Warnings
- CLOSED for this milestone: safe UI/client-side helper-copy runtime fix.
- The patch stayed inside the locked Issue to Job UI binding surface.

### Routing Verdict
No Claude review needed — Safe UI/client-side Issue to Job runtime fix (ARCHITECTURE v2.22, HANDOFF Entry 104).

---

## Entry 105 - Job-detail Issue to Job shortcut hidden

**Date:** 2026-07-01
**Updated by:** Codex
**Phase:** Issue to Job / UI visibility toggle
**Session type:** implementation

### Context
Ryan decided the Job screen should stop presenting `Issue to Job` as the place
where material movement begins. The existing Cart / Checkout Job destination
flow stays active, but the Job detail shortcut should be hidden for now behind a
local toggle.

### What Was Completed
- Added a local client-side feature flag to hide the Job-detail / Job Material
  List `Issue to Job` shortcut UI.
- Kept the underlying shortcut code available behind the toggle for possible
  future reactivation.
- Preserved the Cart / Checkout Job destination option and job picker flow.
- Kept the existing checkout/finalization path unchanged.

### Operational Decision
- Job-detail Issue to Job shortcut is intentionally hidden for now.
- Material movement should originate from Inventory / future Vehicle Inventory,
  with Job selected as the checkout destination.

### Schema / Backend / Data Safety
- None.
- No migrations were added or edited.
- No Supabase schema, RLS, grant, permission, RPC, or backend behavior changes
  were made.
- No transaction/finalization behavior changes were made.
- No direct `inventory_balances` write path was added.
- No writes to `job_materials` were added.
- No Buyout, Return-to-Inventory, reservation/allocation, issued, fulfilled, or
  remaining-quantity behavior was added.

### Code / File Changes
- `src/App.jsx`
  - Added `ENABLE_JOB_DETAIL_ISSUE_TO_JOB_ACTION = false`.
  - Added the carry-forward comment explaining why the shortcut is hidden.
  - Wrapped the Job Material List `Issue to Job` buttons in a local toggle so
    they do not render while the flag is false.
- `HANDOFF.md`
  - Appended this Entry 105.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files remain UI/client-side only plus this HANDOFF append:
  `src/App.jsx`, `HANDOFF.md`.
- No migrations, schema, RLS, grant, permission, RPC, or backend files were
  changed.
- Authenticated browser verification was not performed in this local session.
- Static review confirms Cart / Checkout still includes Job as a destination
  option and the job picker path remains in place.

### Manual Verification Notes For Ryan
1. Open Inventory Cart / Checkout.
2. Confirm Job remains available as a destination.
3. Confirm the Job picker still works in Cart / Checkout.
4. Open a job detail.
5. Confirm the Job Material List no longer shows an active `Issue to Job`
   shortcut button.
6. Confirm the page still renders normally and no crash is introduced.
7. Confirm no Buyout / Return-to-Inventory / issued / fulfilled / remaining
   behavior appears.

### Open Questions / Concerns
- No blocker found.
- The hidden shortcut code remains available for future reactivation if Ryan
  wants that workflow restored later.

### Architecture Drift Warnings
- CLOSED for this milestone: safe UI/client-side visibility toggle.
- The patch stayed within the locked Issue to Job decisions.

### Routing Verdict
No Claude review needed — Safe UI visibility toggle within locked Issue to Job decisions (ARCHITECTURE v2.22).

---

## Entry 106 - Buyout Planning locked (ARCHITECTURE v2.23, new Section 41)

**Date:** 2026-07-01
**Updated by:** Codex
**Phase:** Buyout Planning / architecture lock adoption
**Session type:** docs-only

### Context
Issue to Job remains live through Entry 105. This session adopts the Claude-
reviewed and ChatGPT cross-cleared Buyout Planning architecture lock as a
docs-only update, with no implementation work.

### What Was Completed
- Added new Section 41 - Buyout Planning to `docs/ARCHITECTURE.md`.
- Updated the architecture version to v2.23.
- Locked Buyout Planning as a PM procurement checklist for jobs.
- Locked `job_buyout_lines` as a standalone table with no FK to
  `job_materials`.
- Locked optional catalog `item_id` plus free-text `item_description`.
- Locked nullable `quantity_ordered` semantics where null means not yet ordered
  and 0 means ordered but quantity TBD.
- Locked status values to `pending`, `ordered`, `received`, and `cancelled`.
- Locked the read-time `In Stock` signal as a display-only read from
  `inventory_balances`.
- Approved simple print-to-PDF and CSV export for display-only planning data.

### Schema / Backend / Data Safety
- None.
- No migrations were added or edited.
- No Supabase schema, RLS, grant, permission, RPC, or backend behavior changes
  were made.
- No implementation, code, runtime, or UI changes were made.
- No transaction/finalization behavior changes were made.
- No direct `inventory_balances` write path was added.
- No writes to `job_materials` were added.
- No Buyout / Return-to-Inventory / reservation/allocation behavior was added.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated the version line to v2.23.
  - Added Section 41 - Buyout Planning.
- `HANDOFF.md`
  - Appended this Entry 106.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` was run and passed, although this task was docs-only.
- Changed files are docs-only for this task:
  `docs/ARCHITECTURE.md`, `HANDOFF.md`.
- No `src` files were changed in this task.
- No migrations were added or edited.
- No schema, RLS, grant, permission, RPC, or backend files were changed.
- Authenticated browser verification was not performed in this local session.
- No implementation of Buyout Planning occurred yet.

### Manual Verification Notes For Ryan
1. Commit the docs lock.
2. Later, implement Buyout Planning only after the lock is adopted.
3. Confirm the future implementation stays inside the new Section 41 scope.

### Open Questions / Concerns
- None.
- Buyout Planning remains reserved for a later implementation milestone.

### Architecture Drift Warnings
- CLOSED for this milestone: docs-only Buyout Planning architecture lock adoption.
- No runtime or schema drift was introduced.

### Routing Verdict
No Claude review needed — docs-only Buyout Planning architecture lock adoption already Claude-reviewed and ChatGPT cross-cleared (ARCHITECTURE v2.23, HANDOFF Entry 106).

---

## Entry 107 - Buyout Planning implemented

**Date:** 2026-07-01
**Updated by:** Codex
**Phase:** Buyout Planning / implementation
**Session type:** implementation

### Context
Buyout Planning is now implemented inside the locked ARCHITECTURE v2.23
Section 41 slice. Issue to Job remains live through Entry 105, and this work
adds the Buyout List as a separate planning surface in the Jobs workspace job
detail view.

### What Was Completed
- Added the `public.job_buyout_lines` migration foundation.
- Confirmed the catalog `items` primary key type during preflight as `uuid`
  (`public.items(id)`).
- Implemented `job_id uuid references public.jobs(id)`.
- Implemented `division text not null`.
- Implemented nullable `item_id` plus free-text `item_description`.
- Implemented nullable `quantity_ordered` with distinct null/zero handling.
- Locked the status values to `pending`, `ordered`, `received`, and
  `cancelled`.
- Added the `touch_user_permissions_updated_at()` trigger pattern for
  `updated_at`.
- Added RLS policies:
  - `job_buyout_lines_read`
  - `job_buyout_lines_insert`
  - `job_buyout_lines_update`
- Kept the table soft-archive only with no DELETE policy.
- Added the Jobs workspace job detail Buyout List UI.
- Added add/edit/archive, status badges, search, on-hand display, empty state,
  loading state, and error state handling.
- Added the locked Buyout List helper copy.
- Implemented read-time only In Stock lookup from the existing inventory read
  pattern backed by `inventory_balances`.
- Added CSV export and print-to-PDF support for the current job's Buyout List.
- Implemented quantity inputs so users can temporarily blank the field while
  typing.

### Schema / Backend / Data Safety
- No inventory movement was added.
- No cart/checkout changes were added.
- No Issue to Job shortcut changes were added.
- No Return-to-Inventory behavior was added.
- No reservation/allocation behavior was added.
- No accounting / Financials / PO behavior was added.
- No direct `inventory_balances` write path was added.
- No writes to `job_materials` were added.
- No new transaction type was added.
- No new permission flags were added.
- No FK/link to `job_materials` was added.
- No cost, price, PO number, vendor ID, or structured accounting columns were
  added.

### Code / File Changes
- `supabase/migrations/202607010001_job_buyout_lines_foundation.sql`
  - New Buyout Planning foundation migration.
- `src/App.jsx`
  - Added Buyout Planning state, CRUD wiring, on-hand lookup, print/export, and
    development status updates.
- `src/styles.css`
  - Added Buyout List form/table/layout styles.
- `HANDOFF.md`
  - Appended this Entry 107.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files are the new migration plus UI/client-side files and this
  HANDOFF append:
  `supabase/migrations/202607010001_job_buyout_lines_foundation.sql`,
  `src/App.jsx`, `src/styles.css`, `HANDOFF.md`.
- No existing migrations were edited.
- No schema, RLS, grant, permission, RPC, auth, or backend behavior outside the
  Buyout Planning migration scope was changed.
- No authenticated browser verification was performed in this local session.
- The migration has been added to the repo but still needs to be applied to the
  live Supabase project manually.

### Manual Verification Notes For Ryan
1. Open Jobs.
2. Open a job detail.
3. Confirm Buyout List appears inside the job detail.
4. Add a catalog-item buyout line.
5. Add a free-text buyout line.
6. Confirm Qty Needed accepts `1`.
7. Confirm Qty Needed can be cleared temporarily while typing.
8. Confirm blank Qty Needed cannot be saved.
9. Confirm Qty Ordered can be blank/null.
10. Confirm Qty Ordered can be `0`.
11. Change status to ordered, received, and cancelled.
12. Edit vendor note, lead time note, and note.
13. Archive/remove a line.
14. Confirm In Stock appears only as read-only context.
15. Confirm print-to-PDF works.
16. Confirm CSV export works.
17. Confirm no inventory movement, cart/checkout, reservation, or accounting
    behavior appears.

### Open Questions / Concerns
- No blocker found.
- Live Supabase migration application still remains as a manual follow-up.

### Architecture Drift Warnings
- CLOSED for this milestone: Buyout Planning implementation within locked
  decisions.
- The work remained inside ARCHITECTURE v2.23 Section 41.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.23, HANDOFF Entry 107).

---

## Entry 108 - Workspace Detail Sub-Navigation Pattern locked (ARCHITECTURE v2.24, new Section 42)

**Date:** 2026-07-02
**Updated by:** Codex
**Phase:** Workspace Detail Sub-Navigation Pattern / architecture lock adoption
**Session type:** docs-only

### Context
Buyout Planning is live through Entry 107, and the Jobs detail screen had
grown into one long stacked page. This entry locks the reusable workspace detail
sub-navigation pattern in ARCHITECTURE v2.24 Section 42 so Jobs can become the
first application of the pattern.

### What Was Decided
- Added a persistent selected-record header for the detail view.
- Added a horizontal sub-navigation under the header.
- Locked a single focused content area below the sub-nav.
- Locked Jobs as the first application of the reusable detail pattern.
- Locked the Jobs tab order to:
  - Overview
  - Details
  - Materials
  - Buyout
  - Transactions
  - Financials
  - Documents
  - Schedule
- Locked Overview as a lightweight read-only summary, not a renamed old card.
- Locked Details to the existing job edit form.
- Locked Materials to the existing Job Material List.
- Locked Buyout to the existing Buyout List.
- Locked Transactions, Financials, Documents, and Schedule as disabled Coming
  Soon tabs using the existing 5J shell placeholder pattern.
- Confirmed the Jobs directory/list screen remains unchanged.
- Confirmed there is no sidebar for the job sub-navigation.
- Confirmed mobile responsiveness is required.
- Confirmed `ENABLE_JOB_DETAIL_ISSUE_TO_JOB_ACTION` remains false/hidden.

### Schema / Backend / Data Safety
- No schema changes were added.
- No Supabase migration changes were added.
- No RPC changes were added.
- No permission changes were added.
- No runtime behavior changes were added.
- No backend write path changes were added.
- No UI implementation changes were added yet.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated to v2.24 and added Section 42.
- `HANDOFF.md`
  - Appended this Entry 108.

### Verification
- Docs only; no implementation code was changed in this task.
- No authenticated browser verification was performed in this local session.
- No schema, RLS, grant, permission, RPC, auth, or backend behavior outside the
  documented lock changed.

### Open Questions / Concerns
- No blocker found.

### Architecture Drift Warnings
- CLOSED for this milestone: docs-only Workspace Detail Sub-Navigation Pattern
  lock adoption.
- No runtime or schema drift was introduced.

### Routing Verdict
No Claude review needed — docs-only Workspace Detail Sub-Navigation Pattern lock adoption already Claude-reviewed and ChatGPT cross-cleared (ARCHITECTURE v2.24, HANDOFF Entry 108).

---

## Entry 109 - Jobs detail sub-nav implemented

**Date:** 2026-07-02
**Updated by:** Codex
**Phase:** Jobs detail sub-nav / implementation
**Session type:** implementation

### Context
This milestone implements the locked ARCHITECTURE v2.24 Section 42 pattern for
Jobs. The prior job detail experience had become one long stacked page, so this
work refactors the selected-job detail surface into a persistent header, a
horizontal sub-nav, and a single focused content area without changing the
existing data flows.

### What Was Completed
- Added a persistent selected-job header above the detail content.
- Added a horizontal job sub-nav under the header.
- Implemented the locked tab set:
  - Overview
  - Details
  - Materials
  - Buyout
  - Transactions
  - Financials
  - Documents
  - Schedule
- Implemented the active tabs:
  - Overview
  - Details
  - Materials
  - Buyout
- Implemented the disabled / Coming Soon tabs:
  - Transactions
  - Financials
  - Documents
  - Schedule
- Created a new lightweight read-only Overview tab.
- Relocated the existing job edit form into Details with no behavior change.
- Relocated the existing Job Material List into Materials with no behavior
  change.
- Relocated the existing Buyout List into Buyout with no behavior change.
- Kept the Jobs directory/list screen accessible and unchanged.
- Kept `ENABLE_JOB_DETAIL_ISSUE_TO_JOB_ACTION` false / hidden.
- Updated the Development Status card to ARCHITECTURE v2.24 / Entry 109.

### UI / UX Notes
- The selected job header now shows compact identity data:
  - job number
  - job name
  - status badge
  - job type / service call number when present
  - address summary when present
- The sub-nav is horizontal and visually distinguishes active vs Coming Soon
  tabs.
- The tab strip remains mobile-safe through horizontal scrolling.
- The page no longer stacks Details, Materials, and Buyout into one long detail
  surface.

### Behavior / Data Safety
- No schema changes were added.
- No migration files were added or edited.
- No RLS, grant, permission, or auth changes were added.
- No RPC changes were added.
- No backend behavior changes were added.
- No inventory movement behavior was added or changed.
- No cart / checkout behavior was added or changed.
- No Job Material List write behavior was changed beyond relocation.
- No Buyout List write behavior was changed beyond relocation.
- No direct `inventory_balances` write path was added.
- No Transactions, Financials, Documents, or Schedule implementation was added.
- Tool Catalogue behavior remained unchanged.

### Code / File Changes
- `src/App.jsx`
  - Added the selected-job header, horizontal sub-nav, Overview tab, and tab
    relocation wiring.
- `src/styles.css`
  - Added Jobs detail header / tab / overview styling and responsive tab-strip
    behavior.
- `HANDOFF.md`
  - Appended this Entry 109.

### Verification
- Mandatory preflight passed:
  - working tree was clean before implementation
  - `docs/ARCHITECTURE.md` was already at v2.24
  - HANDOFF was gapless through Entry 108
  - current Jobs detail structure, Job Material List flow, Buyout List flow,
    existing 5J Coming Soon pattern, and the `ENABLE_JOB_DETAIL_ISSUE_TO_JOB_ACTION`
    false flag were confirmed before editing
  - no schema / RPC / permission changes were needed
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files are UI/client-side only plus this HANDOFF append:
  `src/App.jsx`, `src/styles.css`, `HANDOFF.md`.
- No authenticated browser verification was performed in this local session.

### Manual Verification Notes For Ryan
1. Open Jobs.
2. Select a job.
3. Confirm the selected-job header appears.
4. Confirm the sub-nav shows Overview, Details, Materials, Buyout,
   Transactions, Financials, Documents, and Schedule.
5. Confirm Transactions, Financials, Documents, and Schedule are disabled /
   Coming soon.
6. Open Overview and confirm it is lightweight and read-only.
7. Open Details and confirm job edit/save still works.
8. Open Materials and confirm Job Material List add/edit/archive still works.
9. Open Buyout and confirm Buyout List add/edit/archive/print/export still
   works.
10. Confirm the page no longer feels like one long stacked detail card.
11. Confirm the Issue-to-Job shortcut is still hidden from Job detail.
12. Confirm Inventory Cart / Checkout Job destination behavior remains
    unchanged.

### Open Questions / Concerns
- No blocker found.
- Authenticated browser verification remains a manual follow-up.

### Architecture Drift Warnings
- CLOSED for this milestone: Jobs detail sub-nav implementation within locked
  decisions.
- The work remained inside ARCHITECTURE v2.24 Section 42.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.24, HANDOFF Entry 109).

---

## Entry 110 - Job Transactions Log locked (ARCHITECTURE v2.25, new Section 43)

**Date:** 2026-07-02
**Updated by:** Codex
**Phase:** Job Transactions Log / architecture lock adoption
**Session type:** docs-only

### Context
Jobs detail is live through Entry 109, and this milestone splits the remaining
Jobs detail transaction work away from Financials. Section 43 now locks a
read-only Job Transactions Log so the Transactions tab can be activated later
without pulling Financials into the same decision set.

### What Was Decided
- Locked a new read-only `public.job_transaction_log` view.
- Locked the view as a read over `transaction_items` plus `inventory_transactions`.
- Locked the view filter to `destination_type = 'job'`.
- Locked the job match on `destination_id = jobs.id::text`.
- Locked the Transactions tab as a read-only log of job-coded material only.
- Locked the display shape to:
  - date / occurred_at
  - item / material
  - quantity
  - source location / bin
  - transaction type
  - performed by
  - notes / reference
- Locked the Transactions tab as read-only with no edit, delete, return, or
  print/export actions in this milestone.
- Locked no cost/value column and no unit-cost or financial actuals display.
- Confirmed Financials is intentionally split out and remains unlocked /
  deferred.
- Confirmed source-location-agnostic behavior so future Vehicle Inventory
  transactions appear automatically when they use the same ledger and
  `destination_type = 'job'`.
- Flagged Return-from-Job as a future 5K.5 delta, not solved in this lock.
- Confirmed no new permission flags, RPCs, or tables are introduced by this
  docs-only adoption.

### Schema / Backend / Data Safety
- No implementation code was added.
- No schema migration was added.
- No RLS grant or permission change was added.
- No RPC change was added.
- No auth behavior change was added.
- No runtime behavior change was added.
- No Financials work was introduced.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated to v2.25 and added Section 43.
- `HANDOFF.md`
  - Appended this Entry 110.

### Verification
- Docs only; no implementation files were changed in this task.
- No authenticated browser verification was performed in this local session.
- No schema, RLS, grant, permission, RPC, auth, or backend behavior outside the
  documented lock changed.

### Open Questions / Concerns
- No blocker found.

### Architecture Drift Warnings
- CLOSED for this milestone: docs-only Job Transactions Log architecture lock
  adoption.
- No runtime or schema drift was introduced.

### Routing Verdict
No Claude review needed — docs-only Job Transactions Log architecture lock adoption already Claude-reviewed and ChatGPT cross-cleared (ARCHITECTURE v2.25, HANDOFF Entry 110).

---

## Entry 111 - Job Transactions Log implemented

**Date:** 2026-07-02
**Updated by:** Codex
**Phase:** Job Transactions Log / implementation
**Session type:** implementation

### Context
Section 43 is now implemented inside the locked ARCHITECTURE v2.25 slice.
Transactions was previously a placeholder tab in the Jobs detail sub-nav, and
this milestone activates it as a read-only log sourced from the existing
inventory ledger.

### What Was Completed
- Added a new read-only `public.job_transaction_log` migration view.
- Confirmed the source ledger table columns during preflight:
  - `transaction_items.id`
  - `transaction_items.transaction_id`
  - `transaction_items.occurred_at`
  - `transaction_items.division`
  - `transaction_items.destination_id`
  - `transaction_items.item_id`
  - `transaction_items.quantity`
  - `transaction_items.transaction_type`
  - `transaction_items.note`
  - `transaction_items.ledger_sequence`
  - `inventory_transactions.id`
  - `inventory_transactions.created_at`
  - `inventory_transactions.user_id`
  - `inventory_transactions.performed_by_name`
  - `inventory_transactions.notes`
  - `inventory_transactions.source_vehicle_id`
- Locked the view to rows where `destination_type = 'job'`.
- Matched the job with `destination_id = jobs.id::text`.
- Included read-model fields for material/item, quantity, source location/bin,
  transaction type, performed by, and notes/reference.
- Activated the Transactions tab in the Jobs detail sub-nav.
- Added the read-only Transactions table/log UI.
- Added the required helper copy verbatim.
- Kept Financials disabled / placeholder.
- Kept edit, delete, return, print, and export actions out of the Transactions
  tab.
- Updated the Development Status card to ARCHITECTURE v2.25 / Entry 111.

### View / UI Shape
- View columns support the Transactions tab with:
  - transaction item id
  - occurred date/time
  - division
  - job id
  - item id
  - material code / item name / unit of measure
  - quantity
  - transaction type
  - source bin id
  - source bin code
  - source bin label
  - source location label
  - performed by
  - performed by user id
  - note
  - ledger sequence
- UI table columns are:
  - Date
  - Material / Item
  - Quantity
  - Source location / bin
  - Transaction type
  - Performed by
  - Notes / reference
- Empty, loading, and error states are present.
- The tab remains read-only and source-location-agnostic.

### Permissions / RLS / View Behavior
- The source transaction tables are RLS-disabled in the repo’s existing phase 1
  inventory migrations, so the view follows the project’s existing plain-view
  pattern instead of introducing a SECURITY DEFINER bypass.
- No new permission flags were introduced.
- No RPC changes were introduced.
- No backend write path changes were introduced.
- No direct `inventory_balances` write path was introduced.

### Code / File Changes
- `supabase/migrations/202607020001_job_transaction_log_view.sql`
  - New read-only job transaction log view.
- `src/App.jsx`
  - Added Transactions tab state, loading, table/log UI, and tab activation.
- `src/styles.css`
  - Added Transactions tab styling.
- `HANDOFF.md`
  - Appended this Entry 111.

### Verification
- Mandatory preflight passed:
  - working tree was clean before implementation
  - `docs/ARCHITECTURE.md` was already at v2.25
  - HANDOFF was gapless through Entry 110
  - exact ledger table columns, `jobs.id` UUID shape, and the repo’s view
    pattern were confirmed before editing
  - no schema / RPC / permission changes were required
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files are migration plus UI/client-side files and this HANDOFF append:
  `supabase/migrations/202607020001_job_transaction_log_view.sql`,
  `src/App.jsx`, `src/styles.css`, `HANDOFF.md`.
- No authenticated browser verification was performed in this local session.
- The new migration has been added to the repo but still needs to be applied to
  the live Supabase project manually.

### Manual Verification Notes For Ryan
1. Open Jobs.
2. Select a job.
3. Open Transactions tab.
4. Confirm the helper copy appears:
   `This is a read-only log of material coded to this job through Inventory Checkout.`
5. Confirm transactions coded to that job appear if any exist.
6. Confirm the empty state appears if none exist.
7. Confirm the table shows date, material/item, quantity, source location/bin,
   transaction type, performed by, and notes/reference.
8. Confirm there are no edit, delete, or return buttons.
9. Confirm no cost/value or financial columns appear.
10. Confirm Financials remains Coming soon / disabled.

### Open Questions / Concerns
- No blocker found.
- Live Supabase migration application still needs manual follow-up.

### Architecture Drift Warnings
- CLOSED for this milestone: Job Transactions Log implementation within locked
  decisions.
- The work remained inside ARCHITECTURE v2.25 Section 43.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.25, HANDOFF Entry 111).

---

## Entry 112 - Transactions tab activation fix

**Date:** 2026-07-02
**Updated by:** Codex
**Phase:** Job Transactions Log / UI wiring fix
**Session type:** bugfix

### Context
Ryan reported that the Jobs detail Transactions tab was still behaving like an
inactive placeholder after the Section 43 implementation landed. This follow-up
was limited to a safe UI/client-side wiring fix under the locked
ARCHITECTURE v2.25 decisions.

### Root Cause
- The Jobs detail sub-nav still relied on loose inline disabled-state wiring
  instead of an explicit active-tab allowlist.
- Transactions existed in the render switch and data loader, but the sub-nav
  needed a single source of truth that clearly treated `transactions` as a live
  tab rather than legacy Section 42 placeholder behavior.

### What Was Completed
- Added an explicit active-tab allowlist for:
  - Overview
  - Details
  - Materials
  - Buyout
  - Transactions
- Added an explicit Coming Soon allowlist for:
  - Financials
  - Documents
  - Schedule
- Normalized Jobs detail tab selection through a shared helper so live tabs
  stay clickable and placeholder tabs stay blocked.
- Kept the Transactions tab rendering the read-only Job Transactions Log panel.
- Kept the required helper copy intact:
  `This is a read-only log of material coded to this job through Inventory Checkout.`

### Safety Confirmations
- Safe UI/client-side wiring fix only.
- No schema, migration, RLS, grant, permission, RPC, or backend behavior
  changes.
- No transaction write behavior changes.
- No changes to cart / checkout / inventory movement behavior.
- No changes to `job_materials` or `job_buyout_lines`.
- No Financials, Return-to-Inventory, cost, or value behavior added.

### Code / File Changes
- `src/App.jsx`
  - Replaced loose inline disabled logic with explicit live-tab and Coming Soon
    tab allowlists.
  - Ensured Transactions is normalized as an active detail tab.
  - Kept Financials / Documents / Schedule visible but disabled.
- `HANDOFF.md`
  - Appended this Entry 112.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files are UI/client-side plus this HANDOFF append only:
  `src/App.jsx`, `HANDOFF.md`.
- No migrations were added or edited in this milestone.
- No authenticated browser verification was performed in this local session.

### Outcome
- Transactions is now active / clickable in the Jobs detail sub-nav.
- Transactions renders the read-only Job Transactions Log panel.
- Financials, Documents, and Schedule remain disabled / Coming soon.

### Routing Verdict
No Claude review needed — Safe UI tab activation fix within locked Job Transactions Log decisions (ARCHITECTURE v2.25).

---

## Entry 113 - Transactions tab clickability fix

**Date:** 2026-07-02
**Updated by:** Codex
**Phase:** Job Transactions Log / UI clickability fix
**Session type:** bugfix

### Context
Ryan reported that the Jobs detail Transactions tab still was not actually
clickable even after the prior activation wiring pass. This follow-up remained
strictly inside the locked ARCHITECTURE v2.25 UI/client-side scope.

### Root Cause
- The Jobs detail sub-nav still split tab status across generic helper sets,
  inline button behavior, and shared button styling.
- Transactions was logically intended to be active, but the tab bar did not
  have one direct source of truth for clickability, and the CSS did not
  explicitly reserve pointer blocking for only the true Coming Soon tabs.

### What Was Completed
- Moved Jobs detail tab status into one explicit config source of truth.
- Kept these tabs active and clickable:
  - Overview
  - Details
  - Materials
  - Buyout
  - Transactions
- Kept these tabs visible but disabled / Coming Soon:
  - Financials
  - Documents
  - Schedule
- Added a shared Jobs detail tab-change handler so clicking Transactions sets
  the selected tab to `transactions`.
- Updated tab styling so active tabs use normal pointer behavior and only
  disabled / Coming Soon tabs block pointer interaction.
- Kept Transactions rendering the existing read-only Job Transactions Log panel.

### Safety Confirmations
- Safe UI/client-side clickability fix only.
- No schema, RLS, grant, permission, migration, RPC, or backend behavior
  changes.
- No transaction write behavior changes.
- No inventory movement, cart, or checkout behavior changes.
- No changes to the transaction view itself.
- No Financials, Return-to-Inventory, cost, or value behavior added.

### Code / File Changes
- `src/App.jsx`
  - Replaced split helper-set tab status wiring with explicit per-tab config.
  - Added a shared tab-change handler for Jobs detail tabs.
  - Ensured Transactions routes into the read-only log panel.
- `src/styles.css`
  - Added explicit active-tab pointer/cursor styling.
  - Restricted pointer blocking to disabled / Coming Soon tabs only.
- `HANDOFF.md`
  - Appended this Entry 113.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Changed files are UI/client-side plus this HANDOFF append only:
  `src/App.jsx`, `src/styles.css`, `HANDOFF.md`.
- No migrations were added or edited in this milestone.
- No authenticated browser verification was completed.
- In-app browser verification against localhost was not available because the
  browser session could not connect to the local Vite app from this environment.

### Outcome
- Transactions tab/button is now active and clickable in code and styling.
- Clicking Transactions routes the Jobs detail panel to the read-only Job
  Transactions Log.
- Financials, Documents, and Schedule remain disabled / Coming soon.

### Routing Verdict
No Claude review needed — Safe UI clickability fix within locked Job Transactions Log decisions (ARCHITECTURE v2.25).

---

## Entry 114 - Developer Dashboard build marker sync fix

**Date:** 2026-07-02
**Updated by:** Codex
**Phase:** Developer Dashboard / build metadata sync
**Session type:** diagnostic + bugfix

### Context
Ryan reported that the Developer Dashboard showed a stale build marker even
though recent work was committed, pushed, and reportedly deployed. This raised
the possibility that the browser was serving an older bundle and also made it
hard to trust whether the Transactions tab clickability fix had reached the
served app.

### Root Cause
- The Developer Dashboard build marker was hardcoded in `src/App.jsx`.
- The displayed hash was therefore manual metadata, not the actual commit SHA of
  the bundle being served.
- No service worker or other app-side cache layer was found in the repo.

### What Was Completed
- Replaced the stale manual build-marker string with build-time metadata from
  Vite.
- Added a Vite-defined `__APP_BUILD_SHA__` value sourced from:
  `git rev-parse --short HEAD`
- Updated the Developer Dashboard / header build note to display the actual
  built commit SHA.
- Updated the deployment note to clarify that the dashboard now reports the
  bundle commit rather than a hand-maintained UI marker.

### Build Marker Strategy
- Build metadata is now automatic at build time.
- Current displayed build marker from this local build path is:
  `579d9ba`
- This means the served app should reflect whichever commit Netlify actually
  builds and serves, instead of whichever manual string was last edited in
  source.

### Transactions Relationship
- The Transactions tab clickability code is present in source.
- Build output verification confirmed the built bundle still contains the locked
  Job Transactions Log helper copy, indicating the Transactions panel code is
  included in the built app.
- If Netlify still shows older behavior after this fix is deployed and the
  Developer Dashboard shows an older SHA, that points to an older deployed
  bundle or browser caching outside the app code.

### Safety Confirmations
- No schema, migration, RLS, grant, permission, RPC, or backend behavior
  changes.
- No transaction write behavior changes.
- No Financials, Return-to-Inventory, cost, or value behavior added.
- No cart, checkout, inventory movement, `job_materials`, or
  `job_buyout_lines` behavior changed.

### Code / File Changes
- `vite.config.js`
  - Added build-time SHA injection via Vite `define`.
- `src/App.jsx`
  - Switched `DEVELOPMENT_STATUS.buildMarker` to the build-time SHA.
  - Updated Development Status metadata for this milestone.
- `HANDOFF.md`
  - Appended this Entry 114.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Built bundle inspection confirmed:
  - the current build SHA `579d9ba` is embedded in the output;
  - the Transactions Log helper copy is present in the built bundle.
- No migrations were added or edited.
- No authenticated browser verification was completed in this local session.

### Manual Verification Notes For Ryan
1. Deploy this fix.
2. Hard refresh the deployed app.
3. Open Developer Dashboard.
4. Confirm the current build marker matches the latest deployed commit or at
   least clearly identifies the actual served build.
5. Open Jobs.
6. Select a job.
7. Confirm Transactions tab clickability again.
8. If Transactions still does not click after the deployed build marker is
   current, capture screenshot/console and treat it as the next separate UI
   bug.

### Routing Verdict
No Claude review needed — Safe Developer Dashboard build marker/deploy sync fix.

---

## Entry 115 - Job Financials v1 Budget Foundation locked (ARCHITECTURE v2.26, new Section 44)

**Date:** 2026-07-02
**Updated by:** Codex
**Phase:** Job Financials / Budget Foundation
**Session type:** docs-only

### Context
Job Transactions Log is live and verified through Entry 114. This milestone
locks the next Financials step as Budget Foundation only, keeping it fully
separate from actuals, profit, accounting, and the existing Transactions /
Buyout work.

### What Was Completed
- Added new Section 44 to ARCHITECTURE.
- Updated ARCHITECTURE version to v2.26.
- Locked the new `job_budget_lines` table shape.
- Locked Financials v1 as budget-only and standalone.
- Locked `category` to six required values:
  - material
  - labor
  - subcontractor
  - equipment
  - permit
  - other
- Locked `cost_code` as free-text in v1.
- Reserved a formal cost-code table for later.
- Locked `description` as required.
- Locked `budget_amount` as numeric with explicit zero allowed and `>= 0`.
- Locked soft archive only and no status column.
- Locked read access to `can_view_financials`.
- Locked write access to `can_approve_budget`.
- Confirmed `can_manage_jobs` is not the Financials gate.
- Locked the Financials tab to be hidden from users lacking `can_view_financials`.
- Locked read-only access for users with view permission but without write
  permission.
- Locked no print/export in v1.
- Locked no reads from Job Transactions Log or Buyout List in v1.

### Safety Confirmations
- Docs-only architecture lock adoption.
- No migrations were added or edited.
- No `src` files were changed.
- No schema, RLS, grant, permission, backend, RPC, or runtime changes were
  made.
- No Financials implementation was added yet.
- No actuals, profit, revenue, accounting, or Return-to-Inventory behavior was
  introduced.

### Code / File Changes
- `docs/ARCHITECTURE.md`
  - Updated to v2.26.
  - Added Section 44.
- `HANDOFF.md`
  - Appended this Entry 115.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` was not required for this docs-only task.
- Confirmed changed files are docs-only:
  - `docs/ARCHITECTURE.md`
  - `HANDOFF.md`
- Confirmed no migrations were added or edited.
- Confirmed no `src` files changed.
- Confirmed no schema/RLS/grant/permission/backend behavior changed.
- Confirmed no Financials implementation occurred yet.

### Outcome
- Financials v1 is now locked as Budget Foundation only.
- The model is standalone from Job Transactions Log and Buyout List.
- The next implementation step, if Ryan later approves it, is Bucket 3 Job
  Financials v1 after the mandatory permission preflight confirms
  `can_view_financials` and `can_approve_budget` are functional.

### Routing Verdict
No Claude review needed — docs-only Job Financials v1 Budget Foundation architecture lock adoption already Claude-reviewed and ChatGPT cross-cleared (ARCHITECTURE v2.26, HANDOFF Entry 115).

---

## Entry 116 - Job Financials v1 Budget Foundation implemented

**Date:** 2026-07-02
**Updated by:** Codex
**Phase:** Job Financials / Budget Foundation
**Session type:** implementation

### Context
Implemented the locked Budget Foundation milestone under ARCHITECTURE v2.26
Section 44. This is the first real consumer of `can_view_financials` and
`can_approve_budget`, so the work started with the mandatory permission
preflight and then stayed inside the locked schema and UI decisions.

### What Was Completed
- Implemented under ARCHITECTURE v2.26 Section 44.
- Mandatory preflight confirmed `can_view_financials` is present and functional
  in the current permission model and returned through
  `effective_permissions_for_user`.
- Mandatory preflight confirmed `can_approve_budget` is present and functional
  in the current permission model and returned through
  `effective_permissions_for_user`.
- Added migration `supabase/migrations/202607020002_job_budget_lines_foundation.sql`
  for `public.job_budget_lines`.
- Migration uses `job_id uuid references public.jobs(id)` and `division text not
  null`.
- Added category CHECK values:
  - `material`
  - `labor`
  - `subcontractor`
  - `equipment`
  - `permit`
  - `other`
- Added free-text nullable `cost_code`.
- Added required `description`.
- Added `budget_amount` with explicit zero allowed and CHECK `>= 0`.
- Added no status column and no actual / committed / issued-value / revenue /
  profit / PO / invoice / change-order / accounting columns.
- Added the `updated_at` trigger using `touch_user_permissions_updated_at()`.
- Added RLS policies:
  - `job_budget_lines_read`
  - `job_budget_lines_insert`
  - `job_budget_lines_update`
- Read is gated by `can_view_financials`.
- Write is gated by `can_approve_budget`.
- Added no DELETE policy and no delete grant.
- Activated the Financials tab for users with `can_view_financials`.
- Hid the Financials tab entirely for users without `can_view_financials`.
- Users without `can_approve_budget` now see read-only Financials.
- Included the locked helper copy verbatim.
- Added summary cards, budget-by-category summary, budget line count, read-only
  table, and add / edit / archive controls for authorized users.
- Implemented numeric input blank typing behavior for budget amount.
- Blank final budget blocks save.
- Added no print/export.
- Added no reads from Transactions, Buyout, Job Materials, inventory, or
  transaction data into Financials.
- Added no actuals/accounting behavior.
- Added no transaction/inventory behavior changes and no direct
  `inventory_balances` write.

### Safety Confirmations
- No migration changes outside the new `job_budget_lines` migration.
- No existing table definitions were changed.
- No RLS, grant, permission, or auth behavior changed on existing tables.
- No new permission flags were added.
- Policies use `can_view_financials` and `can_approve_budget`, not
  `can_manage_jobs`.
- No reserved financial fields were added to schema or UI.
- No reads from `job_transaction_log`, `job_buyout_lines`, `job_materials`, or
  `inventory_balances` were added to Financials.
- No transaction write behavior or inventory movement behavior was introduced.
- No print/export was added to Financials.

### Code / File Changes
- `supabase/migrations/202607020002_job_budget_lines_foundation.sql`
  - Added `public.job_budget_lines` table, trigger, RLS policies, and grants.
- `src/App.jsx`
  - Added Financials tab permission gating and rendering.
  - Added budget-line loading, summary, add/edit/archive, and read-only mode.
  - Updated Development Status metadata for Entry 116 / v2.26.
- `src/styles.css`
  - Added Financials mini-module styles matching the Jobs tab pattern.
- `HANDOFF.md`
  - Appended this Entry 116.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Confirmed changed files include:
  - one new migration for `job_budget_lines`
  - `src/App.jsx`
  - `src/styles.css`
  - `HANDOFF.md`
- Confirmed no existing migrations were edited.
- Confirmed no existing schema / RLS / grant / permission behavior changed.
- Confirmed no inventory / cart / checkout / count / QR / accounting behavior
  changed.
- Confirmed Jobs workspace still builds.
- Confirmed Financials tab visibility is permission-gated in the client.
- Confirmed users without `can_approve_budget` are rendered read-only in the
  client.
- Confirmed budget summaries calculate from budget lines only.
- Confirmed blank budget input can be temporarily cleared while typing but
  cannot be saved blank.
- No authenticated browser verification was completed in this local session.
- Live Supabase migration still needs manual application.

### Manual Verification Notes For Ryan
1. Apply the new Supabase migration in the live environment.
2. Open Jobs.
3. Select a job.
4. Confirm Financials tab appears for a user with `can_view_financials`.
5. Confirm Financials tab is hidden for a user without `can_view_financials`.
6. Confirm the locked helper copy appears.
7. Add a budget line.
8. Confirm category, cost code, description, budget amount, and note save
   correctly.
9. Confirm explicit `0` budget amount is allowed.
10. Confirm blank budget amount cannot be saved.
11. Confirm the budget input can be temporarily blank while typing.
12. Confirm Total Budget updates.
13. Confirm Budget by Category updates.
14. Edit a budget line.
15. Archive/remove a budget line.
16. Confirm no actuals, revenue, profit, inventory value, PO, invoice, change
   order, print/export, or accounting behavior appears.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.26, HANDOFF Entry 116).

---

## Entry 117 - Job Financials v1 live verification

**Date:** 2026-07-06
**Updated by:** Codex
**Phase:** Job Financials / Budget Foundation
**Session type:** verification

### Context
Job Financials v1 was already implemented under ARCHITECTURE v2.26 Section 44.
This entry records the live verification step after Ryan confirmed the live
Supabase migration was applied and the deployed app/browser path was tested
successfully.

### What Was Verified
- Live Supabase migration for `public.job_budget_lines` is applied and verified.
- `public.job_budget_lines` exists live in the `northgate-hq-v2.0` Supabase
  project.
- RLS is enabled on `public.job_budget_lines`.
- Verified policies present:
  - `job_budget_lines_read`
  - `job_budget_lines_insert`
  - `job_budget_lines_update`
- Verified no DELETE policy exists for `public.job_budget_lines`.
- Verified no reserved Financials columns were added.
- Verified the live table columns match the repo migration shape.
- Deployed app/browser verification was completed by Ryan.
- Ryan built an entire job budget in Financials successfully with no issues.
- Minor UI polish remains for a later pass and is not blocking.
- Financials v1 is now considered live verified.

### Safety Confirmations
- No code changes were made in this verification entry.
- No schema changes were made in this verification entry.
- No ARCHITECTURE changes were made in this verification entry.
- No actuals, revenue, profit, issued inventory value, accounting, or print /
  export behavior was added.
- No new Financials behavior was introduced beyond the already locked
  Budget Foundation scope.

### Verification
- Live Supabase table existence confirmed.
- Live RLS configuration confirmed.
- Live policy set confirmed.
- Live table shape confirmed against the repo migration.
- Deployed UI verification completed successfully by Ryan.
- Financials workflow proven usable end-to-end for budget entry.

### Manual Verification Notes For Ryan
1. Keep the minor UI polish items for a later, non-blocking pass.
2. Continue with the next milestone when ready.

### Routing Verdict
No Claude review needed — verification-only HANDOFF update within locked decisions (ARCHITECTURE v2.26, HANDOFF Entry 117).

---

## Entry 118 - Jobs Module Completion Roadmap locked (ARCHITECTURE v2.27, new Sections 45-47, Section 44 delta)

**Date:** 2026-07-06
**Updated by:** Codex
**Phase:** Jobs Module / Completion Roadmap
**Session type:** docs-only / architecture lock

### Context
Job Financials v1 is live verified through Entry 117. Ryan wants to finish Jobs
before Vehicle Inventory, so this entry locks the next Jobs-module sequence as
the Claude-reviewed and ChatGPT cross-cleared roadmap for ARCHITECTURE v2.27.

### What Was Completed
- Confirmed Job Financials v1 is live verified through Entry 117.
- Locked the Jobs Module Completion Roadmap in ARCHITECTURE v2.27.
- Locked the next sequence as:
  - Formatting Tuner
  - Budget Ordering
  - Documents v1
  - Schedule v1
  - Export later
- Confirmed the Formatting Tuner is Bucket 1 / no-lock if it stays localStorage
  and CSS-variable only.
- Added the Section 44 delta for Financials budget line ordering via
  `sort_order`.
- Locked Job Documents v1 as the first implementation of the generic Section 20
  `documents` design, scoped to jobs first.
- Confirmed Job Documents use Supabase Storage.
- Confirmed Job Documents are individually downloadable/openable.
- Confirmed Job Documents are not bundled into a full job export.
- Locked Job Schedule v1 as a flat milestone/task list only.
- Confirmed Job Export is not locked yet and remains reserved as Section 48.
- Added no code changes in this docs-only task.
- Added no schema changes in this docs-only task.

### Safety Confirmations
- No runtime code was changed.
- No migrations were created.
- No Supabase schema was modified.
- No `src` files were changed.
- No ARCHITECTURE decisions outside the approved roadmap were added.
- No Financials actuals, revenue, profit, issued inventory value, accounting,
  or print/export behavior was added.

### Verification
- Confirmed the coordination documents were updated only.
- Confirmed the roadmap sequence is recorded for later implementation.
- Confirmed Section 48 is still reserved and not locked in v2.27.

### Manual Verification Notes For Ryan
1. Proceed with the roadmap in the locked sequence when ready.
2. Keep Job Export reserved until Documents and Schedule are live.

### Routing Verdict
No Claude review needed — docs-only Jobs Module Completion Roadmap architecture lock adoption already Claude-reviewed and ChatGPT cross-cleared (ARCHITECTURE v2.27, HANDOFF Entry 118).

---

## Entry 119 - Financials Budget Ordering implemented

**Date:** 2026-07-06
**Updated by:** Codex
**Phase:** Job Financials / Budget Ordering
**Session type:** implementation

### Context
Implemented under ARCHITECTURE v2.27 Section 44 delta and Section 45 roadmap.
This is the first milestone after the Jobs Module Completion Roadmap lock and
adds ordering support to the live Financials budget lines model.

### What Was Completed
- Added `sort_order` to `public.job_budget_lines`.
- Backfilled existing budget lines per job using `created_at` and `id` order.
- Updated Financials UI to load and display budget lines ordered by
  `sort_order`, then `created_at`, then `id`.
- Added simple Up / Down rearrangement controls for budget lines.
- Persisted reorder changes by updating `sort_order`.
- Reorder is gated by `can_approve_budget`.
- View-only users with `can_view_financials` remain read-only.
- Added no grouping field.
- Added no `cost_report_group`.
- Added no formal cost code table.
- Added no actuals, revenue, profit, issued inventory value, accounting, or
  print/export behavior.
- Added no Documents, Schedule, or Export work.
- Added no inventory/cart/checkout behavior changes.

### Safety Confirmations
- No existing migration was edited.
- No existing RLS policies were changed.
- No existing grants were changed.
- No new permission flags were added.
- No reserved Financials fields were added.
- No Financials permission model changes were introduced.

## Entry 120 - Job Documents v1 implemented

**Date:** 2026-07-06
**Updated by:** Codex
**Phase:** Jobs Module Completion / Documents
**Session type:** implementation

### Context
Implemented under ARCHITECTURE v2.27 Section 46 as the first live slice of the
generic Section 20 documents system.

Job Documents v1 is job-scoped only. The other Section 20 owner types remain
schema-declared but are not RLS-permitted in this milestone.

### What Was Completed
- Added `supabase/migrations/202607060002_job_documents_foundation.sql`.
- Created the new generic `public.documents` table with the Section 46 field
  set and the Section 20 owner-type check.
- Added the `set_documents_updated_at` trigger path for `public.documents`.
- Used a local trigger helper function because `touch_user_permissions_updated_at()`
  was not confirmed as present in the live project during preflight.
- Bootstrapped the `northgate-files` storage bucket in the migration so the
  Job Documents upload path has a live bucket target if it is missing.
- Enabled RLS on `public.documents`.
- Added the locked RLS policies:
  - `documents_read`
  - `documents_insert`
  - `documents_update`
- Added storage policies for the live `northgate-files` bucket so job documents
  can be uploaded and downloaded through Supabase Storage.
- Did not create or use a bespoke `job_documents` table.
- Activated the Documents tab in the Jobs workspace.
- Added the job document upload flow:
  - file picker
  - free-text document type
  - optional description
  - suggested Section 20-style file naming
  - upload to `northgate-files`
  - insert document row after upload
- Added the job document list view:
  - file name
  - document type
  - description
  - upload date
  - uploaded by
  - file size
  - MIME type
- Added open/download actions for individual documents.
- Added soft-archive only behavior for documents.
- Kept Documents out of bundling/export behavior.
- Kept Schedule, Financials, inventory, cart, checkout, accounting, and other
  job modules unchanged.

### Live Verification
- Confirmed the live v2 Supabase project is `keogysnoukbendfkfjcn`.
- Confirmed the live `northgate-files` bucket exists after the migration apply.
- Confirmed the live `public.documents` table now exists.
- Confirmed the live project now exposes `set_documents_updated_at()`.
- Confirmed the live project now has the `documents_read`, `documents_insert`,
  and `documents_update` policies on `public.documents`.
- Confirmed the live project now has the `documents_storage_read` and
  `documents_storage_insert` policies on `storage.objects`.
- Confirmed the live project has no DELETE policy for `public.documents`.
- Confirmed the live `public.documents` columns match the repo migration shape.
- Confirmed the live project did not already expose the `touch_user_permissions_updated_at()`
  function during preflight, so the migration uses a local `set_documents_updated_at`
  helper function instead.

### Safety Confirmations
- No ARCHITECTURE.md changes were made.
- No hard delete path was added.
- No new permission flag was added.
- No accounting integration was added.
- No Job Export bundling was added.
- No Schedule implementation was added.
- No Financials, inventory, cart, checkout, or transaction-log behavior was
  changed.
- No reads from `job_transaction_log`, `job_buyout_lines`, `job_materials`,
  `inventory_balances`, or transaction tables were added.

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Confirmed the only new schema file is the `sort_order` migration.
- Confirmed the Financials tab still supports add/edit/archive plus budget
  summaries.
- Confirmed reorder uses the existing `can_approve_budget` path.
- Live Supabase migration still needs manual application.

### Manual Verification Notes For Ryan
1. Apply the live `sort_order` migration if not already applied.
2. Open the deployed app.
3. Open Jobs.
4. Select a job with Financials budget lines.
5. Confirm existing line order appears stable.
6. Move a budget line up or down.
7. Refresh the page.
8. Confirm order persists.
9. Confirm Total Budget and Budget by Category did not change.
10. Confirm Add / Edit / Archive still work.
11. Confirm no actuals, revenue, profit, accounting, or export behavior
    appears.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.27, HANDOFF Entry 119).

## Entry 121 - Job Documents upload RLS bugfix

**Date:** 2026-07-06
**Updated by:** Codex
**Phase:** Jobs Module Completion / Documents
**Session type:** bugfix

### Context
After Entry 120 went live, a user attempted to upload a Job Document in the
deployed app and hit an RLS-looking failure:
`new row violates row-level security policy`.

The error initially looked like a `public.documents` insert policy problem, but
diagnosis confirmed the first failure was actually Storage RLS on
`storage.objects`.

### Root Cause
- The live `documents_storage_insert` policy had a name-shadowing / path-parsing
  bug.
- Inside the policy subquery, the folder parsing effectively referenced
  `storage.foldername(j.name)[3]` instead of the outer storage object path.
- The policy was parsing the job display name instead of the uploaded storage
  object path, so the `jobs.id` match failed and the upload was blocked before
  the `public.documents` row insert.
- A second bug existed in `documents_read`: it incorrectly required
  `can_view_all_divisions = true` even for same-division reads, instead of
  allowing own-division reads under the locked Section 46 model.

### What Was Completed
- Added `supabase/migrations/202607060003_job_documents_rls_bugfix.sql`.
- Fixed `documents_storage_insert` so the job-id path segment is parsed from
  `storage.objects.name`.
- Fixed `documents_read` so own-division reads are allowed, with
  `can_view_all_divisions` still permitting cross-division reads where
  authorized.
- Applied the same fix live to the v2 Supabase project
  `keogysnoukbendfkfjcn`.
- Kept Job Documents v1 locked to:
  - generic `public.documents`
  - `owner_type = 'job'`
  - division-scoped reads
  - `can_manage_jobs` for upload/archive
  - no hard delete

### Confirmed Behavior
- Frontend upload flow is storage upload first, then `public.documents` row
  insert.
- Storage upload was rejected first during the failed production attempt.
- No `storage.objects` row was created for the failed upload attempt.
- No `public.documents` row was created for the failed upload attempt.
- No orphaned storage file or document row was left behind.

### Safety Confirmations
- No Schedule work was started.
- No Job Export work was started.
- No new permission flags were added.
- No hard delete behavior was added.
- No unrelated Documents, Jobs, Financials, inventory, cart, checkout, or
  export behavior was changed.

### Verification
- Confirmed repo branch remained `main`.
- Confirmed `docs/ARCHITECTURE.md` remained v2.27.
- Confirmed HANDOFF was gapless through Entry 120 before this append.
- Confirmed `supabase/migrations/202607060003_job_documents_rls_bugfix.sql`
  exists in repo.
- Confirmed no Schedule implementation was added.
- Confirmed no Job Export implementation was added.
- Confirmed no new permission flags were introduced.
- Confirmed no DELETE policy was added for `public.documents`.
- Confirmed no hard delete path was introduced.
- Confirmed the live project now exposes the corrected `documents_read` and
  `documents_storage_insert` policies.
- `git diff --check` passed.
- `npm.cmd run build` was not required because no runtime code changed in this
  finalization/logging pass.

### Routing Verdict
No Claude review needed — Job Documents upload RLS bugfix stayed within locked decisions (ARCHITECTURE v2.27, HANDOFF Entry 121).

## Entry 122 - Developer Formatting Tuner and Jobs readability cleanup

**Date:** 2026-07-06
**Updated by:** Codex
**Phase:** Jobs Module Completion / Bucket 1 UI cleanup
**Session type:** implementation

### Context
Completed the requested Bucket 1 local-only UI pass under ARCHITECTURE v2.27
Section 45, with Schedule still paused and Job Export still reserved. This pass
stayed strictly inside local formatting controls plus Jobs readability cleanup.

### What Was Completed
- Replaced the old query-param Layout Tuner with a Developer-only Formatting
  Tuner inside the Developer workspace.
- Gated the Developer nav/toggle/workspace with the existing
  `can_access_developer` permission already exposed through
  `permissions.canAccessDeveloper`.
- Added the new browser-local storage key
  `northgate.formattingTuner.v1`.
- Kept the tuner local-only by applying CSS variables through
  `document.documentElement.style.setProperty(...)`, with no Supabase writes.
- Added preset/reset/copy-CSS behavior and safe clamping for the tuner fields.
- Added a best-effort legacy read path from `northgate.layoutTuner.v1`, while
  persisting only to `northgate.formattingTuner.v1`.
- Tuned Jobs workspace readability across the split layout, detail header, tab
  strip, forms, cards, and responsive stacking so wide content stays more
  contained and readable.

### Safety Confirmations
- No Supabase schema, migrations, RLS, storage, auth, RPC, or backend behavior
  was changed.
- No new permission flag was added.
- No Documents upload/archive logic was changed.
- No Schedule work was started.
- No Job Export work was started.
- No inventory, cart, checkout, Financials logic, buyout logic, or data model
  behavior was changed.
- No hard delete path was added.
- No `docs/ARCHITECTURE.md` changes were made.

### Files Changed
- `src/App.jsx`
- `src/styles.css`
- `HANDOFF.md`

### Verification
- Confirmed branch remained `main`.
- Confirmed `docs/ARCHITECTURE.md` remained v2.27.
- Confirmed HANDOFF was gapless through Entry 121 before this append.
- Confirmed no Schedule implementation was added.
- Confirmed no Job Export implementation was added.
- Confirmed no new permission flags were introduced.
- Confirmed no Supabase migrations were added in this pass.
- `git diff --check` passed.
- `npm.cmd run build` passed.

### Notes
- Formatting Tuner defaults remain the committed baseline and Reset returns the
  browser back to those defaults.
- The Developer workspace now shows a locked placeholder if someone routes to
  `?workspace=developer` without `can_access_developer`.
- No unrelated behavior changed outside the local UI/readability scope.

### Routing Verdict
No Claude review needed — Developer Formatting Tuner and Jobs readability cleanup stayed within locked decisions (ARCHITECTURE v2.27, HANDOFF Entry 122).

## Entry 123 - Job Schedule v1 implemented

**Date:** 2026-07-06
**Updated by:** Codex
**Phase:** Jobs Module Completion / Schedule
**Session type:** implementation

### Context
Implemented Job Schedule v1 under ARCHITECTURE v2.27 Section 47 as the next
locked Jobs completion milestone after Documents and the Developer Formatting
Tuner cleanup. This stayed inside the flat milestone/task-list scope only.

### What Was Completed
- Created `public.job_schedule_items`.
- Added fields `title`, `description`, `target_date`, `status`, `sort_order`,
  `note`, plus the standard division/archive/created metadata columns.
- Locked status values to `pending`, `in_progress`, `complete`, and `delayed`.
- Added the `set_job_schedule_items_updated_at` trigger using the existing
  `touch_user_permissions_updated_at()` function.
- Enabled the Schedule tab in the Jobs workspace.
- Implemented add, edit, archive, and up/down reorder behavior for schedule
  items.
- Kept archive behavior soft-only through `archived_at`, `archived_by`, and
  optional `archive_reason`.
- Added division-scoped read behavior and `can_manage_jobs` write/archive/
  reorder gating through the new table RLS.

### Safety Confirmations
- No hard delete policy was added.
- No new permission flag was added.
- No calendar integration was added.
- No Google Calendar integration was added.
- No dependency model was added.
- No employee assignments were added.
- No reminders or notifications were added.
- No recurring-event behavior was added.
- No Job Export implementation was added.
- No Documents behavior was changed.
- No Financials behavior was changed.
- No Formatting Tuner behavior was changed.
- No accounting, actuals, revenue, profit, or issued inventory value behavior
  was added.
- No inventory, cart, or checkout behavior was changed.
- No existing migrations were edited.
- No existing RLS, grants, or permissions were changed outside the new
  `job_schedule_items` table.

### Files Changed
- `supabase/migrations/202607060004_job_schedule_items_foundation.sql`
- `src/App.jsx`
- `src/styles.css`
- `HANDOFF.md`

### Verification
- Confirmed branch remained `main`.
- Confirmed the working tree was clean before edits.
- Confirmed local `main` matched `origin/main` before edits.
- Confirmed `docs/ARCHITECTURE.md` remained v2.27.
- Confirmed HANDOFF was gapless through Entry 122 before this append.
- Confirmed Section 47 exists and locks Job Schedule v1.
- Confirmed no existing `public.job_schedule_items` migration already existed.
- Confirmed `touch_user_permissions_updated_at()` remains the shared updated_at
  trigger function used by adjacent Jobs tables.
- Confirmed the Jobs workspace already exposed a Schedule placeholder tab and
  activated that existing tab slot instead of creating a new navigation model.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Live Supabase migration still needs manual application.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.27, HANDOFF Entry 123).

## Entry 124 - Job Schedule archive RLS bugfix prepared

**Date:** 2026-07-08
**Updated by:** Codex
**Phase:** Jobs Module Completion / Schedule
**Session type:** bugfix

### Context
Ryan browser-tested Job Schedule v1 after the Schedule milestone went live and
confirmed add, edit, status changes, and ordering worked, but archive/remove
still failed in both the in-app browser and a regular browser.

### What Was Completed
- Reproduced the live archive failure after confirming the deployed site was on
  the current Schedule build.
- Confirmed the Schedule archive client path was sending
  `archived_at`, `archived_by`, and `archive_reason`.
- Confirmed the active Schedule load query already filters
  `archived_at is null`.
- Confirmed the target live rows were still unarchived after archive attempts.
- Confirmed the authenticated user's effective permissions include
  `can_manage_jobs`.
- Simulated the archive update in live Supabase under the authenticated role and
  confirmed the database rejected the update with `new row violates row-level security policy for table "job_schedule_items"`.
- Isolated the failure to the `job_schedule_items_update` RLS policy:
  ordinary updates succeed, but changing `archived_at` fails.
- Added `supabase/migrations/202607080001_job_schedule_items_archive_rls_bugfix.sql`
  to allow the soft-archive transition while blocking later mutation of already
  archived Schedule rows.

### Safety Confirmations
- No new Schedule features were added.
- No Job Export work was started.
- No Documents, Financials, Formatting Tuner, inventory, cart, or checkout
  behavior was changed.
- No application code was changed in this bugfix.
- No hard delete behavior was added.
- The fix stays inside the existing Section 47 soft-archive model.

### Files Changed
- `supabase/migrations/202607080001_job_schedule_items_archive_rls_bugfix.sql`
- `HANDOFF.md`

### Verification
- Confirmed branch `main`.
- Confirmed the working tree was clean before edits.
- Confirmed local `main` matched `origin/main` before edits.
- Confirmed `docs/ARCHITECTURE.md` remained v2.27.
- Confirmed HANDOFF was gapless through Entry 123 before this append.
- Confirmed `supabase/migrations/202607060004_job_schedule_items_foundation.sql`
  exists in repo.
- Confirmed the live `job_schedule_items` migration had already been applied.
- Confirmed the live `job_schedule_items_update` policy still required
  `archived_at is null` in `USING`.
- Confirmed the live archive failure is a database RLS rejection, not a stale
  deploy or browser-cache issue.
- Attempted to apply the live RLS bugfix, but production policy/trigger changes
  require fresh explicit approval in this environment before they can be run.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.27, HANDOFF Entry 123).

## Entry 125 - Job Schedule archive select-policy fix prepared

**Date:** 2026-07-09
**Updated by:** Codex
**Phase:** Jobs Module Completion / Schedule
**Session type:** bugfix

### Context
After Entry 124's live RLS adjustment was run, Ryan still saw the same Schedule
archive failure in both browsers. A second live-policy check was required
because the update-policy fix alone did not clear the archive transition.

### What Was Completed
- Re-checked the live `job_schedule_items` policy state and confirmed the
  `job_schedule_items_update` policy and archive-protection trigger from Entry
  124 were present in production.
- Re-ran the live authenticated archive simulation and confirmed it still failed
  with `new row violates row-level security policy for table "job_schedule_items"`.
- Proved the remaining blocker is the Schedule `SELECT` path, not the update
  path, by running a rollback-only test that temporarily added manager read
  access and saw the archive update succeed immediately.
- Added `supabase/migrations/202607090001_job_schedule_items_archive_select_rls_fix.sql`
  to grant same-division `can_manage_jobs` users Schedule-row read access needed
  for the soft-archive transition.

### Safety Confirmations
- No new Schedule features were added.
- No application code changed.
- No Job Export work was started.
- No Documents, Financials, Formatting Tuner, inventory, cart, or checkout
  behavior was changed.
- Active Schedule UI still filters `archived_at is null`, so archived items do
  not reappear in the normal list after this fix.
- The added read policy is limited to same-division users who already have
  `can_manage_jobs`.

### Files Changed
- `supabase/migrations/202607090001_job_schedule_items_archive_select_rls_fix.sql`
- `HANDOFF.md`

### Verification
- Confirmed the live `job_schedule_items_update` policy no longer requires
  `archived_at is null`.
- Confirmed the live archive-protection trigger exists.
- Confirmed the live archive simulation still failed before the select-policy
  test.
- Confirmed a rollback-only temporary manager-read policy makes the exact same
  live archive update succeed.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.27, HANDOFF Entry 123).


════════════════════════════════════════════════════════════════════════════
█ DOCUMENT REPAIR — APPROVED BY RYAN — 2026-07-09
════════════════════════════════════════════════════════════════════════════

The two entries immediately above this marker (Entry 124, dated 2026-07-08, and
Entry 125, dated 2026-07-09) were discovered during a Claude architecture
reconciliation session to be physically OUT OF ORDER in this file — Entry 125
had been appended above Entry 124, despite being dated one day later. Both
entries' own Routing Verdict lines cited "HANDOFF Entry 123" as the prior
entry, indicating neither drafting session was aware of the other at the time.

This is the same class of defect previously documented and repaired under
Rule 20 in ARCHITECTURE v2.14 ("HANDOFF Entry 051/052 presentation order
repaired under Rule 20, Entry 056").

Per Constitutional Rule 20, this was surfaced to Ryan rather than silently
corrected. Ryan reviewed the finding and explicitly approved the repair on
2026-07-09. The two entries above have been physically reordered into correct
chronological sequence (124 before 125). Their content is otherwise UNCHANGED
— no facts, decisions, or verification claims were altered, only position.

Entry 126 (immediately below) is the permanent, standard-format log entry for
this repair, for the audit trail.

STANDING POLICY, EFFECTIVE FROM THIS POINT FORWARD:
Any discrepancy found in these coordination documents — ordering defects,
numbering gaps, content conflicts, or any other integrity issue — must be
brought to Ryan for explicit approval before any correction is made. This
applies regardless of which model or session discovers the discrepancy.
Normal append-only logging remains exempt, per the existing Rule 20 carve-out.

════════════════════════════════════════════════════════════════════════════

## Entry 126 - HANDOFF Entry 124/125 ordering defect repaired (Rule 20)

**Date:** 2026-07-09
**Updated by:** Claude
**Phase:** Coordination document integrity
**Session type:** repair (Rule 20)

### Context
During a Claude architecture reconciliation session (Silas AI Assistant
renumbering request), direct inspection of this file found Entry 125 physically
positioned before Entry 124, despite Entry 125 being dated one day later
(2026-07-09 vs. 2026-07-08). Both entries' Routing Verdict lines cited Entry 123
as the prior entry, indicating each was drafted without visibility into the
other — consistent with two separate bugfix sessions each appending after what
they believed was the current tail.

This defect was not identified in the request packet that prompted the
reconciliation session; it was found only by reading the canonical file
directly rather than relying on a summarized checkpoint description.

Precedent: ARCHITECTURE v2.14 documents an identical prior repair ("HANDOFF
Entry 051/052 presentation order repaired under Rule 20, Entry 056").

### What Was Completed
- Confirmed the ordering defect at the byte/line level (Entry 125 at the
  original line 12672, Entry 124 at the original line 12724).
- Surfaced the finding to Ryan per Rule 20, with a recommended resolution
  (physical reorder, matching the Entry 051/052 precedent) and an alternative
  (leave in place with an explanatory note).
- Ryan reviewed and explicitly approved the physical-reorder resolution on
  2026-07-09.
- Entries 124 and 125 were reordered into correct chronological sequence.
  **Content of both entries is unchanged** — only their position in the file
  was corrected. No fact, decision, or verification claim in either entry was
  altered.
- A visible repair marker was inserted immediately following the reordered
  entries, documenting the defect, the approval, and a standing policy for
  handling future discrepancies.

### Safety Confirmations
- No application code changed.
- No schema, RLS, or permission changed as a result of this repair — the
  underlying Schedule archive RLS fix (documented in Entries 124-125
  themselves) was already live and verified prior to this repair.
- No content was deleted or rewritten — this was a position-only correction.
- This repair itself was explicitly approved by Ryan before being applied,
  consistent with Rule 20's requirement that coordination documents are never
  edited or repaired silently.

### Files Changed
- `HANDOFF.md` (Entries 124/125 reordered; repair marker and this entry
  appended)

### Verification
- Confirmed the reordered entries' content is byte-identical to the original,
  only their sequence changed.
- Confirmed no other entry in the file was touched.
- Confirmed HANDOFF is gapless in entry numbering (123, 124, 125, 126) even
  though the pre-repair file had 124/125 reversed in position.

### New Standing Policy (effective from this entry forward)
Any discrepancy found in the coordination documents — ordering defects,
numbering gaps, content conflicts, or any other integrity issue — must be
brought to Ryan for explicit approval before any correction is made, regardless
of which model or session discovers it. Normal append-only logging remains
exempt, per the existing Rule 20 carve-out. This formalizes, as an explicit
standing instruction, what Rule 20 already implied.

### Routing Verdict
Repair approved directly by Ryan (2026-07-09) — Rule 20 satisfied by sole
decision authority approval. No further cross-clearance required for this
repair specifically, though the standing policy above applies to all future
discrepancies.

---
## Entry 127 - Silas (AI Assistant) locked (ARCHITECTURE v2.28, new Section 48); Section 47 delta (Schedule archive RLS fix documentation)

**Date:** 2026-07-09
**Updated by:** Claude
**Phase:** Silas - AI Assistant foundation; Jobs Module - Schedule RLS documentation
**Session type:** decision / architecture / reconciliation

### Context
Job Schedule v1 (Section 47) is live, browser-tested, and its archive/remove
functionality failed live RLS testing after initial deployment. Codex diagnosed
and fixed this across two sessions (Entries 124-125): an UPDATE policy fix,
then a SELECT policy fix, both required together for the soft-archive
transition to succeed. Ryan confirmed live resolution.

Entries 124-125 were also found to be physically out of order in this file;
that defect was repaired immediately prior to this entry (see Entry 126) with
Ryan's explicit approval.

Separately, Ryan requested Silas (AI Assistant) architecture, previously
drafted against a stale checkpoint (v2.27/Entry 124 assumed as prior state).
Reconciled this session against the actual canonical state: v2.27, gapless
through Entry 126 following the repair above. This entry is 127.

### Decisions Made This Session (locked)
- Section 47 delta: documents that Schedule's soft-archive transition required
  TWO coordinated RLS policies (UPDATE + SELECT), not one - archived_at IS
  NULL must not gate the UPDATE policy's USING clause, and the SELECT policy
  must allow same-division can_manage_jobs users to read the row through the
  transition. No design change - soft-archive-only, can_manage_jobs,
  own-division, no hard delete, no new permission flag all remain exactly as
  originally locked. - Claude, documenting Codex's live-verified fix
  (Entries 124-125).
- General principle logged for future RLS work: soft-archive transition
  failures should be checked against BOTH the UPDATE and SELECT policy, not
  the UPDATE policy in isolation - now a known failure shape for this
  project. - Claude.
- Silas: all prior design decisions unchanged from the working session with
  Ryan - permission-aware interface layer; reads only through requesting
  user's own RLS context; Netlify function must use user JWT, not
  service-role, for Supabase reads; Silas never writes directly to business
  tables; approved actions route through existing RPCs/flows only; three
  response options (Approve / Deny / Other-specify), with Other-specify
  producing a revised suggestion; no silent writes; dedicated Silas workspace
  plus floating chat bubble sharing one backend and one conversation history;
  chat history persisted in Supabase, per-user RLS (not division-scoped);
  API key server-side only, never client-exposed; Developer kill switch
  (silas_settings.silas_enabled) enforced server-side in the Netlify function,
  not just hidden client-side; no new permission flags beyond reusing
  can_access_developer for the kill switch; no cross-user chat visibility; no
  direct inventory_balances writes; receipt-derived transactions attach the
  receipt image via the existing Documents path (owner_type='job'); Job
  Export remains unscoped and is not part of Silas. - Ryan (operational
  model, working session), formalized by Claude.
- New section: Section 48 (Silas), filling the "Future AI Assistant" slot
  reserved in Section 4 since the project's original architecture pass. -
  Claude.
- Job Export moves to reserved Section 49 (was reserved as 48; Silas took 48
  since it was ready and Export explicitly is not). - Claude.
- Version advances to v2.28. - Claude.

### Schema Changes
- None applied live in this entry. Section 47 delta is documentation-only -
  the actual schema/RLS was already applied live via the two migrations
  referenced in the Section 47 delta text (202607080001, 202607090001).
- Silas schema (silas_conversations, silas_messages, silas_settings) is
  LOCKED but NOT YET IMPLEMENTED. This entry authorizes the docs update only,
  not implementation.

### Code / File Changes
- None this session (decision/architecture/reconciliation only).

### Lock Document Changes
- ARCHITECTURE -> v2.28: Section 47.2 replaced with the archive RLS delta
  text; new Section 48 (Silas, full text); version line updated.
- Reviewed and finalized by Claude; Ryan applies and commits.
- This entry authorizes a DOCS-ONLY update to ARCHITECTURE.md. It does NOT
  authorize Silas implementation.

### What Codex Needs to Know
- This entry is DOCS-ONLY. Do not implement Silas. Do not touch
  job_schedule_items, its RLS, or any other existing table/RPC/UI - the
  Schedule fix is already live; Section 47's delta only documents it
  retroactively at the architecture level.
- Silas implementation (migration, Netlify function, UI) is a SEPARATE future
  request, gated on Ryan's decision to proceed after this docs update is
  committed.
- When Silas implementation is eventually requested: the single highest-stakes
  preflight item is confirming the Netlify function authenticates to Supabase
  using the requesting user's JWT, not a service-role key - this determines
  whether Silas correctly inherits existing RLS or accidentally gets
  admin-level read access. This must be confirmed explicitly, not assumed.

### What Claude Needs to Know
- Silas design is fully locked and stable. Implementation-prompt generation
  is the next step once Ryan commits this docs-only update, and is a separate
  future request.
- The two-policy soft-archive RLS lesson (Section 47 delta) should be treated
  as a standing checklist item for any future table gaining soft-archive/RLS
  for the first time, not just a one-off Schedule fix.
- The HANDOFF ordering-defect repair (Entry 126) established a standing
  policy: all future coordination-document discrepancies route to Ryan for
  approval before correction. Apply this going forward without being
  re-reminded.

### Next Steps (in order)
1. Ryan applies and commits ARCHITECTURE v2.28 (Section 47 delta + Section 48)
   and this HANDOFF entry.
2. Silas implementation prompt generation happens as a separate future
   request, once the docs-only update is committed.

### Open Questions / Concerns
- (Carried forward) Supabase auth-context approach for the Silas Netlify
  function remains the highest-stakes open implementation question, to be
  resolved at Codex preflight when implementation begins - not part of this
  docs-only entry.

### Architecture Drift Warnings
- CARRIED FORWARD: all Silas reserved items unchanged (proactive actions,
  multi-step autonomous chains, voice I/O, cross-user chat visibility,
  self-modifying configuration, general-purpose feature-flag system beyond
  silas_settings). Job Export remains unscoped, now Section 49.
- CARRIED FORWARD: no direct inventory_balances writes; no new permission
  flags beyond can_access_developer reuse for the Silas kill switch.

### Routing Verdict
No Claude review needed — within locked decisions (ARCHITECTURE v2.28, HANDOFF Entry 127).

---

## Entry 128 - Silas foundation implemented

**Date:** 2026-07-09
**Updated by:** Codex
**Phase:** Silas foundation
**Session type:** implementation

### Context
This is the first implementation pass after the docs-only Silas architecture
lock in ARCHITECTURE v2.28 Section 48. Ryan approved Option A / Phase 1 only:
schema, RLS, global kill switch, Netlify proxy foundation, dedicated workspace
shell, floating bubble shell, and Developer toggle — without any business-data
write capability or advanced suggested actions.

### What Was Completed
- Created `supabase/migrations/202607090002_silas_foundation.sql`.
- Created `public.silas_conversations`.
- Created `public.silas_messages`.
- Created `public.silas_settings`.
- Seeded a single-row Silas settings record with `silas_enabled = true`.
- Enforced the single-row settings convention with a unique index on a constant
  expression.
- Added `set_silas_conversations_updated_at`.
- Added `set_silas_settings_updated_at`.
- Added per-user RLS for Silas conversations/messages.
- Added authenticated read + Developer-only update for `silas_settings` using
  the existing `can_access_developer` effective-permissions pattern.
- Added no DELETE policies on any Silas table.
- Added `netlify/functions/silas-chat.js` as the Silas proxy foundation.
- Confirmed the proxy uses the requesting user's Clerk-issued Supabase JWT for
  Supabase reads/writes by creating the function-side client from the anon/public
  key plus the incoming `Authorization: Bearer <jwt>` header.
- Confirmed the proxy does not use `SUPABASE_SERVICE_ROLE_KEY` and does not use
  service-role plus manual filtering.
- Confirmed the backend checks `silas_settings.silas_enabled` before any
  user-scoped Silas conversation read or Claude API call.
- Added a dedicated Silas workspace shell to the main app navigation.
- Added a floating Silas bubble shell that shares the same conversation history.
- Added a Developer Dashboard Silas Enabled / Silas Disabled toggle.
- Added Developer-visible missing-key messaging for
  `SILAS_ANTHROPIC_API_KEY`.
- Added foundation chat persistence for user/assistant message history through
  the new Silas tables only.

### Safety Confirmations
- No new permission flags were added.
- No existing permissions were changed.
- No existing business-data table RLS/grants/policies were changed.
- No direct `inventory_balances` write path was added.
- No service-role Supabase read path was added for Silas.
- No business-data writes are performed by the Silas proxy.
- No inventory, cart, checkout, Documents, Financials, Schedule, or Formatting
  Tuner behavior was changed beyond shared app-shell exposure of the Silas
  workspace and bubble.
- No Job Export work was started.

### Phase 1 limitations
- No receipt parsing.
- No suggested-action execution.
- No business-data writes.
- No Cart/Checkout wiring.
- No Documents upload wiring.
- No Job Budget Line wiring.
- No Schedule wiring.
- No Job Export.

### Files Changed
- `supabase/migrations/202607090002_silas_foundation.sql`
- `netlify/functions/silas-chat.js`
- `src/hooks/useSilas.js`
- `src/components/SilasPanels.jsx`
- `src/App.jsx`
- `src/styles.css`
- `HANDOFF.md`

### Verification
- Confirmed branch `main`.
- Confirmed working tree was clean before edits.
- Confirmed local `main` matched `origin/main` before edits.
- Confirmed `docs/ARCHITECTURE.md` remained v2.28.
- Confirmed HANDOFF was current through Entry 127 before this append.
- Confirmed Section 48 exists and locks Silas.
- Confirmed Section 48 explicitly requires requesting-user JWT Supabase access,
  not service-role access.
- Confirmed no prior Silas migrations existed in repo.
- Confirmed no prior `silas_conversations`, `silas_messages`, or
  `silas_settings` migrations existed in repo.
- Confirmed no `netlify/functions` implementation existed before this pass.
- Confirmed the frontend already had a reusable authenticated Supabase client
  pattern using Clerk `getToken({ template: 'supabase' })` plus
  `createSupabaseClient(token)`.
- Confirmed the function-side Silas Supabase client is built from anon/public
  credentials plus the requesting user's JWT in the Authorization header.
- Confirmed no `SUPABASE_SERVICE_ROLE_KEY` reference was added.
- Confirmed `silas_settings.silas_enabled` is checked inside the backend
  function.
- Confirmed only one new migration file was added and no existing migration file
  was edited.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Live Supabase migration was not applied in this session and still needs manual
  application if Ryan wants the deployed app to use Silas immediately.
- Netlify env var `SILAS_ANTHROPIC_API_KEY` still needs deployment-time setup or
  verification unless Ryan already configured it in Netlify outside this
  session.

### Routing Verdict
No Claude review needed — Silas foundation stayed within locked decisions (ARCHITECTURE v2.28, HANDOFF Entry 128).

## Entry 129 - Silas foundation live verification

**Date:** 2026-07-10
**Updated by:** Codex
**Phase:** Silas foundation
**Session type:** live verification documentation

### Context
Silas Foundation was implemented under ARCHITECTURE v2.28 Section 48 and
shipped in implementation commit `b459c3a`. Ryan then manually applied the live
Supabase migration, confirmed the Netlify/API-key foundation was sufficiently
configured for responses, and completed a browser-based live verification pass.

### What Was Verified
- Implementation commit `b459c3a` was already pushed before this entry.
- Live Supabase migration
  `supabase/migrations/202607090002_silas_foundation.sql` was applied
  manually.
- Ryan confirmed Silas Phase 1 works live.
- Silas workspace appears when enabled.
- Floating Silas bubble appears when enabled.
- A basic chat message sends successfully.
- Message history persists in the Silas workspace.
- The same conversation/history is shared with the floating bubble.
- Developer Dashboard Silas Enabled / Disabled toggle works.
- Disabled state persists after refresh.
- Re-enabling restores the Silas workspace and bubble.
- The backend foundation response still confirms Phase 1-only behavior:
  `Silas foundation is online. I saved your message about "What can you do in Phase 1?" and will stay inside your existing permissions. Approve/Deny business actions, receipts, and module-specific automations are not enabled yet in Phase 1.`

### Safety Confirmations
- No Approve/Deny business actions are enabled.
- No receipt import is enabled.
- No module-specific automations are enabled.
- No Job Export work was added.
- No business-data writes are enabled from Silas yet.
- No app, schema, RLS, Supabase, or Netlify changes were made in this
  verification entry.

### Files Changed
- `HANDOFF.md`

### Verification
- Confirmed branch `main`.
- Confirmed working tree was clean before this append.
- Confirmed local `main` matched `origin/main` before this append.
- Confirmed `docs/ARCHITECTURE.md` remained v2.28.
- Confirmed HANDOFF latest entry was 128 before this append.
- Confirmed implementation commit `b459c3a` is in history.
- Confirmed migration file
  `supabase/migrations/202607090002_silas_foundation.sql` exists in repo.
- Confirmed no implementation changes were needed for this documentation-only
  pass.
- Confirmed only `HANDOFF.md` changed in this entry.

### Next Steps (in order)
1. Keep Silas Phase 1 as the current live baseline.
2. Scope the next Silas milestone separately before implementation.
3. Do not start receipts, Approve/Deny business actions, module-specific
   automations, or Job Export without a new architecture-cleared task prompt.

### Routing Verdict
No Claude review needed — documentation-only Silas foundation live verification (ARCHITECTURE v2.28, HANDOFF Entry 129).

## Entry 130 - Silas casual conversation enabled

**Date:** 2026-07-10
**Updated by:** Codex
**Phase:** Silas Phase 2A
**Session type:** implementation

### Context
Silas Foundation was already live under ARCHITECTURE v2.28 Section 48, with
the dedicated workspace, floating bubble, per-user chat history, backend kill
switch, and JWT-scoped Supabase access already verified by Ryan. This pass
stayed inside that locked architecture and upgraded the existing Netlify Silas
proxy from the canned Phase 1 foundation reply to real Claude-backed casual
conversation and general Q&A.

### What Was Completed
- Enabled real Claude-backed casual conversation through the existing
  `netlify/functions/silas-chat.js` proxy.
- Refined the server-side Silas system prompt so Silas can handle normal
  conversation and general questions while explicitly staying inside Phase 2A
  limits.
- Preserved server-side-only use of `SILAS_ANTHROPIC_API_KEY`.
- Preserved the backend `silas_settings.silas_enabled` kill-switch check before
  any Claude API call.
- Preserved requesting-user JWT Supabase access for Silas conversation/message
  reads and writes.
- Did not use `SUPABASE_SERVICE_ROLE_KEY` or any service-role Supabase access.
- Preserved per-user chat history and kept conversation context limited to the
  current user's selected conversation only.
- Corrected conversation-context loading so the Claude request includes recent
  messages rather than the oldest messages in the thread.
- Removed the canned fallback assistant reply path so backend Claude failures no
  longer create a fake assistant message.
- Kept the existing Silas workspace and floating bubble.
- Added a clearer in-UI responding state while Silas is waiting on Claude.
- Kept friendly frontend/backend error handling so a failed Claude response
  leaves the saved user message visible without crashing the app.

### Safety Confirmations
- No web search was added.
- No browsing provider was added.
- No receipt parsing was added.
- No suggested-action execution was added.
- No Approve/Deny business action execution was added.
- No business-data writes were added.
- No Cart/Checkout behavior changed.
- No Documents behavior changed.
- No Financials behavior changed.
- No Schedule behavior changed.
- No Inventory behavior changed.
- No Job Export work was started.
- No new migrations were added.
- No new permission flags were added.
- No business-table RLS, grants, or policies were changed.

### Files Changed
- `netlify/functions/silas-chat.js`
- `src/hooks/useSilas.js`
- `src/components/SilasPanels.jsx`
- `src/App.jsx`
- `HANDOFF.md`

### Verification
- Confirmed branch `main`.
- Confirmed working tree was clean before edits.
- Confirmed local `main` matched `origin/main` before edits.
- Confirmed `docs/ARCHITECTURE.md` remained v2.28.
- Confirmed HANDOFF already included Entry 129 before this append.
- Confirmed no migration files changed or were added.
- Confirmed no package files changed.
- Confirmed no business-data write calls were added.
- Confirmed no `SUPABASE_SERVICE_ROLE_KEY` usage was added.
- Confirmed `silas_settings.silas_enabled` is still checked in the backend
  before Claude API calls.
- Confirmed the backend prompt now tells Silas to refuse/defer current web
  lookup because web search is not enabled yet.
- Confirmed the backend prompt now tells Silas not to claim receipt handling or
  action execution that is not enabled yet.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- `node --check netlify/functions/silas-chat.js` passed.
- Live/browser verification of casual conversation, current-info refusal, and
  no-action claims still needs Ryan to test on the deployed app after this
  commit is pushed, because this session did not execute a live Anthropic call.

### Next Steps (in order)
1. Push/deploy this commit.
2. Ryan verifies a normal casual message gets a real Silas reply.
3. Ryan verifies a current/live-info request is refused/deferred because web
   search is not enabled yet.
4. Ryan verifies Silas does not claim it can execute receipts/actions yet.

### Routing Verdict
No Claude review needed — Silas casual conversation stayed within locked decisions (ARCHITECTURE v2.28, HANDOFF Entry 130).

## Entry 131 - Silas Phase 2A assistant response failure bugfix

**Date:** 2026-07-10
**Updated by:** Codex
**Phase:** Silas Phase 2A
**Session type:** bugfix / implementation

### Context
Ryan live-tested Silas Phase 2A after Entry 130 was pushed. The user message
save path succeeded, but the assistant reply failed with:
`Silas could not respond right now. Your message was saved, but no assistant reply was generated. Please try again.`

That exact message came from the inner Claude-request failure branch in the
existing Netlify function, not from the missing-key branch, not from the
empty-response branch, and not from the assistant-message insert path.

### What Was Diagnosed
- Confirmed branch `main`.
- Confirmed working tree was clean before edits.
- Confirmed local `main` matched `origin/main` before edits.
- Confirmed `docs/ARCHITECTURE.md` remained v2.28.
- Confirmed latest HANDOFF entry before this pass was Entry 130.
- Confirmed the latest Silas Phase 2A commit `851c3f4` was present in history.
- Confirmed `netlify/functions/silas-chat.js` exists.
- Confirmed no Job Export work had started.
- Confirmed no receipt/action/business-write work had started.
- Confirmed the function still did not use `SUPABASE_SERVICE_ROLE_KEY`.
- Confirmed the function still checked `silas_settings.silas_enabled` before
  the Claude API call.
- Confirmed the function still used the requesting user's JWT for Supabase
  access.
- Confirmed `SILAS_ANTHROPIC_API_KEY` was referenced exactly by that name.
- Confirmed the live failure Ryan saw maps specifically to the function's
  `claude_unavailable` path.
- Ruled out missing API key as the observed failure, because that branch would
  have returned `missing_api_key`, not the message Ryan saw.
- Ruled out empty content parsing as the observed failure, because that branch
  would have returned the separate `claude_empty` message.
- Ruled out assistant-message insert / post-Claude Supabase failure as the
  observed failure, because those would fall through to the outer generic 500
  branch rather than the specific saved-message / no-assistant-reply branch.
- Narrowed the most likely failure point to the Anthropic HTTP request itself.
- The strongest request-shape mismatch in the pre-bugfix code was the model
  identifier `claude-sonnet-4-20250514`, which did not match Ryan's expected
  direct Anthropic Messages API example and was the highest-probability cause
  of a provider rejection.

### What Was Completed
- Changed the Silas Anthropic model from `claude-sonnet-4-20250514` to
  `claude-3-5-haiku-latest`.
- Increased `max_tokens` from 350 to 800 to align the request more closely
  with the intended casual-conversation Messages API shape.
- Preserved the same endpoint:
  `https://api.anthropic.com/v1/messages`.
- Preserved the same `anthropic-version: 2023-06-01` header.
- Preserved server-side-only use of `SILAS_ANTHROPIC_API_KEY`.
- Preserved the backend kill-switch check before the Claude call.
- Preserved requesting-user JWT Supabase access and did not use service-role.
- Added developer-visible backend error detail passthrough for the
  `claude_unavailable` path so future provider rejections surface the actual
  Anthropic error text to a Developer session instead of only the generic
  assistant failure banner.

### Safety Confirmations
- No web search was added.
- No receipt parsing was added.
- No Approve/Deny business actions were added.
- No business-data writes were added.
- No Job Export work was started.
- No business-table RLS, grants, or policies were changed.
- No new migrations were added.
- No new permission flags were added.

### Files Changed
- `netlify/functions/silas-chat.js`
- `src/hooks/useSilas.js`
- `HANDOFF.md`

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- `node --check netlify/functions/silas-chat.js` passed.
- Confirmed only the Silas function, Silas hook, and HANDOFF changed in this
  bugfix pass.
- Confirmed `SUPABASE_SERVICE_ROLE_KEY` still does not appear in the Silas
  function.
- Confirmed `silas_settings.silas_enabled` is still checked before the Claude
  API call.
- Confirmed `SILAS_ANTHROPIC_API_KEY` is still read exactly by that name.
- Live confirmation of the repaired assistant reply path still requires Ryan to
  test after deployment, because this session did not execute a live Anthropic
  request with production secrets.

### Next Steps (in order)
1. Push/deploy this bugfix.
2. Ryan re-tests a normal Silas message live.
3. If the reply still fails, Ryan checks the new Developer-visible Claude error
   detail in the UI so the exact provider rejection can be captured directly.

### Routing Verdict
No Claude review needed — focused Silas Phase 2A assistant-response bugfix within locked decisions (ARCHITECTURE v2.28, HANDOFF Entry 131).

## Entry 132 - Silas Claude model ID fix

**Date:** 2026-07-10
**Updated by:** Codex
**Phase:** Silas Phase 2A
**Session type:** bugfix / implementation

### Context
Ryan captured the live Silas provider error after Entry 131:
`Anthropic request failed: 404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-3-5-haiku-latest"}...}`

This isolated the root cause to the Anthropic model ID rather than the
Supabase persistence path, kill switch, or JWT-scoped conversation access.

### What Was Completed
- Replaced the Silas Anthropic model ID in
  `netlify/functions/silas-chat.js`.
- Old model: `claude-3-5-haiku-latest`
- New model: `claude-haiku-4-5-20251001`
- Kept the Messages API endpoint unchanged:
  `https://api.anthropic.com/v1/messages`
- Kept the existing request headers unchanged, including
  `anthropic-version: 2023-06-01`.
- Preserved safe backend logging of Anthropic status code/error text without
  exposing secrets.

### Safety Confirmations
- No web search was added.
- No receipt parsing was added.
- No suggested-action execution was added.
- No business-data writes were added.
- No service-role Supabase access was added.
- Backend kill switch was preserved.
- Requesting-user JWT Supabase access was preserved.
- No Job Export work was started.
- No migrations were added.
- No Supabase changes were made.
- No new permission flags were added.

### Files Changed
- `netlify/functions/silas-chat.js`
- `HANDOFF.md`

### Verification
- Confirmed branch `main`.
- Confirmed working tree was clean before edits.
- Confirmed local `main` matched `origin/main` before edits.
- Confirmed `docs/ARCHITECTURE.md` remained v2.28.
- Confirmed latest HANDOFF entry before this pass was Entry 131.
- Confirmed current `netlify/functions/silas-chat.js` used
  `claude-3-5-haiku-latest` before this fix.
- Confirmed `silas_settings.silas_enabled` is still checked before the
  Anthropic call.
- Confirmed `SUPABASE_SERVICE_ROLE_KEY` is still not used.
- Confirmed requesting-user JWT Supabase access is still used.
- `git diff --check` passed.
- `npm.cmd run build` passed.
- `node --check netlify/functions/silas-chat.js` passed.
- Confirmed no migrations changed.
- Confirmed no package files changed.
- Confirmed no web search was added.
- Confirmed no business-data write path was added.

### Next Steps (in order)
1. Push/deploy this model fix.
2. Ryan sends `What can you do right now?` in Silas and confirms a real reply.
3. Ryan refreshes and confirms the reply persists.
4. Ryan asks `Can you search the web?` and confirms Silas says web search is
   not enabled yet.

### Routing Verdict
No Claude review needed — Silas Claude model ID fix stayed within locked decisions (ARCHITECTURE v2.28, HANDOFF Entry 132).

## Entry 133 - Silas chat scroll fix

**Date:** 2026-07-10
**Updated by:** Codex
**Phase:** Silas Phase 2A
**Session type:** UI bugfix / implementation

### Context
Ryan reported that in the dedicated Silas module, after sending a message, the
screen jumped back to the top instead of staying near the latest message and
chat input. Silas casual conversation itself was already working live; this was
an interaction bug in the chat UI only.

### What Was Diagnosed
- Confirmed branch `main`.
- Confirmed working tree was clean before edits.
- Confirmed local `main` matched `origin/main` before edits.
- Confirmed `docs/ARCHITECTURE.md` remained v2.28.
- Confirmed latest HANDOFF entry before this pass was Entry 132.
- Confirmed Silas chat UI files exist:
  - `src/components/SilasPanels.jsx`
  - `src/hooks/useSilas.js`
  - `src/App.jsx`
  - `src/styles.css`
- Confirmed no implementation work was pending outside this safe UI pass.
- Identified the likely root cause as the message thread not being a stable
  internal scroll container inside the dedicated workspace chat card, allowing
  page-level viewport movement during rerender/focus changes after message send
  and response load.

### What Was Completed
- Added a stable scroll-to-latest behavior to the shared Silas message list.
- Added a bottom anchor ref so the chat can scroll to the newest content after:
  - initial message load
  - user send
  - assistant response insert/load
  - active conversation change
- Added pinned-to-bottom detection so the UI stays naturally anchored during
  normal chat flow without needing backend/state changes.
- Added safe textarea refocus after send completion so the input remains easy
  to continue using without forcing the page back to the top.
- Converted the dedicated Silas chat card into a stable two-row layout with an
  internal scrolling message list.
- Applied the same scroll-to-latest behavior to the floating bubble so its chat
  behavior remains sensible too.

### Safety Confirmations
- UI-only change.
- No backend changes were made.
- No Netlify function changed.
- No migrations were added.
- No Supabase changes were made.
- No RLS or permission changes were made.
- No web search was added.
- No memory was added.
- No user-profile read implementation was added.
- No business-data writes were added.
- No Job Export work was started.

### Files Changed
- `src/components/SilasPanels.jsx`
- `src/styles.css`
- `HANDOFF.md`

### Verification
- `git diff --check` passed.
- `npm.cmd run build` passed.
- Confirmed expected files only changed in this pass.
- Confirmed no migrations changed.
- Confirmed no Netlify function changed.
- Confirmed no package files changed.
- Confirmed no backend or business-data logic changed.

### Next Steps (in order)
1. Push/deploy this UI fix.
2. Ryan sends a message in the Silas workspace and confirms the view stays near
   the latest message/input.
3. Ryan sends a second message and confirms the workspace no longer jumps to
   the top.
4. Ryan checks the floating bubble and confirms its scroll behavior is also
   sensible.

### Routing Verdict
No Claude review needed — Silas chat scroll UI fix stayed within locked decisions (ARCHITECTURE v2.28, HANDOFF Entry 133).

## Entry 134 - Granular Permission Overrides superseded placeholder

**Date:** 2026-07-14
**Updated by:** Codex
**Phase:** Coordination sync
**Session type:** alignment

### Context
The local repository stopped at Entry 133, while the authoritative coordination
checkpoint for the Granular Permission Overrides milestone was supplied
externally. ARCHITECTURE v2.29 and final HANDOFF Entry 136 both state that
Entries 134 and 135 are superseded and not implementation-accurate.

### Decisions Made This Session (locked)
- This placeholder exists only to preserve sequential local HANDOFF numbering
  before recording the authoritative final Entry 136 text.
- Do not implement from Entry 134.
- Use Entry 136 only for Granular Permission Overrides work.

### What Codex Needs to Know
- Entry 134 is superseded.
- Entry 135 is superseded.
- Entry 136 is the first implementation-authoritative handoff for this
  milestone in the local repository.

### Next Steps (in order)
1. Record the Entry 135 superseded placeholder.
2. Record the authoritative Entry 136 final text.

### Architecture Drift Warnings
- Entry 134 is not implementation-accurate and is superseded by Entry 136.

### Routing Verdict
No implementation authority here — coordination placeholder only. Use Entry 136.

## Entry 135 - Granular Permission Overrides superseded placeholder

**Date:** 2026-07-14
**Updated by:** Codex
**Phase:** Coordination sync
**Session type:** alignment

### Context
ARCHITECTURE v2.29 and authoritative HANDOFF Entry 136 both state that Entry
135 was a first-pass correction that was later superseded by the second-pass
final correction. The original text was not present in the local repository at
the time of synchronization.

### Decisions Made This Session (locked)
- This placeholder exists only to preserve sequential local HANDOFF numbering
  before recording the authoritative final Entry 136 text.
- Do not implement from Entry 135.
- Use Entry 136 only for Granular Permission Overrides work.

### What Codex Needs to Know
- Entry 135 is superseded and not implementation-accurate.
- Entry 136 is final for Section 17b and supersedes both 134 and 135.

### Next Steps (in order)
1. Record the authoritative Entry 136 final text.
2. Implement from Entry 136 only.

### Architecture Drift Warnings
- Entry 135 is not implementation-accurate and is superseded by Entry 136.

### Routing Verdict
No implementation authority here — coordination placeholder only. Use Entry 136.

## Entry 136 — Granular Permission Overrides: Second Correction Pass (Final)

**Date:** 2026-07-14
**Updated by:** Claude
**Phase:** Architecture Lock Correction (second pass)
**Session type:** Rule 20 Cross-Clearance / Decision

### Context

Entry 135 corrected the identity model, invalid FK, history-loss, and Developer-
escalation gap found in the original Entry 134 draft. Before handing Section 17b
to Codex, Ryan ran a second Rule 20 cross-clearance pass, which surfaced three
additional implementation-blocking issues that would not have been caught until
migration time. This entry documents the final correction.

### What Was Wrong in Entry 135 (identified by second cross-clearance pass)

1. **RLS recursion risk.** The write/read-all access gate called
   `effective_permissions_for_user()`. Once that function is updated to resolve
   overrides (per this same milestone), calling it from inside the override
   table's own RLS policy creates a self-referential loop: RLS on
   `user_permission_overrides` → calls the function → function queries
   `user_permission_overrides` → re-triggers RLS → repeats. This would either
   fail outright or behave unpredictably depending on how Postgres resolves the
   recursion.

2. **Wrong role table.** Entry 135 still said "fetch the user's role from
   `users.role`." There is no `users` table anywhere else in this architecture —
   every other locked section reads identity/role/division from
   `user_permissions`. This was Claude's error, not a change in the underlying
   schema.

3. **Client-writable table.** The original design let authenticated Developers
   write directly to `user_permission_overrides` via an `INSERT` RLS policy,
   with additional validation happening in the application layer. That's weaker
   than this project's server-authoritative standard (Section 17, Non-
   Negotiable Rule) and weaker than the pattern already used for cart-open
   (Section 11) and other sensitive writes, which route through controlled
   RPCs rather than direct table access.

### Final Corrected Design (Section 17b, v2.29, Entry 136 — final)

**Role source (fixed):** `user_permissions.role`, not `users.role`. Codex
confirms the exact live column name before implementation, but the reference
table is `user_permissions`.

**Non-recursive Developer authority check (new):** A dedicated check —
implemented as a small `SECURITY DEFINER` helper function or equivalent inline
query — reads `can_access_developer` directly from the user's role/Owner-path
assignment and never queries `user_permission_overrides`. This same check gates
both:
- who can read all users' override history (vs. only their own), and
- who can call the write RPC.

This works naturally because `can_access_developer` was already excluded from
the override table in Entry 135 — it's never written there and never resolved
from there. Entry 136 makes the non-recursive requirement explicit so Codex
doesn't accidentally wire the check through `effective_permissions_for_user()`
in a way that touches the override table.

**RPC-only writes (new):** All direct client `INSERT`/`UPDATE`/`DELETE` on
`user_permission_overrides` are denied by RLS. Every grant or revoke goes
through one controlled RPC (`set_permission_override`), which in a single
transaction:
1. Verifies the caller's Developer authority (non-recursive check)
2. Rejects targeting `can_access_developer`
3. Rejects targeting another Developer (reserved for the future Owner-only
   path)
4. Validates the permission flag against the canonical Section 17 list
5. Requires a non-null reason
6. Deactivates the user's existing active row for that flag, if any
7. Inserts the new override row
8. Writes the `change_logs` audit entry
9. Commits all of the above atomically

This guarantees the override and its audit record can never end up out of sync
— either both happen or neither does.

**Everything else from Entry 135 stands unchanged:** Clerk identity model,
`permission_flag` validation against the canonical list (not an FK),
partial-unique-index history preservation, manual-only overrides (no
expiration), immediate refresh behavior, and the Owner-only reserved path for
future Developer-access management.

### Lock Document Changes

**ARCHITECTURE.md v2.29 (second-pass corrected)**

- Section 17b fully rewritten a second time with the three corrections above
- Entries 134 and 135 both explicitly marked superseded / not
  implementation-accurate
- Version header updated with the full second-pass correction summary

### What Codex Needs to Know

1. **Use Entry 136 only.** Entries 134 and 135 are both superseded.
2. **Confirm `user_permissions.role` live column name** before implementation —
   the table is settled, the exact column name should still be verified.
3. **Build the non-recursive Developer-authority check first**, before wiring
   any RLS policy or RPC that depends on it. Do not let this check call
   `effective_permissions_for_user()` unless that function's
   `can_access_developer` branch is verified to never touch
   `user_permission_overrides`.
4. **Do not create any RLS `INSERT`/`UPDATE`/`DELETE` policy on
   `user_permission_overrides`.** RLS should deny all direct client writes.
   The only write path is the `set_permission_override` RPC.
5. **The RPC must be atomic** — override row + audit entry in one transaction,
   using the confirmed `change_logs` schema.
6. Confirm `change_logs` schema before implementing the audit write (carried
   over from Entry 135, still applies).

### Next Steps (in order)

1. Ryan confirms this finalized entry and the second-pass corrected
   ARCHITECTURE v2.29
2. Codex confirms live schema: `user_permissions.role` column name and
   `change_logs` column structure
3. Codex builds the non-recursive Developer-authority check
4. Codex builds `set_permission_override` RPC per the nine-step sequence above
5. Codex adds RLS: SELECT-only for clients (own row + Developer-authority
   read-all), deny-all writes
6. Codex updates `effective_permissions_for_user()` per the resolution logic
   (baseline role + active overrides, `can_access_developer` excluded)
7. Ryan tests: grant/revoke via RPC, confirm audit trail, confirm direct
   table writes are rejected, confirm no RLS recursion errors under load,
   confirm developer-targeting and `can_access_developer`-targeting are both
   rejected

### Open Questions / Concerns

None currently. The Owner-only Developer-access path remains a known future
item, not an open question for this milestone.

### Architecture Drift Warnings

None active.

---

## Routing Verdict

**Rule 20 cross-clearance: complete (second pass).** ChatGPT identified three
further implementation-blocking issues after the first correction pass — all
three confirmed against the live document and corrected here. Section 17b is
now final.

**For Codex:** Cleared to proceed with schema confirmation and implementation
per the "What Codex Needs to Know" section above, once Ryan confirms this entry.

**For Claude:** No further architecture review anticipated for this milestone
unless schema confirmation surfaces something Codex cannot resolve alone.

## Entry 137 - Granular Permission Overrides backend foundation implemented

**Date:** 2026-07-14
**Updated by:** Codex
**Phase:** Granular Permission Overrides backend foundation
**Session type:** implementation

### Context
Ryan provided authoritative attachment copies of ARCHITECTURE v2.29
(second-pass corrected) and HANDOFF Entry 136 because the local repo on
`main` still stopped at ARCHITECTURE v2.28 and HANDOFF Entry 133.

Per the milestone preflight, implementation proceeded only after confirming the
actual live/repo shapes for `user_permissions`, `change_logs`,
`effective_permissions_for_user(...)`, existing Clerk JWT identity usage, and
Developer-access gating patterns.

### What Was Diagnosed
- Confirmed branch `main`.
- Confirmed working tree was clean before edits.
- Confirmed local `main` matched `origin/main` at `06884ab`.
- Confirmed local repo docs were behind the authoritative checkpoint:
  - `docs/ARCHITECTURE.md` was still v2.28
  - `HANDOFF.md` still ended at Entry 133
- Confirmed live `public.user_permissions` shape:
  - primary key: `id uuid`
  - Clerk identity: `clerk_user_id text unique`
  - role: `role text`
  - division: `division text`
  - legacy JSON column: `permission_overrides jsonb not null default '{}'::jsonb`
  - no dedicated boolean columns for individual flags
- Confirmed live `public.change_logs` shape:
  - `id`, `user_id`, `user_name`, `table_name`, `record_id`, `action`,
    `before_data`, `after_data`, `note`, `created_at`
  - `action` already allows `permission_change`
- Confirmed live `public.effective_permissions_for_user(...)` shape before this
  pass:
  - args: `(p_role text, p_division text, p_permission_overrides jsonb)`
  - return: `jsonb`
  - security: invoker
  - no `search_path`
  - behavior: role defaults + Admin-division read widening + direct JSON merge
- Confirmed there was no live or repo `user_permission_overrides` table.
- Confirmed current live callers of `effective_permissions_for_user(...)` are
  all current-authenticated-user permission checks, which allowed preserving the
  existing function signature while resolving active overrides by
  `auth.jwt() ->> 'sub'`.
- Confirmed legacy `user_permissions.permission_overrides` data is currently
  empty in live data (`0` non-empty rows), including `0` rows with
  `can_access_developer = true`.
- Identified live inventory/cart RPCs that still merged
  `default_permissions_for_role(...) || permission_overrides` directly instead
  of using `effective_permissions_for_user(...)`; these needed to be updated so
  the new override table would actually take effect in backend enforcement.

### What Was Completed
- Synced `docs/ARCHITECTURE.md` to the authoritative v2.29 header and inserted
  Section 17b from the approved attachment text.
- Backfilled local HANDOFF coordination sync so the repo now carries:
  - Entry 134 superseded placeholder
  - Entry 135 superseded placeholder
  - authoritative Entry 136 final text
- Added migration
  `supabase/migrations/202607140001_granular_permission_overrides_foundation.sql`.
- Created `public.user_permission_overrides` with the locked columns and
  history-preserving partial unique index.
- Enabled RLS on `public.user_permission_overrides`.
- Added a dedicated non-recursive Developer-authority helper:
  `public.current_user_has_developer_access()`
  - reads `can_access_developer` from role plus legacy
    `user_permissions.permission_overrides`
  - never queries `user_permission_overrides`
- Added controlled RPC `public.set_permission_override(...)`:
  - requires authenticated Clerk JWT
  - requires Developer authority via the non-recursive helper
  - rejects `can_access_developer`
  - rejects targeting any user who already has Developer access
  - validates `permission_flag` against the canonical Section 17 list
  - requires non-empty reason capped at 500 chars
  - deactivates the prior active row for the same user/flag
  - inserts the new active row
  - writes `change_logs` action `permission_change`
  - returns inserted row plus previous/new effective permission snapshots
- Added SELECT-only client access on `user_permission_overrides`:
  - self history read
  - Developer read-all history
  - no direct client `INSERT`/`UPDATE`/`DELETE`
- Updated `public.effective_permissions_for_user(...)`:
  - preserved the existing signature and `jsonb` return shape
  - switched implementation to resolve active overrides from
    `user_permission_overrides` for the authenticated caller
  - kept `can_access_developer` on the role/legacy path only
  - prevented `can_access_developer` from ever being sourced from the new table
- Updated direct backend permission call sites so the new override table is
  respected in real RPC enforcement:
  - `open_inventory_cart(...)`
  - `add_inventory_cart_item(...)`
  - both `finalize_inventory_cart(...)` overloads
  - `read_inventory_cart_items(...)`
  - `remove_inventory_cart_item(...)`
  - `retire_bin_item(...)`

### Schema Changes
- New table: `public.user_permission_overrides`
- New partial unique index:
  `one_active_override_per_user_flag`
- New helper function:
  `public.current_user_has_developer_access()`
- Replaced function body:
  `public.effective_permissions_for_user(...)`
- New controlled RPC:
  `public.set_permission_override(...)`
- New RLS policies:
  - `user_permission_overrides_self_read`
  - `user_permission_overrides_developer_read_all`

### Code / File Changes
- `docs/ARCHITECTURE.md`
- `HANDOFF.md`
- `supabase/migrations/202607140001_granular_permission_overrides_foundation.sql`

### Lock Document Changes
- Local `ARCHITECTURE.md` now reflects the approved v2.29 second-pass-corrected
  Section 17b text.
- Local `HANDOFF.md` now contains the authoritative Entry 136 checkpoint and a
  sequential bridge from Entry 133 to Entry 136 before this implementation
  entry.

### What Codex Needs to Know
- The compatibility-preserving implementation keeps the existing
  `effective_permissions_for_user(p_role, p_division, p_permission_overrides)`
  signature intact because all current live callers are current-user checks.
- The new override table is now the active source for user-level grants/revokes
  in the shared effective-permissions resolver.
- `can_access_developer` remains outside the override table and outside the new
  RPC by design.
- The helper used for override-management authority is intentionally separate
  from `effective_permissions_for_user(...)` to avoid RLS recursion on
  `user_permission_overrides`.

### What Claude Needs to Know
- The backend foundation for Section 17b is now implemented in migration form
  and aligned to the final Entry 136 design.
- No UI for override management was built in this pass.
- No Owner-only Developer-access path was built in this pass.

### Verification
- `git diff --check` passed.
- Confirmed local repo status before commit consists only of:
  - `docs/ARCHITECTURE.md`
  - `HANDOFF.md`
  - `supabase/migrations/202607140001_granular_permission_overrides_foundation.sql`
- Confirmed local docs now contain:
  - ARCHITECTURE v2.29
  - Section 17b
  - HANDOFF Entries 134, 135, 136
- Confirmed live schema preflight facts used for implementation:
  - no existing `user_permission_overrides` table
  - `user_permissions.role` exists
  - `change_logs` supports `permission_change`
  - current live `permission_overrides` data is empty
- Live migration execution was **not** performed in this session; this pass
  prepares the migration file and repo updates only.

### Next Steps (in order)
1. Commit and push this backend foundation.
2. Apply the migration in the intended database environment.
3. Ryan tests:
   - grant a non-Developer user permission via `set_permission_override`
   - revoke a permission via `set_permission_override`
   - confirm direct table writes are rejected
   - confirm `change_logs` records the write
   - confirm targeting `can_access_developer` is rejected
   - confirm targeting a Developer user is rejected
4. Build the Developer Console UI for managing overrides in a later milestone.

### Open Questions / Concerns
- Entries 134 and 135 were not available as full local source text during repo
  synchronization; local placeholders were added only to preserve sequential
  numbering before inserting the authoritative final Entry 136.
- Because the migration was not executed live here, runtime verification of the
  SQL itself still depends on applying it in the target Supabase environment.

### Architecture Drift Warnings
- None active relative to Entry 136. This pass stayed within the locked backend
  scope and did not add UI, Owner-path logic, expiration, or new permission
  flags.

### Routing Verdict
No additional Claude review required before migration application — this stayed
inside the locked Section 17b / Entry 136 backend scope after live schema
confirmation.

## Entry 138 - Granular Permission Overrides: Runtime Behavior Confirmed & Documented

**Date:** 2026-07-14
**Updated by:** Claude
**Phase:** Post-Implementation Verification
**Session type:** Documentation / Verification (no schema or behavior change)

### Context

Following Entry 137's backend implementation, Ryan requested inspection of the
live `effective_permissions_for_user()` function body and database role
configuration before beginning permission-flow testing with the two live
Clerk users. This surfaced three facts that were true of the implementation but
not explicitly recorded in Entry 136 or Entry 137. No code, schema, or RLS
policy was changed in this pass — this entry documents confirmed runtime
behavior only.

### What Was Verified

1. **Caller-scoped resolution only.** Inspected the live function definition
   via `pg_get_functiondef()`. Confirmed `effective_permissions_for_user()`
   resolves active overrides using `auth.jwt() ->> 'sub'` internally, with no
   parameter accepting an arbitrary target Clerk user ID. The function can only
   return the calling session's own effective permissions. Confirmed this is
   safe for all current call sites (all check-caller-own-access), and recorded
   as a permanent design boundary: this function must not be reused or have its
   signature changed to check another user's permissions. Any future feature
   needing that (e.g., an admin view of another user's access) requires a new,
   explicitly target-scoped function.

2. **Legacy JSONB is single-purpose.** Confirmed via the same function body
   inspection that `user_permissions.permission_overrides` (the legacy JSONB
   column) is read for exactly one flag: `can_access_developer`. All other
   flags resolve exclusively from `default_permissions_for_role()` plus active
   rows in `user_permission_overrides`. This was implied but not explicit in
   Entry 137's summary; now recorded directly.

3. **No RLS recursion — mechanism confirmed.** Ran:
   ```sql
   select p.proname, r.rolname, r.rolbypassrls
   from pg_proc p
   join pg_roles r on r.oid = p.proowner
   where p.proname = 'effective_permissions_for_user';
   ```
   Confirmed live result: owner `postgres`, `rolbypassrls = true`. Combined
   with `effective_permissions_for_user()` being `SECURITY DEFINER`, this
   function's internal read of `user_permission_overrides` bypasses that
   table's RLS entirely, which is what prevents the recursion risk originally
   flagged in the second Rule 20 cross-clearance pass (Entry 136). Confirmed
   this is a distinct, non-conflicting mechanism from the separate
   non-recursive `current_user_has_developer_access()` helper, which avoids
   recursion by never querying the override table at all rather than by
   bypassing RLS. Both are correct and serve different purposes; they should
   not be collapsed into a single mechanism.

### What Was Completed

- Added a new "Confirmed Runtime Behavior" subsection to Section 17b in
  `docs/ARCHITECTURE.md`, recording all three findings above as permanent,
  load-bearing facts about the system rather than transient implementation
  notes.
- Version header updated to reflect this documentation-only pass.

### Schema Changes

None. This entry is documentation-only.

### Code / File Changes

- `docs/ARCHITECTURE.md` (Section 17b addition, version header)
- `HANDOFF.md` (this entry)

### What Codex Needs to Know

- No action required. This confirms existing behavior; nothing to implement or
  change.
- If a future milestone requires checking another user's effective
  permissions, do not modify `effective_permissions_for_user()`'s signature or
  behavior — build a new, separately named, explicitly target-scoped function
  instead, and route that through Claude review first per Section 17b.

### What Claude Needs to Know

- Section 17b now contains a permanent record of these three runtime facts.
  Future architecture review involving `effective_permissions_for_user()`
  should treat caller-scoped resolution and legacy-JSONB single-purpose
  behavior as settled, documented constraints, not open questions.

### Next Steps (in order)

1. Ryan proceeds with the planned test sequence (grant/revoke via
   `set_permission_override`, audit trail confirmation, direct-write rejection
   test using `set role authenticated` or a real app session, Developer/
   `can_access_developer` targeting rejection) using the two live Clerk users.
2. No further documentation work is required for Section 17b unless testing
   surfaces a genuine discrepancy.

### Open Questions / Concerns

None. All three items in this pass were verification/documentation only; no
open items resulted.

### Architecture Drift Warnings

None active.

---

## Routing Verdict

**No Rule 20 cross-clearance required.** This entry documents confirmed runtime
behavior of already-locked, already-implemented functionality; it does not
change architecture, schema, or permission semantics. Informational record only.

**For Codex:** No action required.

**For Claude:** Treat the three confirmed facts in this entry as settled going
forward; no further review needed on this topic absent a new discrepancy.

## Entry 139 - Northgate UI System Locked (Cross-Application Visual Standard)

**Date:** 2026-07-14
**Updated by:** Claude
**Phase:** Architecture Lock — UI/Navigation Standard
**Session type:** Architecture-Sensitive UI Decision (docs-only)

### Context

Ryan approved a reference mockup (attached image, this session) establishing
the target visual and navigation direction for the entire Northgate HQ v2
application — global header, primary/secondary sidebars, workspace layout
hierarchy, table density, color language, and responsive behavior. This entry
locks that direction as new Section 50 in ARCHITECTURE.md, per the existing
governance process for architecture-sensitive UI decisions.

This is a **docs-only lock**. No React, CSS, Supabase, migration, or runtime
work was performed or authorized in this session.

### What Was Reviewed

- The approved reference mockup (Dashboard/Jobs view showing global header,
  primary sidebar "My Jobs" workspace, secondary sidebar "Active Jobs" status
  list, selected-job record header, and the existing horizontal detail tabs)
- The full written design-direction brief accompanying the mockup
- The complete existing ARCHITECTURE.md for conflicts, with particular
  attention to Section 42 (Workspace Detail Sub-Navigation Pattern)

### Conflict Identified and Resolved

**Section 42 vs. new sidebar concept.** Section 42 (locked v2.24) states "no
sidebar for job sub-nav" within a selected record's detail view. The new
design direction introduces primary/secondary sidebars at the workspace
level. These operate at different layers of the shell — the sidebar governs
navigation *between* records/views; Section 42's horizontal tabs govern
navigation *within* a selected record's detail surface — and are not
actually in conflict. However, the proximity of the two concepts warranted an
explicit reconciliation statement rather than leaving it to inference. Section
50.1 states this directly: Section 42 remains fully in force and unchanged;
the new sidebars never appear inside a selected record's detail view and never
replace the horizontal tab pattern.

No other conflicts were found. Permission-aware navigation, protected-column
hiding, and responsive requirements all restate existing locked rules
(Section 17, Section 17 `can_view_financials`, Constitutional Rule 18) rather
than introducing new ones.

### What Was Locked

New Section 50 ("Northgate UI System") in `docs/ARCHITECTURE.md`, covering:

- Global application header (branding, permission-aware top nav, compact
  profile menu)
- Primary sidebar (stable workspace navigation, existing routes/permissions
  only)
- Optional secondary sidebar (filters/saved views/status groups; one
  consistent meaning per workspace; never replaces Section 42 tabs)
- Main workspace structural hierarchy
- Table density standard and protected-column omission rule (restates
  `can_view_financials`, no new flag)
- Summary card usage guidance
- Permission-aware rendering (restates existing server-authoritative rule,
  no new mechanism)
- Color/styling language (Northgate red as active-state accent; bright green
  excluded from nav)
- Spacing/hierarchy standard
- Full responsive behavior spec for desktop/tablet/mobile (Constitutional
  Rule 18 compliance, designed in from Phase 1)
- Reusable design-system primitive naming (illustrative, not a required file
  layout)
- Locked three-phase rollout sequence
- Explicit out-of-scope list
- Implementation gate (docs-only; does not authorize code)

### Lock Document Changes

**ARCHITECTURE.md v2.29 → v2.30**

- New Section 50 appended after Section 48 (Section 49 remains reserved for
  Job Export, unchanged, no collision)
- Version header updated with the v2.30 summary

### What Codex May Implement First (Phase 1 scope)

- The reusable application shell primitives (AppShell, TopNavigation,
  PrimarySidebar, SecondarySidebar, WorkspaceHeader, TabBar, etc. — naming
  flexible) and design tokens (color, spacing, typography per Section 50.8–
  50.9)
- Conversion of the **Inventory module** to the new shell, with all existing
  Inventory functionality, permissions, and business rules preserved exactly
- Responsive behavior for the shell across desktop/tablet/mobile, per Section
  50.10, built in from the start (not retrofitted)

### What Remains Out of Scope (this milestone and Phase 1)

- Jobs, Estimates, Employees, Vehicles, Developer, and Silas module
  conversions (Phase 2/3 — sequenced later)
- Any change to Section 42's horizontal detail-tab pattern
- Any schema change, migration, new permission flag, new RPC, or direct
  database write
- Any change to inventory ledger, checkout, Jobs financial logic,
  authentication, or Section 17b (granular permission override) behavior
- Any new route or module not already approved elsewhere in this document

### What Codex Needs to Know

1. Build the shell and design tokens first; convert Inventory second. Do not
   start Jobs/Estimates/etc. shell conversion until Phase 1 is confirmed
   stable.
2. Every existing Inventory permission check, RLS policy, and business rule
   carries over unchanged — this is a presentation-layer conversion only.
3. Section 42 is not being touched. When Phase 2 (Jobs) begins, the existing
   horizontal detail-tab implementation is reused as-is inside the new shell,
   not rebuilt.
4. Protected columns (e.g., financial data gated on `can_view_financials`)
   must be omitted from table markup entirely for unauthorized users — not
   rendered blank/masked client-side.
5. Responsive behavior is not a follow-up task — build mobile/tablet behavior
   alongside desktop in the same implementation pass, per Constitutional Rule
   18.

### Next Steps (in order)

1. Ryan confirms this entry and ARCHITECTURE v2.30
2. Codex scopes Phase 1: shell primitives + design tokens + Inventory
   conversion, as a Bucket classification per Section 35
3. Codex implements Phase 1, preserving all existing Inventory functionality
4. Ryan reviews Phase 1 against the reference mockup and existing Inventory
   behavior before Phase 2 (Jobs) begins

### Open Questions / Concerns

None blocking. The Section 42/sidebar reconciliation above resolves the only
ambiguity found during review.

### Architecture Drift Warnings

None active.

---

## Routing Verdict

**Docs-only architecture lock, Rule 20 cross-clearance not required** — this
session did not touch schema, permissions, RPCs, or business logic; it
resolved one internal-consistency question (Section 42 vs. new sidebars) by
direct textual reconciliation within the same document, which does not rise
to the cross-model clearance threshold used for backend/security-sensitive
changes.

**For Codex:** Cleared to scope and begin Phase 1 (shell + Inventory
conversion) per the "What Codex May Implement First" section above, once Ryan
confirms this entry and the updated ARCHITECTURE v2.30.

**For Claude:** No further review needed for this milestone unless Phase 1
implementation surfaces a conflict with Section 42 or existing Inventory
permission logic that Codex cannot resolve alone.

## Entry 140 - Northgate UI shell adopted for Inventory

**Date:** 2026-07-14
**Updated by:** Codex
**Phase:** Northgate UI System Phase 1
**Session type:** implementation

### Context
Phase 1 implementation proceeded from the locked UI checkpoint in
`docs/ARCHITECTURE.md` v2.30 and `HANDOFF.md` Entry 139 after confirming:

- branch `main`
- clean pre-edit working tree
- local `HEAD` matched `origin/main`
- starting commit `165eb327fe8f920f01f93b596910a47dc8a05abe`
- Section 50 was present
- Section 42 remained unchanged and compatible with the workspace-shell
  decision

This pass stayed inside the approved presentation-only scope: reusable shell,
shared design tokens, Inventory conversion, and responsive behavior. No
schema, RPC, permission, auth, audit, ledger, checkout, or business-rule work
was authorized or performed.

### What Was Diagnosed
- Confirmed the existing app shell and Inventory presentation still lived
  inside a monolithic `src/App.jsx`.
- Confirmed the current live Inventory experience already included these
  implemented surfaces and needed to remain wired to their existing handlers:
  - Inventory Overview
  - Accounting Export
  - Catalog Preview
  - Storage Browser
  - Locations & QR
  - Scan QR
  - Label Designer
  - Tool Catalogue
  - Cart Checkout
  - Inventory Count & Correction
  - Transactions
- Confirmed the new shell had to preserve the direct location-scan path, the
  existing top-level workspaces, and the current permission-aware module
  visibility model.
- Confirmed the project has no separate automated test command beyond
  `npm run build`.

### What Was Completed
- Added reusable light-theme design tokens for the locked Northgate visual
  system:
  - Northgate red brand and selected-state tints
  - page/surface/border/text/status colors
  - radius, shadow, spacing, header height, and sidebar width variables
- Added reusable shell/layout components:
  - `AppShell`
  - `TopNavigation`
  - `PrimarySidebar`
  - `SecondarySidebar`
  - `WorkspaceHeader`
  - `SummaryCard`
- Added shared shell/layout styles for:
  - persistent global header
  - responsive top navigation
  - collapsible primary sidebar
  - optional secondary context sidebar
  - light workspace surfaces, compact operational spacing, and selected-state
    red accents
  - print-mode suppression of shell/navigation chrome
- Integrated the new shell into `Dashboard()` while preserving existing
  workspace routing and authorization behavior.
- Converted Inventory from the old read-only shell wrapper into the new
  `InventoryWorkspacePanel`, keeping the existing live panels and handlers for:
  - overview
  - accounting export
  - catalog
  - storage
  - locations / QR
  - scan flow
  - labels
  - tool catalogue
  - cart
  - count / correction
  - transactions
- Added Inventory-specific section metadata, summary-card counts, sidebar
  navigation, and a context rail without creating new routes.
- Preserved the direct location-scan route under the new global shell.
- Left Dashboard, Jobs, Estimates, Employees, Vehicles, Silas, and Developer
  internal workflows functionally unchanged aside from inheriting the new
  top-level shell.

### Code / File Changes
- `HANDOFF.md`
- `src/App.jsx`
- `src/main.jsx`
- `src/components/layout/AppShell.jsx`
- `src/components/layout/PrimarySidebar.jsx`
- `src/components/layout/SecondarySidebar.jsx`
- `src/components/layout/TopNavigation.jsx`
- `src/components/ui/SummaryCard.jsx`
- `src/components/ui/WorkspaceHeader.jsx`
- `src/styles/layout.css`
- `src/styles/tokens.css`

### Lock Document Changes
- None. `docs/ARCHITECTURE.md` remained at v2.30 and was not edited.
- Prior HANDOFF checkpoint remained Entry 139; this entry appends Entry 140
  only.

### What Claude Needs to Know
- This pass stayed inside the locked Section 50 / Entry 139 presentation scope.
- Inventory now uses the Northgate shell primitives, but no backend or
  permission semantics were changed.
- Jobs/Estimates/Employees/Vehicles/Silas/Developer still need future
  workspace-level visual conversion if later phases authorize it.

### Verification
- Confirmed preflight before edits:
  - branch `main`
  - clean working tree
  - local `HEAD` = `origin/main` = `165eb327fe8f920f01f93b596910a47dc8a05abe`
  - ARCHITECTURE v2.30
  - HANDOFF gapless through Entry 139
- `cmd /c npm run build` passed.
- `git diff --check` passed aside from a line-ending warning on `src/main.jsx`
  caused by Git normalization; no whitespace error blocked the build.
- Confirmed no migration files were added or changed.
- Confirmed no backend files, Supabase schema files, RLS files, or RPC files
  were changed in this pass.
- Confirmed the new shell/layout/style files contain no direct Supabase
  `insert`, `update`, `delete`, `rpc`, or `inventory_balances` write path.
- Confirmed print-specific shell suppression exists in `src/styles/layout.css`
  so the new navigation chrome does not appear in print mode.
- Confirmed responsive behavior was implemented in code for:
  - desktop default / 1440px class of layout
  - 1279px secondary-sidebar collapse
  - 1024px primary-sidebar drawer behavior
  - 768px compact mobile/tablet spacing
  - 390px narrow-screen action wrapping
- Manual logged-in runtime verification was not completed in this session.
  Browser-authenticated exercise of Inventory workflows, Clerk profile menu,
  and responsive interaction states remains pending.
- The final implementation commit hash was not yet knowable at the moment this
  entry was written; it is the commit that introduces Entry 140 and is
  reported in the session summary / git history.

### Next Steps (in order)
1. Review the visual result in a logged-in browser session at desktop, tablet,
   and mobile widths.
2. Exercise the existing Inventory read/action paths non-destructively:
   section switching, catalog, storage, cart, count, transactions, scan, and
   print/export surfaces as permissions allow.
3. If runtime verification is clean, proceed with future module conversions in
   later phases rather than expanding scope inside this commit.

### Open Questions / Concerns
- The approved mockup image was not available as a directly inspectable local
  image file in the workspace attachments during this session, so visual
  implementation followed the locked written design brief plus the current app
  structure.
- Because runtime browser/auth testing was not completed here, the responsive
  layout and shell interactions are verified by build output and code review,
  not by full live operator walkthrough.

### Architecture Drift Warnings
- None active. This pass stayed inside ARCHITECTURE v2.30 / Entry 139 and did
  not alter Section 42, schema, RPCs, permissions, auth, or inventory source
  of truth.

### Routing Verdict
No Claude review needed before commit/push - this implementation stayed within
the locked Phase 1 UI shell + Inventory conversion scope from ARCHITECTURE
v2.30 / HANDOFF Entry 139 and did not cross backend or architecture-sensitive
boundaries.

## Entry 141 - Theme alignment follow-up for Northgate UI shell and Jobs workspace

**Date:** 2026-07-14
**Updated by:** Codex
**Phase:** Northgate UI System follow-up refinement
**Session type:** implementation

### Context
Ryan supplied a new approved visual reference image after Entry 140 and asked
for the same general shell direction to be retuned toward that lighter
construction-dashboard aesthetic. The specific requested addition was a
`Create Job` action on the far-left Jobs navigation rail.

This pass was treated as a presentation-only refinement on top of the pushed
Phase 1 shell commit. No architecture, schema, permission, RPC, auth, or
business-rule work was authorized.

### What Was Diagnosed
- Confirmed the app repo was clean on `main` at starting commit
  `f88db7402dae8fbd5e80e307b436dd06f7d8dd21`.
- Confirmed the reference image emphasizes:
  - flatter white header treatment
  - red underline active navigation
  - softer warm page background
  - lighter panel borders and shadows
  - dual-left-rail Jobs layout
  - `Create Job` as a prominent far-left action
- Confirmed the existing Jobs workspace already had real live create/edit/view
  flows, so the new left-rail `Create Job` action should call the current
  `startNewJob()` path instead of creating a parallel flow.
- Confirmed the current Jobs schema/read model does **not** expose PM /
  superintendent fields like the mockup image, so the visual adaptation had
  to stay within actual available job fields.

### What Was Completed
- Retuned shared shell tokens and layout styling closer to the supplied
  reference:
  - warmer white / light-cream page background
  - flatter white header
  - slimmer top navigation with red underline active state
  - lighter borders and softer shadows
  - wider application content area
- Updated the global shell branding treatment so the app header reads more like
  a product wordmark than a page-title banner.
- Reworked the Jobs workspace into a more reference-aligned dashboard layout:
  - far-left utility rail
  - left status/filter rail
  - main jobs directory panel
  - selected-job detail panel below / alongside existing detail tabs
- Added the requested far-left `Create Job` action and wired it to the
  existing `startNewJob()` behavior.
- Added status-rail filters for:
  - All Jobs
  - Active Jobs
  - On Hold
  - Completed
  - Cancelled
- Restyled the selected-job header and overview summary to better match the
  supplied design language while preserving the existing detail-tab pattern.
- Kept all existing Jobs create/edit/archive/detail flows on their current
  handlers and Supabase paths.

### Code / File Changes
- `HANDOFF.md`
- `src/App.jsx`
- `src/styles/layout.css`
- `src/styles/tokens.css`

### Lock Document Changes
- None. `docs/ARCHITECTURE.md` remained at v2.30 and was not edited.
- Prior HANDOFF checkpoint remained Entry 140; this entry appends Entry 141
  only.

### What Claude Needs to Know
- This was a design-alignment follow-up, not a new architecture pass.
- The Jobs workspace now visually borrows more from the supplied reference
  image, but it still uses the same existing Jobs data fields and handlers.
- The left-rail `Create Job` action is presentation-only and simply routes into
  the already existing create-job flow.

### Verification
- Confirmed starting commit:
  `f88db7402dae8fbd5e80e307b436dd06f7d8dd21`
- `cmd /c npm run build` passed.
- Confirmed only UI-layer files changed:
  - `src/App.jsx`
  - `src/styles/layout.css`
  - `src/styles/tokens.css`
  - `HANDOFF.md`
- Confirmed no migrations, schema files, RLS files, RPC files, auth files, or
  permission files changed in this pass.
- Confirmed the requested `Create Job` left-rail action calls the existing Jobs
  workspace create flow rather than introducing a new write path.
- Manual logged-in runtime testing was not completed in this session.
  Browser-authenticated verification of the refined Jobs layout and its mobile
  interaction states remains pending.
- The final implementation commit hash was not yet knowable at the moment this
  entry was written; it is the commit that introduces Entry 141 and is
  reported in the session summary / git history.

### Next Steps (in order)
1. Review the refined shell and Jobs workspace visually against the supplied
   reference image.
2. In a logged-in browser session, test:
   - far-left `Create Job`
   - status-rail filtering
   - jobs search
   - selected-job switching
   - detail-tab navigation
3. If the refined theme is approved, continue applying the same visual language
   to later module phases without changing protected backend boundaries.

### Open Questions / Concerns
- The supplied reference image contains PM / superintendent / revenue-style
  fields that are not all present in the current live Jobs foundation, so the
  implementation matched the visual system rather than reproducing unavailable
  fields literally.
- Runtime browser verification is still needed for final confidence on mobile
  and tablet Jobs interactions.

### Architecture Drift Warnings
- None active. This pass stayed inside the UI/presentation layer and did not
  alter schema, RPCs, permissions, auth, or Section 42 detail-tab behavior.

### Routing Verdict
No Claude review needed before commit/push - this follow-up remained inside
the locked Northgate UI presentation scope and did not cross backend or
architecture-sensitive boundaries.

## Entry 142 - Jobs rails made collapsible and shell corners sharpened

**Date:** 2026-07-14
**Updated by:** Codex
**Phase:** Northgate UI System refinement
**Session type:** implementation

### Context
Ryan requested one more visual refinement pass after Entry 141:

- make the Jobs side panels collapsible like the supplied reference image
- sharpen the corner radius across the interface so the shell feels more like
  the mockup and less pill-rounded

This remained a presentation-only follow-up on top of the pushed Jobs-theme
alignment commit. No backend, schema, auth, permission, or business-rule work
was authorized.

### What Was Diagnosed
- Confirmed starting commit:
  `04336f205897034a021a4375d65298cec677eaad`
- Confirmed the Jobs utility rail and Jobs status rail were static-width panels
  with no user-controlled collapse state.
- Confirmed the shell still relied on radius values that were softer/rounder
  than the supplied reference, especially on cards, controls, rails, and Jobs
  detail surfaces.

### What Was Completed
- Added independent collapse state for both Jobs side rails:
  - far-left utility rail
  - Jobs status/filter rail
- Added desktop collapse/expand controls for each rail and reduced the grid
  widths when either rail is collapsed.
- Preserved useful collapsed affordances:
  - utility rail keeps icon-only actions
  - status rail keeps compact short-label glyphs
- Sharpened the shared visual language by reducing radius values across the
  shell:
  - card radius
  - control radius
  - rail radius
  - selected-job header radius
  - supporting fact-card / icon-panel radius
  - search/filter input radius
  - button radius
- Kept the existing Jobs create/view/edit/archive flows unchanged while
  applying the new collapse behavior.

### Code / File Changes
- `HANDOFF.md`
- `src/App.jsx`
- `src/styles/layout.css`
- `src/styles/tokens.css`

### Lock Document Changes
- None. `docs/ARCHITECTURE.md` remained at v2.30 and was not edited.
- Prior HANDOFF checkpoint remained Entry 141; this entry appends Entry 142
  only.

### What Claude Needs to Know
- This pass only adds presentational collapse behavior and radius refinement.
- The collapsible Jobs rails do not introduce any new route, permission, or
  data write path.
- The left-rail `Create Job` action from Entry 141 remains wired to the
  existing create-job behavior.

### Verification
- `cmd /c npm run build` passed.
- Confirmed only UI-layer files changed:
  - `src/App.jsx`
  - `src/styles/layout.css`
  - `src/styles/tokens.css`
  - `HANDOFF.md`
- Confirmed no migrations, schema files, RLS files, RPC files, auth files, or
  permission files changed in this pass.
- Confirmed the collapse behavior is local UI state only and does not affect
  existing Jobs data loading or write semantics.
- Manual logged-in runtime testing was not completed in this session.
  Browser verification of the collapsed-rail interactions and narrow-screen
  behavior remains pending.
- The final implementation commit hash was not yet knowable at the moment this
  entry was written; it is the commit that introduces Entry 142 and is
  reported in the session summary / git history.

### Next Steps (in order)
1. Review the sharper-radius shell and the collapsible Jobs rails visually.
2. In a logged-in browser session, test:
   - collapse and expand on both Jobs rails
   - left-rail `Create Job`
   - status-rail filtering after collapse/expand
   - selected-job switching and detail-tab navigation
3. If the corner language now feels right, carry the sharper radius system
   into later module conversions for consistency.

### Open Questions / Concerns
- The collapse behavior is currently scoped to the Jobs rails, which matches
  the most direct interpretation of Ryan's request and the supplied image.
- Runtime visual confirmation is still needed for final polish on the
  collapsed desktop state and tablet/mobile layout feel.

### Architecture Drift Warnings
- None active. This pass stayed entirely within UI presentation scope and did
  not alter schema, RPCs, permissions, auth, or Section 42 detail-tab rules.

### Routing Verdict
No Claude review needed before commit/push - this stayed inside the locked UI
presentation scope and did not cross backend or architecture-sensitive
boundaries.

## Entry 143 - Jobs Create mode split from All Jobs browse view

**Date:** 2026-07-14
**Updated by:** Codex
**Phase:** Northgate UI System refinement
**Session type:** implementation

### Context
Ryan requested one behavior correction after Entry 142:

- `Create Job` should operate as its own left-panel function
- navigating to `All Jobs` should show only the jobs list, not the create form

This was a UI behavior refinement only. No backend or permission work was
authorized.

### What Was Diagnosed
- Confirmed the Jobs workspace still fell back to the create-job form whenever
  no job was selected.
- Confirmed that made `All Jobs` behave like a browse-plus-form state instead
  of a pure directory view.
- Confirmed the desired fix was to separate browse mode from create mode rather
  than changing the existing save handler or introducing a new route.

### What Was Completed
- Added an explicit Jobs workspace mode split:
  - `browse`
  - `create`
- Updated the left-rail `Create Job` action to open the create panel
  intentionally instead of relying on the no-selection fallback.
- Updated `All Jobs` / status navigation to:
  - clear the selected job
  - exit create mode
  - return to a pure jobs directory view
- Updated job row selection / edit flows to return the workspace to normal
  browse mode before showing the selected-job detail surface.
- Updated the create panel to include a direct `Back to All Jobs` action.
- Removed the automatic behavior where `All Jobs` implicitly displayed the
  create form when no job was selected.

### Code / File Changes
- `HANDOFF.md`
- `src/App.jsx`

### Lock Document Changes
- None. `docs/ARCHITECTURE.md` remained at v2.30 and was not edited.
- Prior HANDOFF checkpoint remained Entry 142; this entry appends Entry 143
  only.

### What Claude Needs to Know
- This is a behavior correction inside the Jobs presentation layer, not a new
  feature milestone.
- `Create Job` now behaves as an explicit mode, while `All Jobs` behaves as a
  pure browse state.
- The existing job save path and write semantics were preserved exactly.

### Verification
- `cmd /c npm run build` passed.
- Confirmed only `src/App.jsx` plus this HANDOFF entry changed in this pass.
- Confirmed no schema, migration, RPC, RLS, auth, or permission files changed.
- Confirmed the new behavior is local UI state only and does not alter existing
  Jobs create/edit data writes.
- Manual logged-in runtime testing was not completed in this session.
  Browser verification of `Create Job`, `All Jobs`, and detail switching
  remains pending.
- The final implementation commit hash was not yet knowable at the moment this
  entry was written; it is the commit that introduces Entry 143 and is
  reported in the session summary / git history.

### Next Steps (in order)
1. In a logged-in browser session, test:
   - left-rail `Create Job`
   - `Back to All Jobs`
   - `All Jobs` status selection
   - job row selection after returning to browse mode
2. If the browse/create separation feels correct, keep this state model for any
   future Jobs workspace refinements.

### Open Questions / Concerns
- None blocking. This pass was a targeted state-model correction with no
  backend impact.

### Architecture Drift Warnings
- None active. This pass stayed entirely within the Jobs UI state layer.

### Routing Verdict
No Claude review needed before commit/push - this remained inside locked UI
presentation scope and did not cross backend or architecture-sensitive
boundaries.

## Entry 144 - Build remaining Northgate module layouts

**Date:** 2026-07-15
**Updated by:** Codex
**Phase:** Northgate UI System Phase 3
**Session type:** implementation

### Context
Ryan requested the application-wide layout foundation pass for the remaining
top-level Northgate HQ modules while preserving the existing shell, Inventory,
and Jobs behavior:

- Dashboard
- Estimates
- Employees
- Vehicles
- Silas
- Developer

This remained a front-end presentation/layout pass only. No backend, schema,
permission, RPC, authentication, ledger, audit, or business-rule changes were
authorized.

### Starting Point
- Starting commit: `32ea81926781586b611f3a48d4c4d23ab366c858`
- Architecture version confirmed: `v2.30`
- Previous HANDOFF checkpoint confirmed: `Entry 143`
- `Section 50` remained present and authoritative
- `Section 42` remained present and authoritative
- `main` matched `origin/main` before edits and `git pull --ff-only origin main`
  reported `Already up to date.`

### What Was Diagnosed
- Confirmed the shared Northgate shell already existed in:
  - `src/components/layout/AppShell.jsx`
  - `src/components/layout/TopNavigation.jsx`
  - `src/components/layout/PrimarySidebar.jsx`
  - `src/components/layout/SecondarySidebar.jsx`
- Confirmed `Jobs` already carried the explicit browse/create split from
  Entry 143 and remained the correct structural reference for record-oriented
  modules.
- Confirmed `Dashboard`, `Estimates`, `Employees`, and `Vehicles` still
  rendered placeholder workspace cards.
- Confirmed `Silas` already had working chat behavior but needed a more
  polished workspace wrapper only.
- Confirmed `Developer` already had live status/utility content but was not
  yet presented as a clearer Northgate module workspace.
- Confirmed the existing Inventory read model already exposed live destination
  user and destination vehicle references that could safely support
  presentation-only Employees and Vehicles directory shells.

### What Was Completed
- Built a role-aware Dashboard workspace shell with:
  - workspace header
  - compact real-data summary cards
  - quick links into real modules
  - notices/attention region
  - honest placeholders for activity/schedule regions that do not yet have an
    approved live data source
- Built an Estimates workspace foundation with:
  - primary rail views
  - explicit browse vs create state
  - selected-record shell
  - honest no-data / not-yet-implemented states
  - no fabricated estimate records or financial values
- Built an Employees workspace foundation with:
  - directory/list shell
  - selected employee detail shell
  - horizontal detail tabs
  - `My Information` view
  - live destination-user reference rows where available
  - no role, permission, or account-management editing
- Built a Vehicles workspace foundation with:
  - directory/list shell
  - selected vehicle detail shell
  - horizontal detail tabs
  - live destination-vehicle reference rows where available
  - no fabricated assignment, service, mileage, or maintenance records
- Polished the Silas workspace presentation around the existing chat behavior:
  - shared workspace header
  - shared disabled-state presentation
  - preserved existing conversation/message/composer behavior
- Reframed the Developer module inside a clearer Developer workspace shell
  around the already existing diagnostics and utilities.
- Added reusable presentation primitives shared across the new workspaces:
  - `src/components/ui/StatePanel.jsx`
  - `src/components/ui/RecordHeader.jsx`
  - `src/components/ui/WorkspaceTabs.jsx`
- Extended shared layout CSS for:
  - state panels
  - selected-record headers
  - horizontal tabs
  - workspace summary grids
  - directory/detail module panels
  - quick-link cards
  - responsive module behavior

### Routes / Local UI State Affected
- Preserved existing top-level workspace routing semantics using the existing
  `workspace` query-string model.
- Added local presentation state only for:
  - Dashboard sidebar view selection
  - Estimates sidebar view selection
  - Estimates explicit create/browse mode
  - Employees sidebar view selection
  - Employees selected employee and active detail tab
  - Vehicles sidebar view selection
  - Vehicles selected vehicle and active detail tab
  - shared sidebar mobile-open / collapsed presentation state
- Added no database-backed UI preference persistence and no new routes.

### Files Changed
- `HANDOFF.md`
- `src/App.jsx`
- `src/components/SilasPanels.jsx`
- `src/components/ui/RecordHeader.jsx`
- `src/components/ui/StatePanel.jsx`
- `src/components/ui/WorkspaceTabs.jsx`
- `src/styles/layout.css`

### Lock Document Changes
- None. `docs/ARCHITECTURE.md` remained at `v2.30` and was not edited.
- Prior HANDOFF checkpoint remained `Entry 143`; this entry appends
  `Entry 144` only.

### Verification
- `git status` reviewed before and after implementation.
- `git diff --stat` and `git diff` reviewed.
- `cmd /c npm run build` passed.
- No repository test command existed beyond `build`; no additional automated
  test suite was available to run in this repository.
- Confirmed changed files stayed in the UI/presentation layer plus this
  HANDOFF append.
- Confirmed no migration files were added.
- Confirmed no schema, RPC, RLS, auth, permission, ledger, audit, financial,
  or business-rule files were edited in this pass.
- Confirmed no new direct Supabase writes were introduced for the new layout
  foundations; new shared module shells either reused existing read-model data
  or rendered honest placeholders.
- Confirmed Inventory and Jobs were preserved as existing modules and were not
  intentionally reworked in this pass.
- Confirmed `Create Job` remains separate from `All Jobs` browse mode.
- Logged-in browser runtime verification was not completed in this session.
  Responsive inspection at `1440px`, `1024px`, `768px`, and `390px` remains
  pending in a browser session.
- Browser print-preview verification was not completed in this session.
  Existing print-hiding rules were preserved and extended only at the shared
  shell/layout layer.

### Remaining Deferred Functionality
- Dashboard recent activity, schedule/deadline surfaces, and richer notices
  still need approved live sources before they can move beyond placeholders.
- Estimates still needs its approved read path, create flow, selected-record
  data source, and any permission-gated financial rendering.
- Employees still needs approved employee source-of-truth detail surfaces such
  as assignments, credentials, documents, and activity.
- Vehicles still needs approved assignment, service, documents, and history
  sources.
- Silas still needs logged-in runtime verification for narrow-screen layout
  polish after this presentation update.
- Developer still needs browser-authenticated visual verification, but no new
  backend utilities were introduced.

### Architecture Drift Warnings
- None active. This pass stayed inside locked Northgate UI presentation
  boundaries and did not alter protected backend behavior.

### Routing Verdict
No Claude review needed before commit/push - this remained inside locked
Northgate UI decisions (`ARCHITECTURE v2.30`, `HANDOFF Entry 143`) and did not
cross backend or architecture-sensitive boundaries.

## Entry 145 - Refine Dashboard Inventory and Jobs UI

**Date:** 2026-07-15
**Updated by:** Codex
**Phase:** Northgate UI System Phase 3
**Session type:** implementation

### Context
Ryan requested a focused UI refinement pass on top of Entry 144 to make the
Dashboard behave like a personal work center, remove Inventory-heavy summary
presentation from Dashboard and Inventory, and tighten the Jobs selected-record
tab presentation without changing backend behavior or authorization rules.

This remained a front-end presentation/layout pass only. No backend, schema,
permission, RPC, authentication, ledger, audit, financial, inventory write, or
business-rule changes were authorized.

### Starting Point
- Starting commit:
  `3c85de48ab936e47df2743608011756a3a6c4d83`
- Architecture version confirmed: `v2.30`
- Previous HANDOFF checkpoint confirmed: `Entry 144`
- `Section 50` remained present and authoritative
- `Section 42` remained present and authoritative
- `main` matched `origin/main` before edits and `git pull --ff-only origin main`
  reported `Already up to date.`

### What Was Diagnosed
- Confirmed the Entry 144 Dashboard still behaved like a module overview with
  Inventory-oriented metrics and quick links instead of a personal work-center
  shell.
- Confirmed the Inventory workspace still rendered a large top
  `Inventory Command Center` summary region plus a right-side context rail that
  Ryan explicitly wanted removed.
- Confirmed the Inventory left module-sections rail needed a stronger sticky +
  scroll container treatment so long section lists would remain usable.
- Confirmed the Jobs selected-record tab strip was still too loose at common
  desktop widths and could cause tabs to wrap or feel crowded.
- Confirmed the repository exposes estimate permissions but does not expose an
  approved Job-to-Estimate relationship or a production estimate read path in
  the current UI layer.
- Confirmed the current Jobs read model does not expose worker,
  superintendent, or project-manager assignment fields that would safely power
  a personalized `My Work` dashboard section.
- Confirmed the current vehicle reference source does not expose direct
  user-assignment or reporting relationships that would safely power
  personalized `My Vehicles` views.
- Confirmed the current tool catalogue exposes company tool rows but does not
  provide an approved user-linked personal-tools data model for Dashboard use.
- Confirmed universal Job visibility / authorization rules were left untouched
  in this pass.

### What Was Completed
- Rebuilt Dashboard as a personal work-center layout with the left rail
  sections:
  - `My Info`
  - `My Work`
  - `My Vehicles`
  - `My Tools`
  - `My Estimates` only when estimate permissions apply
  - `My Preferences`
- Removed Inventory-specific counts, command-center summaries, quick-link
  launch cards, and the right context rail from Dashboard.
- Bound `My Info` only to approved current-user / permission context already
  available in the application:
  - authenticated name
  - email
  - phone when present
  - role
  - division
- Kept `My Work`, `My Vehicles`, `My Tools`, `My Estimates`, and
  `My Preferences` honest by rendering explicit deferred states where approved
  live sources do not yet exist.
- Added direct module launch actions from deferred dashboard states only where
  the full module already exists:
  - `Jobs`
  - `Vehicles`
  - `Tools`
  - `Estimates`
- Simplified Inventory by removing:
  - the top `Inventory Command Center` header block
  - toolbar meta chips
  - count-summary cards
  - the right `Inventory Context` rail
- Kept the Inventory module content, existing navigation, read model, and
  Silas entry behavior intact while moving the active section header into the
  main workspace surface.
- Added a direct Inventory `Refresh` action at the active section header.
- Tightened sidebar layout CSS so the primary module-sections rail remains
  sticky and independently scrollable on desktop while falling back cleanly on
  mobile.
- Compacted the Jobs selected-record tab strip so all eight tabs fit more
  reliably at standard desktop widths.
- Added an honest disabled selected-job estimate action only for users who can
  estimate or approve estimates, explicitly indicating that no approved
  Job-to-Estimate relationship exists yet.

### Routes / Local UI State Affected
- Preserved the existing top-level `workspace` query-string routing model.
- Preserved existing Jobs routing / selection behavior and did not alter
  authorization gates.
- Reduced Dashboard dependency on the shared Inventory read model so Dashboard
  no longer loads Inventory summary data just to render overview cards.
- Added no new persisted preferences, no localStorage preference writes, and no
  new routes.

### Files Changed
- `HANDOFF.md`
- `src/App.jsx`
- `src/styles/layout.css`

### Lock Document Changes
- None. `docs/ARCHITECTURE.md` remained at `v2.30` and was not edited.
- Prior HANDOFF checkpoint remained `Entry 144`; this entry appends
  `Entry 145` only.

### Verification
- `git fetch origin` and `git pull --ff-only origin main` completed before the
  refinement pass; local `main` was already current with `origin/main`.
- `git status`, `git diff --stat`, and `git diff` were reviewed during the
  pass.
- `cmd /c npm run build` passed.
- No repository test command existed beyond `build`; no additional automated
  test suite was available to run in this repository.
- Confirmed changed files stayed in the UI/presentation layer plus this
  HANDOFF append.
- Confirmed no schema, migration, RPC, RLS, auth, permission, ledger, audit,
  financial, or business-rule files were edited in this pass.
- Confirmed no Inventory write flow, cart behavior, count behavior, or
  transaction behavior was intentionally changed in this pass.
- Confirmed Job visibility authorization rules were deliberately not changed.
- Confirmed the Job estimate action is presentational only and does not invent
  an estimate relationship, read path, or write flow.
- Logged-in browser runtime verification was not completed in this session.
- Responsive inspection at common widths remains pending in a browser session,
  although the updated sidebar and tab-strip CSS compiled successfully.
- The final implementation commit hash was not yet knowable at the moment this
  entry was written; it is the commit that introduces Entry 145 and is
  reported in the session summary / git history.

### Remaining Deferred Functionality
- `My Work` still needs an approved assignment source for workers,
  superintendents, and project managers before it can render personalized job
  lists.
- `My Vehicles` still needs approved assignment and reporting relationships
  before it can render personal or direct-report vehicle lists.
- `My Tools` still needs an approved personal-tools data model before the
  dashboard can distinguish personal tools from the general company catalogue.
- `My Estimates` still needs an approved estimate read model plus any approved
  Job-to-Estimate relationship before dashboard or job-detail estimate views can
  become live.
- `My Preferences` still needs an approved persistence strategy before it can
  move beyond layout reservation and deferred states.
- Authenticated browser verification remains pending for the refined Dashboard,
  Inventory, and Jobs presentation at desktop and mobile breakpoints.

### Architecture Drift Warnings
- None active. This pass stayed inside locked Northgate UI presentation
  boundaries and did not alter protected backend behavior.

### Routing Verdict
No Claude review needed before commit/push for this pass because it remained
inside locked UI presentation scope. Claude review is still required before any
future change to universal Job visibility or authorization behavior.

## Entry 146 - NGG-PM Integration: Architecture Review Complete, Decisions Captured, Lock Pending Cross-Clearance

**Date:** 2026-08-02
**Updated by:** Claude
**Phase:** Architecture Review (pre-lock)
**Session type:** Decision Capture / Review â€” NO architecture change made

### Context

Ryan directed a review of using the standalone NGG-PM app
(`RNSolutions-electrical/NGG-PM`, deployed at
`rnsolutions-electrical.github.io/NGG-PM/`) as the basis for the selected-Job
workspace inside Northgate HQ. Claude inspected the NGG-PM source directly
(`index.html`, 53,781 bytes, single file, no external scripts) alongside the
full ARCHITECTURE v2.30 and HANDOFF through Entry 145.

The complete review is captured in
`NGG-PM_Integration_Architecture_Review.md` (delivered to Ryan this session).

**This entry records decisions only. No ARCHITECTURE.md change has been made
and none is authorized yet.** All schema-affecting decisions below are pending
Rule 20 cross-clearance.

### Findings â€” four conflicts with locked architecture

1. **Multi-division projects (structural).** NGG-PM projects span Electrical
   and Construction simultaneously â€” budget lines, schedule tasks, permits,
   and checklists each carry their own division inside one project. Northgate
   `jobs.division` is single-valued NOT NULL and is the RLS access gate
   (Â§38.1, Â§38.4). A single NGG-PM project cannot be represented as one
   Northgate Job under current architecture.
2. **Budget columns.** NGG-PM stores Actual / Committed / Forecast. Â§44.2
   explicitly excludes `actual_amount` and `committed_amount`; Â§44.9 reserves
   actual and committed cost.
3. **Schedule dependencies.** NGG-PM has predecessor, lag, duration, computed
   dates, and Gantt. Â§47.0 locks Schedule v1 as "flat milestone/task list
   onlyâ€¦ does not model dependencies"; Â§47.5 explicitly reserves Dependencies.
4. **No owner exists** for PM Checklist, Permits, or Inspections.

### Defects identified in NGG-PM (must not be ported)

- **Checklist completion is positionally keyed** (`phaseIndex_taskIndex`
  against a template hardcoded in source). Inserting one item silently
  re-maps every subsequent completion to the wrong task.
- **JSON import is a blind whole-state overwrite** â€” no validation, no
  version check, no diff, no confirmation.
- **Client-side PIN gate** (`requestPin()`) guards edit mode. Incompatible
  with Â§17's server-authoritative rule; must not survive in any form.
- Schedule task IDs are sequential integers referenced as free text by
  `predecessor`; migration to UUID requires a stable display sequence.

### Ryan's Decisions (16 of 16, all captured)

**Authorization model:**
1. Any authenticated user may open any Job and see basic operational
   information. Financial values remain gated. *(This collapses the
   multi-division conflict â€” the job header stops being a division access
   gate.)*
2. Permission checks are wired in from day one, with flags granted broadly via
   `user_permission_overrides` (Â§17b) initially. Tightening later is a data
   change, not a code change. **Deferring the checks themselves was
   explicitly rejected.**
3. Financial queries are division-scoped **at the query layer** from the
   start â€” not fetched broadly and filtered client-side.

**Budget (Conflict 2):**
4. Add `budget_changes`, `actual_amount`, `committed_amount`,
   `forecast_to_complete` as **manual PM planning inputs**, explicitly
   labeled non-accounting. Auto-derivation from the ledger was rejected as
   materially incomplete (material only â€” no labor, no subs).
5. Budget category remains required (Â§44.3 CHECK constraint unchanged).
6. Summary card totals show the viewer's own division.

**Schedule (Conflict 3):**
7. Add `duration`, `predecessor`, `lag`, `trade` plus computed dates and
   Gantt.
8. Northgate's existing status vocabulary is retained
   (`pending`/`in_progress`/`complete`/`delayed`); NGG-PM's four map onto it.

**Checklist (Conflict 4):**
9. Master template editing is Developer-only.
10. PMs may add job-specific items on top of the template.

**Structure:**
11. Permits & Inspections get their own tab.
12. `jobs` gains `pm_user_id`, `superintendent_user_id`, `foreman_user_id`
    (Clerk TEXT per Â§17b identity model) and `gc_company`.
13. Export: Job info, contacts, permits, inspections, schedule, checklist,
    document metadata (names only). Budget only with `can_view_financials`.
    **No materials, buyout, or transaction data** â€” ledger-adjacent data must
    not be duplicated into a portable file.
14. **No JSON import in this integration.** Export only.
15. Codex Phase 1 is a read-only visual port.
16. Existing Jobs workspace retained behind a feature flag until parity is
    confirmed.

**Navigation:** Option B extended â€” Northgate's eight locked tabs remain
canonical (Â§42 unchanged), plus PM Checklist and Permits & Inspections.
NGG-PM's four-tab structure is absorbed, not adopted; this avoids the
Budgets/Financials and Schedules/Schedule duplication.

### Anticipated ARCHITECTURE changes (NOT YET APPLIED)

Pending cross-clearance, the lock is expected to require:

- Â§38 delta â€” job assignment columns, `gc_company`, and the changed meaning of
  `jobs.division` (label rather than access gate)
- Â§44 delta â€” the four manual budget columns
- Â§47 delta â€” the four schedule columns + computed dates
- New sections â€” PM Checklist (templates + instances), Job Permits &
  Inspections, Job Contacts, JSON Export
- Â§42 note â€” two added tabs
- Â§50 note â€” PM workspace visual integration
- New tables â€” `job_contacts`, `job_permits`, `job_inspections`,
  `checklist_templates`, `checklist_template_items`, `job_checklist_items`
- **No new permission flags.** Everything maps to existing `can_manage_jobs`,
  `can_approve_budget`, `can_view_financials`, `can_view_all_divisions`.

### What Codex is authorized to do NOW

**Phase 1 only â€” read-only visual port.** This requires no architecture change
and may proceed in parallel with cross-clearance:

- Build NGG-PM's screens as React components inside the existing Northgate
  shell, restyled to Northgate red/white/gray
- Bind read-only to data that already exists; render unlocked columns as
  visibly disabled placeholders, never fabricated values
- Reuse existing shell components; no second design system
- Responsive from this pass (Constitutional Rule 18)
- Route behind a feature flag, Developer-only; existing Jobs workspace stays
  default and untouched

**Codex must NOT, in Phase 1:** create or alter any table, column, migration,
RLS policy, or RPC; add or modify any permission flag or check; write to any
table; modify the existing Jobs workspace; port the PIN gate, localStorage
persistence, HTML-save, dark theme, mobile-preview toggle, or JSON import.

### Next Steps (in order)

1. ChatGPT Rule 20 cross-clearance on the direction above
2. Claude corrects per findings
3. Claude writes the ARCHITECTURE lock (expected v2.31) and the next HANDOFF
   entry
4. Codex Phase 1 (read-only visual port) â€” may run in parallel with 1â€“3
5. Codex Phases 2+ (schema deltas) â€” blocked until the lock exists

### Open Questions / Concerns

Cross-clearance should specifically examine: whether `jobs.division` changing
from access gate to label creates problems in any locked section; whether
universal Job visibility conflicts with Â§17a's division-scoping principle as
applied elsewhere; whether manual budget actuals create a competing source of
truth against Â§37/Â§43 ledger rules; whether the new tables' soft-archive RLS
requires the Entries 124â€“125 two-policy pattern; and whether any of this
requires a permission flag not already canonical.

### Architecture Drift Warnings

None active. No architecture change was made in this session.

---

## Routing Verdict

**ChatGPT Rule 20 cross-clearance required before any ARCHITECTURE.md edit.**
Decisions are captured and internally consistent, but every schema-affecting
item above is pending review.

**For Codex:** Phase 1 (read-only visual port) is authorized now and requires
no lock. All schema work is blocked until the ARCHITECTURE lock is written and
cross-cleared.

**For Claude:** Write the ARCHITECTURE lock only after cross-clearance findings
are returned and corrected.

## Entry 147 - Add read-only NGG-PM Jobs preview

**Date:** 2026-08-03
**Updated by:** Codex
**Phase:** NGG-PM Integration Phase 1
**Session type:** implementation

### Context
Ryan requested Phase 1 of the NGG-PM integration into Northgate HQ v2 and
provided the missing Entry 146 HANDOFF artifact. Before implementation, Codex
confirmed the downloaded HANDOFF matched the repository through Entry 145 and
appended Entry 146 exactly as the required authorization baseline. Entry 146 was
then committed and pushed as a documentation-only checkpoint before application
work began.

Starting commit for the implementation pass:
`63b60d5` (`Document NGG-PM integration architecture review`).

Prior application-code checkpoint remained:
`8c5c490` (`Refine Dashboard Inventory and Jobs UI`).

Architecture version confirmed: `v2.30`.
Prior HANDOFF checkpoint confirmed: `Entry 146`.
Entry 146 was physically present in the repository before implementation and
explicitly authorized Phase 1 only: a read-only visual port, Developer-only,
feature-flagged, with no schema, persistence, permission, RLS, RPC, backend, or
write-path changes.

The complete NGG-PM source inspected for this pass was the standalone
`RNSolutions-electrical/NGG-PM/index.html` downloaded from GitHub raw source.
`NGG-PM_Integration_Architecture_Review.md` was searched for in the repository
and was absent.

### What Was Completed
- Added source-controlled feature flag:
  `ENABLE_NGG_PM_READ_ONLY_PREVIEW`.
- Added a Developer-only selected-job launch action:
  `PM Workspace Preview`.
- Kept the existing selected-Job workspace as the default experience.
- Added a read-only `pm-preview` Jobs workspace mode separate from:
  - All Jobs browse mode
  - Create Job mode
  - the existing selected-Job detail tabs
- Added clear back paths from the preview to:
  - Current Job Workspace
  - All Jobs
- Built the PM preview sections:
  - Overview
  - Budgets
  - Schedules
  - PM Checklist
  - Permits & Inspections
- Reused the existing Northgate shell, `RecordHeader`, `StatePanel`,
  `SummaryCard`, and `WorkspaceTabs`.
- Kept the Northgate red / white / gray visual identity and did not port the
  standalone NGG-PM blue/navy theme.

### Schema Changes
None.

### Code / File Changes
- `src/App.jsx`
- `src/styles/layout.css`
- `HANDOFF.md`

### Lock Document Changes
None. `docs/ARCHITECTURE.md` remains v2.30 and was not edited.

### What Was Implemented
- Overview binds only to existing selected Job fields:
  - job number
  - job name
  - address
  - status
  - division
  - description
  - notes
- General Contractor / client, Project Manager, Superintendent, contacts,
  permits, and inspections render as honest not-yet-connected states.
- Budget preview uses existing authorized `job_budget_lines` rows only.
- Budget columns render in the requested NGG-PM order:
  Division, Cost Code, Description, Original, Budget Changes, Revised, Actual,
  Committed, Forecast to Complete, Forecast Final, Remaining, Notes.
- Existing available Budget values bind from current rows:
  - division
  - cost_code
  - description
  - budget_amount as Original
  - note as Notes
- Unavailable Budget fields render as disabled placeholder cells, not zero:
  - Budget Changes
  - Actual
  - Committed
  - Forecast to Complete
- Budget calculation utilities distinguish unavailable values from real zero and
  only calculate derived values when every required input is available.
- Schedule preview uses existing `job_schedule_items` rows only.
- Existing available Schedule values bind from current rows:
  - title/task
  - division
  - status
  - target_date as Manual Start
  - description/note
- Unavailable Schedule fields render as disabled placeholder cells:
  - duration
  - predecessor
  - lag
  - trade
  - computed finish
- Schedule calculation utilities stay pure and do not fabricate dependencies or
  duration bars.
- Gantt preview renders only real dated schedule rows as milestone markers.
  It does not fabricate duration bars.
- PM Checklist renders from an isolated temporary constant copied as a
  read-only Phase 1 presentation template.
- PM Checklist controls are real disabled checkboxes; no completion state is
  stored.
- Permits and Inspections render empty table structures with honest empty
  states and no add/save controls.
- Added responsive safeguards:
  - `min-width: 0` grid/flex containment
  - contained table overflow
  - compact preview tabs
  - mobile card conversion for Budget and Schedule
  - sticky identifying columns where practical
  - contained Gantt horizontal scroll
- Added print behavior so preview controls, back controls, shell navigation,
  sidebars, and Silas bubble are hidden in print. The active preview section is
  what prints.

### What Codex Needs to Know
- This is a Developer-only preview behind a source-controlled feature flag.
- It does not replace the production selected-Job workspace.
- It does not add production PM Checklist or Permits tabs.
- It does not widen Job visibility.
- It does not add a new permission flag.
- It does not modify any Supabase table, migration, RPC, RLS policy, auth,
  audit, inventory, financial, or business rule.
- It does not write to Supabase and does not add local browser persistence.
- The existing Jobs workspace remains default and intact.

### Verification
- Required preflight passed after Entry 146 was appended, committed, and pushed:
  - branch `main`
  - local `main` matched `origin/main`
  - working tree clean before implementation
  - `8c5c490` present in lineage
  - Entry 146 present in repository
  - ARCHITECTURE v2.30 present
- `npm ci` was run because `node_modules` was missing on this machine.
- `npm run build` passed.
- `git diff --check` passed.
- Repository has no existing test script beyond `build`; no unit test framework
  is configured, so no focused automated utility tests were added in this pass.
- Safety scans of the diff found no new Supabase write calls:
  `.insert(`, `.update(`, `.delete(`, `.upsert(`.
- Safety scans found no new browser persistence:
  `localStorage`, `sessionStorage`, `indexedDB`.
- Safety scans found no PIN gate, JSON import, JSON restore, HTML save, dark
  theme toggle, mobile-preview toggle, migration change, RPC change, RLS change,
  permission change, or architecture change introduced by this pass.
- Only UI/application files plus this HANDOFF append changed.
- Authenticated browser runtime verification was not completed in this session.
  Manual verification remains required for Developer vs normal-user visibility,
  live selected-job data, responsive widths, and print output.
- Final implementation commit hash was not knowable at the moment this entry was
  written; it is the commit that introduces Entry 147 and is reported in the
  session summary / git history.

### Next Steps (in order)
1. Ryan performs logged-in runtime verification with a Developer account.
2. Verify a normal user does not see `PM Workspace Preview`.
3. Verify the current selected-Job workspace remains the default.
4. Verify the preview at 1440px, 1024px, 768px, and 390px.
5. Verify browser print output for each PM preview section.
6. Continue Rule 20 cross-clearance for schema-affecting Phase 2/3 decisions.

### Open Questions / Concerns
- Runtime visual QA is still pending because authenticated browser testing was
  not available in this implementation session.
- `NGG-PM_Integration_Architecture_Review.md` was referenced by Entry 146 but
  was not present in the repository.
- `npm ci` reported existing dependency warnings, including high-severity audit
  findings and an `@clerk/clerk-react` deprecation warning. These were not
  changed in this Phase 1 UI pass.

### Architecture Drift Warnings
- Phases 2 and 3 remain blocked until the architecture lock is written and
  ChatGPT Rule 20 cross-clearance is complete.
- Do not implement universal Job visibility, schema deltas, PM Checklist
  persistence, Permits persistence, Inspections persistence, Job Contacts,
  JSON export/import, or any PM write path from this preview.

### Routing Verdict
No Claude review needed for Phase 1 implementation — explicitly authorized as a
read-only visual port by ARCHITECTURE v2.30 / HANDOFF Entry 146. Phases 2 and 3
remain blocked pending architecture lock and ChatGPT Rule 20 cross-clearance.
