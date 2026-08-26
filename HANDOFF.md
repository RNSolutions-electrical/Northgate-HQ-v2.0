Y™Áäx-ÆÈ‹j◊ù¢Îi∫⁄+äßj[hëÈ‹¢ÈÌﬂO}Ôç}◊}{o+^≤â¢∂◊ù# Northgate HQ v2.0 ‚Äî Handoff Log
### Repository: RNSolutions-electrical/Northgate-HQ-v2.0
### Rule: Append only. Never edit prior entries. Entries are permanent record.
### Before writing a new entry: read the last entry number and increment. Never reuse a number.

## Entry Format Standard

Every HANDOFF entry uses this exact structure. The header block is mandatory;
body sections are included when they apply, always in this order; omit a section
only if it is genuinely empty.

```
## Entry NNN[ ‚Äî optional short title]

**Date:** YYYY-MM-DD
**Updated by:** <Claude | Codex | Ryan>
**Phase:** <phase / milestone>
**Session type:** <implementation | review | decision | alignment>

### Context
### What Was Completed   (implementation)  ‚Äî or ‚Äî
### Review Findings       (review)          ‚Äî or ‚Äî
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
**Phase:** Pre-build ‚Äî Architecture Lock and Schema Planning
**Session type:** Architecture Review + Schema Planning

### Current Project State
v2.0 is a clean-slate rebuild of Northgate HQ on a locked architecture.
v1 (`Northgate-HQ`) remains intact as a working backup ‚Äî do not touch it.
All infrastructure is new and separate from v1.

### Infrastructure
- GitHub: `RNSolutions-electrical/Northgate-HQ-v2.0`
- Supabase: New project ‚Äî same naming scheme as repo
- Netlify: New deployment ‚Äî v1 remains live separately
- Clerk: Shared with v1 ‚Äî same publishable key
- Google Sheets: `Northgate HQ ‚Äî Master Data Workbook` (ID: `1mD_d0tyZy1wEuJtxIkTyRhL9cy-s1PchH6-3OOL7L94`)

### Documents in This Repo
- `HANDOFF.md` ‚Äî this file, cumulative session log
- `docs/ARCHITECTURE.md` ‚Äî Architecture Lock Document v2.1, authoritative
- `docs/INVENTORY_SCHEMA.md` ‚Äî Inventory Schema Plan v2.3, ready for SQL

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

**Cost structure order (locked):** Material markup ‚Üí Overhead ‚Üí Profit (independent
percentages, sequential).

**Permissions:** Roles ‚Äî Developer, Administrator, Project Manager, Estimator, Field
Supervisor, User (Field Tech). Flags: see Architecture Lock Document Section 17.

**Google Sheets:** Master Data Workbook is the bulk data entry interface. App UI handles
one-off edits for authorized users. Supabase is the live source of truth ‚Äî Sheets is not.

**Data in the Google Sheet (as of this entry):** Materials ‚Äî hundreds of live rows with
full cascade (broad_category ‚Üí sub_category ‚Üí sub_category_2 ‚Üí sub_category_3 ‚Üí size);
Employees ‚Äî real team data; Vehicles ‚Äî E-101 (2019 Chevrolet Express 2500); Cost Codes ‚Äî
Northgate Division 16 electrical codes; Assemblies ‚Äî E-REC-001; Inventory Levels ‚Äî bins
A111, C211‚ÄìC224 with real stock data.

**Known data cleanup needed before import:** Material_Categories has blank field_name on
some sub_category_2 rows; Cost_Codes code `16,050.00` needs to be plain text `16050`.

### What Was Completed in Pre-Build
- Architecture Lock Document v2.1 finalized
- AI Development Roles document finalized
- Inventory Schema Plan reviewed across versions (v1 ‚Üí v2.1 ‚Üí v2.2 ‚Üí v2.3)
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
**Phase:** Migration Review ‚Äî Inventory Balance Finalization
**Session type:** Cross-model implementation review / fresh-session handoff

### Current Active Repository
Correct working repo: `RNSolutions-electrical/Northgate-HQ-v2.0`.
Do NOT use `RNSolutions-electrical/Northgate-Estimator-V2.0` ‚Äî that was a repo-name
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
- App job-cost remains partial by design ‚Äî internal-stock movements only. Direct/AP
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
**Phase:** Phase 1 Inventory ‚Äî Post-Migration Architecture Review
**Session type:** Architecture Review (mid-build trigger: inventory balance + status semantics)

### What Was Reviewed
Reviewed the applied Phase 1 migration (Entries 003‚Äì006) against the Architecture Lock
Document. Focus: ledger_sequence / approved-only balance behavior and the
`transaction_items.status` semantics flagged for Claude review in Entry 002.

### Findings
**Technical implementation ‚Äî approved, no changes needed.** ledger_sequence is the correct
deterministic ordering mechanism. occurred_at separated from created_at is correct and was
a good addition not in the v2.3 plan; backdated-entry handling via
`occurred_at DESC, ledger_sequence DESC` is sound. pg_advisory_xact_lock per bin with
sorted/deduped lock order is proper concurrency safety. Approved-only balances and
physical-count-correction-as-baseline logic fix the original additive bug.

**Architecture decision resolved ‚Äî status semantics.** The shift of
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
- Section 14 "Pending Job Cost Review" ‚Üí "Two Distinct Approval Concepts" with subsections
  for physical movement (14a), reserved job-cost approval (14b), app job-cost scope (14c).
- Constitutional rule 15: physical movement approval and accounting approval never merged.
- Constitutional rule 16: only approved rows affect balances; ordering uses occurred_at with
  ledger_sequence tie-breaker, never UUID order.

### What Codex Needs to Know
Migration as applied is architecturally sound ‚Äî no rework. `transaction_items.status` is
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
CARRIED FORWARD (now resolved): "Do not merge physical movement and accounting approval" ‚Äî
resolved this session, promoted to constitutional rule 15. Closed.
ACTIVE: When the Financials phase builds job-cost approval, it must use a separate
field/table ‚Äî never repurpose `transaction_items.status`.

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
only ‚Äî must be replaced with server-authoritative permissions.

### Important Netlify Notes
Production: `https://northgate-hq-v2.netlify.app/`. The production 404 was caused by the
successful deploy not being published, not by repo code. Settings: build `npm run build`,
publish `dist`, production branch `main`.

### Important Warnings
Do not treat current `usePermissions.js` as real security ‚Äî temporary scaffold only.
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

## Entry 009 ‚Äî ALIGNMENT / SYNC POINT

**Date:** 2026-06-03
**Updated by:** Claude
**Phase:** Cross-model sync before Inventory UI build
**Session type:** Reconciliation ‚Äî single source of truth reset

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
  Clerk ID, caches, auto-creates row with safe defaults). RESTORE it ‚Äî do not write a new system.
- Until restored, flip the default from full-access to LEAST privilege. Full access is the
  most dangerous possible default.

### Required Action ‚Äî Documents Out of Sync
Claude's Entry 007 updated the lock document (Section 14 rewrite, rules 15-16; rule 17 added
in this session). If the repo's `docs/ARCHITECTURE.md` lacks these, push the updated version
now. Both models must read the same lock document.
Checklist:
- [ ] Updated ARCHITECTURE.md (Section 14 rewrite + rules 15, 16, 17) in repo
- [ ] HANDOFF.md entries renumbered (007 Claude, 008 ChatGPT, 009 this)
- [ ] This full HANDOFF.md committed to repo

### Agreed Next Steps (in order ‚Äî hard gate noted)
1. Push updated ARCHITECTURE.md and this reconciled HANDOFF.md to repo.
2. Manual production smoke test: landing ‚Üí sign-in ‚Üí dashboard ‚Üí UserButton ‚Üí Supabase init.
3. Add a real Supabase health/read test (harmless table or view).
4. **HARD GATE:** Restore the real server-authoritative `usePermissions` hook and confirm
   Clerk ‚Üí Supabase user mapping. Nothing that writes to the DB is built before this.
   Read-only catalog view MAY proceed in parallel.
5. Add module layout/navigation shell.
6. Inventory module UI: (a) catalog read view ‚Äî OK now, read only; (b) storage hierarchy
   browser; (c) cart scaffold; (d) checkout/finalization ‚Äî ONLY after step 4 clears.
7. Resolve Google Sheets cleanup before real data import (blank field_name rows; cost code
   `16,050.00` ‚Üí `16050`).
8. Update HANDOFF.md after each step.

### Open Questions / Concerns
None blocking once documents are synced and the permission hook is restored.

### Architecture Drift Warnings (active)
- ACTIVE: Temporary usePermissions scaffold hardcodes full access. Restore to
  server-authoritative before any write-capable UI. Default must be least-privilege if it remains.
- ACTIVE (Financials phase): Job-cost approval must use a separate field/table ‚Äî never
  repurpose `transaction_items.status`.
- CLOSED: "Don't merge physical movement and accounting approval" ‚Äî resolved Entry 007,
  promoted to Constitutional Rule 15.

---

## Entry 010

**Date:** 2026-06-08
**Updated by:** Claude
**Phase:** Phase 1 (Inventory) ‚Äî concurrent UI/platform architecture decision
**Session type:** Advisory / architecture decision ‚Äî mobile & UI strategy

### Context
Ryan asked, in general terms, about (a) offline-capable apps, (b) shipping native
apps to the app stores, and (c) the React Native vs Flutter vs Capacitor trade-offs.
Northgate HQ itself was confirmed to remain ONLINE-based ‚Äî Supabase is the live
source of truth; HQ is not an offline-first design. Out of that discussion Ryan made
two forward-looking UI/platform decisions for Northgate HQ.

### Decisions Made This Session
- **Responsive web UI is a foundational build requirement.** The Northgate HQ web app
  must be built mobile/tablet-responsive from the first screen, not desktop-only.
  Rationale: the HQ UI has not been built yet, so designing responsiveness in now
  avoids costly retrofit later (consistent with the "design before build" principle).
  ‚Äî Approved: Ryan.
- **React Native companion app added as a reserved future phase.** A native,
  app-store-distributed companion app focused on field-inventory workflows (QR
  scanning, stock/vehicle lookups, on-site job-usage logging, push notifications),
  reading from and writing to the same Supabase source of truth as the web app. Built
  only after core HQ is stable. ‚Äî Approved: Ryan.

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
  Phase ‚Äî React Native Companion App (reserved, not now)" subsection documenting the
  companion app's architecture and constraints.
- No constitutional rules added. The responsive baseline is documented as a Section 26
  build requirement. Ryan may elevate it to a numbered Constitutional Rule (Rule 18) in
  a future update if he wants it carried with that weight.

### Schema Changes
None this session.

### What Codex Needs to Know
- When the HQ UI is built, build it responsive from the start ‚Äî phone/tablet layouts
  are a foundational requirement, NOT a Phase 4 add-on. Basic responsiveness is not the
  same as the customizable layout presets in Section 27, Phase 4.
- Do not start the React Native companion app yet. It is a reserved future phase.
- The companion app, when built, must use the same Supabase project and the same
  server-authoritative permission checks ‚Äî never a separate data store or a permission
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
   `usePermissions` hook and confirm Clerk ‚Üí Supabase user mapping before any
   write-capable UI. Read-only catalog view may proceed in parallel.
3. Continue the Inventory module per the Section 29 build order.
4. Resolve Google Sheets cleanup before real data import (blank field_name rows; cost
   code `16,050.00` ‚Üí `16050`).
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
  field/table ‚Äî never repurpose `transaction_items.status`. (From Entry 009.)
- NEW (advisory, future companion-app phase): When/if the React Native companion app is
  built, it must not become a path around server-authoritative permissions and must not
  introduce a second source of truth. Carry forward until the companion app phase begins.

---

## Entry 011

**Date:** 2026-06-08
**Updated by:** Claude
**Phase:** Phase 1 (Inventory) ‚Äî Architecture Lock Document maintenance
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
  user-customizable layout presets in Section 27 (Phase 4). ‚Äî Approved: Ryan.

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
- Responsive-from-the-start is now Constitutional Rule 18 ‚Äî the same weight as
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

### Next Steps (in order ‚Äî unchanged from Entry 010)
1. Push this v2.3 ARCHITECTURE.md and this HANDOFF.md (Entry 011) to the repo.
2. HARD GATE unchanged (from Entry 009): restore the server-authoritative
   `usePermissions` hook and confirm Clerk ‚Üí Supabase user mapping before any
   write-capable UI. Read-only catalog view may proceed in parallel.
3. Continue the Inventory module per the Section 29 build order.
4. Resolve Google Sheets cleanup before real data import (blank field_name rows;
   cost code `16,050.00` ‚Üí `16050`).
5. Update HANDOFF.md after each step.

### Open Questions / Concerns
None. The Entry 010 open question is resolved and closed.

### Architecture Drift Warnings
- CARRIED FORWARD (active): Temporary `usePermissions` scaffold hardcodes full
  access. Restore to server-authoritative before any write-capable UI; default
  must be least-privilege if it remains. (From Entry 009.)
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a
  separate field/table ‚Äî never repurpose `transaction_items.status`.
  (From Entry 009.)
- CARRIED FORWARD (advisory, future companion-app phase): When/if the React
  Native companion app is built, it must not become a path around
  server-authoritative permissions and must not introduce a second source of
  truth. (From Entry 010.)

---

## Entry 012

**Date:** 2026-06-08
**Updated by:** ChatGPT
**Phase:** Phase 1 (Inventory) ‚Äî Permissions hard gate repair
**Session type:** Implementation / security alignment

### What Was Completed
- Replaced the temporary `src/hooks/usePermissions.js` scaffold that hardcoded Developer/Admin/full-access permissions.
- Added authenticated Supabase client support in `src/services/supabaseClient.js` so the app can send a Clerk-generated Supabase JWT to Supabase.
- Added `supabase/migrations/202606080001_user_permissions.sql` to create the `user_permissions` table, default role-permission mapping function, and `get_or_create_user_permissions()` RPC.
- Updated the dashboard permission card in `src/App.jsx` so it now displays server-backed permission source, role, and division instead of labeling the role as temporary.
- Tightened the permission RPC so the requested Clerk user ID must match `auth.jwt() ->> 'sub'`; this prevents one authenticated user from requesting another user's permissions.
- Removed front-end role-default expansion from `usePermissions`; the hook now uses only server-returned `effective_permissions` and fails closed to deny-all/default-deny if lookup fails.

### Decisions Made This Session
- Permission defaults are calculated in Supabase, not in the React hook, to preserve the server-authoritative permissions rule. ‚Äî Approved by Architecture Lock Document Rule 4.
- Missing, failed, signed-out, or unreadable permission state defaults to least privilege / deny-all. ‚Äî Approved by Architecture Lock Document Rule 4 and Entry 009 hard gate.
- The UI may display permission state for transparency, but those displayed values are not treated as security enforcement. ‚Äî Approved by Architecture Lock Document Rule 4.

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
- UPDATED: Temporary `usePermissions` scaffold hardcoded full access ‚Äî code-level scaffold removed, but carry forward until migration is applied and live Clerk ‚Üí Supabase permission lookup is verified.
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate field/table ‚Äî never repurpose `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): When/if the React Native companion app is built, it must not become a path around server-authoritative permissions and must not introduce a second source of truth.

---

## Entry 013

**Date:** 2026-06-09
**Updated by:** Claude
**Phase:** Phase 1 (Inventory) ‚Äî Pre-build architecture review: write-capable inventory UI
**Session type:** Architecture review / build sequence confirmation

### Context
Ryan confirmed the permissions hard gate work from Entry 012 is complete (code side). The team is now proceeding with the write-capable inventory UI build. Ryan proposed the following build sequence and Claude reviewed it for architectural alignment before handoff to ChatGPT.

### Build Sequence Confirmed (in order)
1. Read-only catalog confirmation ‚Äî verify catalog view works against live v2 Supabase; confirm permission card shows `Source: server` (hard gate live-verification step).
2. Storage hierarchy browser ‚Äî read-only unit ‚Üí shelf ‚Üí bay ‚Üí bin browser; must be responsive from first screen (Constitutional Rule 18).
3. Cart scaffold ‚Äî display-only cart UI; no DB writes until Step 4.
4. Add-to-cart writes ‚Äî first real writes; hard gate must be confirmed live in production before this step begins.
5. Checkout/finalization writes ‚Äî most locked rules apply; see non-negotiables below.

### Non-Negotiable Rules for Checkout/Finalization (Constitutional, do not deviate)
- `transaction_items.status = 'approved'` = physical movement only. Never job-cost or accounting approval. (Rule 15)
- `occurred_at = NOW()` stamped at checkout ‚Äî separate from `created_at`. (Rule 16)
- `unit_cost_at_time` = current catalog `price_per_unit` at moment of issue. Never back-calculated after the fact. (Rule 9)
- Per-line-item `destination_type` and `destination_id` on `transaction_items` from day one ‚Äî not only at transaction header. (Rule 11)
- Only `approved` rows trigger `update_inventory_balance()`. `pending` and `rejected` rows stay in log, never affect `quantity_on_hand`. (Rule 16)
- Balance ordering: `occurred_at DESC, ledger_sequence DESC`. Never UUID order.

### Commonly Missed Detail ‚Äî Vehicle Snapshot at Cart Open (Section 11, locked)
When a cart row is created, the user's current active vehicle assignment must be captured as a snapshot on the cart at that moment. It must NOT be re-queried at checkout. The vehicle recorded is the one assigned at cart-open time, regardless of any subsequent vehicle reassignment. This is locked in Section 11 and is expensive to retrofit if skipped.

### Process Clarification Approved This Session
Going forward, whenever either model produces an updated HANDOFF.md or ARCHITECTURE.md, the deliverable must be the **complete file** ‚Äî all prior entries intact, new content appended. Ryan downloads the complete file, verifies it, uploads it to the repo, and retains a local backup. Partial diffs or "just the new section" outputs are not acceptable.

### What Codex Needs to Know
- Hard gate is code-complete (Entry 012) but not yet live-verified. Step 1 of the build sequence IS the live verification. If production shows `error-default-deny`, stop and resolve Clerk JWT template before proceeding.
- Vehicle snapshot at cart-open is a locked Section 11 requirement ‚Äî build it into the first cart write, not as a follow-up.
- Every screen in this sequence must be responsive from the moment it is first written (Constitutional Rule 18).
- Complete HANDOFF.md and ARCHITECTURE.md (all entries, full files) must be produced at the end of each session.

### What Claude Needs to Know
- Build sequence reviewed and approved this session.
- Process correction made: complete files required on every update.
- Hard gate live-verification is Step 1 of the build sequence ‚Äî it has not yet been confirmed in production.

### Next Steps (in order)
1. ChatGPT executes the build sequence (Steps 1‚Äì5 above).
2. Apply `supabase/migrations/202606080001_user_permissions.sql` to v2 Supabase if not yet done (prerequisite for Step 1 live-verification).
3. Elevate Ryan/admin row in `user_permissions` after migration is applied.
4. Update complete HANDOFF.md after each build step.

### Open Questions / Concerns
None blocking.

### Architecture Drift Warnings
- CARRIED FORWARD (active): Hard gate code-complete but not live-verified. Confirm `Source: server` in production before write-capable UI (Step 4+).
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate field/table ‚Äî never repurpose `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 014

**Date:** 2026-06-09
**Updated by:** ChatGPT
**Phase:** Phase 1 (Inventory) ‚Äî Permissions gate cleared, read-only Inventory UI, and staged seed/import
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
- Proceeded with a controlled staged seed rather than a full workbook import because the Drive export path could not be reliably decoded through the connector and because not all workbook domains have destination tables yet. ‚Äî Approved by implementation safety and source-of-truth rules.
- Initial stock quantity was seeded through an approved physical count correction transaction instead of direct balance manipulation. ‚Äî Required by Constitutional Rule 1 and Rule 16.
- Employees and Assemblies were deferred instead of forced into incorrect tables. ‚Äî Required by the no-duplicate-source-of-truth rule and module-boundary discipline.
- The next build step remains display-only cart scaffold. No cart writes should begin until Ryan explicitly resumes that step. ‚Äî Approved by Entry 013 build sequence.

### Schema Changes
- No new application tables were added this session.
- Attempted import-tracking table migration was blocked by the connector safety layer and was not applied.
- Existing live RPC `get_or_create_user_permissions(...)` was replaced/reapplied to fix the ambiguous `clerk_user_id` reference.
- Data was inserted into existing Phase 1 tables only.

### Code / File Changes
- `src/hooks/useInventoryReadModel.js` ‚Äî added authenticated read-only inventory read model.
- `src/App.jsx` ‚Äî replaced the starter dashboard content with responsive read-only Inventory confirmation and storage browser UI.
- `src/styles.css` ‚Äî updated responsive application styling.
- `src/main.jsx` ‚Äî imported `styles.css`.
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
3. Build display-only cart scaffold ‚Äî no writes yet.
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
- CLOSED: Entry 013 hard gate warning ‚Äî live production permission source reached `server`, and Ryan/admin row is `Developer / Admin`.
- CLOSED: Temporary full-access `usePermissions` scaffold ‚Äî replaced with server-backed hook and live verified.
- CARRIED FORWARD (active, next implementation step): First cart write must snapshot active vehicle assignment at cart creation, not checkout.
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate field/table ‚Äî never repurpose `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 015

**Date:** 2026-06-09
**Updated by:** ChatGPT
**Phase:** Phase 1 (Inventory) ‚Äî Cart-open security gate and first controlled cart write
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
- Do not allow direct client mutation of cart tables. Cart writes must go through controlled server functions/RPCs with Clerk JWT validation. ‚Äî Required by Architecture Rule 4.
- The first cart write may create or return an active cart only; it must not create cart item rows, reserve stock, move inventory, or write `transaction_items`. ‚Äî Required by Entry 013 build sequence and inventory transaction rules.
- Because no active user-to-vehicle assignment source exists yet, the first cart-open RPC passes and stores `NULL` for `active_vehicle_id`, and the UI explicitly displays ‚ÄúNo active vehicle assignment found.‚Äù ‚Äî Implementation decision pending Claude review for whether a proper assignment table should be created before add-to-cart.
- Add-to-cart implementation is paused pending Claude review of this checkpoint. ‚Äî Ryan requested document update for Claude before proceeding.

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
- `supabase/migrations/202606090003_secure_inventory_cart_open_rpc.sql` ‚Äî added RLS, policies, and controlled cart-open RPC.
- `src/hooks/useInventoryCart.js` ‚Äî added hook that calls `open_inventory_cart` with the Clerk/Supabase JWT.
- `src/App.jsx` ‚Äî wired Cart Open tab to the RPC and updated UI text to reflect the first controlled cart write.
- `src/styles.css` ‚Äî already contained the responsive cart scaffold styling from the prior step; no additional style change was required for the cart-open hook beyond existing classes.

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
   - vehicle snapshot displays ‚ÄúNo active vehicle assignment found.‚Äù
4. After review and verification, build controlled add-to-cart RPC.
5. Keep checkout/finalization disabled until add-to-cart writes are verified.

### Open Questions / Concerns
- Should an active user-to-vehicle assignment table be created before add-to-cart, or is `NULL` cart-open snapshot acceptable until the Employee/Vehicles module matures?
- Should `open_inventory_cart` also validate an inventory permission flag server-side through `user_permissions.effective_permissions`, or is the current JWT-user validation plus RLS sufficient for this early cart-open step? This should be reviewed before add-to-cart.
- Need future audit/import tracking for bulk imports; carried forward from Entry 014.
- Need destination tables/import path for Employees and Assemblies; carried forward from Entry 014.

### Architecture Drift Warnings
- CLOSED: Cart tables without RLS ‚Äî fixed before first cart write by enabling RLS and blocking direct mutation.
- CARRIED FORWARD (active, Claude review requested): First cart write snapshots `NULL` for active vehicle because no active user-to-vehicle assignment source exists yet.
- CARRIED FORWARD (active, next implementation step): Add-to-cart must be a controlled server RPC; do not use direct client table mutation.
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate field/table ‚Äî never repurpose `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 016

**Date:** 2026-06-09
**Updated by:** Claude
**Phase:** Phase 1 (Inventory) ‚Äî Cart-open security review + vehicle snapshot model decision
**Session type:** Architecture review (mid-build trigger: permissions + cart write + vehicle snapshot)

### Context
Reviewed Entry 015 (ChatGPT cart-open implementation + RLS fix) at Ryan's request before add-to-cart. Two open questions were posed: (1) is a NULL active-vehicle snapshot acceptable without a user‚Üívehicle assignment table; (2) should `open_inventory_cart` validate an inventory permission flag server-side. Ryan reviewed the findings and supplied the business model for vehicle stock.

### Review Findings
- RLS enabled on `inventory_carts` / `inventory_cart_items` before the first cart write ‚Äî closes a real Rule 4 / Section 17 gap. Self-select read policies + deny-all client mutation + `SECURITY DEFINER` RPC is the correct pattern and matches the `user_permissions` approach (Entry 012).
- `open_inventory_cart` uses `auth.jwt() ->> 'sub'` as the authoritative `user_id` and ignores any client-claimed identity. Correct.
- Cart-open writes only a cart row ‚Äî no cart items, no stock reservation, no `transaction_items`, no balance movement. Respects the Entry 013 build sequence and Rules 1/16.
- Return-existing-active-cart instead of duplicating. Sound.

### Decisions Made This Session (locked)
1. **Cart-open is gated by `can_inventory_transactions` server-side.** `open_inventory_cart` must read the caller's effective permission from `user_permissions.effective_permissions` (keyed off the JWT subject) and fail closed if false. JWT validation establishes identity (authentication); it does not establish authorization. Cart-open is a server write into an inventory table, so Rule 4 / Section 17 require the permission check at the DB/API layer. Required before add-to-cart. ‚Äî Approved by Rule 4; Ryan.
2. **NULL active-vehicle snapshot is correct, not merely tolerated.** A NULL-vehicle cart is a legitimate, common state. Add-to-cart and checkout must treat NULL as valid, never an error. The user‚Üívehicle assignment table is NOT a prerequisite for building add-to-cart. ‚Äî Approved: Ryan.
3. **Vehicle snapshot is server-derived, never client-passed.** The `p_active_vehicle_id` client parameter on `open_inventory_cart` is removed/ignored; the snapshot is computed server-side. This mirrors the client-claimed-user_id fix already applied to the permission RPC. ‚Äî Approved by Rule 4 / Section 11; Ryan.
4. **Vehicle stock-carrying model (Ryan's decision).** Whether a cart captures a vehicle snapshot is determined by a stock-carrying criterion at the vehicle level, attached to the user via an active assignment:
   - Vehicles carry an explicit stock-carrying flag (`vehicles.holds_stock BOOLEAN NOT NULL DEFAULT FALSE`), distinct from the existing classification (Residential/Commercial/Service/Other).
   - A user‚Üívehicle active-assignment link attaches a vehicle to a user.
   - Cart-open server logic: snapshot the user's assigned vehicle iff that vehicle `holds_stock = TRUE`; otherwise snapshot NULL.
   - Business rationale: not all employees drive a company vehicle; of those who do, only vans that hold stock for extended periods need inventory tracking. Transient stock carried in a truck used office‚Üíjob is not tracked at the vehicle level; those carts snapshot NULL and simply record who handled the material.

### Schema Changes
- `open_inventory_cart`: add server-side `can_inventory_transactions` check (fail closed); drop/ignore the `p_active_vehicle_id` client parameter.
- `vehicles.holds_stock BOOLEAN NOT NULL DEFAULT FALSE` ‚Äî add now (schema-first), even though only a couple of vehicles will be flagged.
- User‚Üívehicle active-assignment link ‚Äî design locked; build before Miguel/Fabian van stock is tracked. Not required to build add-to-cart.

### Lock Document Changes
- ARCHITECTURE.md bumped to v2.5.
- Section 11 clarified: cart-open gated by `can_inventory_transactions` server-side; vehicle snapshot is server-derived (never client-passed) and is populated only when the user's active vehicle `holds_stock`; NULL-vehicle carts are valid and must not error.
- Section 16 expanded: added the `vehicles.holds_stock` flag and the user‚Üívehicle active-assignment concept.

### What Codex Needs to Know
- Add the `can_inventory_transactions` server-side check to `open_inventory_cart` and remove the `p_active_vehicle_id` client parameter before building add-to-cart.
- Add-to-cart may proceed now; it does not touch the vehicle snapshot, and NULL-vehicle carts are valid. Build it as a controlled `SECURITY DEFINER` RPC with authenticated Clerk subject, active cart owned by that subject, valid `bin_item_id` / `item_id` relationship, quantity > 0, `can_inventory_transactions` check, and no balance movement until checkout.
- Vehicle snapshot logic, when built: server-side lookup of the user's active assignment; snapshot only if `holds_stock = TRUE`, else NULL. Never accept the vehicle ID from the client.
- Checkout/finalization remains untouched and must follow all locked rules (Rules 9, 11, 15, 16): `status = 'approved'`, `occurred_at = NOW()`, `unit_cost_at_time` snapshot, per-line destinations, approved-only balance effect.

### What Claude Needs to Know
- Entry 015 cart-open + RLS implementation reviewed and approved with one required change (permission gate) folded in.
- Vehicle snapshot model is now decided: stock-carrying flag at vehicle level + user assignment ‚Üí server-derived snapshot; NULL is the correct value for non-stock-carrying users and carts.

### Next Steps (in order)
1. Codex adds the `can_inventory_transactions` server-side check to `open_inventory_cart` and removes the `p_active_vehicle_id` client parameter.
2. Add the `vehicles.holds_stock` column (schema-first).
3. Production verification: `Source: server`; Cart Open loads; Open Cart succeeds; status ‚Üí active; vehicle displays "No active vehicle assignment found"; AND a least-privilege user with `can_inventory_transactions = false` is denied cart-open.
4. Build the controlled add-to-cart RPC (NULL-vehicle carts valid).
5. Design/build the user‚Üívehicle active-assignment link before van stock onboarding; wire the server-derived snapshot at that point.
6. Keep checkout/finalization disabled until add-to-cart writes are verified.

### Open Questions / Concerns
- Confirm exact column/table naming for `holds_stock` and the user‚Üívehicle assignment link when the migration is written.
- Confirm "one active cart per user" is the intended model vs. multiple concurrent carts.
- Carried forward: durable import/audit tracking for bulk imports; destination tables / import path for Employees and Assemblies.

### Architecture Drift Warnings
- CLOSED: Cart-open lacked a server-side permission check ‚Äî decided this session; `can_inventory_transactions` gate required before add-to-cart.
- CARRIED FORWARD (active, next step): `active_vehicle_id` is structurally present but unsourced. When the user‚Üívehicle assignment link is built, cart-open must populate the snapshot server-side (assigned vehicle iff `holds_stock`), and the client must never supply it.
- CARRIED FORWARD (active, next step): Add-to-cart must be a controlled server RPC gated by `can_inventory_transactions`; no direct client table mutation.
- CARRIED FORWARD (active, Financials phase): Job-cost approval must use a separate field/table ‚Äî never repurpose `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 017

**Date:** 2026-06-09
**Updated by:** Claude
**Phase:** Phase 1 (Inventory) ‚Äî Express Checkout / Manager Override design lock
**Session type:** Architecture decision (mid-build trigger: new transaction-completeness concept, permissions, audit, Dev Console)

### Context
Following the cart-open review (Entry 016), Ryan proposed an express-checkout / manager-override path: a worker in a hurry physically takes material now, records minimal info, and a manager/admin completes and approves it afterward. This introduces a new "transaction completeness" concept, new permission flags, a reason-gated developer override, and a deferred-completion capability. Design locked here; implementation scheduled after the normal cart checkout path exists.

### Decisions Made This Session (locked)
1. **Express checkout is a controlled "take now, complete later" path, not a bypass.** The physical removal is real immediately, so the transaction is written `status='approved'`, `occurred_at=NOW()`, `unit_cost_at_time` snapshotted on creation ‚Äî inventory balance stays correct (Rules 1, 9, 16). Express checkout never sets a balance directly and never skips the ledger.
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
- `requires_completion BOOLEAN` and provisional short-answer note field(s) on the relevant transaction record ‚Äî exact naming finalized at migration time.
- Approver passcode storage (hashed, server-verified) ‚Äî mechanism finalized at implementation.
- Three new permission flags added to the role-defaults function and `user_permissions` mapping.

### Lock Document Changes
- ARCHITECTURE.md bumped to v2.6.
- Section 14: added 14d "Transaction Completeness ‚Äî Express Checkout / Manager Override."
- Section 17: added `can_express_checkout`, `can_approve_express_checkout`, `can_defer_completion` with role defaults.
- Section 22: added the reason-gated developer override and the explicit "process, not ledger" boundary.

### What Codex Needs to Know
- Do not build express checkout yet ‚Äî sequenced after normal cart checkout.
- When built: express take creates an approved physical-movement transaction immediately (balance correct), destination fields provisional, `requires_completion = TRUE`. Never use `transaction_items.status` for completeness.
- Approval blocked until required structured fields are filled; approver passcode verified server-side.
- Gate initiate on `can_express_checkout`, approve on `can_approve_express_checkout`, defer/partial-save on `can_defer_completion` ‚Äî all server-side.
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
- CARRIED FORWARD (active, when express checkout is built): completeness must be its own field ‚Äî never `transaction_items.status` and never the job-cost approval field.
- CARRIED FORWARD (active, when express checkout is built): developer override is reason-gated and process-only; structural invariants are never overridden.
- CARRIED FORWARD (active, next step): `active_vehicle_id` snapshot must be server-derived when the assignment source exists.
- CARRIED FORWARD (active, next step): add-to-cart must be a controlled server RPC gated by `can_inventory_transactions`.
- CARRIED FORWARD (active, Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (advisory, future companion-app phase): React Native companion app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 018

**Date:** 2026-06-10
**Updated by:** ChatGPT / Codex-style implementation session
**Phase:** Phase 1 Inventory ‚Äî Cart open, add-to-cart, and normal checkout verified
**Session type:** Implementation checkpoint + Claude architecture review request

### Context
Ryan confirmed the updated `HANDOFF.md` through Entry 017 was in the repository before implementation resumed. Work proceeded from the Entry 016/017 sequence: harden cart-open first, then controlled add-to-cart, then normal cart checkout/finalization. Express checkout / manager override remained intentionally out of scope.

### What Was Completed
1. **Cart-open corrections required by Entry 016 were implemented and verified.** Added `vehicles.holds_stock`, replaced `open_inventory_cart` so active vehicle snapshot is not client-supplied, used JWT `sub` as authoritative user ID, and checked `can_inventory_transactions` server-side.
2. **Permission defaults were updated live in Supabase.** Added v2.6 express-related flags to `default_permissions_for_role`: `can_express_checkout`, `can_approve_express_checkout`, `can_defer_completion`.
3. **Controlled add-to-cart was implemented and verified.** Added `add_inventory_cart_item(p_cart_id, p_bin_item_id, p_quantity)` as a `SECURITY DEFINER` RPC. Add-to-cart inserts/increments `inventory_cart_items`; it does not reserve stock, move inventory, create `transaction_items`, or affect balances.
4. **Stocked-bin candidate source was added.** Added `inventory_cart_candidates_view` so the UI uses real stocked `bin_items`, not catalog-only `items` rows.
5. **Normal checkout/finalization was implemented and verified.** Added `finalize_inventory_cart(p_cart_id, p_destination_type, p_destination_id, p_note)` as a `SECURITY DEFINER` RPC. It writes approved `transaction_items` with `status='approved'`, `occurred_at=NOW()`, and `unit_cost_at_time=items.price_per_unit`.
6. **Production behavior was verified by Ryan.** Verified path: Open Cart ‚Üí Add Item ‚Üí Checkout to Office ‚Üí Supabase ledger/balance updates appeared correctly.

### Code / File Changes
- Repo commits:
  - `a2a8e98` ‚Äî Add vehicle holds stock flag migration
  - `ffc9e14` ‚Äî Harden open inventory cart permission gate
  - `fd5d125` ‚Äî Remove client vehicle parameter from cart open hook
  - `868c27a` ‚Äî Add inventory cart item RPC
  - `9bcdc4f` ‚Äî Add inventory cart candidates view
  - `cdb4675` ‚Äî Load inventory cart candidates from stocked bins
  - `9de4814` ‚Äî Wire cart candidates to add-to-cart RPC
  - `b72ce95` ‚Äî Add cart item hook action
  - `afc72ee` ‚Äî Add inventory cart checkout RPC
  - `52c48b1` ‚Äî Add inventory cart checkout hook action
  - `701873f` ‚Äî Expose inventory cart checkout button

### What Claude Needs to Know
- Please review this implementation against `docs/ARCHITECTURE.md` v2.6 and HANDOFF Entries 016‚Äì017.
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
- CARRIED FORWARD: user‚Üívehicle assignment source absent.
- CARRIED FORWARD: express checkout / manager override deferred.

---

## Entry 019

**Date:** 2026-06-10
**Updated by:** Claude
**Phase:** Phase 1 Inventory ‚Äî Review of Entry 018 (cart-open hardening, add-to-cart, normal checkout)
**Session type:** Architecture review

### Context
Reviewed the implemented cart-open ‚Üí add-to-cart ‚Üí normal checkout path against the canonical v2.6 lock document and HANDOFF through Entry 017.

### Review Findings
- The implemented cart-open ‚Üí add-to-cart ‚Üí normal checkout path is sound and aligns with the locked inventory, permission, cost, and audit rules. **Milestone 4C approved.**
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
3. Build the destination-selection UI ‚Äî per-line-capable, server-validated.
4. Add the overdraw/concurrency guard to add-to-cart and finalize.
5. Confirm the express per-role default values match Section 17.
6. Later: express checkout / manager override per Section 14d.

### Open Questions / Concerns
- Confirm office destination semantics before making it permanent.
- Confirm service-call cost treatment and whether user removals are intentionally not job-costed.

### Architecture Drift Warnings
- CARRIED FORWARD (active, before next deploy/rebuild): repo migration for the live `default_permissions_for_role` update is uncommitted ‚Äî live ‚â† repo.
- NEW (active, destination-UI step): expose per-line destinations in `finalize`/UI now; do not harden a cart-level-only path.
- NEW (active, destination-UI step): add overdraw/concurrency protection to `add_inventory_cart_item` and `finalize_inventory_cart`.
- NEW (active, before office is permanent): define office destination semantics ‚Äî consumption (`remove_stock`) vs tracked storage location (`Transfer Location`).
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags must gate express RPCs.
- CARRIED FORWARD (active, next step): user‚Üívehicle assignment source still absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 020

**Date:** 2026-06-11
**Updated by:** Codex
**Phase:** Phase 1 Inventory ‚Äî Read-path stabilization, per-line checkout, cart durability
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
**Phase:** Phase 1 Inventory ‚Äî Milestone 4I, Cart Candidate Picker v1
**Session type:** Implementation

### Context
Replaced the temporary `cartCandidates.slice(0, 3)` test display with a usable stocked-material picker.

### What Was Completed
- Removed the `cartCandidates.slice(0, 3)` limiter; candidate source now requests up to 50 stocked rows from `inventory_cart_candidates_view`.
- Added a search box filtering stocked candidates by material code, item name, and bin code.
- Added a per-candidate quantity input: defaults to 1, clamped client-side to [1, `quantity_on_hand`].
- Add routes the selected quantity through existing `cartState.addItem` ‚Üí existing RPCs. No direct table mutation added.
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
- **Constitutional Rule 19 added** (ARCHITECTURE ‚Üí v2.7): the coordination documents are the versioned source of truth and must stay consistent ‚Äî append-only sequential entries, one identical entry format, and canonical filenames never renamed.
- **Section 34 added** (Documentation Standard): canonical filenames, file-handling protocol, append-only correction protocol, and single entry-format template.
- **HANDOFF reconciled to gapless sequential entries** through Entry 022. The old consolidated addendum was converted into proper entries.

### Review Findings
- Milestone 4I reviewed against ARCHITECTURE v2.6. No drift found.
- Write boundary preserved ‚Äî picker is read + UI; writes go through existing RPCs; no direct table mutation.
- Client quantity clamping is acceptable UX; RPC checks remain authoritative.
- 10‚Üí50 read limit fine for v1; move search server-side before stock exceeds the fetch limit.
- Lowercase `src/app.jsx` removal correct; verify with `git ls-files src/` that only `App.jsx` remains tracked.
- Status: builds but not browser-verified ‚Äî run manual smoke path before marking verified.
- Verify `inventory_cart_candidates_view` division/RLS scoping.

### Lock Document Changes
- ARCHITECTURE.md ‚Üí v2.7: Rule 19 (Section 24); Section 34 "Documentation Standard."
- HANDOFF.md: Entry Format Standard preamble added at top; Entries 015‚Äì022 present in standard format.

### What Codex Needs to Know
- The canonical HANDOFF is now sequential through Entry 022. The next entry is 023.
- Every entry must follow Section 34 / HANDOFF-preamble format exactly.
- Canonical filenames are `ARCHITECTURE.md` and `HANDOFF.md` ‚Äî never rename or suffix them.
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
- RESOLVED: canonical ARCHITECTURE / HANDOFF drift ‚Äî reconciled this entry; Rule 19 added to prevent recurrence.
- CARRIED FORWARD (active): uncommitted `default_permissions_for_role` migration ‚Äî live ‚â† repo (Entry 019).
- CARRIED FORWARD (active): overdraw/concurrency guard on add/finalize (Entry 019).
- CARRIED FORWARD (active): confirm `inventory_cart_candidates_view` + destination-reference reads respect division separation / RLS.
- CARRIED FORWARD (active): Milestone 4I not browser-verified yet.
- CARRIED FORWARD (next step): user‚Üívehicle assignment source absent; vehicle snapshot NULL by design.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 023

**Date:** 2026-06-12
**Updated by:** ChatGPT
**Phase:** Phase 1 Inventory ‚Äî Milestone 4I committed, checkout hardening, ledger backfill, Apply to All controls
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
  - `cc34b3c` ‚Äî Add inventory cart candidate picker and scoped references
  - `aa4849d` ‚Äî Fix vehicle reference view for active schema
  - `f7e0c64` ‚Äî Harden inventory cart checkout ledger balance
  - `c215bc7` ‚Äî Add apply all cart destination controls
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
4. Continue carrying forward unresolved future work: user‚Üívehicle active assignment source, office destination semantics, service-call/job modules, import/audit tracking, and express checkout/manager override.

### Open Questions / Concerns
- Confirm that the Netlify production deploy is actually serving HEAD `c215bc7bcae5c4a1a96ea05b5d40dfdbc771749a`.
- Confirm via one clean post-fix test that `transaction_items` and `inventory_balances` reflect the expected after-checkout state.
- Office destination semantics still need to be finalized before office becomes permanent: singleton consumption destination (`remove_stock`) vs tracked storage location (`transfer_location`).
- User‚Üívehicle active assignment source is still absent; vehicle snapshot remains NULL by design until that exists.
- Express checkout, manager override, approver passcode, and completion worklist remain deferred.

### Architecture Drift Warnings
- RESOLVED: Milestone 4I browser verification / checkout path ‚Äî Ryan retested and `Checkout Selected Destinations` worked.
- RESOLVED: candidate/destination reference division scoping ‚Äî implemented via server-side scoped views.
- RESOLVED: overdraw/concurrency gap for multi-line same-bin checkout ‚Äî hardened by aggregating checkout quantity by `bin_item_id` and preserving negative-balance protection.
- RESOLVED: live seeded balances without corresponding ledger baselines ‚Äî repaired by approved `physical_count_correction` ledger baseline rows.
- CARRIED FORWARD (active): confirm Netlify production deploy is on HEAD `c215bc7bcae5c4a1a96ea05b5d40dfdbc771749a`.
- CARRIED FORWARD (active): inspect one clean post-fix checkout transaction in Supabase to confirm normal path remains transparent and auditable.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is treated as permanent behavior.
- CARRIED FORWARD (next step): user‚Üívehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 024

**Date:** 2026-06-12
**Updated by:** Claude
**Phase:** Phase 1 Inventory ‚Äî Review of Entry 023 (4I commit, checkout hardening, ledger backfill) + test/opening quantity handling
**Session type:** Review + decision proposal

### Context
Review of Entry 023, requested by Codex (specifically the production ledger backfill). Ryan also disclosed the root cause of the checkout failure: he edited inventory quantities directly in Supabase to test different materials. It was a mistake, but it surfaced a latent problem (seeded balances had no ledger baseline) before it could grow. This entry records the review and proposes a sanctioned approach to test and opening quantities.

### Review Findings ‚Äî Entry 023
- Documentation alignment confirmed resolved: ARCHITECTURE v2.7, HANDOFF current; Entry 023 written in standard format with the correct sequential number. The Rule 19 standard is holding.
- Resolved warnings carried forward from prior reviews ‚Äî all approved:
  - Division scoping on candidate/reference reads ‚Äî server-side scoped views (`202606120001`).
  - Overdraw/concurrency ‚Äî checkout quantity aggregated by `bin_item_id` plus `inventory_balances_quantity_nonnegative` constraint as the hard floor.
  - `default_permissions_for_role` repo drift ‚Äî resolved in-repo by `202606110001`.
- Per-line finalize fix (skip cart-level destination validation when `p_line_destinations` is supplied; aggregate by `bin_item_id`) ‚Äî correct.
- Apply Destination to All Lines UI ‚Äî the per-line-capable + cart-level-convenience pattern recommended in Entry 019. Correct.
- **Ledger baseline backfill ‚Äî APPROVED as a correct repair.** Root cause: seeded `inventory_balances` had no corresponding ledger rows (a latent Rule 1 violation). The first real checkout made the balance trigger compute a negative value (only the removal existed, no baseline behind it), tripping `inventory_balances_quantity_nonnegative`. The fix inserted 9 approved `physical_count_correction` rows totaling 389 (matches the seeded EMT quantities exactly: 100+25+35+45+55+15+10+5+99), so balances are now transaction-derived. Sanctioned mechanism (Section 12), explicit approval obtained, the transaction-derived rule preserved.
  - VERIFY: the baseline rows carry catalog `unit_cost_at_time` so inventory valuation is not $0.
  - VERIFY: the corrections are audited per Section 12 (a migration insert may bypass the in-app audit hook), or are explicitly documented as a one-time setup backfill.

### Root Cause (logged)
The 023 checkout failure originated from direct edits to inventory quantities in Supabase during testing. Direct edits to `inventory_balances` bypass the ledger and violate Rule 1 (balances are transaction-derived) and Rule 8 (no direct DB edits outside controlled tools). This was an honest testing mistake; it usefully exposed that the seed process had the same flaw. Corrective principle, already in force and restated: quantities are never set by editing `inventory_balances` directly ‚Äî only through approved ledger transactions (`physical_count_correction` or `add_stock`).

### Proposed Decision ‚Äî Test & Opening Quantity Handling (pending Ryan confirm)
One mechanism, used at three moments:
1. **Sanctioned quantity entry.** A "Set/Adjust Quantity" admin action that takes a target quantity, computes the delta, and writes a `physical_count_correction` (delta) transaction. This is not throwaway test scaffolding ‚Äî it is the real production physical-count feature. Open choice: build this RPC now (removes the direct-edit temptation that caused the failure) vs. keep doing manual tagged count-correction inserts until later.
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
- Carried: office destination semantics; user‚Üívehicle assignment source.

### Architecture Drift Warnings
- NEW (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities (Rule 1 / Rule 8). Pre-release test adjustments use count-correction and are tagged for go-live cleanup.
- CARRIED FORWARD (active): confirm Netlify deploy on HEAD `c215bc7`; inspect one clean post-fix checkout in Supabase.
- CARRIED FORWARD (active): verify backfill rows carry `unit_cost_at_time` and are audited or documented as a one-time setup backfill.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent (consumption vs storage location).
- CARRIED FORWARD (next step): user‚Üívehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 025

**Date:** 2026-06-12  
**Updated by:** ChatGPT  
**Phase:** Phase 1 Inventory ‚Äî Milestone 4J Developer-only count correction tool functional  
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
- User‚Üívehicle active assignment source remains absent; vehicle snapshot remains NULL by design until it exists.

### Architecture Drift Warnings
- RESOLVED / MITIGATED: direct quantity testing by editing `inventory_balances` now has a controlled replacement path through the Developer-only count correction tool.
- CARRIED FORWARD (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities (Rule 1 / Rule 8).
- CARRIED FORWARD (active): verify exact 4J commit hash, migration filename, RPC signature, pushed/deployed status, and live Developer-only enforcement.
- CARRIED FORWARD (active): build transaction/history review surface before Express Checkout so normal checkout and count corrections are inspectable.
- CARRIED FORWARD (active): verify backfill and count-correction rows carry `unit_cost_at_time` and are audited or documented as one-time setup/pre-release rows.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent (consumption vs storage location).
- CARRIED FORWARD (next step): user‚Üívehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 026

**Date:** 2026-06-15
**Updated by:** Claude
**Phase:** Phase 1 Inventory ‚Äî Review of Milestone 4K (Transaction History Review Surface) + 4J gate verification + ledger verification
**Session type:** Review

### Context
Claude reviewed the 4K review packet: the `read_inventory_transaction_history` RPC plus a TransactionHistoryPanel UI/hook, bundled with 4J Developer-only gate verification, numeric-input UX fix, and ledger verification queries. The 4K migration `202606150001` was staged but not yet applied live at the time of review.

### Review Findings ‚Äî Milestone 4K
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
- User‚Üívehicle assignment source remains absent; vehicle snapshot NULL by design until it exists.

### Architecture Drift Warnings
- RESOLVED: 4J Developer-only gate server enforcement; backfill/count-correction `unit_cost_at_time`; clean checkout inspection; balance/ledger integrity; transaction-header audit completeness.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): improve transaction history actor display to prefer display name/email over raw Clerk user ID.
- CARRIED FORWARD (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): apply 4K migration live and runtime-test the RPC.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (next step): user‚Üívehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 027

**Date:** 2026-06-15
**Updated by:** ChatGPT
**Phase:** Phase 1 Inventory ‚Äî Current lock-in checkpoint after Claude 4K approval
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
4. Update history actor display so rows prefer: `performed_by_name` ‚Üí `user_permissions.display_name` ‚Üí `user_permissions.email` ‚Üí raw Clerk `user_id` fallback.
5. Define the division-scoped read rule before exposing history or any broad/sensitive read surface beyond Developer.
6. Resolve office destination semantics: office as singleton consumption destination vs tracked storage/transfer location.
7. Keep Express Checkout / Manager Override deferred until the normal path and history surface are verified live.

### Open Questions / Concerns
- Has 4K been committed and pushed after Claude approval?
- Has migration `202606150001` been applied live and runtime-tested from the app?
- Should read surfaces remain Developer-only by convention only, or should this be locked into ARCHITECTURE before division scoping is designed?
- Office destination semantics remain unresolved.
- User‚Üívehicle assignment source remains absent; vehicle snapshot NULL by design until it exists.

### Architecture Drift Warnings
- CARRIED FORWARD (active): apply 4K migration live and runtime-test the RPC from the app if not already done.
- CARRIED FORWARD (active): improve history actor display to prefer readable display name/email over raw Clerk user ID.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (next step): user‚Üívehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 028

**Date:** 2026-06-15
**Updated by:** Claude
**Phase:** Coordination / governance ‚Äî escalation protocol locked
**Session type:** Decision

### Context
Ryan asked to lock the "when must Claude be involved" routing rule into the architecture so it is canonical rather than living only in a pasted prompt (which would itself be a drift risk ‚Äî the exact failure mode Rule 19 exists to prevent). He will then start fresh chats across all models from the updated ARCHITECTURE and HANDOFF.

### Decisions Made This Session (locked)
- **Escalation protocol locked into Section 30 (AI Development Roles); ARCHITECTURE ‚Üí v2.8.** Core principle: Claude is required when an architectural decision is being *made* or a locked rule is *touched* ‚Äî not when a settled decision is being *implemented*. Codex MUST route to Claude before proceeding when work involves: any ARCHITECTURE.md change; a new decision not already covered by the lock document; anything touching a locked invariant (ledger/balances, permissions, audit, approval/status meaning, cost snapshots, per-line destinations, source-of-truth, no-direct-DB-edit); schema changes; a new inventory/money/permission write path; build-sequence/ordering questions; conflicts with the lock doc or a prior HANDOFF decision; a constitutional-rule violation flag; starting a deferred major feature (express checkout/manager override, developer override, division-scoped read rule, Financials/job-cost, RN companion app); documentation drift; or anything touching live production data/repair.
- **Proceed-without-Claude conditions (all must hold):** implements an already-locked decision; no change to schema/permissions/ledger/audit/constitutional rules; a read-only surface in an approved scope, or a bug fix / UX-styling / refactor leaving invariants untouched; test/seed quantities via `physical_count_correction` only, never direct `inventory_balances` edits.
- **Required routing verdict:** every Codex work summary ends with exactly one line ‚Äî `No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v__, HANDOFF Entry __).` or `Claude review required before proceeding ‚Äî [trigger].` This makes "if Codex says bring it to Claude, do it" a reliable rule.
- Tie-breaker recorded: if a trigger is even arguably hit (especially invariants or schema), route to Claude; an unnecessary review is cheap, a missed one on a locked invariant is an expensive retrofit.

### Lock Document Changes
- ARCHITECTURE ‚Üí v2.8: Section 30 gains the "When Claude Must Be Involved (Escalation Protocol)" subsection, expanding the existing Mid-Build Review Trigger into a decision-ready MUST/PROCEED rule plus the required routing verdict.
- No constitutional rule added; the protocol lives in Section 30 (roles/process). Ryan may elevate it to a numbered rule later if he wants it to carry constitutional weight and trigger mandatory review flags.

### What Codex Needs to Know
- Read Section 30's escalation protocol and apply it. End every work summary with the routing-verdict line.
- Build against ARCHITECTURE **v2.8** and HANDOFF **Entry 028**.
- All prior next-steps stand: commit/apply/runtime-test 4K (`202606150001`); improve history actor display (`performed_by_name` ‚Üí `display_name` ‚Üí `email` ‚Üí raw Clerk ID); keep history read-only and Developer-only until the division-scoped read rule is defined; resolve office destination semantics; keep Express Checkout deferred.

### What Claude Needs to Know
- The routing rule is now canonical in Section 30, not just a pasted prompt. Future sessions start from v2.8 / Entry 028.

### Next Steps (in order)
1. Ryan commits ARCHITECTURE v2.8 and HANDOFF (through Entry 028) to the repo and `Current Docs`; prior versions to `Outdated`.
2. Ryan starts fresh chats across all models from these two documents.
3. Resume Phase 1 inventory per the carried-forward next steps: commit/apply/runtime-test 4K; actor display-name improvement; then define the division-scoped read rule and resolve office semantics.

### Open Questions / Concerns
- Whether to later elevate the escalation protocol to a numbered constitutional rule.
- Has 4K been committed, the migration applied live, and the Transactions tab runtime-tested?
- Office destination semantics; user‚Üívehicle assignment source (carried).

### Architecture Drift Warnings
- RESOLVED: routing rule was a working convention / pasted prompt only ‚Äî now canonical in Section 30 (v2.8).
- CARRIED FORWARD (active): apply 4K migration `202606150001` live and runtime-test the history RPC from the app.
- CARRIED FORWARD (active): improve history actor display to prefer readable display name/email over raw Clerk user ID.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities (Rule 1 / Rule 8).
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent (consumption vs storage/transfer location).
- CARRIED FORWARD (next step): user‚Üívehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

---

## Entry 029

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Phase 1 Inventory ‚Äî Milestone 4K closeout and transaction-history actor display polish
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
- Did not add permission flags, widen role access, define division-scoped read rules, edit `inventory_balances`, add quantity adjustments, start Express Checkout, alter office semantics, or start user‚Üívehicle assignment work.

### Schema Changes
- No table, column, permission-flag, ledger, audit, balance, destination-semantics, or write-path schema change was made.
- Added a follow-up RPC replacement migration:
  - `supabase/migrations/202606160001_inventory_transaction_history_actor_display.sql`
- The migration only replaces existing function `public.read_inventory_transaction_history(integer, text, text)` with the same return shape and Developer-only gate, adding a read-only `LEFT JOIN` to `user_permissions` for actor fallback display.

### Code / File Changes
- Already-present 4K commit:
  - `906051d` ‚Äî `Add inventory transaction history review surface`
- New implementation commit:
  - `d617d6c` ‚Äî `Polish inventory transaction history actor display`
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
- The live history RPC now resolves actor display using `performed_by_name` ‚Üí `display_name` ‚Üí `email` ‚Üí raw Clerk ID.
- The division-scoped read rule is still not designed and history must not be exposed beyond Developer until Claude/Ryan lock that rule.
- Do not start Express Checkout, Manager Override, approver passcode, completion worklist, office semantics, user‚Üívehicle assignment, or division-scoped read work from this entry.
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
4. Continue carrying forward user‚Üívehicle assignment source work for the future vehicle snapshot phase.
5. Keep Express Checkout / Manager Override deferred until normal transaction history and scoping are fully settled.

### Open Questions / Concerns
- Browser UI verification of the Transactions tab still needs a logged-in Developer browser session because local runtime env was unavailable and in-app browser automation failed before navigation.
- Division-scoped history visibility remains intentionally undefined and must not be inferred in this pass.
- Office destination semantics remain unresolved.
- User‚Üívehicle active assignment source remains absent; vehicle snapshot remains NULL by design until it exists.

### Architecture Drift Warnings
- RESOLVED: 4K commit status ‚Äî commit `906051d` exists locally.
- RESOLVED: 4K live migration status ‚Äî `inventory_transaction_history_review` exists live.
- RESOLVED: actor display polish ‚Äî implemented and applied live with readable actor fallback order.
- RESOLVED: build check ‚Äî `npm run build` passed.
- CARRIED FORWARD (active): production UI/browser visual verification from a logged-in Developer session.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (next step): user‚Üívehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.
- CARRIED FORWARD (advisory, companion-app phase): React Native app must not bypass server-authoritative permissions or introduce a second source of truth.

### Routing Verdict
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.8, HANDOFF Entry 028).

---

## Entry 030

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Coordination documents ‚Äî HANDOFF encoding normalization
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
- Verified Entries 001‚Äì028 remained unchanged after normalization except for the cleared formatting/encoding repair scope.

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
Claude review required before proceeding ‚Äî already reviewed/cleared this session per Rule 20; report verification output for final confirmation.

---

## Entry 031

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Phase 1 Inventory ‚Äî Milestone 4L Add All cart picker UI
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
- Express Checkout, Manager Override, approver passcode, completion worklist, division-scoped read rules, office destination semantics, and user‚Üívehicle assignment remain out of scope.

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
5. Continue carrying forward user‚Üívehicle assignment source work for the future vehicle snapshot phase.
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
- CARRIED FORWARD (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (next step): user‚Üívehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.

### Routing Verdict
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.9, HANDOFF Entry 031).

---

## Entry 032

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Phase 1 Inventory ‚Äî Milestone 4M Add All cart picker polish
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
- No new RPC, batch server function, schema, migration, permission, ledger, balance, checkout, finalization, division-scoped read rule, office semantics, user‚Üívehicle assignment, Express Checkout, Manager Override, approver passcode, or completion worklist work was started.
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
5. Continue carrying forward user‚Üívehicle assignment source work for the future vehicle snapshot phase.
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
- CARRIED FORWARD (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (next step): user‚Üívehicle assignment source absent; vehicle snapshot NULL by design until it exists.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.

### Routing Verdict
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.9, HANDOFF Entry 031).

---

## Entry 033 ‚Äî Vehicle assignment and destination display doctrine

**Date:** 2026-06-16
**Updated by:** ChatGPT
**Phase:** Architecture ‚Äî Vehicle assignment and destination display doctrine
**Session type:** decision / documentation cross-clearance

### Context
Ryan routed the transaction-history destination display question for architecture review because readable labels such as `Miguel's Van` or `Ryan's Truck` depend on the unresolved user‚Üívehicle assignment model. Claude proposed ARCHITECTURE v2.10 wording for Section 16, covering a dedicated time-bounded `vehicle_assignments` bridge table, stable vehicle display labels, and read-path-only destination display resolution. Under Constitutional Rule 20, ChatGPT then reviewed and cleared the actual v2.10 lock wording before Codex applies the architecture edit.

### Decisions Made This Session (locked)
- ARCHITECTURE v2.10 is cleared for application under Rule 20.
- The active user‚Üívehicle assignment model is a dedicated time-bounded bridge table, `vehicle_assignments`, keyed by Clerk user ID and permitting at most one active assignment per user.
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
  - `ARCHITECTURE.md` updated to v2.10 with Section 16 user‚Üívehicle assignment and destination display doctrine.
  - `HANDOFF.md` appended with this Entry 033.
- No app code, migrations, RPCs, permissions, ledger logic, checkout logic, or production data were changed by this documentation entry.

### Lock Document Changes
- ARCHITECTURE.md bumped from v2.9 to v2.10.
- Section 16 now concretizes:
  - `vehicle_assignments` as the user‚Üívehicle assignment source.
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
- CARRIED FORWARD (active): implement no user‚Üívehicle assignment schema or destination display read path until Ryan explicitly starts that implementation step.
- CARRIED FORWARD (active): production UI/browser visual verification from a logged-in Developer session.
- CARRIED FORWARD (active, before widening history): division-scoped read rule must be defined before history is exposed beyond Developer.
- CARRIED FORWARD (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.

### Routing Verdict
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.10, HANDOFF Entry 033).

---

## Entry 034 ‚Äî Vehicle assignment foundation and destination labels

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Phase 1 Inventory ‚Äî Milestone 4N vehicle assignment foundation and destination labels
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
- CARRIED FORWARD (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.

### Routing Verdict
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.10, HANDOFF Entry 033).

---

## Entry 035 ‚Äî transaction-history production bugfix

**Date:** 2026-06-16
**Updated by:** Codex
**Phase:** Phase 1 Inventory ‚Äî transaction-history production bugfix
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
- CARRIED FORWARD (active): no direct `inventory_balances` edits ‚Äî only ledger transactions establish or adjust quantities.
- CARRIED FORWARD (active): office destination semantics must be finalized before office is permanent.
- CARRIED FORWARD (Financials phase): job-cost approval uses a separate field/table ‚Äî never `transaction_items.status`.
- CARRIED FORWARD (when express built): completeness is its own field; developer override reason-gated/process-only; express flags gate express RPCs.

### Routing Verdict
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.10, HANDOFF Entry 034).

---

## Entry 036 ‚Äî Inventory Count surface (read-only) + office-retirement discovery

**Date:** 2026-06-17
**Updated by:** Codex
**Phase:** Phase 1 Inventory ‚Äî count review and office-retirement discovery
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
Claude review required before proceeding ‚Äî office-retirement migration/function edits await Claude review of the Phase A findings and v2.11 in repo.

---

## Entry 037 ‚Äî Office disposition resolved (ARCHITECTURE v2.11)

**Date:** 2026-06-17
**Updated by:** Claude
**Phase:** Inventory (Stage 1) ‚Äî semantics lock
**Session type:** Architecture decision (lock)

### Decisions Made This Session (locked)
- `destination_type` records OUTBOUND disposition only; NULL for inbound/non-movement (Add Stock, Return-to-Inventory, Physical Count Correction).
- `'office'` is a physical location, NOT a material disposition; removed from the material `destination_type` enum (Sections 9, 11).
- Physical Count Correction ‚Üí `destination_type = NULL`.
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
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.11, HANDOFF Entry 037).

---

## Entry 038 ‚Äî Office retirement executed

**Date:** 2026-06-17
**Updated by:** Codex
**Phase:** Inventory (Stage 1) ‚Äî office destination retirement
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
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.11, HANDOFF Entry 038).

---

## Entry 039 ‚Äî Count Intake locked (ARCHITECTURE v2.12)

**Date:** 2026-06-17
**Updated by:** Claude
**Phase:** Inventory (Stage 1) ‚Äî count intake write surface
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
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.12, HANDOFF Entry 039).

---

## Entry 040 ‚Äî Inventory Count Intake Mode built

**Date:** 2026-06-17
**Updated by:** Codex
**Phase:** Inventory (Stage 1) ‚Äî count intake write surface
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
- Added storage-path navigation: Storage Unit ‚Üí Shelf ‚Üí Bay ‚Üí Bin.
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
- Intake write path is one client call: `useInventoryCountIntake.recordCount(...)` ‚Üí `intake_inventory_count(...)`.
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
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.12, HANDOFF Entry 039).

---

## Entry 041 ‚Äî Count Intake UI usability polish

**Date:** 2026-06-17
**Updated by:** Codex
**Phase:** Inventory (Stage 1) ‚Äî count intake usability
**Session type:** implementation

### Context
After Entry 040 built Inventory Count Intake Mode, Ryan manually tested the update and confirmed that the count intake workflow appeared to be working. The remaining problem was usability: the count intake input card did not fit horizontally on the screen, forcing left/right scrolling to fill in values. Ryan requested a UI-only improvement pass while preserving the existing Unit ‚Üí Shelf ‚Üí Bay ‚Üí Bin narrowing workflow and without changing count logic, RPCs, schema, ledger behavior, or permissions.

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
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.12, HANDOFF Entry 040).

---

## Entry 042 ‚Äî bin_item retirement locked (ARCHITECTURE v2.13)

**Date:** 2026-06-17
**Updated by:** Claude
**Phase:** Inventory (Stage 1) ‚Äî structural correction (retire mistaken bin_item)
**Session type:** Architecture decision (lock)

### Decisions (locked ‚Üí ARCHITECTURE v2.13, Section 23; builds on Rule 13 / Section 18)
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
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 042).

---

## Entry 043 ‚Äî bin_item retirement built

**Date:** 2026-06-17
**Updated by:** Codex
**Phase:** Inventory (Stage 1) ‚Äî structural correction (retire mistaken bin_item)
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
No Claude review needed ‚Äî within locked decisions (ARCHITECTURE v2.13, HANDOFF Entry 042).

---

## Entry 044 ‚Äî ALIGNMENT / SYNC POINT

**Date:** 2026-06-17
**Updated by:** Claude
**Phase:** Coordination / governance ‚Äî re-baseline after HANDOFF lineage reconciliation
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
No Claude review needed ‚Äî alignment/sync record within locked decisions
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
- Accepted payload foÎmy⁄⁄$z{-ÆÈ‹j◊ùY]ö\⁄[€àôXY»[ô\àHÿ⁄ŸYŸX›[€àà[Ÿ[ÇÇà»»»⁄]ÿ\»€€\]YãHYY›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃå◊⁄õÿóŸÿ›[Y[ù◊‹õ◊ÿùYŸö^ú‹[ÇãHö^Yÿ›[Y[ù◊‹›‹òYŸW⁄[úŸ\ù€»HõÿãZY]ŸY€Y[ù\»\úŸYúõ€Bà›‹òYŸKõÿöôX›Àõò[YXÇãHö^Yÿ›[Y[ù◊‹ôXY€»›€ãY]ö\⁄[€àôXY»\ôH[›ŸY⁄]àÿ[ó›öY]◊ÿ[Ÿ]ö\⁄[€úÿ›[\õZ][ô»‹õ‹‹ÀY]ö\⁄[€àôXY»⁄\ôBà]]‹ö^ôYÇãH\YYHÿ[YHö^]ôH»Håà›\Xò\ŸHõ⁄ôX›àŸ[Ÿﬁ\€õ›Zÿô[ôöŸöò€òÇãHŸ\õÿàÿ›[Y[ù»åHÿ⁄ŸYŒÇàHŸ[ô\öX»XõXÀôÿ›[Y[ùÿàH›€ô\ó›\HH	⁄õÿâÿàH]ö\⁄[€ã\ÿ€‹YôXY¬àHÿ[ó€X[òYŸW⁄õÿúÿõ‹à\ÿYÿ\ò⁄]ôBàHõ»\ô[]BÇà»»»€€ôö\õYYôZ]ö[‹ÇãHúõ€ù[ô\ÿYõ›»\»›‹òYŸH\ÿYö\ú›[àXõXÀôÿ›[Y[ùÿõ›¬à[úŸ\ùÇãH›‹òYŸH\ÿYÿ\»ôZôX›Yö\ú›\ö[ô»HòZ[YõŸX›[€à][\ÇãHõ»›‹òYŸKõÿöôX›ÿõ›»ÿ\»‹ôX]Yõ‹àHòZ[Y\ÿY][\ÇãHõ»XõXÀôÿ›[Y[ùÿõ›»ÿ\»‹ôX]Yõ‹àHòZ[Y\ÿY][\ÇãHõ»‹ú[ôY›‹òYŸHö[H‹àÿ›[Y[ùõ›»ÿ\»YùôZ[ôÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»ÿ⁄Y[H€‹ö»ÿ\»›\ùYÇãHõ»õÿà^‹ù€‹ö»ÿ\»›\ùYÇãHõ»ô]»\õZ\‹⁄[€àõY‹»Ÿ\ôHYYÇãHõ»\ô[]HôZ]ö[‹àÿ\»YYÇãHõ»[úô[]Yÿ›[Y[ùÀõÿúÀö[ò[ò⁄X[À[ùô[ù‹ûKÿ\ù⁄X⁄€›]‹Çà^‹ùôZ]ö[‹àÿ\»⁄[ôŸYÇÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYô\»úò[ò⁄ô[XZ[ôYXZ[òÇãH€€ôö\õYYÿ‹À–Tê“UP’TëKõYô[XZ[ôYåãåçÀÇãH€€ôö\õYYSë—ëàÿ\»ÿ\\‹»õ›Y⁄[ùûHLåôYõ‹ôH\»\[ôÇãH€€ôö\õYY›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃå◊⁄õÿóŸÿ›[Y[ù◊‹õ◊ÿùYŸö^ú‹[à^\›»[àô\ÀÇãH€€ôö\õYYõ»ÿ⁄Y[H[\[Y[ù][€àÿ\»YYÇãH€€ôö\õYYõ»õÿà^‹ù[\[Y[ù][€àÿ\»YYÇãH€€ôö\õYYõ»ô]»\õZ\‹⁄[€àõY‹»Ÿ\ôH[ùõŸXŸYÇãH€€ôö\õYYõ»SUH€XﬁHÿ\»YYõ‹àXõXÀôÿ›[Y[ùÿÇãH€€ôö\õYYõ»\ô[]H]ÿ\»[ùõŸXŸYÇãH€€ôö\õYYH]ôHõ⁄ôX›õ›»^‹Ÿ\»H€‹úôX›Yÿ›[Y[ù◊‹ôXY[ôàÿ›[Y[ù◊‹›‹òYŸW⁄[úŸ\ù€X⁄Y\ÀÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúKò€Yù[àùZ[ÿ\»õ›ô\]Z\ôYôXÿ]\ŸHõ»ù[ù[YH€ŸH⁄[ôŸY[à\¬àö[ò[^ò][€ã€ŸŸ⁄[ô»\‹ÀÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%õÿàÿ›[Y[ù»\ÿYì»ùYŸö^›^YY⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåçÀSë—ëà[ùûHLåJKÇÇà»»[ùûHLåàH]ô[‹\àõ‹õX][ô»[ô\à[ôõÿú»ôXYXö[]H€X[ù\Çääë]NääàåçãLÀLÇääï\]YûNääà€Ÿ^ääî\ŸNääàõÿú»[Ÿ[H€€\][€à»ùX⁄Ÿ]HRH€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ê€€\]YHô\]Y\›YùX⁄Ÿ]Hÿÿ[[€õHRH\‹»[ô\àTê“UP’TëHåãåç¬îŸX›[€àK⁄]ÿ⁄Y[H›[]\ŸY[ôõÿà^‹ù›[ô\Ÿ\ùôYà\»\‹¬ú›^YY›öX›H[ú⁄YHÿÿ[õ‹õX][ô»€€ùõ€»\»õÿú»ôXYXö[]H€X[ù\ÇÇà»»»⁄]ÿ\»€€\]YãHô\XŸYH€]Y\ûK\\ò[H^[›][ô\à⁄]H]ô[‹\ã[€õHõ‹õX][ô¬à[ô\à[ú⁄YHH]ô[‹\à€‹ö‹‹XŸKÇãHÿ]YH]ô[‹\àò]ã›ŸŸ€K›€‹ö‹‹XŸH⁄]H^\›[ô¬àÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\ò\õZ\‹⁄[€à[ôXYH^‹ŸYõ›Y⁄à\õZ\‹⁄[€úÀòÿ[êXÿŸ\‹—]ô[‹\òÇãHYYHô]»úõ›‹Ÿ\ã[ÿÿ[›‹òYŸHŸ^Bàõ‹ùÿ]Kôõ‹õX][ô’[ô\ãùåXÇãHŸ\H[ô\àÿÿ[[€õHûH\Z[ô»‘‘»ò\öXXõ\»õ›Y⁄àÿ›[Y[ùôÿ›[Y[ù[[Y[ùú›[KúŸ]õ‹\ùJããäX⁄]õ»›\Xò\ŸH‹ö]\ÀÇãHYYô\Ÿ]‹ô\Ÿ]ÿ€‹KP‘‘»ôZ]ö[‹à[ôÿYôH€[\[ô»õ‹àH[ô\àöY[ÀÇãHYYHô\›YYôõ‹ùYÿXﬁHôXY]úõ€Hõ‹ùÿ]Kõ^[›][ô\ãùåX⁄[Bà\ú⁄\›[ô»€õH»õ‹ùÿ]Kôõ‹õX][ô’[ô\ãùåXÇãH[ôYõÿú»€‹ö‹‹XŸHôXYXö[]HX‹õ‹‹»H‹]^[›]]Z[XY\ãXÇà›ö\õ‹õ\Àÿ\ôÀ[ôô\‹€ú⁄]ôH›X⁄⁄[ô»€»⁄YH€€ù[ù›^\»[‹ôBà€€ùZ[ôY[ôôXYXõKÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€úÀìÀ›‹òYŸK]]îÀ‹àòX⁄Ÿ[ôôZ]ö[‹Çàÿ\»⁄[ôŸYÇãHõ»ô]»\õZ\‹⁄[€àõY»ÿ\»YYÇãHõ»ÿ›[Y[ù»\ÿYÿ\ò⁄]ôHŸ⁄X»ÿ\»⁄[ôŸYÇãHõ»ÿ⁄Y[H€‹ö»ÿ\»›\ùYÇãHõ»õÿà^‹ù€‹ö»ÿ\»›\ùYÇãHõ»[ùô[ù‹ûKÿ\ù⁄X⁄€›]ö[ò[ò⁄X[»Ÿ⁄XÀù^[›]Ÿ⁄XÀ‹à]H[Ÿ[àôZ]ö[‹àÿ\»⁄[ôŸYÇãHõ»\ô[]H]ÿ\»YYÇãHõ»ÿ‹À–Tê“UP’TëKõY⁄[ôŸ\»Ÿ\ôHXYKÇÇà»»»ö[\»⁄[ôŸYãH‹òÀ–\öúﬁãH‹òÀ‹›[\Àò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYúò[ò⁄ô[XZ[ôYXZ[òÇãH€€ôö\õYYÿ‹À–Tê“UP’TëKõYô[XZ[ôYåãåçÀÇãH€€ôö\õYYSë—ëàÿ\»ÿ\\‹»õ›Y⁄[ùûHLåHôYõ‹ôH\»\[ôÇãH€€ôö\õYYõ»ÿ⁄Y[H[\[Y[ù][€àÿ\»YYÇãH€€ôö\õYYõ»õÿà^‹ù[\[Y[ù][€àÿ\»YYÇãH€€ôö\õYYõ»ô]»\õZ\‹⁄[€àõY‹»Ÿ\ôH[ùõŸXŸYÇãH€€ôö\õYYõ»›\Xò\ŸHZY‹ò][€ú»Ÿ\ôHYY[à\»\‹ÀÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúKò€Yù[àùZ[\‹ŸYÇÇà»»»õ›\¬ãHõ‹õX][ô»[ô\àYò][»ô[XZ[àH€€[Z]Yò\Ÿ[[ôH[ôô\Ÿ]ô]\õú»Bàúõ›‹Ÿ\àòX⁄»»‹ŸHYò][ÀÇãHH]ô[‹\à€‹ö‹‹XŸHõ›»⁄›‹»Hÿ⁄ŸYXŸZ€\àYà€€Y[€ôHõ›]\»¬à›€‹ö‹‹XŸOY]ô[‹\ò⁄]›]ÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\òÇãHõ»[úô[]YôZ]ö[‹à⁄[ôŸY›]⁄YHHÿÿ[RK‹ôXYXö[]Hÿ€‹KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%]ô[‹\àõ‹õX][ô»[ô\à[ôõÿú»ôXYXö[]H€X[ù\›^YY⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåçÀSë—ëà[ùûHLåäKÇÇà»»[ùûHLå»Hõÿàÿ⁄Y[HåH[\[Y[ùYÇääë]NääàåçãLÀLÇääï\]YûNääà€Ÿ^ääî\ŸNääàõÿú»[Ÿ[H€€\][€à»ÿ⁄Y[BääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^í[\[Y[ùYõÿàÿ⁄Y[HåH[ô\àTê“UP’TëHåãåç»ŸX›[€à»\»Hô^õÿ⁄ŸYõÿú»€€\][€àZ[\›€ôHYù\àÿ›[Y[ù»[ôH]ô[‹\àõ‹õX][ô¬ï[ô\à€X[ù\à\»›^YY[ú⁄YHHõ]Z[\›€ôK›\⁄À[\›ÿ€‹H€õKÇÇà»»»⁄]ÿ\»€€\]YãH‹ôX]YXõXÀöõÿó‹ÿ⁄Y[W⁄][\ÿÇãHYYöY[»]X\ÿ‹ö\[€ò\ôŸ]Ÿ]X›]\ÿ€‹ù€‹ô\òàõ›X\»H›[ô\ô]ö\⁄[€ãÿ\ò⁄]ôKÿ‹ôX]YY]Y]H€€[[úÀÇãHÿ⁄ŸY›]\»ò[Y\»»[ô[ôÿ[ó‹õŸ‹ô\‹ÿ€€\]X[ô[^YYÇãHYYHŸ]⁄õÿó‹ÿ⁄Y[W⁄][\◊›\]Yÿ]öYŸŸ\à\⁄[ô»H^\›[ô¬à›X⁄›\Ÿ\ó‹\õZ\‹⁄[€ú◊›\]Yÿ]

Xù[ò›[€ãÇãH[òXõYHÿ⁄Y[HXà[àHõÿú»€‹ö‹‹XŸKÇãH[\[Y[ùYYY]\ò⁄]ôK[ô\Ÿ›€àô[‹ô\àôZ]ö[‹àõ‹àÿ⁄Y[Bà][\ÀÇãHŸ\\ò⁄]ôHôZ]ö[‹à€Ÿù[€õHõ›Y⁄\ò⁄]ôYÿ]\ò⁄]ôYÿûX[ôà‹[€ò[\ò⁄]ôW‹ôX\€€òÇãHYY]ö\⁄[€ã\ÿ€‹YôXYôZ]ö[‹à[ôÿ[ó€X[òYŸW⁄õÿúÿ‹ö]Kÿ\ò⁄]ôK¬àô[‹ô\àÿ][ô»õ›Y⁄Hô]»XõHìÀÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»\ô[]H€XﬁHÿ\»YYÇãHõ»ô]»\õZ\‹⁄[€àõY»ÿ\»YYÇãHõ»ÿ[[ô\à[ùY‹ò][€àÿ\»YYÇãHõ»€€Ÿ€Hÿ[[ô\à[ùY‹ò][€àÿ\»YYÇãHõ»\[ô[òﬁH[Ÿ[ÿ\»YYÇãHõ»[\ﬁYYH\‹⁄Y€õY[ù»Ÿ\ôHYYÇãHõ»ô[Z[ô\ú»‹àõ›YöXÿ][€ú»Ÿ\ôHYYÇãHõ»ôX›\úö[ôÀY]ô[ùôZ]ö[‹àÿ\»YYÇãHõ»õÿà^‹ù[\[Y[ù][€àÿ\»YYÇãHõ»ÿ›[Y[ù»ôZ]ö[‹àÿ\»⁄[ôŸYÇãHõ»ö[ò[ò⁄X[»ôZ]ö[‹àÿ\»⁄[ôŸYÇãHõ»õ‹õX][ô»[ô\àôZ]ö[‹àÿ\»⁄[ôŸYÇãHõ»Xÿ€›[ù[ôÀX›X[Àô]ô[ùYKõŸö]‹à\‹›YY[ùô[ù‹ûHò[YHôZ]ö[‹Çàÿ\»YYÇãHõ»[ùô[ù‹ûKÿ\ù‹à⁄X⁄€›]ôZ]ö[‹àÿ\»⁄[ôŸYÇãHõ»^\›[ô»ZY‹ò][€ú»Ÿ\ôHY]YÇãHõ»^\›[ô»ìÀ‹ò[ùÀ‹à\õZ\‹⁄[€ú»Ÿ\ôH⁄[ôŸY›]⁄YHHô]¬àõÿó‹ÿ⁄Y[W⁄][\ÿXõKÇÇà»»»ö[\»⁄[ôŸYãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃå⁄õÿó‹ÿ⁄Y[W⁄][\◊Ÿõ›[ô][€ãú‹[ãH‹òÀ–\öúﬁãH‹òÀ‹›[\Àò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYúò[ò⁄ô[XZ[ôYXZ[òÇãH€€ôö\õYYH€‹ö⁄[ô»ôYHÿ\»€X[àôYõ‹ôHY]ÀÇãH€€ôö\õYYÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[òôYõ‹ôHY]ÀÇãH€€ôö\õYYÿ‹À–Tê“UP’TëKõYô[XZ[ôYåãåçÀÇãH€€ôö\õYYSë—ëàÿ\»ÿ\\‹»õ›Y⁄[ùûHLåàôYõ‹ôH\»\[ôÇãH€€ôö\õYYŸX›[€à»^\›»[ôÿ⁄‹»õÿàÿ⁄Y[HåKÇãH€€ôö\õYYõ»^\›[ô»XõXÀöõÿó‹ÿ⁄Y[W⁄][\ÿZY‹ò][€à[ôXYH^\›YÇãH€€ôö\õYY›X⁄›\Ÿ\ó‹\õZ\‹⁄[€ú◊›\]Yÿ]

Xô[XZ[ú»H⁄\ôY\]Yÿ]àöYŸŸ\àù[ò›[€à\ŸYûHYòXŸ[ùõÿú»Xõ\ÀÇãH€€ôö\õYYHõÿú»€‹ö‹‹XŸH[ôXYH^‹ŸYHÿ⁄Y[HXŸZ€\àXà[ôàX›]ò]Y]^\›[ô»Xà€›[ú›XYŸà‹ôX][ô»Hô]»ò]öYÿ][€à[Ÿ[ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúKò€Yù[àùZ[\‹ŸYÇãH]ôH›\Xò\ŸHZY‹ò][€à›[ôYY»X[ùX[\Xÿ][€ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåçÀSë—ëà[ùûHLå KÇÇà»»[ùûHLçHõÿàÿ⁄Y[H\ò⁄]ôHì»ùYŸö^ô\\ôYÇääë]NääàåçãLÀLääï\]YûNääà€Ÿ^ääî\ŸNääàõÿú»[Ÿ[H€€\][€à»ÿ⁄Y[BääîŸ\‹⁄[€à\NääàùYŸö^Çà»»»€€ù^îûX[àúõ›‹Ÿ\ã]\›Yõÿàÿ⁄Y[HåHYù\àHÿ⁄Y[HZ[\›€ôHŸ[ù]ôH[ôò€€ôö\õYYYY]›]\»⁄[ôŸ\À[ô‹ô\ö[ô»€‹öŸYù]\ò⁄]ôK‹ô[[›ôBú›[òZ[Y[àõ›H[ãX\úõ›‹Ÿ\à[ôHôY›[\àúõ›‹Ÿ\ãÇÇà»»»⁄]ÿ\»€€\]YãHô\õŸXŸYH]ôH\ò⁄]ôHòZ[\ôHYù\à€€ôö\õZ[ô»H\ﬁYY⁄]Hÿ\»€ÇàH›\úô[ùÿ⁄Y[HùZ[ÇãH€€ôö\õYYHÿ⁄Y[H\ò⁄]ôH€Y[ù]ÿ\»Ÿ[ô[ô¬à\ò⁄]ôYÿ]\ò⁄]ôYÿûX[ô\ò⁄]ôW‹ôX\€€òÇãH€€ôö\õYYHX›]ôHÿ⁄Y[HÿY]Y\ûH[ôXYHö[\ú¬à\ò⁄]ôYÿ]\»ù[ÇãH€€ôö\õYYH\ôŸ]]ôHõ›‹»Ÿ\ôH›[[ò\ò⁄]ôYYù\à\ò⁄]ôH][\ÀÇãH€€ôö\õYYH]][ùXÿ]Y\Ÿ\â‹»YôôX›]ôH\õZ\‹⁄[€ú»[ò€YBàÿ[ó€X[òYŸW⁄õÿúÿÇãH⁄[][]YH\ò⁄]ôH\]H[à]ôH›\Xò\ŸH[ô\àH]][ùXÿ]Yõ€H[ôà€€ôö\õYYH]Xò\ŸHôZôX›YH\]H⁄]ô]»õ›»ö[€]\»õ›À[]ô[ŸX›\ö]H€XﬁHõ‹àXõHöõÿó‹ÿ⁄Y[W⁄][\»òÇãH\€€]YHòZ[\ôH»Hõÿó‹ÿ⁄Y[W⁄][\◊›\]Xì»€XﬁNÇà‹ô[ò\ûH\]\»›XÿŸYYù]⁄[ô⁄[ô»\ò⁄]ôYÿ]òZ[ÀÇãHYY›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃW⁄õÿó‹ÿ⁄Y[W⁄][\◊ÿ\ò⁄]ôW‹õ◊ÿùYŸö^ú‹[à»[›»H€ŸùX\ò⁄]ôHò[ú⁄][€à⁄[Hõÿ⁄⁄[ô»]\à]]][€àŸà[ôXYBà\ò⁄]ôYÿ⁄Y[Hõ›‹ÀÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»ô]»ÿ⁄Y[HôX]\ô\»Ÿ\ôHYYÇãHõ»õÿà^‹ù€‹ö»ÿ\»›\ùYÇãHõ»ÿ›[Y[ùÀö[ò[ò⁄X[Àõ‹õX][ô»[ô\ã[ùô[ù‹ûKÿ\ù‹à⁄X⁄€›]àôZ]ö[‹àÿ\»⁄[ôŸYÇãHõ»\Xÿ][€à€ŸHÿ\»⁄[ôŸY[à\»ùYŸö^ÇãHõ»\ô[]HôZ]ö[‹àÿ\»YYÇãHHö^›^\»[ú⁄YHH^\›[ô»ŸX›[€à»€ŸùX\ò⁄]ôH[Ÿ[ÇÇà»»»ö[\»⁄[ôŸYãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃW⁄õÿó‹ÿ⁄Y[W⁄][\◊ÿ\ò⁄]ôW‹õ◊ÿùYŸö^ú‹[ãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYúò[ò⁄XZ[òÇãH€€ôö\õYYH€‹ö⁄[ô»ôYHÿ\»€X[àôYõ‹ôHY]ÀÇãH€€ôö\õYYÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[òôYõ‹ôHY]ÀÇãH€€ôö\õYYÿ‹À–Tê“UP’TëKõYô[XZ[ôYåãåçÀÇãH€€ôö\õYYSë—ëàÿ\»ÿ\\‹»õ›Y⁄[ùûHLå»ôYõ‹ôH\»\[ôÇãH€€ôö\õYY›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃå⁄õÿó‹ÿ⁄Y[W⁄][\◊Ÿõ›[ô][€ãú‹[à^\›»[àô\ÀÇãH€€ôö\õYYH]ôHõÿó‹ÿ⁄Y[W⁄][\ÿZY‹ò][€àY[ôXYHôY[à\YYÇãH€€ôö\õYYH]ôHõÿó‹ÿ⁄Y[W⁄][\◊›\]X€XﬁH›[ô\]Z\ôYà\ò⁄]ôYÿ]\»ù[[àT“SëÿÇãH€€ôö\õYYH]ôH\ò⁄]ôHòZ[\ôH\»H]Xò\ŸHì»ôZôX›[€ãõ›H›[Bà\ﬁH‹àúõ›‹Ÿ\ãXÿX⁄H\‹›YKÇãH][\Y»\HH]ôHì»ùYŸö^ù]õŸX›[€à€XﬁK›öYŸŸ\à⁄[ôŸ\¬àô\]Z\ôHúô\⁄^X⁄]\õ›ò[[à\»[ùö\õ€õY[ùôYõ‹ôH^Hÿ[àôHù[ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåçÀSë—ëà[ùûHLå KÇÇà»»[ùûHLçHHõÿàÿ⁄Y[H\ò⁄]ôHŸ[X›\€XﬁHö^ô\\ôYÇääë]NääàåçãLÀLBääï\]YûNääà€Ÿ^ääî\ŸNääàõÿú»[Ÿ[H€€\][€à»ÿ⁄Y[BääîŸ\‹⁄[€à\NääàùYŸö^Çà»»»€€ù^êYù\à[ùûHLç	‹»]ôHì»Yù\›Y[ùÿ\»ù[ãûX[à›[ÿ]»Hÿ[YHÿ⁄Y[Bò\ò⁄]ôHòZ[\ôH[àõ›úõ›‹Ÿ\úÀàHŸX€€ô]ôK\€XﬁH⁄X⁄»ÿ\»ô\]Z\ôYòôXÿ]\ŸHH\]K\€XﬁHö^[€ôHYõ›€X\àH\ò⁄]ôHò[ú⁄][€ãÇÇà»»»⁄]ÿ\»€€\]YãHôKX⁄X⁄ŸYH]ôHõÿó‹ÿ⁄Y[W⁄][\ÿ€XﬁH›]H[ô€€ôö\õYYBàõÿó‹ÿ⁄Y[W⁄][\◊›\]X€XﬁH[ô\ò⁄]ôK\õ›X›[€àöYŸŸ\àúõ€H[ùûBàLçŸ\ôHô\Ÿ[ù[àõŸX›[€ãÇãHôK\ò[àH]ôH]][ùXÿ]Y\ò⁄]ôH⁄[][][€à[ô€€ôö\õYY]›[òZ[Yà⁄]ô]»õ›»ö[€]\»õ›À[]ô[ŸX›\ö]H€XﬁHõ‹àXõHöõÿó‹ÿ⁄Y[W⁄][\»òÇãHõ›ôYHô[XZ[ö[ô»õÿ⁄Ÿ\à\»Hÿ⁄Y[H—SP’]õ›H\]Bà]ûHù[õö[ô»Hõ€òX⁄À[€õH\›][\‹ò\ö[HYYX[òYŸ\àôXYàXÿŸ\‹»[ôÿ]»H\ò⁄]ôH\]H›XÿŸYY[[YYX][KÇãHYY›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃLW⁄õÿó‹ÿ⁄Y[W⁄][\◊ÿ\ò⁄]ôW‹Ÿ[X›‹õ◊Ÿö^ú‹[à»‹ò[ùÿ[YKY]ö\⁄[€àÿ[ó€X[òYŸW⁄õÿúÿ\Ÿ\ú»ÿ⁄Y[K\õ›»ôXYXÿŸ\‹»ôYYYàõ‹àH€ŸùX\ò⁄]ôHò[ú⁄][€ãÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»ô]»ÿ⁄Y[HôX]\ô\»Ÿ\ôHYYÇãHõ»\Xÿ][€à€ŸH⁄[ôŸYÇãHõ»õÿà^‹ù€‹ö»ÿ\»›\ùYÇãHõ»ÿ›[Y[ùÀö[ò[ò⁄X[Àõ‹õX][ô»[ô\ã[ùô[ù‹ûKÿ\ù‹à⁄X⁄€›]àôZ]ö[‹àÿ\»⁄[ôŸYÇãHX›]ôHÿ⁄Y[HRH›[ö[\ú»\ò⁄]ôYÿ]\»ù[€»\ò⁄]ôY][\»¬àõ›ôX\X\à[àHõ‹õX[\›Yù\à\»ö^ÇãHHYYôXY€XﬁH\»[Z]Y»ÿ[YKY]ö\⁄[€à\Ÿ\ú»⁄»[ôXYH]ôBàÿ[ó€X[òYŸW⁄õÿúÿÇÇà»»»ö[\»⁄[ôŸYãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃLW⁄õÿó‹ÿ⁄Y[W⁄][\◊ÿ\ò⁄]ôW‹Ÿ[X›‹õ◊Ÿö^ú‹[ãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYH]ôHõÿó‹ÿ⁄Y[W⁄][\◊›\]X€XﬁHõ»€ôŸ\àô\]Z\ô\¬à\ò⁄]ôYÿ]\»ù[ÇãH€€ôö\õYYH]ôH\ò⁄]ôK\õ›X›[€àöYŸŸ\à^\›ÀÇãH€€ôö\õYYH]ôH\ò⁄]ôH⁄[][][€à›[òZ[YôYõ‹ôHHŸ[X›\€XﬁBà\›ÇãH€€ôö\õYYHõ€òX⁄À[€õH[\‹ò\ûHX[òYŸ\ã\ôXY€XﬁHXZŸ\»H^X›ÿ[YBà]ôH\ò⁄]ôH\]H›XÿŸYYÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåçÀSë—ëà[ùûHLå KÇÇÇ∏•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d∏•¢–’SQSïëTRTà8†%Tì’ëQñHñPSà8†%åçãLÀLB∏•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•dÇïH€»[ùöY\»[[YYX][HXõ›ôH\»X\öŸ\à
[ùûHLç]YåçãLÀL[ôë[ùûHLçK]YåçãLÀLJHŸ\ôH\ÿ€›ô\ôY\ö[ô»H€]YH\ò⁄]X›\ôBúôX€€ò⁄[X][€àŸ\‹⁄[€à»ôH\⁄Xÿ[H’U—à‘ëTà[à\»ö[H8†%[ùûHLçBöYôY[à\[ôYXõ›ôH[ùûHLç\‹]HôZ[ô»]Y€ôH^H]\ãàõ›ô[ùöY\…»›€àõ›][ô»ô\ôX›[ô\»⁄]YíSë—ëà[ùûHLå»à\»Hö[‹Çô[ùûK[ôXÿ][ô»ôZ]\àòYù[ô»Ÿ\‹⁄[€àÿ\»]ÿ\ôHŸàH›\à]H[YKÇÇï\»\»Hÿ[YH€\‹»ŸàYôX›ô]ö[›\€Hÿ›[Y[ùY[ôô\Z\ôY[ô\Çîù[Hå[àTê“UP’TëHåãåM
íSë—ëà[ùûHLKÃLàô\Ÿ[ù][€à‹ô\Çúô\Z\ôY[ô\àù[Hå[ùûHMàäKÇÇî\à€€ú›]][€ò[ù[Hå\»ÿ\»›\ôòXŸY»ûX[àò]\à[à⁄[[ùBò€‹úôX›YàûX[àô]öY]ŸYHö[ô[ô»[ô^X⁄]H\õ›ôYHô\Z\à€ÇååçãLÀLKàH€»[ùöY\»Xõ›ôH]ôHôY[à\⁄Xÿ[Hô[‹ô\ôY[ù»€‹úôX›ò⁄õ€õ€Ÿ⁄Xÿ[Ÿ\]Y[òŸH
LçôYõ‹ôHLçJKàZ\à€€ù[ù\»›\ù⁄\ŸHSê“Së—Q∏†%õ»òX›ÀX⁄\⁄[€úÀ‹àô\öYöXÿ][€à€Z[\»Ÿ\ôH[\ôY€õH‹⁄][€ãÇÇë[ùûHLçà
[[YYX][Hô[› H\»H\õX[ô[ù›[ô\ôYõ‹õX]Ÿ»[ùûHõ‹Çù\»ô\Z\ãõ‹àH]Y]òZ[ÇÇî’SëSë»”P÷KQëëP’UëHîì”HT»“Sïì‘ï–TëÇê[ûH\ÿ‹ô\[òﬁHõ›[ô[à\ŸH€€‹ô[ò][€àÿ›[Y[ù»8†%‹ô\ö[ô»YôX›Àõù[Xô\ö[ô»ÿ\À€€ù[ù€€ôõX›À‹à[ûH›\à[ùY‹ö]H\‹›YH8†%]\›ôBòúõ›Y⁄»ûX[àõ‹à^X⁄]\õ›ò[ôYõ‹ôH[ûH€‹úôX›[€à\»XYKà\¬ò\Y\»ôYÿ\ô\‹»Ÿà⁄X⁄[Ÿ[‹àŸ\‹⁄[€à\ÿ€›ô\ú»H\ÿ‹ô\[òﬁKÇìõ‹õX[\[ô[€õHŸŸ⁄[ô»ô[XZ[ú»^[\\àH^\›[ô»ù[Håÿ\ùôK[›]ÇÇ∏•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•d8•dÇà»»[ùûHLçàHSë—ëà[ùûHLçÃLçH‹ô\ö[ô»YôX›ô\Z\ôY
ù[Hå
BÇääë]NääàåçãLÀLBääï\]YûNääà€]YBääî\ŸNääà€€‹ô[ò][€àÿ›[Y[ù[ùY‹ö]BääîŸ\‹⁄[€à\Nääàô\Z\à
ù[Hå
BÇà»»»€€ù^ë\ö[ô»H€]YH\ò⁄]X›\ôHôX€€ò⁄[X][€àŸ\‹⁄[€à
⁄[\»RH\‹⁄\›[ùúô[ù[Xô\ö[ô»ô\]Y\›
K\ôX›[ú‹X›[€àŸà\»ö[Hõ›[ô[ùûHLçH\⁄Xÿ[Bú‹⁄][€ôYôYõ‹ôH[ùûHLç\‹]H[ùûHLçHôZ[ô»]Y€ôH^H]\ÇäåçãLÀLHúÀàåçãLÀL
Kàõ›[ùöY\…»õ›][ô»ô\ôX›[ô\»⁄]Y[ùûHLå¬ò\»Hö[‹à[ùûK[ôXÿ][ô»XX⁄ÿ\»òYùY⁄]›]ö\⁄Xö[]H[ù»Bõ›\à8†%€€ú⁄\›[ù⁄]€»Ÿ\\ò]HùYŸö^Ÿ\‹⁄[€ú»XX⁄\[ô[ô»Yù\à⁄]ù^Hô[Y]ôYÿ\»H›\úô[ùZ[ÇÇï\»YôX›ÿ\»õ›Y[ùYöYY[àHô\]Y\›X⁄Ÿ]]õ€\YBúôX€€ò⁄[X][€àŸ\‹⁄[€é»]ÿ\»õ›[ô€õHûHôXY[ô»Hÿ[õ€öXÿ[ö[Bô\ôX›Hò]\à[àô[Z[ô»€àH›[[X\ö^ôY⁄X⁄‹⁄[ù\ÿ‹ö\[€ãÇÇîôXŸY[ùàTê“UP’TëHåãåMÿ›[Y[ù»[àY[ùXÿ[ö[‹àô\Z\à
íSë—ëÇë[ùûHLKÃLàô\Ÿ[ù][€à‹ô\àô\Z\ôY[ô\àù[Hå[ùûHMàäKÇÇà»»»⁄]ÿ\»€€\]YãH€€ôö\õYYH‹ô\ö[ô»YôX›]Hû]K€[ôH]ô[
[ùûHLçH]Bà‹öY⁄[ò[[ôHLççÃã[ùûHLç]H‹öY⁄[ò[[ôHLçÃç
KÇãH›\ôòXŸYHö[ô[ô»»ûX[à\àù[Hå⁄]HôX€€[Y[ôYô\€€][€Çà
\⁄Xÿ[ô[‹ô\ãX]⁄[ô»H[ùûHLKÃLàôXŸY[ù
H[ô[à[\õò]]ôBà
X]ôH[àXŸH⁄][à^[ò]‹ûHõ›JKÇãHûX[àô]öY]ŸY[ô^X⁄]H\õ›ôYH\⁄Xÿ[\ô[‹ô\àô\€€][€à€ÇàåçãLÀLKÇãH[ùöY\»Lç[ôLçHŸ\ôHô[‹ô\ôY[ù»€‹úôX›⁄õ€õ€Ÿ⁄Xÿ[Ÿ\]Y[òŸKÇà
äê€€ù[ùŸàõ›[ùöY\»\»[ò⁄[ôŸY
äà8†%€õHZ\à‹⁄][€à[àHö[Bàÿ\»€‹úôX›Yàõ»òX›X⁄\⁄[€ã‹àô\öYöXÿ][€à€Z[H[àZ]\à[ùûHÿ\¬à[\ôYÇãHHö\⁄XõHô\Z\àX\öŸ\àÿ\»[úŸ\ùY[[YYX][Hõ€›⁄[ô»Hô[‹ô\ôYà[ùöY\Àÿ›[Y[ù[ô»HYôX›H\õ›ò[[ôH›[ô[ô»€XﬁHõ‹Çà[ô[ô»ù]\ôH\ÿ‹ô\[ò⁄Y\ÀÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»\Xÿ][€à€ŸH⁄[ôŸYÇãHõ»ÿ⁄[XKìÀ‹à\õZ\‹⁄[€à⁄[ôŸY\»Hô\›[Ÿà\»ô\Z\à8†%Bà[ô\õZ[ô»ÿ⁄Y[H\ò⁄]ôHì»ö^
ÿ›[Y[ùY[à[ùöY\»LçLLçBà[\Ÿ[ô\ Hÿ\»[ôXYH]ôH[ôô\öYöYYö[‹à»\»ô\Z\ãÇãHõ»€€ù[ùÿ\»[]Y‹àô]‹ö][à8†%\»ÿ\»H‹⁄][€ã[€õH€‹úôX›[€ãÇãH\»ô\Z\à]Ÿ[àÿ\»^X⁄]H\õ›ôYûHûX[àôYõ‹ôHôZ[ô»\YYà€€ú⁄\›[ù⁄]ù[Hå	‹»ô\]Z\ô[Y[ù]€€‹ô[ò][€àÿ›[Y[ù»\ôHô]ô\ÇàY]Y‹àô\Z\ôY⁄[[ùKÇÇà»»»ö[\»⁄[ôŸYãHSë—ëãõY
[ùöY\»LçÃLçHô[‹ô\ôY»ô\Z\àX\öŸ\à[ô\»[ùûBà\[ôY
BÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYHô[‹ô\ôY[ùöY\…»€€ù[ù\»û]KZY[ùXÿ[»H‹öY⁄[ò[à€õHZ\àŸ\]Y[òŸH⁄[ôŸYÇãH€€ôö\õYYõ»›\à[ùûH[àHö[Hÿ\»›X⁄YÇãH€€ôö\õYYSë—ëà\»ÿ\\‹»[à[ùûHù[Xô\ö[ô»
LåÀLçLçKLçäH]ô[Çà›Y⁄HôK\ô\Z\àö[HYLçÃLçHô]ô\úŸY[à‹⁄][€ãÇÇà»»»ô]»›[ô[ô»€XﬁH
YôôX›]ôHúõ€H\»[ùûHõ‹ùÿ\ô
Bê[ûH\ÿ‹ô\[òﬁHõ›[ô[àH€€‹ô[ò][€àÿ›[Y[ù»8†%‹ô\ö[ô»YôX›Àõù[Xô\ö[ô»ÿ\À€€ù[ù€€ôõX›À‹à[ûH›\à[ùY‹ö]H\‹›YH8†%]\›ôBòúõ›Y⁄»ûX[àõ‹à^X⁄]\õ›ò[ôYõ‹ôH[ûH€‹úôX›[€à\»XYKôYÿ\ô\‹¬õŸà⁄X⁄[Ÿ[‹àŸ\‹⁄[€à\ÿ€›ô\ú»]àõ‹õX[\[ô[€õHŸŸ⁄[ô»ô[XZ[ú¬ô^[\\àH^\›[ô»ù[Håÿ\ùôK[›]à\»õ‹õX[^ô\À\»[à^X⁄]ú›[ô[ô»[ú›ùX›[€ã⁄]ù[Hå[ôXYH[\YYÇÇà»»»õ›][ô»ô\ôX›îô\Z\à\õ›ôY\ôX›HûHûX[à
åçãLÀLJH8†%ù[Håÿ]\ŸöYYûH€€BôX⁄\⁄[€à]]‹ö]H\õ›ò[àõ»ù\ù\à‹õ‹‹ÀX€X\ò[òŸHô\]Z\ôYõ‹à\¬úô\Z\à‹X⁄YöXÿ[K›Y⁄H›[ô[ô»€XﬁHXõ›ôH\Y\»»[ù]\ôBô\ÿ‹ô\[ò⁄Y\ÀÇÇãKKBà»»[ùûHLç»H⁄[\»
RH\‹⁄\›[ù
Hÿ⁄ŸY
Tê“UP’TëHåãåéô]»ŸX›[€à
N»ŸX›[€à»[H
ÿ⁄Y[H\ò⁄]ôHì»ö^ÿ›[Y[ù][€äBÇääë]NääàåçãLÀLBääï\]YûNääà€]YBääî\ŸNääà⁄[\»HRH\‹⁄\›[ùõ›[ô][€é»õÿú»[Ÿ[HHÿ⁄Y[Hì»ÿ›[Y[ù][€ÇääîŸ\‹⁄[€à\NääàX⁄\⁄[€à»\ò⁄]X›\ôH»ôX€€ò⁄[X][€ÇÇà»»»€€ù^íõÿàÿ⁄Y[HåH
ŸX›[€à H\»]ôKúõ›‹Ÿ\ã]\›Y[ô]»\ò⁄]ôK‹ô[[›ôBôù[ò›[€ò[]HòZ[Y]ôHì»\›[ô»Yù\à[ö]X[\ﬁ[Y[ùà€Ÿ^XY€õ‹ŸYò[ôö^Y\»X‹õ‹‹»€»Ÿ\‹⁄[€ú»
[ùöY\»LçLLçJNà[àTUH€XﬁHö^ù[àH—SP’€XﬁHö^õ›ô\]Z\ôYŸŸ]\àõ‹àH€ŸùX\ò⁄]ôBùò[ú⁄][€à»›XÿŸYYàûX[à€€ôö\õYY]ôHô\€€][€ãÇÇë[ùöY\»LçLLçHŸ\ôH[€»õ›[ô»ôH\⁄Xÿ[H›]Ÿà‹ô\à[à\»ö[N¬ù]YôX›ÿ\»ô\Z\ôY[[YYX][Hö[‹à»\»[ùûH
ŸYH[ùûHLçäH⁄]îûX[â‹»^X⁄]\õ›ò[ÇÇîŸ\\ò][KûX[àô\]Y\›Y⁄[\»
RH\‹⁄\›[ù
H\ò⁄]X›\ôKô]ö[›\€BôòYùYYÿZ[ú›H›[H⁄X⁄‹⁄[ù
åãåçÀ—[ùûHLç\‹›[YY\»ö[‹à›]JKÇîôX€€ò⁄[Y\»Ÿ\‹⁄[€àYÿZ[ú›HX›X[ÿ[õ€öXÿ[›]NàåãåçÀÿ\\‹¬ùõ›Y⁄[ùûHLçàõ€›⁄[ô»Hô\Z\àXõ›ôKà\»[ùûH\»LçÀÇÇà»»»X⁄\⁄[€ú»XYH\»Ÿ\‹⁄[€à
ÿ⁄ŸY
BãHŸX›[€à»[Nàÿ›[Y[ù»]ÿ⁄Y[I‹»€ŸùX\ò⁄]ôHò[ú⁄][€àô\]Z\ôYà”»€€‹ô[ò]Yì»€X⁄Y\»
TUH
»—SP’
Kõ›€ôHH\ò⁄]ôYÿ]T¬àïS]\›õ›ÿ]HHTUH€XﬁI‹»T“Së»€]\ŸK[ôH—SP’€XﬁBà]\›[›»ÿ[YKY]ö\⁄[€àÿ[ó€X[òYŸW⁄õÿú»\Ÿ\ú»»ôXYHõ›»õ›Y⁄Bàò[ú⁄][€ãàõ»\⁄Y€à⁄[ôŸHH€ŸùX\ò⁄]ôK[€õKÿ[ó€X[òYŸW⁄õÿúÀà›€ãY]ö\⁄[€ãõ»\ô[]Kõ»ô]»\õZ\‹⁄[€àõY»[ô[XZ[à^X›H\¬à‹öY⁄[ò[Hÿ⁄ŸYàH€]YKÿ›[Y[ù[ô»€Ÿ^	‹»]ôK]ô\öYöYYö^à
[ùöY\»LçLLçJKÇãHŸ[ô\ò[ö[ò⁄\HŸŸŸYõ‹àù]\ôHì»€‹öŒà€ŸùX\ò⁄]ôHò[ú⁄][€ÇàòZ[\ô\»⁄›[ôH⁄X⁄ŸYYÿZ[ú›ì’HTUH[ô—SP’€XﬁKõ›àHTUH€XﬁH[à\€€][€àHõ›»H€õ›€àòZ[\ôH⁄\Hõ‹à\¬àõ⁄ôX›àH€]YKÇãH⁄[\Œà[ö[‹à\⁄Y€àX⁄\⁄[€ú»[ò⁄[ôŸYúõ€HH€‹ö⁄[ô»Ÿ\‹⁄[€à⁄]àûX[àH\õZ\‹⁄[€ãX]ÿ\ôH[ù\ôòXŸH^Y\é»ôXY»€õHõ›Y⁄ô\]Y\›[ô¬à\Ÿ\â‹»›€àì»€€ù^»ô]YûHù[ò›[€à]\›\ŸH\Ÿ\àï’õ›àŸ\ùöXŸK\õ€Kõ‹à›\Xò\ŸHôXYŒ»⁄[\»ô]ô\à‹ö]\»\ôX›H»ù\⁄[ô\‹¬àXõ\Œ»\õ›ôYX›[€ú»õ›]Hõ›Y⁄^\›[ô»î‹ÀŸõ›‹»€õN»ôYBàô\‹€úŸH‹[€ú»
\õ›ôH»[ûH»›\ã\‹X⁄YûJK⁄]›\ã\‹X⁄YûBàõŸX⁄[ô»Hô]ö\ŸY›YŸŸ\›[€é»õ»⁄[[ù‹ö]\Œ»YXÿ]Y⁄[\»€‹ö‹‹XŸBà\»õÿ][ô»⁄]ùXòõH⁄\ö[ô»€ôHòX⁄Ÿ[ô[ô€ôH€€ùô\úÿ][€à\›‹ûN¬à⁄]\›‹ûH\ú⁄\›Y[à›\Xò\ŸK\ã]\Ÿ\àì»
õ›]ö\⁄[€ã\ÿ€‹Y
N¬àTHŸ^HŸ\ùô\ã\⁄YH€õKô]ô\à€Y[ùY^‹ŸY»]ô[‹\à⁄[›⁄]⁄à
⁄[\◊‹Ÿ][ô‹Àú⁄[\◊Ÿ[òXõY
H[ôõ‹òŸYŸ\ùô\ã\⁄YH[àHô]YûHù[ò›[€ãàõ›ù\›Y[à€Y[ù\⁄YN»õ»ô]»\õZ\‹⁄[€àõY‹»ô^[€ôô]\⁄[ô¬àÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\àõ‹àH⁄[›⁄]⁄»õ»‹õ‹‹À]\Ÿ\à⁄]ö\⁄Xö[]N»õ¬à\ôX›[ùô[ù‹ûWÿò[[òŸ\»‹ö]\Œ»ôXŸZ\Y\ö]ôYò[úÿX›[€ú»]X⁄BàôXŸZ\[XYŸHöXHH^\›[ô»ÿ›[Y[ù»]
›€ô\ó›\OI⁄õÿâ N»õÿÇà^‹ùô[XZ[ú»[úÿ€‹Y[ô\»õ›\ùŸà⁄[\ÀàHûX[à
‹\ò][€ò[à[Ÿ[€‹ö⁄[ô»Ÿ\‹⁄[€äKõ‹õX[^ôYûH€]YKÇãHô]»ŸX›[€éàŸX›[€à
⁄[\ Kö[[ô»Hëù]\ôHRH\‹⁄\›[ùà€›àô\Ÿ\ùôY[àŸX›[€à⁄[òŸHHõ⁄ôX›	‹»‹öY⁄[ò[\ò⁄]X›\ôH\‹ÀàBà€]YKÇãHõÿà^‹ù[›ô\»»ô\Ÿ\ùôYŸX›[€àH
ÿ\»ô\Ÿ\ùôY\»»⁄[\»€⁄»à⁄[òŸH]ÿ\»ôXYH[ô^‹ù^X⁄]H\»õ›
KàH€]YKÇãHô\ú⁄[€àYò[òŸ\»»åãåéàH€]YKÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôH\YY]ôH[à\»[ùûKàŸX›[€à»[H\»ÿ›[Y[ù][€ã[€õHBàHX›X[ÿ⁄[XK‘ì»ÿ\»[ôXYH\YY]ôHöXHH€»ZY‹ò][€ú¬àôYô\ô[òŸY[àHŸX›[€à»[H^
åçåÃKåçåÃLJKÇãH⁄[\»ÿ⁄[XH
⁄[\◊ÿ€€ùô\úÿ][€úÀ⁄[\◊€Y\‹ÿYŸ\À⁄[\◊‹Ÿ][ô‹ H\¬à–“—Qù]ì’QUSTSQSïQà\»[ùûH]]‹ö^ô\»Hÿ‹»\]H€õKàõ›[\[Y[ù][€ãÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãHõ€ôH\»Ÿ\‹⁄[€à
X⁄\⁄[€ãÿ\ò⁄]X›\ôK‹ôX€€ò⁄[X][€à€õJKÇÇà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ãHTê“UP’TëHOàåãåéàŸX›[€àÀåàô\XŸY⁄]H\ò⁄]ôHì»[Bà^»ô]»ŸX›[€à
⁄[\Àù[^
N»ô\ú⁄[€à[ôH\]YÇãHô]öY]ŸY[ôö[ò[^ôYûH€]YN»ûX[à\Y\»[ô€€[Z]ÀÇãH\»[ùûH]]‹ö^ô\»H–‘ÀS”ìH\]H»Tê“UP’TëKõYà]Ÿ\»ì’à]]‹ö^ôH⁄[\»[\[Y[ù][€ãÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãH\»[ùûH\»–‘ÀS”ìKà»õ›[\[Y[ù⁄[\Àà»õ››X⁄àõÿó‹ÿ⁄Y[W⁄][\À]»ìÀ‹à[ûH›\à^\›[ô»XõK‘îÀ’RHHBàÿ⁄Y[Hö^\»[ôXYH]ôN»ŸX›[€à…‹»[H€õHÿ›[Y[ù»]àô]õÿX›]ô[H]H\ò⁄]X›\ôH]ô[ÇãH⁄[\»[\[Y[ù][€à
ZY‹ò][€ãô]YûHù[ò›[€ãRJH\»H—TTêUHù]\ôBàô\]Y\›ÿ]Y€àûX[â‹»X⁄\⁄[€à»õÿŸYYYù\à\»ÿ‹»\]H\¬à€€[Z]YÇãH⁄[à⁄[\»[\[Y[ù][€à\»]ô[ùX[Hô\]Y\›YàH⁄[ô€HY⁄\›\›ZŸ\¬àôYõY⁄][H\»€€ôö\õZ[ô»Hô]YûHù[ò›[€à]][ùXÿ]\»»›\Xò\ŸBà\⁄[ô»Hô\]Y\›[ô»\Ÿ\â‹»ï’õ›HŸ\ùöXŸK\õ€HŸ^HH\»]\õZ[ô\¬à⁄]\à⁄[\»€‹úôX›H[ö\ö]»^\›[ô»ì»‹àXÿ⁄Y[ù[HŸ]¬àYZ[ã[]ô[ôXYXÿŸ\‹Àà\»]\›ôH€€ôö\õYY^X⁄]Kõ›\‹›[YYÇÇà»»»⁄]€]YHôYY»»€õ›¬ãH⁄[\»\⁄Y€à\»ù[Hÿ⁄ŸY[ô›XõKà[\[Y[ù][€ã\õ€\Ÿ[ô\ò][€Çà\»Hô^›\€òŸHûX[à€€[Z]»\»ÿ‹À[€õH\]K[ô\»HŸ\\ò]Bàù]\ôHô\]Y\›ÇãHH€À\€XﬁH€ŸùX\ò⁄]ôHì»\‹€€à
ŸX›[€à»[JH⁄›[ôHôX]Yà\»H›[ô[ô»⁄X⁄€\›][Hõ‹à[ûHù]\ôHXõHÿZ[ö[ô»€ŸùX\ò⁄]ôK‘ì¬àõ‹àHö\ú›[YKõ›ù\›H€ôK[Ÿôàÿ⁄Y[Hö^ÇãHHSë—ëà‹ô\ö[ôÀYYôX›ô\Z\à
[ùûHLçäH\›Xõ\⁄YH›[ô[ô¬à€XﬁNà[ù]\ôH€€‹ô[ò][€ãYÿ›[Y[ù\ÿ‹ô\[ò⁄Y\»õ›]H»ûX[àõ‹Çà\õ›ò[ôYõ‹ôH€‹úôX›[€ãà\H\»€⁄[ô»õ‹ùÿ\ô⁄]›]ôZ[ô¬àôK\ô[Z[ôYÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[à\Y\»[ô€€[Z]»Tê“UP’TëHåãåé
ŸX›[€à»[H
»ŸX›[€à
Bà[ô\»Së—ëà[ùûKÇåãà⁄[\»[\[Y[ù][€àõ€\Ÿ[ô\ò][€à\[ú»\»HŸ\\ò]Hù]\ôBàô\]Y\›€òŸHHÿ‹À[€õH\]H\»€€[Z]YÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH
ÿ\úöYYõ‹ùÿ\ô
H›\Xò\ŸH]]X€€ù^\õÿX⁄õ‹àH⁄[\»ô]YûBàù[ò›[€àô[XZ[ú»HY⁄\›\›ZŸ\»‹[à[\[Y[ù][€à]Y\›[€ã»ôBàô\€€ôY]€Ÿ^ôYõY⁄⁄[à[\[Y[ù][€àôY⁄[ú»Hõ›\ùŸà\¬àÿ‹À[€õH[ùûKÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãH–TîíQQì‘ï–Tëà[⁄[\»ô\Ÿ\ùôY][\»[ò⁄[ôŸY
õÿX›]ôHX›[€úÀà][K\›\]]€õ€[›\»⁄Z[úÀõ⁄XŸHK”À‹õ‹‹À]\Ÿ\à⁄]ö\⁄Xö[]KàŸ[ã[[ŸYûZ[ô»€€ôöY›\ò][€ãŸ[ô\ò[\\ú‹ŸHôX]\ôKYõY»ﬁ\›[Hô^[€ôà⁄[\◊‹Ÿ][ô‹ Kàõÿà^‹ùô[XZ[ú»[úÿ€‹Yõ›»ŸX›[€àKÇãH–TîíQQì‘ï–Tëàõ»\ôX›[ùô[ù‹ûWÿò[[òŸ\»‹ö]\Œ»õ»ô]»\õZ\‹⁄[€ÇàõY‹»ô^[€ôÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\àô]\ŸHõ‹àH⁄[\»⁄[›⁄]⁄ÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåéSë—ëà[ùûHLç KÇÇãKKBÇà»»[ùûHLéH⁄[\»õ›[ô][€à[\[Y[ùYÇääë]NääàåçãLÀLBääï\]YûNääà€Ÿ^ääî\ŸNääà⁄[\»õ›[ô][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ï\»\»Hö\ú›[\[Y[ù][€à\‹»Yù\àHÿ‹À[€õH⁄[\»\ò⁄]X›\ôBõÿ⁄»[àTê“UP’TëHåãåéŸX›[€ààûX[à\õ›ôY‹[€àH»\ŸHH€õNÇúÿ⁄[XKìÀ€ÿò[⁄[›⁄]⁄ô]YûHõﬁHõ›[ô][€ãYXÿ]Y€‹ö‹‹XŸBú⁄[õÿ][ô»ùXòõH⁄[[ô]ô[‹\àŸŸ€H8†%⁄]›][ûHù\⁄[ô\‹ÀY]Bù‹ö]Hÿ\Xö[]H‹àYò[òŸY›YŸŸ\›YX›[€úÀÇÇà»»»⁄]ÿ\»€€\]YãH‹ôX]Y›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃLó‹⁄[\◊Ÿõ›[ô][€ãú‹[ÇãH‹ôX]YXõXÀú⁄[\◊ÿ€€ùô\úÿ][€úÿÇãH‹ôX]YXõXÀú⁄[\◊€Y\‹ÿYŸ\ÿÇãH‹ôX]YXõXÀú⁄[\◊‹Ÿ][ô‹ÿÇãHŸYYYH⁄[ô€K\õ›»⁄[\»Ÿ][ô‹»ôX€‹ô⁄]⁄[\◊Ÿ[òXõYHùYXÇãH[ôõ‹òŸYH⁄[ô€K\õ›»Ÿ][ô‹»€€ùô[ù[€à⁄]H[ö\]YH[ô^€àH€€ú›[ùà^ô\‹⁄[€ãÇãHYYŸ]‹⁄[\◊ÿ€€ùô\úÿ][€ú◊›\]Yÿ]ÇãHYYŸ]‹⁄[\◊‹Ÿ][ô‹◊›\]Yÿ]ÇãHYY\ã]\Ÿ\àì»õ‹à⁄[\»€€ùô\úÿ][€úÀ€Y\‹ÿYŸ\ÀÇãHYY]][ùXÿ]YôXY
»]ô[‹\ã[€õH\]Hõ‹à⁄[\◊‹Ÿ][ô‹ÿ\⁄[ô¬àH^\›[ô»ÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\òYôôX›]ôK\\õZ\‹⁄[€ú»]\õãÇãHYYõ»SUH€X⁄Y\»€à[ûH⁄[\»XõKÇãHYYô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿ\»H⁄[\»õﬁHõ›[ô][€ãÇãH€€ôö\õYYHõﬁH\Ÿ\»Hô\]Y\›[ô»\Ÿ\â‹»€\öÀZ\‹›YY›\Xò\ŸHï’õ‹Çà›\Xò\ŸHôXYÀ›‹ö]\»ûH‹ôX][ô»Hù[ò›[€ã\⁄YH€Y[ùúõ€HH[õ€ã‹XõX¬àŸ^H\»H[ò€€Z[ô»]]‹ö^ò][€éàôX\ô\àù›òXY\ãÇãH€€ôö\õYYHõﬁHŸ\»õ›\ŸH’TPêT—W‘—TïíP—W‘ì”W“—VX[ôŸ\»õ›\ŸBàŸ\ùöXŸK\õ€H\»X[ùX[ö[\ö[ôÀÇãH€€ôö\õYYHòX⁄Ÿ[ô⁄X⁄‹»⁄[\◊‹Ÿ][ô‹Àú⁄[\◊Ÿ[òXõYôYõ‹ôH[ûBà\Ÿ\ã\ÿ€‹Y⁄[\»€€ùô\úÿ][€àôXY‹à€]YHTHÿ[ÇãHYYHYXÿ]Y⁄[\»€‹ö‹‹XŸH⁄[»HXZ[à\ò]öYÿ][€ãÇãHYYHõÿ][ô»⁄[\»ùXòõH⁄[]⁄\ô\»Hÿ[YH€€ùô\úÿ][€à\›‹ûKÇãHYYH]ô[‹\à\⁄õÿ\ô⁄[\»[òXõY»⁄[\»\ÿXõYŸŸ€KÇãHYY]ô[‹\ã]ö\⁄XõHZ\‹⁄[ôÀZŸ^HY\‹ÿY⁄[ô»õ‹Çà“ST◊–Sïì‘P◊–TW“—VXÇãHYYõ›[ô][€à⁄]\ú⁄\›[òŸHõ‹à\Ÿ\ãÿ\‹⁄\›[ùY\‹ÿYŸH\›‹ûHõ›Y⁄àHô]»⁄[\»Xõ\»€õKÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»ô]»\õZ\‹⁄[€àõY‹»Ÿ\ôHYYÇãHõ»^\›[ô»\õZ\‹⁄[€ú»Ÿ\ôH⁄[ôŸYÇãHõ»^\›[ô»ù\⁄[ô\‹ÀY]HXõHìÀŸ‹ò[ùÀ‹€X⁄Y\»Ÿ\ôH⁄[ôŸYÇãHõ»\ôX›[ùô[ù‹ûWÿò[[òŸ\ÿ‹ö]H]ÿ\»YYÇãHõ»Ÿ\ùöXŸK\õ€H›\Xò\ŸHôXY]ÿ\»YYõ‹à⁄[\ÀÇãHõ»ù\⁄[ô\‹ÀY]H‹ö]\»\ôH\ôõ‹õYYûHH⁄[\»õﬁKÇãHõ»[ùô[ù‹ûKÿ\ù⁄X⁄€›]ÿ›[Y[ùÀö[ò[ò⁄X[Àÿ⁄Y[K‹àõ‹õX][ô¬à[ô\àôZ]ö[‹àÿ\»⁄[ôŸYô^[€ô⁄\ôY\\⁄[^‹›\ôHŸàH⁄[\¬à€‹ö‹‹XŸH[ôùXòõKÇãHõ»õÿà^‹ù€‹ö»ÿ\»›\ùYÇÇà»»»\ŸHH[Z]][€ú¬ãHõ»ôXŸZ\\ú⁄[ôÀÇãHõ»›YŸŸ\›YXX›[€à^X›][€ãÇãHõ»ù\⁄[ô\‹ÀY]H‹ö]\ÀÇãHõ»ÿ\ù–⁄X⁄€›]⁄\ö[ôÀÇãHõ»ÿ›[Y[ù»\ÿY⁄\ö[ôÀÇãHõ»õÿàùYŸ][ôH⁄\ö[ôÀÇãHõ»ÿ⁄Y[H⁄\ö[ôÀÇãHõ»õÿà^‹ùÇÇà»»»ö[\»⁄[ôŸYãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃLó‹⁄[\◊Ÿõ›[ô][€ãú‹[ãHô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿãH‹òÀ⁄€⁄‹À›\ŸT⁄[\ÀöúÿãH‹òÀÿ€€\€ô[ùÀ‘⁄[\‘[ô[ÀöúﬁãH‹òÀ–\öúﬁãH‹òÀ‹›[\Àò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYúò[ò⁄XZ[òÇãH€€ôö\õYY€‹ö⁄[ô»ôYHÿ\»€X[àôYõ‹ôHY]ÀÇãH€€ôö\õYYÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[òôYõ‹ôHY]ÀÇãH€€ôö\õYYÿ‹À–Tê“UP’TëKõYô[XZ[ôYåãåéÇãH€€ôö\õYYSë—ëàÿ\»›\úô[ùõ›Y⁄[ùûHLç»ôYõ‹ôH\»\[ôÇãH€€ôö\õYYŸX›[€à^\›»[ôÿ⁄‹»⁄[\ÀÇãH€€ôö\õYYŸX›[€à^X⁄]Hô\]Z\ô\»ô\]Y\›[ôÀ]\Ÿ\àï’›\Xò\ŸHXÿŸ\‹Ààõ›Ÿ\ùöXŸK\õ€HXÿŸ\‹ÀÇãH€€ôö\õYYõ»ö[‹à⁄[\»ZY‹ò][€ú»^\›Y[àô\ÀÇãH€€ôö\õYYõ»ö[‹à⁄[\◊ÿ€€ùô\úÿ][€úÿ⁄[\◊€Y\‹ÿYŸ\ÿ‹Çà⁄[\◊‹Ÿ][ô‹ÿZY‹ò][€ú»^\›Y[àô\ÀÇãH€€ôö\õYYõ»ô]YûKŸù[ò›[€úÿ[\[Y[ù][€à^\›YôYõ‹ôH\»\‹ÀÇãH€€ôö\õYYHúõ€ù[ô[ôXYHYHô]\ÿXõH]][ùXÿ]Y›\Xò\ŸH€Y[ùà]\õà\⁄[ô»€\ö»Ÿ]⁄Ÿ[ä»[\]Nà	‹›\Xò\ŸI»JX\¬à‹ôX]T›\Xò\ŸP€Y[ù
⁄Ÿ[äXÇãH€€ôö\õYYHù[ò›[€ã\⁄YH⁄[\»›\Xò\ŸH€Y[ù\»ùZ[úõ€H[õ€ã‹XõX¬à‹ôY[ùX[»\»Hô\]Y\›[ô»\Ÿ\â‹»ï’[àH]]‹ö^ò][€àXY\ãÇãH€€ôö\õYYõ»’TPêT—W‘—TïíP—W‘ì”W“—VXôYô\ô[òŸHÿ\»YYÇãH€€ôö\õYY⁄[\◊‹Ÿ][ô‹Àú⁄[\◊Ÿ[òXõY\»⁄X⁄ŸY[ú⁄YHHòX⁄Ÿ[ôàù[ò›[€ãÇãH€€ôö\õYY€õH€ôHô]»ZY‹ò][€àö[Hÿ\»YY[ôõ»^\›[ô»ZY‹ò][€àö[Bàÿ\»Y]YÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúKò€Yù[àùZ[\‹ŸYÇãH]ôH›\Xò\ŸHZY‹ò][€àÿ\»õ›\YY[à\»Ÿ\‹⁄[€à[ô›[ôYY»X[ùX[à\Xÿ][€àYàûX[àÿ[ù»H\ﬁYY\»\ŸH⁄[\»[[YYX][KÇãHô]YûH[ùàò\à“ST◊–Sïì‘P◊–TW“—VX›[ôYY»\ﬁ[Y[ù][YHŸ]\‹Çàô\öYöXÿ][€à[õ\‹»ûX[à[ôXYH€€ôöY›\ôY][àô]YûH›]⁄YH\¬àŸ\‹⁄[€ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%⁄[\»õ›[ô][€à›^YY⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåéSë—ëà[ùûHLé
KÇÇà»»[ùûHLéHH⁄[\»õ›[ô][€à]ôHô\öYöXÿ][€ÇÇääë]NääàåçãLÀLLääï\]YûNääà€Ÿ^ääî\ŸNääà⁄[\»õ›[ô][€ÇääîŸ\‹⁄[€à\Nääà]ôHô\öYöXÿ][€àÿ›[Y[ù][€ÇÇà»»»€€ù^î⁄[\»õ›[ô][€àÿ\»[\[Y[ùY[ô\àTê“UP’TëHåãåéŸX›[€à[ôú⁄\Y[à[\[Y[ù][€à€€[Z]çNXÃÿXàûX[à[àX[ùX[H\YYH]ôBî›\Xò\ŸHZY‹ò][€ã€€ôö\õYYHô]YûK–TKZŸ^Hõ›[ô][€àÿ\»›YôöX⁄Y[ùBò€€ôöY›\ôYõ‹àô\‹€úŸ\À[ô€€\]YHúõ›‹Ÿ\ãXò\ŸY]ôHô\öYöXÿ][€à\‹ÀÇÇà»»»⁄]ÿ\»ô\öYöYYãH[\[Y[ù][€à€€[Z]çNXÃÿXÿ\»[ôXYH\⁄YôYõ‹ôH\»[ùûKÇãH]ôH›\Xò\ŸHZY‹ò][€Çà›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃLó‹⁄[\◊Ÿõ›[ô][€ãú‹[ÿ\»\YYàX[ùX[KÇãHûX[à€€ôö\õYY⁄[\»\ŸHH€‹ö‹»]ôKÇãH⁄[\»€‹ö‹‹XŸH\X\ú»⁄[à[òXõYÇãHõÿ][ô»⁄[\»ùXòõH\X\ú»⁄[à[òXõYÇãHHò\⁄X»⁄]Y\‹ÿYŸHŸ[ô»›XÿŸ\‹Ÿù[KÇãHY\‹ÿYŸH\›‹ûH\ú⁄\›»[àH⁄[\»€‹ö‹‹XŸKÇãHHÿ[YH€€ùô\úÿ][€ã⁄\›‹ûH\»⁄\ôY⁄]Hõÿ][ô»ùXòõKÇãH]ô[‹\à\⁄õÿ\ô⁄[\»[òXõY»\ÿXõYŸŸ€H€‹ö‹ÀÇãH\ÿXõY›]H\ú⁄\›»Yù\àôYúô\⁄ÇãHôKY[òXõ[ô»ô\›‹ô\»H⁄[\»€‹ö‹‹XŸH[ôùXòõKÇãHHòX⁄Ÿ[ôõ›[ô][€àô\‹€úŸH›[€€ôö\õ\»\ŸHK[€õHôZ]ö[‹éÇà⁄[\»õ›[ô][€à\»€õ[ôKàHÿ]ôY[›\àY\‹ÿYŸHXõ›]ï⁄]ÿ[à[›H»[à\ŸHO»à[ô⁄[›^H[ú⁄YH[›\à^\›[ô»\õZ\‹⁄[€úÀà\õ›ôK—[ûHù\⁄[ô\‹»X›[€úÀôXŸZ\À[ô[Ÿ[K\‹X⁄YöX»]]€X][€ú»\ôHõ›[òXõYY][à\ŸHKòÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»\õ›ôK—[ûHù\⁄[ô\‹»X›[€ú»\ôH[òXõYÇãHõ»ôXŸZ\[\‹ù\»[òXõYÇãHõ»[Ÿ[K\‹X⁄YöX»]]€X][€ú»\ôH[òXõYÇãHõ»õÿà^‹ù€‹ö»ÿ\»YYÇãHõ»ù\⁄[ô\‹ÀY]H‹ö]\»\ôH[òXõYúõ€H⁄[\»Y]ÇãHõ»\ÿ⁄[XKìÀ›\Xò\ŸK‹àô]YûH⁄[ôŸ\»Ÿ\ôHXYH[à\¬àô\öYöXÿ][€à[ùûKÇÇà»»»ö[\»⁄[ôŸYãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYúò[ò⁄XZ[òÇãH€€ôö\õYY€‹ö⁄[ô»ôYHÿ\»€X[àôYõ‹ôH\»\[ôÇãH€€ôö\õYYÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[òôYõ‹ôH\»\[ôÇãH€€ôö\õYYÿ‹À–Tê“UP’TëKõYô[XZ[ôYåãåéÇãH€€ôö\õYYSë—ëà]\›[ùûHÿ\»LéôYõ‹ôH\»\[ôÇãH€€ôö\õYY[\[Y[ù][€à€€[Z]çNXÃÿX\»[à\›‹ûKÇãH€€ôö\õYYZY‹ò][€àö[Bà›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃLó‹⁄[\◊Ÿõ›[ô][€ãú‹[^\›»[àô\ÀÇãH€€ôö\õYYõ»[\[Y[ù][€à⁄[ôŸ\»Ÿ\ôHôYYYõ‹à\»ÿ›[Y[ù][€ã[€õBà\‹ÀÇãH€€ôö\õYY€õHSë—ëãõY⁄[ôŸY[à\»[ùûKÇÇà»»»ô^›\»
[à‹ô\äBåKàŸY\⁄[\»\ŸHH\»H›\úô[ù]ôHò\Ÿ[[ôKÇåãàÿ€‹HHô^⁄[\»Z[\›€ôHŸ\\ò][HôYõ‹ôH[\[Y[ù][€ãÇåÀà»õ››\ùôXŸZ\À\õ›ôK—[ûHù\⁄[ô\‹»X›[€úÀ[Ÿ[K\‹X⁄YöX¬à]]€X][€úÀ‹àõÿà^‹ù⁄]›]Hô]»\ò⁄]X›\ôKX€X\ôY\⁄»õ€\ÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%ÿ›[Y[ù][€ã[€õH⁄[\»õ›[ô][€à]ôHô\öYöXÿ][€à
Tê“UP’TëHåãåéSë—ëà[ùûHLéJKÇÇà»»[ùûHLÃH⁄[\»ÿ\›X[€€ùô\úÿ][€à[òXõYÇääë]NääàåçãLÀLLääï\]YûNääà€Ÿ^ääî\ŸNääà⁄[\»\ŸHêBääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^î⁄[\»õ›[ô][€àÿ\»[ôXYH]ôH[ô\àTê“UP’TëHåãåéŸX›[€à⁄]ùHYXÿ]Y€‹ö‹‹XŸKõÿ][ô»ùXòõK\ã]\Ÿ\à⁄]\›‹ûKòX⁄Ÿ[ô⁄[ú›⁄]⁄[ôï’\ÿ€‹Y›\Xò\ŸHXÿŸ\‹»[ôXYHô\öYöYYûHûX[ãà\»\‹¬ú›^YY[ú⁄YH]ÿ⁄ŸY\ò⁄]X›\ôH[ô\‹òYYH^\›[ô»ô]YûH⁄[\¬úõﬁHúõ€HHÿ[õôY\ŸHHõ›[ô][€àô\H»ôX[€]YKXòX⁄ŸYÿ\›X[ò€€ùô\úÿ][€à[ôŸ[ô\ò[IêKÇÇà»»»⁄]ÿ\»€€\]YãH[òXõYôX[€]YKXòX⁄ŸYÿ\›X[€€ùô\úÿ][€àõ›Y⁄H^\›[ô¬àô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿõﬁKÇãHôYö[ôYHŸ\ùô\ã\⁄YH⁄[\»ﬁ\›[Hõ€\€»⁄[\»ÿ[à[ôHõ‹õX[à€€ùô\úÿ][€à[ôŸ[ô\ò[]Y\›[€ú»⁄[H^X⁄]H›^Z[ô»[ú⁄YH\ŸHêBà[Z]ÀÇãHô\Ÿ\ùôYŸ\ùô\ã\⁄YK[€õH\ŸHŸà“ST◊–Sïì‘P◊–TW“—VXÇãHô\Ÿ\ùôYHòX⁄Ÿ[ô⁄[\◊‹Ÿ][ô‹Àú⁄[\◊Ÿ[òXõY⁄[\›⁄]⁄⁄X⁄»ôYõ‹ôBà[ûH€]YHTHÿ[ÇãHô\Ÿ\ùôYô\]Y\›[ôÀ]\Ÿ\àï’›\Xò\ŸHXÿŸ\‹»õ‹à⁄[\»€€ùô\úÿ][€ã€Y\‹ÿYŸBàôXY»[ô‹ö]\ÀÇãHYõ›\ŸH’TPêT—W‘—TïíP—W‘ì”W“—VX‹à[ûHŸ\ùöXŸK\õ€H›\Xò\ŸHXÿŸ\‹ÀÇãHô\Ÿ\ùôY\ã]\Ÿ\à⁄]\›‹ûH[ôŸ\€€ùô\úÿ][€à€€ù^[Z]Y»Bà›\úô[ù\Ÿ\â‹»Ÿ[X›Y€€ùô\úÿ][€à€õKÇãH€‹úôX›Y€€ùô\úÿ][€ãX€€ù^ÿY[ô»€»H€]YHô\]Y\›[ò€Y\»ôXŸ[ùàY\‹ÿYŸ\»ò]\à[àH€\›Y\‹ÿYŸ\»[àHôXYÇãHô[[›ôYHÿ[õôYò[òX⁄»\‹⁄\›[ùô\H]€»òX⁄Ÿ[ô€]YHòZ[\ô\»õ¬à€ôŸ\à‹ôX]HHòZŸH\‹⁄\›[ùY\‹ÿYŸKÇãHŸ\H^\›[ô»⁄[\»€‹ö‹‹XŸH[ôõÿ][ô»ùXòõKÇãHYYH€X\ô\à[ãURHô\‹€ô[ô»›]H⁄[H⁄[\»\»ÿZ][ô»€à€]YKÇãHŸ\úöY[ôHúõ€ù[ôÿòX⁄Ÿ[ô\úõ‹à[ô[ô»€»HòZ[Y€]YHô\‹€úŸBàX]ô\»Hÿ]ôY\Ÿ\àY\‹ÿYŸHö\⁄XõH⁄]›]‹ò\⁄[ô»H\ÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»ŸXàŸX\ò⁄ÿ\»YYÇãHõ»úõ›‹⁄[ô»õ›öY\àÿ\»YYÇãHõ»ôXŸZ\\ú⁄[ô»ÿ\»YYÇãHõ»›YŸŸ\›YXX›[€à^X›][€àÿ\»YYÇãHõ»\õ›ôK—[ûHù\⁄[ô\‹»X›[€à^X›][€àÿ\»YYÇãHõ»ù\⁄[ô\‹ÀY]H‹ö]\»Ÿ\ôHYYÇãHõ»ÿ\ù–⁄X⁄€›]ôZ]ö[‹à⁄[ôŸYÇãHõ»ÿ›[Y[ù»ôZ]ö[‹à⁄[ôŸYÇãHõ»ö[ò[ò⁄X[»ôZ]ö[‹à⁄[ôŸYÇãHõ»ÿ⁄Y[HôZ]ö[‹à⁄[ôŸYÇãHõ»[ùô[ù‹ûHôZ]ö[‹à⁄[ôŸYÇãHõ»õÿà^‹ù€‹ö»ÿ\»›\ùYÇãHõ»ô]»ZY‹ò][€ú»Ÿ\ôHYYÇãHõ»ô]»\õZ\‹⁄[€àõY‹»Ÿ\ôHYYÇãHõ»ù\⁄[ô\‹À]XõHìÀ‹ò[ùÀ‹à€X⁄Y\»Ÿ\ôH⁄[ôŸYÇÇà»»»ö[\»⁄[ôŸYãHô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿãH‹òÀ⁄€⁄‹À›\ŸT⁄[\ÀöúÿãH‹òÀÿ€€\€ô[ùÀ‘⁄[\‘[ô[ÀöúﬁãH‹òÀ–\öúﬁãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYúò[ò⁄XZ[òÇãH€€ôö\õYY€‹ö⁄[ô»ôYHÿ\»€X[àôYõ‹ôHY]ÀÇãH€€ôö\õYYÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[òôYõ‹ôHY]ÀÇãH€€ôö\õYYÿ‹À–Tê“UP’TëKõYô[XZ[ôYåãåéÇãH€€ôö\õYYSë—ëà[ôXYH[ò€YY[ùûHLéHôYõ‹ôH\»\[ôÇãH€€ôö\õYYõ»ZY‹ò][€àö[\»⁄[ôŸY‹àŸ\ôHYYÇãH€€ôö\õYYõ»X⁄ÿYŸHö[\»⁄[ôŸYÇãH€€ôö\õYYõ»ù\⁄[ô\‹ÀY]H‹ö]Hÿ[»Ÿ\ôHYYÇãH€€ôö\õYYõ»’TPêT—W‘—TïíP—W‘ì”W“—VX\ÿYŸHÿ\»YYÇãH€€ôö\õYY⁄[\◊‹Ÿ][ô‹Àú⁄[\◊Ÿ[òXõY\»›[⁄X⁄ŸY[àHòX⁄Ÿ[ôàôYõ‹ôH€]YHTHÿ[ÀÇãH€€ôö\õYYHòX⁄Ÿ[ôõ€\õ›»[»⁄[\»»ôYù\ŸKŸYô\à›\úô[ùŸXÇà€⁄›\ôXÿ]\ŸHŸXàŸX\ò⁄\»õ›[òXõYY]ÇãH€€ôö\õYYHòX⁄Ÿ[ôõ€\õ›»[»⁄[\»õ›»€Z[HôXŸZ\[ô[ô»‹ÇàX›[€à^X›][€à]\»õ›[òXõYY]ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúKò€Yù[àùZ[\‹ŸYÇãHõŸHKX⁄X⁄»ô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿ\‹ŸYÇãH]ôKÿúõ›‹Ÿ\àô\öYöXÿ][€àŸàÿ\›X[€€ùô\úÿ][€ã›\úô[ùZ[ôõ»ôYù\ÿ[[ôàõÀXX›[€à€Z[\»›[ôYY»ûX[à»\›€àH\ﬁYY\Yù\à\¬à€€[Z]\»\⁄YôXÿ]\ŸH\»Ÿ\‹⁄[€àYõ›^X›]HH]ôH[ùõ‹X»ÿ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà\⁄Ÿ\ﬁH\»€€[Z]ÇåãàûX[àô\öYöY\»Hõ‹õX[ÿ\›X[Y\‹ÿYŸHŸ]»HôX[⁄[\»ô\KÇåÀàûX[àô\öYöY\»H›\úô[ù€]ôKZ[ôõ»ô\]Y\›\»ôYù\ŸYŸYô\úôYôXÿ]\ŸHŸXÇàŸX\ò⁄\»õ›[òXõYY]ÇçàûX[àô\öYöY\»⁄[\»Ÿ\»õ›€Z[H]ÿ[à^X›]HôXŸZ\ÀÿX›[€ú»Y]ÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%⁄[\»ÿ\›X[€€ùô\úÿ][€à›^YY⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåéSë—ëà[ùûHLÃ
KÇÇà»»[ùûHLÃHH⁄[\»\ŸHêH\‹⁄\›[ùô\‹€úŸHòZ[\ôHùYŸö^Çääë]NääàåçãLÀLLääï\]YûNääà€Ÿ^ääî\ŸNääà⁄[\»\ŸHêBääîŸ\‹⁄[€à\NääàùYŸö^»[\[Y[ù][€ÇÇà»»»€€ù^îûX[à]ôK]\›Y⁄[\»\ŸHêHYù\à[ùûHLÃÿ\»\⁄YàH\Ÿ\àY\‹ÿYŸBúÿ]ôH]›XÿŸYYYù]H\‹⁄\›[ùô\HòZ[Y⁄]Çò⁄[\»€›[õ›ô\‹€ôöY⁄õ›Àà[›\àY\‹ÿYŸHÿ\»ÿ]ôYù]õ»\‹⁄\›[ùô\Hÿ\»Ÿ[ô\ò]YàX\ŸHûHYÿZ[ãòÇï]^X›Y\‹ÿYŸHÿ[YHúõ€HH[õô\à€]YK\ô\]Y\›òZ[\ôHúò[ò⁄[àBô^\›[ô»ô]YûHù[ò›[€ãõ›úõ€HHZ\‹⁄[ôÀZŸ^Húò[ò⁄õ›úõ€HBô[\K\ô\‹€úŸHúò[ò⁄[ôõ›úõ€HH\‹⁄\›[ù[Y\‹ÿYŸH[úŸ\ù]ÇÇà»»»⁄]ÿ\»XY€õ‹ŸYãH€€ôö\õYYúò[ò⁄XZ[òÇãH€€ôö\õYY€‹ö⁄[ô»ôYHÿ\»€X[àôYõ‹ôHY]ÀÇãH€€ôö\õYYÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[òôYõ‹ôHY]ÀÇãH€€ôö\õYYÿ‹À–Tê“UP’TëKõYô[XZ[ôYåãåéÇãH€€ôö\õYY]\›Së—ëà[ùûHôYõ‹ôH\»\‹»ÿ\»[ùûHLÃÇãH€€ôö\õYYH]\›⁄[\»\ŸHêH€€[Z]LXÃŸçÿ\»ô\Ÿ[ù[à\›‹ûKÇãH€€ôö\õYYô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿ^\›ÀÇãH€€ôö\õYYõ»õÿà^‹ù€‹ö»Y›\ùYÇãH€€ôö\õYYõ»ôXŸZ\ÿX›[€ãÿù\⁄[ô\‹À]‹ö]H€‹ö»Y›\ùYÇãH€€ôö\õYYHù[ò›[€à›[Yõ›\ŸH’TPêT—W‘—TïíP—W‘ì”W“—VXÇãH€€ôö\õYYHù[ò›[€à›[⁄X⁄ŸY⁄[\◊‹Ÿ][ô‹Àú⁄[\◊Ÿ[òXõYôYõ‹ôBàH€]YHTHÿ[ÇãH€€ôö\õYYHù[ò›[€à›[\ŸYHô\]Y\›[ô»\Ÿ\â‹»ï’õ‹à›\Xò\ŸBàXÿŸ\‹ÀÇãH€€ôö\õYY“ST◊–Sïì‘P◊–TW“—VXÿ\»ôYô\ô[òŸY^X›HûH]ò[YKÇãH€€ôö\õYYH]ôHòZ[\ôHûX[àÿ]»X\»‹X⁄YöXÿ[H»Hù[ò›[€â‹¬à€]YW›[ò]òZ[XõX]ÇãHù[Y›]Z\‹⁄[ô»THŸ^H\»HÿúŸ\ùôYòZ[\ôKôXÿ]\ŸH]úò[ò⁄€›[à]ôHô]\õôYZ\‹⁄[ô◊ÿ\W⁄Ÿ^Xõ›HY\‹ÿYŸHûX[àÿ]ÀÇãHù[Y›][\H€€ù[ù\ú⁄[ô»\»HÿúŸ\ùôYòZ[\ôKôXÿ]\ŸH]úò[ò⁄à€›[]ôHô]\õôYHŸ\\ò]H€]YWŸ[\XY\‹ÿYŸKÇãHù[Y›]\‹⁄\›[ù[Y\‹ÿYŸH[úŸ\ù»‹›P€]YH›\Xò\ŸHòZ[\ôH\»BàÿúŸ\ùôYòZ[\ôKôXÿ]\ŸH‹ŸH€›[ò[õ›Y⁄»H›]\àŸ[ô\öX»Làúò[ò⁄ò]\à[àH‹X⁄YöX»ÿ]ôY[Y\‹ÿYŸH»õÀX\‹⁄\›[ù\ô\Húò[ò⁄ÇãHò\úõ›ŸYH[‹›ZŸ[HòZ[\ôH⁄[ù»H[ùõ‹X»ô\]Y\›]Ÿ[ãÇãHH›õ€ôŸ\›ô\]Y\›\⁄\HZ\€X]⁄[àHôKXùYŸö^€ŸHÿ\»H[Ÿ[àY[ùYöY\à€]YK\€€õô]MLåçLLM⁄X⁄Yõ›X]⁄ûX[â‹»^X›Yà\ôX›[ùõ‹X»Y\‹ÿYŸ\»TH^[\H[ôÿ\»HY⁄\›\õÿòXö[]Hÿ]\ŸBàŸàHõ›öY\àôZôX›[€ãÇÇà»»»⁄]ÿ\»€€\]YãH⁄[ôŸYH⁄[\»[ùõ‹X»[Ÿ[úõ€H€]YK\€€õô]MLåçLLM¬à€]YKLÀMKZZZ›K[]\›ÇãH[ò‹ôX\ŸYX^›⁄Ÿ[úÿúõ€HÕL»»[Y€àHô\]Y\›[‹ôH€‹Ÿ[Bà⁄]H[ù[ôYÿ\›X[X€€ùô\úÿ][€àY\‹ÿYŸ\»TH⁄\KÇãHô\Ÿ\ùôYHÿ[YH[ô⁄[ùÇàŒãÀÿ\Kò[ùõ‹XÀò€€K›åK€Y\‹ÿYŸ\ÿÇãHô\Ÿ\ùôYHÿ[YH[ùõ‹XÀ]ô\ú⁄[€éàååÀLãLXXY\ãÇãHô\Ÿ\ùôYŸ\ùô\ã\⁄YK[€õH\ŸHŸà“ST◊–Sïì‘P◊–TW“—VXÇãHô\Ÿ\ùôYHòX⁄Ÿ[ô⁄[\›⁄]⁄⁄X⁄»ôYõ‹ôHH€]YHÿ[ÇãHô\Ÿ\ùôYô\]Y\›[ôÀ]\Ÿ\àï’›\Xò\ŸHXÿŸ\‹»[ôYõ›\ŸHŸ\ùöXŸK\õ€KÇãHYY]ô[‹\ã]ö\⁄XõHòX⁄Ÿ[ô\úõ‹à]Z[\‹›õ›Y⁄õ‹àBà€]YW›[ò]òZ[XõX]€»ù]\ôHõ›öY\àôZôX›[€ú»›\ôòXŸHHX›X[à[ùõ‹X»\úõ‹à^»H]ô[‹\àŸ\‹⁄[€à[ú›XYŸà€õHHŸ[ô\öX¬à\‹⁄\›[ùòZ[\ôHò[õô\ãÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»ŸXàŸX\ò⁄ÿ\»YYÇãHõ»ôXŸZ\\ú⁄[ô»ÿ\»YYÇãHõ»\õ›ôK—[ûHù\⁄[ô\‹»X›[€ú»Ÿ\ôHYYÇãHõ»ù\⁄[ô\‹ÀY]H‹ö]\»Ÿ\ôHYYÇãHõ»õÿà^‹ù€‹ö»ÿ\»›\ùYÇãHõ»ù\⁄[ô\‹À]XõHìÀ‹ò[ùÀ‹à€X⁄Y\»Ÿ\ôH⁄[ôŸYÇãHõ»ô]»ZY‹ò][€ú»Ÿ\ôHYYÇãHõ»ô]»\õZ\‹⁄[€àõY‹»Ÿ\ôHYYÇÇà»»»ö[\»⁄[ôŸYãHô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿãH‹òÀ⁄€⁄‹À›\ŸT⁄[\ÀöúÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúKò€Yù[àùZ[\‹ŸYÇãHõŸHKX⁄X⁄»ô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿ\‹ŸYÇãH€€ôö\õYY€õHH⁄[\»ù[ò›[€ã⁄[\»€⁄À[ôSë—ëà⁄[ôŸY[à\¬àùYŸö^\‹ÀÇãH€€ôö\õYY’TPêT—W‘—TïíP—W‘ì”W“—VX›[Ÿ\»õ›\X\à[àH⁄[\¬àù[ò›[€ãÇãH€€ôö\õYY⁄[\◊‹Ÿ][ô‹Àú⁄[\◊Ÿ[òXõY\»›[⁄X⁄ŸYôYõ‹ôHH€]YBàTHÿ[ÇãH€€ôö\õYY“ST◊–Sïì‘P◊–TW“—VX\»›[ôXY^X›HûH]ò[YKÇãH]ôH€€ôö\õX][€àŸàHô\Z\ôY\‹⁄\›[ùô\H]›[ô\]Z\ô\»ûX[à¬à\›Yù\à\ﬁ[Y[ùôXÿ]\ŸH\»Ÿ\‹⁄[€àYõ›^X›]HH]ôH[ùõ‹X¬àô\]Y\›⁄]õŸX›[€àŸX‹ô]ÀÇÇà»»»ô^›\»
[à‹ô\äBåKà\⁄Ÿ\ﬁH\»ùYŸö^ÇåãàûX[àôK]\›»Hõ‹õX[⁄[\»Y\‹ÿYŸH]ôKÇåÀàYàHô\H›[òZ[ÀûX[à⁄X⁄‹»Hô]»]ô[‹\ã]ö\⁄XõH€]YH\úõ‹Çà]Z[[àHRH€»H^X›õ›öY\àôZôX›[€àÿ[àôHÿ\\ôY\ôX›KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%õÿ›\ŸY⁄[\»\ŸHêH\‹⁄\›[ù\ô\‹€úŸHùYŸö^⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåéSë—ëà[ùûHLÃJKÇÇà»»[ùûHLÃàH⁄[\»€]YH[Ÿ[Qö^Çääë]NääàåçãLÀLLääï\]YûNääà€Ÿ^ääî\ŸNääà⁄[\»\ŸHêBääîŸ\‹⁄[€à\NääàùYŸö^»[\[Y[ù][€ÇÇà»»»€€ù^îûX[àÿ\\ôYH]ôH⁄[\»õ›öY\à\úõ‹àYù\à[ùûHLÃNÇò[ùõ‹X»ô\]Y\›òZ[Yà»ù\Héàô\úõ‹àãô\úõ‹àéû»ù\Héàõõ›Ÿõ›[ôŸ\úõ‹àãõY\‹ÿYŸHéàõ[Ÿ[à€]YKLÀMKZZZ›K[]\›üKããüXÇï\»\€€]YHõ€›ÿ]\ŸH»H[ùõ‹X»[Ÿ[Qò]\à[àBî›\Xò\ŸH\ú⁄\›[òŸH]⁄[›⁄]⁄‹àï’\ÿ€‹Y€€ùô\úÿ][€àXÿŸ\‹ÀÇÇà»»»⁄]ÿ\»€€\]YãHô\XŸYH⁄[\»[ùõ‹X»[Ÿ[Q[Çàô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿÇãH€[Ÿ[à€]YKLÀMKZZZ›K[]\›ãHô]»[Ÿ[à€]YKZZZ›KMMKLåçLLXãHŸ\HY\‹ÿYŸ\»TH[ô⁄[ù[ò⁄[ôŸYÇàŒãÀÿ\Kò[ùõ‹XÀò€€K›åK€Y\‹ÿYŸ\ÿãHŸ\H^\›[ô»ô\]Y\›XY\ú»[ò⁄[ôŸY[ò€Y[ô¬à[ùõ‹XÀ]ô\ú⁄[€éàååÀLãLXÇãHô\Ÿ\ùôYÿYôHòX⁄Ÿ[ôŸŸ⁄[ô»Ÿà[ùõ‹X»›]\»€ŸKŸ\úõ‹à^⁄]›]à^‹⁄[ô»ŸX‹ô]ÀÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHõ»ŸXàŸX\ò⁄ÿ\»YYÇãHõ»ôXŸZ\\ú⁄[ô»ÿ\»YYÇãHõ»›YŸŸ\›YXX›[€à^X›][€àÿ\»YYÇãHõ»ù\⁄[ô\‹ÀY]H‹ö]\»Ÿ\ôHYYÇãHõ»Ÿ\ùöXŸK\õ€H›\Xò\ŸHXÿŸ\‹»ÿ\»YYÇãHòX⁄Ÿ[ô⁄[›⁄]⁄ÿ\»ô\Ÿ\ùôYÇãHô\]Y\›[ôÀ]\Ÿ\àï’›\Xò\ŸHXÿŸ\‹»ÿ\»ô\Ÿ\ùôYÇãHõ»õÿà^‹ù€‹ö»ÿ\»›\ùYÇãHõ»ZY‹ò][€ú»Ÿ\ôHYYÇãHõ»›\Xò\ŸH⁄[ôŸ\»Ÿ\ôHXYKÇãHõ»ô]»\õZ\‹⁄[€àõY‹»Ÿ\ôHYYÇÇà»»»ö[\»⁄[ôŸYãHô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYúò[ò⁄XZ[òÇãH€€ôö\õYY€‹ö⁄[ô»ôYHÿ\»€X[àôYõ‹ôHY]ÀÇãH€€ôö\õYYÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[òôYõ‹ôHY]ÀÇãH€€ôö\õYYÿ‹À–Tê“UP’TëKõYô[XZ[ôYåãåéÇãH€€ôö\õYY]\›Së—ëà[ùûHôYõ‹ôH\»\‹»ÿ\»[ùûHLÃKÇãH€€ôö\õYY›\úô[ùô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿ\ŸYà€]YKLÀMKZZZ›K[]\›ôYõ‹ôH\»ö^ÇãH€€ôö\õYY⁄[\◊‹Ÿ][ô‹Àú⁄[\◊Ÿ[òXõY\»›[⁄X⁄ŸYôYõ‹ôHBà[ùõ‹X»ÿ[ÇãH€€ôö\õYY’TPêT—W‘—TïíP—W‘ì”W“—VX\»›[õ›\ŸYÇãH€€ôö\õYYô\]Y\›[ôÀ]\Ÿ\àï’›\Xò\ŸHXÿŸ\‹»\»›[\ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúKò€Yù[àùZ[\‹ŸYÇãHõŸHKX⁄X⁄»ô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿ\‹ŸYÇãH€€ôö\õYYõ»ZY‹ò][€ú»⁄[ôŸYÇãH€€ôö\õYYõ»X⁄ÿYŸHö[\»⁄[ôŸYÇãH€€ôö\õYYõ»ŸXàŸX\ò⁄ÿ\»YYÇãH€€ôö\õYYõ»ù\⁄[ô\‹ÀY]H‹ö]H]ÿ\»YYÇÇà»»»ô^›\»
[à‹ô\äBåKà\⁄Ÿ\ﬁH\»[Ÿ[ö^ÇåãàûX[àŸ[ô»⁄]ÿ[à[›H»öY⁄õ›œÿ[à⁄[\»[ô€€ôö\õ\»HôX[ô\KÇåÀàûX[àôYúô\⁄\»[ô€€ôö\õ\»Hô\H\ú⁄\›ÀÇçàûX[à\⁄‹»ÿ[à[›HŸX\ò⁄HŸXèÿ[ô€€ôö\õ\»⁄[\»ÿ^\»ŸXàŸX\ò⁄\¬àõ›[òXõYY]ÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%⁄[\»€]YH[Ÿ[Qö^›^YY⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåéSë—ëà[ùûHLÃäKÇÇà»»[ùûHLÃ»H⁄[\»⁄]ÿ‹õ€ö^Çääë]NääàåçãLÀLLääï\]YûNääà€Ÿ^ääî\ŸNääà⁄[\»\ŸHêBääîŸ\‹⁄[€à\NääàRHùYŸö^»[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\‹ùY][àHYXÿ]Y⁄[\»[Ÿ[KYù\àŸ[ô[ô»HY\‹ÿYŸKBúÿ‹ôY[àù[\YòX⁄»»H‹[ú›XYŸà›^Z[ô»ôX\àH]\›Y\‹ÿYŸH[ôò⁄][ú]à⁄[\»ÿ\›X[€€ùô\úÿ][€à]Ÿ[àÿ\»[ôXYH€‹ö⁄[ô»]ôN»\»ÿ\¬ò[à[ù\òX›[€àùY»[àH⁄]RH€õKÇÇà»»»⁄]ÿ\»XY€õ‹ŸYãH€€ôö\õYYúò[ò⁄XZ[òÇãH€€ôö\õYY€‹ö⁄[ô»ôYHÿ\»€X[àôYõ‹ôHY]ÀÇãH€€ôö\õYYÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[òôYõ‹ôHY]ÀÇãH€€ôö\õYYÿ‹À–Tê“UP’TëKõYô[XZ[ôYåãåéÇãH€€ôö\õYY]\›Së—ëà[ùûHôYõ‹ôH\»\‹»ÿ\»[ùûHLÃãÇãH€€ôö\õYY⁄[\»⁄]RHö[\»^\›ÇàH‹òÀÿ€€\€ô[ùÀ‘⁄[\‘[ô[ÀöúﬁàH‹òÀ⁄€⁄‹À›\ŸT⁄[\ÀöúÿàH‹òÀ–\öúﬁàH‹òÀ‹›[\Àò‹‹ÿãH€€ôö\õYYõ»[\[Y[ù][€à€‹ö»ÿ\»[ô[ô»›]⁄YH\»ÿYôHRH\‹ÀÇãHY[ùYöYYHZŸ[Hõ€›ÿ]\ŸH\»HY\‹ÿYŸHôXYõ›ôZ[ô»H›XõBà[ù\õò[ÿ‹õ€€€ùZ[ô\à[ú⁄YHHYXÿ]Y€‹ö‹‹XŸH⁄]ÿ\ô[›⁄[ô¬àYŸK[]ô[öY]‹‹ù[›ô[Y[ù\ö[ô»ô\ô[ô\ãŸõÿ›\»⁄[ôŸ\»Yù\àY\‹ÿYŸHŸ[ôà[ôô\‹€úŸHÿYÇÇà»»»⁄]ÿ\»€€\]YãHYYH›XõHÿ‹õ€]À[]\›ôZ]ö[‹à»H⁄\ôY⁄[\»Y\‹ÿYŸH\›ÇãHYYHõ›€H[ò⁄‹àôYà€»H⁄]ÿ[àÿ‹õ€»Hô]Ÿ\›€€ù[ùYù\éÇàH[ö]X[Y\‹ÿYŸHÿYàH\Ÿ\àŸ[ôàH\‹⁄\›[ùô\‹€úŸH[úŸ\ù€ÿYàHX›]ôH€€ùô\úÿ][€à⁄[ôŸBãHYY[õôY]ÀXõ›€H]X›[€à€»HRH›^\»ò]\ò[H[ò⁄‹ôY\ö[ô¬àõ‹õX[⁄]õ›»⁄]›]ôYY[ô»òX⁄Ÿ[ô‹›]H⁄[ôŸ\ÀÇãHYYÿYôH^\ôXHôYõÿ›\»Yù\àŸ[ô€€\][€à€»H[ú]ô[XZ[ú»X\ﬁBà»€€ù[ùYH\⁄[ô»⁄]›]õ‹ò⁄[ô»HYŸHòX⁄»»H‹ÇãH€€ùô\ùYHYXÿ]Y⁄[\»⁄]ÿ\ô[ù»H›XõH€À\õ›»^[›]⁄][Çà[ù\õò[ÿ‹õ€[ô»Y\‹ÿYŸH\›ÇãH\YYHÿ[YHÿ‹õ€]À[]\›ôZ]ö[‹à»Hõÿ][ô»ùXòõH€»]»⁄]àôZ]ö[‹àô[XZ[ú»Ÿ[ú⁄XõH€ÀÇÇà»»»ÿYô]H€€ôö\õX][€ú¬ãHRK[€õH⁄[ôŸKÇãHõ»òX⁄Ÿ[ô⁄[ôŸ\»Ÿ\ôHXYKÇãHõ»ô]YûHù[ò›[€à⁄[ôŸYÇãHõ»ZY‹ò][€ú»Ÿ\ôHYYÇãHõ»›\Xò\ŸH⁄[ôŸ\»Ÿ\ôHXYKÇãHõ»ì»‹à\õZ\‹⁄[€à⁄[ôŸ\»Ÿ\ôHXYKÇãHõ»ŸXàŸX\ò⁄ÿ\»YYÇãHõ»Y[[‹ûHÿ\»YYÇãHõ»\Ÿ\ã\õŸö[HôXY[\[Y[ù][€àÿ\»YYÇãHõ»ù\⁄[ô\‹ÀY]H‹ö]\»Ÿ\ôHYYÇãHõ»õÿà^‹ù€‹ö»ÿ\»›\ùYÇÇà»»»ö[\»⁄[ôŸYãH‹òÀÿ€€\€ô[ùÀ‘⁄[\‘[ô[ÀöúﬁãH‹òÀ‹›[\Àò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúKò€Yù[àùZ[\‹ŸYÇãH€€ôö\õYY^X›Yö[\»€õH⁄[ôŸY[à\»\‹ÀÇãH€€ôö\õYYõ»ZY‹ò][€ú»⁄[ôŸYÇãH€€ôö\õYYõ»ô]YûHù[ò›[€à⁄[ôŸYÇãH€€ôö\õYYõ»X⁄ÿYŸHö[\»⁄[ôŸYÇãH€€ôö\õYYõ»òX⁄Ÿ[ô‹àù\⁄[ô\‹ÀY]HŸ⁄X»⁄[ôŸYÇÇà»»»ô^›\»
[à‹ô\äBåKà\⁄Ÿ\ﬁH\»RHö^ÇåãàûX[àŸ[ô»HY\‹ÿYŸH[àH⁄[\»€‹ö‹‹XŸH[ô€€ôö\õ\»HöY]»›^\»ôX\ÇàH]\›Y\‹ÿYŸK⁄[ú]ÇåÀàûX[àŸ[ô»HŸX€€ôY\‹ÿYŸH[ô€€ôö\õ\»H€‹ö‹‹XŸHõ»€ôŸ\àù[\»¬àH‹ÇçàûX[à⁄X⁄‹»Hõÿ][ô»ùXòõH[ô€€ôö\õ\»]»ÿ‹õ€ôZ]ö[‹à\»[€¬àŸ[ú⁄XõKÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%⁄[\»⁄]ÿ‹õ€RHö^›^YY⁄][àÿ⁄ŸYX⁄\⁄[€ú»
Tê“UP’TëHåãåéSë—ëà[ùûHLÃ KÇÇà»»[ùûHLÕH‹ò[ù[\à\õZ\‹⁄[€à›ô\úöY\»›\\úŸYYXŸZ€\ÇÇääë]NääàåçãLÀLMääï\]YûNääà€Ÿ^ääî\ŸNääà€€‹ô[ò][€àﬁ[ò¬ääîŸ\‹⁄[€à\Nääà[Y€õY[ùÇà»»»€€ù^ïHÿÿ[ô\‹⁄]‹ûH›‹Y][ùûHLÃÀ⁄[HH]]‹ö]]]ôH€€‹ô[ò][€Çò⁄X⁄‹⁄[ùõ‹àH‹ò[ù[\à\õZ\‹⁄[€à›ô\úöY\»Z[\›€ôHÿ\»›\YYô^\õò[KàTê“UP’TëHåãåéH[ôö[ò[Së—ëà[ùûHLÕàõ››]H]ë[ùöY\»LÕ[ôLÕH\ôH›\\úŸYY[ôõ›[\[Y[ù][€ãXXÿ›\ò]KÇÇà»»»X⁄\⁄[€ú»XYH\»Ÿ\‹⁄[€à
ÿ⁄ŸY
BãH\»XŸZ€\à^\›»€õH»ô\Ÿ\ùôHŸ\]Y[ùX[ÿÿ[Së—ëàù[Xô\ö[ô¬àôYõ‹ôHôX€‹ô[ô»H]]‹ö]]]ôHö[ò[[ùûHLÕà^ÇãH»õ›[\[Y[ùúõ€H[ùûHLÕÇãH\ŸH[ùûHLÕà€õHõ‹à‹ò[ù[\à\õZ\‹⁄[€à›ô\úöY\»€‹öÀÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãH[ùûHLÕ\»›\\úŸYYÇãH[ùûHLÕH\»›\\úŸYYÇãH[ùûHLÕà\»Hö\ú›[\[Y[ù][€ãX]]‹ö]]]ôH[ôŸôàõ‹à\¬àZ[\›€ôH[àHÿÿ[ô\‹⁄]‹ûKÇÇà»»»ô^›\»
[à‹ô\äBåKàôX€‹ôH[ùûHLÕH›\\úŸYYXŸZ€\ãÇåãàôX€‹ôH]]‹ö]]]ôH[ùûHLÕàö[ò[^ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãH[ùûHLÕ\»õ›[\[Y[ù][€ãXXÿ›\ò]H[ô\»›\\úŸYYûH[ùûHLÕãÇÇà»»»õ›][ô»ô\ôX›ìõ»[\[Y[ù][€à]]‹ö]H\ôH8†%€€‹ô[ò][€àXŸZ€\à€õKà\ŸH[ùûHLÕãÇÇà»»[ùûHLÕHH‹ò[ù[\à\õZ\‹⁄[€à›ô\úöY\»›\\úŸYYXŸZ€\ÇÇääë]NääàåçãLÀLMääï\]YûNääà€Ÿ^ääî\ŸNääà€€‹ô[ò][€àﬁ[ò¬ääîŸ\‹⁄[€à\Nääà[Y€õY[ùÇà»»»€€ù^êTê“UP’TëHåãåéH[ô]]‹ö]]]ôHSë—ëà[ùûHLÕàõ››]H][ùûBåLÕHÿ\»Hö\ú›\\‹»€‹úôX›[€à]ÿ\»]\à›\\úŸYYûHHŸX€€ô\\‹¬ôö[ò[€‹úôX›[€ãàH‹öY⁄[ò[^ÿ\»õ›ô\Ÿ[ù[àHÿÿ[ô\‹⁄]‹ûH]ùH[YHŸàﬁ[ò⁄õ€ö^ò][€ãÇÇà»»»X⁄\⁄[€ú»XYH\»Ÿ\‹⁄[€à
ÿ⁄ŸY
BãH\»XŸZ€\à^\›»€õH»ô\Ÿ\ùôHŸ\]Y[ùX[ÿÿ[Së—ëàù[Xô\ö[ô¬àôYõ‹ôHôX€‹ô[ô»H]]‹ö]]]ôHö[ò[[ùûHLÕà^ÇãH»õ›[\[Y[ùúõ€H[ùûHLÕKÇãH\ŸH[ùûHLÕà€õHõ‹à‹ò[ù[\à\õZ\‹⁄[€à›ô\úöY\»€‹öÀÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãH[ùûHLÕH\»›\\úŸYY[ôõ›[\[Y[ù][€ãXXÿ›\ò]KÇãH[ùûHLÕà\»ö[ò[õ‹àŸX›[€àMÿà[ô›\\úŸY\»õ›LÕ[ôLÕKÇÇà»»»ô^›\»
[à‹ô\äBåKàôX€‹ôH]]‹ö]]]ôH[ùûHLÕàö[ò[^Çåãà[\[Y[ùúõ€H[ùûHLÕà€õKÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãH[ùûHLÕH\»õ›[\[Y[ù][€ãXXÿ›\ò]H[ô\»›\\úŸYYûH[ùûHLÕãÇÇà»»»õ›][ô»ô\ôX›ìõ»[\[Y[ù][€à]]‹ö]H\ôH8†%€€‹ô[ò][€àXŸZ€\à€õKà\ŸH[ùûHLÕãÇÇà»»[ùûHLÕà8†%‹ò[ù[\à\õZ\‹⁄[€à›ô\úöY\ŒàŸX€€ô€‹úôX›[€à\‹»
ö[ò[
BÇääë]NääàåçãLÀLMääï\]YûNääà€]YBääî\ŸNääà\ò⁄]X›\ôHÿ⁄»€‹úôX›[€à
ŸX€€ô\‹ BääîŸ\‹⁄[€à\Nääàù[Hå‹õ‹‹ÀP€X\ò[òŸH»X⁄\⁄[€ÇÇà»»»€€ù^Çë[ùûHLÕH€‹úôX›YHY[ù]H[Ÿ[[ùò[YíÀ\›‹ûK[‹‹À[ô]ô[‹\ãBô\ÿÿ[][€àÿ\õ›[ô[àH‹öY⁄[ò[[ùûHLÕòYùàôYõ‹ôH[ô[ô»ŸX›[€àMÿÇù»€Ÿ^ûX[àò[àHŸX€€ôù[Hå‹õ‹‹ÀX€X\ò[òŸH\‹À⁄X⁄›\ôòXŸYôYBòY][€ò[[\[Y[ù][€ãXõÿ⁄⁄[ô»\‹›Y\»]€›[õ›]ôHôY[àÿ]Y⁄[ù[õZY‹ò][€à[YKà\»[ùûHÿ›[Y[ù»Hö[ò[€‹úôX›[€ãÇÇà»»»⁄]ÿ\»‹õ€ô»[à[ùûHLÕH
Y[ùYöYYûHŸX€€ô‹õ‹‹ÀX€X\ò[òŸH\‹ BÇåKà
äîì»ôX›\ú⁄[€àö\⁄ÀääàH‹ö]K‹ôXYX[XÿŸ\‹»ÿ]Hÿ[YàYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\ä
Xà€òŸH]ù[ò›[€à\»\]Y»ô\€€ôBà›ô\úöY\»
\à\»ÿ[YHZ[\›€ôJKÿ[[ô»]úõ€H[ú⁄YHH›ô\úöYBàXõI‹»›€àì»€XﬁH‹ôX]\»HŸ[ã\ôYô\ô[ùX[€‹àì»€Çà\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿ8°§àÿ[»Hù[ò›[€à8°§àù[ò›[€à]Y\öY\¬à\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿ8°§àôK]öYŸŸ\ú»ì»8°§àô\X]Àà\»€›[Z]\ÇàòZ[›]öY⁄‹àôZ]ôH[úôYX›XõH\[ô[ô»€à›»‹›‹ô\»ô\€€ô\»BàôX›\ú⁄[€ãÇÇåãà
äï‹õ€ô»õ€HXõKääà[ùûHLÕH›[ÿZYôô]⁄H\Ÿ\â‹»õ€Húõ€Bà\Ÿ\úÀúõ€Xàà\ôH\»õ»\Ÿ\úÿXõH[û]⁄\ôH[ŸH[à\»\ò⁄]X›\ôH8†%à]ô\ûH›\àÿ⁄ŸYŸX›[€àôXY»Y[ù]K‹õ€KŸ]ö\⁄[€àúõ€Bà\Ÿ\ó‹\õZ\‹⁄[€úÿà\»ÿ\»€]YI‹»\úõ‹ãõ›H⁄[ôŸH[àH[ô\õZ[ô¬àÿ⁄[XKÇÇåÀà
äê€Y[ù]‹ö]XõHXõKääàH‹öY⁄[ò[\⁄Y€à]]][ùXÿ]Y]ô[‹\ú¬à‹ö]H\ôX›H»\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿöXH[àSî—Tïì»€XﬁKà⁄]Y][€ò[ò[Y][€à\[ö[ô»[àH\Xÿ][€à^Y\ãà]	‹»ŸXZŸ\Çà[à\»õ⁄ôX›	‹»Ÿ\ùô\ãX]]‹ö]]]ôH›[ô\ô
ŸX›[€àMÀõ€ãBàôY€›XXõHù[JH[ôŸXZŸ\à[àH]\õà[ôXYH\ŸYõ‹àÿ\ù[‹[Çà
ŸX›[€àLJH[ô›\àŸ[ú⁄]]ôH‹ö]\À⁄X⁄õ›]Hõ›Y⁄€€ùõ€Yàî‹»ò]\à[à\ôX›XõHXÿŸ\‹ÀÇÇà»»»ö[ò[€‹úôX›Y\⁄Y€à
ŸX›[€àMÿãåãåéK[ùûHLÕà8†%ö[ò[
BÇääîõ€H€›\òŸH
ö^Y
Nääà\Ÿ\ó‹\õZ\‹⁄[€úÀúõ€Xõ›\Ÿ\úÀúõ€Xà€Ÿ^ò€€ôö\õ\»H^X›]ôH€€[[àò[YHôYõ‹ôH[\[Y[ù][€ãù]HôYô\ô[òŸBùXõH\»\Ÿ\ó‹\õZ\‹⁄[€úÿÇÇääìõ€ã\ôX›\ú⁄]ôH]ô[‹\à]]‹ö]H⁄X⁄»
ô] NääàHYXÿ]Y⁄X⁄»8†%ö[\[Y[ùY\»H€X[—P’TíUHQíSëTò[\àù[ò›[€à‹à\]Z]ò[[ù[õ[ôBú]Y\ûH8†%ôXY»ÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\ò\ôX›Húõ€HH\Ÿ\â‹»õ€K”›€ô\ã\]ò\‹⁄Y€õY[ù[ôô]ô\à]Y\öY\»\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿà\»ÿ[YH⁄X⁄»ÿ]\¬òõ›ÇãH⁄»ÿ[àôXY[\Ÿ\ú…»›ô\úöYH\›‹ûH
úÀà€õHZ\à›€äK[ôãH⁄»ÿ[àÿ[H‹ö]HîÀÇÇï\»€‹ö‹»ò]\ò[HôXÿ]\ŸHÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\òÿ\»[ôXYH^€YYúõ€BùH›ô\úöYHXõH[à[ùûHLÕH8†%]	‹»ô]ô\à‹ö][à\ôH[ôô]ô\àô\€€ôYôúõ€H\ôKà[ùûHLÕàXZŸ\»Hõ€ã\ôX›\ú⁄]ôHô\]Z\ô[Y[ù^X⁄]€»€Ÿ^ôŸ\€â›Xÿ⁄Y[ù[H⁄\ôHH⁄X⁄»õ›Y⁄YôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\ä
Xö[àHÿ^H]›X⁄\»H›ô\úöYHXõKÇÇääîîÀ[€õH‹ö]\»
ô] Nääà[\ôX›€Y[ùSî—TïÿTUXÿSUX€Çò\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿ\ôH[öYYûHìÀà]ô\ûH‹ò[ù‹àô]õ⁄ŸH€Ÿ\¬ùõ›Y⁄€ôH€€ùõ€Yî»
Ÿ]‹\õZ\‹⁄[€ó€›ô\úöYX
K⁄X⁄[àH⁄[ô€Bùò[úÿX›[€éÇåKàô\öYöY\»Hÿ[\â‹»]ô[‹\à]]‹ö]H
õ€ã\ôX›\ú⁄]ôH⁄X⁄ BåãàôZôX›»\ôŸ][ô»ÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\òåÀàôZôX›»\ôŸ][ô»[õ›\à]ô[‹\à
ô\Ÿ\ùôYõ‹àHù]\ôH›€ô\ã[€õBà]
Bçàò[Y]\»H\õZ\‹⁄[€àõY»YÿZ[ú›Hÿ[õ€öXÿ[ŸX›[€àM»\›çKàô\]Z\ô\»Hõ€ã[ù[ôX\€€ÇçãàXX›]ò]\»H\Ÿ\â‹»^\›[ô»X›]ôHõ›»õ‹à]õYÀYà[ûBçÀà[úŸ\ù»Hô]»›ô\úöYHõ›¬éà‹ö]\»H⁄[ôŸW€Ÿ‹ÿ]Y][ùûBéKà€€[Z]»[ŸàHXõ›ôH]€ZXÿ[BÇï\»›X\ò[ùY\»H›ô\úöYH[ô]»]Y]ôX€‹ôÿ[àô]ô\à[ô\›]Ÿàﬁ[ò¬∏†%Z]\àõ›\[à‹àôZ]\àŸ\ÀÇÇääë]ô\û][ô»[ŸHúõ€H[ùûHLÕH›[ô»[ò⁄[ôŸYääà€\ö»Y[ù]H[Ÿ[ò\õZ\‹⁄[€óŸõYÿò[Y][€àYÿZ[ú›Hÿ[õ€öXÿ[\›
õ›[àí Kú\ùX[][ö\]YKZ[ô^\›‹ûHô\Ÿ\ùò][€ãX[ùX[[€õH›ô\úöY\»
õ¬ô^\ò][€äK[[YYX]HôYúô\⁄ôZ]ö[‹ã[ôH›€ô\ã[€õHô\Ÿ\ùôY]õ‹Çôù]\ôH]ô[‹\ãXXÿŸ\‹»X[òYŸ[Y[ùÇÇà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ÇääêTê“UP’TëKõYåãåéH
ŸX€€ô\\‹»€‹úôX›Y
JäÇÇãHŸX›[€àMÿàù[Hô]‹ö][àHŸX€€ô[YH⁄]HôYH€‹úôX›[€ú»Xõ›ôBãH[ùöY\»LÕ[ôLÕHõ›^X⁄]HX\öŸY›\\úŸYY»õ›à[\[Y[ù][€ãXXÿ›\ò]BãHô\ú⁄[€àXY\à\]Y⁄]Hù[ŸX€€ô\\‹»€‹úôX›[€à›[[X\ûBÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ÇåKà
äï\ŸH[ùûHLÕà€õKääà[ùöY\»LÕ[ôLÕH\ôHõ››\\úŸYYÇåãà
äê€€ôö\õH\Ÿ\ó‹\õZ\‹⁄[€úÀúõ€X]ôH€€[[àò[YJäàôYõ‹ôH[\[Y[ù][€à8†%àHXõH\»Ÿ]YH^X›€€[[àò[YH⁄›[›[ôHô\öYöYYÇåÀà
äêùZ[Hõ€ã\ôX›\ú⁄]ôH]ô[‹\ãX]]‹ö]H⁄X⁄»ö\ú›
äãôYõ‹ôH⁄\ö[ô¬à[ûHì»€XﬁH‹àî»]\[ô»€à]à»õ›]\»⁄X⁄»ÿ[àYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\ä
X[õ\‹»]ù[ò›[€â‹¬àÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\òúò[ò⁄\»ô\öYöYY»ô]ô\à›X⁄à\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿÇçà
äë»õ›‹ôX]H[ûHì»Sî—TïÿTUXÿSUX€XﬁH€Çà\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿääàì»⁄›[[ûH[\ôX›€Y[ù‹ö]\ÀÇàH€õH‹ö]H]\»HŸ]‹\õZ\‹⁄[€ó€›ô\úöYXîÀÇçKà
äïHî»]\›ôH]€ZX äà8†%›ô\úöYHõ›»
»]Y][ùûH[à€ôHò[úÿX›[€ãà\⁄[ô»H€€ôö\õYY⁄[ôŸW€Ÿ‹ÿÿ⁄[XKÇçãà€€ôö\õH⁄[ôŸW€Ÿ‹ÿÿ⁄[XHôYõ‹ôH[\[Y[ù[ô»H]Y]‹ö]H
ÿ\úöYYà›ô\àúõ€H[ùûHLÕK›[\Y\ KÇÇà»»»ô^›\»
[à‹ô\äBÇåKàûX[à€€ôö\õ\»\»ö[ò[^ôY[ùûH[ôHŸX€€ô\\‹»€‹úôX›YàTê“UP’TëHåãåéBåãà€Ÿ^€€ôö\õ\»]ôHÿ⁄[XNà\Ÿ\ó‹\õZ\‹⁄[€úÀúõ€X€€[[àò[YH[ôà⁄[ôŸW€Ÿ‹ÿ€€[[à›ùX›\ôBåÀà€Ÿ^ùZ[»Hõ€ã\ôX›\ú⁄]ôH]ô[‹\ãX]]‹ö]H⁄X⁄¬çà€Ÿ^ùZ[»Ÿ]‹\õZ\‹⁄[€ó€›ô\úöYXî»\àHö[ôK\›\Ÿ\]Y[òŸHXõ›ôBçKà€Ÿ^Y»ìŒà—SP’[€õHõ‹à€Y[ù»
›€àõ›»
»]ô[‹\ãX]]‹ö]BàôXYX[
K[ûKX[‹ö]\¬çãà€Ÿ^\]\»YôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\ä
X\àHô\€€][€àŸ⁄X¬à
ò\Ÿ[[ôHõ€H
»X›]ôH›ô\úöY\Àÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\ò^€YY
BçÀàûX[à\›Œà‹ò[ù‹ô]õ⁄ŸHöXHîÀ€€ôö\õH]Y]òZ[€€ôö\õH\ôX›àXõH‹ö]\»\ôHôZôX›Y€€ôö\õHõ»ì»ôX›\ú⁄[€à\úõ‹ú»[ô\àÿYà€€ôö\õH]ô[‹\ã]\ôŸ][ô»[ôÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\ò]\ôŸ][ô»\ôHõ›àôZôX›YÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬Çìõ€ôH›\úô[ùKàH›€ô\ã[€õH]ô[‹\ãXXÿŸ\‹»]ô[XZ[ú»H€õ›€àù]\ôBö][Kõ›[à‹[à]Y\›[€àõ‹à\»Z[\›€ôKÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬Çìõ€ôHX›]ôKÇÇãKKBÇà»»õ›][ô»ô\ôX›Çääîù[Hå‹õ‹‹ÀX€X\ò[òŸNà€€\]H
ŸX€€ô\‹ Kääà⁄]‘Y[ùYöYYôYBôù\ù\à[\[Y[ù][€ãXõÿ⁄⁄[ô»\‹›Y\»Yù\àHö\ú›€‹úôX›[€à\‹»8†%[ùôYH€€ôö\õYYYÿZ[ú›H]ôHÿ›[Y[ù[ô€‹úôX›Y\ôKàŸX›[€àMÿà\¬õõ›»ö[ò[ÇÇääëõ‹à€Ÿ^ääà€X\ôY»õÿŸYY⁄]ÿ⁄[XH€€ôö\õX][€à[ô[\[Y[ù][€Çú\àHï⁄]€Ÿ^ôYY»»€õ›»àŸX›[€àXõ›ôK€òŸHûX[à€€ôö\õ\»\»[ùûKÇÇääëõ‹à€]YNääàõ»ù\ù\à\ò⁄]X›\ôHô]öY]»[ùX⁄\]Yõ‹à\»Z[\›€ôBù[õ\‹»ÿ⁄[XH€€ôö\õX][€à›\ôòXŸ\»€€Y][ô»€Ÿ^ÿ[õõ›ô\€€ôH[€ôKÇÇà»»[ùûHLÕ»H‹ò[ù[\à\õZ\‹⁄[€à›ô\úöY\»òX⁄Ÿ[ôõ›[ô][€à[\[Y[ùYÇääë]NääàåçãLÀLMääï\]YûNääà€Ÿ^ääî\ŸNääà‹ò[ù[\à\õZ\‹⁄[€à›ô\úöY\»òX⁄Ÿ[ôõ›[ô][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àõ›öYY]]‹ö]]]ôH]X⁄Y[ù€‹Y\»ŸàTê“UP’TëHåãåéBäŸX€€ô\\‹»€‹úôX›Y
H[ôSë—ëà[ùûHLÕàôXÿ]\ŸHHÿÿ[ô\»€ÇòXZ[ò›[›‹Y]Tê“UP’TëHåãåé[ôSë—ëà[ùûHLÃÀÇÇî\àHZ[\›€ôHôYõY⁄[\[Y[ù][€àõÿŸYYY€õHYù\à€€ôö\õZ[ô»BòX›X[]ôK‹ô\»⁄\\»õ‹à\Ÿ\ó‹\õZ\‹⁄[€úÿ⁄[ôŸW€Ÿ‹ÿòYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\äããäX^\›[ô»€\ö»ï’Y[ù]H\ÿYŸK[ôë]ô[‹\ãXXÿŸ\‹»ÿ][ô»]\õúÀÇÇà»»»⁄]ÿ\»XY€õ‹ŸYãH€€ôö\õYYúò[ò⁄XZ[òÇãH€€ôö\õYY€‹ö⁄[ô»ôYHÿ\»€X[àôYõ‹ôHY]ÀÇãH€€ôö\õYYÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[ò]éXòÇãH€€ôö\õYYÿÿ[ô\»ÿ‹»Ÿ\ôHôZ[ôH]]‹ö]]]ôH⁄X⁄‹⁄[ùÇàHÿ‹À–Tê“UP’TëKõYÿ\»›[åãåéàHSë—ëãõY›[[ôY][ùûHLÃ¬ãH€€ôö\õYY]ôHXõXÀù\Ÿ\ó‹\õZ\‹⁄[€úÿ⁄\NÇàHö[X\ûHŸ^NàY]ZYàH€\ö»Y[ù]Nà€\ö◊›\Ÿ\ó⁄Y^[ö\]YXàHõ€Nàõ€H^àH]ö\⁄[€éà]ö\⁄[€à^àHYÿXﬁHî””à€€[[éà\õZ\‹⁄[€ó€›ô\úöY\»ú€€òàõ›ù[Yò][	ﬁﬂIŒéöú€€òòàHõ»YXÿ]Yõ€€X[à€€[[ú»õ‹à[ô]öYX[õY‹¬ãH€€ôö\õYY]ôHXõXÀò⁄[ôŸW€Ÿ‹ÿ⁄\NÇàHY\Ÿ\ó⁄Y\Ÿ\ó€ò[YXXõW€ò[YXôX€‹ô⁄YX›[€òàôYõ‹ôWŸ]XYù\óŸ]Xõ›X‹ôX]Yÿ]àHX›[€ò[ôXYH[›‹»\õZ\‹⁄[€óÿ⁄[ôŸXãH€€ôö\õYY]ôHXõXÀôYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\äããäX⁄\HôYõ‹ôH\¬à\‹ŒÇàH\ô‹Œà
‹õ€H^Ÿ]ö\⁄[€à^‹\õZ\‹⁄[€ó€›ô\úöY\»ú€€òäXàHô]\õéàú€€òòàHŸX›\ö]Nà[ùõ⁄Ÿ\ÇàHõ»ŸX\ò⁄‹]àHôZ]ö[‹éàõ€HYò][»
»YZ[ãY]ö\⁄[€àôXY⁄Y[ö[ô»
»\ôX›î””àY\ôŸBãH€€ôö\õYY\ôHÿ\»õ»]ôH‹àô\»\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿXõKÇãH€€ôö\õYY›\úô[ù]ôHÿ[\ú»ŸàYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\äããäX\ôBà[›\úô[ùX]][ùXÿ]Y]\Ÿ\à\õZ\‹⁄[€à⁄X⁄‹À⁄X⁄[›ŸYô\Ÿ\ùö[ô»Bà^\›[ô»ù[ò›[€à⁄Y€ò]\ôH⁄[Hô\€€ö[ô»X›]ôH›ô\úöY\»ûBà]]öù›

HOèà	‹›XâÿÇãH€€ôö\õYYYÿXﬁH\Ÿ\ó‹\õZ\‹⁄[€úÀú\õZ\‹⁄[€ó€›ô\úöY\ÿ]H\»›\úô[ùBà[\H[à]ôH]H
õ€ãY[\Hõ›‹ K[ò€Y[ô»õ›‹»⁄]àÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\àHùYXÇãHY[ùYöYY]ôH[ùô[ù‹ûKÿÿ\ùî‹»]›[Y\ôŸYàYò][‹\õZ\‹⁄[€ú◊Ÿõ‹ó‹õ€JããäH\õZ\‹⁄[€ó€›ô\úöY\ÿ\ôX›H[ú›XYàŸà\⁄[ô»YôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\äããäX»\ŸHôYYY»ôH\]Y€¬àHô]»›ô\úöYHXõH€›[X›X[HZŸHYôôX›[àòX⁄Ÿ[ô[ôõ‹òŸ[Y[ùÇÇà»»»⁄]ÿ\»€€\]YãHﬁ[òŸYÿ‹À–Tê“UP’TëKõY»H]]‹ö]]]ôHåãåéHXY\à[ô[úŸ\ùYàŸX›[€àMÿàúõ€HH\õ›ôY]X⁄Y[ù^ÇãHòX⁄Ÿö[Yÿÿ[Së—ëà€€‹ô[ò][€àﬁ[ò»€»Hô\»õ›»ÿ\úöY\ŒÇàH[ùûHLÕ›\\úŸYYXŸZ€\ÇàH[ùûHLÕH›\\úŸYYXŸZ€\ÇàH]]‹ö]]]ôH[ùûHLÕàö[ò[^ãHYYZY‹ò][€Çà›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃMWŸ‹ò[ù[\ó‹\õZ\‹⁄[€ó€›ô\úöY\◊Ÿõ›[ô][€ãú‹[ÇãH‹ôX]YXõXÀù\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿ⁄]Hÿ⁄ŸY€€[[ú»[ôà\›‹ûK\ô\Ÿ\ùö[ô»\ùX[[ö\]YH[ô^ÇãH[òXõYì»€àXõXÀù\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿÇãHYYHYXÿ]Yõ€ã\ôX›\ú⁄]ôH]ô[‹\ãX]]‹ö]H[\éÇàXõXÀò›\úô[ù›\Ÿ\ó⁄\◊Ÿ]ô[‹\óÿXÿŸ\‹ 
XàHôXY»ÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\òúõ€Hõ€H\»YÿXﬁBà\Ÿ\ó‹\õZ\‹⁄[€úÀú\õZ\‹⁄[€ó€›ô\úöY\ÿàHô]ô\à]Y\öY\»\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿãHYY€€ùõ€Yî»XõXÀúŸ]‹\õZ\‹⁄[€ó€›ô\úöYJããäXÇàHô\]Z\ô\»]][ùXÿ]Y€\ö»ï’àHô\]Z\ô\»]ô[‹\à]]‹ö]HöXHHõ€ã\ôX›\ú⁄]ôH[\ÇàHôZôX›»ÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\òàHôZôX›»\ôŸ][ô»[ûH\Ÿ\à⁄»[ôXYH\»]ô[‹\àXÿŸ\‹¬àHò[Y]\»\õZ\‹⁄[€óŸõYÿYÿZ[ú›Hÿ[õ€öXÿ[ŸX›[€àM»\›àHô\]Z\ô\»õ€ãY[\HôX\€€àÿ\Y]L⁄\ú¬àHXX›]ò]\»Hö[‹àX›]ôHõ›»õ‹àHÿ[YH\Ÿ\ãŸõY¬àH[úŸ\ù»Hô]»X›]ôHõ›¬àH‹ö]\»⁄[ôŸW€Ÿ‹ÿX›[€à\õZ\‹⁄[€óÿ⁄[ôŸXàHô]\õú»[úŸ\ùYõ›»\»ô]ö[›\À€ô]»YôôX›]ôH\õZ\‹⁄[€à€ò\⁄›¬ãHYY—SP’[€õH€Y[ùXÿŸ\‹»€à\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿÇàHŸ[à\›‹ûHôXYàH]ô[‹\àôXYX[\›‹ûBàHõ»\ôX›€Y[ùSî—TïÿTUXÿSUXãH\]YXõXÀôYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\äããäXÇàHô\Ÿ\ùôYH^\›[ô»⁄Y€ò]\ôH[ôú€€òòô]\õà⁄\BàH›⁄]⁄Y[\[Y[ù][€à»ô\€€ôHX›]ôH›ô\úöY\»úõ€Bà\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿõ‹àH]][ùXÿ]Yÿ[\ÇàHŸ\ÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\ò€àHõ€K€YÿXﬁH]€õBàHô]ô[ùYÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\òúõ€H]ô\àôZ[ô»€›\òŸYúõ€HHô]»XõBãH\]Y\ôX›òX⁄Ÿ[ô\õZ\‹⁄[€àÿ[⁄]\»€»Hô]»›ô\úöYHXõH\¬àô\‹X›Y[àôX[î»[ôõ‹òŸ[Y[ùÇàH‹[ó⁄[ùô[ù‹ûWÿÿ\ù
ããäXàHY⁄[ùô[ù‹ûWÿÿ\ù⁄][JããäXàHõ›ö[ò[^ôW⁄[ùô[ù‹ûWÿÿ\ù
ããäX›ô\õÿY¬àHôXY⁄[ùô[ù‹ûWÿÿ\ù⁄][\ ããäXàHô[[›ôW⁄[ùô[ù‹ûWÿÿ\ù⁄][JããäXàHô]\ôWÿö[ó⁄][JããäXÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHô]»XõNàXõXÀù\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿãHô]»\ùX[[ö\]YH[ô^Çà€ôWÿX›]ôW€›ô\úöYW‹\ó›\Ÿ\óŸõYÿãHô]»[\àù[ò›[€éÇàXõXÀò›\úô[ù›\Ÿ\ó⁄\◊Ÿ]ô[‹\óÿXÿŸ\‹ 
XãHô\XŸYù[ò›[€àõŸNÇàXõXÀôYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\äããäXãHô]»€€ùõ€YîŒÇàXõXÀúŸ]‹\õZ\‹⁄[€ó€›ô\úöYJããäXãHô]»ì»€X⁄Y\ŒÇàH\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\◊‹Ÿ[ó‹ôXYàH\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\◊Ÿ]ô[‹\ó‹ôXYÿ[Çà»»»€ŸH»ö[H⁄[ôŸ\¬ãHÿ‹À–Tê“UP’TëKõYãHSë—ëãõYãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃMWŸ‹ò[ù[\ó‹\õZ\‹⁄[€ó€›ô\úöY\◊Ÿõ›[ô][€ãú‹[Çà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ãHÿÿ[Tê“UP’TëKõYõ›»ôYõX›»H\õ›ôYåãåéHŸX€€ô\\‹ÀX€‹úôX›YàŸX›[€àMÿà^ÇãHÿÿ[Së—ëãõYõ›»€€ùZ[ú»H]]‹ö]]]ôH[ùûHLÕà⁄X⁄‹⁄[ù[ôBàŸ\]Y[ùX[úöYŸHúõ€H[ùûHLÃ»»[ùûHLÕàôYõ‹ôH\»[\[Y[ù][€Çà[ùûKÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHH€€\]Xö[]K\ô\Ÿ\ùö[ô»[\[Y[ù][€àŸY\»H^\›[ô¬àYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\ä‹õ€KŸ]ö\⁄[€ã‹\õZ\‹⁄[€ó€›ô\úöY\ Xà⁄Y€ò]\ôH[ùX›ôXÿ]\ŸH[›\úô[ù]ôHÿ[\ú»\ôH›\úô[ù]\Ÿ\à⁄X⁄‹ÀÇãHHô]»›ô\úöYHXõH\»õ›»HX›]ôH€›\òŸHõ‹à\Ÿ\ã[]ô[‹ò[ùÀ‹ô]õ⁄Ÿ\¬à[àH⁄\ôYYôôX›]ôK\\õZ\‹⁄[€ú»ô\€€ô\ãÇãHÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\òô[XZ[ú»›]⁄YHH›ô\úöYHXõH[ô›]⁄YHHô]¬àî»ûH\⁄Y€ãÇãHH[\à\ŸYõ‹à›ô\úöYK[X[òYŸ[Y[ù]]‹ö]H\»[ù[ù[€ò[HŸ\\ò]Bàúõ€HYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\äããäX»]õ⁄Yì»ôX›\ú⁄[€à€Çà\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿÇÇà»»»⁄]€]YHôYY»»€õ›¬ãHHòX⁄Ÿ[ôõ›[ô][€àõ‹àŸX›[€àMÿà\»õ›»[\[Y[ùY[àZY‹ò][€àõ‹õBà[ô[Y€ôY»Hö[ò[[ùûHLÕà\⁄Y€ãÇãHõ»RHõ‹à›ô\úöYHX[òYŸ[Y[ùÿ\»ùZ[[à\»\‹ÀÇãHõ»›€ô\ã[€õH]ô[‹\ãXXÿŸ\‹»]ÿ\»ùZ[[à\»\‹ÀÇÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãH€€ôö\õYYÿÿ[ô\»›]\»ôYõ‹ôH€€[Z]€€ú⁄\›»€õHŸéÇàHÿ‹À–Tê“UP’TëKõYàHSë—ëãõYàH›\Xò\ŸK€ZY‹ò][€úÀÃåçåÃMWŸ‹ò[ù[\ó‹\õZ\‹⁄[€ó€›ô\úöY\◊Ÿõ›[ô][€ãú‹[ãH€€ôö\õYYÿÿ[ÿ‹»õ›»€€ùZ[éÇàHTê“UP’TëHåãåéBàHŸX›[€àMÿÇàHSë—ëà[ùöY\»LÕLÕKLÕÇãH€€ôö\õYY]ôHÿ⁄[XHôYõY⁄òX›»\ŸYõ‹à[\[Y[ù][€éÇàHõ»^\›[ô»\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿXõBàH\Ÿ\ó‹\õZ\‹⁄[€úÀúõ€X^\›¬àH⁄[ôŸW€Ÿ‹ÿ›\‹ù»\õZ\‹⁄[€óÿ⁄[ôŸXàH›\úô[ù]ôH\õZ\‹⁄[€ó€›ô\úöY\ÿ]H\»[\BãH]ôHZY‹ò][€à^X›][€àÿ\»
äõõ›
äà\ôõ‹õYY[à\»Ÿ\‹⁄[€é»\»\‹¬àô\\ô\»HZY‹ò][€àö[H[ôô\»\]\»€õKÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»òX⁄Ÿ[ôõ›[ô][€ãÇåãà\HHZY‹ò][€à[àH[ù[ôY]Xò\ŸH[ùö\õ€õY[ùÇåÀàûX[à\›ŒÇàH‹ò[ùHõ€ãQ]ô[‹\à\Ÿ\à\õZ\‹⁄[€àöXHŸ]‹\õZ\‹⁄[€ó€›ô\úöYXàHô]õ⁄ŸHH\õZ\‹⁄[€àöXHŸ]‹\õZ\‹⁄[€ó€›ô\úöYXàH€€ôö\õH\ôX›XõH‹ö]\»\ôHôZôX›YàH€€ôö\õH⁄[ôŸW€Ÿ‹ÿôX€‹ô»H‹ö]BàH€€ôö\õH\ôŸ][ô»ÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\ò\»ôZôX›YàH€€ôö\õH\ôŸ][ô»H]ô[‹\à\Ÿ\à\»ôZôX›YçàùZ[H]ô[‹\à€€ú€€HRHõ‹àX[òY⁄[ô»›ô\úöY\»[àH]\àZ[\›€ôKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH[ùöY\»LÕ[ôLÕHŸ\ôHõ›]òZ[XõH\»ù[ÿÿ[€›\òŸH^\ö[ô»ô\¬àﬁ[ò⁄õ€ö^ò][€é»ÿÿ[XŸZ€\ú»Ÿ\ôHYY€õH»ô\Ÿ\ùôHŸ\]Y[ùX[àù[Xô\ö[ô»ôYõ‹ôH[úŸ\ù[ô»H]]‹ö]]]ôHö[ò[[ùûHLÕãÇãHôXÿ]\ŸHHZY‹ò][€àÿ\»õ›^X›]Y]ôH\ôKù[ù[YHô\öYöXÿ][€àŸàBà‘S]Ÿ[à›[\[ô»€à\Z[ô»][àH\ôŸ]›\Xò\ŸH[ùö\õ€õY[ùÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôHô[]]ôH»[ùûHLÕãà\»\‹»›^YY⁄][àHÿ⁄ŸYòX⁄Ÿ[ôàÿ€‹H[ôYõ›YRK›€ô\ã\]Ÿ⁄XÀ^\ò][€ã‹àô]»\õZ\‹⁄[€ÇàõY‹ÀÇÇà»»»õ›][ô»ô\ôX›ìõ»Y][€ò[€]YHô]öY]»ô\]Z\ôYôYõ‹ôHZY‹ò][€à\Xÿ][€à8†%\»›^YYö[ú⁄YHHÿ⁄ŸYŸX›[€àMÿà»[ùûHLÕàòX⁄Ÿ[ôÿ€‹HYù\à]ôHÿ⁄[XBò€€ôö\õX][€ãÇÇà»»[ùûHLŒH‹ò[ù[\à\õZ\‹⁄[€à›ô\úöY\Œàù[ù[YHôZ]ö[‹à€€ôö\õYY	àÿ›[Y[ùYÇääë]NääàåçãLÀLMääï\]YûNääà€]YBääî\ŸNääà‹›R[\[Y[ù][€àô\öYöXÿ][€ÇääîŸ\‹⁄[€à\Nääàÿ›[Y[ù][€à»ô\öYöXÿ][€à
õ»ÿ⁄[XH‹àôZ]ö[‹à⁄[ôŸJBÇà»»»€€ù^Çëõ€›⁄[ô»[ùûHLÕ…‹»òX⁄Ÿ[ô[\[Y[ù][€ãûX[àô\]Y\›Y[ú‹X›[€àŸàBõ]ôHYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\ä
Xù[ò›[€àõŸH[ô]Xò\ŸHõ€Bò€€ôöY›\ò][€àôYõ‹ôHôY⁄[õö[ô»\õZ\‹⁄[€ãYõ›»\›[ô»⁄]H€»]ôBê€\ö»\Ÿ\úÀà\»›\ôòXŸYôYHòX›»]Ÿ\ôHùYHŸàH[\[Y[ù][€àù]õõ›^X⁄]HôX€‹ôY[à[ùûHLÕà‹à[ùûHLÕÀàõ»€ŸKÿ⁄[XK‹àì¬ú€XﬁHÿ\»⁄[ôŸY[à\»\‹»8†%\»[ùûHÿ›[Y[ù»€€ôö\õYYù[ù[YBòôZ]ö[‹à€õKÇÇà»»»⁄]ÿ\»ô\öYöYYÇåKà
äêÿ[\ã\ÿ€‹Yô\€€][€à€õKääà[ú‹X›YH]ôHù[ò›[€àYö[ö][€ÇàöXH◊ŸŸ]Ÿù[ò›[€ôYä
Xà€€ôö\õYYYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\ä
Xàô\€€ô\»X›]ôH›ô\úöY\»\⁄[ô»]]öù›

HOèà	‹›Xâÿ[ù\õò[K⁄]õ¬à\ò[Y]\àXÿŸ\[ô»[à\òö]ò\ûH\ôŸ]€\ö»\Ÿ\àQàHù[ò›[€àÿ[à€õBàô]\õàHÿ[[ô»Ÿ\‹⁄[€â‹»›€àYôôX›]ôH\õZ\‹⁄[€úÀà€€ôö\õYY\»\¬àÿYôHõ‹à[›\úô[ùÿ[⁄]\»
[⁄X⁄ÀXÿ[\ã[›€ãXXÿŸ\‹ K[ôôX€‹ôYà\»H\õX[ô[ù\⁄Y€àõ›[ô\ûNà\»ù[ò›[€à]\›õ›ôHô]\ŸY‹à]ôH]¬à⁄Y€ò]\ôH⁄[ôŸY»⁄X⁄»[õ›\à\Ÿ\â‹»\õZ\‹⁄[€úÀà[ûHù]\ôHôX]\ôBàôYY[ô»]
KôÀã[àYZ[àöY]»Ÿà[õ›\à\Ÿ\â‹»XÿŸ\‹ Hô\]Z\ô\»Hô]Àà^X⁄]H\ôŸ]\ÿ€‹Yù[ò›[€ãÇÇåãà
äìYÿXﬁHî””êà\»⁄[ô€K\\ú‹ŸKääà€€ôö\õYYöXHHÿ[YHù[ò›[€àõŸBà[ú‹X›[€à]\Ÿ\ó‹\õZ\‹⁄[€úÀú\õZ\‹⁄[€ó€›ô\úöY\ÿ
HYÿXﬁHî””êÇà€€[[äH\»ôXYõ‹à^X›H€ôHõYŒàÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\òà[›\ÇàõY‹»ô\€€ôH^€\⁄]ô[Húõ€HYò][‹\õZ\‹⁄[€ú◊Ÿõ‹ó‹õ€J
X\»X›]ôBàõ›‹»[à\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿà\»ÿ\»[\YYù]õ›^X⁄][Çà[ùûHLÕ…‹»›[[X\ûN»õ›»ôX€‹ôY\ôX›KÇÇåÀà
äìõ»ì»ôX›\ú⁄[€à8†%YX⁄[ö\€H€€ôö\õYYääàò[éÇà‹[àŸ[X›úõ€ò[YKãúõ€ò[YKãúõ€û\\‹‹õ¬àúõ€H◊‹õÿ»àõ⁄[à◊‹õ€\»à€àãõ⁄YHúõ€›€ô\Çà⁄\ôHúõ€ò[YHH	ŸYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\âŒ¬àà€€ôö\õYY]ôHô\›[à›€ô\à‹›‹ô\ÿõ€û\\‹‹õ»HùYXà€€Xö[ôYà⁄]YôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\ä
XôZ[ô»—P’TíUHQíSëTò\¬àù[ò›[€â‹»[ù\õò[ôXYŸà\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿû\\‹Ÿ\»]àXõI‹»ì»[ù\ô[K⁄X⁄\»⁄]ô]ô[ù»HôX›\ú⁄[€àö\⁄»‹öY⁄[ò[BàõYŸŸY[àHŸX€€ôù[Hå‹õ‹‹ÀX€X\ò[òŸH\‹»
[ùûHLÕäKà€€ôö\õYYà\»\»H\›[ò›õ€ãX€€ôõX›[ô»YX⁄[ö\€Húõ€HHŸ\\ò]Bàõ€ã\ôX›\ú⁄]ôH›\úô[ù›\Ÿ\ó⁄\◊Ÿ]ô[‹\óÿXÿŸ\‹ 
X[\ã⁄X⁄]õ⁄Y¬àôX›\ú⁄[€àûHô]ô\à]Y\ûZ[ô»H›ô\úöYHXõH][ò]\à[àûBàû\\‹⁄[ô»ìÀàõ›\ôH€‹úôX›[ôŸ\ùôHYôô\ô[ù\ú‹Ÿ\Œ»^H⁄›[àõ›ôH€€\ŸY[ù»H⁄[ô€HYX⁄[ö\€KÇÇà»»»⁄]ÿ\»€€\]YÇãHYYHô]»ê€€ôö\õYYù[ù[YHôZ]ö[‹àà›XúŸX›[€à»ŸX›[€àMÿà[Çàÿ‹À–Tê“UP’TëKõYôX€‹ô[ô»[ôYHö[ô[ô‹»Xõ›ôH\»\õX[ô[ùàÿYXôX\ö[ô»òX›»Xõ›]Hﬁ\›[Hò]\à[àò[ú⁄Y[ù[\[Y[ù][€Çàõ›\ÀÇãHô\ú⁄[€àXY\à\]Y»ôYõX›\»ÿ›[Y[ù][€ã[€õH\‹ÀÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬Çìõ€ôKà\»[ùûH\»ÿ›[Y[ù][€ã[€õKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ÇãHÿ‹À–Tê“UP’TëKõY
ŸX›[€àMÿàY][€ãô\ú⁄[€àXY\äBãHSë—ëãõY
\»[ùûJBÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ÇãHõ»X›[€àô\]Z\ôYà\»€€ôö\õ\»^\›[ô»ôZ]ö[‹é»õ›[ô»»[\[Y[ù‹Çà⁄[ôŸKÇãHYàHù]\ôHZ[\›€ôHô\]Z\ô\»⁄X⁄⁄[ô»[õ›\à\Ÿ\â‹»YôôX›]ôBà\õZ\‹⁄[€úÀ»õ›[ŸYûHYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\ä
X	‹»⁄Y€ò]\ôH‹ÇàôZ]ö[‹à8†%ùZ[Hô]ÀŸ\\ò][Hò[YY^X⁄]H\ôŸ]\ÿ€‹Yù[ò›[€Çà[ú›XY[ôõ›]H]õ›Y⁄€]YHô]öY]»ö\ú›\àŸX›[€àMÿãÇÇà»»»⁄]€]YHôYY»»€õ›¬ÇãHŸX›[€àMÿàõ›»€€ùZ[ú»H\õX[ô[ùôX€‹ôŸà\ŸHôYHù[ù[YHòX›ÀÇàù]\ôH\ò⁄]X›\ôHô]öY]»[ùõ€ö[ô»YôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\ä
Xà⁄›[ôX]ÿ[\ã\ÿ€‹Yô\€€][€à[ôYÿXﬁKRî””êà⁄[ô€K\\ú‹ŸBàôZ]ö[‹à\»Ÿ]Yÿ›[Y[ùY€€ú›òZ[ùÀõ›‹[à]Y\›[€úÀÇÇà»»»ô^›\»
[à‹ô\äBÇåKàûX[àõÿŸYY»⁄]H[õôY\›Ÿ\]Y[òŸH
‹ò[ù‹ô]õ⁄ŸHöXBàŸ]‹\õZ\‹⁄[€ó€›ô\úöYX]Y]òZ[€€ôö\õX][€ã\ôX›]‹ö]HôZôX›[€Çà\›\⁄[ô»Ÿ]õ€H]][ùXÿ]Y‹àHôX[\Ÿ\‹⁄[€ã]ô[‹\ã¬àÿ[óÿXÿŸ\‹◊Ÿ]ô[‹\ò\ôŸ][ô»ôZôX›[€äH\⁄[ô»H€»]ôH€\ö»\Ÿ\úÀÇåãàõ»ù\ù\àÿ›[Y[ù][€à€‹ö»\»ô\]Z\ôYõ‹àŸX›[€àMÿà[õ\‹»\›[ô¬à›\ôòXŸ\»HŸ[ùZ[ôH\ÿ‹ô\[òﬁKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬Çìõ€ôKà[ôYH][\»[à\»\‹»Ÿ\ôHô\öYöXÿ][€ãŸÿ›[Y[ù][€à€õN»õ¬õ‹[à][\»ô\›[YÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬Çìõ€ôHX›]ôKÇÇãKKBÇà»»õ›][ô»ô\ôX›Çääìõ»ù[Hå‹õ‹‹ÀX€X\ò[òŸHô\]Z\ôYääà\»[ùûHÿ›[Y[ù»€€ôö\õYYù[ù[YBòôZ]ö[‹àŸà[ôXYK[ÿ⁄ŸY[ôXYKZ[\[Y[ùYù[ò›[€ò[]N»]Ÿ\»õ›ò⁄[ôŸH\ò⁄]X›\ôKÿ⁄[XK‹à\õZ\‹⁄[€àŸ[X[ùX‹Àà[ôõ‹õX][€ò[ôX€‹ô€õKÇÇääëõ‹à€Ÿ^ääàõ»X›[€àô\]Z\ôYÇÇääëõ‹à€]YNääàôX]HôYH€€ôö\õYYòX›»[à\»[ùûH\»Ÿ]Y€⁄[ô¬ôõ‹ùÿ\ô»õ»ù\ù\àô]öY]»ôYYY€à\»‹X»XúŸ[ùHô]»\ÿ‹ô\[òﬁKÇÇà»»[ùûHLŒHHõ‹ùÿ]HRHﬁ\›[Hÿ⁄ŸY
‹õ‹‹ÀP\Xÿ][€àö\›X[›[ô\ô
BÇääë]NääàåçãLÀLMääï\]YûNääà€]YBääî\ŸNääà\ò⁄]X›\ôHÿ⁄»8†%RK”ò]öYÿ][€à›[ô\ôääîŸ\‹⁄[€à\Nääà\ò⁄]X›\ôKTŸ[ú⁄]]ôHRHX⁄\⁄[€à
ÿ‹À[€õJBÇà»»»€€ù^ÇîûX[à\õ›ôYHôYô\ô[òŸH[ÿ⁄›\
]X⁄Y[XYŸK\»Ÿ\‹⁄[€äH\›Xõ\⁄[ô¬ùH\ôŸ]ö\›X[[ôò]öYÿ][€à\ôX›[€àõ‹àH[ù\ôHõ‹ùÿ]HHåÇò\Xÿ][€à8†%€ÿò[XY\ãö[X\ûK‹ŸX€€ô\ûH⁄YXò\úÀ€‹ö‹‹XŸH^[›]öY\ò\ò⁄KXõH[ú⁄]K€€‹à[ô›XYŸK[ôô\‹€ú⁄]ôHôZ]ö[‹ãà\»[ùûBõÿ⁄‹»]\ôX›[€à\»ô]»ŸX›[€àL[àTê“UP’TëKõY\àH^\›[ô¬ô€›ô\õò[òŸHõÿŸ\‹»õ‹à\ò⁄]X›\ôK\Ÿ[ú⁄]]ôHRHX⁄\⁄[€úÀÇÇï\»\»H
äôÿ‹À[€õHÿ⁄ äãàõ»ôXX›‘‘À›\Xò\ŸKZY‹ò][€ã‹àù[ù[YBù€‹ö»ÿ\»\ôõ‹õYY‹à]]‹ö^ôY[à\»Ÿ\‹⁄[€ãÇÇà»»»⁄]ÿ\»ô]öY]ŸYÇãHH\õ›ôYôYô\ô[òŸH[ÿ⁄›\
\⁄õÿ\ô“õÿú»öY]»⁄›⁄[ô»€ÿò[XY\ãàö[X\ûH⁄YXò\àì^Hõÿú»à€‹ö‹‹XŸKŸX€€ô\ûH⁄YXò\àêX›]ôHõÿú»à›]\¬à\›Ÿ[X›YZõÿàôX€‹ôXY\ã[ôH^\›[ô»‹ö^õ€ù[]Z[Xú BãHHù[‹ö][à\⁄Y€ãY\ôX›[€àúöYYàXÿ€€\[ûZ[ô»H[ÿ⁄›\ãHH€€\]H^\›[ô»Tê“UP’TëKõYõ‹à€€ôõX›À⁄]\ùX›[\Çà][ù[€à»ŸX›[€àà
€‹ö‹‹XŸH]Z[›XãSò]öYÿ][€à]\õäBÇà»»»€€ôõX›Y[ùYöYY[ôô\€€ôYÇääîŸX›[€ààúÀàô]»⁄YXò\à€€òŸ\ääàŸX›[€àà
ÿ⁄ŸYåãåç
H›]\»õõ¬ú⁄YXò\àõ‹àõÿà›Xã[ò]àà⁄][àHŸ[X›YôX€‹ô	‹»]Z[öY]ÀàHô]¬ô\⁄Y€à\ôX›[€à[ùõŸXŸ\»ö[X\ûK‹ŸX€€ô\ûH⁄YXò\ú»]H€‹ö‹‹XŸBõ]ô[à\ŸH‹\ò]H]Yôô\ô[ù^Y\ú»ŸàH⁄[8†%H⁄YXò\à€›ô\õú¬õò]öYÿ][€à
òô]ŸY[äàôX€‹ôÀ›öY]‹Œ»ŸX›[€àâ‹»‹ö^õ€ù[Xú»€›ô\õÇõò]öYÿ][€à
ù⁄][äàHŸ[X›YôX€‹ô	‹»]Z[›\ôòXŸH8†%[ô\ôHõ›òX›X[H[à€€ôõX›à›Ÿ]ô\ãHõﬁ[Z]HŸàH€»€€òŸ\»ÿ\úò[ùY[Çô^X⁄]ôX€€ò⁄[X][€à›][Y[ùò]\à[àX]ö[ô»]»[ôô\ô[òŸKàŸX›[€ÇçLåH›]\»\»\ôX›NàŸX›[€ààô[XZ[ú»ù[H[àõ‹òŸH[ô[ò⁄[ôŸY¬ùHô]»⁄YXò\ú»ô]ô\à\X\à[ú⁄YHHŸ[X›YôX€‹ô	‹»]Z[öY]»[ôô]ô\Çúô\XŸHH‹ö^õ€ù[Xà]\õãÇÇìõ»›\à€€ôõX›»Ÿ\ôHõ›[ôà\õZ\‹⁄[€ãX]ÿ\ôHò]öYÿ][€ãõ›X›YX€€[[ÇöY[ôÀ[ôô\‹€ú⁄]ôHô\]Z\ô[Y[ù»[ô\›]H^\›[ô»ÿ⁄ŸYù[\¬äŸX›[€àMÀŸX›[€àM»ÿ[ó›öY]◊Ÿö[ò[ò⁄X[ÿ€€ú›]][€ò[ù[HN
Hò]\Çù[à[ùõŸX⁄[ô»ô]»€ô\ÀÇÇà»»»⁄]ÿ\»ÿ⁄ŸYÇìô]»ŸX›[€àL
ìõ‹ùÿ]HRHﬁ\›[HäH[àÿ‹À–Tê“UP’TëKõY€›ô\ö[ôŒÇÇãH€ÿò[\Xÿ][€àXY\à
úò[ô[ôÀ\õZ\‹⁄[€ãX]ÿ\ôH‹ò]ã€€\X›àõŸö[HY[ùJBãHö[X\ûH⁄YXò\à
›XõH€‹ö‹‹XŸHò]öYÿ][€ã^\›[ô»õ›]\À‹\õZ\‹⁄[€ú¬à€õJBãH‹[€ò[ŸX€€ô\ûH⁄YXò\à
ö[\úÀ‹ÿ]ôYöY]‹À‹›]\»‹õ›\Œ»€ôBà€€ú⁄\›[ùYX[ö[ô»\à€‹ö‹‹XŸN»ô]ô\àô\XŸ\»ŸX›[€ààXú BãHXZ[à€‹ö‹‹XŸH›ùX›\ò[Y\ò\ò⁄BãHXõH[ú⁄]H›[ô\ô[ôõ›X›YX€€[[à€Z\‹⁄[€àù[H
ô\›]\¬àÿ[ó›öY]◊Ÿö[ò[ò⁄X[ÿõ»ô]»õY BãH›[[X\ûHÿ\ô\ÿYŸH›ZY[òŸBãH\õZ\‹⁄[€ãX]ÿ\ôHô[ô\ö[ô»
ô\›]\»^\›[ô»Ÿ\ùô\ãX]]‹ö]]]ôHù[Kàõ»ô]»YX⁄[ö\€JBãH€€‹ã‹›[[ô»[ô›XYŸH
õ‹ùÿ]HôY\»X›]ôK\›]HXÿŸ[ù»úöY⁄‹ôY[Çà^€YYúõ€Hò]äBãH‹X⁄[ôÀ⁄Y\ò\ò⁄H›[ô\ôãHù[ô\‹€ú⁄]ôHôZ]ö[‹à‹X»õ‹à\⁄›‹›Xõ]€[ÿö[H
€€ú›]][€ò[àù[HN€€\X[òŸK\⁄Y€ôY[àúõ€H\ŸHJBãHô]\ÿXõH\⁄Y€ã\ﬁ\›[Hö[Z]]ôHò[Z[ô»
[\›ò]]ôKõ›Hô\]Z\ôYö[Bà^[›]
BãHÿ⁄ŸYôYK\\ŸHõ€›]Ÿ\]Y[òŸBãH^X⁄]›][Ÿã\ÿ€‹H\›ãH[\[Y[ù][€àÿ]H
ÿ‹À[€õN»Ÿ\»õ›]]‹ö^ôH€ŸJBÇà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ÇääêTê“UP’TëKõYåãåéH8°§àåãåÃ
äÇÇãHô]»ŸX›[€àL\[ôYYù\àŸX›[€à
ŸX›[€àHô[XZ[ú»ô\Ÿ\ùôYõ‹Çàõÿà^‹ù[ò⁄[ôŸYõ»€€\⁄[€äBãHô\ú⁄[€àXY\à\]Y⁄]HåãåÃ›[[X\ûBÇà»»»⁄]€Ÿ^X^H[\[Y[ùö\ú›
\ŸHHÿ€‹JBÇãHHô]\ÿXõH\Xÿ][€à⁄[ö[Z]]ô\»
\⁄[‹ò]öYÿ][€ãàö[X\ûT⁄YXò\ãŸX€€ô\ûT⁄YXò\ã€‹ö‹‹XŸRXY\ãXêò\ã]Àà8†%ò[Z[ô¬àõ^XõJH[ô\⁄Y€à⁄Ÿ[ú»
€€‹ã‹X⁄[ôÀ\Ÿ‹ò\H\àŸX›[€àLé8†$¬àLéJBãH€€ùô\ú⁄[€àŸàH
äí[ùô[ù‹ûH[Ÿ[Jäà»Hô]»⁄[⁄][^\›[ô¬à[ùô[ù‹ûHù[ò›[€ò[]K\õZ\‹⁄[€úÀ[ôù\⁄[ô\‹»ù[\»ô\Ÿ\ùôY^X›BãHô\‹€ú⁄]ôHôZ]ö[‹àõ‹àH⁄[X‹õ‹‹»\⁄›‹›Xõ]€[ÿö[K\àŸX›[€ÇàLåLùZ[[àúõ€HH›\ù
õ›ô]õŸö]Y
BÇà»»»⁄]ô[XZ[ú»›]Ÿàÿ€‹H
\»Z[\›€ôH[ô\ŸHJBÇãHõÿúÀ\›[X]\À[\ﬁYY\ÀôZX€\À]ô[‹\ã[ô⁄[\»[Ÿ[Bà€€ùô\ú⁄[€ú»
\ŸHãÃ»8†%Ÿ\]Y[òŸY]\äBãH[ûH⁄[ôŸH»ŸX›[€àâ‹»‹ö^õ€ù[]Z[]Xà]\õÇãH[ûHÿ⁄[XH⁄[ôŸKZY‹ò][€ãô]»\õZ\‹⁄[€àõYÀô]»îÀ‹à\ôX›à]Xò\ŸH‹ö]BãH[ûH⁄[ôŸH»[ùô[ù‹ûHYŸ\ã⁄X⁄€›]õÿú»ö[ò[ò⁄X[Ÿ⁄XÀà]][ùXÿ][€ã‹àŸX›[€àMÿà
‹ò[ù[\à\õZ\‹⁄[€à›ô\úöYJHôZ]ö[‹ÇãH[ûHô]»õ›]H‹à[Ÿ[Hõ›[ôXYH\õ›ôY[Ÿ]⁄\ôH[à\»ÿ›[Y[ùÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ÇåKàùZ[H⁄[[ô\⁄Y€à⁄Ÿ[ú»ö\ú›»€€ùô\ù[ùô[ù‹ûHŸX€€ôà»õ›à›\ùõÿúÀ—\›[X]\ÀŸ]Àà⁄[€€ùô\ú⁄[€à[ù[\ŸHH\»€€ôö\õYYà›XõKÇåãà]ô\ûH^\›[ô»[ùô[ù‹ûH\õZ\‹⁄[€à⁄X⁄Àì»€XﬁK[ôù\⁄[ô\‹»ù[Bàÿ\úöY\»›ô\à[ò⁄[ôŸY8†%\»\»Hô\Ÿ[ù][€ã[^Y\à€€ùô\ú⁄[€à€õKÇåÀàŸX›[€àà\»õ›ôZ[ô»›X⁄Yà⁄[à\ŸHà
õÿú HôY⁄[úÀH^\›[ô¬à‹ö^õ€ù[]Z[]Xà[\[Y[ù][€à\»ô]\ŸY\ÀZ\»[ú⁄YHHô]»⁄[àõ›ôXùZ[Ççàõ›X›Y€€[[ú»
KôÀãö[ò[ò⁄X[]Hÿ]Y€àÿ[ó›öY]◊Ÿö[ò[ò⁄X[ÿ
Bà]\›ôH€Z]Yúõ€HXõHX\ö›\[ù\ô[Hõ‹à[ò]]‹ö^ôY\Ÿ\ú»8†%õ›àô[ô\ôYõ[öÀ€X\⁄ŸY€Y[ù\⁄YKÇçKàô\‹€ú⁄]ôHôZ]ö[‹à\»õ›Hõ€›À]\\⁄»8†%ùZ[[ÿö[K›Xõ]ôZ]ö[‹Çà[€ô‹⁄YH\⁄›‹[àHÿ[YH[\[Y[ù][€à\‹À\à€€ú›]][€ò[ù[BàNÇÇà»»»ô^›\»
[à‹ô\äBÇåKàûX[à€€ôö\õ\»\»[ùûH[ôTê“UP’TëHåãåÃåãà€Ÿ^ÿ€‹\»\ŸHNà⁄[ö[Z]]ô\»
»\⁄Y€à⁄Ÿ[ú»
»[ùô[ù‹ûBà€€ùô\ú⁄[€ã\»HùX⁄Ÿ]€\‹⁄YöXÿ][€à\àŸX›[€àÕBåÀà€Ÿ^[\[Y[ù»\ŸHKô\Ÿ\ùö[ô»[^\›[ô»[ùô[ù‹ûHù[ò›[€ò[]BçàûX[àô]öY]‹»\ŸHHYÿZ[ú›HôYô\ô[òŸH[ÿ⁄›\[ô^\›[ô»[ùô[ù‹ûBàôZ]ö[‹àôYõ‹ôH\ŸHà
õÿú HôY⁄[ú¬Çà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬Çìõ€ôHõÿ⁄⁄[ôÀàHŸX›[€àã‹⁄YXò\àôX€€ò⁄[X][€àXõ›ôHô\€€ô\»H€õBò[XöY›Z]Hõ›[ô\ö[ô»ô]öY]ÀÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬Çìõ€ôHX›]ôKÇÇãKKBÇà»»õ›][ô»ô\ôX›Çääëÿ‹À[€õH\ò⁄]X›\ôHÿ⁄Àù[Hå‹õ‹‹ÀX€X\ò[òŸHõ›ô\]Z\ôY
äà8†%\¬úŸ\‹⁄[€àYõ››X⁄ÿ⁄[XK\õZ\‹⁄[€úÀî‹À‹àù\⁄[ô\‹»Ÿ⁄XŒ»]úô\€€ôY€ôH[ù\õò[X€€ú⁄\›[òﬁH]Y\›[€à
ŸX›[€ààúÀàô]»⁄YXò\ú HûBô\ôX›^X[ôX€€ò⁄[X][€à⁄][àHÿ[YHÿ›[Y[ù⁄X⁄Ÿ\»õ›ö\ŸBù»H‹õ‹‹À[[Ÿ[€X\ò[òŸHô\⁄€\ŸYõ‹àòX⁄Ÿ[ô‹ŸX›\ö]K\Ÿ[ú⁄]]ôBò⁄[ôŸ\ÀÇÇääëõ‹à€Ÿ^ääà€X\ôY»ÿ€‹H[ôôY⁄[à\ŸHH
⁄[
»[ùô[ù‹ûBò€€ùô\ú⁄[€äH\àHï⁄]€Ÿ^X^H[\[Y[ùö\ú›àŸX›[€àXõ›ôK€òŸHûX[Çò€€ôö\õ\»\»[ùûH[ôH\]YTê“UP’TëHåãåÃÇÇääëõ‹à€]YNääàõ»ù\ù\àô]öY]»ôYYYõ‹à\»Z[\›€ôH[õ\‹»\ŸHBö[\[Y[ù][€à›\ôòXŸ\»H€€ôõX›⁄]ŸX›[€àà‹à^\›[ô»[ùô[ù‹ûBú\õZ\‹⁄[€àŸ⁄X»]€Ÿ^ÿ[õõ›ô\€€ôH[€ôKÇÇà»»[ùûHMHõ‹ùÿ]HRH⁄[Y‹Yõ‹à[ùô[ù‹ûBÇääë]NääàåçãLÀLMääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HRHﬁ\›[H\ŸHBääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^î\ŸHH[\[Y[ù][€àõÿŸYYYúõ€HHÿ⁄ŸYRH⁄X⁄‹⁄[ù[Çòÿ‹À–Tê“UP’TëKõYåãåÃ[ôSë—ëãõY[ùûHLŒHYù\à€€ôö\õZ[ôŒÇÇãHúò[ò⁄XZ[òãH€X[àôKYY]€‹ö⁄[ô»ôYBãHÿÿ[PQX]⁄Y‹öY⁄[ã€XZ[òãH›\ù[ô»€€[Z]MçYXåÃçŸôNéLååYéLÿçNMéLLMŸŒLXXôXãHŸX›[€àLÿ\»ô\Ÿ[ùãHŸX›[€ààô[XZ[ôY[ò⁄[ôŸY[ô€€\]XõH⁄]H€‹ö‹‹XŸK\⁄[àX⁄\⁄[€ÇÇï\»\‹»›^YY[ú⁄YHH\õ›ôYô\Ÿ[ù][€ã[€õHÿ€‹Nàô]\ÿXõH⁄[ú⁄\ôY\⁄Y€à⁄Ÿ[úÀ[ùô[ù‹ûH€€ùô\ú⁄[€ã[ôô\‹€ú⁄]ôHôZ]ö[‹ãàõ¬úÿ⁄[XKîÀ\õZ\‹⁄[€ã]]]Y]YŸ\ã⁄X⁄€›]‹àù\⁄[ô\‹À\ù[H€‹ö¬ùÿ\»]]‹ö^ôY‹à\ôõ‹õYYÇÇà»»»⁄]ÿ\»XY€õ‹ŸYãH€€ôö\õYYH^\›[ô»\⁄[[ô[ùô[ù‹ûHô\Ÿ[ù][€à›[]ôYà[ú⁄YHH[€õ€]X»‹òÀ–\öúﬁÇãH€€ôö\õYYH›\úô[ù]ôH[ùô[ù‹ûH^\öY[òŸH[ôXYH[ò€YY\ŸBà[\[Y[ùY›\ôòXŸ\»[ôôYYY»ô[XZ[à⁄\ôY»Z\à^\›[ô»[ô\úŒÇàH[ùô[ù‹ûH›ô\ùöY]¬àHXÿ€›[ù[ô»^‹ùàHÿ][Ÿ»ô]öY]¬àH›‹òYŸHúõ›‹Ÿ\ÇàHÿÿ][€ú»	àTÇàHÿÿ[àTÇàHXô[\⁄Y€ô\ÇàH€€ÿ][Ÿ›YBàHÿ\ù⁄X⁄€›]àH[ùô[ù‹ûH€›[ù	à€‹úôX›[€ÇàHò[úÿX›[€ú¬ãH€€ôö\õYYHô]»⁄[Y»ô\Ÿ\ùôHH\ôX›ÿÿ][€ã\ÿÿ[à]Bà^\›[ô»‹[]ô[€‹ö‹‹XŸ\À[ôH›\úô[ù\õZ\‹⁄[€ãX]ÿ\ôH[Ÿ[Bàö\⁄Xö[]H[Ÿ[ÇãH€€ôö\õYYHõ⁄ôX›\»õ»Ÿ\\ò]H]]€X]Y\›€€[X[ôô^[€ôàúHù[àùZ[ÇÇà»»»⁄]ÿ\»€€\]YãHYYô]\ÿXõHY⁄][YH\⁄Y€à⁄Ÿ[ú»õ‹àHÿ⁄ŸYõ‹ùÿ]Hö\›X[àﬁ\›[NÇàHõ‹ùÿ]HôYúò[ô[ôŸ[X›Y\›]H[ù¬àHYŸK‹›\ôòXŸKÿõ‹ô\ã›^‹›]\»€€‹ú¬àHòY]\À⁄Y›À‹X⁄[ôÀXY\àZY⁄[ô⁄YXò\à⁄Yò\öXXõ\¬ãHYYô]\ÿXõH⁄[€^[›]€€\€ô[ùŒÇàH\⁄[àH‹ò]öYÿ][€òàHö[X\ûT⁄YXò\òàHŸX€€ô\ûT⁄YXò\òàH€‹ö‹‹XŸRXY\òàH›[[X\ûPÿ\ôãHYY⁄\ôY⁄[€^[›]›[\»õ‹éÇàH\ú⁄\›[ù€ÿò[XY\ÇàHô\‹€ú⁄]ôH‹ò]öYÿ][€ÇàH€€\⁄XõHö[X\ûH⁄YXò\ÇàH‹[€ò[ŸX€€ô\ûH€€ù^⁄YXò\ÇàHY⁄€‹ö‹‹XŸH›\ôòXŸ\À€€\X›‹\ò][€ò[‹X⁄[ôÀ[ôŸ[X›Y\›]BàôYXÿŸ[ù¬àHö[ù[[ŸH›\ô\‹⁄[€àŸà⁄[€ò]öYÿ][€à⁄õ€YBãH[ùY‹ò]YHô]»⁄[[ù»\⁄õÿ\ô

X⁄[Hô\Ÿ\ùö[ô»^\›[ô¬à€‹ö‹‹XŸHõ›][ô»[ô]]‹ö^ò][€àôZ]ö[‹ãÇãH€€ùô\ùY[ùô[ù‹ûHúõ€HH€ôXY[€õH⁄[‹ò\\à[ù»Hô]¬à[ùô[ù‹ûU€‹ö‹‹XŸT[ô[ŸY\[ô»H^\›[ô»]ôH[ô[»[ô[ô\ú»õ‹éÇàH›ô\ùöY]¬àHXÿ€›[ù[ô»^‹ùàHÿ][Ÿ¬àH›‹òYŸBàHÿÿ][€ú»»TÇàHÿÿ[àõ›¬àHXô[¬àH€€ÿ][Ÿ›YBàHÿ\ùàH€›[ù»€‹úôX›[€ÇàHò[úÿX›[€ú¬ãHYY[ùô[ù‹ûK\‹X⁄YöX»ŸX›[€àY]Y]K›[[X\ûKXÿ\ô€›[ùÀ⁄YXò\Çàò]öYÿ][€ã[ôH€€ù^òZ[⁄]›]‹ôX][ô»ô]»õ›]\ÀÇãHô\Ÿ\ùôYH\ôX›ÿÿ][€ã\ÿÿ[àõ›]H[ô\àHô]»€ÿò[⁄[ÇãHYù\⁄õÿ\ôõÿúÀ\›[X]\À[\ﬁYY\ÀôZX€\À⁄[\À[ô]ô[‹\Çà[ù\õò[€‹öŸõ›‹»ù[ò›[€ò[H[ò⁄[ôŸY\⁄YHúõ€H[ö\ö][ô»Hô]¬à‹[]ô[⁄[ÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãHSë—ëãõYãH‹òÀ–\öúﬁãH‹òÀ€XZ[ãöúﬁãH‹òÀÿ€€\€ô[ùÀ€^[›]–\⁄[öúﬁãH‹òÀÿ€€\€ô[ùÀ€^[›]‘ö[X\ûT⁄YXò\ãöúﬁãH‹òÀÿ€€\€ô[ùÀ€^[›]‘ŸX€€ô\ûT⁄YXò\ãöúﬁãH‹òÀÿ€€\€ô[ùÀ€^[›]’‹ò]öYÿ][€ãöúﬁãH‹òÀÿ€€\€ô[ùÀ›ZK‘›[[X\ûPÿ\ôöúﬁãH‹òÀÿ€€\€ô[ùÀ›ZK’€‹ö‹‹XŸRXY\ãöúﬁãH‹òÀ‹›[\À€^[›]ò‹‹ÿãH‹òÀ‹›[\À›⁄Ÿ[úÀò‹‹ÿÇà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ãHõ€ôKàÿ‹À–Tê“UP’TëKõYô[XZ[ôY]åãåÃ[ôÿ\»õ›Y]YÇãHö[‹àSë—ëà⁄X⁄‹⁄[ùô[XZ[ôY[ùûHLŒN»\»[ùûH\[ô»[ùûHMà€õKÇÇà»»»⁄]€]YHôYY»»€õ›¬ãH\»\‹»›^YY[ú⁄YHHÿ⁄ŸYŸX›[€àL»[ùûHLŒHô\Ÿ[ù][€àÿ€‹KÇãH[ùô[ù‹ûHõ›»\Ÿ\»Hõ‹ùÿ]H⁄[ö[Z]]ô\Àù]õ»òX⁄Ÿ[ô‹Çà\õZ\‹⁄[€àŸ[X[ùX‹»Ÿ\ôH⁄[ôŸYÇãHõÿúÀ—\›[X]\À—[\ﬁYY\À’ôZX€\À‘⁄[\À—]ô[‹\à›[ôYYù]\ôBà€‹ö‹‹XŸK[]ô[ö\›X[€€ùô\ú⁄[€àYà]\à\Ÿ\»]]‹ö^ôH]ÇÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYYôYõY⁄ôYõ‹ôHY]ŒÇàHúò[ò⁄XZ[òàH€X[à€‹ö⁄[ô»ôYBàHÿÿ[PQH‹öY⁄[ã€XZ[òHMçYXåÃçŸôNéLååYéLÿçNMéLLMŸŒLXXôXàHTê“UP’TëHåãåÃàHSë—ëàÿ\\‹»õ›Y⁄[ùûHLŒBãH€Yÿ»úHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸY\⁄YHúõ€HH[ôKY[ô[ô»ÿ\õö[ô»€à‹òÀ€XZ[ãöúﬁàÿ]\ŸYûH⁄]õ‹õX[^ò][€é»õ»⁄]\‹XŸH\úõ‹àõÿ⁄ŸYHùZ[ÇãH€€ôö\õYYõ»ZY‹ò][€àö[\»Ÿ\ôHYY‹à⁄[ôŸYÇãH€€ôö\õYYõ»òX⁄Ÿ[ôö[\À›\Xò\ŸHÿ⁄[XHö[\Àì»ö[\À‹àî»ö[\¬àŸ\ôH⁄[ôŸY[à\»\‹ÀÇãH€€ôö\õYYHô]»⁄[€^[›]‹›[Hö[\»€€ùZ[àõ»\ôX››\Xò\ŸBà[úŸ\ù\]X[]Xúÿ‹à[ùô[ù‹ûWÿò[[òŸ\ÿ‹ö]H]ÇãH€€ôö\õYYö[ù\‹X⁄YöX»⁄[›\ô\‹⁄[€à^\›»[à‹òÀ‹›[\À€^[›]ò‹‹ÿà€»Hô]»ò]öYÿ][€à⁄õ€YHŸ\»õ›\X\à[àö[ù[ŸKÇãH€€ôö\õYYô\‹€ú⁄]ôHôZ]ö[‹àÿ\»[\[Y[ùY[à€ŸHõ‹éÇàH\⁄›‹Yò][»M€\‹»Ÿà^[›]àHLçŒ\ŸX€€ô\ûK\⁄YXò\à€€\ŸBàHLçö[X\ûK\⁄YXò\àò]Ÿ\àôZ]ö[‹ÇàHÕé€€\X›[ÿö[K›Xõ]‹X⁄[ô¬àHŒLò\úõ›À\ÿ‹ôY[àX›[€à‹ò\[ô¬ãHX[ùX[ŸŸŸYZ[àù[ù[YHô\öYöXÿ][€àÿ\»õ›€€\]Y[à\»Ÿ\‹⁄[€ãÇàúõ›‹Ÿ\ãX]][ùXÿ]Y^\ò⁄\ŸHŸà[ùô[ù‹ûH€‹öŸõ›‹À€\ö»õŸö[HY[ùKà[ôô\‹€ú⁄]ôH[ù\òX›[€à›]\»ô[XZ[ú»[ô[ôÀÇãHHö[ò[[\[Y[ù][€à€€[Z]\⁄ÿ\»õ›Y]€õ›ÿXõH]H[€Y[ù\¬à[ùûHÿ\»‹ö][é»]\»H€€[Z]][ùõŸXŸ\»[ùûHM[ô\¬àô\‹ùY[àHŸ\‹⁄[€à›[[X\ûH»⁄]\›‹ûKÇÇà»»»ô^›\»
[à‹ô\äBåKàô]öY]»Hö\›X[ô\›[[àHŸŸŸYZ[àúõ›‹Ÿ\àŸ\‹⁄[€à]\⁄›‹Xõ]à[ô[ÿö[H⁄YÀÇåãà^\ò⁄\ŸHH^\›[ô»[ùô[ù‹ûHôXYÿX›[€à]»õ€ãY\›ùX›]ô[NÇàŸX›[€à›⁄]⁄[ôÀÿ][ŸÀ›‹òYŸKÿ\ù€›[ùò[úÿX›[€úÀÿÿ[ã[ôàö[ùŸ^‹ù›\ôòXŸ\»\»\õZ\‹⁄[€ú»[›ÀÇåÀàYàù[ù[YHô\öYöXÿ][€à\»€X[ãõÿŸYY⁄]ù]\ôH[Ÿ[H€€ùô\ú⁄[€ú»[Çà]\à\Ÿ\»ò]\à[à^[ô[ô»ÿ€‹H[ú⁄YH\»€€[Z]ÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHH\õ›ôY[ÿ⁄›\[XYŸHÿ\»õ›]òZ[XõH\»H\ôX›H[ú‹X›XõHÿÿ[à[XYŸHö[H[àH€‹ö‹‹XŸH]X⁄Y[ù»\ö[ô»\»Ÿ\‹⁄[€ã€»ö\›X[à[\[Y[ù][€àõ€›ŸYHÿ⁄ŸY‹ö][à\⁄Y€àúöYYà\»H›\úô[ù\à›ùX›\ôKÇãHôXÿ]\ŸHù[ù[YHúõ›‹Ÿ\ãÿ]]\›[ô»ÿ\»õ›€€\]Y\ôKHô\‹€ú⁄]ôBà^[›][ô⁄[[ù\òX›[€ú»\ôHô\öYöYYûHùZ[›]][ô€ŸHô]öY]Ààõ›ûHù[]ôH‹\ò]‹àÿ[›õ›Y⁄ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHTê“UP’TëHåãåÃ»[ùûHLŒH[ôYàõ›[\àŸX›[€àãÿ⁄[XKî‹À\õZ\‹⁄[€úÀ]]‹à[ùô[ù‹ûH€›\òŸBàŸàù]ÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYôYõ‹ôH€€[Z]‹\⁄H\»[\[Y[ù][€à›^YY⁄][ÇùHÿ⁄ŸY\ŸHHRH⁄[
»[ùô[ù‹ûH€€ùô\ú⁄[€àÿ€‹Húõ€HTê“UP’TëBùåãåÃ»Së—ëà[ùûHLŒH[ôYõ›‹õ‹‹»òX⁄Ÿ[ô‹à\ò⁄]X›\ôK\Ÿ[ú⁄]]ôBòõ›[ô\öY\ÀÇÇà»»[ùûHMHH[YH[Y€õY[ùõ€›À]\õ‹àõ‹ùÿ]HRH⁄[[ôõÿú»€‹ö‹‹XŸBÇääë]NääàåçãLÀLMääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HRHﬁ\›[Hõ€›À]\ôYö[ô[Y[ùääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[à›\YYHô]»\õ›ôYö\›X[ôYô\ô[òŸH[XYŸHYù\à[ùûHM[ô\⁄ŸYôõ‹àHÿ[YHŸ[ô\ò[⁄[\ôX›[€à»ôHô][ôY›ÿ\ô]Y⁄\Çò€€ú›ùX›[€ãY\⁄õÿ\ôY\›]XÀàH‹X⁄YöX»ô\]Y\›YY][€àÿ\»Bò‹ôX]HõÿòX›[€à€àHò\ã[Yùõÿú»ò]öYÿ][€àòZ[ÇÇï\»\‹»ÿ\»ôX]Y\»Hô\Ÿ[ù][€ã[€õHôYö[ô[Y[ù€à‹ŸàH\⁄Yî\ŸHH⁄[€€[Z]àõ»\ò⁄]X›\ôKÿ⁄[XK\õZ\‹⁄[€ãîÀ]]‹Çòù\⁄[ô\‹À\ù[H€‹ö»ÿ\»]]‹ö^ôYÇÇà»»»⁄]ÿ\»XY€õ‹ŸYãH€€ôö\õYYH\ô\»ÿ\»€X[à€àXZ[ò]›\ù[ô»€€[Z]àéçÕôYNòôYNLÃÿçÕôôçŸåXÇãH€€ôö\õYYHôYô\ô[òŸH[XYŸH[\\⁄^ô\ŒÇàHõ]\à⁄]HXY\àôX]Y[ùàHôY[ô\õ[ôHX›]ôHò]öYÿ][€ÇàH€Ÿù\àÿ\õHYŸHòX⁄Ÿ‹õ›[ôàHY⁄\à[ô[õ‹ô\ú»[ô⁄Y›‹¬àHX[[Yù\òZ[õÿú»^[›]àH‹ôX]Hõÿò\»Hõ€Z[ô[ùò\ã[YùX›[€ÇãH€€ôö\õYYH^\›[ô»õÿú»€‹ö‹‹XŸH[ôXYHYôX[]ôH‹ôX]KŸY]›öY]¬àõ›‹À€»Hô]»Yù\òZ[‹ôX]HõÿòX›[€à⁄›[ÿ[H›\úô[ùà›\ùô]“õÿä
X][ú›XYŸà‹ôX][ô»H\ò[[õ›ÀÇãH€€ôö\õYYH›\úô[ùõÿú»ÿ⁄[XK‹ôXY[Ÿ[Ÿ\»
äõõ›
äà^‹ŸHH¬à›\\ö[ù[ô[ùöY[»ZŸHH[ÿ⁄›\[XYŸK€»Hö\›X[Y\][€àYà»›^H⁄][àX›X[]òZ[XõHõÿàöY[ÀÇÇà»»»⁄]ÿ\»€€\]YãHô][ôY⁄\ôY⁄[⁄Ÿ[ú»[ô^[›]›[[ô»€‹Ÿ\à»H›\YYàôYô\ô[òŸNÇàHÿ\õY\à⁄]H»Y⁄X‹ôX[HYŸHòX⁄Ÿ‹õ›[ôàHõ]\à⁄]HXY\ÇàH€[[Y\à‹ò]öYÿ][€à⁄]ôY[ô\õ[ôHX›]ôH›]BàHY⁄\àõ‹ô\ú»[ô€Ÿù\à⁄Y›‹¬àH⁄Y\à\Xÿ][€à€€ù[ù\ôXBãH\]YH€ÿò[⁄[úò[ô[ô»ôX]Y[ù€»H\XY\àôXY»[‹ôHZŸBàHõŸX›€‹ôX\ö»[àHYŸK]]Hò[õô\ãÇãHô]€‹öŸYHõÿú»€‹ö‹‹XŸH[ù»H[‹ôHôYô\ô[òŸKX[Y€ôY\⁄õÿ\ô^[›]ÇàHò\ã[Yù][]HòZ[àHYù›]\ÀŸö[\àòZ[àHXZ[àõÿú»\ôX›‹ûH[ô[àHŸ[X›YZõÿà]Z[[ô[ô[›»»[€ô‹⁄YH^\›[ô»]Z[Xú¬ãHYYHô\]Y\›Yò\ã[Yù‹ôX]HõÿòX›[€à[ô⁄\ôY]»Bà^\›[ô»›\ùô]“õÿä
XôZ]ö[‹ãÇãHYY›]\À\òZ[ö[\ú»õ‹éÇàH[õÿú¬àHX›]ôHõÿú¬àH€à€àH€€\]YàHÿ[òŸ[YãHô\›[YHŸ[X›YZõÿàXY\à[ô›ô\ùöY]»›[[X\ûH»ô]\àX]⁄Bà›\YY\⁄Y€à[ô›XYŸH⁄[Hô\Ÿ\ùö[ô»H^\›[ô»]Z[]Xà]\õãÇãHŸ\[^\›[ô»õÿú»‹ôX]KŸY]ÿ\ò⁄]ôKŸ]Z[õ›‹»€àZ\à›\úô[ùà[ô\ú»[ô›\Xò\ŸH]ÀÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãHSë—ëãõYãH‹òÀ–\öúﬁãH‹òÀ‹›[\À€^[›]ò‹‹ÿãH‹òÀ‹›[\À›⁄Ÿ[úÀò‹‹ÿÇà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ãHõ€ôKàÿ‹À–Tê“UP’TëKõYô[XZ[ôY]åãåÃ[ôÿ\»õ›Y]YÇãHö[‹àSë—ëà⁄X⁄‹⁄[ùô[XZ[ôY[ùûHM»\»[ùûH\[ô»[ùûHMBà€õKÇÇà»»»⁄]€]YHôYY»»€õ›¬ãH\»ÿ\»H\⁄Y€ãX[Y€õY[ùõ€›À]\õ›Hô]»\ò⁄]X›\ôH\‹ÀÇãHHõÿú»€‹ö‹‹XŸHõ›»ö\›X[Hõ‹úõ›‹»[‹ôHúõ€HH›\YYôYô\ô[òŸBà[XYŸKù]]›[\Ÿ\»Hÿ[YH^\›[ô»õÿú»]HöY[»[ô[ô\úÀÇãHHYù\òZ[‹ôX]HõÿòX›[€à\»ô\Ÿ[ù][€ã[€õH[ô⁄[\Hõ›]\»[ù¬àH[ôXYH^\›[ô»‹ôX]KZõÿàõ›ÀÇÇà»»»ô\öYöXÿ][€ÇãH€€ôö\õYY›\ù[ô»€€[Z]ÇàéçÕôYNòôYNLÃÿçÕôôçŸåXãH€Yÿ»úHù[àùZ[\‹ŸYÇãH€€ôö\õYY€õHRK[^Y\àö[\»⁄[ôŸYÇàH‹òÀ–\öúﬁàH‹òÀ‹›[\À€^[›]ò‹‹ÿàH‹òÀ‹›[\À›⁄Ÿ[úÀò‹‹ÿàHSë—ëãõYãH€€ôö\õYYõ»ZY‹ò][€úÀÿ⁄[XHö[\Àì»ö[\Àî»ö[\À]]ö[\À‹Çà\õZ\‹⁄[€àö[\»⁄[ôŸY[à\»\‹ÀÇãH€€ôö\õYYHô\]Y\›Y‹ôX]HõÿòYù\òZ[X›[€àÿ[»H^\›[ô»õÿú¬à€‹ö‹‹XŸH‹ôX]Hõ›»ò]\à[à[ùõŸX⁄[ô»Hô]»‹ö]H]ÇãHX[ùX[ŸŸŸYZ[àù[ù[YH\›[ô»ÿ\»õ›€€\]Y[à\»Ÿ\‹⁄[€ãÇàúõ›‹Ÿ\ãX]][ùXÿ]Yô\öYöXÿ][€àŸàHôYö[ôYõÿú»^[›][ô]»[ÿö[Bà[ù\òX›[€à›]\»ô[XZ[ú»[ô[ôÀÇãHHö[ò[[\[Y[ù][€à€€[Z]\⁄ÿ\»õ›Y]€õ›ÿXõH]H[€Y[ù\¬à[ùûHÿ\»‹ö][é»]\»H€€[Z]][ùõŸXŸ\»[ùûHMH[ô\¬àô\‹ùY[àHŸ\‹⁄[€à›[[X\ûH»⁄]\›‹ûKÇÇà»»»ô^›\»
[à‹ô\äBåKàô]öY]»HôYö[ôY⁄[[ôõÿú»€‹ö‹‹XŸHö\›X[HYÿZ[ú›H›\YYàôYô\ô[òŸH[XYŸKÇåãà[àHŸŸŸYZ[àúõ›‹Ÿ\àŸ\‹⁄[€ã\›ÇàHò\ã[Yù‹ôX]HõÿòàH›]\À\òZ[ö[\ö[ô¬àHõÿú»ŸX\ò⁄àHŸ[X›YZõÿà›⁄]⁄[ô¬àH]Z[]Xàò]öYÿ][€ÇåÀàYàHôYö[ôY[YH\»\õ›ôY€€ù[ùYH\Z[ô»Hÿ[YHö\›X[[ô›XYŸBà»]\à[Ÿ[H\Ÿ\»⁄]›]⁄[ô⁄[ô»õ›X›YòX⁄Ÿ[ôõ›[ô\öY\ÀÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHH›\YYôYô\ô[òŸH[XYŸH€€ùZ[ú»H»›\\ö[ù[ô[ù»ô]ô[ùYK\›[BàöY[»]\ôHõ›[ô\Ÿ[ù[àH›\úô[ù]ôHõÿú»õ›[ô][€ã€»Bà[\[Y[ù][€àX]⁄YHö\›X[ﬁ\›[Hò]\à[àô\õŸX⁄[ô»[ò]òZ[XõBàöY[»]\ò[KÇãHù[ù[YHúõ›‹Ÿ\àô\öYöXÿ][€à\»›[ôYYYõ‹àö[ò[€€ôöY[òŸH€à[ÿö[Bà[ôXõ]õÿú»[ù\òX›[€úÀÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHHRK‹ô\Ÿ[ù][€à^Y\à[ôYõ›à[\àÿ⁄[XKî‹À\õZ\‹⁄[€úÀ]]‹àŸX›[€àà]Z[]XàôZ]ö[‹ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYôYõ‹ôH€€[Z]‹\⁄H\»õ€›À]\ô[XZ[ôY[ú⁄YBùHÿ⁄ŸYõ‹ùÿ]HRHô\Ÿ[ù][€àÿ€‹H[ôYõ›‹õ‹‹»òX⁄Ÿ[ô‹Çò\ò⁄]X›\ôK\Ÿ[ú⁄]]ôHõ›[ô\öY\ÀÇÇà»»[ùûHMàHõÿú»òZ[»XYH€€\⁄XõH[ô⁄[€‹õô\ú»⁄\ú[ôYÇääë]NääàåçãLÀLMääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HRHﬁ\›[HôYö[ô[Y[ùääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\]Y\›Y€ôH[‹ôHö\›X[ôYö[ô[Y[ù\‹»Yù\à[ùûHMNÇÇãHXZŸHHõÿú»⁄YH[ô[»€€\⁄XõHZŸHH›\YYôYô\ô[òŸH[XYŸBãH⁄\ú[àH€‹õô\àòY]\»X‹õ‹‹»H[ù\ôòXŸH€»H⁄[ôY[»[‹ôHZŸBàH[ÿ⁄›\[ô\‹»[\õ›[ôYÇï\»ô[XZ[ôYHô\Ÿ[ù][€ã[€õHõ€›À]\€à‹ŸàH\⁄YõÿúÀ][YBò[Y€õY[ù€€[Z]àõ»òX⁄Ÿ[ôÿ⁄[XK]]\õZ\‹⁄[€ã‹àù\⁄[ô\‹À\ù[H€‹ö¬ùÿ\»]]‹ö^ôYÇÇà»»»⁄]ÿ\»XY€õ‹ŸYãH€€ôö\õYY›\ù[ô»€€[Z]ÇàÃÕôååNMÃÕLåXMÕÕYçLéNŸXÕçÕŸXXYãH€€ôö\õYYHõÿú»][]HòZ[[ôõÿú»›]\»òZ[Ÿ\ôH›]XÀ]⁄Y[ô[¬à⁄]õ»\Ÿ\ãX€€ùõ€Y€€\ŸH›]KÇãH€€ôö\õYYH⁄[›[ô[YY€àòY]\»ò[Y\»]Ÿ\ôH€Ÿù\ã‹õ›[ô\Çà[àH›\YYôYô\ô[òŸK\‹X⁄X[H€àÿ\ôÀ€€ùõ€ÀòZ[À[ôõÿú¬à]Z[›\ôòXŸ\ÀÇÇà»»»⁄]ÿ\»€€\]YãHYY[ô\[ô[ù€€\ŸH›]Hõ‹àõ›õÿú»⁄YHòZ[ŒÇàHò\ã[Yù][]HòZ[àHõÿú»›]\ÀŸö[\àòZ[ãHYY\⁄›‹€€\ŸKŸ^[ô€€ùõ€»õ‹àXX⁄òZ[[ôôYXŸYH‹öYà⁄Y»⁄[àZ]\àòZ[\»€€\ŸYÇãHô\Ÿ\ùôY\ŸYù[€€\ŸYYôõ‹ô[òŸ\ŒÇàH][]HòZ[ŸY\»X€€ã[€õHX›[€ú¬àH›]\»òZ[ŸY\»€€\X›⁄‹ù[Xô[€\¬ãH⁄\ú[ôYH⁄\ôYö\›X[[ô›XYŸHûHôYX⁄[ô»òY]\»ò[Y\»X‹õ‹‹»Bà⁄[ÇàHÿ\ôòY]\¬àH€€ùõ€òY]\¬àHòZ[òY]\¬àHŸ[X›YZõÿàXY\àòY]\¬àH›\‹ù[ô»òX›Xÿ\ô»X€€ã\[ô[òY]\¬àHŸX\ò⁄Ÿö[\à[ú]òY]\¬àHù]€àòY]\¬ãHŸ\H^\›[ô»õÿú»‹ôX]K›öY]ÀŸY]ÿ\ò⁄]ôHõ›‹»[ò⁄[ôŸY⁄[Bà\Z[ô»Hô]»€€\ŸHôZ]ö[‹ãÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãHSë—ëãõYãH‹òÀ–\öúﬁãH‹òÀ‹›[\À€^[›]ò‹‹ÿãH‹òÀ‹›[\À›⁄Ÿ[úÀò‹‹ÿÇà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ãHõ€ôKàÿ‹À–Tê“UP’TëKõYô[XZ[ôY]åãåÃ[ôÿ\»õ›Y]YÇãHö[‹àSë—ëà⁄X⁄‹⁄[ùô[XZ[ôY[ùûHMN»\»[ùûH\[ô»[ùûHMÇà€õKÇÇà»»»⁄]€]YHôYY»»€õ›¬ãH\»\‹»€õHY»ô\Ÿ[ù][€ò[€€\ŸHôZ]ö[‹à[ôòY]\»ôYö[ô[Y[ùÇãHH€€\⁄XõHõÿú»òZ[»»õ›[ùõŸXŸH[ûHô]»õ›]K\õZ\‹⁄[€ã‹Çà]H‹ö]H]ÇãHHYù\òZ[‹ôX]HõÿòX›[€àúõ€H[ùûHMHô[XZ[ú»⁄\ôY»Bà^\›[ô»‹ôX]KZõÿàôZ]ö[‹ãÇÇà»»»ô\öYöXÿ][€ÇãH€Yÿ»úHù[àùZ[\‹ŸYÇãH€€ôö\õYY€õHRK[^Y\àö[\»⁄[ôŸYÇàH‹òÀ–\öúﬁàH‹òÀ‹›[\À€^[›]ò‹‹ÿàH‹òÀ‹›[\À›⁄Ÿ[úÀò‹‹ÿàHSë—ëãõYãH€€ôö\õYYõ»ZY‹ò][€úÀÿ⁄[XHö[\Àì»ö[\Àî»ö[\À]]ö[\À‹Çà\õZ\‹⁄[€àö[\»⁄[ôŸY[à\»\‹ÀÇãH€€ôö\õYYH€€\ŸHôZ]ö[‹à\»ÿÿ[RH›]H€õH[ôŸ\»õ›YôôX›à^\›[ô»õÿú»]HÿY[ô»‹à‹ö]HŸ[X[ùX‹ÀÇãHX[ùX[ŸŸŸYZ[àù[ù[YH\›[ô»ÿ\»õ›€€\]Y[à\»Ÿ\‹⁄[€ãÇàúõ›‹Ÿ\àô\öYöXÿ][€àŸàH€€\ŸY\òZ[[ù\òX›[€ú»[ôò\úõ›À\ÿ‹ôY[ÇàôZ]ö[‹àô[XZ[ú»[ô[ôÀÇãHHö[ò[[\[Y[ù][€à€€[Z]\⁄ÿ\»õ›Y]€õ›ÿXõH]H[€Y[ù\¬à[ùûHÿ\»‹ö][é»]\»H€€[Z]][ùõŸXŸ\»[ùûHMà[ô\¬àô\‹ùY[àHŸ\‹⁄[€à›[[X\ûH»⁄]\›‹ûKÇÇà»»»ô^›\»
[à‹ô\äBåKàô]öY]»H⁄\ú\ã\òY]\»⁄[[ôH€€\⁄XõHõÿú»òZ[»ö\›X[KÇåãà[àHŸŸŸYZ[àúõ›‹Ÿ\àŸ\‹⁄[€ã\›ÇàH€€\ŸH[ô^[ô€àõ›õÿú»òZ[¬àHYù\òZ[‹ôX]HõÿòàH›]\À\òZ[ö[\ö[ô»Yù\à€€\ŸKŸ^[ôàHŸ[X›YZõÿà›⁄]⁄[ô»[ô]Z[]Xàò]öYÿ][€ÇåÀàYàH€‹õô\à[ô›XYŸHõ›»ôY[»öY⁄ÿ\úûHH⁄\ú\àòY]\»ﬁ\›[Bà[ù»]\à[Ÿ[H€€ùô\ú⁄[€ú»õ‹à€€ú⁄\›[òﬁKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHH€€\ŸHôZ]ö[‹à\»›\úô[ùHÿ€‹Y»Hõÿú»òZ[À⁄X⁄X]⁄\¬àH[‹›\ôX›[ù\úô]][€àŸàûX[â‹»ô\]Y\›[ôH›\YY[XYŸKÇãHù[ù[YHö\›X[€€ôö\õX][€à\»›[ôYYYõ‹àö[ò[€\⁄€àBà€€\ŸY\⁄›‹›]H[ôXõ]€[ÿö[H^[›]ôY[ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ù\ô[H⁄][àRHô\Ÿ[ù][€àÿ€‹H[ôYàõ›[\àÿ⁄[XKî‹À\õZ\‹⁄[€úÀ]]‹àŸX›[€àà]Z[]Xàù[\ÀÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYôYõ‹ôH€€[Z]‹\⁄H\»›^YY[ú⁄YHHÿ⁄ŸYRBúô\Ÿ[ù][€àÿ€‹H[ôYõ›‹õ‹‹»òX⁄Ÿ[ô‹à\ò⁄]X›\ôK\Ÿ[ú⁄]]ôBòõ›[ô\öY\ÀÇÇà»»[ùûHM»Hõÿú»‹ôX]H[ŸH‹]úõ€H[õÿú»úõ›‹ŸHöY]¬Çääë]NääàåçãLÀLMääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HRHﬁ\›[HôYö[ô[Y[ùääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\]Y\›Y€ôHôZ]ö[‹à€‹úôX›[€àYù\à[ùûHMéÇÇãH‹ôX]Hõÿò⁄›[‹\ò]H\»]»›€àYù\[ô[ù[ò›[€ÇãHò]öYÿ][ô»»[õÿúÿ⁄›[⁄›»€õHHõÿú»\›õ›H‹ôX]Hõ‹õBÇï\»ÿ\»HRHôZ]ö[‹àôYö[ô[Y[ù€õKàõ»òX⁄Ÿ[ô‹à\õZ\‹⁄[€à€‹ö»ÿ\¬ò]]‹ö^ôYÇÇà»»»⁄]ÿ\»XY€õ‹ŸYãH€€ôö\õYYHõÿú»€‹ö‹‹XŸH›[ô[òX⁄»»H‹ôX]KZõÿàõ‹õH⁄[ô]ô\Çàõ»õÿàÿ\»Ÿ[X›YÇãH€€ôö\õYY]XYH[õÿúÿôZ]ôHZŸHHúõ›‹ŸK\\ÀYõ‹õH›]H[ú›XYàŸàH\ôH\ôX›‹ûHöY]ÀÇãH€€ôö\õYYH\⁄\ôYö^ÿ\»»Ÿ\\ò]Húõ›‹ŸH[ŸHúõ€H‹ôX]H[ŸHò]\Çà[à⁄[ô⁄[ô»H^\›[ô»ÿ]ôH[ô\à‹à[ùõŸX⁄[ô»Hô]»õ›]KÇÇà»»»⁄]ÿ\»€€\]YãHYY[à^X⁄]õÿú»€‹ö‹‹XŸH[ŸH‹]ÇàHúõ›‹ŸXàH‹ôX]XãH\]YHYù\òZ[‹ôX]HõÿòX›[€à»‹[àH‹ôX]H[ô[à[ù[ù[€ò[H[ú›XYŸàô[Z[ô»€àHõÀ\Ÿ[X›[€àò[òX⁄ÀÇãH\]Y[õÿúÿ»›]\»ò]öYÿ][€àŒÇàH€X\àHŸ[X›YõÿÇàH^]‹ôX]H[ŸBàHô]\õà»H\ôHõÿú»\ôX›‹ûHöY]¬ãH\]Yõÿàõ›»Ÿ[X›[€à»Y]õ›‹»»ô]\õàH€‹ö‹‹XŸH»õ‹õX[àúõ›‹ŸH[ŸHôYõ‹ôH⁄›⁄[ô»HŸ[X›YZõÿà]Z[›\ôòXŸKÇãH\]YH‹ôX]H[ô[»[ò€YHH\ôX›òX⁄»»[õÿúÿX›[€ãÇãHô[[›ôYH]]€X]X»ôZ]ö[‹à⁄\ôH[õÿúÿ[\X⁄]H\‹^YYBà‹ôX]Hõ‹õH⁄[àõ»õÿàÿ\»Ÿ[X›YÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãHSë—ëãõYãH‹òÀ–\öúﬁÇà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ãHõ€ôKàÿ‹À–Tê“UP’TëKõYô[XZ[ôY]åãåÃ[ôÿ\»õ›Y]YÇãHö[‹àSë—ëà⁄X⁄‹⁄[ùô[XZ[ôY[ùûHMé»\»[ùûH\[ô»[ùûHM¬à€õKÇÇà»»»⁄]€]YHôYY»»€õ›¬ãH\»\»HôZ]ö[‹à€‹úôX›[€à[ú⁄YHHõÿú»ô\Ÿ[ù][€à^Y\ãõ›Hô]¬àôX]\ôHZ[\›€ôKÇãH‹ôX]Hõÿòõ›»ôZ]ô\»\»[à^X⁄][ŸK⁄[H[õÿúÿôZ]ô\»\»Bà\ôHúõ›‹ŸH›]KÇãHH^\›[ô»õÿàÿ]ôH][ô‹ö]HŸ[X[ùX‹»Ÿ\ôHô\Ÿ\ùôY^X›KÇÇà»»»ô\öYöXÿ][€ÇãH€Yÿ»úHù[àùZ[\‹ŸYÇãH€€ôö\õYY€õH‹òÀ–\öúﬁ\»\»Së—ëà[ùûH⁄[ôŸY[à\»\‹ÀÇãH€€ôö\õYYõ»ÿ⁄[XKZY‹ò][€ãîÀìÀ]]‹à\õZ\‹⁄[€àö[\»⁄[ôŸYÇãH€€ôö\õYYHô]»ôZ]ö[‹à\»ÿÿ[RH›]H€õH[ôŸ\»õ›[\à^\›[ô¬àõÿú»‹ôX]KŸY]]H‹ö]\ÀÇãHX[ùX[ŸŸŸYZ[àù[ù[YH\›[ô»ÿ\»õ›€€\]Y[à\»Ÿ\‹⁄[€ãÇàúõ›‹Ÿ\àô\öYöXÿ][€àŸà‹ôX]Hõÿò[õÿúÿ[ô]Z[›⁄]⁄[ô¬àô[XZ[ú»[ô[ôÀÇãHHö[ò[[\[Y[ù][€à€€[Z]\⁄ÿ\»õ›Y]€õ›ÿXõH]H[€Y[ù\¬à[ùûHÿ\»‹ö][é»]\»H€€[Z]][ùõŸXŸ\»[ùûHM»[ô\¬àô\‹ùY[àHŸ\‹⁄[€à›[[X\ûH»⁄]\›‹ûKÇÇà»»»ô^›\»
[à‹ô\äBåKà[àHŸŸŸYZ[àúõ›‹Ÿ\àŸ\‹⁄[€ã\›ÇàHYù\òZ[‹ôX]HõÿòàHòX⁄»»[õÿúÿàH[õÿúÿ›]\»Ÿ[X›[€ÇàHõÿàõ›»Ÿ[X›[€àYù\àô]\õö[ô»»úõ›‹ŸH[ŸBåãàYàHúõ›‹ŸKÿ‹ôX]HŸ\\ò][€àôY[»€‹úôX›ŸY\\»›]H[Ÿ[õ‹à[ûBàù]\ôHõÿú»€‹ö‹‹XŸHôYö[ô[Y[ùÀÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHõ€ôHõÿ⁄⁄[ôÀà\»\‹»ÿ\»H\ôŸ]Y›]K[[Ÿ[€‹úôX›[€à⁄]õ¬àòX⁄Ÿ[ô[\X›ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ù\ô[H⁄][àHõÿú»RH›]H^Y\ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYôYõ‹ôH€€[Z]‹\⁄H\»ô[XZ[ôY[ú⁄YHÿ⁄ŸYRBúô\Ÿ[ù][€àÿ€‹H[ôYõ›‹õ‹‹»òX⁄Ÿ[ô‹à\ò⁄]X›\ôK\Ÿ[ú⁄]]ôBòõ›[ô\öY\ÀÇÇà»»[ùûHMHùZ[ô[XZ[ö[ô»õ‹ùÿ]H[Ÿ[H^[›]¬Çääë]NääàåçãLÀLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HRHﬁ\›[H\ŸH¬ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\]Y\›YH\Xÿ][€ã]⁄YH^[›]õ›[ô][€à\‹»õ‹àHô[XZ[ö[ô¬ù‹[]ô[õ‹ùÿ]HH[Ÿ[\»⁄[Hô\Ÿ\ùö[ô»H^\›[ô»⁄[[ùô[ù‹ûKò[ôõÿú»ôZ]ö[‹éÇÇãH\⁄õÿ\ôãH\›[X]\¬ãH[\ﬁYY\¬ãHôZX€\¬ãH⁄[\¬ãH]ô[‹\ÇÇï\»ô[XZ[ôYHúõ€ùY[ôô\Ÿ[ù][€ã€^[›]\‹»€õKàõ»òX⁄Ÿ[ôÿ⁄[XKú\õZ\‹⁄[€ãîÀ]][ùXÿ][€ãYŸ\ã]Y]‹àù\⁄[ô\‹À\ù[H⁄[ôŸ\»Ÿ\ôBò]]‹ö^ôYÇÇà»»»›\ù[ô»⁄[ùãH›\ù[ô»€€[Z]àÃôXNNLççŒMNòçåLYåÿMÕåÿXåÕçòŒNãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃãHô]ö[›\»Së—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMÿãHŸX›[€àLô[XZ[ôYô\Ÿ[ù[ô]]‹ö]]]ôBãHŸX›[€àòô[XZ[ôYô\Ÿ[ù[ô]]‹ö]]]ôBãHXZ[òX]⁄Y‹öY⁄[ã€XZ[òôYõ‹ôHY]»[ô⁄][KYôã[€õH‹öY⁄[àXZ[òàô\‹ùY[ôXYH\»]KòÇà»»»⁄]ÿ\»XY€õ‹ŸYãH€€ôö\õYYH⁄\ôYõ‹ùÿ]H⁄[[ôXYH^\›Y[éÇàH‹òÀÿ€€\€ô[ùÀ€^[›]–\⁄[öúﬁàH‹òÀÿ€€\€ô[ùÀ€^[›]’‹ò]öYÿ][€ãöúﬁàH‹òÀÿ€€\€ô[ùÀ€^[›]‘ö[X\ûT⁄YXò\ãöúﬁàH‹òÀÿ€€\€ô[ùÀ€^[›]‘ŸX€€ô\ûT⁄YXò\ãöúﬁãH€€ôö\õYYõÿúÿ[ôXYHÿ\úöYYH^X⁄]úõ›‹ŸKÿ‹ôX]H‹]úõ€Bà[ùûHM»[ôô[XZ[ôYH€‹úôX››ùX›\ò[ôYô\ô[òŸHõ‹àôX€‹ô[‹öY[ùYà[Ÿ[\ÀÇãH€€ôö\õYY\⁄õÿ\ô\›[X]\ÿ[\ﬁYY\ÿ[ôôZX€\ÿ›[àô[ô\ôYXŸZ€\à€‹ö‹‹XŸHÿ\ôÀÇãH€€ôö\õYY⁄[\ÿ[ôXYHY€‹ö⁄[ô»⁄]ôZ]ö[‹àù]ôYYYH[‹ôBà€\⁄Y€‹ö‹‹XŸH‹ò\\à€õKÇãH€€ôö\õYY]ô[‹\ò[ôXYHY]ôH›]\À›][]H€€ù[ùù]ÿ\»õ›àY]ô\Ÿ[ùY\»H€X\ô\àõ‹ùÿ]H[Ÿ[H€‹ö‹‹XŸKÇãH€€ôö\õYYH^\›[ô»[ùô[ù‹ûHôXY[Ÿ[[ôXYH^‹ŸY]ôH\›[ò][€Çà\Ÿ\à[ô\›[ò][€àôZX€HôYô\ô[òŸ\»]€›[ÿYô[H›\‹ùàô\Ÿ[ù][€ã[€õH[\ﬁYY\»[ôôZX€\»\ôX›‹ûH⁄[ÀÇÇà»»»⁄]ÿ\»€€\]YãHùZ[Hõ€KX]ÿ\ôH\⁄õÿ\ô€‹ö‹‹XŸH⁄[⁄]ÇàH€‹ö‹‹XŸHXY\ÇàH€€\X›ôX[Y]H›[[X\ûHÿ\ô¬àH]ZX⁄»[ö‹»[ù»ôX[[Ÿ[\¬àHõ›XŸ\Àÿ][ù[€àôY⁄[€ÇàH€ô\›XŸZ€\ú»õ‹àX›]ö]K‹ÿ⁄Y[HôY⁄[€ú»]»õ›Y]]ôH[Çà\õ›ôY]ôH]H€›\òŸBãHùZ[[à\›[X]\»€‹ö‹‹XŸHõ›[ô][€à⁄]ÇàHö[X\ûHòZ[öY]‹¬àH^X⁄]úõ›‹ŸHú»‹ôX]H›]BàHŸ[X›Y\ôX€‹ô⁄[àH€ô\›õÀY]H»õ›^Y]Z[\[Y[ùY›]\¬àHõ»òXúöXÿ]Y\›[X]HôX€‹ô»‹àö[ò[ò⁄X[ò[Y\¬ãHùZ[[à[\ﬁYY\»€‹ö‹‹XŸHõ›[ô][€à⁄]ÇàH\ôX›‹ûK€\›⁄[àHŸ[X›Y[\ﬁYYH]Z[⁄[àH‹ö^õ€ù[]Z[Xú¬àH^H[ôõ‹õX][€òöY]¬àH]ôH\›[ò][€ã]\Ÿ\àôYô\ô[òŸHõ›‹»⁄\ôH]òZ[XõBàHõ»õ€K\õZ\‹⁄[€ã‹àXÿ€›[ù[X[òYŸ[Y[ùY][ô¬ãHùZ[HôZX€\»€‹ö‹‹XŸHõ›[ô][€à⁄]ÇàH\ôX›‹ûK€\›⁄[àHŸ[X›YôZX€H]Z[⁄[àH‹ö^õ€ù[]Z[Xú¬àH]ôH\›[ò][€ã]ôZX€HôYô\ô[òŸHõ›‹»⁄\ôH]òZ[XõBàHõ»òXúöXÿ]Y\‹⁄Y€õY[ùŸ\ùöXŸKZ[XYŸK‹àXZ[ù[ò[òŸHôX€‹ô¬ãH€\⁄YH⁄[\»€‹ö‹‹XŸHô\Ÿ[ù][€à\õ›[ôH^\›[ô»⁄]ôZ]ö[‹éÇàH⁄\ôY€‹ö‹‹XŸHXY\ÇàH⁄\ôY\ÿXõY\›]Hô\Ÿ[ù][€ÇàHô\Ÿ\ùôY^\›[ô»€€ùô\úÿ][€ã€Y\‹ÿYŸKÿ€€\‹Ÿ\àôZ]ö[‹ÇãHôYúò[YYH]ô[‹\à[Ÿ[H[ú⁄YHH€X\ô\à]ô[‹\à€‹ö‹‹XŸH⁄[à\õ›[ôH[ôXYH^\›[ô»XY€õ‹›X‹»[ô][]Y\ÀÇãHYYô]\ÿXõHô\Ÿ[ù][€àö[Z]]ô\»⁄\ôYX‹õ‹‹»Hô]»€‹ö‹‹XŸ\ŒÇàH‹òÀÿ€€\€ô[ùÀ›ZK‘›]T[ô[öúﬁàH‹òÀÿ€€\€ô[ùÀ›ZK‘ôX€‹ôXY\ãöúﬁàH‹òÀÿ€€\€ô[ùÀ›ZK’€‹ö‹‹XŸUXúÀöúﬁãH^[ôY⁄\ôY^[›]‘‘»õ‹éÇàH›]H[ô[¬àHŸ[X›Y\ôX€‹ôXY\ú¬àH‹ö^õ€ù[Xú¬àH€‹ö‹‹XŸH›[[X\ûH‹öY¬àH\ôX›‹ûKŸ]Z[[Ÿ[H[ô[¬àH]ZX⁄À[[ö»ÿ\ô¬àHô\‹€ú⁄]ôH[Ÿ[HôZ]ö[‹ÇÇà»»»õ›]\»»ÿÿ[RH›]HYôôX›YãHô\Ÿ\ùôY^\›[ô»‹[]ô[€‹ö‹‹XŸHõ›][ô»Ÿ[X[ùX‹»\⁄[ô»H^\›[ô¬à€‹ö‹‹XŸX]Y\ûK\›ö[ô»[Ÿ[ÇãHYYÿÿ[ô\Ÿ[ù][€à›]H€õHõ‹éÇàH\⁄õÿ\ô⁄YXò\àöY]»Ÿ[X›[€ÇàH\›[X]\»⁄YXò\àöY]»Ÿ[X›[€ÇàH\›[X]\»^X⁄]‹ôX]Kÿúõ›‹ŸH[ŸBàH[\ﬁYY\»⁄YXò\àöY]»Ÿ[X›[€ÇàH[\ﬁYY\»Ÿ[X›Y[\ﬁYYH[ôX›]ôH]Z[XÇàHôZX€\»⁄YXò\àöY]»Ÿ[X›[€ÇàHôZX€\»Ÿ[X›YôZX€H[ôX›]ôH]Z[XÇàH⁄\ôY⁄YXò\à[ÿö[K[‹[à»€€\ŸYô\Ÿ[ù][€à›]BãHYYõ»]Xò\ŸKXòX⁄ŸYRHôYô\ô[òŸH\ú⁄\›[òŸH[ôõ»ô]»õ›]\ÀÇÇà»»»ö[\»⁄[ôŸYãHSë—ëãõYãH‹òÀ–\öúﬁãH‹òÀÿ€€\€ô[ùÀ‘⁄[\‘[ô[ÀöúﬁãH‹òÀÿ€€\€ô[ùÀ›ZK‘ôX€‹ôXY\ãöúﬁãH‹òÀÿ€€\€ô[ùÀ›ZK‘›]T[ô[öúﬁãH‹òÀÿ€€\€ô[ùÀ›ZK’€‹ö‹‹XŸUXúÀöúﬁãH‹òÀ‹›[\À€^[›]ò‹‹ÿÇà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ãHõ€ôKàÿ‹À–Tê“UP’TëKõYô[XZ[ôY]åãåÃ[ôÿ\»õ›Y]YÇãHö[‹àSë—ëà⁄X⁄‹⁄[ùô[XZ[ôY[ùûHMÿ»\»[ùûH\[ô¬à[ùûHM€õKÇÇà»»»ô\öYöXÿ][€ÇãH⁄]›]\ÿô]öY]ŸYôYõ‹ôH[ôYù\à[\[Y[ù][€ãÇãH⁄]YôàK\›][ô⁄]Yôòô]öY]ŸYÇãH€Yÿ»úHù[àùZ[\‹ŸYÇãHõ»ô\‹⁄]‹ûH\›€€[X[ô^\›Yô^[€ôùZ[»õ»Y][€ò[]]€X]Yà\››Z]Hÿ\»]òZ[XõH»ù[à[à\»ô\‹⁄]‹ûKÇãH€€ôö\õYY⁄[ôŸYö[\»›^YY[àHRK‹ô\Ÿ[ù][€à^Y\à\»\¬àSë—ëà\[ôÇãH€€ôö\õYYõ»ZY‹ò][€àö[\»Ÿ\ôHYYÇãH€€ôö\õYYõ»ÿ⁄[XKîÀìÀ]]\õZ\‹⁄[€ãYŸ\ã]Y]ö[ò[ò⁄X[à‹àù\⁄[ô\‹À\ù[Hö[\»Ÿ\ôHY]Y[à\»\‹ÀÇãH€€ôö\õYYõ»ô]»\ôX››\Xò\ŸH‹ö]\»Ÿ\ôH[ùõŸXŸYõ‹àHô]»^[›]àõ›[ô][€úŒ»ô]»⁄\ôY[Ÿ[H⁄[»Z]\àô]\ŸY^\›[ô»ôXY[[Ÿ[]Bà‹àô[ô\ôY€ô\›XŸZ€\úÀÇãH€€ôö\õYY[ùô[ù‹ûH[ôõÿú»Ÿ\ôHô\Ÿ\ùôY\»^\›[ô»[Ÿ[\»[ôŸ\ôHõ›à[ù[ù[€ò[Hô]€‹öŸY[à\»\‹ÀÇãH€€ôö\õYY‹ôX]Hõÿòô[XZ[ú»Ÿ\\ò]Húõ€H[õÿúÿúõ›‹ŸH[ŸKÇãHŸŸŸYZ[àúõ›‹Ÿ\àù[ù[YHô\öYöXÿ][€àÿ\»õ›€€\]Y[à\»Ÿ\‹⁄[€ãÇàô\‹€ú⁄]ôH[ú‹X›[€à]MLçÕé[ôŒLô[XZ[ú¬à[ô[ô»[àHúõ›‹Ÿ\àŸ\‹⁄[€ãÇãHúõ›‹Ÿ\àö[ù\ô]öY]»ô\öYöXÿ][€àÿ\»õ›€€\]Y[à\»Ÿ\‹⁄[€ãÇà^\›[ô»ö[ùZY[ô»ù[\»Ÿ\ôHô\Ÿ\ùôY[ô^[ôY€õH]H⁄\ôYà⁄[€^[›]^Y\ãÇÇà»»»ô[XZ[ö[ô»Yô\úôYù[ò›[€ò[]BãH\⁄õÿ\ôôXŸ[ùX›]ö]Kÿ⁄Y[KŸXY[ôH›\ôòXŸ\À[ôöX⁄\àõ›XŸ\¬à›[ôYY\õ›ôY]ôH€›\òŸ\»ôYõ‹ôH^Hÿ[à[›ôHô^[€ôXŸZ€\úÀÇãH\›[X]\»›[ôYY»]»\õ›ôYôXY]‹ôX]Hõ›ÀŸ[X›Y\ôX€‹ôà]H€›\òŸK[ô[ûH\õZ\‹⁄[€ãYÿ]Yö[ò[ò⁄X[ô[ô\ö[ôÀÇãH[\ﬁYY\»›[ôYY»\õ›ôY[\ﬁYYH€›\òŸK[Ÿã]ù]]Z[›\ôòXŸ\»›X⁄à\»\‹⁄Y€õY[ùÀ‹ôY[ùX[Àÿ›[Y[ùÀ[ôX›]ö]KÇãHôZX€\»›[ôYY»\õ›ôY\‹⁄Y€õY[ùŸ\ùöXŸKÿ›[Y[ùÀ[ô\›‹ûBà€›\òŸ\ÀÇãH⁄[\»›[ôYY»ŸŸŸYZ[àù[ù[YHô\öYöXÿ][€àõ‹àò\úõ›À\ÿ‹ôY[à^[›]à€\⁄Yù\à\»ô\Ÿ[ù][€à\]KÇãH]ô[‹\à›[ôYY»úõ›‹Ÿ\ãX]][ùXÿ]Yö\›X[ô\öYöXÿ][€ãù]õ»ô]¬àòX⁄Ÿ[ô][]Y\»Ÿ\ôH[ùõŸXŸYÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHÿ⁄ŸYõ‹ùÿ]HRHô\Ÿ[ù][€Çàõ›[ô\öY\»[ôYõ›[\àõ›X›YòX⁄Ÿ[ôôZ]ö[‹ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYôYõ‹ôH€€[Z]‹\⁄H\»ô[XZ[ôY[ú⁄YHÿ⁄ŸYìõ‹ùÿ]HRHX⁄\⁄[€ú»
Tê“UP’TëHåãåÃSë—ëà[ùûHMÿ
H[ôYõ›ò‹õ‹‹»òX⁄Ÿ[ô‹à\ò⁄]X›\ôK\Ÿ[ú⁄]]ôHõ›[ô\öY\ÀÇÇà»»[ùûHMHHôYö[ôH\⁄õÿ\ô[ùô[ù‹ûH[ôõÿú»RBÇääë]NääàåçãLÀLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HRHﬁ\›[H\ŸH¬ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\]Y\›YHõÿ›\ŸYRHôYö[ô[Y[ù\‹»€à‹Ÿà[ùûHM»XZŸHBë\⁄õÿ\ôôZ]ôHZŸHH\ú€€ò[€‹ö»Ÿ[ù\ãô[[›ôH[ùô[ù‹ûKZX]ûH›[[X\ûBúô\Ÿ[ù][€àúõ€H\⁄õÿ\ô[ô[ùô[ù‹ûK[ôY⁄[àHõÿú»Ÿ[X›Y\ôX€‹ôùXàô\Ÿ[ù][€à⁄]›]⁄[ô⁄[ô»òX⁄Ÿ[ôôZ]ö[‹à‹à]]‹ö^ò][€àù[\ÀÇÇï\»ô[XZ[ôYHúõ€ùY[ôô\Ÿ[ù][€ã€^[›]\‹»€õKàõ»òX⁄Ÿ[ôÿ⁄[XKú\õZ\‹⁄[€ãîÀ]][ùXÿ][€ãYŸ\ã]Y]ö[ò[ò⁄X[[ùô[ù‹ûH‹ö]K‹Çòù\⁄[ô\‹À\ù[H⁄[ôŸ\»Ÿ\ôH]]‹ö^ôYÇÇà»»»›\ù[ô»⁄[ùãH›\ù[ô»€€[Z]ÇàÿŒYMXéLÕôMŸåçÕÕåLMÕMòLÿMòÕÿãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃãHô]ö[›\»Së—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMãHŸX›[€àLô[XZ[ôYô\Ÿ[ù[ô]]‹ö]]]ôBãHŸX›[€àòô[XZ[ôYô\Ÿ[ù[ô]]‹ö]]]ôBãHXZ[òX]⁄Y‹öY⁄[ã€XZ[òôYõ‹ôHY]»[ô⁄][KYôã[€õH‹öY⁄[àXZ[òàô\‹ùY[ôXYH\»]KòÇà»»»⁄]ÿ\»XY€õ‹ŸYãH€€ôö\õYYH[ùûHM\⁄õÿ\ô›[ôZ]ôYZŸHH[Ÿ[H›ô\ùöY]»⁄]à[ùô[ù‹ûK[‹öY[ùYY]öX‹»[ô]ZX⁄»[ö‹»[ú›XYŸàH\ú€€ò[€‹öÀXŸ[ù\Çà⁄[ÇãH€€ôö\õYYH[ùô[ù‹ûH€‹ö‹‹XŸH›[ô[ô\ôYH\ôŸH‹à[ùô[ù‹ûH€€[X[ôŸ[ù\ò›[[X\ûHôY⁄[€à\»HöY⁄\⁄YH€€ù^òZ[]àûX[à^X⁄]Hÿ[ùYô[[›ôYÇãH€€ôö\õYYH[ùô[ù‹ûHYù[Ÿ[K\ŸX›[€ú»òZ[ôYYYH›õ€ôŸ\à›X⁄ﬁH
¬àÿ‹õ€€€ùZ[ô\àôX]Y[ù€»€ô»ŸX›[€à\›»€›[ô[XZ[à\ÿXõKÇãH€€ôö\õYYHõÿú»Ÿ[X›Y\ôX€‹ôXà›ö\ÿ\»›[€»€‹ŸH]€€[[€Çà\⁄›‹⁄Y»[ô€›[ÿ]\ŸHXú»»‹ò\‹àôY[‹õ›ŸYÇãH€€ôö\õYYHô\‹⁄]‹ûH^‹Ÿ\»\›[X]H\õZ\‹⁄[€ú»ù]Ÿ\»õ›^‹ŸH[Çà\õ›ôYõÿã]ÀQ\›[X]Hô[][€ú⁄\‹àHõŸX›[€à\›[X]HôXY][ÇàH›\úô[ùRH^Y\ãÇãH€€ôö\õYYH›\úô[ùõÿú»ôXY[Ÿ[Ÿ\»õ›^‹ŸH€‹öŸ\ãà›\\ö[ù[ô[ù‹àõ⁄ôX›[X[òYŸ\à\‹⁄Y€õY[ùöY[»]€›[ÿYô[H›Ÿ\ÇàH\ú€€ò[^ôY^H€‹öÿ\⁄õÿ\ôŸX›[€ãÇãH€€ôö\õYYH›\úô[ùôZX€HôYô\ô[òŸH€›\òŸHŸ\»õ›^‹ŸH\ôX›à\Ÿ\ãX\‹⁄Y€õY[ù‹àô\‹ù[ô»ô[][€ú⁄\»]€›[ÿYô[H›Ÿ\Çà\ú€€ò[^ôY^HôZX€\ÿöY]‹ÀÇãH€€ôö\õYYH›\úô[ù€€ÿ][Ÿ›YH^‹Ÿ\»€€\[ûH€€õ›‹»ù]Ÿ\»õ›àõ›öYH[à\õ›ôY\Ÿ\ã[[öŸY\ú€€ò[]€€»]H[Ÿ[õ‹à\⁄õÿ\ô\ŸKÇãH€€ôö\õYY[ö]ô\úÿ[õÿàö\⁄Xö[]H»]]‹ö^ò][€àù[\»Ÿ\ôHYù[ù›X⁄Yà[à\»\‹ÀÇÇà»»»⁄]ÿ\»€€\]YãHôXùZ[\⁄õÿ\ô\»H\ú€€ò[€‹öÀXŸ[ù\à^[›]⁄]HYùòZ[àŸX›[€úŒÇàH^H[ôõÿàH^H€‹öÿàH^HôZX€\ÿàH^H€€ÿàH^H\›[X]\ÿ€õH⁄[à\›[X]H\õZ\‹⁄[€ú»\BàH^HôYô\ô[òŸ\ÿãHô[[›ôY[ùô[ù‹ûK\‹X⁄YöX»€›[ùÀ€€[X[ôXŸ[ù\à›[[X\öY\À]ZX⁄À[[ö¬à][ò⁄ÿ\ôÀ[ôHöY⁄€€ù^òZ[úõ€H\⁄õÿ\ôÇãHõ›[ô^H[ôõÿ€õH»\õ›ôY›\úô[ù]\Ÿ\à»\õZ\‹⁄[€à€€ù^[ôXYBà]òZ[XõH[àH\Xÿ][€éÇàH]][ùXÿ]Yò[YBàH[XZ[àH€ôH⁄[àô\Ÿ[ùàHõ€BàH]ö\⁄[€ÇãHŸ\^H€‹öÿ^HôZX€\ÿ^H€€ÿ^H\›[X]\ÿ[ôà^HôYô\ô[òŸ\ÿ€ô\›ûHô[ô\ö[ô»^X⁄]Yô\úôY›]\»⁄\ôH\õ›ôYà]ôH€›\òŸ\»»õ›Y]^\›ÇãHYY\ôX›[Ÿ[H][ò⁄X›[€ú»úõ€HYô\úôY\⁄õÿ\ô›]\»€õH⁄\ôBàHù[[Ÿ[H[ôXYH^\›ŒÇàHõÿúÿàHôZX€\ÿàH€€ÿàH\›[X]\ÿãH⁄[\YöYY[ùô[ù‹ûHûHô[[›ö[ôŒÇàHH‹[ùô[ù‹ûH€€[X[ôŸ[ù\òXY\àõÿ⁄¬àH€€ò\àY]H⁄\¬àH€›[ù\›[[X\ûHÿ\ô¬àHHöY⁄[ùô[ù‹ûH€€ù^òZ[ãHŸ\H[ùô[ù‹ûH[Ÿ[H€€ù[ù^\›[ô»ò]öYÿ][€ãôXY[Ÿ[[ôà⁄[\»[ùûHôZ]ö[‹à[ùX›⁄[H[›ö[ô»HX›]ôHŸX›[€àXY\à[ù»BàXZ[à€‹ö‹‹XŸH›\ôòXŸKÇãHYYH\ôX›[ùô[ù‹ûHôYúô\⁄X›[€à]HX›]ôHŸX›[€àXY\ãÇãHY⁄[ôY⁄YXò\à^[›]‘‘»€»Hö[X\ûH[Ÿ[K\ŸX›[€ú»òZ[ô[XZ[ú¬à›X⁄ﬁH[ô[ô\[ô[ùHÿ‹õ€XõH€à\⁄›‹⁄[Hò[[ô»òX⁄»€X[õH€Çà[ÿö[KÇãH€€\X›YHõÿú»Ÿ[X›Y\ôX€‹ôXà›ö\€»[ZY⁄Xú»ö][‹ôBàô[XXõH]›[ô\ô\⁄›‹⁄YÀÇãHYY[à€ô\›\ÿXõYŸ[X›YZõÿà\›[X]HX›[€à€õHõ‹à\Ÿ\ú»⁄»ÿ[Çà\›[X]H‹à\õ›ôH\›[X]\À^X⁄]H[ôXÿ][ô»]õ»\õ›ôYàõÿã]ÀQ\›[X]Hô[][€ú⁄\^\›»Y]ÇÇà»»»õ›]\»»ÿÿ[RH›]HYôôX›YãHô\Ÿ\ùôYH^\›[ô»‹[]ô[€‹ö‹‹XŸX]Y\ûK\›ö[ô»õ›][ô»[Ÿ[ÇãHô\Ÿ\ùôY^\›[ô»õÿú»õ›][ô»»Ÿ[X›[€àôZ]ö[‹à[ôYõ›[\Çà]]‹ö^ò][€àÿ]\ÀÇãHôYXŸY\⁄õÿ\ô\[ô[òﬁH€àH⁄\ôY[ùô[ù‹ûHôXY[Ÿ[€»\⁄õÿ\ôàõ»€ôŸ\àÿY»[ùô[ù‹ûH›[[X\ûH]Hù\›»ô[ô\à›ô\ùöY]»ÿ\ôÀÇãHYYõ»ô]»\ú⁄\›YôYô\ô[òŸ\Àõ»ÿÿ[›‹òYŸHôYô\ô[òŸH‹ö]\À[ôõ¬àô]»õ›]\ÀÇÇà»»»ö[\»⁄[ôŸYãHSë—ëãõYãH‹òÀ–\öúﬁãH‹òÀ‹›[\À€^[›]ò‹‹ÿÇà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ãHõ€ôKàÿ‹À–Tê“UP’TëKõYô[XZ[ôY]åãåÃ[ôÿ\»õ›Y]YÇãHö[‹àSë—ëà⁄X⁄‹⁄[ùô[XZ[ôY[ùûHM»\»[ùûH\[ô¬à[ùûHMX€õKÇÇà»»»ô\öYöXÿ][€ÇãH⁄]ô]⁄‹öY⁄[ò[ô⁄][KYôã[€õH‹öY⁄[àXZ[ò€€\]YôYõ‹ôHBàôYö[ô[Y[ù\‹Œ»ÿÿ[XZ[òÿ\»[ôXYH›\úô[ù⁄]‹öY⁄[ã€XZ[òÇãH⁄]›]\ÿ⁄]YôàK\›][ô⁄]YôòŸ\ôHô]öY]ŸY\ö[ô»Bà\‹ÀÇãH€Yÿ»úHù[àùZ[\‹ŸYÇãHõ»ô\‹⁄]‹ûH\›€€[X[ô^\›Yô^[€ôùZ[»õ»Y][€ò[]]€X]Yà\››Z]Hÿ\»]òZ[XõH»ù[à[à\»ô\‹⁄]‹ûKÇãH€€ôö\õYY⁄[ôŸYö[\»›^YY[àHRK‹ô\Ÿ[ù][€à^Y\à\»\¬àSë—ëà\[ôÇãH€€ôö\õYYõ»ÿ⁄[XKZY‹ò][€ãîÀìÀ]]\õZ\‹⁄[€ãYŸ\ã]Y]àö[ò[ò⁄X[‹àù\⁄[ô\‹À\ù[Hö[\»Ÿ\ôHY]Y[à\»\‹ÀÇãH€€ôö\õYYõ»[ùô[ù‹ûH‹ö]Hõ›Àÿ\ùôZ]ö[‹ã€›[ùôZ]ö[‹ã‹Çàò[úÿX›[€àôZ]ö[‹àÿ\»[ù[ù[€ò[H⁄[ôŸY[à\»\‹ÀÇãH€€ôö\õYYõÿàö\⁄Xö[]H]]‹ö^ò][€àù[\»Ÿ\ôH[Xô\ò][Hõ›⁄[ôŸYÇãH€€ôö\õYYHõÿà\›[X]HX›[€à\»ô\Ÿ[ù][€ò[€õH[ôŸ\»õ›[ùô[ùà[à\›[X]Hô[][€ú⁄\ôXY]‹à‹ö]Hõ›ÀÇãHŸŸŸYZ[àúõ›‹Ÿ\àù[ù[YHô\öYöXÿ][€àÿ\»õ›€€\]Y[à\»Ÿ\‹⁄[€ãÇãHô\‹€ú⁄]ôH[ú‹X›[€à]€€[[€à⁄Y»ô[XZ[ú»[ô[ô»[àHúõ›‹Ÿ\àŸ\‹⁄[€ãà[›Y⁄H\]Y⁄YXò\à[ôXã\›ö\‘‘»€€\[Y›XÿŸ\‹Ÿù[KÇãHHö[ò[[\[Y[ù][€à€€[Z]\⁄ÿ\»õ›Y]€õ›ÿXõH]H[€Y[ù\¬à[ùûHÿ\»‹ö][é»]\»H€€[Z]][ùõŸXŸ\»[ùûHMH[ô\¬àô\‹ùY[àHŸ\‹⁄[€à›[[X\ûH»⁄]\›‹ûKÇÇà»»»ô[XZ[ö[ô»Yô\úôYù[ò›[€ò[]BãH^H€‹öÿ›[ôYY»[à\õ›ôY\‹⁄Y€õY[ù€›\òŸHõ‹à€‹öŸ\úÀà›\\ö[ù[ô[ùÀ[ôõ⁄ôX›X[òYŸ\ú»ôYõ‹ôH]ÿ[àô[ô\à\ú€€ò[^ôYõÿÇà\›ÀÇãH^HôZX€\ÿ›[ôYY»\õ›ôY\‹⁄Y€õY[ù[ôô\‹ù[ô»ô[][€ú⁄\¬àôYõ‹ôH]ÿ[àô[ô\à\ú€€ò[‹à\ôX›\ô\‹ùôZX€H\›ÀÇãH^H€€ÿ›[ôYY»[à\õ›ôY\ú€€ò[]€€»]H[Ÿ[ôYõ‹ôHBà\⁄õÿ\ôÿ[à\›[ô›Z\⁄\ú€€ò[€€»úõ€HHŸ[ô\ò[€€\[ûHÿ][Ÿ›YKÇãH^H\›[X]\ÿ›[ôYY»[à\õ›ôY\›[X]HôXY[Ÿ[\»[ûH\õ›ôYàõÿã]ÀQ\›[X]Hô[][€ú⁄\ôYõ‹ôH\⁄õÿ\ô‹àõÿãY]Z[\›[X]HöY]‹»ÿ[ÇàôX€€YH]ôKÇãH^HôYô\ô[òŸ\ÿ›[ôYY»[à\õ›ôY\ú⁄\›[òŸH›ò]YﬁHôYõ‹ôH]ÿ[Çà[›ôHô^[€ô^[›]ô\Ÿ\ùò][€à[ôYô\úôY›]\ÀÇãH]][ùXÿ]Yúõ›‹Ÿ\àô\öYöXÿ][€àô[XZ[ú»[ô[ô»õ‹àHôYö[ôY\⁄õÿ\ôà[ùô[ù‹ûK[ôõÿú»ô\Ÿ[ù][€à]\⁄›‹[ô[ÿö[HúôXZ‹⁄[ùÀÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHÿ⁄ŸYõ‹ùÿ]HRHô\Ÿ[ù][€Çàõ›[ô\öY\»[ôYõ›[\àõ›X›YòX⁄Ÿ[ôôZ]ö[‹ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYôYõ‹ôH€€[Z]‹\⁄õ‹à\»\‹»ôXÿ]\ŸH]ô[XZ[ôYö[ú⁄YHÿ⁄ŸYRHô\Ÿ[ù][€àÿ€‹Kà€]YHô]öY]»\»›[ô\]Z\ôYôYõ‹ôH[ûBôù]\ôH⁄[ôŸH»[ö]ô\úÿ[õÿàö\⁄Xö[]H‹à]]‹ö^ò][€àôZ]ö[‹ãÇÇà»»[ùûHMàHë—ÀTH[ùY‹ò][€éà\ò⁄]X›\ôHô]öY]»€€\]KX⁄\⁄[€ú»ÿ\\ôYÿ⁄»[ô[ô»‹õ‹‹ÀP€X\ò[òŸBÇääë]NääàåçãLLÇääï\]YûNääà€]YBääî\ŸNääà\ò⁄]X›\ôHô]öY]»
ôK[ÿ⁄ BääîŸ\‹⁄[€à\NääàX⁄\⁄[€àÿ\\ôH»ô]öY]»0Ë∏†´8†'Hì»\ò⁄]X›\ôH⁄[ôŸHXYBÇà»»»€€ù^ÇîûX[à\ôX›YHô]öY]»Ÿà\⁄[ô»H›[ô[€ôHë—ÀTH\äìî€€][€úÀY[X›öXÿ[”ë—ÀTX\ﬁYY]òõú€€][€úÀY[X›öXÿ[ô⁄]Xãö[À”ë—ÀTKÿ
H\»Hò\⁄\»õ‹àHŸ[X›YRõÿÇù€‹ö‹‹XŸH[ú⁄YHõ‹ùÿ]HKà€]YH[ú‹X›YHë—ÀTH€›\òŸH\ôX›Bä[ô^ö[LÀŒHû]\À⁄[ô€Hö[Kõ»^\õò[ÿ‹ö\ H[€ô‹⁄YHBôù[Tê“UP’TëHåãåÃ[ôSë—ëàõ›Y⁄[ùûHMKÇÇïH€€\]Hô]öY]»\»ÿ\\ôY[Çòë—ÀTW“[ùY‹ò][€ó–\ò⁄]X›\ôW‘ô]öY]ÀõY
[]ô\ôY»ûX[à\»Ÿ\‹⁄[€äKÇÇääï\»[ùûHôX€‹ô»X⁄\⁄[€ú»€õKàõ»Tê“UP’TëKõY⁄[ôŸH\»ôY[àXYBò[ôõ€ôH\»]]‹ö^ôYY]ääà[ÿ⁄[XKXYôôX›[ô»X⁄\⁄[€ú»ô[›»\ôH[ô[ô¬îù[Hå‹õ‹‹ÀX€X\ò[òŸKÇÇà»»»ö[ô[ô‹»0Ë∏†´8†'Hõ›\à€€ôõX›»⁄]ÿ⁄ŸY\ò⁄]X›\ôBÇåKà
äì][KY]ö\⁄[€àõ⁄ôX›»
›ùX›\ò[
Kääàë—ÀTHõ⁄ôX›»‹[à[X›öXÿ[à[ô€€ú›ùX›[€à⁄[][[ô[›\€H0Ë∏†´8†'HùYŸ][ô\Àÿ⁄Y[H\⁄‹À\õZ]Àà[ô⁄X⁄€\›»XX⁄ÿ\úûHZ\à›€à]ö\⁄[€à[ú⁄YH€ôHõ⁄ôX›àõ‹ùÿ]BàõÿúÀô]ö\⁄[€ò\»⁄[ô€K]ò[YYì’ïS[ô\»Hì»XÿŸ\‹»ÿ]Bà
0‡∞©ÃŒåK0‡∞©ÃŒç
KàH⁄[ô€Hë—ÀTHõ⁄ôX›ÿ[õõ›ôHô\ô\Ÿ[ùY\»€ôBàõ‹ùÿ]Hõÿà[ô\à›\úô[ù\ò⁄]X›\ôKÇåãà
äêùYŸ]€€[[úÀääàë—ÀTH›‹ô\»X›X[»€€[Z]Y»õ‹ôXÿ\›à0‡∞©ÕåÇà^X⁄]H^€Y\»X›X[ÿ[[›[ù[ô€€[Z]Yÿ[[›[ù»0‡∞©ÕéHô\Ÿ\ùô\¬àX›X[[ô€€[Z]Y€‹›ÇåÀà
äîÿ⁄Y[H\[ô[ò⁄Y\Àääàë—ÀTH\»ôYXŸ\‹€‹ãYÀ\ò][€ã€€\]Yà]\À[ôÿ[ùà0‡∞©ÕÀåÿ⁄‹»ÿ⁄Y[HåH\»ôõ]Z[\›€ôK›\⁄»\›à€õpË∏†´0©àŸ\»õ›[Ÿ[\[ô[ò⁄Y\»é»0‡∞©ÕÀçH^X⁄]Hô\Ÿ\ùô\»\[ô[ò⁄Y\ÀÇçà
äìõ»›€ô\à^\› äàõ‹àH⁄X⁄€\›\õZ]À‹à[ú‹X›[€úÀÇÇà»»»YôX›»Y[ùYöYY[àë—ÀTH
]\›õ›ôH‹ùY
BÇãH
äê⁄X⁄€\›€€\][€à\»‹⁄][€ò[HŸ^YY
äà
\ŸR[ô^›\⁄“[ô^àYÿZ[ú›H[\]H\ô€ŸY[à€›\òŸJKà[úŸ\ù[ô»€ôH][H⁄[[ùBàôK[X\»]ô\ûH›XúŸ\]Y[ù€€\][€à»H‹õ€ô»\⁄ÀÇãH
äíî””à[\‹ù\»Hõ[ô⁄€K\›]H›ô\ù‹ö]Jäà0Ë∏†´8†'Hõ»ò[Y][€ãõ¬àô\ú⁄[€à⁄X⁄Àõ»Yôãõ»€€ôö\õX][€ãÇãH
äê€Y[ù\⁄YHSàÿ]Jäà
ô\]Y\›[ä
X
H›X\ô»Y][ŸKà[ò€€\]XõBà⁄]0‡∞©ÃM…‹»Ÿ\ùô\ãX]]‹ö]]]ôHù[N»]\›õ››\ùö]ôH[à[ûHõ‹õKÇãHÿ⁄Y[H\⁄»Q»\ôHŸ\]Y[ùX[[ùYŸ\ú»ôYô\ô[òŸY\»úôYH^ûBàôYXŸ\‹€‹ò»ZY‹ò][€à»URQô\]Z\ô\»H›XõH\‹^HŸ\]Y[òŸKÇÇà»»»ûX[â‹»X⁄\⁄[€ú»
MàŸàMã[ÿ\\ôY
BÇääê]]‹ö^ò][€à[Ÿ[ääÇåKà[ûH]][ùXÿ]Y\Ÿ\àX^H‹[à[ûHõÿà[ôŸYHò\⁄X»‹\ò][€ò[à[ôõ‹õX][€ãàö[ò[ò⁄X[ò[Y\»ô[XZ[àÿ]Yà
ä\»€€\Ÿ\»Bà][KY]ö\⁄[€à€€ôõX›0Ë∏†´8†'HHõÿàXY\à›‹»ôZ[ô»H]ö\⁄[€àXÿŸ\‹¬àÿ]KäJÇåãà\õZ\‹⁄[€à⁄X⁄‹»\ôH⁄\ôY[àúõ€H^H€ôK⁄]õY‹»‹ò[ùYúõÿYHöXBà\Ÿ\ó‹\õZ\‹⁄[€ó€›ô\úöY\ÿ
0‡∞©ÃMÿäH[ö]X[KàY⁄[ö[ô»]\à\»H]Bà⁄[ôŸKõ›H€ŸH⁄[ôŸKà
äëYô\úö[ô»H⁄X⁄‹»[\Ÿ[ô\»ÿ\¬à^X⁄]HôZôX›YääÇåÀàö[ò[ò⁄X[]Y\öY\»\ôH]ö\⁄[€ã\ÿ€‹Y
äò]H]Y\ûH^Y\ääàúõ€HBà›\ù0Ë∏†´8†'Hõ›ô]⁄YúõÿYH[ôö[\ôY€Y[ù\⁄YKÇÇääêùYŸ]
€€ôõX›äNääÇçàYùYŸ]ÿ⁄[ôŸ\ÿX›X[ÿ[[›[ù€€[Z]Yÿ[[›[ùàõ‹ôXÿ\››◊ÿ€€\]X\»
äõX[ùX[H[õö[ô»[ú] äã^X⁄]BàXô[Yõ€ãXXÿ€›[ù[ôÀà]]ÀY\ö]ò][€àúõ€HHYŸ\àÿ\»ôZôX›Y\¬àX]\öX[H[ò€€\]H
X]\öX[€õH0Ë∏†´8†'Hõ»Xõ‹ãõ»›Xú KÇçKàùYŸ]ÿ]Y€‹ûHô[XZ[ú»ô\]Z\ôY
0‡∞©Õå»“P“»€€ú›òZ[ù[ò⁄[ôŸY
KÇçãà›[[X\ûHÿ\ô›[»⁄›»HöY]Ÿ\â‹»›€à]ö\⁄[€ãÇÇääîÿ⁄Y[H
€€ôõX› NääÇçÀàY\ò][€òôYXŸ\‹€‹òYÿòYX\»€€\]Y]\»[ôàÿ[ùÇéàõ‹ùÿ]I‹»^\›[ô»›]\»õÿÿXù[\ûH\»ô]Z[ôYà
[ô[ôÿÿ[ó‹õŸ‹ô\‹ÿÿ€€\]Xÿ[^YY
N»ë—ÀTI‹»õ›\àX\€ù»]ÇÇääê⁄X⁄€\›
€€ôõX›
NääÇéKàX\›\à[\]HY][ô»\»]ô[‹\ã[€õKÇåLà\»X^HYõÿã\‹X⁄YöX»][\»€à‹ŸàH[\]KÇÇääî›ùX›\ôNääÇåLKà\õZ]»	à[ú‹X›[€ú»Ÿ]Z\à›€àXãÇåLãàõÿúÿÿZ[ú»W›\Ÿ\ó⁄Y›\\ö[ù[ô[ù›\Ÿ\ó⁄Yõ‹ô[X[ó›\Ÿ\ó⁄Yà
€\ö»V\à0‡∞©ÃMÿàY[ù]H[Ÿ[
H[ôÿ◊ÿ€€\[ûXÇåLÀà^‹ùàõÿà[ôõÀ€€ùX›À\õZ]À[ú‹X›[€úÀÿ⁄Y[K⁄X⁄€\›àÿ›[Y[ùY]Y]H
ò[Y\»€õJKàùYŸ]€õH⁄]ÿ[ó›öY]◊Ÿö[ò[ò⁄X[ÿÇà
äìõ»X]\öX[Àù^[›]‹àò[úÿX›[€à]Jäà0Ë∏†´8†'HYŸ\ãXYòXŸ[ù]H]\›àõ›ôH\Xÿ]Y[ù»H‹ùXõHö[KÇåMà
äìõ»î””à[\‹ù[à\»[ùY‹ò][€ãääà^‹ù€õKÇåMKà€Ÿ^\ŸHH\»HôXY[€õHö\›X[‹ùÇåMãà^\›[ô»õÿú»€‹ö‹‹XŸHô]Z[ôYôZ[ôHôX]\ôHõY»[ù[\ö]H\¬à€€ôö\õYYÇÇääìò]öYÿ][€éääà‹[€àà^[ôY0Ë∏†´8†'Hõ‹ùÿ]I‹»ZY⁄ÿ⁄ŸYXú»ô[XZ[Çòÿ[õ€öXÿ[
0‡∞©Õà[ò⁄[ôŸY
K\»H⁄X⁄€\›[ô\õZ]»	à[ú‹X›[€úÀÇìë—ÀTI‹»õ›\ã]Xà›ùX›\ôH\»Xú€‹òôYõ›Y‹Y»\»]õ⁄Y»BêùYŸ]À—ö[ò[ò⁄X[»[ôÿ⁄Y[\À‘ÿ⁄Y[H\Xÿ][€ãÇÇà»»»[ùX⁄\]YTê“UP’TëH⁄[ôŸ\»
ì’QUTQQ
BÇî[ô[ô»‹õ‹‹ÀX€X\ò[òŸKHÿ⁄»\»^X›Y»ô\]Z\ôNÇÇãH0‡∞©ÃŒ[H0Ë∏†´8†'Hõÿà\‹⁄Y€õY[ù€€[[úÀÿ◊ÿ€€\[ûX[ôH⁄[ôŸYYX[ö[ô»ŸÇàõÿúÀô]ö\⁄[€ò
Xô[ò]\à[àXÿŸ\‹»ÿ]JBãH0‡∞©Õ[H0Ë∏†´8†'HHõ›\àX[ùX[ùYŸ]€€[[ú¬ãH0‡∞©Õ»[H0Ë∏†´8†'HHõ›\àÿ⁄Y[H€€[[ú»
»€€\]Y]\¬ãHô]»ŸX›[€ú»0Ë∏†´8†'HH⁄X⁄€\›
[\]\»
»[ú›[òŸ\ Kõÿà\õZ]»	Çà[ú‹X›[€úÀõÿà€€ùX›Àî””à^‹ùãH0‡∞©Õàõ›H0Ë∏†´8†'H€»YYXú¬ãH0‡∞©ÕLõ›H0Ë∏†´8†'HH€‹ö‹‹XŸHö\›X[[ùY‹ò][€ÇãHô]»Xõ\»0Ë∏†´8†'Hõÿóÿ€€ùX›ÿõÿó‹\õZ]ÿõÿó⁄[ú‹X›[€úÿà⁄X⁄€\››[\]\ÿ⁄X⁄€\››[\]W⁄][\ÿõÿóÿ⁄X⁄€\›⁄][\ÿãH
äìõ»ô]»\õZ\‹⁄[€àõY‹Àääà]ô\û][ô»X\»»^\›[ô»ÿ[ó€X[òYŸW⁄õÿúÿàÿ[óÿ\õ›ôWÿùYŸ]ÿ[ó›öY]◊Ÿö[ò[ò⁄X[ÿÿ[ó›öY]◊ÿ[Ÿ]ö\⁄[€úÿÇÇà»»»⁄]€Ÿ^\»]]‹ö^ôY»»ì’¬Çääî\ŸHH€õH0Ë∏†´8†'HôXY[€õHö\›X[‹ùääà\»ô\]Z\ô\»õ»\ò⁄]X›\ôH⁄[ôŸBò[ôX^HõÿŸYY[à\ò[[⁄]‹õ‹‹ÀX€X\ò[òŸNÇÇãHùZ[ë—ÀTI‹»ÿ‹ôY[ú»\»ôXX›€€\€ô[ù»[ú⁄YHH^\›[ô»õ‹ùÿ]Bà⁄[ô\›[Y»õ‹ùÿ]HôY›⁄]KŸ‹ò^BãHö[ôôXY[€õH»]H][ôXYH^\›Œ»ô[ô\à[õÿ⁄ŸY€€[[ú»\¬àö\⁄XõH\ÿXõYXŸZ€\úÀô]ô\àòXúöXÿ]Yò[Y\¬ãHô]\ŸH^\›[ô»⁄[€€\€ô[ùŒ»õ»ŸX€€ô\⁄Y€àﬁ\›[BãHô\‹€ú⁄]ôHúõ€H\»\‹»
€€ú›]][€ò[ù[HN
BãHõ›]HôZ[ôHôX]\ôHõYÀ]ô[‹\ã[€õN»^\›[ô»õÿú»€‹ö‹‹XŸH›^\¬àYò][[ô[ù›X⁄YÇääê€Ÿ^]\›ì’[à\ŸHNääà‹ôX]H‹à[\à[ûHXõK€€[[ãZY‹ò][€ãîì»€XﬁK‹àîŒ»Y‹à[ŸYûH[ûH\õZ\‹⁄[€àõY»‹à⁄X⁄Œ»‹ö]H»[ûBùXõN»[ŸYûHH^\›[ô»õÿú»€‹ö‹‹XŸN»‹ùHSàÿ]Kÿÿ[›‹òYŸBú\ú⁄\›[òŸKS\ÿ]ôK\ö»[YK[ÿö[K\ô]öY]»ŸŸ€K‹àî””à[\‹ùÇÇà»»»ô^›\»
[à‹ô\äBÇåKà⁄]‘ù[Hå‹õ‹‹ÀX€X\ò[òŸH€àH\ôX›[€àXõ›ôBåãà€]YH€‹úôX›»\àö[ô[ô‹¬åÀà€]YH‹ö]\»HTê“UP’TëHÿ⁄»
^X›YåãåÃJH[ôHô^Së—ëÇà[ùûBçà€Ÿ^\ŸHH
ôXY[€õHö\›X[‹ù
H0Ë∏†´8†'HX^Hù[à[à\ò[[⁄]pË∏†´8†'¬çKà€Ÿ^\Ÿ\»ä»
ÿ⁄[XH[\ H0Ë∏†´8†'Hõÿ⁄ŸY[ù[Hÿ⁄»^\›¬Çà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬Çê‹õ‹‹ÀX€X\ò[òŸH⁄›[‹X⁄YöXÿ[H^[Z[ôNà⁄]\àõÿúÀô]ö\⁄[€ò⁄[ô⁄[ô¬ôúõ€HXÿŸ\‹»ÿ]H»Xô[‹ôX]\»õÿõ[\»[à[ûHÿ⁄ŸYŸX›[€é»⁄]\Çù[ö]ô\úÿ[õÿàö\⁄Xö[]H€€ôõX›»⁄]0‡∞©ÃMÿI‹»]ö\⁄[€ã\ÿ€‹[ô»ö[ò⁄\H\¬ò\YY[Ÿ]⁄\ôN»⁄]\àX[ùX[ùYŸ]X›X[»‹ôX]HH€€\][ô»€›\òŸHŸÇùù]YÿZ[ú›0‡∞©ÃÕÀ‡∞©Õ»YŸ\àù[\Œ»⁄]\àHô]»Xõ\…»€ŸùX\ò⁄]ôHì¬úô\]Z\ô\»H[ùöY\»Lç0Ë∏†´8†'LçH€À\€XﬁH]\õé»[ô⁄]\à[ûHŸà\¬úô\]Z\ô\»H\õZ\‹⁄[€àõY»õ›[ôXYHÿ[õ€öXÿ[ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬Çìõ€ôHX›]ôKàõ»\ò⁄]X›\ôH⁄[ôŸHÿ\»XYH[à\»Ÿ\‹⁄[€ãÇÇãKKBÇà»»õ›][ô»ô\ôX›Çääê⁄]‘ù[Hå‹õ‹‹ÀX€X\ò[òŸHô\]Z\ôYôYõ‹ôH[ûHTê“UP’TëKõYY]ääÇëX⁄\⁄[€ú»\ôHÿ\\ôY[ô[ù\õò[H€€ú⁄\›[ùù]]ô\ûHÿ⁄[XKXYôôX›[ô¬ö][HXõ›ôH\»[ô[ô»ô]öY]ÀÇÇääëõ‹à€Ÿ^ääà\ŸHH
ôXY[€õHö\›X[‹ù
H\»]]‹ö^ôYõ›»[ôô\]Z\ô\¬õõ»ÿ⁄Àà[ÿ⁄[XH€‹ö»\»õÿ⁄ŸY[ù[HTê“UP’TëHÿ⁄»\»‹ö][à[ôò‹õ‹‹ÀX€X\ôYÇÇääëõ‹à€]YNääà‹ö]HHTê“UP’TëHÿ⁄»€õHYù\à‹õ‹‹ÀX€X\ò[òŸHö[ô[ô‹¬ò\ôHô]\õôY[ô€‹úôX›YÇÇà»»[ùûHM»HYôXY[€õHë—ÀTHõÿú»ô]öY]¬Çääë]NääàåçãLL¬ääï\]YûNääà€Ÿ^ääî\ŸNääàë—ÀTH[ùY‹ò][€à\ŸHBääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\]Y\›Y\ŸHHŸàHë—ÀTH[ùY‹ò][€à[ù»õ‹ùÿ]HHåà[ôúõ›öYYHZ\‹⁄[ô»[ùûHMàSë—ëà\ùYòX›àôYõ‹ôH[\[Y[ù][€ã€Ÿ^ò€€ôö\õYYH›€õÿYYSë—ëàX]⁄YHô\‹⁄]‹ûHõ›Y⁄[ùûHMH[ôò\[ôY[ùûHMà^X›H\»Hô\]Z\ôY]]‹ö^ò][€àò\Ÿ[[ôKà[ùûHMàÿ\¬ù[à€€[Z]Y[ô\⁄Y\»Hÿ›[Y[ù][€ã[€õH⁄X⁄‹⁄[ùôYõ‹ôH\Xÿ][€Çù€‹ö»ôYÿ[ãÇÇî›\ù[ô»€€[Z]õ‹àH[\[Y[ù][€à\‹ŒÇòåÿçåX
ÿ›[Y[ùë—ÀTH[ùY‹ò][€à\ò⁄]X›\ôHô]öY]ÿ
KÇÇîö[‹à\Xÿ][€ãX€ŸH⁄X⁄‹⁄[ùô[XZ[ôYÇòÕXÕL
ôYö[ôH\⁄õÿ\ô[ùô[ù‹ûH[ôõÿú»RX
KÇÇê\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇîö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMòÇë[ùûHMàÿ\»\⁄Xÿ[Hô\Ÿ[ù[àHô\‹⁄]‹ûHôYõ‹ôH[\[Y[ù][€à[ôô^X⁄]H]]‹ö^ôY\ŸHH€õNàHôXY[€õHö\›X[‹ù]ô[‹\ã[€õKôôX]\ôKYõYŸŸY⁄]õ»ÿ⁄[XK\ú⁄\›[òŸK\õZ\‹⁄[€ãìÀîÀòX⁄Ÿ[ô‹Çù‹ö]K\]⁄[ôŸ\ÀÇÇïH€€\]Hë—ÀTH€›\òŸH[ú‹X›Yõ‹à\»\‹»ÿ\»H›[ô[€ôBòìî€€][€úÀY[X›öXÿ[”ë—ÀTK⁄[ô^ö[›€õÿYYúõ€H⁄]Xàò]»€›\òŸKÇòë—ÀTW“[ùY‹ò][€ó–\ò⁄]X›\ôW‘ô]öY]ÀõYÿ\»ŸX\ò⁄Yõ‹à[àHô\‹⁄]‹ûBò[ôÿ\»XúŸ[ùÇÇà»»»⁄]ÿ\»€€\]YãHYY€›\òŸKX€€ùõ€YôX]\ôHõYŒÇàSêPìW”ë—◊‘W‘ëPQ””ìW‘ëUíQUÿÇãHYYH]ô[‹\ã[€õHŸ[X›YZõÿà][ò⁄X›[€éÇàH€‹ö‹‹XŸHô]öY]ÿÇãHŸ\H^\›[ô»Ÿ[X›YRõÿà€‹ö‹‹XŸH\»HYò][^\öY[òŸKÇãHYYHôXY[€õHK\ô]öY]ÿõÿú»€‹ö‹‹XŸH[ŸHŸ\\ò]Húõ€NÇàH[õÿú»úõ›‹ŸH[ŸBàH‹ôX]Hõÿà[ŸBàHH^\›[ô»Ÿ[X›YRõÿà]Z[Xú¬ãHYY€X\àòX⁄»]»úõ€HHô]öY]»ŒÇàH›\úô[ùõÿà€‹ö‹‹XŸBàH[õÿú¬ãHùZ[HHô]öY]»ŸX›[€úŒÇàH›ô\ùöY]¬àHùYŸ]¬àHÿ⁄Y[\¬àHH⁄X⁄€\›àH\õZ]»	à[ú‹X›[€ú¬ãHô]\ŸYH^\›[ô»õ‹ùÿ]H⁄[ôX€‹ôXY\ò›]T[ô[à›[[X\ûPÿ\ô[ô€‹ö‹‹XŸUXúÿÇãHŸ\Hõ‹ùÿ]HôY»⁄]H»‹ò^Hö\›X[Y[ù]H[ôYõ›‹ùBà›[ô[€ôHë—ÀTHõYK€ò]ûH[YKÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ìõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ–\öúﬁãH‹òÀ‹›[\À€^[›]ò‹‹ÿãHSë—ëãõYÇà»»»ÿ⁄»ÿ›[Y[ù⁄[ôŸ\¬ìõ€ôKàÿ‹À–Tê“UP’TëKõYô[XZ[ú»åãåÃ[ôÿ\»õ›Y]YÇÇà»»»⁄]ÿ\»[\[Y[ùYãH›ô\ùöY]»ö[ô»€õH»^\›[ô»Ÿ[X›YõÿàöY[ŒÇàHõÿàù[Xô\ÇàHõÿàò[YBàHYô\‹¬àH›]\¬àH]ö\⁄[€ÇàH\ÿ‹ö\[€ÇàHõ›\¬ãHŸ[ô\ò[€€ùòX›‹à»€Y[ùõ⁄ôX›X[òYŸ\ã›\\ö[ù[ô[ù€€ùX›Àà\õZ]À[ô[ú‹X›[€ú»ô[ô\à\»€ô\›õ›^Y]X€€õôX›Y›]\ÀÇãHùYŸ]ô]öY]»\Ÿ\»^\›[ô»]]‹ö^ôYõÿóÿùYŸ]€[ô\ÿõ›‹»€õKÇãHùYŸ]€€[[ú»ô[ô\à[àHô\]Y\›Yë—ÀTH‹ô\éÇà]ö\⁄[€ã€‹›€ŸK\ÿ‹ö\[€ã‹öY⁄[ò[ùYŸ]⁄[ôŸ\Àô]ö\ŸYX›X[à€€[Z]Yõ‹ôXÿ\›»€€\]Kõ‹ôXÿ\›ö[ò[ô[XZ[ö[ôÀõ›\ÀÇãH^\›[ô»]òZ[XõHùYŸ]ò[Y\»ö[ôúõ€H›\úô[ùõ›‹ŒÇàH]ö\⁄[€ÇàH€‹›ÿ€ŸBàH\ÿ‹ö\[€ÇàHùYŸ]ÿ[[›[ù\»‹öY⁄[ò[àHõ›H\»õ›\¬ãH[ò]òZ[XõHùYŸ]öY[»ô[ô\à\»\ÿXõYXŸZ€\àŸ[Àõ›ô\õŒÇàHùYŸ]⁄[ôŸ\¬àHX›X[àH€€[Z]YàHõ‹ôXÿ\›»€€\]BãHùYŸ]ÿ[›[][€à][]Y\»\›[ô›Z\⁄[ò]òZ[XõHò[Y\»úõ€HôX[ô\õ»[ôà€õHÿ[›[]H\ö]ôYò[Y\»⁄[à]ô\ûHô\]Z\ôY[ú]\»]òZ[XõKÇãHÿ⁄Y[Hô]öY]»\Ÿ\»^\›[ô»õÿó‹ÿ⁄Y[W⁄][\ÿõ›‹»€õKÇãH^\›[ô»]òZ[XõHÿ⁄Y[Hò[Y\»ö[ôúõ€H›\úô[ùõ›‹ŒÇàH]K›\⁄¬àH]ö\⁄[€ÇàH›]\¬àH\ôŸ]Ÿ]H\»X[ùX[›\ùàH\ÿ‹ö\[€ã€õ›BãH[ò]òZ[XõHÿ⁄Y[HöY[»ô[ô\à\»\ÿXõYXŸZ€\àŸ[ŒÇàH\ò][€ÇàHôYXŸ\‹€‹ÇàHY¬àHòYBàH€€\]Yö[ö\⁄ãHÿ⁄Y[Hÿ[›[][€à][]Y\»›^H\ôH[ô»õ›òXúöXÿ]H\[ô[ò⁄Y\»‹Çà\ò][€àò\úÀÇãHÿ[ùô]öY]»ô[ô\ú»€õHôX[]Yÿ⁄Y[Hõ›‹»\»Z[\›€ôHX\öŸ\úÀÇà]Ÿ\»õ›òXúöXÿ]H\ò][€àò\úÀÇãHH⁄X⁄€\›ô[ô\ú»úõ€H[à\€€]Y[\‹ò\ûH€€ú›[ù€‹YY\»BàôXY[€õH\ŸHHô\Ÿ[ù][€à[\]KÇãHH⁄X⁄€\›€€ùõ€»\ôHôX[\ÿXõY⁄X⁄ÿõﬁ\Œ»õ»€€\][€à›]H\¬à›‹ôYÇãH\õZ]»[ô[ú‹X›[€ú»ô[ô\à[\HXõH›ùX›\ô\»⁄]€ô\›[\Bà›]\»[ôõ»Y‹ÿ]ôH€€ùõ€ÀÇãHYYô\‹€ú⁄]ôHÿYôY›X\ôŒÇàHZ[ã]⁄Yà‹öYŸõ^€€ùZ[õY[ùàH€€ùZ[ôYXõH›ô\ôõ›¬àH€€\X›ô]öY]»Xú¬àH[ÿö[Hÿ\ô€€ùô\ú⁄[€àõ‹àùYŸ][ôÿ⁄Y[BàH›X⁄ﬁHY[ùYûZ[ô»€€[[ú»⁄\ôHòX›Xÿ[àH€€ùZ[ôYÿ[ù‹ö^õ€ù[ÿ‹õ€ãHYYö[ùôZ]ö[‹à€»ô]öY]»€€ùõ€ÀòX⁄»€€ùõ€À⁄[ò]öYÿ][€ãà⁄YXò\úÀ[ô⁄[\»ùXòõH\ôHY[à[àö[ùàHX›]ôHô]öY]»ŸX›[€à\¬à⁄]ö[ùÀÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãH\»\»H]ô[‹\ã[€õHô]öY]»ôZ[ôH€›\òŸKX€€ùõ€YôX]\ôHõYÀÇãH]Ÿ\»õ›ô\XŸHHõŸX›[€àŸ[X›YRõÿà€‹ö‹‹XŸKÇãH]Ÿ\»õ›YõŸX›[€àH⁄X⁄€\›‹à\õZ]»XúÀÇãH]Ÿ\»õ›⁄Y[àõÿàö\⁄Xö[]KÇãH]Ÿ\»õ›YHô]»\õZ\‹⁄[€àõYÀÇãH]Ÿ\»õ›[ŸYûH[ûH›\Xò\ŸHXõKZY‹ò][€ãîÀì»€XﬁK]]à]Y][ùô[ù‹ûKö[ò[ò⁄X[‹àù\⁄[ô\‹»ù[KÇãH]Ÿ\»õ›‹ö]H»›\Xò\ŸH[ôŸ\»õ›Yÿÿ[úõ›‹Ÿ\à\ú⁄\›[òŸKÇãHH^\›[ô»õÿú»€‹ö‹‹XŸHô[XZ[ú»Yò][[ô[ùX›ÇÇà»»»ô\öYöXÿ][€ÇãHô\]Z\ôYôYõY⁄\‹ŸYYù\à[ùûHMàÿ\»\[ôY€€[Z]Y[ô\⁄YÇàHúò[ò⁄XZ[òàHÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[òàH€‹ö⁄[ô»ôYH€X[àôYõ‹ôH[\[Y[ù][€ÇàHÕXÕLô\Ÿ[ù[à[ôXYŸBàH[ùûHMàô\Ÿ[ù[àô\‹⁄]‹ûBàHTê“UP’TëHåãåÃô\Ÿ[ùãHúH⁄Xÿ\»ù[àôXÿ]\ŸHõŸW€[Ÿ[\ÿÿ\»Z\‹⁄[ô»€à\»XX⁄[ôKÇãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHô\‹⁄]‹ûH\»õ»^\›[ô»\›ÿ‹ö\ô^[€ôùZ[»õ»[ö]\›úò[Y]€‹ö¬à\»€€ôöY›\ôY€»õ»õÿ›\ŸY]]€X]Y][]H\›»Ÿ\ôHYY[à\»\‹ÀÇãHÿYô]Hÿÿ[ú»ŸàHYôàõ›[ôõ»ô]»›\Xò\ŸH‹ö]Hÿ[ŒÇàö[úŸ\ù
ù\]Jô[]Jù\Ÿ\ù
ÇãHÿYô]Hÿÿ[ú»õ›[ôõ»ô]»úõ›‹Ÿ\à\ú⁄\›[òŸNÇàÿÿ[›‹òYŸXŸ\‹⁄[€î›‹òYŸX[ô^YòÇãHÿYô]Hÿÿ[ú»õ›[ôõ»Sàÿ]Kî””à[\‹ùî””àô\›‹ôKSÿ]ôK\ö¬à[YHŸŸ€K[ÿö[K\ô]öY]»ŸŸ€KZY‹ò][€à⁄[ôŸKî»⁄[ôŸKì»⁄[ôŸKà\õZ\‹⁄[€à⁄[ôŸK‹à\ò⁄]X›\ôH⁄[ôŸH[ùõŸXŸYûH\»\‹ÀÇãH€õHRKÿ\Xÿ][€àö[\»\»\»Së—ëà\[ô⁄[ôŸYÇãH]][ùXÿ]Yúõ›‹Ÿ\àù[ù[YHô\öYöXÿ][€àÿ\»õ›€€\]Y[à\»Ÿ\‹⁄[€ãÇàX[ùX[ô\öYöXÿ][€àô[XZ[ú»ô\]Z\ôYõ‹à]ô[‹\àú»õ‹õX[]\Ÿ\àö\⁄Xö[]Kà]ôHŸ[X›YZõÿà]Kô\‹€ú⁄]ôH⁄YÀ[ôö[ù›]]ÇãHö[ò[[\[Y[ù][€à€€[Z]\⁄ÿ\»õ›€õ›ÿXõH]H[€Y[ù\»[ùûHÿ\¬à‹ö][é»]\»H€€[Z]][ùõŸXŸ\»[ùûHM»[ô\»ô\‹ùY[àBàŸ\‹⁄[€à›[[X\ûH»⁄]\›‹ûKÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[à\ôõ‹õ\»ŸŸŸYZ[àù[ù[YHô\öYöXÿ][€à⁄]H]ô[‹\àXÿ€›[ùÇåãàô\öYûHHõ‹õX[\Ÿ\àŸ\»õ›ŸYHH€‹ö‹‹XŸHô]öY]ÿÇåÀàô\öYûHH›\úô[ùŸ[X›YRõÿà€‹ö‹‹XŸHô[XZ[ú»HYò][Ççàô\öYûHHô]öY]»]MLçÕé[ôŒLÇçKàô\öYûHúõ›‹Ÿ\àö[ù›]]õ‹àXX⁄Hô]öY]»ŸX›[€ãÇçãà€€ù[ùYHù[Hå‹õ‹‹ÀX€X\ò[òŸHõ‹àÿ⁄[XKXYôôX›[ô»\ŸHãÃ»X⁄\⁄[€úÀÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHù[ù[YHö\›X[PH\»›[[ô[ô»ôXÿ]\ŸH]][ùXÿ]Yúõ›‹Ÿ\à\›[ô»ÿ\¬àõ›]òZ[XõH[à\»[\[Y[ù][€àŸ\‹⁄[€ãÇãHë—ÀTW“[ùY‹ò][€ó–\ò⁄]X›\ôW‘ô]öY]ÀõYÿ\»ôYô\ô[òŸYûH[ùûHMàù]àÿ\»õ›ô\Ÿ[ù[àHô\‹⁄]‹ûKÇãHúH⁄Xô\‹ùY^\›[ô»\[ô[òﬁHÿ\õö[ô‹À[ò€Y[ô»Y⁄\Ÿ]ô\ö]H]Y]àö[ô[ô‹»[ô[à€\öÀÿ€\öÀ\ôXX›\ôXÿ][€àÿ\õö[ôÀà\ŸHŸ\ôHõ›à⁄[ôŸY[à\»\ŸHHRH\‹ÀÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãH\Ÿ\»à[ô»ô[XZ[àõÿ⁄ŸY[ù[H\ò⁄]X›\ôHÿ⁄»\»‹ö][à[ôà⁄]‘ù[Hå‹õ‹‹ÀX€X\ò[òŸH\»€€\]KÇãH»õ›[\[Y[ù[ö]ô\úÿ[õÿàö\⁄Xö[]Kÿ⁄[XH[\ÀH⁄X⁄€\›à\ú⁄\›[òŸK\õZ]»\ú⁄\›[òŸK[ú‹X›[€ú»\ú⁄\›[òŸKõÿà€€ùX›Ààî””à^‹ù⁄[\‹ù‹à[ûHH‹ö]H]úõ€H\»ô]öY]ÀÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYõ‹à\ŸHH[\[Y[ù][€à8†%^X⁄]H]]‹ö^ôY\»BúôXY[€õHö\›X[‹ùûHTê“UP’TëHåãåÃ»Së—ëà[ùûHMãà\Ÿ\»à[ô¬úô[XZ[àõÿ⁄ŸY[ô[ô»\ò⁄]X›\ôHÿ⁄»[ô⁄]‘ù[Hå‹õ‹‹ÀX€X\ò[òŸKÇÇà»»[ùûHMHö^õÿú»Xú»[ô[ùô[ù‹ûHò]öYÿ][€à^[›]Çääë]NääàåçãLL¬ääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HRHYôX›€‹úôX›[€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[à€€\]Y]òZ[XõHX[ùX[ô]öY]»Yù\àH\ŸHHë—ÀTHôXY[€õBúô]öY]»[ôô\‹ùY€»ô\Ÿ[ù][€àYôX›»€õNÇÇåKàõŸX›[€àŸ[X›YRõÿàXú»Ÿ\ôH›[›ô\ú⁄^ôY[ôõŸXŸY[Çà[õôXŸ\‹ÿ\ûH‹ö^õ€ù[ÿ‹õ€ò\à]\⁄›‹⁄YÇåãàH[ùô[ù‹ûH[Ÿ[HŸX›[€ú»òZ[Y›ô\õ\[ô»ò]öYÿ][€à^[ôà‹ò[\Y][H‹X⁄[ôÀÇÇï\»\‹»ÿ\»[Z]Y»‘‘À€^[›]€‹úôX›[€à€õKàõ»\Ÿ\àõ›ö\⁄[€ö[ôÀòòX⁄Ÿ[ôÿ⁄[XK\õZ\‹⁄[€ã]]ö[ò[ò⁄X[[ùô[ù‹ûH€‹öŸõ›Àõÿú»]KBúô]öY]»]K‹à\ò⁄]X›\ôH€‹ö»ÿ\»]]‹ö^ôYÇÇî›\ù[ô»€€[Z]àMòMçò
YôXY[€õHë—ÀTHõÿú»ô]öY]ÿ
KÇê\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇîö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMÿÇÇà»»»⁄]ÿ\»€€\]YãH€‹úôX›YHõŸX›[€àŸ[X›YRõÿàXà›ö\^[›]ÇãH€‹úôX›YH[ùô[ù‹ûH[Ÿ[HŸX›[€ú»òZ[][H^[›]ÇãHô\Ÿ\ùôYH^\›[ô»ZY⁄ÿ[õ€öXÿ[Ÿ[X›YRõÿàXúŒÇà›ô\ùöY]À]Z[ÀX]\öX[Àù^[›]ò[úÿX›[€úÀö[ò[ò⁄X[Àÿ›[Y[ùÀàÿ⁄Y[KÇãHô\Ÿ\ùôYHë—ÀTHô]öY]»\»Y]]ôK]ô[‹\ã[€õKôX]\ôKYõYŸŸYà[ôõ€ãYYò][ÇÇà»»»õ€›ÿ]\ŸBãHõÿú»XúŒàHõŸX›[€àXà›ö\[ÿ^\»[›ŸY‹ö^õ€ù[ÿ‹õ€[ô»[ôàYõ›^X⁄]H€€ú›òZ[àH\⁄›‹õ›»\»H€€\X›€€ù[ù\⁄^ôYàõ€ãY‹õ›⁄[ô»Xà\›ÇãH[ùô[ù‹ûHòZ[à⁄YXò\à][\»Y[ú›YôöX⁄Y[ù^X⁄][ôKZZY⁄à‹X[Y€õY[ùÿ‹õ€ò\à›]\ã[ô]]ÀZZY⁄‹X⁄[ô»õ‹àH]H\¬à\ÿ‹ö\[€à\»‹[€ò[òYŸKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ‹›[\À€^[›]ò‹‹ÿãHSë—ëãõYÇà»»»‘‘»€‹úôX›[€ú¬ãHõÿú»Xà›ö\õ›ŒÇàH\Ÿ\»€€\X›€€ù[ùXò\ŸYXà⁄Y¬àHŸY\»õ^à]]ÿàHô]ô[ù»\⁄›‹‹ö^õ€ù[ÿ‹õ€[ô¬àH]õ⁄Y»›ô\ú⁄^ôY\]X[]⁄YôZ]ö[‹ÇàHŸY\»Xô[»€à€ôH[ôBàHô\›‹ô\»€€ùZ[ôYÿ‹õ€[ô»€õH]ò\úõ›À€[ÿö[H⁄Y¬ãH[ùô[ù‹ûHòZ[][\»õ›ŒÇàH\ŸHHôYKX€€[[à‹öYàö^YX€€ãõ^XõH^ö^YòYŸBàH[Y€àX€€à[ôòYŸHôX\àH‹Ÿà‹ò\Y^àH\ŸHôXYXõH]H[ô\ÿ‹ö\[€à[ôHZY⁄¬àH]XX⁄õ›»⁄^ôHò]\ò[H⁄]HZ[ö[][HZY⁄\»Hõ€‹à€õBàHô\Ÿ\ùôHÿ‹õ€ò\à›]\à‹XŸH€»ÿ‹õ€ò\ú»»õ›€›ô\à^‹àòYŸ\¬àHŸY\€€\ŸHôZ]ö[‹à[ùX›Çà»»»ô\öYöXÿ][€ÇãHô\]Z\ôYôYõY⁄\‹ŸYÇàHúò[ò⁄XZ[òàH€‹ö⁄[ô»ôYH€X[àôYõ‹ôHY]¬àHÿÿ[XZ[òX]⁄Y‹öY⁄[ã€XZ[òàH›\úô[ù€€[Z]MòMçòàHTê“UP’TëHåãåÃô\Ÿ[ùàHSë—ëàÿ\\‹»õ›Y⁄[ùûHM¬ãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHYôàô]öY]ŸY»€õH‘‘»\»\»Së—ëà\[ô⁄[ôŸYÇãHõ»ö[H[ô\à›\Xò\ŸK€ZY‹ò][€úÿ⁄[ôŸYÇãHÿ‹À–Tê“UP’TëKõYÿ\»õ›Y]YÇãHõ»îÀìÀ\õZ\‹⁄[€ã]]ö[ò[ò⁄X[[ùô[ù‹ûH€‹öŸõ›Àõÿú»]Bàö[ô[ôÀHô]öY]»]Hö[ô[ôÀ‹àù\⁄[ô\‹À\ù[H⁄[ôŸHÿ\»[ùõŸXŸYÇãH]][ùXÿ]Yúõ›‹Ÿ\àù[ù[YHô\öYöXÿ][€àÿ\»õ›€€\]Y[à\»Ÿ\‹⁄[€ãÇàûX[à⁄›[ô\öYûHH€‹úôX›Yÿ‹ôY[ú»]MLçÕé[ôŒLÇãHö[ò[[\[Y[ù][€à€€[Z]\⁄ÿ\»õ›€õ›ÿXõH⁄[à\»[ùûHÿ\¬à‹ö][é»]\»H€€[Z]][ùõŸXŸ\»[ùûHM[ô\»ô\‹ùY[àBàŸ\‹⁄[€à›[[X\ûH»⁄]\›‹ûKÇÇà»»»ô^›\»
[à‹ô\äBåKàô\öYûHõŸX›[€àŸ[X›YRõÿàXú»]M⁄][ZY⁄Xú»ö\⁄XõBà[ôõ»\⁄›‹Xã\›ö\ÿ‹õ€ò\ãÇåãàô\öYûHŸ[X›YRõÿàXú»]LçÕé[ôŒL⁄]€€ùZ[ôYàÿ‹õ€[ô»€õH⁄\ôHŸ[ùZ[ô[HôYYYÇåÀàô\öYûHH[ùô[ù‹ûH[Ÿ[HŸX›[€ú»òZ[]M[ôLç⁄]õ¬à›ô\õ\[ô»Xô[ÀŸ\ÿ‹ö\[€ú»‹àòYŸH€€\⁄[€ãÇçàô\öYûH[ùô[ù‹ûHò]Ÿ\àôZ]ö[‹à]Õé[ôŒLÇçKà€€\]HHŸ\\ò]Hõ‹õX[õ€ãQ]ô[‹\àHô]öY]»ö\⁄Xö[]H\›⁄[ÇàH›Z]XõH\›Xÿ€›[ù\»]òZ[XõKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHŸŸŸYZ[àù[ù[YHö\›X[ô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹»úõ›‹Ÿ\ãÇãHõ‹õX[õ€ãQ]ô[‹\àô]öY]»ö\⁄Xö[]H›[ôYY»HŸ\\ò]H\›Xÿ€›[ùàÿ\úöYYõ‹ùÿ\ôúõ€H[ùûHMÀÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY›öX›H[ú⁄YHRK–‘‘»ô\Ÿ[ù][€àÿ€‹H[ôàYõ›[\àõ›X›Y\Xÿ][€àôZ]ö[‹ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYY8†%RHYôX›€‹úôX›[€ú»ô[XZ[ôY⁄][àTê“UP’TëBùåãåÃ»Së—ëà[ùûHMÇÇà»»[ùûHMHH€‹úôX›[úô\€€ôYõÿú»Xú»[ô[ùô[ù‹ûHò]öYÿ][€àYôX›¬Çà»»»ÿ€‹BãH€‹úôX›YH€»ô[XZ[ö[ô»RHYôX›»ô\‹ùYYù\à€€[Z]çôÃLÃÇãH›^YY›öX›H[ú⁄YHRK–‘‘»ô\Ÿ[ù][€àÿ€‹KÇãHYõ›Y]ô[‹\à[ù[[ö‹ÀÇãHYõ›[\àõÿú»]Hö[ô[ôÀ[ùô[ù‹ûH€‹öŸõ›‹Àë—ÀTHô]öY]»ôZ]ö[‹ãà\õZ\‹⁄[€úÀî‹ÀìÀ]]ö[ò[ò⁄X[ù[\À‹à]Xò\ŸHZY‹ò][€úÀÇÇà»»»ô\]Z\ôYôYõY⁄ãHô\‹⁄]‹ûHÿ\»[Yúõ€H‹öY⁄[ã€XZ[ò»ÿÿ[XZ[òÿ\»[ôXYH\»]KÇãH€‹ö⁄[ô»ôYHÿ\»€X[àôYõ‹ôHY]ÀÇãH›\úô[ùúò[ò⁄àXZ[òÇãH›\úô[ùPQôYõ‹ôHY]ŒàMòMçòÇãH‹öY⁄[ã€XZ[òôYõ‹ôHY]ŒàMòMçòÇãHTê“UP’TëHåãåÃ€€ôö\õYYô\Ÿ[ùÇãHSë—ëà€€ôö\õYYÿ\\‹»õ›Y⁄[ùûHMÇÇà»»»õ€›ÿ]\ŸBãHõÿú»Ÿ[X›Y\ôX€‹ôXúŒà‹òÀ‹›[\Àò‹‹ÿ›[€€ùZ[ôY€\à‹öY¬à\]X[]⁄YXàù[\À[ò€Y[ô»⁄YàL	X€àöõÿãY]Z[]XòàôXÿ]\ŸBà‹òÀ€XZ[ãöúﬁ[\‹ù»‹òÀ‹›[\À€^[›]ò‹‹ÿYù\à‹òÀ‹›[\Àò‹‹ÿBà€‹úôX›ö^ôYYY^X⁄]]\à›ô\úöY\»[à^[›]ò‹‹ÿõ‹à⁄Yàõ^Y‹õ››⁄ö[ö»ôZ]ö[‹ã[ô›ô\ôõ›ÀÇãH[ùô[ù‹ûH[Ÿ[HŸX›[€ú»ò]öYÿ][€éàHX›]ôHõŸX›[€à”H\Ÿ\¬àö[X\ûT⁄YXò\ò
€‹ö‹‹XŸK\⁄YXò\ó◊€ò]ò[ô€‹ö‹‹XŸK\⁄YXò\ó◊⁄][X
Kàõ›H€\à[Ÿ[K]Xúÿ]àHô]ö[›\»‹X⁄[ô»ö^Yõ›ù[Hÿ⁄¬àHX›]ôH⁄YXò\à][Hõ›‹»[ù»ò]\ò[ZZY⁄›X⁄ŸYõ›‹»⁄]^X⁄]àö\⁄XõH›ô\ôõ›»[ôŸ\\ò]Y^ÿòYŸH€€[[úÀÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ‹›[\À€^[›]ò‹‹ÿãHSë—ëãõYÇà»»»‘‘»€‹úôX›[€ú¬ãHõÿú»Ÿ[X›Y\ôX€‹ôXú»õ›ŒÇàH\ŸHHõ€ã]‹ò\[ô»õ^õ›¬àH\ŸH€€\X›€€ù[ùXò\ŸYXà⁄Y¬àH^X⁄]Hô\Ÿ]Xà⁄Y»]]ÿàH^X⁄]Hô]ô[ùõ^‹õ››[ô⁄ö[ö»€€\ô\‹⁄[€ÇàHŸY\Z[ã]⁄YàX^X€€ù[ù€»Xô[»»õ›€€\ŸBàHô]Z[à€€ùZ[ôY‹ö^õ€ù[ÿ‹õ€[ô»ò[òX⁄»[ú›XYŸàY[ô»›ô\ôõ›¬ãH[ùô[ù‹ûH[Ÿ[HŸX›[€ú»ò]àõ›ŒÇàH›X⁄‹»ò]à][\»ô\ùXÿ[H⁄]H€€\]YLúÿ\àHŸY\»XX⁄ò]à][HZY⁄à]]ÿ⁄]HZ[ö[][KZZY⁄õ€‹à€õBàH\Ÿ\»Hö^YX€€à»õ^XõH€‹H»ö^YòYŸH‹öYàHŸY\»]H[ô\ÿ‹ö\[€à[àHõ^€€[[ÇàH[›‹»ö\⁄XõH›ô\ôõ›»[ú⁄YHXX⁄][BàHô\Ÿ\ùô\»ò]ã[\›ÿ‹õ€[ô»Ÿ\\ò][Húõ€HHXY\ãŸõ€›\à⁄[Çà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸYôYõ‹ôH[ôYù\à\»Së—ëà\[ôÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYôYõ‹ôH\»Së—ëà\[ôÇãHXY\‹»⁄õ€YHö^\ôH\⁄[ô»HùZ[‘‘»ô\öYöYYHX›X[ÿ\ÿÿYH]ÇàHMàõÿú»Xú»€Y[ù⁄YMÃéÿ‹õ€⁄YMÃé€€\X›X^XÇà⁄YLÀéM‹»[ùô[ù‹ûHò]àõ^€€[[ãLú][Hÿ\ÇàHLçàõÿú»Xú»€Y[ù⁄YMÃéÿ‹õ€⁄YMÃé€€\X›X^XÇà⁄YLÀéM‹»[ùô[ù‹ûHò]àõ^€€[[ãLú][Hÿ\ÇàHÕéàõÿú»Xú»€Y[ù⁄YMÃéÿ‹õ€⁄YMÃé€€\X›X^XÇà⁄YLÀéM‹»[ùô[ù‹ûHò]àõ^€€[[ãLú][Hÿ\ÇàHŒLàõÿú»Xú»€Y[ù⁄YLÕMÿ‹õ€⁄YMåç€€ùZ[ôYà‹ö^õ€ù[ÿ‹õ€X›]ôN»[ùô[ù‹ûHò]àõ^€€[[ãLú][Hÿ\ÇãHö^\ôH€€ôö\õYYöõÿãY]Z[]Xúÿ€€\]\»»\‹^Nôõ^[ôà›ô\ôõ›À^ò]]ÿÇãHö^\ôH€€ôö\õYYXX⁄öõÿãY]Z[]Xò€€\]\»»õ^à]]ÿ[ôàZ[ã]⁄YàX^X€€ù[ùÇãHö^\ôH€€ôö\õYYù€‹ö‹‹XŸK\⁄YXò\ó◊€ò]ò€€\]\»»Hô\ùXÿ[õ^à€€[[à⁄]Lúÿ\ÀÇãHö^\ôH€€ôö\õYYù€‹ö‹‹XŸK\⁄YXò\ó◊⁄][X€€\]\»»‹öY^[›]⁄]àö\⁄XõH›ô\ôõ›»[ôò]\ò[õ›»ZY⁄»õ‹à‹ò\YXô[ÀŸ\ÿ‹ö\[€úÀÇãH]][ùXÿ]YõŸX›[€àúõ›‹Ÿ\àô\öYöXÿ][€àÿ\»õ›]òZ[XõH[à\¬àŸ\‹⁄[€ãàûX[à⁄›[\ôõ‹õHHö[ò[]ôHRHô\öYöXÿ][€àô[›ÀÇÇà»»»ô^›\»
[à‹ô\äBåKà‹[àHõŸX›[€à\⁄]HŸŸŸYZ[àXÿ€›[ùÇåãàò]öYÿ]H»õÿú»[ô‹[à[ûHŸ[X›YõÿàôX€‹ôÇåÀà]Mô\öYûH[ZY⁄Ÿ[X›Y\ôX€‹ôXú»\ôHö\⁄XõH⁄]›][Çà[ù\ÿXõH€\Yõ›Œà›ô\ùöY]À]Z[ÀX]\öX[Àù^[›]ò[úÿX›[€úÀàö[ò[ò⁄X[Àÿ›[Y[ùÀÿ⁄Y[KÇçà]Lç[ôÕéô\öYûHHÿ[YHXàõ›»ô[XZ[ú»€€\X›[ôôXX⁄XõKÇçKà]ŒLô\öYûHHŸ[X›Y\ôX€‹ôXú»\ŸH€€ùZ[ôY‹ö^õ€ù[ÿ‹õ€[ô¬à[ô]]\àXú»\ôHôXX⁄XõKÇçãàò]öYÿ]H»[ùô[ù‹ûKÇçÀà]M[ôLçô\öYûH[Ÿ[HŸX›[€ú»][\»»õ››ô\õ\]\Àà\ÿ‹ö\[€úÀX€€úÀ‹àòYŸ\ÀÇéà]Õé[ôŒL‹[àH[ùô[ù‹ûHò]Ÿ\à[ôô\öYûH][\»›X⁄»⁄]à€X\àô\ùXÿ[Ÿ\\ò][€à[ôõ»^ÿòYŸH€€\⁄[€ãÇéKà€€\]HHŸ\\ò]Hõ‹õX[õ€ãQ]ô[‹\àHô]öY]»ö\⁄Xö[]H\›⁄[ÇàH›Z]XõH\›Xÿ€›[ù\»]òZ[XõKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHŸŸŸYZ[àù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹»úõ›‹Ÿ\ãÇãHõ‹õX[õ€ãQ]ô[‹\àô]öY]»ö\⁄Xö[]H›[ôYY»HŸ\\ò]H\›Xÿ€›[ùàÿ\úöYYõ‹ùÿ\ôúõ€H[ùûHMÀÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY⁄][àTê“UP’TëHåãåÃ[ô€‹úôX›Y€õBà[úô\€€ôYRHô\Ÿ[ù][€àYôX›ÀÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH€‹úôX›]ôHRH€‹ö»ô[XZ[ôY⁄][àTê“UP’TëHåãåÃã»Së—ëà[ùûHMKÇÇà»»[ùûHMLHY]ô[‹\à€€ú€€H[ù[[ö‹¬Çääë]NääàåçãLLääï\]YûNääà€Ÿ^ääî\ŸNääà]ô[‹\à€€ú€€H\ÿXö[]BääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àMÿÿååò
€‹úôX›[úô\€€ôYõÿú»[ô[ùô[ù‹ûHò]öYÿ][€àYôX›ÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMXÇãHûX[àô\‹ùY]HX[ùX[Hõ‹òŸH\ﬁYYõŸX›[€àôYõ‹ôH\»Z[\›€ôBàôXÿ]\ŸHHö[‹à\ﬁ[Y[ù›]\»ÿ\»[òŸ\ùZ[ãàH\Ÿ\ã\ô\‹ùY⁄X⁄‹⁄[ùàÿ\»XZ[àMÿÿååòÇãH€Ÿ^[ô\[ô[ùH€€ôö\õYY]HXõX»õŸX›[€àù[ôH]àŒãÀ‹õú€€][€úÀõô]ÿ[XôYYùZ[X\öŸ\àMÿÿååò\ö[ô»ôYõY⁄ÇãHõ»Y][€ò[X[ùX[‹àõ‹òŸH\ﬁHÿ\»öYŸŸ\ôYûH\»Z[\›€ôKÇÇà»»»⁄]ÿ\»€€\]YãHYYH[ù[[ö‹ÿŸX›[€à»H^\›[ô»]ô[‹\à€‹ö‹‹XŸKÇãHô\Ÿ\ùôYH›\úô[ùŸ\ùô\ã\ô\€€ôYÿ[êXÿŸ\‹—]ô[‹\òÿ]N»HŸX›[€à\¬àô[ô\ôY€õH[ú⁄YHH[ôXYHõ›X›Y]ô[‹\à€‹ö‹‹XŸKÇãHYY€›\òŸKX€€ùõ€YYö[ö][€ú»õ‹àõ›\àYZ[ö\›ò]]ôH\›[ò][€úŒÇàH›\Xò\ŸHHõ‹ùÿ]HHåÇàH€\ö»H\Ÿ\àXÿ€›[ù¬àH⁄]XàHõ‹ùÿ]HHåÇàHô]YûHHõŸX›[€à\ﬁ[Y[ùãHYY€€ò⁄\ŸH\ú‹ŸK[ú›ùX›[€ã[ôÿ]][€à€€ù[ùõ‹àXX⁄Ÿ\ùöXŸKÇãHYYHõ€ãZ[ù\òX›]ôHù]\ôNà\Ÿ\àX[òYŸ[Y[ùÿ[›]Xô[Yà[õôYHõ›Y][\[Y[ùYÇÇà»»»[ö»[ôÿYô]HôZ]ö[‹ÇãH›\Xò\ŸH‹[ú»H›XõHõ⁄ôX›\⁄õÿ\ôTìùZ[úõ€HXõX»õ⁄ôX›àôYô\ô[òŸHŸ[Ÿﬁ\€õ›Zÿô[ôöŸöò€òÇãHH›\Xò\ŸHÿ\ô\‹^\»]ôYô\ô[òŸH[ôõ›öY\»H€‹Hù]€à⁄][ÇàXÿŸ\‹⁄XõH›XÿŸ\‹»‹àòZ[\ôH›]\»Y\‹ÿYŸKÇãH€\ö»‹[ú»HŸ[ô\ò[€\ö»\⁄õÿ\ôôXÿ]\ŸHõ»\Xÿ][€ã\‹X⁄YöX»€\ö¬à\⁄õÿ\ôTìÿ\»ô\Ÿ[ù[à€›\òŸKX€€ùõ€Y€€ôöY›\ò][€ãÇãH⁄]Xà‹[ú»ìî€€][€úÀY[X›öXÿ[”õ‹ùÿ]KRK]åãå\ôX›KÇãHô]YûH‹[ú»HŸ[ô\ò[ô]YûH\⁄õÿ\ôôXÿ]\ŸHHô\‹⁄]‹ûH€€ùZ[ú»BàúHù[àùZ[»\›€€ôöY›\ò][€àù]õ»€›\òŸKX€€ùõ€Y⁄]HQ‹Çà\⁄õÿ\ô€YÀÇãH]ô\ûH^\õò[\›[ò][€à\Ÿ\»HŸ[X[ùX»[ò⁄‹ã‹[ú»[àHô]»Xã\Ÿ\¬àô[Hõõ€‹[ô\àõ‹ôYô\úô\àò[ô\»[àXÿŸ\‹⁄XõHXô[›][ô»]ôZ]ö[‹ãÇãHõ»YZ[ö\›ò]]ôHTHÿ\»ÿ[Y[ôõ»‹ôY[ùX[»Ÿ\ôHXŸY[àHTìÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀÿ€€ôöYÀŸ]ô[‹\í[ù[[ö‹ÀöúÿãH‹òÀ–\öúﬁãH‹òÀ‹›[\À€^[›]ò‹‹ÿãHSë—ëãõYÇà»»»ŸX‹ô][ô\ò⁄]X›\ôHô]öY]¬ãH[ù[[ö‹»€€ùZ[ú»€õHXõX»\⁄õÿ\ôTìÀH⁄]Xàô\‹⁄]‹ûHò[YKà^[ò]‹ûH^[ôHõ€ã\ŸX‹ô]›\Xò\ŸHõ⁄ôX›ôYô\ô[òŸKÇãHõ»›\Xò\ŸHŸ\ùöXŸK\õ€HŸ^K€\ö»ŸX‹ô]Ÿ^K]Xò\ŸH\‹›€‹ôô]YûBàXÿŸ\‹»⁄Ÿ[ã⁄]XàUôX\ô\à⁄Ÿ[ãï’[ùö]][€à⁄Ÿ[ã‹àö]ò]Bà[ùö\õ€õY[ùò[YHÿ\»YYÇãHõ»ÿ⁄[XKZY‹ò][€ãîÀìÀ]]\õZ\‹⁄[€ãòX⁄Ÿ[ô‹à]ô[‹\ãXXÿŸ\‹¬àô\€€][€à⁄[ôŸHÿÿ›\úôYÇãHÿ‹À–Tê“UP’TëKõYÿ\»õ›[ŸYöYYÇãH\Ÿ\àX[òYŸ[Y[ùô[XZ[ú»ù]\ôH€‹öŒ»õ»[ùö]][€ãõ€K]ö\⁄[€ã›]\Àà›ô\úöYK‹à]Y]òX⁄Ÿ[ôÿ\»YYÇÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHHô\‹⁄]‹ûH\»õ»\›ÿ‹ö\ô^[€ôùZ[€»õ»Y][€ò[]]€X]Yà\››Z]Hÿ\»]òZ[XõKÇãHHô[ô\ôYö^\ôH\⁄[ô»H€€\[Y\Xÿ][€à‘‘»ÿ\»⁄X⁄ŸY]MàLçÕé[ôŒLÇãH[õ›\àÿ\ô»ô[ô\ôY]]ô\ûH⁄X⁄ŸY⁄Y⁄]õ»ÿ\ô€\[ôÀõ»ÿ]][€Çà€\[ôÀ[ôõ»YŸK[]ô[‹ö^õ€ù[›ô\ôõ›ÀÇãHH‹öYô[ô\ôY[à€»€€[[ú»]M[ôLç[à€ôH€€[[à]Õéà[ôŒLà[ÿö[HX›[€ú»›X⁄ŸYô\ùXÿ[H]ŒLÇãH]][ùXÿ]Y]ô[‹\àù[ù[YHô\öYöXÿ][€àÿ\»õ›]òZ[XõH[à\»Ÿ\‹⁄[€ãÇàûX[à⁄›[ô\öYûH]ôH]ô[‹\à[ôõ‹õX[]\Ÿ\àö\⁄Xö[]HYù\à\ﬁ[Y[ùÇãHHö[ò[[\[Y[ù][€à€€[Z]ÿ\»õ›€õ›ÿXõH⁄[à\»[ùûHÿ\»‹ö][é¬à]\»H€€[Z]][ùõŸXŸ\»[ùûHML[ô\»ô\‹ùY[à⁄]\›‹ûKÇÇà»»»ô^›\»
[à‹ô\äBåKà\ﬁHõ›Y⁄Hõ‹õX[⁄]X€€õôX›Yô]YûHõÿŸ\‹Œ»»õ›õ‹òŸH\ﬁBà[õ\‹»Hõ‹õX[\ﬁ[Y[ùòZ[ÀÇåãà⁄Y€à[à\»H]ô[‹\à[ô‹[à]ô[‹\ã[àô\öYûH[ù[[ö‹»\X\úÀÇåÀà€€ôö\õH[õ›\à^\õò[[ö‹»‹[àH[ù[ôY\›[ò][€ú»[àô]»XúÀÇçà€€ôö\õH€‹Hõ⁄ôX›ôYô\ô[òŸH€‹Y\»Ÿ[Ÿﬁ\€õ›Zÿô[ôöŸöò€ò[ô[õõ›[òŸ\¬à›XÿŸ\‹ÀÇçKàô\öYûHHŸX›[€à]MLçÕé[ôŒL[àH]][ùXÿ]Yà\Xÿ][€ãÇçãà⁄Y€à[à\»Hõ‹õX[õ€ãQ]ô[‹\à\Ÿ\à[ô€€ôö\õH]ô[‹\àò]öYÿ][€à[ôà[ù[[ö‹»ô[XZ[à[ò]òZ[XõKÇçÀà€€ôö\õHHõŸX›[€àùZ[X\öŸ\àX]⁄\»Hô]»[\[Y[ù][€à€€[Z]ÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]Y]ôHRHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹»úõ›‹Ÿ\ãÇãHHô\‹⁄]‹ûHŸ\»õ›õ›öYHHô]YûH⁄]HQ‹à\⁄õÿ\ô€YÀ€»Bàô]YûHÿ\ô[ù[ù[€ò[H‹[ú»HŸ[ô\ò[\⁄õÿ\ôÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»Z[\›€ôH›^YY[ú⁄YH]ô[‹\ã[€õK€›\òŸKX€€ùõ€YRKà^\õò[ò]öYÿ][€ãÿ›[Y[ù][€ã[ôô\‹€ú⁄]ôHô\Ÿ[ù][€àÿ€‹KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH]ô[‹\à[ù[[ö‹»ô[XZ[ôYH]ô[‹\ã[€õBú€›\òŸKX€€ùõ€YRHôX]\ôH⁄][àTê“UP’TëHåãåÃ»Së—ëà[ùûHMLÇÇà»»[ùûHMLHH‹ù]ô[‹\à€‹ö‹‹XŸH[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»]ô[‹\à[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àçXLçôX
[›»õ€›õŸX›[€àõ›]\à]
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMLÇãHõ‹ùÿ]HHåÀå\»]ôH€àH^\›[ô»⁄]Xà»ô]YûH»›\Xò\ŸBà[ôúò\›ùX›\ôK€»Hå»ôXùZ[€€ù[ùY\»[ú⁄YHHÿ[YHô\‹⁄]‹ûH[ôàõ⁄ôX›€€õôX›[€úÀÇãHRQ‘êUS”ó”PTõYY[ùYöY\»\⁄õÿ\ô\»Hö\ú›ZY‹ò]Y[Ÿ[H[ôà]ô[‹\à\»HŸX€€ô›Ÿ\›\ö\⁄»[Ÿ[Kà[ùô[ù‹ûHô[XZ[ú»[ù[ù[€ò[Bà]HôXÿ]\ŸHÿ\ù⁄X⁄€›]YŸ\ã€›[ù›ô\ôò]À[ô€€ò›\úô[òﬁHôZ]ö[‹Çàÿ\úûHHY⁄\›[ùò\öX[ùÿYÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»]ô[‹\ï€‹ö‹‹XŸX[Ÿ[H[ô\à‹òÀ€[Ÿ[\ÀŸ]ô[‹\ãÿÇãHôY⁄\›\ôYH]ô[‹\àÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYH]ô[‹\à[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôX⁄[Bàô\Ÿ\ùö[ô»H^\›[ô»ÿ[êXÿŸ\‹—]ô[‹\òõ›]K€ò]àÿ]KÇãHôZ[ùõŸXŸY€›\òŸKX€€ùõ€Y]ô[‹\à[ù[[ö‹»[àHå»[Ÿ[Bà›ùX›\ôH\⁄[ô»‹òÀÿ€€ôöYÀŸ]ô[‹\í[ù[[ö‹ÀöúÿÇãHYYôXY[€õHŸ\‹⁄[€àXY€õ‹›X‹»õ‹éÇàH⁄Y€ôYZ[à€\ö»[XZ[»\Ÿ\àYàHYôôX›]ôHŸ\ùô\àõ€H[ô]ö\⁄[€ÇàH\õZ\‹⁄[€à€›\òŸBàH›\úô[ùö]H[ŸBàHå»ùZ[Xô[ãHYYHôXY[€õHYôôX›]ôK\\õZ\‹⁄[€à€ò\⁄›XõH\⁄[ô»H^\›[ô¬àŸ\ùô\ãXòX⁄ŸY\ŸT\õZ\‹⁄[€úÿ€⁄ÀÇãHYYô\‹€ú⁄]ôH]ô[‹\àÿ\ô[ù[[[öÀÿ]][€ã[ôù]\ôK]\Ÿ\ãBàX[òYŸ[Y[ùô\Ÿ[ù][€à›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãîÀìÀ]]\õZ\‹⁄[€àõYÀ⁄X⁄€›]à[ùô[ù‹ûHYŸ\ãõÿúÀö[ò[ò⁄X[À‹àòX⁄Ÿ[ôôZ]ö[‹à⁄[ôŸYÇãHõ»]ô[‹\à\õZ\‹⁄[€àY]‹ã‘S€€ú€€KŸ\ùöXŸK\õ€HXÿŸ\‹À\ôŸ]]\Ÿ\ÇàYôôX›]ôK\\õZ\‹⁄[€à€⁄›\[ùö]][€àõ›À‹àŸX‹ô]Ÿ[ùö\õ€õY[ùöY]Ÿ\àÿ\¬àYYÇãH[ù[[ö‹»€€ùZ[à€õHXõX»\⁄õÿ\ôTìÀH⁄]Xàô\‹⁄]‹ûHò[YKà^[ò]‹ûH^[ôHõ€ã\ŸX‹ô]›\Xò\ŸHõ⁄ôX›ôYô\ô[òŸBàŸ[Ÿﬁ\€õ›Zÿô[ôöŸöò€òÇãHö\⁄XõHXô[»õ›»ÿ^Hõ‹ùÿ]HXò]\à[àõ‹ùÿ]HHåò⁄\ôHBà[ô\õZ[ô»õ⁄ôX›ò[YH€›[›\ù⁄\ŸHXZŸHHå»ôXùZ[\X\à›[KàBà^X›⁄]Xà»ô]YûH»›\Xò\ŸH\›[ò][€ú»ô[XZ[à[ò⁄[ôŸYÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀÿ€€ôöYÀŸ]ô[‹\í[ù[[ö‹ÀöúÿãH‹òÀ€[Ÿ[\ÀŸ]ô[‹\ã—]ô[‹\ï€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôH]ô[‹\àù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»]ô[‹\ã[[Ÿ[HZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à\»H]ô[‹\à[ô‹[àH]ô[‹\à€‹ö‹‹XŸKÇçà€€ôö\õHH]ô[‹\à[Ÿ[Hõ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õH[ù[[ö‹»ô[ô\à[ô^\õò[[ö‹»‹[à[àô]»XúÀÇçãà€€ôö\õH€‹HôYô\ô[òŸH€‹Y\»Ÿ[Ÿﬁ\€õ›Zÿô[ôöŸöò€òÇçÀà€€ôö\õHõ‹õX[õ€ãQ]ô[‹\à\Ÿ\ú»›[ÿ[õõ›ŸYH‹àõ›]H[ù»]ô[‹\ãÇéà€€ù[ùYHHå»ôXùZ[⁄]Hô^›À\ö\⁄»[Ÿ[Húõ€HRQ‘êUS”ó”PTõYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHHå»]ô[‹\à€‹ö‹‹XŸH\»[ù[ù[€ò[H›]\À‹ôXY[€õH[à\»\‹Œ»Bàö[‹àåà⁄[\»⁄[\›⁄]⁄€€ùõ€ÿ\»õ›‹ùY\ôHY]ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YH]ô[‹\ã[€õK€›\òŸKX€€ùõ€YRKà^\õò[ò]öYÿ][€ãXY€õ‹›X‹À[ôô\‹€ú⁄]ôHô\Ÿ[ù][€àÿ€‹KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH]ô[‹\àå»ZY‹ò][€àô[XZ[ôYH]ô[‹\ã[€õBú€›\òŸKX€€ùõ€YRHôX]\ôH⁄][àTê“UP’TëHåãåÃ»Së—ëà[ùûHMLKÇÇà»»[ùûHMLàH‹ùô\‹ù»€‹ö‹‹XŸH[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»ô\‹ù»[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àçŒòXŒ
‹ù]ô[‹\à€‹ö‹‹XŸH»åÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMLXÇãHRQ‘êUS”ó”PTõYY[ùYöY\»ô\‹ù»\»H\ô›À\ö\⁄»[Ÿ[HôXÿ]\ŸH]à\»ôXY[€õHûHYö[ö][€ãÇãHHô\Ÿ\ùôYåà\öúﬁYõ›€€ùZ[àH›[ô[€ôHô\‹ù»€‹ö‹‹XŸH¬à‹ùà^\›[ô»ô\‹ù€€òŸ\»Ÿ\ôHÿÿ]\ôYX‹õ‹‹»ù]\ôK‹ô\Ÿ\ùôY[Ÿ[Bà›\ôòXŸ\À€»\»\‹»‹ôX]YH€›\òŸKZ€ô\›å»ô\‹ù»Ÿ[ù\àò]\à[Çà[ùô[ù[ô»‹\ò][€ò[ô\‹ùõ›‹ÀÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»ô\‹ù’€‹ö‹‹XŸX[Ÿ[H[ô\à‹òÀ€[Ÿ[\À‹ô\‹ùÀÿÇãHôY⁄\›\ôYHô\‹ù»ÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYHô\‹ù»[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôX⁄[Bàô\Ÿ\ùö[ô»H^\›[ô»ÿ[ïöY]‘ô\‹ùÿõ›]K€ò]àÿ]KÇãHYYHôXY[€õHô\‹ùXúò\ûH⁄›⁄[ôŒÇàHH]ôHYôôX›]ôHXÿŸ\‹»€ò\⁄›ô\‹ùàHô\Ÿ\ùôY[ùô[ù‹ûHX›]ö]Kõÿà€‹››[[X\ûK‹[àõÿúÀ[ôÿ›[Y[ù[ô^àô\‹ù›\ôòXŸ\¬ãHYYHôXY[€õHYôôX›]ôKXXÿŸ\‹»€ò\⁄›õ‹àô\‹ù\ô[]ò[ù\õZ\‹⁄[€ÇàõY‹»\⁄[ô»H^\›[ô»Ÿ\ùô\ãXòX⁄ŸY\ŸT\õZ\‹⁄[€úÿ€⁄ÀÇãHYY[à‹\ò][€ò[€›\òŸ\»ôXY[ô\‹»öY]»]ôX€‹ô»⁄H[ùô[ù‹ûKõÿúÀàö[ò[ò⁄X[À[ôÿ›[Y[ù»ô\‹ù»›^HYô\úôY[ù[Z\àå»€›\òŸH[Ÿ[\¬à[ô\õZ\‹⁄[€àö[\ú»\ôH^X⁄]ÇãHYYZ[ö[X[ô\‹€ú⁄]ôHô\‹ù»^[›]›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸH]Y\ûKÿ⁄[XKZY‹ò][€ãîÀìÀ]]\õZ\‹⁄[€àõYÀ^‹ùàòX⁄Ÿ[ô[ùô[ù‹ûK⁄X⁄€›]YŸ\ãõÿúÀÿ›[Y[ùÀ‹àö[ò[ò⁄X[»ôZ]ö[‹Çà⁄[ôŸYÇãHõ»õ›X›Y‹\ò][€ò[õ›‹»\ôHŸ[X›Y‹àô[ô\ôYûHHô\‹ù»[Ÿ[Bà[à\»\‹ÀÇãHö[ò[ò⁄X[ô\‹ùö\⁄Xö[]Hô[XZ[ú»YY»^\›[ô»ÿ[ïöY]—ö[ò[ò⁄X[ÿ¬àõ›X›YöY[»›^H€Z]Y⁄\ôH]õY»\»õ›‹ò[ùYÇãHô\Ÿ\ùôYô\‹ùõ›‹»\ôHõÿYX\€›»€õKà^H»õ›‹ò[ù]HXÿŸ\‹»‹Çà[\H]H[ô\õZ[ô»[Ÿ[HôXY]\»ôY[àZY‹ò]YÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À‹ô\‹ùÀ‘ô\‹ù’€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôHô\‹ù»ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»ô\‹ùÀ[[Ÿ[HZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»ÿ[ó›öY]◊‹ô\‹ùÿ[ô‹[àô\‹ùÀÇçà€€ôö\õHô\‹ù»õ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õHHô\‹ùXúò\ûKXÿŸ\‹»€ò\⁄›[ô‹\ò][€ò[€›\òŸ\»ŸX›[€ú¬àô[ô\à⁄]›]›ô\ôõ›»]\⁄›‹[ô[ÿö[H⁄YÀÇçãà€€ôö\õHH\Ÿ\à⁄]›]ÿ[ó›öY]◊‹ô\‹ùÿÿ[õõ›ŸYH‹àõ›]H[ù»ô\‹ùÀÇçÀà€€ù[ùYHHå»ôXùZ[⁄]Hô^›À\ö\⁄»[Ÿ[Húõ€HRQ‘êUS”ó”PTõYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHHö\ú›‹\ò][€ò[]Hô\‹ù⁄›[ôHYY€õHYù\à]»€›\òŸH[Ÿ[Bà\»ôY[àZY‹ò]Y[ù»å»[ôHô\‹ù\‹X⁄YöX»\õZ\‹⁄[€ãŸö[\à€€ùòX›à\»^X⁄]ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHôXY[€õHô\‹ù»RK€›\òŸK\ôXY[ô\‹¬àô\Ÿ[ù][€ã\õZ\‹⁄[€ãX€€ù^\‹^K[ôô\‹€ú⁄]ôHô\Ÿ[ù][€àÿ€‹KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYHô\‹ù»å»ZY‹ò][€àô[XZ[ôYôXY[€õHRH⁄][ÇêTê“UP’TëHåãåÃ»Së—ëà[ùûHMLãÇÇà»»[ùûHML»H‹ùÿ›[Y[ù»€‹ö‹‹XŸH[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»ÿ›[Y[ù»[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àôXççX
‹ùô\‹ù»€‹ö‹‹XŸH»åÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMLòÇãHRQ‘êUS”ó”PTõYY[ùYöY\»ÿ›[Y[ù»\»Hõ›\ù›À\ö\⁄»[Ÿ[K⁄]à›‹òYŸH]»[ôì»[ò⁄[ôŸYÇãHH^\›[ô»]ôHÿ›[Y[ù»[\[Y[ù][€à\»õÿàÿ›[Y[ù»åH[ú⁄YHBàõÿú»]Z[ÿ›[Y[ù»Xãàõÿú»\»õ›ôY[àZY‹ò]Y[ù»å»Y]€»\¬à\‹»Yõ›ô[ÿÿ]H\ÿYÿ\ò⁄]ôKŸ›€õÿYX›[€ú»[ù»H‹[]ô[[Ÿ[KÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»ÿ›[Y[ù’€‹ö‹‹XŸX[Ÿ[H[ô\à‹òÀ€[Ÿ[\ÀŸÿ›[Y[ùÀÿÇãHôY⁄\›\ôYHÿ›[Y[ù»ÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYHÿ›[Y[ù»[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôXÇãHYYH‹[]ô[ÿ›[Y[ù»Ÿ[ù\à⁄]ÇàH›ô\ùöY]¬àH›€ô\àÿ€‹\¬àH€€ùõ€¬ãHÿ›[Y[ùYH\õ›ôYŸ[ô\öX»›€ô\àõÿÿXù[\ûH[ô›‹òYŸH]€€ùô[ù[€Çàõ‹àõÿã\›[X]KôZX€K€€[\ﬁYYK⁄[ôŸK[‹ô\ãô\‹ù[ô€ò\⁄›à›€ô\à\\ÀÇãHX\öŸYõÿàÿ›[Y[ù»\»H€õHõÿã\ÿ€‹Y]ôH›€ô\à]Ÿ^KÇãHYYôXY[‹öY[ùY›[[X\öY\»õ‹à]ôK‹ô\Ÿ\ùôYÿ€‹\À^\›[ô¬àÿ[ó€X[òYŸW⁄õÿúÿ€€ù^[ôHÿ⁄ŸYõ‹ùÿ]KYö[\ÿ›‹òYŸHõ›[ô\ûKÇãHYYZ[ö[X[ô\‹€ú⁄]ôHÿ›[Y[ù»^[›]›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸH]Y\ûKÿ⁄[XKZY‹ò][€ãîÀìÀ]]\õZ\‹⁄[€àõYÀ›‹òYŸBà€XﬁK\ÿY\ò⁄]ôK›€õÿY⁄Y€ôYTìõÿúÀö[ò[ò⁄X[À^‹ù‹ÇàòX⁄Ÿ[ôôZ]ö[‹à⁄[ôŸYÇãHõ»‹[]ô[ÿ›[Y[ù]]][€à]ÿ\»YYÇãHH^\›[ô»õÿàÿ›[Y[ù»åH›€ô\à€‹öŸõ›»ô[XZ[ú»H\õ›ôYXŸHõ‹Çàõÿàÿ›[Y[ù\ÿY€‹[ãŸ›€õÿYÿ\ò⁄]ôH[ù[õÿú»\»ZY‹ò]Y[ù»åÀÇãHõ€ãZõÿà›€ô\à\\»ô[XZ[àô\Ÿ\ùôY[ù[Z\à€›\òŸH[Ÿ[\»[ôìÀ‹ôXYàôZ]ö[‹à\ôH^X⁄]H[\[Y[ùYÇãH⁄[ôŸH‹ô\ú»ô[XZ[àö[ò[ò⁄X[ôX€‹ôÀõ›ÿ›[Y[ùÀÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\ÀŸÿ›[Y[ùÀ—ÿ›[Y[ù’€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôHÿ›[Y[ù»ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»ÿ›[Y[ùÀ[[Ÿ[HZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à[ô‹[àÿ›[Y[ùÀÇçà€€ôö\õHÿ›[Y[ù»õ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õH›ô\ùöY]À›€ô\àÿ€‹\À[ô€€ùõ€»ô[ô\à⁄]›]›ô\ôõ›»]à\⁄›‹[ô[ÿö[H⁄YÀÇçãà€€ôö\õHõ»‹[]ô[\ÿYÿ\ò⁄]ôKŸ›€õÿYX›[€ú»\ôH^‹ŸYÇçÀà€€ù[ùYHHå»ôXùZ[⁄]Hô^›À\ö\⁄»[Ÿ[Húõ€HRQ‘êUS”ó”PTõYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãH‹[]ô[ÿ›[Y[ùõ›»\›[ô»⁄›[ôHYY€õHYù\à›€ô\ã\‹X⁄YöX»ôXYàö[\ú»\ôH^X⁄]‹àYù\àõÿú»\»ZY‹ò]Y[ôõÿàÿ›[Y[ù€€ù^ÿ[ÇàôHô\Ÿ\ùôYÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHôXY[‹öY[ùYÿ›[Y[ù»RKà€›\òŸK\ôXY[ô\‹»ô\Ÿ[ù][€ã›€ô\ã\ÿ€‹HX\[ôÀ[ôô\‹€ú⁄]ôBàô\Ÿ[ù][€àÿ€‹KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYHÿ›[Y[ù»å»ZY‹ò][€àô[XZ[ôYôXY[‹öY[ùYRBù⁄][àTê“UP’TëHåãåÃ»Së—ëà[ùûHMLÀÇÇà»»[ùûHMMH‹ùôZX€\»€‹ö‹‹XŸH[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»ôZX€\»[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àÃçÿÕYX
‹ùÿ›[Y[ù»€‹ö‹‹XŸH»åÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMLÿÇãHRQ‘êUS”ó”PTõYY[ùYöY\»ôZX€\»\»HöYù›À\ö\⁄»[Ÿ[HôXÿ]\ŸH]à\»Ÿ[ãX€€ùZ[ôYÇãHHô\Ÿ\ùôYåàôZX€\»€‹ö‹‹XŸH\ŸYH^\›[ô¬à[ùô[ù‹ûWŸ\›[ò][€ó›ôZX€\◊›öY]ÿôXY]à\»å»‹ùô]\Ÿ\»]à]][ùXÿ]YôXY][ôŸ\»õ›‹ôX]HHô]»ôZX€H]H€€ùòX›ÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»ôZX€\’€‹ö‹‹XŸX[Ÿ[H[ô\à‹òÀ€[Ÿ[\À›ôZX€\ÀÿÇãHôY⁄\›\ôYHôZX€\»ÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYHôZX€\»[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôX⁄[Bàô\Ÿ\ùö[ô»H^\›[ô»ÿ[ìX[òYŸUôZX€\ÿõ›]K€ò]àÿ]KÇãHYY[à]][ùXÿ]YôXY[€õHôZX€HôYô\ô[òŸH€⁄»\⁄[ô¬à[ùô[ù‹ûWŸ\›[ò][€ó›ôZX€\◊›öY]ÿÇãHYYôZX€H\ôX›‹ûHöY]‹ŒÇàH[ôZX€\¬àH›ÿ⁄»ôZX€\¬àHŸ[ô\ò[õY]ãHYYŸX\ò⁄X‹õ‹‹»ö\⁄XõHôZX€HôYô\ô[òŸHöY[ÀÇãHYYŸ[X›Y\ôX€‹ô]Z[⁄[⁄]Xú»õ‹éÇàH›ô\ùöY]¬àH\‹⁄Y€õY[ùàHŸ\ùöXŸBàH\›‹ûBãHŸ\\‹⁄Y€õY[ùŸ\ùöXŸK[ô\›‹ûH\»Yô\úôY€›\òŸKZ€ô\›[ô[ÀÇãHYY\ÿXõYYôZX€HYôõ‹ô[òŸH[ôõ›[ô\ûH[ô[»ÿ›[Y[ù[ô»]à‹ôX]KŸY]\‹⁄Y€õY[ù]]][€úÀŸ\ùöXŸH€‹öŸõ›À[ô\›‹ûHõ›‹»\ôHõ›à\ùŸà\»\‹ÀÇãHYYZ[ö[X[ô\‹€ú⁄]ôHôZX€\»^[›]›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãîÀìÀ]]\õZ\‹⁄[€àõYÀ›‹òYŸKàôZX€H\‹⁄Y€õY[ùÿ\ù[‹[à€ò\⁄›[ùô[ù‹ûK⁄X⁄€›]YŸ\ãŸ\ùöXŸKàXZ[ù[ò[òŸKÿ›[Y[ù\›‹ûK‹àòX⁄Ÿ[ôôZ]ö[‹à⁄[ôŸYÇãHH€õH›\Xò\ŸHXÿŸ\‹»YY\»H—SP’úõ€HH^\›[ô¬à[ùô[ù‹ûWŸ\›[ò][€ó›ôZX€\◊›öY]ÿ⁄]Hÿ[\â‹»€\öÀ‘›\Xò\ŸH⁄Ÿ[ãÇãHõ»ôZX€H‹ôX]KY]\ò⁄]ôK\‹⁄Y€õY[ùŸ\ùöXŸK‹à\›‹ûH]]][€à]àÿ\»YYÇãHH^\›[ô»ôZX€H\‹⁄Y€õY[ù[Ÿ[[ôÿ\ù[‹[àôZX€H€ò\⁄›ôZ]ö[‹Çàô[XZ[à[ò⁄[ôŸYÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À›ôZX€\À’ôZX€\’€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôHôZX€\»ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»ôZX€\À[[Ÿ[HZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»ÿ[ó€X[òYŸW›ôZX€\ÿ[ô‹[àôZX€\ÀÇçà€€ôö\õHôZX€\»õ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õHö\⁄XõHôZX€Hõ›‹»ÿY⁄\ôHH^\›[ô»ôYô\ô[òŸHöY]»\õZ]¬à[KÇçãà€€ôö\õH[»›ÿ⁄»»Ÿ[ô\ò[õY]ö[\ú»[ôŸX\ò⁄€‹öÀÇçÀà€€ôö\õHYôZX€H\»\ÿXõY[ôõ»\‹⁄Y€õY[ù‹Ÿ\ùöXŸK⁄\›‹ûH]]][€ú¬à\ôH^‹ŸYÇéà€€ù[ùYHHå»ôXùZ[⁄]Hô^›À\ö\⁄»[Ÿ[Húõ€HRQ‘êUS”ó”PTõYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHù]\ôHôZX€H‹ôX]KŸY][ô\‹⁄Y€õY[ùX[òYŸ[Y[ùôYY[à^X⁄]‹ö]Bà€€ùòX›ôYõ‹ôHôZ[ô»‹ùYÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHôXY[€õHôZX€\»RK^\›[ô¬àôZX€K\ôYô\ô[òŸHôXYÀŸ[X›Y\ôX€‹ôô\Ÿ[ù][€ã[ôô\‹€ú⁄]ôBàô\Ÿ[ù][€àÿ€‹KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYHôZX€\»å»ZY‹ò][€àô]\ŸY^\›[ô»ôXY]»[ôúô[XZ[ôY⁄][àTê“UP’TëHåãåÃ»Së—ëà[ùûHMMÇÇà»»[ùûHMMHH‹ù€€»€‹ö‹‹XŸH[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»€€»[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àÃÿçåX
‹ùôZX€\»€‹ö‹‹XŸH»åÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMMÇãHRQ‘êUS”ó”PTõYY[ùYöY\»€€»\»H⁄^›À\ö\⁄»[Ÿ[KÇãHTê“UP’TëHŸX›[€àÕàÿ⁄‹»\»ôX]\ôH\»
äï€€ÿ][Ÿ›YJäãõ›€€à[ùô[ù‹ûKà⁄X⁄€›]\‹⁄Y€õY[ù\›‹ûKTàXô[ÀôZX€Kÿö[à[öÿYŸKõÿÇà[öÿYŸKòX⁄⁄[ô»\›‹ûK]Y]XõK€€\‹X⁄YöX»\õZ\‹⁄[€àõY‹À[ôà\ò⁄\ŸHXÿ€›[ù[ô»ô[XZ[àô\Ÿ\ùôYÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»€€’€‹ö‹‹XŸX[Ÿ[H[ô\à‹òÀ€[Ÿ[\À›€€ÀÿÇãHôY⁄\›\ôYH€€»ÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYH€€»[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôX⁄[Bàô\Ÿ\ùö[ô»H^\›[ô»ÿ[ìX[òYŸU€€ÿõ›]K€ò]àÿ]KÇãHYY[à]][ùXÿ]YôXY[€õHÿ][Ÿ›YH€⁄»\⁄[ô»H^\›[ô¬àXõXÀù€€ÿXõKÇãHYY€€ÿ][Ÿ›YHöY]‹ŒÇàHX›]ôH€€¬àHZ\‹⁄[ô¬àH\ò⁄]ôYãHYYŸX\ò⁄X‹õ‹‹»ö\⁄XõH€€ÿ][Ÿ›YHöY[ÀÇãHYYŸ[X›Y\ôX€‹ô]Z[⁄[⁄]Xú»õ‹éÇàH›ô\ùöY]¬àHÿÿ][€ÇàH\‹⁄Y€õY[ùàH\›‹ûBãHŸ\ÿÿ][€ã\‹⁄Y€õY[ù[ô\›‹ûH€›\òŸKZ€ô\›ûH⁄›⁄[ô»›\úô[ùàÿ][Ÿ›YHXŸZ€\àöY[»[ôô\Ÿ\ùôY\›]H[ô[»ò]\à[à[ùô[ù[ô¬à›\›ŸK›‹òYŸKò[úŸô\ã‹à\›‹ûHôZ]ö[‹ãÇãHYY\ÿXõYY€€Yôõ‹ô[òŸH[ôõ›[ô\ûH[ô[»ÿ›[Y[ù[ô»]à‹ôX]KŸY]ÿ\ò⁄]ôK⁄X⁄€›]ÿ›\›ŸK[ôö[ò[ò⁄X[öY[»\ôHõ›\ùŸÇà\»\‹ÀÇãHYYZ[ö[X[ô\‹€ú⁄]ôH€€»^[›]›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãîÀìÀ]]\õZ\‹⁄[€àõYÀ›‹òYŸKà⁄X⁄€›]\‹⁄Y€õY[ùTãôZX€Kÿö[à[öÿYŸKòX⁄⁄[ô»\›‹ûK]Y]à\ò⁄\ŸHXÿ€›[ù[ôÀ‹àòX⁄Ÿ[ôôZ]ö[‹à⁄[ôŸYÇãHH€õH›\Xò\ŸHXÿŸ\‹»YY\»H—SP’úõ€H^\›[ô»XõXÀù€€ÿ⁄]àHÿ[\â‹»€\öÀ‘›\Xò\ŸH⁄Ÿ[ãÇãHõ»€€‹ôX]KY]\ò⁄]ôK⁄X⁄€›]\‹⁄Y€õY[ù‹à\›‹ûH]]][€à]àÿ\»YYÇãHHå»€‹H^X⁄]Hô\Ÿ\ùô\»ŸX›[€àÕâ‹»ÿ][Ÿ›YK[€õHõ›[ô\ûKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À›€€À’€€’€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãH›]X»ÿÿ[à€€ôö\õYYH€€»[Ÿ[H€õHÿ[»úõ€J	›€€… Xõ‹à—SP’à[ô€€ùZ[ú»õ»[úŸ\ù›\]KŸ[]K›\Ÿ\ù‹úÀ‹›‹òYŸK›\ÿYŸ›€õÿY⁄Y€ôYàTìÿ[ÀÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôH€€»ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»€€À[[Ÿ[HZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»ÿ[ó€X[òYŸW›€€ÿ[ô‹[à€€ÀÇçà€€ôö\õH€€»õ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õHX›]ôK€Z\‹⁄[ôÀÿ\ò⁄]ôYöY]‹»[ôŸX\ò⁄ô[ô\à€‹úôX›KÇçãà€€ôö\õHY€€\»\ÿXõY[ôõ»⁄X⁄€›]ÿ\‹⁄Y€õY[ù⁄\›‹ûH]]][€ú»\ôBà^‹ŸYÇçÀà€€ù[ùYHHå»ôXùZ[⁄]Hô^›À\ö\⁄»[Ÿ[Húõ€BàRQ‘êUS”ó”PTõYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHù]\ôH€€ÿ][Ÿ›YH‹ö]\»⁄›[ôH‹ùY€õHYù\àX⁄Y[ô»⁄]\àå¬à⁄›[ô\Ÿ\ùôHH^\›[ô»ÿ[ó€X[òYŸW⁄[ùô[ù‹ûXì»‹ö]Hÿ]H‹à[Y€àRBàõ›][ôÀÿ€‹H⁄]H]\à€€\‹X⁄YöX»\õZ\‹⁄[€à[Ÿ[ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHôXY[€õH€€ÿ][Ÿ›YHRK^\›[ô¬àXõXÀù€€ÿôXYÀŸ[X›Y\ôX€‹ôô\Ÿ[ù][€ã[ôô\‹€ú⁄]ôBàô\Ÿ[ù][€àÿ€‹KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH€€»å»ZY‹ò][€àô]\ŸY^\›[ô»ôXY]»[ôúô[XZ[ôY⁄][àTê“UP’TëHåãåÃ»Së—ëà[ùûHMMKÇÇà»»[ùûHMMàH‹ù[\ﬁYY\»€‹ö‹‹XŸH[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»[\ﬁYY\»[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àŸNéYYò
‹ù€€»€‹ö‹‹XŸH»åÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMMXÇãHRQ‘êUS”ó”PTõYY[ùYöY\»[\ﬁYY\»\»HŸ]ô[ù[Ÿ[H[ôõ›\»]àRHôYY»Hô\Ÿ[ù][€ãX€€ùòX›]Y]ÇãHHô\Ÿ\ùôYåà[\ﬁYY\»€‹ö‹‹XŸH\ŸYH^\›[ô¬à[ùô[ù‹ûWŸ\›[ò][€ó›\Ÿ\ú◊›öY]ÿôXY]à\»å»‹ùô]\Ÿ\»]à]][ùXÿ]YôYô\ô[òŸHöY]»[ôŸ\»õ›‹ôX]HHô]»à‹àY[ù]H]Bà€€ùòX›ÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»[\ﬁYY\’€‹ö‹‹XŸX[Ÿ[H[ô\à‹òÀ€[Ÿ[\ÀŸ[\ﬁYY\ÀÿÇãHôY⁄\›\ôYH[\ﬁYY\»ÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYH[\ﬁYY\»[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôX⁄[Bàô\Ÿ\ùö[ô»H^\›[ô»ÿ[ìX[òYŸQ[\ﬁYY\ÿõ›]K€ò]àÿ]KÇãHYY[à]][ùXÿ]YôXY[€õH\ôX›‹ûH€⁄»\⁄[ô¬à[ùô[ù‹ûWŸ\›[ò][€ó›\Ÿ\ú◊›öY]ÿÇãHYY[\ﬁYYH\ôX›‹ûH[ô^H[ôõ‹õX][€àöY]‹ÀÇãHYYŸX\ò⁄X‹õ‹‹»ö\⁄XõH\‹^Hò[YK[XZ[õ€K[ô]ö\⁄[€àöY[ÀÇãHYYŸ[X›Y\ôX€‹ô]Z[⁄[⁄]Xú»õ‹éÇàH›ô\ùöY]¬àH€€ùX›àH\‹⁄Y€õY[ù¬àHX›]ö]BãHŸ\€€ùX›\‹⁄Y€õY[ù[ôX›]ö]HôY⁄[€ú»€›\òŸKZ€ô\›ûH⁄›⁄[ô»€õBàöY[»^‹ŸYûHH^\›[ô»ôYô\ô[òŸHöY]»[ôô\Ÿ\ùö[ô»›\àŸX›[€úÀÇãHYY\ÿXõY‹ôX]H[\ﬁYYHYôõ‹ô[òŸH[ôõ›[ô\ûH[ô[»ÿ›[Y[ù[ô»]ààôX€‹ôÀXÿ€›[ù‹ôX][€ãõ€HY]À\õZ\‹⁄[€àY]À[ôY][€ò[RBàöY[»\ôHõ›\ùŸà\»\‹ÀÇãHYYZ[ö[X[ô\‹€ú⁄]ôH[\ﬁYY\»^[›]›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãîÀìÀ]]\õZ\‹⁄[€àõYÀ€\ö»Y[ù]Kàà€›\òŸHôX€‹ôõ€K\õZ\‹⁄[€à›ô\úöYKôZX€K›€€⁄õÿà\‹⁄Y€õY[ùàÿ›[Y[ùX›]ö]KZ\›‹ûK‹àòX⁄Ÿ[ôôZ]ö[‹à⁄[ôŸYÇãHH€õH›\Xò\ŸHXÿŸ\‹»YY\»H—SP’úõ€H^\›[ô¬à[ùô[ù‹ûWŸ\›[ò][€ó›\Ÿ\ú◊›öY]ÿ⁄]Hÿ[\â‹»€\öÀ‘›\Xò\ŸH⁄Ÿ[ãÇãHõ»[\ﬁYYH‹ôX]KY]\ò⁄]ôKõ€K\õZ\‹⁄[€ã€\öÀ[ùö]][€ã‹ÇàY[ù]H]]][€à]ÿ\»YYÇãH€õHHöY[»^‹ŸYûHH^\›[ô»ôYô\ô[òŸHöY]»\ôHô[ô\ôYÇà€\ö◊›\Ÿ\ó⁄Y\‹^W€ò[YX[XZ[õ€X[ô]ö\⁄[€òÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\ÀŸ[\ﬁYY\À—[\ﬁYY\’€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãH›]X»ÿÿ[à€€ôö\õYYH[\ﬁYY\»[Ÿ[H€õHÿ[¬àúõ€J	⁄[ùô[ù‹ûWŸ\›[ò][€ó›\Ÿ\ú◊›öY]… Xõ‹à—SP’[ô€€ùZ[ú»õ¬à[úŸ\ù›\]KŸ[]K›\Ÿ\ù‹úÀ‹›‹òYŸK›\ÿYŸ›€õÿY⁄Y€ôYTìÿ[ÀÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôH[\ﬁYY\»ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»[\ﬁYY\À[[Ÿ[HZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»ÿ[ó€X[òYŸWŸ[\ﬁYY\ÿ[ô‹[à[\ﬁYY\ÀÇçà€€ôö\õH[\ﬁYY\»õ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õH[\ﬁYYH\ôX›‹ûK^H[ôõ‹õX][€ã[ôŸX\ò⁄ô[ô\à€‹úôX›KÇçãà€€ôö\õH‹ôX]H[\ﬁYYH\»\ÿXõY[ôõ»õ€K‹\õZ\‹⁄[€ã–€\öÀ⁄Y[ù]Bà]]][€ú»\ôH^‹ŸYÇçÀà€€ù[ùYHHå»ôXùZ[⁄]Hô^›À\ö\⁄»[Ÿ[Húõ€BàRQ‘êUS”ó”PTõYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHù]\ôH[\ﬁYYH‹ôX]KŸY][ôöX⁄\àRHöY[»ôYY[à^X⁄]€›\òŸH[ôàö\⁄Xö[]H€€ùòX›ôYõ‹ôHôZ[ô»‹ùYÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHôXY[€õH[\ﬁYY\»RK^\›[ô¬à\Ÿ\ã\ôYô\ô[òŸHôXYÀŸ[X›Y\ôX€‹ôô\Ÿ[ù][€ã[ôô\‹€ú⁄]ôBàô\Ÿ[ù][€àÿ€‹KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH[\ﬁYY\»å»ZY‹ò][€àô]\ŸY^\›[ô»ôXY]»[ôúô[XZ[ôY⁄][àTê“UP’TëHåãåÃ»Së—ëà[ùûHMMãÇÇà»»[ùûHMM»H‹ù⁄[\»€‹ö‹‹XŸH[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»⁄[\»[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àçXNLŒ
‹ù[\ﬁYY\»€‹ö‹‹XŸH»åÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMMòÇãHRQ‘êUS”ó”PTõYY[ùYöY\»⁄[\»\»HZY⁄[Ÿ[KÇãH^\›[ô»⁄[\»\ŸHKÃêHôZ]ö[‹à[ôXYH]ôY[à\ŸT⁄[\ÿà⁄[\‘[ô[ÿH⁄[\◊ ò›\Xò\ŸHXõ\À[ôàô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»⁄[\’€‹ö‹‹XŸX‹ò\\à[ô\à‹òÀ€[Ÿ[\À‹⁄[\ÀÿÇãHôY⁄\›\ôYH⁄[\»ÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYH⁄[\»[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôXÇãHô]\ŸYH^\›[ô»\ŸT⁄[\ÿ€⁄»õ‹à]][ùXÿ]YŸ][ô‹Àà€€ùô\úÿ][€úÀY\‹ÿYŸ\À[ôÿ\K‹⁄[\ÀX⁄]ô\]Y\›ÀÇãHô]\ŸYH^\›[ô»⁄[\’€‹ö‹‹XŸT[ô[⁄]RHò]\à[à‹ôX][ô»Hô]¬à⁄][\[Y[ù][€ãÇãH€‹úôX›Y‹õX[ùô[]]ôH[\‹ù»[à⁄[\‘[ô[Àöúﬁ€»H^òX›Yà[ô[ô\€€ô\»H⁄\ôYRH€€\€ô[ù»[ô⁄[\»[\à€‹Húõ€H]»å¬à[Ÿ[Hÿÿ][€ãÇãHYYô\‹€ú⁄]ôH⁄[\»€‹ö‹‹XŸK€€ùô\úÿ][€à\›Y\‹ÿYŸH\›[ôà€€\‹Ÿ\à›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãîÀìÀ]]›‹òYŸK\õZ\‹⁄[€àõYÀ‹Çàù\⁄[ô\‹ÀY]HXõHôZ]ö[‹à⁄[ôŸYÇãHõ»ô]YûHù[ò›[€àôZ]ö[‹à⁄[ôŸYÇãHõ»Ÿ\ùöXŸK\õ€H›\Xò\ŸH]ÿ\»YYÇãHõ»ù\⁄[ô\‹ÀY]H‹ö]Hÿ\Xö[]Hÿ\»YYÇãH⁄[\»›[\Ÿ\»Hÿ[\â‹»€\öÀ‘›\Xò\ŸH⁄Ÿ[àõ‹à€Y[ù\⁄YHXõBàôXYÀ›‹ö]\À[ôH^\›[ô»ô]YûHù[ò›[€à[ôõ‹òŸ\»Bà⁄[\◊‹Ÿ][ô‹Àú⁄[\◊Ÿ[òXõY⁄[›⁄]⁄ôYõ‹ôHH€]YHÿ[ÇãHHõÿ][ô»⁄[\»ùXòõHÿ\»õ›ôZ[ùõŸXŸY[à\»\‹Œ»€õHBàYXÿ]Y‹⁄[\ÿ€‹ö‹‹XŸHõ›]Hÿ\»XYH]ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À‹⁄[\À‘⁄[\’€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹⁄[\À‘⁄[\‘[ô[ÀöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHõŸHKX⁄X⁄»ô]YûKŸù[ò›[€úÀ‹⁄[\ÀX⁄]öúÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãH›\Xò\ŸH⁄[ôŸ[Ÿ»ÿ\»⁄X⁄ŸYõ‹àô[]ò[ùúôXZ⁄[ô»⁄[ôŸ\Œ»õ€ôHYôôX›Yà\»^\›[ô»€Y[ù\⁄YH›\Xò\ŸH\ÿYŸKÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôH⁄[\»ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»⁄[\À[[Ÿ[HZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à[ô‹[à⁄[\ÀÇçà€€ôö\õH⁄[\»õ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õH€€ùô\úÿ][€ú»ÿYHô]»Y\‹ÿYŸHÿ[àôH\Y[ôH€€\‹Ÿ\Çà[ô\»Hô\‹€úŸKŸ\úõ‹à›]H€X[õKÇçãà€€ù[ùYHHå»ôXùZ[⁄]Hô^›À\ö\⁄»[Ÿ[Húõ€BàRQ‘êUS”ó”PTõYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHù]\ôH⁄[\»€‹ö»⁄›[X⁄YHŸ\\ò][H⁄]\à»ôZ[ùõŸXŸHHõÿ][ô¬àùXòõH€ÿò[H[àåÀÇãH⁄[\»]ôK\ô\‹€úŸHôZ]ö[‹à\[ô»€àH›\úô[ùô]YûBà“ST◊–Sïì‘P◊–TW“—VX[ùö\õ€õY[ùò\öXXõKÇãHûX[à€€ôö\õYY⁄[\»\»€€Ÿ»€»[àõŸX›[€ãù]õ›YHõ€ãXõÿ⁄⁄[ô»RBàùY»õ‹à]\éà⁄[àHô]»⁄]\»Ÿ[ùHÿ‹ôY[àù[\»»H‹ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHH^\›[ô»⁄[\»€⁄À^\›[ô¬à›\Xò\ŸHXõ\À‘ìÀ^\›[ô»ô]YûHù[ò›[€àõ›]K[ôYXÿ]Y€‹ö‹‹XŸBàô\Ÿ[ù][€àÿ€‹KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH⁄[\»å»ZY‹ò][€àô]\ŸYHÿ⁄ŸY^\›[ô¬î⁄[\»€Y[ùŸù[ò›[€à]»[ôô[XZ[ôY⁄][àTê“UP’TëHåãåÃ»Së—ëÇë[ùûHMMÀÇÇà»»[ùûHMNH‹ù\›[X]\»€‹ö‹‹XŸH[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»\›[X]\»[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àçŒLòMÿ
òX⁄»⁄[\»ÿ‹õ€õ€›À]\
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMMÿÇãHRQ‘êUS”ó”PTõYY[ùYöY\»\›[X]\»\»Hö[ù[Ÿ[H[ôÿ[»›]à€ò\⁄›[[]]Xö[]H\»HŸ^H[ùò\öX[ù»ô\Ÿ\ùôKÇãHö[‹à[ùöY\»M[ôMH€€ôö\õYYHô\‹⁄]‹ûH^‹Ÿ\»\›[X]Bà\õZ\‹⁄[€ú»ù]õ›[à\õ›ôYõŸX›[€à\›[X]HôXY[Ÿ[‹Çàõÿã]ÀQ\›[X]Hô[][€ú⁄\[à\»RH^Y\ãÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»\›[X]\’€‹ö‹‹XŸX[Ÿ[H[ô\à‹òÀ€[Ÿ[\ÀŸ\›[X]\ÀÿÇãHôY⁄\›\ôYH\›[X]\»ÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYH\›[X]\»[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôX⁄[Bàô\Ÿ\ùö[ô»H^\›[ô»ÿ[ë\›[X]X»ÿ[ê\õ›ôQ\›[X]\ÿõ›]K€ò]àÿ]KÇãHôXùZ[HXÿŸ\Y\›[X]\»õ›[ô][€à⁄\Húõ€HHô\Ÿ\ùôYåàRNÇàH\›[X]HöY]‹»òZ[àHúõ›‹ŸHú»^X⁄]‹ôX]H[ŸBàH\ôX›‹ûH›\ôòXŸBàHŸ[X›Y\ôX€‹ôXY\à[ô\ÿXõY]Z[Xú¬àH€ò\⁄›»›]\»»\õ›ò[õ›[ô\ûH[ô[¬àHÿ⁄ŸY\›[X]K\›]\»õÿÿXù[\ûBãHŸ\H[Ÿ[H€›\òŸKZ€ô\›ûH⁄›⁄[ô»H‹\ò][€ò[⁄[⁄]›]àòXúöXÿ][ô»\›[X]Hõ›‹ÀöX⁄[ô»ò[Y\À\õ›ò[À€ò\⁄›À‹à[öŸYàõÿúÀÇãHYYZ[ö[X[ô\‹€ú⁄]ôH\›[X]\»^[›]›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãîÀìÀ]]›‹òYŸK\õZ\‹⁄[€àõYÀà\›[X]HXõK€ò\⁄›XõKõÿàô[][€ú⁄\‹àòX⁄Ÿ[ôôZ]ö[‹Çà⁄[ôŸYÇãHõ»›\Xò\ŸH€Y[ùôXY]ÿ\»YYôXÿ]\ŸH\ôH\»õ›Y][à\õ›ôYàõŸX›[€à\›[X]HôXY[Ÿ[[à\»RH^Y\ãÇãHõ»\›[X]H‹ôX]KY]\õ›ò[\ò⁄]ôK[]KöX⁄[ôÀ€ò\⁄›õÿÇà\⁄ùYŸ]‹àÿ›[Y[ù‹ö]H]ÿ\»YYÇãH\›[X]W‹€ò\⁄›ÿ[[]]Xö[]Hô[XZ[ú»[ù›X⁄Y»\»\‹»Ÿ\»õ›Y]à€ò\⁄›öYŸŸ\úÀÿ⁄ŸYõ›‹À‹à[ûH€ò\⁄›]]][€àôZ]ö[‹ãÇãHõ›X›YöX⁄[ô»ô[XZ[ú»ô\Ÿ[ùY\»\õZ\‹⁄[€ãYÿ]Yù]\ôH›]H€õKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\ÀŸ\›[X]\À—\›[X]\’€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãH›]X»ÿÿ[àŸà‹òÀ€[Ÿ[\ÀŸ\›[X]\À—\›[X]\’€‹ö‹‹XŸKöúﬁõ›[ôõ¬à›\Xò\ŸH€Y[ùôúõ€JããäX[úŸ\ù\]K[]K\Ÿ\ùîÀ›‹òYŸKà‹àô]⁄ÿ[ÀÇãH›\Xò\ŸH⁄[ôŸ[Ÿ»ÿ\»⁄X⁄ŸYõ‹àô[]ò[ùúôXZ⁄[ô»⁄[ôŸ\Œ»õ€ôHYôôX›Yà\»ô\Ÿ[ù][€ã[€õH\›[X]\»‹ùÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôH\›[X]\»ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»\›[X]\À[[Ÿ[HZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»ÿ[óŸ\›[X]X‹àÿ[óÿ\õ›ôWŸ\›[X]\ÿ[ôà‹[à\›[X]\ÀÇçà€€ôö\õH\›[X]\»õ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õHúõ›‹ŸKÿ‹ôX]H[ŸKŸX\ò⁄[\H›]K\ÿXõY]Z[XúÀ[ôà€ò\⁄›‹›]\»õ›[ô\ûH[ô[»ô[ô\à€‹úôX›KÇçãà€€ù[ùYHHå»ôXùZ[⁄]Hô^[Ÿ[Húõ€HRQ‘êUS”ó”PTõYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHù]\ôH]ôH\›[X]\»€‹ö»ôYY»[à\õ›ôY\›[X]HXõK‹ôXY[Ÿ[àõÿã]ÀQ\›[X]Hô[][€ú⁄\‹ôX]KŸY]€€ùòX›\õ›ò[õ›À[ôà€ò\⁄›‹ö]H€€ùòX›ôYõ‹ôHôX[ôX€‹ô»‹àX›[€ú»ÿ[àôHYYÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHô\Ÿ[ù][€ã[€õH\›[X]\»€‹ö‹‹XŸBàÿ€‹H[ô[Xô\ò][H]õ⁄YY\›[X]H]HôXYÀ›‹ö]\»[ô€ò\⁄›àôZ]ö[‹ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH\›[X]\»å»ZY‹ò][€àXYHH[ôXYHXÿŸ\Yôõ›[ô][€à⁄[]ôH[ôYõ›⁄[ôŸHÿ⁄[XKìÀôXY[Ÿ[À‹ö]H]Àò\õ›ò[ôZ]ö[‹ã‹à€ò\⁄›[[]]Xö[]H[ô\àTê“UP’TëHåãåÃ¬íSë—ëà[ùûHMNÇÇà»»[ùûHMNHH‹ùõÿú»€‹ö‹‹XŸHõ›[ô][€à[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»õÿú»[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àŸLÃNò
‹ù\›[X]\»€‹ö‹‹XŸH»åÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMNÇãHRQ‘êUS”ó”PTõYY[ùYöY\»õÿú»\»H[ù[Ÿ[H[ôH\ôŸ\›àZY‹ò][€à€XŸKÇãHTê“UP’TëHŸX›[€ú»ŒM»ÿ⁄»HúõÿYõÿú»›\ôòXŸKà\»\‹»[ù[ù[€ò[Bà‹ù»Hö\ú›ÿYôHå»€XŸH€õNàõÿú»õ›[ô][€àôXY‹ô\Ÿ[ù][€ãÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»õÿú’€‹ö‹‹XŸX[Ÿ[H[ô\à‹òÀ€[Ÿ[\À⁄õÿúÀÿÇãHôY⁄\›\ôYHõÿú»ÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYHõÿú»[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôX⁄[Bàô\Ÿ\ùö[ô»H[ôÿ]Y]][ùXÿ]Y]\Ÿ\àõ›]K€ò]à[Ÿ[õ›Y[àBàôY⁄\›ûKÇãHYY[à]][ùXÿ]YôXY[€õH\ôX›‹ûH€⁄»\⁄[ô»H^\›[ô¬àXõXÀöõÿúÿXõH[ôHÿ[\â‹»€\öÀ‘›\Xò\ŸH⁄Ÿ[ãÇãHYYõÿú»öY]‹ŒÇàHX›]ôHõÿú¬àH€à€àH€€\]YàHÿ[òŸ[YàH[ö\⁄XõBãHYYŸX\ò⁄X‹õ‹‹»ö\⁄XõHõÿú»õ›[ô][€àöY[ÀÇãHYYŸ[X›YZõÿà]Z[⁄[⁄]Hÿ⁄ŸYŸX›[€àà‹ö^õ€ù[XÇà⁄\NÇàH›ô\ùöY]¬àH]Z[¬àHX]\öX[¬àHù^[›]àHò[úÿX›[€ú¬àHö[ò[ò⁄X[À€õH⁄[àÿ[ïöY]—ö[ò[ò⁄X[ÿ\»ùYBàHÿ›[Y[ù¬àHÿ⁄Y[BãHXYH›ô\ùöY]»[ô]Z[»ô[ô\à^\›[ô»XõXÀöõÿúÿöY[ÀÇãHŸ\X]\öX[Àù^[›]ò[úÿX›[€úÀö[ò[ò⁄X[Àÿ›[Y[ùÀ[ôÿ⁄Y[Bà€›\òŸKZ€ô\›⁄]ô\Ÿ\ùôY\›]H[ô[»ò]\à[à‹ù[ô»Z\àôXY»‹Çà‹ö]\»[à\»ö\ú›õÿú»€XŸKÇãHYY^X⁄]‹ôX]Hõÿà[ŸH\»Hõ€ã]‹ö][ô»›]H]ÿ›[Y[ù»⁄]\ÇàHŸ\‹⁄[€à\»ÿ[ê‹ôX]RõÿúÿÇãHYYõ›[ô\ûH[ô[»ÿ›[Y[ù[ô»]\‹›YH»õÿãùYŸ]Ÿö[ò[ò⁄X[ò[Y\Ààÿ›[Y[ùÀ[ôÿ⁄Y[Hô[XZ[àYô\úôYÇãHYYZ[ö[X[ô\‹€ú⁄]ôHõÿú»^[›]›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãîÀìÀ]]›‹òYŸK\õZ\‹⁄[€àõYÀà[ùô[ù‹ûK⁄X⁄€›]ò[úÿX›[€ãùYŸ]ÿ›[Y[ùÿ⁄Y[KX]\öX[àù^[›]\›[X]K‹àòX⁄Ÿ[ôôZ]ö[‹à⁄[ôŸYÇãHH€õH›\Xò\ŸHXÿŸ\‹»YY\»H—SP’úõ€H^\›[ô»XõXÀöõÿúÿ⁄]àHÿ[\â‹»€\öÀ‘›\Xò\ŸH⁄Ÿ[ãÇãHõ»õÿà‹ôX]KY]\ò⁄]ôK[]KX]\öX[ù^[›]⁄X⁄€›][ôŸôãàò[úÿX›[€ãö[ò[ò⁄X[ÿ›[Y[ùÿ⁄Y[K‹à\›[X]K[[ö»‹ö]H]ÿ\¬àYYÇãHõ»õÿó€X]\öX[ÿõÿóÿù^[›]€[ô\ÿõÿóÿùYŸ]€[ô\ÿàõÿó›ò[úÿX›[€ó€Ÿÿÿ›[Y[ùÿõÿó‹ÿ⁄Y[W⁄][\ÿàò[úÿX›[€ó⁄][\ÿ[ùô[ù‹ûW›ò[úÿX›[€úÿ‹à[ùô[ù‹ûWÿò[[òŸ\ÿôXY¬àŸ\ôHYYÇãH\‹›YH»õÿòô[XZ[ú»[ö[\[Y[ùY[àåŒ»ÿ\ùÿ⁄X⁄€›]ôZ]ö[‹à[ôà[ùô[ù‹ûHò[[òŸH\ö]ò][€à\ôH[ù›X⁄YÇãHö[ò[ò⁄X[ò[Y\»ô[XZ[à€Z]Y[ù\ô[HôXÿ]\ŸH\»ö\ú›õÿú»€XŸHŸ\¬àõ›Ÿ[X›[ûHùYŸ]ÿX›X[ÿXÿ€›[ù[ô»XõKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãH›]X»ÿÿ[à€€ôö\õYY‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁ€õHÿ[¬àúõ€J	⁄õÿú… Xõ‹à—SP’[ô€€ùZ[ú»õ»[úŸ\ù\]K[]K\Ÿ\ùàîÀ›‹òYŸKô]⁄[ùô[ù‹ûHò[[òŸKò[úÿX›[€ãX]\öX[ù^[›]àùYŸ]ÿ›[Y[ù‹àÿ⁄Y[H]HXÿŸ\‹ÀÇãH›\Xò\ŸH⁄[ôŸ[Ÿ»ÿ\»⁄X⁄ŸYõ‹àô[]ò[ùúôXZ⁄[ô»⁄[ôŸ\ÀàH›\úô[ùà]HTH‹ò[ù⁄[ôŸHX]\ú»õ‹àô]€H‹ôX]YXõX»Xõ\Àù]\»\‹¬à€õHô]\Ÿ\»H^\›[ô»XõXÀöõÿúÿXõH[ôY»õ»ZY‹ò][€ãÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôHõÿú»ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»õÿú»õ›[ô][€àZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à[ô‹[àõÿúÀÇçà€€ôö\õHõÿú»õ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õHõÿàõ›‹»ÿYöY]»ö[\úÀ‹ŸX\ò⁄€‹öÀ[ôŸ[X›YZõÿÇà›ô\ùöY]À—]Z[»ô[ô\à€‹úôX›KÇçãà€€ôö\õH‹ôX]Hõÿà\»õ€ã]‹ö][ô»[ôX]öY\à›Xõ[Ÿ[HXú»⁄›»Yô\úôYà›]\»€õKÇçÀàX⁄YHHô^õÿú»€XŸHôYõ‹ôH‹ù[ô»‹ö]\»‹à›Xõ[Ÿ[HôXYÀÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHù]\ôHõÿú»€‹ö»⁄›[ôH‹][Xô\ò][NÇàH€€ùõ€Y‹ôX]KŸY]ÿ\ò⁄]ôN¬àHõÿàX]\öX[\›¬àHù^[›]¬àHò[úÿX›[€ú»ôXY[€õHŸŒ¬àHö[ò[ò⁄X[À–ùYŸ]õ›[ô][€é¬àHÿ›[Y[ùŒ¬àHÿ⁄Y[N¬àH\‹›YH»õÿà[ôŸôà€õHYù\à]»ô\]Z\ôY]ôHôYõY⁄ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHH^\›[ô»õÿú»õ›[ô][€àXõHôXYà][ôŸ[X›Y\ôX€‹ôô\Ÿ[ù][€àÿ€‹KÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYHõÿú»å»ZY‹ò][€àXYH€õHHôXY[€õHõÿú¬ôõ›[ô][€à€XŸH]ôH[ôYõ›⁄[ôŸHÿ⁄[XKìÀ\õZ\‹⁄[€úÀ‹ö]\Àö[ùô[ù‹ûH[›ô[Y[ù⁄X⁄€›]ôZ]ö[‹ãö[ò[ò⁄X[Àÿ›[Y[ùÀÿ⁄Y[K‹Çí\‹›YH»õÿà[ô\àTê“UP’TëHåãåÃ»Së—ëà[ùûHMNKÇÇà»»[ùûHMåH‹ù[ùô[ù‹ûHôXY€‹ö‹‹XŸH[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»[ùô[ù‹ûH[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àçLYò
‹ùõÿú»õ›[ô][€à€‹ö‹‹XŸH»åÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMNXÇãHRQ‘êUS”ó”PTõYY[ùYöY\»[ùô[ù‹ûH\»H[]ô[ù[Ÿ[H[ôÿ[»›]àÿ\ù⁄X⁄€›]YŸ\ã€›[ùÀ[ô›ô\ôò]»ÿ⁄‹»\»H[úŸ\›[ùò\öX[ùàÿY[àH\ÇãHHô\Ÿ\ùôYåàúõ€ù[ô[ôXYHô]Z[ôYH‹ö]Xÿ[[ùô[ù‹ûH€⁄‹ŒÇà\ŸR[ùô[ù‹ûTôXY[Ÿ[\ŸR[ùô[ù‹ûUò[úÿX›[€í\›‹ûXà\ŸR[ùô[ù‹ûPÿ\ù€›[ù€⁄‹À[ôö[ãZ][Hô]\ô[Y[ùÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»[ùô[ù‹ûU€‹ö‹‹XŸX[Ÿ[H[ô\à‹òÀ€[Ÿ[\À⁄[ùô[ù‹ûKÿÇãHôY⁄\›\ôYH[ùô[ù‹ûHÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYH[ùô[ù‹ûH[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôX⁄[Bàô\Ÿ\ùö[ô»H^\›[ô»ÿ[í[ùô[ù‹ûUò[úÿX›[€úÿ»ÿ[ìX[òYŸR[ùô[ù‹ûXàõ›]K€ò]àÿ]KÇãHô]\ŸYHô]Z[ôY\ŸR[ùô[ù‹ûTôXY[Ÿ[€⁄»õ‹à]][ùXÿ]YôXY[[Ÿ[à]KÇãHô]\ŸYHô]Z[ôY\ŸR[ùô[ù‹ûUò[úÿX›[€í\›‹ûX€⁄»õ‹àHôXY[€õBàò[úÿX›[€à\›‹ûH›\ôòXŸKÇãHYY[ùô[ù‹ûHöY]‹ŒÇàHÿ][Ÿ›YBàH›‹òYŸBàH⁄X⁄€›]ÿ[ôY]\¬àH\›[ò][€ú¬àHò[úÿX›[€à\›‹ûBàHô\Ÿ\ùôY€€ùõ€¬ãHYY›[[X\ûHÿ\ô»õ‹àX›]ôH][\À›‹òYŸKÿö[à€›[ùÀö[ãZ][Kÿò[[òŸBà€›[ùÀ[ôÿ\ùXÿ[ôY]Hô]öY]»õ›‹ÀÇãHYYõ›[ôY€Y[ù\⁄YHö[\ö[ô»›ô\à›\úô[ùô]öY]»õ›‹ÀÇãHYYôXY[€õHXõ\»õ‹éÇàHX›]ôHÿ][Ÿ›YHô]öY]¬àH›‹òYŸH[ö]ô]öY]¬àHö[àô]öY]¬àH⁄X⁄€›]ÿ[ôY]\¬àH\Ÿ\à\›[ò][€àôYô\ô[òŸ\¬àHôZX€H\›[ò][€àôYô\ô[òŸ\¬àHò[úÿX›[€à\›‹ûHõ›Y⁄ôXY⁄[ùô[ù‹ûW›ò[úÿX›[€ó⁄\›‹ûXãHYY^X⁄]õ›[ô\ûH[ô[»õ‹àÿ\ùÿ⁄X⁄€›]€›[ù€‹úôX›[€ã[ôàò[úÿX›[€ãY\ö]ôYò[[òŸ\ÀÇãHYYZ[ö[X[ô\‹€ú⁄]ôH[ùô[ù‹ûH^[›]›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãîÀìÀ]]›‹òYŸK\õZ\‹⁄[€àõYÀàÿ\ù⁄X⁄€›]€›[ùö[àô]\ô[Y[ù[ùô[ù‹ûHò[úÿX›[€ãò[[òŸKà\›[ò][€ãTãXÿ€›[ù[ôÀ‹àòX⁄Ÿ[ôôZ]ö[‹à⁄[ôŸYÇãHõ»\ŸR[ùô[ù‹ûPÿ\ù€›[ù€›[ùX€‹úôX›[€ã€›[ùZ[ùZŸK€›[ù\⁄Y]‹Çàö[ãZ][K\ô]\ô[Y[ù‹ö]H›\ôòXŸHÿ\»⁄\ôY[à\»\‹ÀÇãHõ»ÿ\ù‹[ãÿ\ùY‹ô[[›ôK⁄X⁄€›]ö[ò[^ôK€›[ù€‹úôX›[€ã€›[ùà[ùZŸKö[ãZ][Hô]\ô[Y[ù\ò⁄]ôKXô[Ÿ[ô\ò][€ãò[úŸô\ã‹àTàÿÿ[ÇàX›[€àÿ\»YYÇãHõ»\ôX›[ùô[ù‹ûWÿò[[òŸ\ÿ‹ö]H]ÿ\»YYàò[[òŸH]Hô[XZ[ú¬àò[úÿX›[€ãY\ö]ôY[ôŸ\ùô\ãX€€ùõ€YÇãHH€õHX›]ôH]H]»\ôHH^\›[ô»ô]Z[ôY[ùô[ù‹ûHôXY€⁄‹»[ôàH^\›[ô»ôXY⁄[ùô[ù‹ûW›ò[úÿX›[€ó⁄\›‹ûXîÀÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄[ùô[ù‹ûK“[ùô[ù‹ûU€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãH›]X»ÿÿ[àŸà‹òÀ€[Ÿ[\À⁄[ùô[ù‹ûK“[ùô[ù‹ûU€‹ö‹‹XŸKöúﬁõ›[ôõ¬à[úŸ\ù\]K[]K\Ÿ\ùÿ\ùYö[ò[^ôK€‹[ãÿY‹ô[[›ôHîÀ\⁄Xÿ[à€›[ù‹ö]K€›[ùZ[ùZŸH‹ö]Kö[ã\ô]\ô[Y[ù‹ö]K‹Çà[ùô[ù‹ûWÿò[[òŸ\ÿ]]][€à]ÇãH›]X»ÿÿ[à€€ôö\õYY[ùô[ù‹ûH]HXÿŸ\‹»›^\»[àô]Z[ôY€⁄‹ŒÇà\ŸR[ùô[ù‹ûTôXY[Ÿ[[ô\ŸR[ùô[ù‹ûUò[úÿX›[€í\›‹ûXÇãH›\Xò\ŸH⁄[ôŸ[Ÿ»ÿ\»⁄X⁄ŸYõ‹àô[]ò[ùúôXZ⁄[ô»⁄[ôŸ\ÀàH›\úô[ùà]HTH‹ò[ù⁄[ôŸHX]\ú»õ‹àô]€H‹ôX]YXõX»Xõ\Àù]\»\‹¬à€õHô]\Ÿ\»^\›[ô»[ùô[ù‹ûHXõ\À›öY]‹À‘î‹»[ôY»õ»ZY‹ò][€ãÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôH[ùô[ù‹ûHù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»[ùô[ù‹ûHôXY]€‹ö‹‹XŸHZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»[ùô[ù‹ûHXÿŸ\‹»[ô‹[à[ùô[ù‹ûKÇçà€€ôö\õH[ùô[ù‹ûHõ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õHÿ][Ÿ›YK›‹òYŸK⁄X⁄€›]ÿ[ôY]\À\›[ò][€úÀò[úÿX›[€Çà\›‹ûK[ôô\Ÿ\ùôY€€ùõ€»ô[ô\à€‹úôX›KÇçãà€€ôö\õHÿ\ùÿ⁄X⁄€›]ÿ€›[ù‹ô]\ô[Y[ù€€ùõ€»\ôHõ›^‹ŸYY]ÇçÀàX⁄YH⁄]\à»‹ù[ùô[ù‹ûH‹ö]\»[à€X[\àõ€›À]\€XŸ\»‹à[›ôBà»Xÿ€›[ù[ô»ö\ú›ÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHù]\ôH[ùô[ù‹ûH‹ö]H€‹ö»⁄›[ôH‹][Xô\ò][NÇàHÿ\ù‹[ã‹ôXYÿY‹ô[[›ôN¬àH⁄X⁄€›]ö[ò[^ò][€é¬àH€›[ù⁄Y]¬àH€›[ù[ùZŸN¬àH\⁄Xÿ[€›[ù€‹úôX›[€é¬àHö[ãZ][Hô]\ô[Y[ù¬àHÿÿ[ã‘Tà[ùûH›\ôòXŸ\ÀÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHô]Z[ôY[ùô[ù‹ûHôXY€⁄‹»[ôàô\Ÿ\ùôY[ÿ\ù⁄X⁄€›]€›[ùô]\ô[Y[ù[ôò[[òŸH[ùò\öX[ùÀÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH[ùô[ù‹ûHå»ZY‹ò][€àXYH€õHHôXYYö\ú›ù€‹ö‹‹XŸH]ôH[ôYõ›⁄[ôŸHÿ⁄[XKìÀ\õZ\‹⁄[€úÀ‹ö]\Àÿ\ùò⁄X⁄€›]€›[ù€‹úôX›[€ã€›[ù[ùZŸKö[àô]\ô[Y[ùYŸ\à\ö]ò][€ã‹Çò[ùô[ù‹ûWÿò[[òŸ\ÿôZ]ö[‹à[ô\àTê“UP’TëHåãåÃ»Së—ëà[ùûHMåÇÇà»»[ùûHMåHH‹ùXÿ€›[ù[ô»ô]öY]»€‹ö‹‹XŸH[ù»õ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»Xÿ€›[ù[ô»[Ÿ[HZY‹ò][€ÇääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àMåM
‹ù[ùô[ù‹ûHôXY€‹ö‹‹XŸH»åÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMåÇãHRQ‘êUS”ó”PTõYY[ùYöY\»Xÿ€›[ù[ô»\»HŸ[ù[Ÿ[H[ôõ›\¬à]]\[ô»€àõÿú»[ô[ùô[ù‹ûHôZ[ô»ZY‹ò]Yö\ú›ÇãHTê“UP’TëHåãåçàŸX›[€àÿ⁄‹»Hõÿàö[ò[ò⁄X[»ùYŸ]õ›[ô][€à\¬àõÿóÿùYŸ]€[ô\ÿ€õN»X›X[€‹›€€[Z]Y€‹›\‹›YY[ùô[ù‹ûBàò[YK€€ùòX›ò[YKô]ô[ùYKõŸö]À[ùõ⁄XŸK⁄[ôŸH‹ô\ã[ôàXÿ€›[ù[ô»[ùY‹ò][€àô[XZ[àô\Ÿ\ùôYÇÇà»»»⁄]ÿ\»€€\]YãHYYHå»Xÿ€›[ù[ô’€‹ö‹‹XŸX[Ÿ[H[ô\à‹òÀ€[Ÿ[\ÀÿXÿ€›[ù[ôÀÿÇãHôY⁄\›\ôYHXÿ€›[ù[ô»ÿ‹ôY[à[à‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÇãH⁄[ôŸYHXÿ€›[ù[ô»[Ÿ[HôY⁄\›ûH›]\»úõ€H›Xò»]ôX⁄[Bàô\Ÿ\ùö[ô»H^\›[ô»ÿ[ïöY]—ö[ò[ò⁄X[ÿõ›]K€ò]àÿ]KÇãHYY[à]][ùXÿ]YôXY[€õHXÿ€›[ù[ô»ô]öY]»›\ôòXŸH›ô\àH^\›[ô¬àõÿóÿùYŸ]€[ô\ÿXõKÇãHYYXÿ€›[ù[ô»öY]‹ŒÇàHùYŸ]ô]öY]¬àHÿ]Y€‹ûH›[¬àH^‹ùôXY[ô\‹¬àHô\Ÿ\ùôY€€ùõ€¬ãHYY›[[X\ûHÿ\ô»õ‹àX›]ôH]]‹ö^ôYùYŸ][ô\À›[ùYŸ]àõ›[ô][€à[[›[ù\›[ò›õÿúÀ[ôö\⁄XõH]ö\⁄[€úÀÇãHYYõ›[ôY€Y[ù\⁄YHö[\ö[ô»›ô\à]]‹ö^ôYùYŸ]ô]öY]»õ›‹ÀÇãHYYÿ]Y€‹ûH›[»\ö]ôY€Y[ù\⁄YHúõ€H[ôXYKX]]‹ö^ôYùYŸ]àõ›‹ÀÇãHYY^X⁄]ô\Ÿ\ùôY\›]H[ô[»õ‹à^‹ùôZ]ö[‹ãöX⁄[ô»€€ùõ€ÀàX›X[À\ò⁄\ŸH‹ô\úÀ[ùõ⁄XŸ\À[ôXÿ€›[ù[ô»‹›[ôÀÇãHYYZ[ö[X[ô\‹€ú⁄]ôHXÿ€›[ù[ô»^[›]›[\»[à‹òÀ‹›[\Àÿò\ŸKò‹‹ÿÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãîÀìÀ]]›‹òYŸK\õZ\‹⁄[€àõYÀà^‹ù[ùõ⁄XŸK\ò⁄\ŸH‹ô\ãöX⁄[ôÀ[ùô[ù‹ûKõÿã\›[X]KùYŸ]à‹ö]K‹àòX⁄Ÿ[ôôZ]ö[‹à⁄[ôŸYÇãHõ»Xÿ€›[ù[ô»^‹ùö[H\»Ÿ[ô\ò]YÇãHõ»öX⁄[ôÀX€€ùõ€‹ö]H]ÿ\»YYÇãHõ»X›X[À€€[Z]Y€‹›\‹›YY[ùô[ù‹ûHò[YK€€ùòX›ò[YKô]ô[ùYKàõŸö]À[ùõ⁄XŸK⁄[ôŸH‹ô\ãôX€€ò⁄[X][€ã‹à^\õò[Xÿ€›[ù[ô¬à[ùY‹ò][€àÿ\»YYÇãHH€õHX›]ôH]H]\»Hÿ[\ã]⁄Ÿ[à—SP’úõ€H^\›[ô¬àõÿóÿùYŸ]€[ô\ÿö[\ôY»X›]ôHõ›‹»⁄]\ò⁄]ôYÿ]T»ïSÇãHHXÿ€›[ù[ô»õ›]Hô[XZ[ú»Y[à[õ\‹»ÿ[ïöY]—ö[ò[ò⁄X[ÿ\»ùYK[ôà›\Xò\ŸHì»ô[XZ[ú»]]‹ö]]]ôHõ‹à]ô\ûHô]\õôYùYŸ]õ›ÀÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\ÀÿXÿ€›[ù[ôÀ–Xÿ€›[ù[ô’€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH›]X»ÿÿ[àŸà‹òÀ€[Ÿ[\ÀÿXÿ€›[ù[ôÀ–Xÿ€›[ù[ô’€‹ö‹‹XŸKöúﬁ€€ôö\õYYBà€õH›\Xò\ŸH]Hÿ[\»úõ€J	⁄õÿóÿùYŸ]€[ô\… XÇãH›]X»ÿÿ[à€€ôö\õYYõ»[úŸ\ù\]K[]K\Ÿ\ùîÀ›‹òYŸKô]⁄à[ùõ⁄XŸK\ò⁄\ŸK[‹ô\ã^‹ùYŸ[ô\ò][€ã[ùô[ù‹ûKõÿã\›[X]K‹ÇàöX⁄[ôÀ]‹ö]H]ÿ\»YYÇãH›\Xò\ŸH⁄[ôŸ[Ÿ»ÿ\»⁄X⁄ŸYõ‹àô[]ò[ùúôXZ⁄[ô»⁄[ôŸ\ÀàH›\úô[ùà]HTH‹ò[ù⁄[ôŸHX]\ú»õ‹àô]€H‹ôX]YXõX»Xõ\Àù]\»\‹¬à€õHô]\Ÿ\»H^\›[ô»XõXÀöõÿóÿùYŸ]€[ô\ÿXõH[ôY»õ¬àZY‹ò][€ãÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôHXÿ€›[ù[ô»ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€BàûX[â‹»úõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»Xÿ€›[ù[ô»ô]öY]À]€‹ö‹‹XŸHZY‹ò][€ãÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»ÿ[ó›öY]◊Ÿö[ò[ò⁄X[ÿ[ô‹[àXÿ€›[ù[ôÀÇçà€€ôö\õHXÿ€›[ù[ô»õ»€ôŸ\à⁄›‹»Hå»XŸZ€\ãÇçKà€€ôö\õHùYŸ]ô]öY]Àÿ]Y€‹ûH›[À^‹ùôXY[ô\‹À[ôô\Ÿ\ùôYà€€ùõ€»ô[ô\à€‹úôX›KÇçãà€€ôö\õHõ»^‹ù[ùõ⁄XŸK\ò⁄\ŸH‹ô\ãöX⁄[ôÀ\õ›ò[‹àXÿ€›[ù[ô¬à‹›[ô»X›[€à\»^‹ŸYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHù]\ôHXÿ€›[ù[ô»€‹ö»⁄›[ôH‹][Xô\ò][NÇàH€€ùõ€Y^‹ùŒ¬àHõÿãX€‹›ÿXÿ€›[ù[ô»\õ›ò[YX⁄[ö\€N¬àH[ùõ⁄XŸHô]öY]Œ¬àH\ò⁄\ŸK[‹ô\à[ùY‹ò][€é¬àH^\õò[Xÿ€›[ù[ôÀ\ﬁ\›[H[ùY‹ò][€ãÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»›^YY[ú⁄YHH^\›[ô»ùYŸ]õ›[ô][€àôXY]à[ôYõ›YXÿ€›[ù[ô»Ÿ[X[ùX‹»ô^[€ôôXY[€õHô]öY]ÀÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYHXÿ€›[ù[ô»å»ZY‹ò][€àXYH€õHHôXY[€õHô]öY]¬ù€‹ö‹‹XŸH]ôH›ô\àH^\›[ô»ùYŸ]õ›[ô][€à[ôYõ›⁄[ôŸHÿ⁄[XKîìÀ\õZ\‹⁄[€úÀ‹ö]\À^‹ùÀ[ùõ⁄XŸ\À\ò⁄\ŸH‹ô\úÀöX⁄[ô»€€ùõ€ÀòX›X[À[ùô[ù‹ûKõÿúÀ\›[X]\À‹àXÿ€›[ù[ô»‹›[ô»[ô\àTê“UP’TëBùåãåÃ»Së—ëà[ùûHMåKÇÇà»»[ùûHMåàHõ‹ùÿ]HHå»‹[]ô[[Ÿ[HZY‹ò][€à€€\]BÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»‹[]ô[[Ÿ[HZY‹ò][€à⁄X⁄‹⁄[ùääîŸ\‹⁄[€à\Nääà€€‹ô[ò][€à⁄X⁄‹⁄[ùÇà»»»€€ù^ãH›\ù[ô»€€[Z]àôNôLX
‹ùXÿ€›[ù[ô»ô]öY]»€‹ö‹‹XŸH»åÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMåXÇãHûX[àô\öYöYYXÿ€›[ù[ô»[àõŸX›[€à[ôô\YYô€€Ÿ»€ÀàõÿŸYYàÇãHXÿ€›[ù[ô»ÿ\»HŸ[ù[ôö[ò[[Ÿ[H\›Y[àRQ‘êUS”ó”PTõYÇÇà»»»⁄]ÿ\»€€ôö\õYYãH[Ÿ[ôH‹[]ô[å»[Ÿ[\»\›Y[àRQ‘êUS”ó”PTõY]ôHõ›»ôY[ÇàZY‹ò]Y›]ŸàHõ›^Y][ZY‹ò]YXŸZ€\àõ›]NÇàH\⁄õÿ\ôàH]ô[‹\ÇàHô\‹ù¬àHÿ›[Y[ù¬àHôZX€\¬àH€€¬àH[\ﬁYY\¬àH⁄[\¬àH\›[X]\¬àHõÿú¬àH[ùô[ù‹ûBàHXÿ€›[ù[ô¬ãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿõ›»X\ö‹»]ô\ûH‹[]ô[[Ÿ[H\»›]\ŒÇà	€]ôIÿÇãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿõ›»ôY⁄\›\ú»[Ÿ[ôH‹[]ô[[Ÿ[Hÿ‹ôY[úÀÇãH›]X»ŸX\ò⁄õ›[ôõ»X›]ôH›]\Œà	‹›Xâÿ[Ÿ[H[ùöY\ÀàH€õBàô[XZ[ö[ô»›]\Œà	‹›Xâÿ]\»HôY⁄\›ûH€€[Y[ù^Z[ö[ô»BàZY‹ò][€à]\õãÇãHûX[à\»úõ›‹Ÿ\ã]ô\öYöYYXX⁄ZY‹ò]Y[Ÿ[H[àõŸX›[€àõ›Y⁄BàXÿ€›[ù[ô»⁄X⁄‹⁄[ùÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãH\»⁄X⁄‹⁄[ùXYHõ»\X€ŸKÿ⁄[XKìÀ\õZ\‹⁄[€ã]]›‹òYŸKàîÀô]YûHù[ò›[€ã›\Xò\ŸK‹àù[ù[YHôZ]ö[‹à⁄[ôŸKÇãH^\›[ô»Yô\úôY‹ô\Ÿ\ùôYôX]\ôH[ô[»ô[XZ[à[ù[ù[€ò[HYô\úôYà\¬à⁄X⁄‹⁄[ù€õH€‹Ÿ\»H‹[]ô[XŸZ€\àZY‹ò][€ãÇãHH€õ›€àõ€ãXõÿ⁄⁄[ô»⁄[\»RHùY»ô[XZ[ú»ÿ\úöYYõ‹ùÿ\ôà⁄[àHô]»⁄]à\»Ÿ[ùHÿ‹ôY[àÿ[àù[\»H‹àûX[à^X⁄]H\⁄ŸY»òX⁄»\¬àõ‹à]\àò]\à[àö^]\ö[ô»H[Ÿ[HZY‹ò][€à\‹ÀÇÇà»»»ô\öYöXÿ][€ÇãH⁄]›]\»K\⁄‹ùÿ\»€X[àôYõ‹ôH\»⁄X⁄‹⁄[ù[ùûKÇãHRQ‘êUS”ó”PTõYÿ\»ô]öY]ŸY[ôXÿ€›[ù[ô»ÿ\»€€ôö\õYY\»Hö[ò[à[õôY‹[]ô[[Ÿ[KÇãH‹òÀ€[Ÿ[\À‹ôY⁄\›ûKöúÿÿ\»[ú‹X›Y[ô[[Ÿ[HôY⁄\›ûH[ùöY\»\ôBà]ôKÇãH‹òÀ€[Ÿ[\À‹ÿ‹ôY[úÀöúÿÿ\»[ú‹X›Y[ô[Ÿ[ôH[Ÿ[Hÿ‹ôY[ú»\ôBàôY⁄\›\ôYÇãH›]X»ŸX\ò⁄€€ôö\õYYõ»X›]ôH›]\Œà	‹›Xâÿ[Ÿ[H[ùöY\»ô[XZ[ãÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»€€\][€à⁄X⁄‹⁄[ùÇåãà›\ùHô^å»ôXùZ[\ŸHúõ€HHÿ\úöYYYõ‹ùÿ\ôù[ò›[€ò[€XŸ\Ààõ›úõ€HXŸZ€\àô[[›ò[ÇåÀàôX€€[Y[ôYô^€XŸNà[ùô[ù‹ûH‹ö]KYõ›»ô\›‹ò][€à[à€X[õ›[ôYà\‹Ÿ\ÀôY⁄[õö[ô»⁄]ÿ\ù‹[ã‹ôXYÿY‹ô[[›ôHôYõ‹ôH⁄X⁄€›]àö[ò[^ò][€ã€›[ù€‹öŸõ›‹À‹àö[ãZ][Hô]\ô[Y[ùÇçàŸ\\ò][Hÿ⁄Y[HH€õ›€à⁄[\»ÿ‹õ€Zù[\ùY»\»Hõÿ›\ŸYRHö^ÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH‹[]ô[[Ÿ[HXŸZ€\ú»\ôH€€\]Kù]Ÿ]ô\ò[[ù[ù[€ò[BàYô\úôY›XãYôX]\ô\»ô[XZ[éÇàH[ùô[ù‹ûHÿ\ùÿ⁄X⁄€›]ÿ€›[ù‹ô]\ô[Y[ù‹ö]\Œ¬àHõÿú»X]\öX[Àù^[›]ò[úÿX›[€úÀö[ò[ò⁄X[Àÿ›[Y[ùÀ[ôÿ⁄Y[BàY\\à€XŸ\Œ¬àHXÿ€›[ù[ô»€€ùõ€Y^‹ùÀ\õ›ò[À[ùõ⁄XŸ\À‹À[ô^\õò[à[ùY‹ò][€é¬àH⁄[\»õÿ][ô»ùXòõHôZ[ùõŸX›[€à[ôÿ‹õ€€\⁄ÇãHXX⁄Yô\úôYôX]\ôH⁄›[›[Ÿ]]»›€à\ò⁄]X›\ôKÿõ›[ô\ûHôYõY⁄àôYõ‹ôH[\[Y[ù][€ãÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\»Hÿ›[Y[ù][€à⁄X⁄‹⁄[ù€õKÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH\»⁄X⁄‹⁄[ù€õHôX€‹ô»]H‹[]ô[å¬õ[Ÿ[HZY‹ò][€à\»€€\]H[ôŸ\»õ›[ŸYûH\Xÿ][€àôZ]ö[‹à[ô\ÇêTê“UP’TëHåãåÃ»Së—ëà[ùûHMåãÇÇà»»[ùûHMå»Hô\›‹ôH[ùô[ù‹ûHÿ\ù›Y⁄[ô»[àõ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»[ùô[ù‹ûHÿ\ù›Y⁄[ô¬ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àéNYéM
ôX€‹ôå»[Ÿ[HZY‹ò][€à€€\][€ò
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMåòÇãHûX[à\õ›ôYõÿŸYY[ô»Yù\àH‹[]ô[[Ÿ[HZY‹ò][€àÿ\»€€\]YÇãH[ùûHMåàôX€€[Y[ôYHô^€XŸH\»[ùô[ù‹ûH‹ö]KYõ›»ô\›‹ò][€ãàôY⁄[õö[ô»⁄]ÿ\ù‹[ã‹ôXYÿY‹ô[[›ôHôYõ‹ôH⁄X⁄€›]ö[ò[^ò][€ã€›[ùà€‹öŸõ›‹À‹àö[ãZ][Hô]\ô[Y[ùÇãHHô\Ÿ\ùôY\ŸR[ùô[ù‹ûPÿ\ù€⁄»[ôXYH‹ò\»H\õ›ôYÿ\ùî‹ŒÇà‹[ó⁄[ùô[ù‹ûWÿÿ\ùôXY⁄[ùô[ù‹ûWÿÿ\ù⁄][\ÿàY⁄[ùô[ù‹ûWÿÿ\ù⁄][X[ôô[[›ôW⁄[ùô[ù‹ûWÿÿ\ù⁄][XÇÇà»»»⁄]ÿ\»€€\]YãH\]YHå»[ùô[ù‹ûH€‹ö‹‹XŸHÿ\ùöY]»úõ€HôXY[€õH⁄X⁄€›]àÿ[ôY]\»»Hö\ú›]ôHÿ\ù\›Y⁄[ô»›\ôòXŸKÇãHYY\ŸR[ùô[ù‹ûPÿ\ù»[ùô[ù‹ûU€‹ö‹‹XŸXÇãHô\XŸYH€⁄X⁄€›]ÿ[ôY]\ÿ⁄YXò\à][H⁄]ÿ\ùÇãHYY[à‹[àÿ\ùX›[€à]ÿ[»Hô\Ÿ\ùôY‹[ó⁄[ùô[ù‹ûWÿÿ\ùàî»õ›Y⁄\ŸR[ùô[ù‹ûPÿ\ùÇãHYYX›]ôHÿ\ùòX›»õ‹à›]\Àõ›»€›[ùÿ\ùQ[ô^\ò][€ãÇãHYYH›YŸYÿ\ù[[ô\»XõH€›\òŸYúõ€BàôXY⁄[ùô[ù‹ûWÿÿ\ù⁄][\ÿÇãHYYô[[›ôHù]€ú»õ‹à›YŸYÿ\ù[ô\»]ÿ[àô[[›ôW⁄[ùô[ù‹ûWÿÿ\ù⁄][Xõ›Y⁄\ŸR[ùô[ù‹ûPÿ\ùÇãHYY›ÿ⁄ŸYÿ[ôY]H]X[ù]H[ú]»[ôYù]€ú»]ÿ[àY⁄[ùô[ù‹ûWÿÿ\ù⁄][Xõ›Y⁄\ŸR[ùô[ù‹ûPÿ\ùÇãHYY\ãXÿ[ôY]H›XÿŸ\‹ÀŸ\úõ‹àY\‹ÿYŸ\»Yù\àY][\ÀÇãH\]Y[ùô[ù‹ûH€‹H[ô›[[X\ûHÿ\ô»»⁄›»ÿ\ù›Y⁄[ô»\»]ôH⁄[Bà⁄X⁄€›]ö[ò[^ò][€ã€›[ùÀ[ôô]\ô[Y[ùô[XZ[àYô\úôYÇãHYYõÿ›\ŸY‘‘»õ‹àÿ\ùòX›ÀX›[€àŸ[À[ôõ›»Y\‹ÿYŸ\ÀÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãìÀ\õZ\‹⁄[€àõYÀ›‹òYŸKô]YûBàù[ò›[€ãòX⁄Ÿ[ô‹àî»Yö[ö][€à⁄[ôŸYÇãHõ»\ôX›[ùô[ù‹ûWÿÿ\ùÿ[ùô[ù‹ûWÿÿ\ù⁄][\ÿ[ùô[ù‹ûWÿò[[òŸ\ÿà[ùô[ù‹ûW›ò[úÿX›[€úÿ‹àò[úÿX›[€ó⁄][\ÿ€Y[ù]]][€àÿ\»YYÇãHÿ\ù‹[ãYô[[›ôK[ôôXY\ôH\ôõ‹õYY€õHõ›Y⁄Hô\Ÿ\ùôYàŸ\ùô\àî»‹ò\\ú»[à\ŸR[ùô[ù‹ûPÿ\ùÇãH⁄X⁄€›]Ÿö[ò[^ò][€àô[XZ[ú»Yô\úôYàHå»[ùô[ù‹ûH[Ÿ[HŸ\»õ›ÿ[à⁄X⁄€›]ÿ\ù‹à^‹ŸHö[ò[^ôW⁄[ùô[ù‹ûWÿÿ\ùÇãH›Y⁄[ô»ÿ\ù[ô\»Ÿ\»õ›⁄[ôŸH[ùô[ù‹ûHò[[òŸ\Ààò[[òŸ\»ô[XZ[Çàò[úÿX›[€ãY\ö]ôY[ô⁄[ôŸH€õHõ›Y⁄ù]\ôH⁄X⁄€›]ö[ò[^ò][€ãÇãH€›[ù[ùZŸK€›[ù€‹úôX›[€ãö[ãZ][Hô]\ô[Y[ùTàÿÿ[à\‹]⁄[ôà⁄X⁄€›]\›[ò][€à[ô[ô»ô[XZ[àŸ\\ò]Hù]\ôH€XŸ\ÀÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄[ùô[ù‹ûK“[ùô[ù‹ûU€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH›]X»ÿÿ[à€€ôö\õYYHå»[ùô[ù‹ûH€‹ö‹‹XŸH[\‹ù»[ô\Ÿ\¬à\ŸR[ùô[ù‹ûPÿ\ùÇãH›]X»ÿÿ[à€€ôö\õYYHå»[ùô[ù‹ûH€‹ö‹‹XŸHÿ[»€õNÇàHÿ\ù›]Kõ‹[êÿ\ùàHÿ\ù›]KòY][XàHÿ\ù›]Kúô[[›ôR][XãH›]X»ÿÿ[à€€ôö\õYYHå»[ùô[ù‹ûH€‹ö‹‹XŸHŸ\»õ›ÿ[àÿ\ù›]Kò⁄X⁄€›]ÿ\ù⁄X⁄€›]ÿ\ùö[ò[^ôW⁄[ùô[ù‹ûWÿÿ\ù‹àBà⁄X⁄€›][ô\ãÇãH›]X»ÿÿ[à€€ôö\õYYHå»[ùô[ù‹ûH€‹ö‹‹XŸHŸ\»õ›€€ùZ[à\ôX›à[úŸ\ù\]K[]K‹à\Ÿ\ùÿ[ÀÇãH›\Xò\ŸH⁄[ôŸ[Ÿ»ÿ\»⁄X⁄ŸYõ‹àô[]ò[ùúôXZ⁄[ô»⁄[ôŸ\ÀàH›\úô[ùà]HTH‹ò[ù⁄[ôŸHX]\ú»õ‹àô]€H‹ôX]YXõX»Xõ\ÀŸù[ò›[€úÀù]à\»\‹»Y»õ»ô]»XõKù[ò›[€ãZY‹ò][€ã‹à‹ò[ù[ôô]\Ÿ\¬à^\›[ô»ÿ\ùî‹ÀÇãH]][ùXÿ]Y]ôHÿ\ù\›Y⁄[ô»ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€BàûX[â‹»úõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»[ùô[ù‹ûHÿ\ù\›Y⁄[ô»€XŸKÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»ÿ[ó⁄[ùô[ù‹ûW›ò[úÿX›[€úÿÇçà‹[à[ùô[ù‹ûHàÿ\ùÇçKà€€ôö\õH‹[àÿ\ù€‹ö‹»[ô⁄›‹»[àX›]ôHÿ\ùÇçãàY€ôH›ÿ⁄ŸYÿ[ôY]Hõ›»⁄]H€X[]X[ù]H[ô€€ôö\õH]\X\ú¬à[àH›YŸYÿ\ùXõKÇçÀàô[[›ôH]›YŸYÿ\ù[ôH[ô€€ôö\õHHõ›»\ÿ\X\úÀÇéà€€ôö\õHõ»⁄X⁄€›]Ÿö[ò[^ôHX›[€à\»^‹ŸYY]ÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHHô^[ùô[ù‹ûH€XŸH⁄›[ôHX⁄YYYù\àÿ\ù›Y⁄[ô»\»ô\öYöYYÇàZŸ[H⁄X⁄€›]\›[ò][€àRKŸö[ò[^ò][€ã[à€›[ù€‹öŸõ›‹À[Çàö[ãZ][Hô]\ô[Y[ùÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»ôZ[ùõŸXŸY€õHHô\Ÿ\ùôYÿ\ù\›Y⁄[ô»î¬à‹ò\\ú»[ôYõ›⁄[ôŸH⁄X⁄€›]YŸ\à\ö]ò][€ã€›[ù€‹úôX›[€ã‹Çàò[[òŸHôZ]ö[‹ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH[ùô[ù‹ûHÿ\ù›Y⁄[ô»ô]\ŸY^\›[ô»\õ›ôYî‹¬ò[ôYõ›⁄[ôŸHÿ⁄[XKìÀ\õZ\‹⁄[€úÀ⁄X⁄€›]ö[ò[^ò][€ã€›[ùù€‹öŸõ›‹Àö[àô]\ô[Y[ù\ôX›ò[[òŸH‹ö]\À‹àYŸ\à\ö]ò][€à[ô\ÇêTê“UP’TëHåãåÃ»Së—ëà[ùûHMåÀÇÇà»»[ùûHMçHô\›‹ôH[ùô[ù‹ûHõ‹õX[⁄X⁄€›]ö[ò[^ò][€à[àõ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»[ùô[ù‹ûHõ‹õX[⁄X⁄€›]ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àÿçLMŒ
ô\›‹ôH[ùô[ù‹ûHÿ\ù›Y⁄[ô»[àåÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMåÿÇãHûX[àô\öYöYY[ùô[ù‹ûHÿ\ù›Y⁄[ô»[àõŸX›[€à[ôô\YYô€€Ÿ»€ÀÇàõÿŸYYàÇãHõ‹õX[⁄X⁄€›]Ÿö[ò[^ò][€à\»[ôXYHÿ⁄ŸY[àTê“UP’TëHŸX›[€àLBà[ôô\Ÿ\ùôY[à\ŸR[ùô[ù‹ûPÿ\ùò⁄X⁄€›]ÿ\ùÇãHH]ôHî»›\‹ù»\ã[[ôH\›[ò][€ú»õ›Y⁄àö[ò[^ôW⁄[ùô[ù‹ûWÿÿ\ù
ããã€[ôWŸ\›[ò][€ú»ú€€òäXÇÇà»»»⁄]ÿ\»€€\]YãHYYõ‹õX[⁄X⁄€›]\›[ò][€à€€ùõ€»»Hå»[ùô[ù‹ûHÿ\ùöY]ÀÇãHYYHÿ⁄ŸY\›[ò][€à\\ŒÇàHõÿÇàHŸ\ùöXŸHÿ[àHôZX€H›ÿ⁄¬àH\Ÿ\à‹‹Ÿ\‹⁄[€ÇàHô[ô‹àô]\õÇàHÿ‹ò\àH[ö€õ›€à»Z\‹⁄[ô¬ãHYY\ã[[ôH\›[ò][€à\K\›[ò][€àQ[ôõ›H€€ùõ€»õ‹à›YŸYàÿ\ù[ô\ÀÇãHYY\H\›[ò][€à»[ô\»€€ùõ€»€»€ôH\›[ò][€àÿ[àôH\YYà»]ô\ûH›\úô[ùÿ\ù[ôHôYõ‹ôH⁄X⁄€›]ÇãHYYò[Y][€à]ô\]Z\ô\ŒÇàH\›[ò][€àQõ‹àõÿãŸ\ùöXŸHÿ[ôZX€K[ô\Ÿ\à\›[ò][€úŒ¬àHõ›Hõ‹à[ö€õ›€à\›[ò][€úÀÇãHYYH⁄X⁄€›]Ÿ[X›Y\›[ò][€úÿX›[€à]ÿ[»Hô\Ÿ\ùôYàÿ\ù›]Kò⁄X⁄€›]ÿ\ù‹ò\\à⁄]\ã[[ôH\›[ò][€à^[ÿYÀÇãHYYH⁄X⁄€›]€€\][€à[ô[⁄›⁄[ô»Hù[Xô\àŸàò[úÿX›[€à][\¬à‹ö][àûHHô\Ÿ\ùôY⁄X⁄€›]îÀÇãH\]Yÿ\ù[ô[ùô[ù‹ûH€‹H»⁄›»õ‹õX[⁄X⁄€›]\»]ôH⁄[H€›[ùà€‹úôX›[€à[ôô]\ô[Y[ùô[XZ[àYô\úôYÇãH⁄[ôŸYH›[H\ŸR[ùô[ù‹ûPÿ\ùò⁄X⁄€›]ÿ\ùYò][\›[ò][€àúõ€BàŸôöXŸX»[ö€õ›€òX]⁄[ô»HåãåLH\ò⁄]X›\ò[ô]\ô[Y[ùŸÇàŸôöXŸX\»HX]\öX[\›[ò][€ãÇãHYYõÿ›\ŸYô\‹€ú⁄]ôH‘‘»õ‹à⁄X⁄€›]€€ùõ€»[ô\›[ò][€àŸ[ÀÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãìÀ\õZ\‹⁄[€àõYÀ›‹òYŸKô]YûBàù[ò›[€ãòX⁄Ÿ[ô‹àî»Yö[ö][€à⁄[ôŸYÇãH⁄X⁄€›]ö[ò[^ò][€à\»\ôõ‹õYY€õHõ›Y⁄Hô\Ÿ\ùôYàö[ò[^ôW⁄[ùô[ù‹ûWÿÿ\ùî»‹ò\\à[à\ŸR[ùô[ù‹ûPÿ\ùÇãHHå»RHŸ\»õ›‹ö]H[ùô[ù‹ûWÿò[[òŸ\ÿ\ôX›KÇãHõ»\ôX›[ùô[ù‹ûWÿÿ\ùÿ[ùô[ù‹ûWÿÿ\ù⁄][\ÿ[ùô[ù‹ûWÿò[[òŸ\ÿà[ùô[ù‹ûW›ò[úÿX›[€úÿ‹àò[úÿX›[€ó⁄][\ÿ€Y[ù]]][€àÿ\»YYÇãH^ô\‹»⁄X⁄€›]ô[XZ[ú»[ö[\[Y[ùYÇãH€›[ù[ùZŸK€›[ù€‹úôX›[€ãö[ãZ][Hô]\ô[Y[ùTàÿÿ[à\‹]⁄[ôàô]\õãYúõ€KZõÿàô[XZ[àŸ\\ò]Hù]\ôH€XŸ\ÀÇãHHRHŸ\»õ›Ÿôô\àŸôöXŸX\»H\›[ò][€à\KÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄[ùô[ù‹ûK“[ùô[ù‹ûU€‹ö‹‹XŸKöúﬁãH‹òÀ⁄€⁄‹À›\ŸR[ùô[ù‹ûPÿ\ùöúÿãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH›]X»ÿÿ[à€€ôö\õYYHå»[ùô[ù‹ûH€‹ö‹‹XŸHÿ[¬àÿ\ù›]Kò⁄X⁄€›]ÿ\ù[ô^‹Ÿ\»⁄X⁄€›]Ÿ[X›Y\›[ò][€úÿÇãH›]X»ÿÿ[à€€ôö\õYY⁄X⁄€›]\»õ›]Yõ›Y⁄H^\›[ô¬àö[ò[^ôW⁄[ùô[ù‹ûWÿÿ\ùî»‹ò\\à⁄]€[ôWŸ\›[ò][€úÿÇãH›]X»ÿÿ[à€€ôö\õYYõ»ŸôöXŸX^ô\‹»⁄X⁄€›]€›[ù€‹úôX›[€ãàö[ãZ][Hô]\ô[Y[ù\ôX›[úŸ\ù\ôX›\]K\ôX›[]K‹à\ôX›à\Ÿ\ù]ÿ\»YY[àHå»[ùô[ù‹ûH€‹ö‹‹XŸH‹àÿ\ù€⁄ÀÇãH›\Xò\ŸH⁄[ôŸ[Ÿ»ÿ\»⁄X⁄ŸYõ‹àô[]ò[ùúôXZ⁄[ô»⁄[ôŸ\ÀàH›\úô[ùà]HTH‹ò[ù⁄[ôŸHX]\ú»õ‹àô]€H‹ôX]YXõX»Xõ\ÀŸù[ò›[€úÀù]à\»\‹»Y»õ»ô]»XõKù[ò›[€ãZY‹ò][€ã‹à‹ò[ù[ôô]\Ÿ\»Bà^\›[ô»⁄X⁄€›]îÀÇãH]][ùXÿ]Y]ôH⁄X⁄€›]ù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»[ùô[ù‹ûHõ‹õX[X⁄X⁄€›]€XŸKÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»ÿ[ó⁄[ùô[ù‹ûW›ò[úÿX›[€úÿÇçà‹[à[ùô[ù‹ûHàÿ\ùÇçKà‹[àHÿ\ùY€ôH›ÿ⁄ŸYÿ[ôY]Hõ›À[ô⁄€‹ŸHHò[Y\›[ò][€ãÇçãà€X⁄»⁄X⁄€›]Ÿ[X›Y\›[ò][€úÿÇçÀà€€ôö\õHH⁄X⁄€›]€€\][€à[ô[\X\ú»⁄]ò[úÿX›[€à][H€›[ùÇéà€€ôö\õHõ»^ô\‹»⁄X⁄€›]€›[ù€‹úôX›[€ã‹àö[ãZ][Hô]\ô[Y[ùX›[€Çà\»^‹ŸY[à\»€XŸKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHHô^[ùô[ù‹ûH€XŸH⁄›[ZŸ[HôH€›[ù⁄Y]»€›[ù[ùZŸH‹Çà\⁄Xÿ[€›[ù€‹úôX›[€ãôYõ‹ôHö[ãZ][Hô]\ô[Y[ùÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»ôZ[ùõŸXŸY€õHHô\Ÿ\ùôYõ‹õX[⁄X⁄€›]î¬à‹ò\\à[ôYõ›⁄[ôŸHÿ⁄[XKìÀ\õZ\‹⁄[€úÀ^ô\‹»⁄X⁄€›]€›[ùà€‹öŸõ›‹Àö[àô]\ô[Y[ù\ôX›ò[[òŸH‹ö]\À‹àYŸ\à\ö]ò][€ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH[ùô[ù‹ûHõ‹õX[⁄X⁄€›]ô]\ŸYH^\›[ô¬ò\õ›ôYö[ò[^ôW⁄[ùô[ù‹ûWÿÿ\ùî»‹ò\\à[ôYõ›⁄[ôŸHÿ⁄[XKìÀú\õZ\‹⁄[€úÀ^ô\‹»⁄X⁄€›]€›[ù€‹úôX›[€ãö[àô]\ô[Y[ù\ôX›ò[[òŸBù‹ö]\À‹àYŸ\à\ö]ò][€à[ô\àTê“UP’TëHåãåÃ»Së—ëà[ùûHMçÇÇà»»[ùûHMçHHô\›‹ôH[ùô[ù‹ûH€›[ù€‹öŸõ›‹»[àõ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»[ùô[ù‹ûH€›[ù€‹öŸõ›‹¬ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àMôMN
ô\›‹ôH[ùô[ù‹ûHõ‹õX[⁄X⁄€›][àåÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMçÇãHûX[àô\öYöYY[ùô[ù‹ûHõ‹õX[⁄X⁄€›][àõŸX›[€à[ôô\YYô€€Ÿ¬à€ÀàõÿŸYYàÇãH€›[ù[ùZŸH\»ÿ⁄ŸY\»H\õ›ôY\⁄Xÿ[]X[ù]H\›Xõ\⁄Y[ù]ÇãHHô\Ÿ\ùôY€⁄‹»[ôXYHÿ[Hÿ⁄ŸYî‹ŒÇàHŸ]⁄[ùô[ù‹ûWÿ€›[ù‹]X[ù]XàH[ùZŸW⁄[ùô[ù‹ûWÿ€›[ùÇà»»»⁄]ÿ\»€€\]YãHYY[à[ùô[ù‹ûH€›[ùöY]»»Hå»⁄YXò\ãÇãHô\›‹ôY€›[ù⁄Y]ÿY[ô»õ›Y⁄\ŸR[ùô[ù‹ûP€›[ù⁄Y]ÇãHYYŸX\ò⁄XõH€›[ùõ›‹»⁄]X]\öX[ÿÿ][€ãﬁ\›[H]X[ù]K[ö]à[ôZ[ö[][H]X[ù]KÇãHYY^\›[ôÀ\õ›»\⁄Xÿ[€›[ù€‹úôX›[€à€€ùõ€ŒÇàH€›[ùY]X[ù]H[ú]¬àHôX\€€àŸ[X›‹é¬àH›\›€HôX\€€àöY[¬àHŸ]€›[ùX›[€ãÇãH⁄\ôY^\›[ôÀ\õ›»€›[ù‹ö]\»õ›Y⁄Hô\Ÿ\ùôYà\ŸR[ùô[ù‹ûP€›[ù€‹úôX›[€ãúŸ]€›[ù]X[ù]X€⁄ÀÇãHYYô]»ö[ã€X]\öX[€›[ù[ùZŸH€€ùõ€ŒÇàHö[àŸ[X›‹é¬àHÿ][Ÿ»][HŸ[X›‹à^€Y[ô»][\»[ôXYHX›]ôH[àHŸ[X›Yö[é¬àH€›[ùY]X[ù]H[ú]¬àHôX\€€àŸ[X›‹é¬àH›\›€HôX\€€àöY[¬àHôX€‹ô€›[ù[ùZŸXX›[€ãÇãH⁄\ôYô]»ö[ã€X]\öX[€›[ù[ùZŸHõ›Y⁄Hô\Ÿ\ùôYà\ŸR[ùô[ù‹ûP€›[ù[ùZŸKúôX€‹ô€›[ù€⁄ÀÇãHô\Ÿ\ùôYô\õ»\»Hò[Y\⁄Xÿ[€›[ù]X[ù]KÇãHX]⁄YHRH‹ö]Hÿ]H»HŸ\ùô\àî»€€ùòX›à[ùô[ù‹ûHX[òYŸ[Y[ùàÿ[àôXYH€›[ù⁄Y]⁄[H€›[ù‹ö]\»ô\]Z\ôH]ô[‹\ã–YZ[àõ€KÇãH\]Y[ùô[ù‹ûHõ›[ô\ûH€‹H»⁄›»ÿ\ù⁄X⁄€›][ô€›[ù€‹öŸõ›‹¬à\ôH]ôH⁄[Hô]\ô[Y[ùô[XZ[ú»Yô\úôYÇãHYYõÿ›\ŸYô\‹€ú⁄]ôH‘‘»õ‹à€›[ùôX\€€ãÿX›[€àŸ[»[ôH[ùZŸBà€€ùõ€ÀÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãìÀ\õZ\‹⁄[€àõYÀ›‹òYŸKô]YûBàù[ò›[€ãòX⁄Ÿ[ô‹àî»Yö[ö][€à⁄[ôŸYÇãH€›[ù‹ö]\»\ôH\ôõ‹õYY€õHõ›Y⁄Hô\Ÿ\ùôY€›[ùî»‹ò\\úÀÇãHHå»RHŸ\»õ›‹ö]H[ùô[ù‹ûWÿò[[òŸ\ÿ\ôX›KÇãHõ»\ôX›[ùô[ù‹ûWÿò[[òŸ\ÿ[ùô[ù‹ûW›ò[úÿX›[€úÿàò[úÿX›[€ó⁄][\ÿ‹àö[ó⁄][\ÿ€Y[ù]]][€àÿ\»YYÇãHö[ãZ][Hô]\ô[Y[ùô[XZ[ú»[ö[\[Y[ùY[àåÀÇãHTàÿÿ[à\‹]⁄ô[XZ[ú»[ö[\[Y[ùY[à\»å»€XŸKÇãH^ô\‹»⁄X⁄€›][ôô]\õãYúõ€KZõÿàô[XZ[àŸ\\ò]Hù]\ôH€XŸ\ÀÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄[ùô[ù‹ûK“[ùô[ù‹ûU€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH›]X»ÿÿ[à€€ôö\õYYHå»[ùô[ù‹ûH€‹ö‹‹XŸHŸ\»õ›\ôX›Hÿ[à[úŸ\ù\]X[]X\Ÿ\ùô]\ôWÿö[ó⁄][X‹Çà[ùô[ù‹ûWÿò[[òŸ\ÿÇãH›]X»ÿÿ[à€€ôö\õYY€›[ù‹ö]\»\X\à€õH[àHô\Ÿ\ùôY€⁄‹»öXNÇàHŸ]⁄[ùô[ù‹ûWÿ€›[ù‹]X[ù]XàH[ùZŸW⁄[ùô[ù‹ûWÿ€›[ùãH›\Xò\ŸH⁄[ôŸ[Ÿ»ÿ\»⁄X⁄ŸYõ‹àô[]ò[ùúôXZ⁄[ô»⁄[ôŸ\ÀàH›\úô[ùà]HTH‹ò[ù⁄[ôŸHX]\ú»õ‹àô]€H‹ôX]YXõX»Xõ\ÀŸù[ò›[€úÀù]à\»\‹»Y»õ»ô]»XõKù[ò›[€ãZY‹ò][€ã‹à‹ò[ù[ôô]\Ÿ\¬à^\›[ô»€›[ùî‹»[ôXõ\ÀÇãH]][ùXÿ]Y]ôH€›[ùù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»[ùô[ù‹ûH€›[ù]€‹öŸõ›‹»€XŸKÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»ÿ[ó€X[òYŸW⁄[ùô[ù‹ûXÇçà‹[à[ùô[ù‹ûHà€›[ùÇçKà€€ôö\õH€›[ùõ›‹»ÿY[ôÿ[àôHŸX\ò⁄YÇçãà⁄]H]ô[‹\ã–YZ[à\Ÿ\ãŸ]€ôH^\›[ô»õ›»€›[ù»]»›\úô[ùàﬁ\›[H]X[ù]H[ô€€ôö\õHH›XÿŸ\‹»Y\‹ÿYŸH\X\úÀÇçÀà⁄]H]ô[‹\ã–YZ[à\Ÿ\ã‹[€ò[H\›Hô]»ö[ã€X]\öX[€›[ù[ùZŸBàõ‹àHÿ][Ÿ»][H]\»õ›[ôXYHX›]ôH[à]ö[ãÇéà€€ôö\õHõ»ö[ãZ][Hô]\ô[Y[ù‹à\ôX›\ò⁄]ôHX›[€à\»^‹ŸY[à\¬à€XŸKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHHô^[ùô[ù‹ûH€XŸH⁄›[ZŸ[HôHö[ãZ][Hô]\ô[Y[ùYù\àH€›[ùà€‹öŸõ›»\»ô\öYöYY[àTàÿÿ[à\‹]⁄‹àô]\õãYúõ€KZõÿà\[ô[ô»€Çà‹\ò][€ò[ö[‹ö]KÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»ôZ[ùõŸXŸY€õHHô\Ÿ\ùôY€›[ùî»‹ò\\ú»[ôàYõ›⁄[ôŸHÿ⁄[XKìÀ\õZ\‹⁄[€úÀô]\ô[Y[ù\ôX›ò[[òŸH‹ö]\À‹ÇàYŸ\à\ö]ò][€ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH[ùô[ù‹ûH€›[ù€‹öŸõ›‹»ô]\ŸYH^\›[ô¬ò\õ›ôY€›[ùî»‹ò\\ú»[ôYõ›⁄[ôŸHÿ⁄[XKìÀ\õZ\‹⁄[€úÀúô]\ô[Y[ù\ôX›ò[[òŸH‹ö]\À‹àYŸ\à\ö]ò][€à[ô\àTê“UP’TëBùåãåÃ»Së—ëà[ùûHMçKÇÇà»»[ùûHMçàHô\›‹ôH[ùô[ù‹ûHö[ã€X]\öX[ô]\ô[Y[ù[àõ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»[ùô[ù‹ûHö[ã[X]\öX[ô]\ô[Y[ùääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àååNNX
ô\›‹ôH[ùô[ù‹ûH€›[ù€‹öŸõ›‹»[àåÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMçXÇãHûX[àô\öYöYY[ùô[ù‹ûH€›[ù€‹öŸõ›‹»[àõŸX›[€à[ôô\YYô€€Ÿ¬à€ÀàõÿŸYYàÇãHö[ã€X]\öX[ô]\ô[Y[ù\»[ôXYHÿ⁄ŸY\»H€Ÿù\ô]\ô[Y[ù€‹öŸõ›»õ‹ÇàZ\›ZŸ[à›ùX›\ò[[ö‹ÀÇãHHô\Ÿ\ùôY€⁄»[ôXYHÿ[»Hÿ⁄ŸYô]\ôWÿö[ó⁄][XîÀÇÇà»»»⁄]ÿ\»€€\]YãHYY›X\ôYô]\ô[Y[ù€€ùõ€»»H[ùô[ù‹ûH€›[ùXõKÇãHYYô]\ôXX›[€à\à€›[ùõ›ÀÇãHYYô\õÀ\ﬁ\›[K\]X[ù]HRH[ôõ‹òŸ[Y[ùôYõ‹ôHô]\ô[Y[ùÿ[àôH›\ùYÇãHYY[õ[ôHôX\€€àÿ\\ôH[ô€€ôö\õKÿÿ[òŸ[€€ùõ€»õ‹àHŸ[X›Yàô]\ô[Y[ùõ›ÀÇãHX]⁄YHRH‹ö]Hÿ]H»HŸ\ùô\àî»€€ùòX›ÇàH]ô[‹\ã–YZ[àõ€N¬àHÿ[óÿ\ò⁄]ôW‹ôX€‹ôÿ¬àHô\õ»ò[[òŸN¬àHô\]Z\ôYôX\€€ãÇãH⁄\ôYô]\ô[Y[ùõ›Y⁄Hô\Ÿ\ùôYà\ŸPö[í][Tô]\ô[Y[ùúô]\ôPö[í][X€⁄ÀÇãHôYúô\⁄Y€›[ù⁄Y][ùô[ù‹ûHôXY[Ÿ[[ôò[úÿX›[€à\›‹ûHYù\àBà›XÿŸ\‹Ÿù[ô]\ô[Y[ùÇãH\]Y[ùô[ù‹ûHõ›[ô\ûH€‹H»⁄›»ô\õÀXò[[òŸHô]\ô[Y[ù\»]ôH⁄[Bàÿÿ[õô\à\‹]⁄ô[XZ[ú»Yô\úôYÇãHYYõÿ›\ŸY‘‘»õ‹àô]\ô[Y[ùŸ[»[ô€€ôö\õKÿÿ[òŸ[€€ùõ€ÀÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãìÀ\õZ\‹⁄[€àõYÀ›‹òYŸKô]YûBàù[ò›[€ãòX⁄Ÿ[ô‹àî»Yö[ö][€à⁄[ôŸYÇãHô]\ô[Y[ù‹ö]\»\ôH\ôõ‹õYY€õHõ›Y⁄Hô\Ÿ\ùôYô]\ôWÿö[ó⁄][Xàî»‹ò\\ãÇãHHå»RHŸ\»õ›‹ö]H[ùô[ù‹ûWÿò[[òŸ\ÿ\ôX›KÇãHô]\ô[Y[ù\»\ÿXõY[õ\‹»Hõ›…‹»\‹^YYﬁ\›[H]X[ù]H\»ô\õŒ¬àHî»›[ôXÿ[›[]\»YŸ\ãY\ö]ôYò[[òŸH[ôô[XZ[ú»]]‹ö]]]ôKÇãHô]\ô[Y[ù\ò⁄]ô\»Hö[ã€X]\öX[[ö»€õH[ôŸ\»õ›‹ö]HHYŸ\Çà]X[ù]Hò[úÿX›[€ãÇãHTàÿÿ[à\‹]⁄ô[XZ[ú»[ö[\[Y[ùY[à\»å»€XŸKÇãH^ô\‹»⁄X⁄€›][ôô]\õãYúõ€KZõÿàô[XZ[àŸ\\ò]Hù]\ôH€XŸ\ÀÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄[ùô[ù‹ûK“[ùô[ù‹ûU€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH›]X»ÿÿ[à€€ôö\õYYô]\ô[Y[ù\»õ›]Y€õHõ›Y⁄Hô\Ÿ\ùôYà\ŸPö[í][Tô]\ô[Y[ù€⁄»[ôô]\ôWÿö[ó⁄][XîÀÇãH›]X»ÿÿ[à€€ôö\õYY€›[ù‹ö]\»ô[XZ[àõ›]Y€õHõ›Y⁄ÇàHŸ]⁄[ùô[ù‹ûWÿ€›[ù‹]X[ù]XàH[ùZŸW⁄[ùô[ù‹ûWÿ€›[ùàHô]\ôWÿö[ó⁄][XãH›]X»ÿÿ[à€€ôö\õYYHå»[ùô[ù‹ûH€‹ö‹‹XŸH[ô€›[ù€⁄‹»»õ›à\ôX›Hÿ[[úŸ\ù\]X[]X\Ÿ\ù‹Çà[ùô[ù‹ûWÿò[[òŸ\ÿÇãH›\Xò\ŸH⁄[ôŸ[Ÿ»ÿ\»⁄X⁄ŸYõ‹àô[]ò[ùúôXZ⁄[ô»⁄[ôŸ\ÀàH›\úô[ùà]HTH‹ò[ù⁄[ôŸHX]\ú»õ‹àô]€H‹ôX]YXõX»Xõ\ÀŸù[ò›[€úÀù]à\»\‹»Y»õ»ô]»XõKù[ò›[€ãZY‹ò][€ã‹à‹ò[ù[ôô]\Ÿ\»Bà^\›[ô»ô]\ô[Y[ùîÀÇãH]][ùXÿ]Y]ôHô]\ô[Y[ùù[ù[YHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€BàûX[â‹»úõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»[ùô[ù‹ûHô]\ô[Y[ù€XŸKÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H]ô[‹\ã–YZ[à\Ÿ\à][€»\»ÿ[óÿ\ò⁄]ôW‹ôX€‹ôÿÇçà‹[à[ùô[ù‹ûHà€›[ùÇçKà€€ôö\õHõ€ã^ô\õ»õ›‹»⁄›»ñô\õ»€›[ùô\]Z\ôYö\ú›à[ôÿ[õõ›ôBàô]\ôYÇçãà€€ôö\õHHô\õÀX€›[ùõ›»^‹Ÿ\»ô]\ôKôX\€€ã€€ôö\õK[ôÿ[òŸ[ÇçÀàô]\ôH€õHH€õ›€àZ\›ZŸ[àô\õÀXò[[òŸHö[ã€X]\öX[[öÀÇéà€€ôö\õHHô]\ôYõ›»X]ô\»X›]ôH€›[ùöY]‹»Yù\àôYúô\⁄ÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHHô^[ùô[ù‹ûH€XŸH⁄›[ZŸ[HôHTàÿÿ[à\‹]⁄[ù»^\›[ô¬àÿ\ùÿ€›[ùõ›‹»‹àô]\õãYúõ€KZõÿà\[ô[ô»€à‹\ò][€ò[ö[‹ö]KÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»ôZ[ùõŸXŸY€õHHô\Ÿ\ùôYô]\ô[Y[ùî»‹ò\\Çà[ôYõ›⁄[ôŸHÿ⁄[XKìÀ\õZ\‹⁄[€úÀ\ôX›ò[[òŸH‹ö]\À‹àYŸ\Çà\ö]ò][€ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH[ùô[ù‹ûHö[ã€X]\öX[ô]\ô[Y[ùô]\ŸYH^\›[ô¬ò\õ›ôYô]\ôWÿö[ó⁄][Xî»‹ò\\à[ôYõ›⁄[ôŸHÿ⁄[XKìÀú\õZ\‹⁄[€úÀ\ôX›ò[[òŸH‹ö]\À‹àYŸ\à\ö]ò][€à[ô\àTê“UP’TëBùåãåÃ»Së—ëà[ùûHMçãÇÇà»»[ùûHMç»Hô\›‹ôH[ùô[ù‹ûHÿÿ][€àTà\‹]⁄[àõ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»[ùô[ù‹ûHTà\‹]⁄ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àMXNLô
ô\›‹ôH[ùô[ù‹ûHö[àX]\öX[ô]\ô[Y[ù[àåÿ
KÇãH\ò⁄]X›\ôHô\ú⁄[€à€€ôö\õYYàåãåÃÇãHö[‹àSë—ëà⁄X⁄‹⁄[ù€€ôö\õYYà[ùûHMçòÇãHûX[àô\öYöYY[ùô[ù‹ûHö[ã€X]\öX[ô]\ô[Y[ù[àõŸX›[€à[ôô\YYàô€€Ÿ»€ÀàõÿŸYYàÇãHåàÿÿ][€àTàôZ]ö[‹àÿ\»õ›][ôÀÿ€€ù^€õNàÿÿ[õö[ô»ô\€€ô\»Bàÿÿ][€à[ô\‹]⁄\»[ù»^\›[ô»ÿ\ù‹à€›[ùõ›‹ÀÇãHHô\Ÿ\ùôYÿÿ][€à[\ú»[ôXYH\úŸH‹ÿÿ[ã€ÿÿ][€ãœ]ZYò^[ÿYÀÇÇà»»»⁄]ÿ\»€€\]YãHYY]][ùXÿ]Y‹ÿÿ[ã€ÿÿ][€ãŒõÿÿ][€íYõ›]H[ú⁄YHHå»⁄[ÇãHYY[à[ùô[ù‹ûHÿÿ[òöY]ÀÇãHYYX[ùX[ÿÿ[à^[ÿY[ùûH]XÿŸ\ŒÇàHù[õ‹ùÿ]HTàTìŒ¬àH‹ÿÿ[ã€ÿÿ][€ãœ]ZYò]Œ¬àHò]»ÿÿ][€àURQŒ¬àH^X›[ö]⁄[ãò^K‹àö[à€Ÿ\ÀÇãHYY€ŸH\ÿ[XöY›X][€à⁄[à[‹ôH[à€ôHÿÿ][€àX]⁄\»X[ùX[[ú]ÇãHYYôXY[€õHÿÿ[àô\›[ô\€€][€àõ›Y⁄\ŸR[ùô[ù‹ûP€›[ù⁄Y]ÇãHYYÿÿ[àô\›[›[[X\ûH⁄]ÿÿ][€à]ô[€ŸK‹]URQX]\öX[õ›¬à€›[ù[ô›[]X[ù]H[àÿ€‹KÇãHYY\‹]⁄úõ€Hÿÿ[õôYö[àŒÇàH[ùô[ù‹ûHÿ\ùö[\ôY»Hÿÿ[õôYö[é¬àH[ùô[ù‹ûH€›[ùö[\ôY»Hÿÿ[õôYö[ãÇãHYY[ö]‹⁄[ãÿò^Hÿÿ[à›\‹ùûH\›[ô»ö[ú»[àHÿÿ[õôYÿ€‹H[ôàô\]Z\ö[ô»H‹\ò]‹à»⁄€‹ŸHHö[àôYõ‹ôH‹[ö[ô»ÿ\ù‹à€›[ùÇãHYYÿÿ[õôYXö[à€€ù^[ô[»[àÿ\ù[ô€›[ùÇãHYò][Y€›[ù[ùZŸHö[àŸ[X›[€à»Hÿÿ[õôYö[à⁄[à€›[ù\»‹[ôYàúõ€HHÿÿ[àô\›[ÇãH\]Y[ùô[ù‹ûHõ›[ô\ûH€‹H»⁄›»Tà\‹]⁄\»]ôKÇãHYYõÿ›\ŸY‘‘»õ‹àÿÿ[à^[ÿYX]⁄[ôö[ãY\‹]⁄€€ùõ€ÀÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãìÀ\õZ\‹⁄[€àõYÀ›‹òYŸKô]YûBàù[ò›[€ãòX⁄Ÿ[ô‹àî»Yö[ö][€à⁄[ôŸYÇãHTàÿÿ[õö[ô»Ÿ\»õ›‹ôX]K\]K\ò⁄]ôK⁄X⁄€›]€›[ù‹àô]\ôBà[ùô[ù‹ûHûH]Ÿ[ãÇãHÿÿ[àô\€€][€à\Ÿ\»H^\›[ô»[ùô[ù‹ûH€›[ù⁄Y]€ÿÿ][€àôXY]ÇãHÿ\ù€›[ù[ôô]\ô[Y[ùX›[€ú»ô[XZ[à[ú⁄YHZ\à^\›[ô»ô\›‹ôYà€‹öŸõ›‹»[ôî»‹ò\\úÀÇãHHå»RHŸ\»õ›‹ö]H[ùô[ù‹ûWÿò[[òŸ\ÿ\ôX›KÇãHÿ[Y\òHX€Ÿ[ô»ô[XZ[ú»Yô\úôY»\»€XŸHô\›‹ô\»õ›]K€X[ùX[TÇà\‹]⁄[ôö[ùY[[ö»ôZ]ö[‹ãÇãH^ô\‹»⁄X⁄€›][ôô]\õãYúõ€KZõÿàô[XZ[àŸ\\ò]Hù]\ôH€XŸ\ÀÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ–\öúﬁãH‹òÀ€[Ÿ[\À⁄[ùô[ù‹ûK“[ùô[ù‹ûU€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH›]X»ÿÿ[à€€ôö\õYYÿÿ[à\‹]⁄[ùõŸXŸYõ»\ôX›[úŸ\ù\]Xà[]X\Ÿ\ù‹à[ùô[ù‹ûWÿò[[òŸ\ÿ‹ö]H]ÇãH›]X»ÿÿ[à€€ôö\õYY[ùô[ù‹ûH‹ö]Hî»ò[Y\»ô[XZ[à[Z]YŒÇàHŸ]⁄[ùô[ù‹ûWÿ€›[ù‹]X[ù]XàH[ùZŸW⁄[ùô[ù‹ûWÿ€›[ùàHô]\ôWÿö[ó⁄][XãH›]X»ÿÿ[à€€ôö\õYY‹ÿÿ[ã€ÿÿ][€ãŒõÿÿ][€íYõ›]H[ôà\úŸSÿÿ][€îÿÿ[î^[ÿY\ôHô\Ÿ[ù[àHå»ù[ôH€›\òŸKÇãH›\Xò\ŸH⁄[ôŸ[Ÿ»ÿ\»⁄X⁄ŸYõ‹àô[]ò[ùúôXZ⁄[ô»⁄[ôŸ\ÀàH›\úô[ùà]HTH‹ò[ù⁄[ôŸHX]\ú»õ‹àô]€H‹ôX]YXõX»Xõ\ÀŸù[ò›[€úÀù]à\»\‹»Y»õ»ô]»XõKù[ò›[€ãZY‹ò][€ã‹à‹ò[ù[ôô]\Ÿ\¬à^\›[ô»ôXY]ÀÇãH]][ùXÿ]Y]ôHÿÿ[à\‹]⁄ô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇãHõ»Ÿ\\ò]H]]€X]Y\›ÿ‹ö\^\›»ô^[€ôúHù[àùZ[ÇÇà»»»ô^›\»
[à‹ô\äBåKà€€[Z][ô\⁄\»[ùô[ù‹ûHTà\‹]⁄€XŸKÇåãà]Hõ‹õX[⁄]X€€õôX›Yô]YûHõŸX›[€à\ﬁH€€\]KÇåÀà⁄Y€à[à⁄]H\Ÿ\à]\»ÿ[ó€X[òYŸW⁄[ùô[ù‹ûXÇçà‹[à[ùô[ù‹ûHàÿÿ[ãÇçKà\›HH€õ›€à‹ÿÿ[ã€ÿÿ][€ãœ]ZYò^[ÿY‹à^X›ö[à€ŸKÇçãà€€ôö\õHHÿÿ[àô\›[YŸHô\€€ô\»ôXY[€õKÇçÀà‹[àÿ\ùúõ€HHÿÿ[àô\›[[ô€€ôö\õHÿ[ôY]\»\ôHö[\ôY»Bàÿÿ[õôYö[ãÇéà‹[à€›[ùúõ€HHÿÿ[àô\›[[ô€€ôö\õHõ›‹À⁄[ùZŸH\ôHö[\ôY»Bàÿÿ[õôYö[ãÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]YõŸX›[€àô\öYöXÿ][€àô\]Z\ô\»ûX[â‹»úõ›‹Ÿ\àŸ\‹⁄[€ãÇãHÿ[Y\òHX€Ÿ[ô»ÿ[àôHô\›‹ôYôZ[ôHÿ[YHÿÿ[àöY]»]\àYàöY[\ŸBàô\]Z\ô\»[ãXúõ›‹Ÿ\àÿ[Y\òHÿÿ[õö[ôÀÇãHHô^[ùô[ù‹ûH€XŸH⁄›[ZŸ[HôHô]\õãYúõ€KZõÿà‹à[õ›\Çàô[XZ[ö[ô»X]\öX[[›ô[Y[ù€‹öŸõ›ÀÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôHX›]ôKà\»\‹»ôZ[ùõŸXŸY€õHÿÿ[àõ›]Kÿ€€ù^\‹]⁄[ôYàõ›⁄[ôŸHÿ⁄[XKìÀ\õZ\‹⁄[€úÀ\ôX›ò[[òŸH‹ö]\À‹àYŸ\Çà\ö]ò][€ãÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH[ùô[ù‹ûHÿÿ][€àTà\‹]⁄\»ôXY[€õH€€ù^úõ›][ô»[ù»^\›[ô»\õ›ôY€‹öŸõ›‹»[ôYõ›⁄[ôŸHÿ⁄[XKìÀú\õZ\‹⁄[€úÀ\ôX›ò[[òŸH‹ö]\À‹àYŸ\à\ö]ò][€à[ô\àTê“UP’TëBùåãåÃ»Së—ëà[ùûHMçÀÇÇà»»[ùûHMéHö^[ùô[ù‹ûHTàÿÿ[à^[ÿYXÿŸ\[òŸH[àõ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»[ùô[ù‹ûHTà\‹]⁄›ö^ääîŸ\‹⁄[€à\NääàùY»ö^Çà»»»€€ù^ãH›\ù[ô»€€[Z]àŒÕXåLX
ô\›‹ôH[ùô[ù‹ûHTà\‹]⁄[àåÿ
KÇãHûX[àô\‹ùY[ùô[ù‹ûHàÿÿ[à€›[õ›XÿŸ\[ú][ôŸ\⁄›⁄[ô¬àì€õHõ‹ùÿ]HHÿÿ][€àTà^[ÿY»\ôH›\‹ùYàÇãHõŸX›[€àÿ[à[ò€›[ù\àTàTì»⁄]Z]\à‹ÿÿ[ã€ÿÿ][€ãœ]ZYò‹àBà\ﬁYY€õ‹ùÿ]K‹ÿÿ[ã€ÿÿ][€ãœ]ZYòò\Ÿ[ò[YKÇãHX[ùX[ÿÿ][€à€ŸH€⁄›\ÿ\»€»›öX›[ô›\ôòXŸYHTà\úŸ\à\úõ‹Çà]ô[à⁄[àH‹\ò]‹à[ù[ôYH€ŸH€⁄›\ÇÇà»»»⁄]ÿ\»€€\]YãH\]Y\úŸSÿÿ][€îÿÿ[î^[ÿY»XÿŸ\ò\Ÿ[ò[YK\ôYö^Yà€õ‹ùÿ]K‹ÿÿ[ã€ÿÿ][€ãœ]ZYò^[ÿY]»\»ò[Yõ‹ùÿ]Hÿÿ][€ÇàTà^[ÿYÀÇãHŸ\ò]»URQ[ôõ€›‹ÿÿ[ã€ÿÿ][€ãœ]ZYò^[ÿY›\‹ù[ùX›ÇãHYYúöY[ôY\àX[ùX[ÿÿ][€à€⁄›\õ‹õX[^ò][€éÇàHY€õ‹ô\»‹XŸ\À€\⁄\À[ò›X][€ã[ô\⁄\Œ¬àHX]⁄\»ÿÿ][€à€ŸKXô[]URQ[ô]ŸY€Y[ùÀÇãHYYÿY[ôÀŸ\úõ‹àY\‹ÿYŸ\»õ‹àX[ùX[€ŸH€⁄›\€»‹\ò]‹ú»Ÿ]àÿÿ][€ã\ôXYôYYòX⁄»[ú›XYŸàHTã[€õH\úŸ\à\úõ‹ãÇãH⁄[ôŸYõÀ[X]⁄€‹H»€\öYûH]õ›Tà^[ÿY»[ôÿÿ][€à€Ÿ\»\ôBàXÿŸ\YÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãìÀ\õZ\‹⁄[€àõYÀ›‹òYŸKô]YûBàù[ò›[€ãòX⁄Ÿ[ô‹àî»Yö[ö][€à⁄[ôŸYÇãH\»\‹»⁄[ôŸY€õHÿÿ[à\ú⁄[ô»[ôX[ùX[€⁄›\ôZ]ö[‹ãÇãHTàÿÿ[õö[ô»ô[XZ[ú»ôXY[€õH€€ù^\‹]⁄[ô›[Ÿ\»õ›]]]Bà[ùô[ù‹ûKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€Xã€ÿÿ][€î\ãöúÿãH‹òÀ€[Ÿ[\À⁄[ùô[ù‹ûK“[ùô[ù‹ûU€‹ö‹‹XŸKöúﬁãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôH[ú]ô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹»úõ›‹Ÿ\ÇàYù\à\ﬁ[Y[ùÇÇà»»»ô^›\¬åKà€€[Z][ô\⁄\»Tà[ú]›ö^Çåãà\ﬁH»õŸX›[€ãÇåÀàôK]\›[ùô[ù‹ûHàÿÿ[à⁄]ÇàHH€õ‹ùÿ]K‹ÿÿ[ã€ÿÿ][€ãœ]ZYòTì¬àHH‹ÿÿ[ã€ÿÿ][€ãœ]ZYòTì¬àH[à^X›ÿÿ][€ãÿö[à€ŸKÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH\»\»HTà\úŸ\ã€X[ùX[€⁄›\›ö^€õH[ôôŸ\»õ›⁄[ôŸHÿ⁄[XKìÀ\õZ\‹⁄[€úÀ‹ö]H]Àò[[òŸH‹ö]\À‹ÇõYŸ\à\ö]ò][€à[ô\àTê“UP’TëHåãåÃ»Së—ëà[ùûHMéÇÇà»»[ùûHMéHHö^ÿÿ[à\‹]⁄õ›]H›X\ôòXŸH[àõ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»[ùô[ù‹ûHTà\‹]⁄›ö^ääîŸ\‹⁄[€à\NääàùY»ö^Çà»»»€€ù^ãH›\ù[ô»€€[Z]àLLŸYYò
ö^[ùô[ù‹ûHTàÿÿ[à[ú]XÿŸ\[òŸX
KÇãHûX[àô\‹ùY‹[ö[ô»ÿ\ùúõ€HHX]\öX[ÿÿ[à€€\€ô[ùôY\ôX›YòX⁄¬à»\⁄õÿ\ôÇãHHÿÿ[àô\›[\‹]⁄ò]öYÿ]\»»⁄[ùô[ù‹ûO›öY]œXÿ\ù	úÿÿ[êö[íYKããòÇãH[Ÿ[Tÿ‹ôY[òÿ\»ôKX⁄X⁄⁄[ô»\õZ\‹⁄[€ú»[[YYX][H[ôôY\ôX›[ô»YÇà[ùô[ù‹ûH\õZ\‹⁄[€àõY‹»Ÿ\ôH›[]Z\àYò][ÿY[ôÀŸ[ûH›]KÇÇà»»»⁄]ÿ\»€€\]YãH\]Y[Ÿ[Tÿ‹ôY[ò»ÿZ]⁄[H\ŸT\õZ\‹⁄[€ú 
X\»ÿY[ô»ôYõ‹ôBà\Z[ô»H[Ÿ[H]]‹ö^ò][€àôY\ôX›ÇãHYYH€€\X›XÿŸ\‹ÀX⁄X⁄⁄[ô»›]H[ú›XYŸàôY\ôX›[ô»\ö[ô»Bà\õZ\‹⁄[€àôYúô\⁄⁄[ô›ÀÇãHYùHŸ\ùô\ãX]]‹ö]]]ôHõ›]H\õZ\‹⁄[€à⁄X⁄»[ùX›€òŸH\õZ\‹⁄[€ú¬àö[ö\⁄ÿY[ôÀÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãìÀ\õZ\‹⁄[€àõYÀ›‹òYŸKô]YûBàù[ò›[€ãòX⁄Ÿ[ôî»Yö[ö][€ã‹à[ùô[ù‹ûH€‹öŸõ›»⁄[ôŸYÇãH\»ö^YôôX›»õ›]KY›X\ô[Z[ô»€õKÇãH[ò]]‹ö^ôY\Ÿ\ú»\ôH›[ôY\ôX›YYù\à\õZ\‹⁄[€ú»ÿYÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À”[Ÿ[Tÿ‹ôY[ãöúﬁãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH]][ùXÿ]Y]ôHÿÿ[ã]ÀXÿ\ùô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹¬àúõ›‹Ÿ\àYù\à\ﬁ[Y[ùÇÇà»»»ô^›\¬åKà€€[Z][ô\⁄\»õ›]KY›X\ô›ö^Çåãà\ﬁH»õŸX›[€ãÇåÀàôK]\›‹[ö[ô»ÿ\ù[ô€›[ùúõ€HHÿÿ[àô\›[ÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH\»\»Hõ›]KY›X\ôÿY[ôÀ\›]Hö^€õH[ôôŸ\»õ›⁄[ôŸHÿ⁄[XKìÀ\õZ\‹⁄[€úÀ‹ö]H]Àò[[òŸH‹ö]\À‹ÇõYŸ\à\ö]ò][€à[ô\àTê“UP’TëHåãåÃ»Së—ëà[ùûHMéKÇÇà»»[ùûHMÃHô\›‹ôH[ò⁄[ôŸY[ùô[ù‹ûH][]H›\ôòXŸ\»[àõ‹ùÿ]HHå¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôXùZ[»[ò⁄[ôŸY[ùô[ù‹ûH][]H›ŸY\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ãH›\ù[ô»€€[Z]àôNMMòY
ö^ÿÿ[à\‹]⁄õ›]H›X\ô
KÇãHûX[àô\]Y\›Y\Z[ô»[[ò⁄[ôŸYù[ò›[€ò[YXŸ\»úõ€Håãå»åÀå\¬àYôöX⁄Y[ùH\»‹‹⁄XõK⁄]›]ÿ\›[ô»Yôõ‹ù€àYXŸ\»]\ôH⁄[ô⁄[ôÀÇãHH›Ÿ\›\ö\⁄»[ò⁄[ôŸYù[ò›[€ú»Yù[à[ùô[ù‹ûHŸ\ôHôXY[€õH][]Bà›\ôòXŸ\»›ô\à^\›[ô»€›[ù\⁄Y]€ÿÿ][€à[\úÀÇÇà»»»⁄]ÿ\»€€\]YãHYY[ùô[ù‹ûH›ô\ùöY]ÿöY]ÀÇãHYY‹ò[ôX\›\à[ùô[ù‹ûHôXY[€õHXõH\⁄[ô»H^\›[ô»€›[ù⁄Y]àôXY[Ÿ[ÇãHYYö\⁄XõK\õ›»›[[X\ûHÿ\ôŒÇàHõ›‹»[àöY]Œ¬àH]X[ù]H[àöY]Œ¬àH›À€Z[àõ›‹Œ¬àH[ùô[ù‹ûHò[YKÇãHYY[ùô[ù‹ûHXÿ€›[ù[ô»^‹ùöY]ÀÇãHYYôXY[€õHò[X][€à^‹ùô]öY]»\⁄[ô»^\›[ô»]X[ù]H[ôàÿ][Ÿ›YH[ö]X€‹›öY[ÀÇãHYY‘’à›€õÿYõ‹àö\⁄XõHõ€ã^ô\õ»^‹ùõ›‹ÀÇãHYY[ùô[ù‹ûHÿÿ][€ú»	àTòöY]ÀÇãHYYôXY[€õH[ö]‹⁄[ãÿò^Kÿö[àÿÿ][€àXõHúõ€H^\›[ô»ÿÿ][€ÇàôXY]ÀÇãHYYŸ[X›Yÿÿ][€àTàô]öY]ÀÇãHYYŸ[X›Yÿÿ][€àTà’ë»›€õÿYÇãHYYŸ[X›Yÿÿ][€à‹[àÿÿ[àô\›[X›[€ãÇãHô\›‹ôYÿ[Y\òHTàX€Ÿ[ô»[à[ùô[ù‹ûHÿÿ[òÇãHŸ\Tàÿ[Y\òHX€Ÿ[ô»^ûK[ÿYY⁄]HŸ\\ò]Hú‘Tò⁄[ö»€»HXZ[Çàù[ôHŸ\»õ›^H]€‹›[õ\‹»ÿ[Y\òHÿÿ[õö[ô»\»\ŸYÇãH\]Y[ùô[ù‹ûH€‹H»ôYõX›Hô\›‹ôY[ò⁄[ôŸY][]H›\ôòXŸ\ÀÇÇà»»»ÿYô]H[ôõ›[ô\ûHõ›\¬ãHõ»›\Xò\ŸHÿ⁄[XKZY‹ò][€ãìÀ\õZ\‹⁄[€àõYÀ›‹òYŸKô]YûBàù[ò›[€ãòX⁄Ÿ[ôî»Yö[ö][€ã‹àô]»XõHXÿŸ\‹»⁄[ôŸYÇãHô]»›ô\ùöY]ÀXÿ€›[ù[ô»^‹ù[ôÿÿ][€úÀ‘Tà›\ôòXŸ\»\ôHôXY[€õKÇãH‘’à[ôTà’ë»›€õÿY»\ôHúõ›‹Ÿ\ã[ÿÿ[^‹ù»úõ€H[ôXYK]ö\⁄XõH]KÇãHÿ[Y\òHÿÿ[õö[ô»ô\€€ô\»Tà€€ù^€õH[ôŸ\»õ›]]]H[ùô[ù‹ûKÇãHÿ\ù€›[ù[ôô]\ô[Y[ùX›[€ú»ô[XZ[à[ú⁄YHZ\à^\›[ô»ô\›‹ôYà€‹öŸõ›‹»[ôî»‹ò\\úÀÇãHHå»RHŸ\»õ›‹ö]H[ùô[ù‹ûWÿò[[òŸ\ÿ\ôX›KÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄[ùô[ù‹ûK“[ùô[ù‹ûU€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇãHúHù[àùZ[\‹ŸY⁄]ö]HåKåÇãHùZ[›]]‹]ú‘Tò[ù»H^ûH⁄[öŒÇàHú‘TãQÿQ\€åÀöúÿãHHùZ[õŸXŸYH^X›Yö]H⁄[öÀ\⁄^ôHÿ\õö[ô»€õKÇãH›]X»ÿÿ[à€€ôö\õYYH[ùô[ù‹ûH€‹ö‹‹XŸH[ùõŸXŸYõ»\ôX›[úŸ\ùà\]X[]X\Ÿ\ù‹à[ùô[ù‹ûWÿò[[òŸ\ÿ‹ö]H]ÇãH›]X»ÿÿ[à€€ôö\õYY[ùô[ù‹ûH‹ö]Hî»ò[Y\»ô[XZ[à[Z]YŒÇàHŸ]⁄[ùô[ù‹ûWÿ€›[ù‹]X[ù]XàH[ùZŸW⁄[ùô[ù‹ûWÿ€›[ùàHô]\ôWÿö[ó⁄][XãH]][ùXÿ]Y]ôHô\öYöXÿ][€àô[XZ[ú»[ô[ô»úõ€HûX[â‹»úõ›‹Ÿ\àYù\Çà\ﬁ[Y[ùÇÇà»»»ô^›\¬åKà€€[Z][ô\⁄\»[ò⁄[ôŸY[ùô[ù‹ûH][]H›ŸY\Çåãà\ﬁH»õŸX›[€ãÇåÀàô\öYûH[ùô[ù‹ûHà›ô\ùöY]»ÿY»õ›‹ÀÇçàô\öYûH[ùô[ù‹ûHàXÿ€›[ù[ô»^‹ù›€õÿY»‘’ãÇçKàô\öYûH[ùô[ù‹ûHàÿÿ][€ú»	àTàô]öY]‹ÀŸ›€õÿY»Tà’ë»[ô‹[ú»Bàÿÿ[àô\›[Ççãàô\öYûH[ùô[ù‹ûHàÿÿ[àÿ[Y\òHÿÿ[õô\à›\ù»€à»[ô‹[ú»H€õ›€àTÇà^[ÿYÇÇà»»»ô[XZ[ö[ô»\€‹ö»€ò\⁄›ãH[ùô[ù‹ûNàô[XZ[ö[ô»⁄[ôŸYŸYô\úôY€‹öŸõ›‹»[ò€YHô]\õãYúõ€KZõÿãà^ô\‹»⁄X⁄€›]€X[òYŸ\à›ô\úöYK[ô[ûHY][€ò[[›ô[Y[ùõ›‹»õ›Y]à[ù[ù[€ò[Hô\›‹ôYÇãH\›[X]\Œà›\úô[ùH⁄[Ÿõ›[ô][€à€õN»ôYY»\õ›ôY\›[X]HôXYà[Ÿ[‹ôX]KŸY]€‹öŸõ›ÀöX⁄[ôÀ\õ›ò[€ò\⁄›ÿ›[Y[ùÀ[ôà\›‹ûH⁄\ö[ôÀÇãHõÿúŒà]ôHôXY[€õHõ›[ô][€à^\›Œ»ô[XZ[ö[ô»õÿà]Z[›Xõ[Ÿ[\Àà‹ö]H€‹öŸõ›‹ÀX]\öX[Àÿù^[›]‹ÿ⁄Y[Kÿ€€\][€ã[ôÿ›[Y[ù»⁄\ö[ô¬à›[ôYYö[ö\⁄€‹öÀÇãHôZX€\Œà]ôH\ôX›‹ûHõ›[ô][€à^\›Œ»\‹⁄Y€õY[ùŸ\ùöXŸK\›‹ûKà[ú‹X›[€úÀZ[XYŸK[ôXZ[ù[ò[òŸH€‹öŸõ›‹»ô[XZ[ãÇãH[\ﬁYY\Œà]ôH\ôX›‹ûHõ›[ô][€à^\›Œ»\‹⁄Y€õY[ùÀ‹ôY[ùX[ÀÇàõŸö[H€›\òŸHöY[ÀX›]ö]K[ô€€ùõ€Y‹ôX]KŸY]ô[XZ[ãÇãH€€Œà]ôHÿ][Ÿ›YHõ›[ô][€à^\›Œ»›\›ŸK⁄X⁄€›]TàXô[Àà\‹⁄Y€õY[ù\›‹ûKò[úŸô\ã€ÿÿ][€à[öÿYŸK[ô€€ùõ€Y‹ôX]KŸY]àô[XZ[ãÇãHô\‹ùŒà⁄[‹ôXY[ô\‹»^\›Œ»‹\ò][€ò[ô\‹ù»ôYY€›\òŸH[Ÿ[\»[ôà\õ›ôYôXY[Ÿ[ÀÇãHXÿ€›[ù[ôŒàô]öY]ÀŸ^‹ùõ›[ô][€à^\›Œ»ö[ò[Xÿ€›[ù[ô»‹›»\[ô€Çà€€\]YõÿúÀ\›[X]\À[ô[ùô[ù‹ûH€‹öŸõ›‹ÀÇãHÿ›[Y[ùŒà€‹ö‹‹XŸH^\›Œ»›€ô\ã\‹X⁄YöX»ÿ›[Y[ù⁄\ö[ô»⁄›[ôHYY¬àXX⁄€›\òŸH[Ÿ[H\»‹ŸH[Ÿ[\»ö[ö\⁄ÇÇà»»»õ›][ô»ô\ôX›ìõ»€]YHô]öY]»ôYYYH\»\‹»ô\›‹ôYôXY[€õH[ùô[ù‹ûH][]Bú›\ôòXŸ\»[ôÿ[Y\òHTà€€ù^\‹]⁄\⁄[ô»^\›[ô»€⁄‹À⁄[\úÀ⁄]õ¬úÿ⁄[XKìÀ\õZ\‹⁄[€ã‹ö]K\]ò[[òŸK]‹ö]K‹àYŸ\ãY\ö]ò][€à⁄[ôŸBù[ô\àTê“UP’TëHåãåÃ»Së—ëà[ùûHMÃÇÇãKKBÇà»»[ùûHMÃH8†%õÿú»X]\öX[»Xàö\⁄Xö[]H€X[ù\Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[à€€ôö\õYYHõÿú»X]\öX[»Xà\»õ›ôYYY\»Hö\⁄XõHõÿú»]Z[ú›\ôòXŸHöY⁄õ›ÀàH€ŸH]⁄›[ô[XZ[à[àXŸH€»ù]\ôHX]\öX[¬ù€‹ö»\»õ›úõ⁄Ÿ[à‹àô[[›ôYô[X]\ô[KÇÇà»»»⁄]ÿ\»€€\]YãHYHX]\öX[ÿXàúõ€HHö\⁄XõHõÿú»]Z[ò]öYÿ][€ãÇãHô\Ÿ\ùôYH^\›[ô»ô\Ÿ\ùôYX]\öX[ÿXàYö[ö][€à[ôò[òX⁄¬àô\Ÿ\ùôY\[ô[ôZ]ö[‹ãÇãHYY[àX›]ôK]Xà›X\ô€»HY[à‹à›[HXàŸ[X›[€àô]\õú»¬à›ô\ùöY]ÿÇãHYùù^[›]ò[úÿX›[€úÀö[ò[ò⁄X[Àÿ›[Y[ùÀ[ôÿ⁄Y[H\»ö\⁄XõBàYô\úôYXú»õ‹àHô^õÿú»€X[ù\€XŸ\ÀÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHH^\›[ô»õÿóÿù^[›]€[ô\ÿõ›[ô][€àXõH[ôXYH^\›»ù]Ÿ\»õ›àY][ò€YHûX[â‹»ô\]Y\›Y›ùX›\ôYù^[›]⁄X⁄€\›öY[»õ‹àùYŸ]à[ö]X[ò[YKX›X[ò[YK[ö]X[XY[YK‹àX›X[XY[YKÇãHH^\›[ô»ÿ›[Y[ùÿõ›[ô][€à\Ÿ\»€ôHŸ[ô\öX»XõXÀôÿ›[Y[ùÿàXõH⁄]Hõ‹ùÿ]KYö[\ÿ›‹òYŸHùX⁄Ÿ]àõÿà\»›\úô[ùHH€õBà]ôH›€ô\à\H[àìÀÇÇà»»»ô^›\»
[à‹ô\äBåKàYö[ôHHõÿú»ÿ›[Y[ù»å»›€ô\ã\ÿ€‹YV[ôô\]Z\ôYÿ›[Y[ùÿ]Y€‹öY\ÀÇåãàYHù^[›]⁄X⁄€\›ÿ⁄[XH^[ú⁄[€à‹àô\XŸ[Y[ùöY[»Yù\àBà\⁄\ôY][ù[€àù[\»\ôHÿ⁄ŸYÇåÀàôXùZ[ù^[›]\»H]ôH›\Xò\ŸKXòX⁄ŸYõÿú»XãÇçàôXùZ[ö[ò[ò⁄X[»[ôÿ⁄Y[Húõ€HZ\à›[ô[€ôHS\⁄Y€ú»\¬à›\Xò\ŸKXòX⁄ŸYõÿú»Xú»€òŸHûX[à]X⁄\»H€›\òŸKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHX⁄YH⁄]\àò[úÿX›[€úÿô[XZ[ú»Hö\⁄XõHõÿú»XãôX€€Y\»HôXY[€õBà[ùô[ù‹ûH\‹›YH\›‹ûH[ô[‹à\»õ€Y[ù»ö[ò[ò⁄X[À“[ùô[ù‹ûH\›‹ûKÇãHX⁄YH⁄]\àù^[›]][ù[€à⁄›[ôHò\ŸY€à›]\ÀZ\‹⁄[ô»X›X[àò[Y\À›ô\ôYHXY[Y\ÀùYŸ]ò\öX[òŸK‹à[à^X⁄]][ù[€àõYÀÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôKà\»ÿ\»RHö\⁄Xö[]H€õH[ôYõ›⁄[ôŸH]HXÿŸ\‹Àÿ⁄[XKàìÀ›‹òYŸKî‹À‹à‹ö]HôZ]ö[‹ãÇÇãKKBÇà»»[ùûHMÃà8†%õÿú»ÿ›[Y[ù»⁄X⁄€\›õ›[ô][€ÇÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[à]X⁄YŒó\Ÿ\ú◊‹õò€W€ôQö]ôW\⁄›‹[ô^ö[\»H›[ô[€ôBëö[ò[ò⁄X[À‘ÿ⁄Y[K‘HôYô\ô[òŸKàHS\»ôYô\ô[òŸHX]\öX[€õN»å»\ö[ú›ùX›[€ú»[ô]HôZ]ö[‹à€€YHúõ€HûX[â‹»⁄]X⁄\⁄[€ú»[ôHÿ⁄ŸYî›\Xò\ŸHõ›[ô][€úÀÇÇîûX[àÿ⁄ŸYHõÿú»ÿ›[Y[ù»\ôX›[€éÇãHô\]Z\ôYÿ]Y€‹öY\»\ôH€€ùòX›À[úÀ\õZ]À›‹À⁄[ôŸH‹ô\úÀà€‹Ÿ[›]ÿ‹À[ùõ⁄XŸ\ÀZ\ÿÀ[ô^H\ÀÇãHH⁄X⁄€\›\»ö\›X[€õH[ôŸ\»õ›õÿ⁄»€‹öŸõ›ÀÇãHÿ›[Y[ù»ô[€ô»»Hõÿãõ›H\ÿY[ô»\Ÿ\ãÇãHYàH\Ÿ\àÿ[àöY]»Hõÿã^Hÿ[àöY]»Hõÿàÿ›[Y[ùŒ»Y][ô»õ€›‹¬àHõÿã[X[òYŸ[Y[ùõ›[ô\ûKÇÇà»»»⁄]ÿ\»€€\]YãHYYH⁄\ôYì–ó—–’SQSï––UQ”‘íQTÿ€€ùòX›õ‹àõÿú»[ôÿ›[Y[ùÀÇãHYYHõÿà⁄X⁄€\›ŸX›[€à»H‹[]ô[ÿ›[Y[ù»€‹ö‹‹XŸKÇãH\]Yÿ›[Y[ù»€‹ö‹‹XŸH€‹H»ôYõX›õÿã[›€ôYÿ›[Y[ùXÿŸ\‹»[ôàY]õ›[ô\öY\ÀÇãHôXùZ[HŸ[X›Yõÿàÿ›[Y[ùÿXà\»H]ôHôXY[€õH›\Xò\ŸKXòX⁄ŸYà›\ôòXŸKÇãHHõÿú»ÿ›[Y[ùÿXàõ›»ôXY»^\›[ô»XõXÀôÿ›[Y[ùÿõ›‹»õ‹àBàŸ[X›Yõÿà[ô⁄›‹ŒÇàHö\›X[\ÿYY€Z\‹⁄[ô»ÿ]Y€‹ûH⁄X⁄€\›àH\ÿYYÿ›[Y[ù€›[ùàH›€ô\ãÿXÿŸ\‹ÀŸY]›[[X\öY\¬àH\ÿYYÿ›[Y[ù»XõBÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\ÀŸÿ›[Y[ùÀŸÿ›[Y[ùÿ]Y€‹öY\ÀöúÿãH‹òÀ€[Ÿ[\ÀŸÿ›[Y[ùÀ—ÿ›[Y[ù’€‹ö‹‹XŸKöúﬁãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHH⁄X⁄€\››]\»\»\ö]ôYúõ€Hÿ›[Y[ùÀôÿ›[Y[ù›\XX]⁄[ô»Bà⁄\ôYÿ]Y€‹ûHŸ^\ÀÇãH\»\‹»[ù[ù[€ò[HŸ\»õ›Y\ÿY\ò⁄]ôK›€õÿY⁄Y€ôYTìà›\Xò\ŸH›‹òYŸKìÀ‹àZY‹ò][€à⁄[ôŸ\ÀÇãHH^\›[ô»ÿ›[Y[ùÿì»ùYŸö^[ôXYH›\‹ù»õÿã]ö\⁄XõHÿ›[Y[ùàôXY»ûH]ö\⁄[€à‹à[Y]ö\⁄[€àö\⁄Xö[]KÇÇà»»»ô^›\»
[à‹ô\äBåKàYH\ÿYX›[€à[ú⁄YHHŸ[X›Yõÿàÿ›[Y[ù»XãÇåãà[ú›\ôH\ÿYYõ›‹»\ŸHH⁄\ôYÿ›[Y[ù›\Xÿ]Y€‹ûHŸ^\ÀÇåÀàY‹[ãŸ›€õÿY⁄Y€ôYTìôZ]ö[‹àúõ€HHŸ[X›Yõÿà€‹öŸõ›ÀÇçàY\ò⁄]ôHôZ]ö[‹à\»€Ÿù\ò⁄]ôH€õKÇçKàYù\àÿ›[Y[ù»\»ô\öYöYYõÿŸYY»ù^[›]ÿ⁄[XH^[ú⁄[€à[ô]ôBà⁄X⁄€\›RKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH€€ôö\õH⁄]\àY][ô»ÿ›[Y[ù»YX[ú»Y]Y]Kÿÿ]Y€‹ûKÿ\ò⁄]ôH€õK‹Çà[€»ô\X⁄[ô»H[ô\õZ[ô»ö[HÿöôX›ÇãH€€ôö\õH⁄]\à^H\»⁄›[]\à›\ôòXŸH[àö[ò[ò⁄X[»\»H[öŸYàö[[ô»\ùYòX›‹àô[XZ[à€õHHÿ›[Y[ùÿ]Y€‹ûKÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôKà\»\‹»ô]\ŸYH^\›[ô»õÿã[›€ôYXõXÀôÿ›[Y[ùÿõ›[ô][€Çà[ôYõ›‹ôX]HHô]»ÿ›[Y[ùXõH‹à\Ÿ\ã[›€ôYÿ›[Y[ù[Ÿ[ÇÇãKKBÇà»»[ùûHMÃ»8†%õÿú»ÿ›[Y[ù\ÿYõ›¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^êYù\àô\öYûZ[ô»Hö\›X[⁄X⁄€\›€⁄ŸY€€ŸûX[à\õ›ôYõÿŸYY[ô»⁄]ùHô^ÿ›[Y[ù»€XŸKàH\ôŸ]ÿ\»Ÿ[X›YZõÿàÿ›[Y[ù\ÿY\⁄[ô»Bú⁄\ôYÿ]Y€‹ûHŸ^\»úõ€H[ùûHMÃãÇÇà»»»⁄]ÿ\»€€\]YãHYY[à\ÿYõ‹õH»HŸ[X›Yõÿàÿ›[Y[ùÿXãÇãH\ÿY\»€õHö\⁄XõH⁄[àHöY]Ÿ\à\»ÿ[ìX[òYŸRõÿúÿÇãH\ÿY»ô\]Z\ôNÇàHŸ[X›Yÿ]Y€‹ûBàHŸ[X›Yö[BàHŸ[X›Yõÿà⁄]H]ö\⁄[€ÇãH[úŸ\ùYHXõXÀôÿ›[Y[ùÿõ›»ö\ú›⁄]Hö[ò[›‹òYŸH]ÇãH\ÿYYHö[H»H^\›[ô»ö]ò]Hõ‹ùÿ]KYö[\ÿùX⁄Ÿ]]Çàÿ›[Y[ùÀ⁄õÿãﬁ⁄õÿíYKﬁŸÿ›[Y[ùYKﬁ‹ÿ[ö]^ôYö[Sò[Y_XÇãH›‹ôYY]Y]H€àHÿ›[Y[ùõ›ŒÇàH›€ô\ó›\HH	⁄õÿâÿàH›€ô\ó⁄YHŸ[X›YõÿãöYàH]ö\⁄[€àHŸ[X›Yõÿãô]ö\⁄[€òàHÿ›[Y[ù›\HH⁄\ôYÿ]Y€‹ûHŸ^XàH‹öY⁄[ò[ö[Hò[YKö[H⁄^ôKRSQH\K‹[€ò[\ÿ‹ö\[€ã‹ôX]YûBãHYàÿöôX›\ÿYòZ[»Yù\àõ›»‹ôX][€ãHõ›»\»€ŸùX\ò⁄]ôY⁄][Çà\ÿYYòZ[Y\ò⁄]ôHôX\€€àôYõ‹ôH›\ôòX⁄[ô»H\úõ‹ãÇãH›XÿŸ\‹Ÿù[\ÿYô\Ÿ]»Hõ‹õK⁄›‹»€€ôö\õX][€ã[ôô[ÿY»HõÿÇàÿ›[Y[ù\›ÿ⁄X⁄€\›ÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãH\ÿY\Ÿ\»H^\›[ô»›\Xò\ŸH›‹òYŸH€XﬁHúõ€HHõÿàÿ›[Y[ù¬àõ›[ô][€ãàõ»Ÿ\ùöXŸHõ€KòX⁄Ÿ[ôù[ò›[€ã‹àXõX»ùX⁄Ÿ]ôZ]ö[‹àÿ\¬à[ùõŸXŸYÇãH\»\‹»‹ôX]\»ÿ›[Y[ùõ›‹»ôYõ‹ôHÿöôX›\ÿY€»H›‹òYŸHôXYà€XﬁHÿ[à]\à]]‹ö^ôHÿöôX›ôXY»ûHX]⁄[ô»ÿ›[Y[ùÀú›‹òYŸW‹]ÇãHH\ÿY]\Ÿ\»ÿ[ö]^ôYö[Hò[Y\»ù]ô\Ÿ\ùô\»H‹öY⁄[ò[ö[Hò[YBà[àÿ›[Y[ùÀôö[W€ò[YXÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[àô\öYöY\»\ÿYúõ€HHôX[Ÿ[X›Yõÿà[ô€€ôö\õ\»⁄X⁄€\››]\¬à\]\»ûHÿ]Y€‹ûKÇåãàY‹[ãŸ›€õÿY⁄Y€ôYTìôZ]ö[‹àúõ€HHŸ[X›Yõÿàÿ›[Y[ù»XãÇåÀàY€Ÿù\ò⁄]ôH€€ùõ€»õ‹à\ÿYYõÿàÿ›[Y[ùÀÇçàõÿŸYY»ù^[›]ÿ⁄[XH^[ú⁄[€à[ô]ôH⁄X⁄€\›RKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH]][ùXÿ]Yù[ù[YH\ÿY›[ôYY»ô\öYöXÿ][€àúõ€HûX[â‹»úõ›‹Ÿ\ãÇãHYà\ÿY›XÿŸYY»ù]H\‹Ÿ\»€€õôX›]ö]HôYõ‹ôHôYúô\⁄Hõ›»[ôàö[H⁄›[›[^\›»HX[ùX[ôYúô\⁄⁄›[⁄›»]ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôKà\»\‹»\ŸYH^\›[ô»õÿã[›€ôYÿ›[Y[ù[Ÿ[[ôö]ò]H›‹òYŸBàùX⁄Ÿ]⁄]›]⁄[ô⁄[ô»ìÀ›‹òYŸH€X⁄Y\Àÿ⁄[XK‹à\õZ\‹⁄[€àõY‹ÀÇÇãKKBÇà»»[ùûHMÕ8†%õÿú»ÿ›[Y[ù‹[à[ô›€õÿYÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYHõÿàÿ›[Y[ù\ÿYõ›»€‹öŸY[ô\õ›ôYõÿŸYY[ô»⁄]ùHô^ÿ›[Y[ù»€XŸKÇÇà»»»⁄]ÿ\»€€\]YãHYY›‹òYŸW‹]»HŸ[X›Yõÿàÿ›[Y[ùôXY[Ÿ[ÇãHYY‹[ò[ô›€õÿYõ›»X›[€ú»»\ÿYYÿ›[Y[ù»[àHŸ[X›Yàõÿàÿ›[Y[ùÿXãÇãHXX⁄X›[€à‹ôX]\»H⁄‹ù[]ôY⁄Y€ôYTìúõ€HH^\›[ô»ö]ò]Bàõ‹ùÿ]KYö[\ÿùX⁄Ÿ]€õH⁄[à€X⁄ŸYÇãH‹[ò‹[ú»H⁄Y€ôYTì[àHô]»úõ›‹Ÿ\àXãÇãH›€õÿY‹ôX]\»H⁄Y€ôYTì⁄]›\Xò\ŸI‹»›€õÿY‹[€à\⁄[ô»Bà›‹ôY‹öY⁄[ò[ö[Hò[YKÇãHYY[õ[ôH\úõ‹à[ô[ô»õ‹àòZ[Y⁄Y€ôYTì‹ôX][€ãÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãH⁄Y€ôYTì»^\ôHYù\àÃŸX€€ôÀÇãH\»\‹»Ÿ\»õ›XZŸHHùX⁄Ÿ]XõX»[ôŸ\»õ›Y[ûHŸ\ùöXŸHõ€H‹ÇàòX⁄Ÿ[ô⁄Y€ö[ô»ù[ò›[€ãÇãHXÿŸ\‹»ô[XZ[ú»€€ùõ€YûHH^\›[ô»ÿ›[Y[ùõ›»ö\⁄Xö[]H[ô›‹òYŸBàÿöôX›Ÿ[X›€XﬁKÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[àô\öYöY\»‹[à[ô›€õÿY€àHôX[\ÿYYõÿàÿ›[Y[ùÇåãàY€Ÿù\ò⁄]ôH€€ùõ€»õ‹à\ÿYYõÿàÿ›[Y[ùÀÇåÀàõÿŸYY»ù^[›]ÿ⁄[XH^[ú⁄[€à[ô]ôH⁄X⁄€\›RKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHúõ›‹Ÿ\à‹\ôZ]ö[‹à⁄›[ôH⁄X⁄ŸYõ‹à‹[ãàH[\[Y[ù][€à‹[ú»Bàõ[ö»Xà[[YYX][H€à€X⁄»[ôôY\ôX›»]Yù\àH⁄Y€ôYTìô]\õú¬à»ôYXŸH‹\Xõÿ⁄Ÿ\àúöX›[€ãÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôKà\»\‹»\ŸY^\›[ô»›\Xò\ŸH›‹òYŸH⁄Y€ôYTì»[ôYõ›⁄[ôŸBàÿ⁄[XKìÀ›‹òYŸH€X⁄Y\À‹à\õZ\‹⁄[€àõY‹ÀÇÇãKKBÇà»»[ùûHMÕH8†%õÿú»ÿ›[Y[ù€Ÿù\ò⁄]ôBÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYõÿàÿ›[Y[ù‹[à[ô›€õÿY€‹öŸY[ô\õ›ôYõÿŸYY[ô¬ù⁄]Hô^ÿ›[Y[ù»€XŸKÇÇà»»»⁄]ÿ\»€€\]YãHYY[à\ò⁄]ôXõ›»X›[€àõ‹à\ÿYYÿ›[Y[ù»[àHŸ[X›YõÿÇàÿ›[Y[ùÿXãÇãH\ò⁄]ôHX›[€à\»ö\⁄XõH€õH⁄[àHöY]Ÿ\à\»ÿ[ìX[òYŸRõÿúÿÇãH\ò⁄]ôHõ€\»õ‹à€€ôö\õX][€àôYõ‹ôH\][ô»Hÿ›[Y[ùõ›ÀÇãH\ò⁄]ôH\]\»€õH^\›[ô»õ›»Y]Y]NÇàH\ò⁄]ôYÿ]àH\ò⁄]ôYÿûXàH\ò⁄]ôW‹ôX\€€òãH\ò⁄]ôHö[\ú»H\]HûNÇàHÿ›[Y[ùÀöYàH›€ô\ó›\HH	⁄õÿâÿàH›€ô\ó⁄YHŸ[X›YõÿãöYãH›XÿŸ\‹Ÿù[\ò⁄]ôHô[ÿY»Hõÿàÿ›[Y[ù\›ÿ⁄X⁄€\›ÿ]\⁄[ô»Bà\ò⁄]ôYõ›»»\ÿ\X\à[ô\à^\›[ô»ìÀ‹ôXYö[\úÀÇãHYYH€X[ôY[›][ôHŸX€€ô\ûHù]€àò\öX[ùõ‹àH\ò⁄]ôHX›[€ãÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãH\»\»H€Ÿù\ò⁄]ôH€õKàH›\Xò\ŸH›‹òYŸHÿöôX›\»[ù[ù[€ò[Hõ›à[]YÇãHXÿŸ\‹»ô[XZ[ú»€€ùõ€YûH^\›[ô»õÿàÿ›[Y[ùì»[ôHõÿàX[òYŸ[Y[ùà\õZ\‹⁄[€àõ›[ô\ûKÇãHH[\[Y[ù][€à\Ÿ\»›\Xò\ŸHî»\ôŸ]Y\]Hö[\úÀX]⁄[ô»›\úô[ùà›\Xò\ŸH\]H›ZY[òŸKÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[àô\öYöY\»\ò⁄]ôH€àHôX[\ÿYYõÿàÿ›[Y[ùÇåãàYà\ò⁄]ôH\»€€Ÿõÿú»ÿ›[Y[ù»\»\ÿY€‹[ãŸ›€õÿYÿ\ò⁄]ôH€›ô\ôYàõ‹àH›\úô[ùå»€XŸKÇåÀàõÿŸYY»ù^[›]ÿ⁄[XH^[ú⁄[€à[ô]ôH⁄X⁄€\›RKÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH\ôH\»õ»ô\›‹ôHRHY]à\ò⁄]ôYõ›‹»ô[XZ[àôX€›ô\òXõHúõ€HBà]Xò\ŸKù]õ›úõ€HHå»\ÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôKà\»\‹»⁄[ôŸYõ»ÿ⁄[XKìÀ›‹òYŸH€X⁄Y\À›‹òYŸHÿöôX›À‹Çà\õZ\‹⁄[€àõY‹ÀÇÇãKKBÇà»»[ùûHMÕà8†%õÿú»ù^[›]⁄X⁄€\›Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[à€€ôö\õYYHõÿàÿ›[Y[ù‹[ã—›€õÿYõ›»€‹öŸYà\ò⁄]ôHòZ[YYBù»]ôHÿ›[Y[ùÿì»ôZ]ö[‹ãàûX[à⁄‹ŸH»Yô\àì»[ŸYöXÿ][€ú»[ù[ùH[ô€»\ò⁄]ôHÿ\»⁄[ôŸY»H\ÿXõY[ô[ô»X›[€à[ô€‹ö»[›ôY¬ùHô^õÿú»€XŸNàù^[›]ÇÇà»»»⁄]ÿ\»€€\]YãHYô\úôYõÿàÿ›[Y[ù\ò⁄]ôH[àHRH⁄]›]\Z[ô»ì»⁄[ôŸ\ÀÇãHYY^X⁄]\ò⁄]ôYÿ]T»ïSö[\ö[ô»»õÿàÿ›[Y[ùôXYÀÇãH^[ôYXõXÀöõÿóÿù^[›]€[ô\ÿ⁄]›ùX›\ôY⁄X⁄€\›öY[ŒÇàHùYŸ]ÿ[[›[ùàH[ö]X[›ò[YXàHX›X[›ò[YXàH[ö]X[€XY›[YWŸ^\ÿàHX›X[€XY›[YWŸ^\ÿãHYYõ€õôYÿ]]ôH€€ú›òZ[ù»õ‹àHô]»ù[Y\öXÀ€XY][YHöY[ÀÇãHYYH\ùX[[ô^€àõÿóÿù^[›]€[ô\ õÿó⁄Y
Xõ‹àX›]ôHõ›‹ÀÇãHôXùZ[HŸ[X›Yõÿàù^[›]Xà\»H]ôH›\Xò\ŸKXòX⁄ŸY›\ôòXŸKÇãHù^[›]Xàõ›»⁄›‹ŒÇàHôXŸZ]ôY⁄X⁄€\›€›[ùàHùYŸ]›[àH[ö]X[ò[YH›[àHX›X[ò[YH›[àH][ù[€à€›[ùõ‹à‹[ã€›ô\ãXùYŸ]€›ô\ã[XY][\¬àHù^[›]][HXõBàH›]\»⁄X⁄€\›ù]€ú¬àHY][Hõ‹õH⁄]ùYŸ]›ò[YK€XY][YHöY[¬ãH‹ö]H€€ùõ€»õ›»\ŸHŸ[X›YZõÿà]ö\⁄[€àX]⁄[ô»€»HRHô]\àX]⁄\¬à^\›[ô»ì»õ›[ô\öY\ÀÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåÕLåŸ^[ô⁄õÿóÿù^[›]ÿ⁄X⁄€\›ŸöY[Àú‹[ãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåŒåW⁄[ô^⁄õÿóÿù^[›]€[ô\◊⁄õÿó⁄Yú‹[Çà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ì»€X⁄Y\»Ÿ\ôH⁄[ôŸY[à\»€XŸKÇãHõŸX›[€àÿ\»\YYõ›Y⁄H›\Xò\ŸH€€õôX›‹àõ‹àH€»ù^[›]àZY‹ò][€úÀÇãH›\Xò\ŸHYö\€‹ú»Ÿ\ôHù[ãà^Hô\‹ùYôKY^\›[ô»ŸX›\ö]K‹\ôõ‹õX[òŸBàö[ô[ô‹»X‹õ‹‹»€\àXõ\ÀŸù[ò›[€úÀ›öY]‹Œ»H\ôX›Hô[]ò[ùù^[›]àõÿó⁄Y[ô^ö[ô[ô»ÿ\»Yô\‹ŸY[à\»€XŸKÇãHõÿàÿ›[Y[ù\ò⁄]ôHô[XZ[ú»[ô[ô»õ‹àHö[ò[ì»\‹ÀÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[àô\öYöY\»ù^[›]XàÿY»õ‹àHŸ[X›YõÿãÇåãàûX[àY»Hù^[›]][H[ôô\öYöY\»HXõKÿ⁄X⁄€\›\]\ÀÇåÀàûX[à⁄[ôŸ\»Hù^[›]›]\»»‹ô\ôY‹àôXŸZ]ôYÇçàYàù^[›]\»€€ŸõÿŸYY»Hô^õÿú»€XŸNàö[ò[ò⁄X[»‹àÿ⁄Y[Kà\⁄[ô»H›[ô[€ôHS\»ôYô\ô[òŸKÇçKàö[ò[ì»\‹»⁄›[[ò€YHõÿàÿ›[Y[ù\ò⁄]ôHôZ]ö[‹à[ô[ûH›\ÇàYô\úôY€XﬁH€X[ù\ÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHù^[›]›\úô[ùH›\‹ù»Y[ô›]\»\]\ÀàY][ô»ùYŸ]›ò[YK€XYàöY[»Yù\à‹ôX][€àÿ[àôHYY\»Hõ€›À]\YàôYYYÇãH\⁄õÿ\ô][ù[€à⁄\ö[ô»\»õ›YYY]»HXàÿ[›[]\»][ù[€Çàÿÿ[Hõ‹àõ›ÀÇÇà»»»\ò⁄]X›\ôHöYùÿ\õö[ô‹¬ãHõ€ôKàù^[›]ô[XZ[ú»[õö[ôÀÿ⁄X⁄€\›€õH[ôŸ\»õ›‹ôX]H\ò⁄\ŸBà‹ô\úÀXÿ€›[ù[ô»‹›À‹à[ùô[ù‹ûH[›ô[Y[ùÀÇÇãKKBÇà»»[ùûHMÕ»8†%ù^[›]Y][ô]Y]õ€›ÀU\Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\NääàX⁄\⁄[€ÇÇà»»»€€ù^îûX[àô\öYöYYHõÿú»ù^[›]⁄X⁄€\›€XŸH€‹ö‹ÀÇÇà»»»X⁄\⁄[€ú»XYH\»Ÿ\‹⁄[€à
ÿ⁄ŸY
BãHù^[›]][\»⁄›[ôHY]XõHYù\à‹ôX][€ãÇãHY][ô»ù^[›]][\»\»õ›\ùŸàH›\úô[ù€XŸH[ô⁄›[ôHYYà]\ãÇãHù^[›]][HY]»]\›‹ö]H»H]Y]Ÿ»⁄[à[\[Y[ùYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHH›\úô[ùù^[›]Xà›\‹ù»Y[ô›]\»⁄[ôŸ\»€õKÇãHù]\ôHY]ôZ]ö[‹à⁄›[€›ô\àù^[›]][HöY[»›X⁄\»][Bà\ÿ‹ö\[€ãô[ô‹ã‹€›\òŸKùYŸ][ö]X[ò[YKX›X[ò[YK[ö]X[XYà[YKX›X[XY[YK]X[ù]K[ôõ›\ÀÇãHH]Y][Ÿ»ô\]Z\ô[Y[ù\Y\»»Y]Àõ›€õH›]\»⁄[ôŸ\ÀÇÇà»»»ô^›\»
[à‹ô\äBåKà€€ù[ùYH⁄]Hô^õÿú»€XŸKÇåãà\ö[ô»Hö[ò[õÿú»\ô[ö[ô»\‹ÀYù^[›]Y]€€ùõ€»[ô]Y][Ÿ¬à‹ö]\ÀÇåÀàô\öYûH]Y][ùöY\»[ò€YHôYõ‹ôKÿYù\àò[Y\ÀX›[ô»\Ÿ\ã[Y\›[\àõÿàY[ôù^[›][ôHYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH€€ôö\õH⁄X⁄XõKŸù[ò›[€à⁄›[Ÿ\ùôH\»Hÿ[õ€öXÿ[]Y]Ÿ»õ‹Çàù^[›]Y]»\ö[ô»Hö[ò[⁄\ö[ô»\‹ÀÇÇãKKBÇà»»[ùûHMŒ8†%õÿú»ö[ò[ò⁄X[»õ‹ôXÿ\›õ›[ô][€ÇÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYHù^[›]€XŸH[ô\⁄ŸY»õÿŸYYàHô^õÿú»€X[ù\ú€XŸHÿ\»ö[ò[ò⁄X[ÀôXùZ[úõ€HH›[ô[€ôHSôYô\ô[òŸH⁄[HŸY\[ô¬ùH^\›[ô»›\Xò\ŸHõ⁄ôX›ô\À[ô\õZ\‹⁄[€àÿ]\ÀÇÇà»»»⁄]ÿ\»€€\]YãH^[ôYH^\›[ô»XõXÀöõÿóÿùYŸ]€[ô\ÿ[Ÿ[⁄]õ‹ôXÿ\›öY[ŒÇàHùYŸ]ÿ⁄[ôŸWÿ[[›[ùàHX›X[ÿ€‹›ÿ[[›[ùàH€€[Z]Yÿ€‹›ÿ[[›[ùàHõ‹ôXÿ\››◊ÿ€€\]Wÿ[[›[ùãHYYõ€õôYÿ]]ôH€€ú›òZ[ù»õ‹àHô]»ù[Y\öX»öY[ÀÇãHYYH\ùX[X›]ôK\õ›»[ô^€àõÿóÿùYŸ]€[ô\ õÿó⁄Y
XÇãHôXùZ[HŸ[X›Yõÿàö[ò[ò⁄X[ÿXà\»H]ôH›\Xò\ŸKXòX⁄ŸY›\ôòXŸKÇãHö[ò[ò⁄X[»õ›»⁄›‹»›[[X\ûH›[»õ‹éÇàH‹öY⁄[ò[ùYŸ]àHô]ö\ŸYùYŸ]àHX›X[€‹›àH€€[Z]Y€‹›àHõ‹ôXÿ\›ö[ò[àHô[XZ[ö[ô»ùYŸ]ãHö[ò[ò⁄X[»XõHõ›»⁄›‹»ùYŸ]⁄[ôŸKô]ö\ŸYX›X[€€[Z]Yàõ‹ôXÿ\›]ÀX€€\]Kõ‹ôXÿ\›Yö[ò[ô[XZ[ö[ôÀÿ]Y€‹ûK€‹›€ŸK[ôàõ›\ÀÇãH]]‹ö^ôY\Ÿ\ú»⁄]Ÿ[X›YZõÿàùYŸ]\õ›ò[\õZ\‹⁄[€àÿ[àYàö[ò[ò⁄X[[ô\ÀÇãHöY]À[€õH\Ÿ\ú»⁄]ö[ò[ò⁄X[ö\⁄Xö[]Hÿ[àôXYö[ò[ò⁄X[»⁄]›]‹ö]Bà€€ùõ€ÀÇãHõÿú»⁄[€‹Hÿ\»\]Y€»ö[ò[ò⁄X[»õ»€ôŸ\àô\Ÿ[ù»\»HYô\úôYàXŸZ€\ãÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåLÕWŸ^[ô⁄õÿóÿùYŸ]Ÿõ‹ôXÿ\›ŸöY[Àú‹[Çà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ì»€X⁄Y\»Ÿ\ôH⁄[ôŸY[à\»€XŸK\àûX[â‹»ôYô\ô[òŸH»Yô\Çàì»⁄[ôŸ\»[ù[H[ôÇãHõŸX›[€àÿ\»\YYõ›Y⁄H›\Xò\ŸH€€õôX›‹àôYõ‹ôH\»[ôŸôÇà[ùûHÿ\»‹ö][ãÇãHö[ò[ò⁄X[»ô[XZ[ú»[õö[ôÀŸõ‹ôXÿ\›[ô»€õKà]Ÿ\»õ›‹ôX]H\ò⁄\ŸBà‹ô\úÀ[ùõ⁄XŸ\ÀXÿ€›[ù[ô»^‹ùÀ‹àXÿ€›[ù[ô»ﬁ[òÀÇãHHõ‹õ][H‹ùYúõ€HHSôYô\ô[òŸH\ŒÇàHô]ö\ŸYùYŸ]H‹öY⁄[ò[ùYŸ]
»⁄[ôŸ\¬àHõ‹ôXÿ\›ö[ò[HX›X[€‹›
»€€[Z]Y€‹›
»õ‹ôXÿ\›»€€\]BàHô[XZ[ö[ô»Hô]ö\ŸYùYŸ]Hõ‹ôXÿ\›ö[ò[ãH›\Xò\ŸHYö\€‹ú»Ÿ\ôHù[àYù\à»^H›\ôòXŸYúõÿYôKY^\›[ô¬àö[ô[ô‹»]⁄›[ôHô]ö\⁄]Y\ö[ô»Hö[ò[ŸX›\ö]K‘ì»\‹ÀÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[àô\öYöY\»Hö[ò[ò⁄X[»Xà\X\ú»õ‹àH\Ÿ\à⁄]àÿ[ó›öY]◊Ÿö[ò[ò⁄X[ÿÇåãàûX[àY»Hö[ò[ò⁄X[»[ôH[ôô\öYöY\»HXõHôYúô\⁄\ÀÇåÀàûX[à€€ôö\õ\»›[»ÿ[›[]H€‹úôX›HYÿZ[ú›H›[ô[€ôHSàôYô\ô[òŸKÇçàõÿŸYY»Hô^õÿú»€XŸNàÿ⁄Y[KÇçKàö[ò[ìÀ‹ŸX›\ö]H\‹»⁄›[[ò€YHõÿàÿ›[Y[ù\ò⁄]ôKö[ò[ò⁄X[¬à‹ö]Hõ›[ô\öY\À[ô[ûHYö\€‹àö[ô[ô‹»]\ôH›[ô[]ò[ùÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHö[ò[ò⁄X[[ôHY][ôÀÿ\ò⁄]ôH€€ùõ€»\ôHõ›YYY]ÇãH\⁄õÿ\ô][ù[€à⁄\ö[ô»\»õ›YYY]ÇãH^\õò[Xÿ€›[ù[ôÀ^H\À[ùõ⁄XŸ\À[ô\ò⁄\ŸH‹ô\à€‹öŸõ›‹»ô[XZ[Çà›]Ÿàÿ€‹Hõ‹à\»€XŸKÇÇãKKBÇà»»[ùûHMŒH8†%ö[ò[ò⁄X[»Y]]Y][ô€‹›ô\‹ù[\‹ùô\]Z\ô[Y[ù¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\NääàX⁄\⁄[€ÇÇà»»»€€ù^îûX[àô\öYöYYHö[ò[ò⁄X[»[ôõ‹õX][€à\»]ôKàôYõ‹ôH[›ö[ô»»Hô^ú€XŸKûX[àYö[ôYHô\]Z\ô[Y[ù»õ‹àHù]\ôHö[ò[ò⁄X[»Y]ÿ\ò⁄]ôBò€€ùõ€À]Y]ôZ]ö[‹ã€‹›ô\‹ù[\‹ù[ô\õZ\‹⁄[€à[Ÿ[ÇÇà»»»X⁄\⁄[€ú»XYH\»Ÿ\‹⁄[€à
ÿ⁄ŸY
BãHö[ò[ò⁄X[[ôHY]€€ùõ€»]\›[›»[ö[ò[ò⁄X[»öY[»»ôHY]YÇãH[ö[ò[ò⁄X[»⁄[ôŸ\»]\›ôH\õZ\‹⁄[€àò\ŸYÇãH[ö[ò[ò⁄X[»Y]»[ô\ò⁄]ô\»]\›‹ö]H»H]Y]Ÿ»⁄[Çà[\[Y[ùYÇãHHö[ò[ò⁄X[»€€ôYY»[àö[\‹ù€‹›ô\‹ùàù[ò›[€à]à]]€X]Xÿ[H\]\»HX›X[€€[[ãÇãHõ‹ôXÿ\›[ôÀX›X[€‹›À[ô⁄[ôŸH‹ô\ú»\ôHõ‹õX[€‹öŸõ›»Y]»[ôà»õ›ôYYH›öX›\àù\›YöXÿ][€àõ›ÀÇãHY][ô»‹öY⁄[ò[ùYŸ]€‹›€ŸK\ÿ‹ö\[€ã‹àÿ]Y€‹ûH\»[‹ôBàŸ[ú⁄]]ôH[ô]\›ô\]Z\ôHH\ÿ‹ö\[€àŸà⁄HH⁄[ôŸHÿ\»XYKÇãH€õH]ô[‹\ú»[ô\Ÿ\ú»\‹⁄Y€ôY»Hõ⁄ôX›⁄›[ôHXõH»Y]àö[ò[ò⁄X[»ûHYò][ÇãH]ô[‹\ú»]\›ôHXõH»\‹⁄Y€àY][€ò[[ô]öYX[»õ›Y⁄Bà]ô[‹\à€€ú€€H⁄[àHõÿàôYY»^òHö[ò[ò⁄X[»\‹⁄\›[òŸKÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHH›\úô[ùö[ò[ò⁄X[»Xà›\‹ù»Y[ôôXY€õKàY]ÿ\ò⁄]ôK⁄[\‹ùà\ôHõ›[\[Y[ùYY]ÇãHH]Y]Ÿ»õ‹àö[ò[ò⁄X[»⁄[ôŸ\»⁄›[[ò€YHôYõ‹ôKÿYù\àò[Y\ÀàX›[ô»\Ÿ\ã[Y\›[\õÿàYùYŸ][ôHY⁄[ôŸYöY[À[ôBàô\]Z\ôYôX\€€à⁄[àŸ[ú⁄]]ôHöY[»⁄[ôŸKÇãH€‹›ô\‹ù[\‹ù⁄›[\]HX›X[ÿ€‹›ÿ[[›[ùò]\à[àô\X⁄[ô¬àõ‹ôXÿ\›€€[Z]Y⁄[ôŸK[‹ô\ã‹à‹öY⁄[ò[XùYŸ]ò[Y\ÀÇãH]ô[‹\ãY‹ò[ùY^òHö[ò[ò⁄X[»\‹⁄\›[òŸH⁄›[ôHY]]ôH[ôÿ€‹Yàõ›HúõÿY€ÿò[û\\‹ÀÇãHö[ò[[\[Y[ù][€à⁄›[€€ôö\õHHÿ[õ€öXÿ[õ⁄ôX›X\‹⁄Y€õY[ù€›\òŸBà[ôHÿ[õ€öXÿ[]Y][Ÿ»XõKŸù[ò›[€àôYõ‹ôH‹ö][ô»€X⁄Y\»‹àRKÇÇà»»»ô^›\»
[à‹ô\äBåKà€€ù[ùYH»Hô^õÿú»€XŸH[õ\‹»ûX[à\⁄‹»»[\[Y[ùö[ò[ò⁄X[¬àY]ÿ\ò⁄]ôK⁄[\‹ù[[YYX][KÇåãà\ö[ô»Hö[ò[ò⁄X[»\ô[ö[ô»\‹À\⁄Y€àH\õZ\‹⁄[€à[Ÿ[õ‹éÇà]ô[‹\úÀõ⁄ôX›X\‹⁄Y€ôY\Ÿ\úÀ[ô]ô[‹\à€€ú€€H\‹⁄Y€ôY[\úÀÇåÀàYY]ÿ\ò⁄]ôH€€ùõ€»⁄]]Y][Ÿ»‹ö]\ÀÇçàYH€‹›ô\‹ù[\‹ù€‹öŸõ›»[ôX\[\‹ùY€‹›ò[Y\»[ù¬àX›X[ÿ€‹›ÿ[[›[ùÇçKàô\öYûHõ‹õX[€‹öŸõ›»Y]»»õ›ô\]Z\ôH^òHù\›YöXÿ][€ã⁄[BàŸ[ú⁄]]ôHöY[Y]»ÀÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH€€ôö\õHH€›\òŸH[ôö[H⁄\HŸàH€‹›ô\‹ùôYõ‹ôHùZ[[ô»Bà[\‹ù\ãÇãH€€ôö\õH⁄]\à]ô[‹\à€€ú€€H[\à\‹⁄Y€õY[ù⁄›[ôH\àõÿã\Çà]ö\⁄[€ã‹à[YK[[Z]YÇãH€€ôö\õH⁄X⁄]Y][Ÿ»XõKŸù[ò›[€à\»ÿ[õ€öXÿ[õ‹àö[ò[ò⁄X[»⁄[ôŸ\ÀÇÇãKKBÇà»»[ùûHN8†%õÿú»ÿ⁄Y[Hå»‹ùÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àÿZY»õÿŸYYYù\àö[ò[ò⁄X[»ÿ\»]ôH[ôHö[ò[ò⁄X[»Y]⁄[\‹ùúô\]Z\ô[Y[ù»Ÿ\ôHÿ\\ôYàHô^õÿú»€X[ù\€XŸHÿ\»ÿ⁄Y[KàHåÇúÿ⁄[XH[ô\ò⁄]X›\ôH[ôXYH€€ùZ[ôYHÿ⁄ŸYõÿó‹ÿ⁄Y[W⁄][\ÿôõ›[ô][€à[ô\ò⁄]ôHì»ö^\À€»\»å»\‹»ô]\ŸY]XõHò]\à[Çò‹ôX][ô»ô]»ÿ⁄[XKÇÇà»»»⁄]ÿ\»€€\]YãHX›]ò]YHŸ[X›Yõÿàÿ⁄Y[XXà[àåÀÇãHYY]ôH›\Xò\ŸHôXY»úõ€HXõXÀöõÿó‹ÿ⁄Y[W⁄][\ÿÇãHX›]ôHÿ⁄Y[HôXY»^X⁄]Hö[\à\ò⁄]ôYÿ]T»ïSÇãHYYÿ⁄Y[H›[[X\ûHÿ\ôŒÇàHX›]ôH][\¬àH€€\]H€›[ùàH[^YY€›[ùàH›ô\ôYH€›[ùàHô^]Y‹[à][BãHYYÿ⁄Y[HXõH€€[[ú»õ‹éÇàH€‹ù‹ô\ÇàHZ[\›€ôK›\⁄»]BàH›]\¬àH\ôŸ]]BàH[Z[ô¬àH\ÿ‹ö\[€ÇàHõ›\¬ãHYYÿ⁄Y[HYŸY]õ‹õHõ‹éÇàH]BàH\ÿ‹ö\[€ÇàH\ôŸ]]BàH›]\¬àH€‹ù‹ô\ÇàHõ›BãHYY€ŸùX\ò⁄]ôH€€ùõ€⁄]ô\]Z\ôY\ò⁄]ôHôX\€€àõ€\ÇãHYY\Ÿ›€à‹ô\ö[ô»€€ùõ€»]ô[ù[Xô\àö\⁄XõH][\»[àL\⁄[ùà[ò‹ô[Y[ù»Yù\àXX⁄[›ôKÇãH\]Yõÿú»›ô\ùöY]Àÿõ›[ô\ûH€‹H€»ÿ⁄Y[Hõ»€ôŸ\àô\Ÿ[ù»\¬àYô\úôYÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ì»€X⁄Y\»Ÿ\ôH⁄[ôŸY[à\»€XŸKÇãHõ»õŸX›[€àÿ\»\YY[à\»€XŸKÇãHõŸX›[€àXõH[ú‹X›[€à€€ôö\õYYXõXÀöõÿó‹ÿ⁄Y[W⁄][\ÿ[ôXYBà^\›»⁄]ì»[òXõYÇãHÿ⁄Y[Hô[XZ[ú»Hÿ⁄ŸYõ]Z[\›€ôK›\⁄»\›€õKÇãH\»€XŸHŸ\»õ›Yÿ[[ô\àﬁ[òÀ\[ô[òﬁHX[òYŸ[Y[ù\‹⁄Y€õY[ùÀàô[Z[ô\úÀõ›YöXÿ][€úÀôX›\úö[ô»]ô[ùÀ‹à[ûHúõÿY\àÿ⁄Y[[ô»[ô⁄[ôKÇãH\ò⁄]ôH\Ÿ\»H^\›[ô»€ŸùX\ò⁄]ôH€€[[úŒÇà\ò⁄]ôYÿ]\ò⁄]ôYÿûX[ô\ò⁄]ôW‹ôX\€€òÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[àô\öYöY\»Hÿ⁄Y[HXàÿY»õ‹àHŸ[X›YõÿãÇåãàûX[àY»Hÿ⁄Y[H][H[ô€€ôö\õ\»]\X\ú»[àHXõKÇåÀàûX[àY]»Hÿ⁄Y[H][KÇçàûX[à\›»\Ÿ›€à‹ô\ö[ôÀÇçKàûX[à\ò⁄]ô\»H\›ÿ⁄Y[H][H⁄]HôX\€€ãÇçãàõÿŸYY»Hô^õÿú»€XŸHYù\àÿ⁄Y[H\»ô\öYöYYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH\ò⁄]ôH\»õ€\Y⁄]⁄[ô›Àúõ€\õ‹àõ›ÀàH€\⁄Y[Ÿ[ÿ[àô\XŸBà]\ö[ô»ö[ò[\ô[ö[ô»Yà\⁄\ôYÇãHÿ⁄Y[HY]ÿ\ò⁄]ôHX›[€ú»›\úô[ùHô[H€àH^\›[ô»XõH€X⁄Y\Œ¬àõ»ô]»]Y][Ÿ»ôZ]ö[‹àÿ\»[ùõŸXŸY[à\»€XŸKÇãHÿ[[ô\àﬁ[òÀ\[ô[òﬁHŸ⁄XÀ[ô\‹⁄Y€õY[ù»ô[XZ[àô\Ÿ\ùôYÇÇãKKBÇà»»[ùûHNH8†%õÿú»ÿ⁄Y[H]\»ÿ[ù[ôö[ùÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYÿ⁄Y[H[ú]€‹ö‹»õ‹\õH[ôô\]Y\›YY][€ò[ÿ⁄Y[BôöY[»\»Hÿ[ù‹ò\[ôö[ù‹[€ú»õ‹àH\›‹ò\‹àõ›ÇÇà»»»⁄]ÿ\»€€\]YãH^[ôYXõXÀöõÿó‹ÿ⁄Y[W⁄][\ÿ⁄]ÇàH[ö]X[‹›\ùŸ]XàHX›X[‹›\ùŸ]XàH[ö]X[ÿ€€\][€óŸ]XàHX›X[ÿ€€\][€óŸ]XàH\ò][€óŸ^\ÿàH\[ô[ò⁄Y\ÿãHYYõ€õôYÿ]]ôH\ò][€à€€ú›òZ[ùÇãHYY[ö]X[[ôX›X[]K[‹ô\à€€ú›òZ[ùÀÇãH\]YHÿ⁄Y[HXõH»⁄›»[ö]X[ÿX›X[›\ùÀ[ö]X[ÿX›X[à€€\][€úÀ\ò][€ã\[ô[ò⁄Y\À[Z[ôÀ\ÿ‹ö\[€ã[ôõ›\ÀÇãH\]YHÿ⁄Y[HYŸY]õ‹õH»€€X›Hô]»]K\ò][€ã[ôà\[ô[òﬁHöY[ÀÇãHYYHÿ⁄Y[Hÿ[ù‹ò\ÇàH[õôY⁄[ö]X[ò\ú»\ŸH[ö]X[]\¬àHX›X[ò\ú»\ŸHX›X[]\¬àH\ò][€à\»\ŸY»[ôô\à[à[ô]H⁄[à€õHH›\ù\»ô\Ÿ[ùãHYYö[ù€€ùõ€»õ‹éÇàH\›€õBàH‹ò\€õBàH\›[ô‹ò\ãH\]Yÿ⁄Y[H›[[X\ûH[Z[ô»»\ŸH€€\][€ã‹›\ùöY[»[ú›XYŸà€õBàHYÿXﬁH\ôŸ]Ÿ]XÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåMåÃ◊Ÿ^[ô⁄õÿó‹ÿ⁄Y[WŸ]\Àú‹[Çà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåMåÃ◊Ÿ^[ô⁄õÿó‹ÿ⁄Y[WŸ]\Àú‹[ãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõŸX›[€àÿ\»\YYõ›Y⁄H›\Xò\ŸH€€õôX›‹ãÇãHõŸX›[€àô\öYöXÿ][€à€€ôö\õYY[⁄^ô]»€€[[ú»^\›ÇãHõ»ì»€X⁄Y\»Ÿ\ôH⁄[ôŸY[à\»€XŸKÇãH\ôŸ]Ÿ]X\»Ÿ\õ‹àYÿXﬁH€€\]Xö[]H[ô\»‹[]Yúõ€H[ö]X[à€€\][€à⁄[àõ»^X⁄]\ôŸ]]H\»›\YYÇãH\[ô[ò⁄Y\ÿ\»›\úô[ùH›‹ôY\»úôYH^»ôYXŸ\‹€‹àõ›\Ààõ¬à]]€X]X»\[ô[òﬁH[ô⁄[ôKÿ[[ô\àﬁ[òÀ\‹⁄Y€õY[ùŸ⁄XÀ‹àô[Z[ô\Çàﬁ\›[Hÿ\»[ùõŸXŸYÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[àô\öYöY\»ô]»ÿ⁄Y[HöY[»ÿ]ôH[ôô[ÿYÇåãàûX[àô\öYöY\»Hÿ[ù‹ò\\‹^\»[õôY[ôX›X[ò\úÀÇåÀàûX[àö[ù»\›€õK‹ò\€õK[ôõ›ÇçàX⁄YH]\à⁄]\à\[ô[ò⁄Y\»⁄›[ô[XZ[àúôYH^‹àôX€€YHBà›ùX›\ôYôYXŸ\‹€‹àô[][€ú⁄\ÇçKàôX€€ò⁄[HTê“UP’TëHŸX›[€à»⁄]\»\Ÿ\ãX\õ›ôYå»ÿ⁄Y[Bà^[ú⁄[€ãÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãH^\›[ô»Tê“UP’TëHŸX›[€à»\ÿ‹öXôYÿ⁄Y[HåH\»õ»\[ô[ò⁄Y\ÀÇà\»[ùûHôX€‹ô»ûX[â‹»å»^[ú⁄[€àô\]Y\›»H\ò⁄]X›\ôHÿ›[Y[ùà⁄›[ôH\]Y[àHõ€›À]\ÿ›[Y[ù][€à\‹ÀÇãHHÿ[ù‹ò\\»\‹^K‹ö[ù€õN»]Ÿ\»õ›ÿ[›[]H\[ô[òﬁKXò\ŸYà‹ö]Xÿ[]ÀÇÇãKKBÇà»»[ùûHNà8†%õÿú»ò[úÿX›[€ú»ôXYS€õHŸ¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^êYù\àHÿ⁄Y[H^[ú⁄[€àÿ\»\ﬁYYûX[àÿZY»õÿŸYY⁄]Hô^ú›\àHô[XZ[ö[ô»õÿú»XàôYY[ô»€X[ù\ÿ\»ò[úÿX›[€úÀàHåÇò\ò⁄]X›\ôH[ôXYHÿ⁄ŸYò[úÿX›[€ú»\»HôXY[€õHŸ»ŸàX]\öX[€ŸYù»Hõÿàõ›Y⁄[ùô[ù‹ûH⁄X⁄€›]€›\òŸYúõ€HXõXÀöõÿó›ò[úÿX›[€ó€ŸÿÇÇà»»»⁄]ÿ\»€€\]YãHX›]ò]YHŸ[X›Yõÿàò[úÿX›[€úÿXà[àåÀÇãHô]\ŸYH^\›[ô»XõXÀöõÿó›ò[úÿX›[€ó€ŸÿöY]ÀÇãHô\öYöYYõŸX›[€à€€[[ú»õ‹àXõXÀöõÿó›ò[úÿX›[€ó€ŸÿôYõ‹ôH⁄\ö[ô¬àHRKÇãHYY]ôH›\Xò\ŸHôXY»ö[\ôYûHŸ[X›Yõÿó⁄YÇãHYYôXY[€õHò[úÿX›[€à›[[X\ûHÿ\ôŒÇàHõ›»€›[ùàH›[[ôH]X[ù]BàH\›[ò›][H€›[ùàH]\›ò[úÿX›[€ÇãHYYò[úÿX›[€àXõH€€[[úŒÇàH]BàH][BàHX]\öX[€ŸBàH]X[ù]BàH€›\òŸHÿÿ][€ÇàHò[úÿX›[€à\BàH\ôõ‹õYYûBàHõ›\¬ãH\]Yõÿú»›ô\ùöY]Àÿõ›[ô\ûH€‹H€»€õHò[úÿX›[€àY]À‹ô]\õú»ô[XZ[ÇàYô\úôYõ›HôXY[€õHò[úÿX›[€ú»Xà]Ÿ[ãÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ì»€X⁄Y\»Ÿ\ôH⁄[ôŸY[à\»€XŸKÇãHõ»õŸX›[€àÿ\»\YY[à\»€XŸKÇãHõ»ô]»îÀXõK\õZ\‹⁄[€àõYÀô]\õà€‹öŸõ›ÀY]€‹öŸõ›À^‹ùàXÿ€›[ù[ô»ôZ]ö[‹ã‹à€‹››ò[YH\‹^Hÿ\»YYÇãHò[úÿX›[€ú»ô[XZ[ú»ôXY[€õH[ô€›\òŸKZ€ô\›à[ùô[ù‹ûH⁄X⁄€›]ô[XZ[ú¬àH€›\òŸHŸàX]\öX[[›ô[Y[ùÇãH€‹››ò[YH\‹^Hô[XZ[ú»ô\Ÿ\ùôYõ‹àö[ò[ò⁄X[ÀÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[àô\öYöY\»ò[úÿX›[€ú»ÿY»õ‹àHŸ[X›YõÿãÇåãàûX[àô\öYöY\»Hõÿà⁄]X]\öX[⁄X⁄ŸY›]»]⁄›‹»ò[úÿX›[€àõ›‹ÀÇåÀàûX[àô\öYöY\»õÿú»⁄]õ»⁄X⁄ŸY[›]X]\öX[⁄›»H[\HôXY[€õBà›]KÇçà€€ù[ùYHõÿú»€X[ù\»\ô[ö[ô»Yù\àò[úÿX›[€ú»\»ô\öYöYYÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHô]\õã]ÀR[ùô[ù‹ûHô[XZ[ú»ô\Ÿ\ùôY[ô\»õ›ô\ô\Ÿ[ùY\»[àX›[€à[Çà\»XãÇãHö[ò[ìÀ‹ŸX›\ö]H\‹»›[ôYY»»Yô\‹»€\àXõX»Xõ\À›öY]‹Àà[ò€Y[ô»H€õ›€àúõÿYìÀY\ÿXõYYö\€‹ûHö[ô[ô‹ÀÇÇãKKBÇà»»[ùûHN»8†%õÿú»‹ôX]Hõ‹õHX›]ò][€ÇÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^êYù\àûX[àô\öYöYYHò[úÿX›[€ú»XãHô^õÿú»€X[ù\⁄\ô[ö[ô»›\ùÿ\»»ô[[›ôHH\›ÿùö[›\»XŸZ€\à[àHõÿú»⁄[à‹ôX]HõÿòÇïH^\›[ô»XõXÀöõÿúÿXõH[ôì»€XﬁH[ôXYH›\‹ù[úŸ\ù»ÿ]YòûHÿ[óÿ‹ôX]W⁄õÿúÿ[ôH\Ÿ\â‹»›€à]ö\⁄[€ãÇÇà»»»⁄]ÿ\»€€\]YãHô\XŸYHYô\úôY‹ôX]HõÿàXŸZ€\à⁄]H]ôH€€ùõ€Yõ‹õKÇãHYYõ‹õHöY[»õ‹éÇàHõÿàò[YBàHõÿàù[Xô\ÇàHÿ⁄ŸY›\úô[ù]ö\⁄[€ÇàH›]\¬àHõÿà\BàHŸ\ùöXŸHÿ[ù[Xô\ÇàHYô\‹»[ô\¬àH⁄]K‹›]K‹‹›[€ŸBàH\ÿ‹ö\[€ÇàHõ›\¬ãH⁄\ôY‹ôX]H›XõZ]»»H^\›[ô»›\Xò\ŸHõÿúÿXõKÇãHŸ\]ö\⁄[€àÿ⁄ŸY»HŸ\ùô\à\õZ\‹⁄[€à]ö\⁄[€à€»[úŸ\ù»ÿ]\ŸûBàH^\›[ô»õÿú◊⁄[úŸ\ùì»€XﬁKÇãHYY‹ôX]H\úõ‹à[ô[ô»õ‹àZ\‹⁄[ô»õÿàò[YKZ\‹⁄[ô»]ö\⁄[€ã\Xÿ]Bà‹àôZôX›Y[úŸ\ùÀ[ô[ô^X›Y›\Xò\ŸHòZ[\ô\ÀÇãHYù\àH›XÿŸ\‹Ÿù[[úŸ\ùHõÿú»\ôX›‹ûHô[ÿYÀúõ›‹ŸH[ŸHô\›[Y\Àà[ôHô]»õÿà\»Ÿ[X›YÇãH\]Y›[Hõÿú»XàY]Y]H€»ù^[›][ôÿ›[Y[ù»⁄›»\»]ôKÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ì»€X⁄Y\»Ÿ\ôH⁄[ôŸY[à\»€XŸKÇãHõ»õŸX›[€àÿ\»\YY[à\»€XŸKÇãHõ»ô]»\õZ\‹⁄[€àõYÀîÀ]Y]XõK‹àõÿàY]ÿ\ò⁄]ôH€‹öŸõ›»ÿ\¬àYYÇãH‹ôX]Hô[XZ[ú»ÿ]YûHH^\›[ô»ÿ[óÿ‹ôX]W⁄õÿúÿ\õZ\‹⁄[€à[ôàXõXÀöõÿúÿìÀÇãHõÿàY]ÿ\ò⁄]ôHô[XZ[ú»Hù]\ôHõÿú»\ô[ö[ô»›\ÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[àô\öYöY\»H‹ôX]Hõÿàù]€à‹[ú»Hõ‹õKÇåãàûX[à‹ôX]\»H\›õÿà[àHúõ›‹Ÿ\ãÇåÀàûX[àô\öYöY\»Hô]»õÿà\X\ú»[àH\ôX›‹ûH[ô‹[ú»[àHŸ[X›Yàõÿà[ô[Ççà€€ù[ùYHõÿú»\ô[ö[ô»⁄]Y]ÿ\ò⁄]ôH€€ùõ€À]Y][Ÿ»€›ô\òYŸK[ôàHYô\úôYö[ò[ìÀ‹ŸX›\ö]H€X[ù\ÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHYàH\Ÿ\àôYY»‹õ‹‹ÀY]ö\⁄[€àõÿà‹ôX][€à]\ã]⁄›[ôH\⁄Y€ôY\¬à[à^X⁄]]ô[‹\ãÿYZ[à€‹öŸõ›»[ú›XYŸàô[^[ô»H›\úô[ù[úŸ\ùà]ÇãHö[ò[ìÀ‹ŸX›\ö]H\‹»›[ôYY»»Yô\‹»€\àXõX»Xõ\À›öY]‹Àà[ò€Y[ô»H€õ›€àúõÿYìÀY\ÿXõYYö\€‹ûHö[ô[ô‹ÀÇÇãKKBÇà»»[ùûHN8†%õÿú»Y][ô\ò⁄]ôH€€ùõ€¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYY]Hõÿú»‹ôX]Hõ‹õH€‹öŸY[ô\⁄ŸY»õÿŸYYàHô^íõÿú»\ô[ö[ô»›\ÿ\»Ÿ[X›YZõÿàXZ[ù[ò[òŸNàY][ô»Hõ›[ô][€àõÿÇúôX€‹ô[ô\ò⁄]ö[ô»õÿú»⁄]›]^‹⁄[ô»Y[à‹ö]H]»»ôXY[€õBù\Ÿ\úÀÇÇà»»»⁄]ÿ\»€€\]YãHYYŸ[X›YZõÿàY][ô\ò⁄]ôXX›[€úÀÇãHX›[€ú»\ôHö\⁄XõH€õH⁄[àH›\úô[ù\Ÿ\à\»ÿ[ó€X[òYŸW⁄õÿúÿõ‹àBàŸ[X›Yõÿà]ö\⁄[€ãÇãHô]\ŸYH€€ùõ€Yõÿú»õ‹õHõ‹àY][ŸKÇãHõÿàY]»õ›»\]HH^\›[ô»XõXÀöõÿúÿõ›»öY[ŒÇàHõÿàù[Xô\ÇàHò[YBàH›]\¬àHõÿà\BàHŸ\ùöXŸHÿ[ù[Xô\ÇàHYô\‹»[ô\¬àH⁄]K‹›]K‹‹›[€ŸBàH\ÿ‹ö\[€ÇàHõ›\¬ãHõÿà\ò⁄]ôHõ›»ô\]Z\ô\»HôX\€€à[ô\]\ŒÇàH\ò⁄]ôYÿ]àH\ò⁄]ôYÿûXàH\ò⁄]ôW‹ôX\€€òãHõÿà‹ôX]KY][ô\ò⁄]ôHX›[€ú»õ›»‹ö]HXõXÀò⁄[ôŸW€Ÿ‹ÿ[ùöY\¬à\⁄[ô»H^\›[ô»ÿ[õ€öXÿ[]Y]€€[[úŒÇàH\Ÿ\ó⁄YàH\Ÿ\ó€ò[YXàHXõW€ò[YXàHôX€‹ô⁄YàHX›[€òàHôYõ‹ôWŸ]XàHYù\óŸ]XàHõ›XãH]Y]€ò\⁄›»[ò€YHôYõ‹ôKÿYù\àõ›[ô][€àõÿàöY[»[ô\ò⁄]ôBàY]Y]KÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ì»€X⁄Y\»Ÿ\ôH⁄[ôŸY[à\»€XŸKÇãHõ»õŸX›[€àÿ\»\YY[à\»€XŸKÇãH]ôHXõXÀò⁄[ôŸW€Ÿ‹ÿÿ\»ô\öYöYY»[ò€YHH^X›Y€€[[ú»[ô¬àXÿŸ\‹ôX]X\]X[ô\ò⁄]ôXÇãHH]Y]‹ö]\»\ôH›\úô[ùH€Y[ù\⁄YH[úŸ\ù»[ù»H^\›[ô¬à⁄[ôŸW€Ÿ‹ÿXõKà\»X]⁄\»H›\úô[ù]òZ[XõH\]ù]\»õ›à]€ZX»⁄]Hõÿà\]Kÿ\ò⁄]ôH‹\ò][€ãÇãHö[ò[ìÀ‹ŸX›\ö]H\ô[ö[ô»⁄›[ô\XŸH‹àõ›X›\ŸH]Y]‹ö]\¬à⁄]HŸ\ùô\ã]ò[Y]Y]€ZX»]YàH\ô\]Z\ô\»›öX›]Y]›\]Bà[úŸ\\òXö[]KÇÇà»»»ô^›\»
[à‹ô\äBåKàûX[àô\öYöY\»Y][ô»H\›õÿàÿ]ô\»[ôô[ÿYÀÇåãàûX[àô\öYöY\»\ò⁄]ö[ô»H\›õÿàô\]Z\ô\»HôX\€€à[ôô[[›ô\»]úõ€HBàö\⁄XõHõÿú»\ôX›‹ûKÇåÀà\ö[ô»Hö[ò[ŸX›\ö]H\‹ÀY⁄[à⁄[ôŸW€Ÿ‹ÿ^‹›\ôH[ô€€ôö\õBàH\⁄\ôY]€ZX»]Y]›ò]YﬁHõ‹àõÿúÀù^[›]ö[ò[ò⁄X[À[ô›\ÇàY]XõH[Ÿ[\ÀÇçà€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»YŸK€[Ÿ[Hÿ\ÇÇà»»»‹[à]Y\›[€ú»»€€òŸ\õú¬ãHôXÿ]\ŸHö[ò[ì»€X[ù\\»[ù[ù[€ò[HYô\úôY⁄[ôŸW€Ÿ‹ÿô[XZ[ú¬àúõÿY\à[àHö[ò[\⁄\ôYŸX›\ö]H‹›\ôKÇãHY]ÿ\ò⁄]ôH€€ùõ€»\ôH]ôHõ‹àHõ›[ô][€àõÿúÿõ›»€õKàô[]Yà[Ÿ[Hõ›‹»›X⁄\»ù^[›]ö[ò[ò⁄X[Àÿ›[Y[ùÀ[ôÿ⁄Y[HŸY\Z\Çà›€àY]ÿ\ò⁄]ôH\ô[ö[ô»ô\]Z\ô[Y[ùÀÇÇãKKBÇà»»[ùûHNH8†%õÿú»\ò⁄]ôHì»ô]\õàö^Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\NääàùY»ö^Çà»»»€€ù^îûX[àô\‹ùY[àì»\‹›YH⁄[à\ò⁄]ö[ô»HõÿãàHÿ]\ŸHÿ\»H€Y[ùò\ò⁄]ôH[ô\à\][ô»\ò⁄]ôYÿ][ô[à[[YYX][Hô\]Y\›[ô»Bù\]Yõ›»⁄]úŸ[X›

Kú⁄[ô€J
XàH^\›[ô»õÿú◊‹ôXY€XﬁHY\¬ò\ò⁄]ôYõ›‹À€»H\]H]€›[ö\ìÀ‹ôXYôZ]ö[‹àYù\àHõ›¬ùÿ\»€‹úôX›H€ŸùX\ò⁄]ôYÇÇà»»»⁄]ÿ\»€€\]YãHô[[›ôYH‹›X\ò⁄]ôHŸ[X›Y\õ›»ô]\õàúõ€HHõÿú»\ò⁄]ôH[ô\ãÇãHH\ò⁄]ôH\]Hõ›»\ôõ‹õ\»H€Ÿù\ò⁄]ôH⁄]›]\⁄⁄[ô»›\Xò\ŸH¬àô]\õàH\ò⁄]ôYõ›ÀÇãHH]Y]Yù\óŸ]X€ò\⁄›\»ùZ[úõ€HHŸ[X›Yõÿà\»Bà\ò⁄]ôHY]Y]H]ÿ\»Ÿ[ù[àH\]KÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ì»€X⁄Y\»Ÿ\ôH⁄[ôŸY[à\»ö^ÇãH\»ô\Ÿ\ùô\»H^\›[ô»ù[H]\ò⁄]ôYõÿú»\ôHY[àúõ€H‹ô[ò\ûBàõÿú»ôXYÀÇãHö[ò[ìÀ‹ŸX›\ö]H€X[ù\ô[XZ[ú»Yô\úôYÇÇà»»»ô^›\¬åKàûX[àô]öY\»\ò⁄]ö[ô»H\›õÿãÇåãàYà\ò⁄]ôH›XÿŸYYÀ€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHNà8†%õÿú»\ò⁄]ôHî»\ô[ö[ô¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\NääàùY»ö^Çà»»»€€ù^îûX[àô\‹ùY]õÿà\ò⁄]ôHÿ\»›[õÿ⁄ŸYYù\àô[[›ö[ô»H€Y[ù\⁄YBú‹›X\ò⁄]ôHõ›»ô]\õãàHô[XZ[ö[ô»\‹›YHô\]Z\ôY[›ö[ô»\ò⁄]ôH[ù»BúŸ\ùô\ã\⁄YH]Xò\ŸHù[ò›[€à€»Hõÿà€Ÿù\ò⁄]ôH[ô]Y][ùûH\[ÇùŸŸ]\à[ô\àH]Xò\ŸI‹»\õZ\‹⁄[€à⁄X⁄ÀÇÇà»»»⁄]ÿ\»€€\]YãHYYXõXÀò\ò⁄]ôW⁄õÿä⁄õÿó⁄Y]ZY‹ôX\€€à^
XÇãHHîŒÇàHô\]Z\ô\»[à]][ùXÿ]Y€\ö»›XöôX›àHô\]Z\ô\»Hõ€ãY[\H\ò⁄]ôHôX\€€ÇàHÿ⁄‹»HX›]ôHõÿàõ›¬àHò[Y]\»Hÿ[\à\»YôôX›]ôHÿ[ó€X[òYŸW⁄õÿúÿõ‹àHõÿà]ö\⁄[€ÇàHŸ]»\ò⁄]ôYÿ]\ò⁄]ôYÿûX[ô\ò⁄]ôW‹ôX\€€òàH‹ö]\»H⁄[ôŸW€Ÿ‹ÿ\ò⁄]ôH[ùûH[àHÿ[YHò[úÿX›[€ÇãH\]YHõÿú»RH\ò⁄]ôHX›[€à»ÿ[\ò⁄]ôW⁄õÿò[ú›XYŸà\][ô¬àXõXÀöõÿúÿ\ôX›KÇãHY⁄[ôYù[ò›[€à‹ò[ù»€»€Y[ù^X›][€à\»[Z]Y»]][ùXÿ]Yà\»Ÿ\ùöXŸKÿYZ[àõ€\ÀÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHYYZY‹ò][€éÇàH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåLçÕóÿ\ò⁄]ôW⁄õÿó‹úÀú‹[ãH\YYõŸX›[€àZY‹ò][€úŒÇàH\ò⁄]ôW⁄õÿó‹úÿàH\ò⁄]ôW⁄õÿó‹ú◊‹ô]õ⁄ŸWÿ[õ€òÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåLçÕóÿ\ò⁄]ôW⁄õÿó‹úÀú‹[ãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHõŸX›[€àù[ò›[€à⁄Y€ò]\ôHô\öYöYYÇàH\ò⁄]ôW⁄õÿä⁄õÿó⁄Y]ZY‹ôX\€€à^
Hô]\õú»õ⁄YàH—P’TíUHQíSëTàHùYXãHõŸX›[€àõ›][ôH‹ò[ù»ô\öYöYYÇàH]][ùXÿ]Y\»VP’UXàH[õ€òŸ\»õ›]ôHVP’UXãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãH\»\»H\ôŸ]Y\ò⁄]ôHö^õ›Hö[ò[ìÀ‹ŸX›\ö]H€X[ù\ÇãHHî»\Ÿ\»H^\›[ô»ÿ[õ€öXÿ[\Ÿ\ó‹\õZ\‹⁄[€úÿ[ôàYôôX›]ôW‹\õZ\‹⁄[€ú◊Ÿõ‹ó›\Ÿ\äããäX[Ÿ[ÇãHHî»ôX€‹ô»\ò⁄]ôYÿûX\»H]][ùXÿ]Y€\ö»›XöôX›õ›Bà\‹^Hò[YKÇãHö[ò[ì»€X[ù\⁄›[›[ô]öY]»úõÿYYÿXﬁH‹ò[ù»[ôHúõÿY\Çà⁄[ôŸW€Ÿ‹ÿ‹›\ôKÇÇà»»»ô^›\¬åKàûX[àô]öY\»\ò⁄]ö[ô»H\›õÿãÇåãàYà\ò⁄]ôH›XÿŸYYÀ€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHN»8†%õÿú»ù^[›]Y]\ò⁄]ôH]Y]Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYHõÿú»\ò⁄]ôHî»ö^[ô\⁄ŸY»õÿŸYYàHô^\öŸYíõÿú»€X[ù\][Hÿ\»ù^[›]\ô[ö[ôŒà\Ÿ\ú»ôYYY»ôHXõH»Y]ù^[›]ö][\»]\ã[ôY]»ôYYY»[ô[àH]Y]ŸÀÇÇà»»»⁄]ÿ\»€€\]YãHYYY]XõHù^[›]õ›‹ÀÇãHô]\ŸYHù^[›]õ‹õHõ‹àY[ôY][ŸKÇãHYYÿ[òŸ[Y]ÇãHYYY]XõHöY[»õ‹éÇàH][H\ÿ‹ö\[€ÇàH]X[ù]HôYYYàH›]\¬àHô[ô‹ã‹€›\òŸHõ›BàHùYŸ]àH[ö]X[ò[YBàHX›X[ò[YBàH[ö]X[XY[YBàHX›X[XY[YBàHõ›\¬ãHYYõ›À[]ô[\ò⁄]ôHX›[€à⁄]ô\]Z\ôYôX\€€ãÇãHù^[›]ôXY»õ›»^X⁄]Hö[\à\ò⁄]ôYÿ]\»ù[ÇãHù^[›]‹ôX]KY]›]\»⁄[ôŸK[ô\ò⁄]ôHX›[€ú»õ›»‹ö]BàXõXÀò⁄[ôŸW€Ÿ‹ÿ[ùöY\»⁄]ôYõ‹ôKÿYù\à€ò\⁄›ÀÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHõ€ôKÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ì»€X⁄Y\»Ÿ\ôH⁄[ôŸY[à\»€XŸKÇãHõ»õŸX›[€àÿ\»\YY[à\»€XŸKÇãHù^[›]\ò⁄]ôH\Ÿ\»H^\›[ô»XõH\]H][ôŸ\»õ›ô\]Y\›Bà\ò⁄]ôYõ›»òX⁄»Yù\àŸ][ô»\ò⁄]ôYÿ]ÇãH]Y]‹ö]\»\ôH›[€Y[ù\⁄YH⁄[ôŸW€Ÿ‹ÿ[úŸ\ù»[ù[Hö[ò[àìÀ‹ŸX›\ö]H\‹»X⁄Y\»⁄X⁄Y][€ò[X›[€ú»ôYYîÀ[]ô[]€ZX⁄]KÇÇà»»»ô^›\¬åKàûX[àô\öYöY\»Y][ô»Hù^[›]õ›»ÿ]ô\»[ôô[ÿYÀÇåãàûX[àô\öYöY\»›]\»ù]€ú»›[€‹öÀÇåÀàûX[àô\öYöY\»\ò⁄]ö[ô»Hù^[›]õ›»ô\]Z\ô\»HôX\€€à[ôô[[›ô\»]úõ€BàHö\⁄XõHù^[›]\›Ççà€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHN8†%õÿú»ù^[›]\ò⁄]ôHî»ö^Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\NääàùY»ö^Çà»»»€€ù^îûX[àô\‹ùYHÿ[YHì»\ò⁄]ôH\‹›YH€àù^[›]õ›‹»]\X\ôY€àõÿúÀÇïH\ôX›€Y[ù\]H]ÿ\»ô\XŸY⁄]HŸ\ùô\ã\⁄YH\ò⁄]ôHîÀÇÇà»»»⁄]ÿ\»€€\]YãHYYXõXÀò\ò⁄]ôW⁄õÿóÿù^[›]€[ôJÿù^[›]€[ôW⁄Y]ZY‹ôX\€€à^
XÇãHHîŒÇàHô\]Z\ô\»[à]][ùXÿ]Y€\ö»›XöôX›àHô\]Z\ô\»Hõ€ãY[\H\ò⁄]ôHôX\€€ÇàHÿ⁄‹»HX›]ôHù^[›][ôBàHò[Y]\»YôôX›]ôHÿ[ó€X[òYŸW⁄õÿúÿõ‹àH[ôH]ö\⁄[€ÇàHŸ]»\ò⁄]ôYÿ]\ò⁄]ôYÿûX[ô\ò⁄]ôW‹ôX\€€òàH‹ö]\»H⁄[ôŸW€Ÿ‹ÿ\ò⁄]ôH[ùûH[àHÿ[YHò[úÿX›[€ÇãH\]YHù^[›]\ò⁄]ôHù]€à»ÿ[Hî»[ú›XYŸà\ôX›Bà\][ô»õÿóÿù^[›]€[ô\ÿÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHYYZY‹ò][€éÇàH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåLÕLåÿ\ò⁄]ôW⁄õÿóÿù^[›]€[ôW‹úÀú‹[ãH\YYõŸX›[€àZY‹ò][€éÇàH\ò⁄]ôW⁄õÿóÿù^[›]€[ôW‹úÿÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåLÕLåÿ\ò⁄]ôW⁄õÿóÿù^[›]€[ôW‹úÀú‹[ãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHõŸX›[€àù[ò›[€à⁄Y€ò]\ôHô\öYöYYÇàH\ò⁄]ôW⁄õÿóÿù^[›]€[ôJÿù^[›]€[ôW⁄Y]ZY‹ôX\€€à^
Hô]\õú»õ⁄YàH—P’TíUHQíSëTàHùYXãHõŸX›[€àõ›][ôH‹ò[ù»ô\öYöYYÇàH]][ùXÿ]Y\»VP’UXàH[õ€òŸ\»õ›]ôHVP’UXãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»ô^›\¬åKàûX[àô]öY\»\ò⁄]ö[ô»Hù^[›]][KÇåãàYà\ò⁄]ôH›XÿŸYYÀ€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHNH8†%õÿú»ö[ò[ò⁄X[»Y]\ò⁄]ôH]Y]Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYHù^[›]\ò⁄]ôHî»ö^[ô\⁄ŸY»õÿŸYYàHô^õÿú¬ò€X[ù\ÿ\ÿ\»ö[ò[ò⁄X[»\ô[ö[ôŒàY]À\ò⁄]ô\À[ô]Y]€›ô\òYŸKÇîûX[àô]ö[›\€H‹X⁄YöYY]õ‹ôXÿ\›[ôÀX›X[€‹›À[ô⁄[ôŸH‹ô\ú»\ôBõõ‹õX[€‹öŸõ›À⁄[HY]»»‹öY⁄[ò[ùYŸ]€‹›€Ÿ\À\ÿ‹ö\[€úÀ[ôòÿ]Y€‹öY\»ô\]Z\ôHHôX\€€ãÇÇà»»»⁄]ÿ\»€€\]YãHYYY]XõHö[ò[ò⁄X[»õ›‹ÀÇãHô]\ŸYHö[ò[ò⁄X[»õ‹õHõ‹àY[ôY][ŸKÇãHYYÿ[òŸ[Y]ÇãHYYõ›À[]ô[Y][ô\ò⁄]ôHX›[€úÀÇãHö[ò[ò⁄X[»ôXY»õ›»^X⁄]Hö[\à\ò⁄]ôYÿ]\»ù[ÇãHö[ò[ò⁄X[‹ôX]KŸY]X›[€ú»‹ö]HXõXÀò⁄[ôŸW€Ÿ‹ÿ[ùöY\»⁄]àôYõ‹ôKÿYù\à€ò\⁄›ÀÇãHY]»»õ›X›YöY[»ô\]Z\ôH⁄[ôŸHôX\€€òôYõ‹ôHÿ]ôNÇàH‹öY⁄[ò[ùYŸ]àH€‹›€ŸBàH\ÿ‹ö\[€ÇàHÿ]Y€‹ûBãHõ‹õX[€‹öŸõ›»öY[»ÿ[àôH\]Y⁄]›]H‹X⁄X[ôX\€€éÇàHùYŸ]⁄[ôŸ\¬àHX›X[€‹›¬àH€€[Z]Y€‹›¬àHõ‹ôXÿ\›»€€\]BàHõ›\¬ãHYYXõXÀò\ò⁄]ôW⁄õÿóÿùYŸ]€[ôJÿùYŸ]€[ôW⁄Y]ZY‹ôX\€€à^
XÇãHH\ò⁄]ôHî»ò[Y]\»YôôX›]ôHÿ[óÿ\õ›ôWÿùYŸ]€ŸùX\ò⁄]ô\»Bà[ôK[ô‹ö]\»H\ò⁄]ôH]Y][ùûH[àHÿ[YHò[úÿX›[€ãÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHYYZY‹ò][€éÇàH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåMMWÿ\ò⁄]ôW⁄õÿóÿùYŸ]€[ôW‹úÀú‹[ãH\YYõŸX›[€àZY‹ò][€éÇàH\ò⁄]ôW⁄õÿóÿùYŸ]€[ôW‹úÿÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåMMWÿ\ò⁄]ôW⁄õÿóÿùYŸ]€[ôW‹úÀú‹[ãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHõŸX›[€àù[ò›[€à⁄Y€ò]\ôHô\öYöYYÇàH\ò⁄]ôW⁄õÿóÿùYŸ]€[ôJÿùYŸ]€[ôW⁄Y]ZY‹ôX\€€à^
Hô]\õú»õ⁄YàH—P’TíUHQíSëTàHùYXãHõŸX›[€àõ›][ôH‹ò[ù»ô\öYöYYÇàH]][ùXÿ]Y\»VP’UXàH[õ€òŸ\»õ›]ôHVP’UXãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»^\›[ô»ì»€XﬁHÿ\»⁄[ôŸY[à\»€XŸKÇãH\ò⁄]ôH\»îÀXòX⁄ŸY»]õ⁄YHX›]ôK\õ›»ì»\ÿ\X\ò[òŸH\‹›YKÇãH‹ôX]KŸY]]Y]‹ö]\»ô[XZ[à€Y[ù\⁄YH⁄[ôŸW€Ÿ‹ÿ[úŸ\ù»[ù[Bàö[ò[ìÀ‹ŸX›\ö]H\‹»]\õZ[ô\»úõÿY\à]€ZX»]Y]ô\]Z\ô[Y[ùÀÇãHH€‹›ô\‹ù[\‹ùù[ò›[€à\»›[Yô\úôYÇÇà»»»ô^›\¬åKàûX[àô\öYöY\»Y][ô»õ‹õX[€‹öŸõ›»öY[»ÿ]ô\ÀÇåãàûX[àô\öYöY\»õ›X›YöY[Y]»ô\]Z\ôHHôX\€€ãÇåÀàûX[àô\öYöY\»\ò⁄]ö[ô»Hö[ò[ò⁄X[»õ›»ô\]Z\ô\»HôX\€€à[ôô[[›ô\»]àúõ€HHö\⁄XõH\›Ççà€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHNL8†%õÿú»ÿ›[Y[ù»\ò⁄]ôHî¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYö[ò[ò⁄X[»\ô[ö[ô»[ô\⁄ŸY»õÿŸYYàHô^ö\⁄XõHõÿú¬ôÿ\ÿ\»ÿ›[Y[ù»\ò⁄]ôK⁄X⁄ÿ\»›[\ÿXõY\»\ò⁄]ôH[ô[ôÿÇÇà»»»⁄]ÿ\»€€\]YãHYYXõXÀò\ò⁄]ôW⁄õÿóŸÿ›[Y[ù
Ÿÿ›[Y[ù⁄Y]ZY‹ôX\€€à^
XÇãHHîŒÇàHô\]Z\ô\»[à]][ùXÿ]Y€\ö»›XöôX›àHô\]Z\ô\»Hõ€ãY[\H\ò⁄]ôHôX\€€ÇàHÿ⁄‹»[àX›]ôHõÿã[›€ôYÿ›[Y[ùõ›¬àHò[Y]\»YôôX›]ôHÿ[ó€X[òYŸW⁄õÿúÿõ‹àHÿ›[Y[ù]ö\⁄[€ÇàHŸ]»\ò⁄]ôYÿ]\ò⁄]ôYÿûX[ô\ò⁄]ôW‹ôX\€€òàH‹ö]\»H⁄[ôŸW€Ÿ‹ÿ\ò⁄]ôH[ùûH[àHÿ[YHò[úÿX›[€ÇãH\]YHõÿú»ÿ›[Y[ù»XéÇàHô[[›ôYH\ÿXõY\ò⁄]ôH[ô[ôÿù]€ÇàHYY]ôH\ò⁄]ôHX›[€à⁄]Hô\]Z\ôYôX\€€àõ€\àHô[ÿY»Hÿ›[Y[ù\›Yù\à\ò⁄]ôBãH^[ôYHÿ›[Y[ùŸ[X›öY[»»[ò€YH]ö\⁄[€ãÿ\ò⁄]ôHY]Y]KÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHYYZY‹ò][€éÇàH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåMÕóÿ\ò⁄]ôW⁄õÿóŸÿ›[Y[ù‹úÀú‹[ãH\YYõŸX›[€àZY‹ò][€éÇàH\ò⁄]ôW⁄õÿóŸÿ›[Y[ù‹úÿÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåMÕóÿ\ò⁄]ôW⁄õÿóŸÿ›[Y[ù‹úÀú‹[ãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHõŸX›[€àù[ò›[€à⁄Y€ò]\ôHô\öYöYYÇàH\ò⁄]ôW⁄õÿóŸÿ›[Y[ù
Ÿÿ›[Y[ù⁄Y]ZY‹ôX\€€à^
Hô]\õú»õ⁄YàH—P’TíUHQíSëTàHùYXãHõŸX›[€àõ›][ôH‹ò[ù»ô\öYöYYÇàH]][ùXÿ]Y\»VP’UXàH[õ€òŸ\»õ›]ôHVP’UXãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»^\›[ô»ì»€XﬁHÿ\»⁄[ôŸY[à\»€XŸKÇãH\ò⁄]ôH\»îÀXòX⁄ŸY»]õ⁄YX›]ôK\õ›»ì»\ÿ\X\ò[òŸH\‹›Y\ÀÇãHHö[H\»õ›[]Yúõ€H›\Xò\ŸH›‹òYŸN»\»\»Hÿ›[Y[ùõ›¬à€ŸùX\ò⁄]ôKÇÇà»»»ô^›\¬åKàûX[àô\öYöY\»\ò⁄]ö[ô»Hõÿàÿ›[Y[ùô\]Z\ô\»HôX\€€à[ôô[[›ô\»]úõ€BàHö\⁄XõHÿ›[Y[ù\›ÿ⁄X⁄€\›Çåãà€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHNLH8†%õÿú»ÿ⁄Y[H]Y][ô\ò⁄]ôHî¬Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYÿ›[Y[ù»\ò⁄]ôH[ô\⁄ŸY»õÿŸYYàHô^õÿú»€X[ù\ÿ\ùÿ\»ÿ⁄Y[Nà‹ôX]KŸY]‹ô[‹ô\àX›[€ú»Ÿ\ôHõ›‹ö][ô»]Y][ùöY\À[ôò\ò⁄]ôH›[\ŸYH\ôX›XõH\]HYÿZ[ú›X›]ôK\õ›»ìÀÇÇà»»»⁄]ÿ\»€€\]YãHYYÿ⁄Y[H]Y]€ò\⁄›»õ‹àõÿó‹ÿ⁄Y[W⁄][\ÿÇãH\]Yÿ⁄Y[H‹ôX]KŸY]ŒÇàHô]\õàHÿ]ôYõ›¬àH‹ö]H⁄[ôŸW€Ÿ‹ÿ[ùöY\»õ‹à‹ôX]H[ô\]BàH[ò€YHÿ⁄Y[H]K\ò][€ã\[ô[òﬁK›]\À‹ô\ãõ›K[ôà\ò⁄]ôHY]Y]H[à]Y]€ò\⁄›¬ãH\]Yÿ⁄Y[Hô[‹ô\à»‹ö]HH⁄[ôŸW€Ÿ‹ÿ\]H[ùûHõ‹àH[›ôYàÿ⁄Y[H][KÇãHYYXõXÀò\ò⁄]ôW⁄õÿó‹ÿ⁄Y[W⁄][J‹ÿ⁄Y[W⁄][W⁄Y]ZY‹ôX\€€à^
XÇãHHîŒÇàHô\]Z\ô\»[à]][ùXÿ]Y€\ö»›XöôX›àHô\]Z\ô\»Hõ€ãY[\H\ò⁄]ôHôX\€€ÇàHÿ⁄‹»[àX›]ôHÿ⁄Y[H][Hõ›¬àHò[Y]\»YôôX›]ôHÿ[ó€X[òYŸW⁄õÿúÿõ‹àHÿ⁄Y[H][H]ö\⁄[€ÇàHŸ]»\ò⁄]ôYÿ]\ò⁄]ôYÿûX[ô\ò⁄]ôW‹ôX\€€òàH‹ö]\»H⁄[ôŸW€Ÿ‹ÿ\ò⁄]ôH[ùûH[àHÿ[YHò[úÿX›[€ÇãH\]YHÿ⁄Y[H\ò⁄]ôHù]€à»ÿ[Hî»[ú›XYŸà\ôX›Bà\][ô»õÿó‹ÿ⁄Y[W⁄][\ÿÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHYYZY‹ò][€éÇàH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåMLÕWÿ\ò⁄]ôW⁄õÿó‹ÿ⁄Y[W⁄][W‹úÀú‹[ãH\YYõŸX›[€àZY‹ò][€éÇàH\ò⁄]ôW⁄õÿó‹ÿ⁄Y[W⁄][W‹úÿÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLåMLÕWÿ\ò⁄]ôW⁄õÿó‹ÿ⁄Y[W⁄][W‹úÀú‹[ãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHõŸX›[€àù[ò›[€à⁄Y€ò]\ôHô\öYöYYÇàH\ò⁄]ôW⁄õÿó‹ÿ⁄Y[W⁄][J‹ÿ⁄Y[W⁄][W⁄Y]ZY‹ôX\€€à^
Hô]\õú»õ⁄YàH—P’TíUHQíSëTàHùYXãHõŸX›[€àõ›][ôH‹ò[ù»ô\öYöYYÇàH]][ùXÿ]Y\»VP’UXàH[õ€òŸ\»õ›]ôHVP’UXãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»^\›[ô»ì»€XﬁHÿ\»⁄[ôŸY[à\»€XŸKÇãHÿ⁄Y[H\ò⁄]ôH\»îÀXòX⁄ŸY»]õ⁄YX›]ôK\õ›»ì»\ÿ\X\ò[òŸH\‹›Y\ÀÇãHÿ⁄Y[H‹ôX]KŸY]‹ô[‹ô\à]Y]‹ö]\»ô[XZ[à€Y[ù\⁄YH⁄[ôŸW€Ÿ‹ÿà[úŸ\ù»[ù[Hö[ò[ìÀ‹ŸX›\ö]H\‹»]\õZ[ô\»úõÿY\à]€ZX»]Y]àô\]Z\ô[Y[ùÀÇÇà»»»ô^›\¬åKàûX[àô\öYöY\»Y[ôÀY][ôÀ[›ö[ôÀ[ô\ò⁄]ö[ô»ÿ⁄Y[H][\ÀÇåãà€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHNLà8†%õÿú»ÿ⁄Y[H\‹^H‹ô\àö^Çääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYÿ⁄Y[HX›[€ú»€‹öŸYù][›ö[ô»Hõ›»ÿ]\ŸYö\⁄XõH‹ô\Çõù[Xô\ú»»⁄[ôŸHúõ€HKãÀX»ò]»›‹ôY€‹ùò[Y\»ZŸBòLåÃLÇÇà»»»⁄]ÿ\»€€\]YãHŸ\H]Xò\ŸH€‹ù€‹ô\òò[Y\»‹XŸY[ù\õò[Hõ‹à›XõBàô[‹ô\ö[ôÀÇãH⁄[ôŸYHÿ⁄Y[HXõHÿ€€[[à»\‹^Hõ›»‹⁄][€à\¬àKãÀããòÇãH⁄[ôŸYHÿ⁄Y[HY]õ‹õH»⁄›»H\‹^H‹ô\àò]\à[àò]¬à€‹ù€‹ô\òÇãH€€ùô\ùY\‹^H‹ô\àòX⁄»»‹XŸY[ù\õò[€‹ù€‹ô\òò[Y\»€õH⁄[Çàÿ]ö[ôÀÇãH\]YHYõ‹õHXŸZ€\à»⁄›»Hô^ö\⁄XõH‹ô\àù[Xô\ãÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»ô^›\¬åKàûX[àô\öYöY\»[›ö[ô»ÿ⁄Y[Hõ›‹»ŸY\»ö\⁄XõHù[Xô\ö[ô»\»KãÀããòÇåãà€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHNL»8†%õÿú»\›‹ûHXÇÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYHÿ⁄Y[H\‹^K[‹ô\àö^[ô\⁄ŸY»õÿŸYYàHô^íõÿú»€X[ù\ÿ\ÿ\»ö\⁄Xö[]H[ù»H]Y]ôX€‹ô»[ôXYHôZ[ô»‹ö][àûBíõÿúÀù^[›]ö[ò[ò⁄X[Àÿ›[Y[ùÀ[ôÿ⁄Y[HX›[€úÀÇÇà»»»⁄]ÿ\»€€\]YãHYYXõXÀúôXY⁄õÿóÿ⁄[ôŸW⁄\›‹ûJ⁄õÿó⁄Y]ZY€[Z][ùYŸ\äXÇãHHîŒÇàHô\]Z\ô\»[à]][ùXÿ]Y€\ö»›XöôX›àHò[Y]\»H\ôŸ]õÿà^\›»[ô\»X›]ôBàH[›‹»ôXY»€õHõ‹à\Ÿ\ú»[àHõÿà]ö\⁄[€à‹à\Ÿ\ú»⁄]YôôX›]ôBàÿ[ó›öY]◊ÿ[Ÿ]ö\⁄[€úÿàHô]\õú»ôXŸ[ùô[]Y⁄[ôŸW€Ÿ‹ÿõ›‹»õ‹àHõÿàôX€‹ôõÿã[›€ôYàù^[›]ö[ò[ò⁄X[Àÿ⁄Y[K[ôÿ›[Y[ù»ôX€‹ô¬àH\ö]ô\»⁄[ôŸYŸöY[ÿúõ€HôYõ‹ôWŸ]X»Yù\óŸ]XãHYYH]ôHõÿú»\›‹ûXXãÇãHH\›‹ûHXéÇàHÿY»õ›Y⁄Hî»€õH⁄[àŸ[X›YàH⁄›‹»›[[X\ûH€›[ù\ú»õ‹à]ô[ùÀ\]\À\ò⁄]ô\À\ôX\À[ô]\›à]ô[ùàHô[ô\ú»HôXY[€õHXõH⁄][Y\›[\\ôXKX›[€ã\Ÿ\ã⁄[ôŸYàöY[À[ôõ›BàH[ò€Y\»HôYúô\⁄X›[€ÇÇà»»»ÿ⁄[XH⁄[ôŸ\¬ãHYYZY‹ò][€éÇàH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLååÕ‹ôXY⁄õÿóÿ⁄[ôŸW⁄\›‹ûW‹úÀú‹[ãH\YYõŸX›[€àZY‹ò][€éÇàHôXY⁄õÿóÿ⁄[ôŸW⁄\›‹ûW‹úÿÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMLååÕ‹ôXY⁄õÿóÿ⁄[ôŸW⁄\›‹ûW‹úÀú‹[ãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHõŸX›[€àù[ò›[€à⁄Y€ò]\ôHô\öYöYYÇàHôXY⁄õÿóÿ⁄[ôŸW⁄\›‹ûJ⁄õÿó⁄Y]ZY€[Z][ùYŸ\äXàHô]\õú»H^X›Y\›‹ûHXõH⁄\BàH—P’TíUHQíSëTàHùYXãHõŸX›[€àõ›][ôH‹ò[ù»ô\öYöYYÇàH]][ùXÿ]Y\»VP’UXàH[õ€òŸ\»õ›]ôHVP’UXãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»^\›[ô»ì»€XﬁHÿ\»⁄[ôŸY[à\»€XŸKÇãHHî»[ù[ù[€ò[H]õ⁄Y»^‹⁄[ô»⁄[ôŸW€Ÿ‹ÿ\ôX›HôXÿ]\ŸBà⁄[ôŸW€Ÿ‹ÿ\»[à€\àúõÿY]Y]XõH⁄]ì»\ÿXõYÇãH^\›[ô»€Y[ù\⁄YH]Y]‹ö]\»›[\ŸHXõW€ò[YHH	⁄õÿú…ÿõ‹à€€YBà⁄[\ŸX›[€àY]Œ»H\›‹ûHî»€€\[úÿ]\»ûH⁄X⁄⁄[ô»õÿàY[ùYöY\ú¬à[àî””à€ò\⁄›ÀÇÇà»»»ô^›\¬åKàûX[àô\öYöY\»H\›‹ûHXàÿY»[ô⁄›‹»ôXŸ[ùõÿàX›]ö]KÇåãà€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHNM8†%õÿú»ö[ò[ò⁄X[»€‹›ô\‹ù[\‹ùÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYHõÿú»\›‹ûHXà[ô\⁄ŸY»õÿŸYYàHô]ö[›\€Hô\]Y\›Yëö[ò[ò⁄X[»ÿ\ÿ\»[àí[\‹ù€‹›ô\‹ùàù[ò›[€à]\]\»HX›X[ò€€[[àúõ€H[àXÿ€›[ù[ôÀŸ^‹ùö[KÇÇà»»»⁄]ÿ\»€€\]YãHYY[à[\‹ù€‹›ô\‹ùõ‹õH»Hõÿú»ö[ò[ò⁄X[»XãÇãHH[\‹ù\éÇàHXÿŸ\»ò‹›òù›ò[ôùö[\¬àH]X›»€€[XKXãŸ[ZX€€€ã‹à\H[[Z]\ú¬àH\úŸ\»][›Y[[Z]Yõ›‹¬àHôX€Ÿ€ö^ô\»€€[[€à€‹›X€ŸH[ôX›X[X€‹›€€[[àXY\ú¬àHõ‹õX[^ô\»€‹›€Ÿ\»õ‹àX]⁄[ôÀ[ò€Y[ô»Xÿ€›[ù[ôÀ\›[Hù[Y\öX¬àò[Y\»›X⁄\»MãLåàHYŸ‹ôYÿ]\»ô\X]Y€‹›X€ŸHõ›‹»ôYõ‹ôH\][ô»ö[ò[ò⁄X[¬àH\]\»€õHX›X[ÿ€‹›ÿ[[›[ùàH⁄⁄\»X]⁄Yõ›‹»⁄\ôHHX›X[ò[YH\»[ôXYH›\úô[ùàH‹ö]\»H⁄[ôŸW€Ÿ‹ÿ]Y][ùûHõ‹à]ô\ûH\]Y[ôBãHH[\‹ù]\Ÿ\»H^\›[ô»ö[ò[ò⁄X[»Y]\õZ\‹⁄[€àÿ]Bà
ÿ[ê\õ›ôTŸ[X›YùYŸ]
H[ô^\›[ô»õÿóÿùYŸ]€[ô\ÿìÀ›\]H]ÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ÿ⁄[XH⁄[ôŸHÿ\»XYH[à\»€XŸKÇãHõ»ì»€XﬁHÿ\»⁄[ôŸY[à\»€XŸKÇãH[\‹ù\»[ù[ù[€ò[H[Z]Y»HX›X[€€[[é»‹öY⁄[ò[ùYŸ]€‹›à€ŸK\ÿ‹ö\[€ãÿ]Y€‹ûK€€[Z]Yõ‹ôXÿ\›[ô⁄[ôŸH‹ô\ú»›[\ŸBàHX[ùX[Y]]ÇãH]Y][ùöY\»\ŸHHÿ[YH€Y[ù\⁄YH⁄[ôŸW€Ÿ‹ÿ[\à\»›\Çàö[ò[ò⁄X[»Y]ÀÇÇà»»»ô^›\¬åKàûX[à\›»[\‹ù[ô»H€‹›ô\‹ù⁄]X]⁄[ô»€‹›€Ÿ\ÀÇåãà€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHNMH8†%õÿú»ö[ò[ò⁄X[»à€‹›ô\‹ù[\‹ùÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àõ›öYYHÿ[\Hà€‹›ô\‹ùÇòô\‹ùŸúõ€W”õ‹ùÿ]W—‹õ›\–€€ú›ùX›[€ó–€€\[ûW”»
‹õ KúòàBëö[ò[ò⁄X[»[\‹ù]ôYYY»ôXY\»àõ‹õX]õ›ù\›‘’ã’’à^ô^‹ùÀÇÇà»»»⁄]ÿ\»€€\]YãHYYöúÀY\›\»H[õôY€Y[ù\[ô[òﬁKÇãH\]YHö[ò[ò⁄X[»€‹›ô\‹ù[\‹ù\à»XÿŸ\àö[\ÀÇãHãöú»\»^ûK[ÿYY€õH⁄[àHà\»[\‹ùYÇãHYYà^^òX›[€à]‹õ›\»‹⁄][€ôY^][\»[ù»ôXYXõBà[ô\ÀÇãHYY›\‹ùõ‹àõ‹ùÿ]Híõÿà\›[X]\»úÀàX›X[»]Z[àõ›‹»⁄\YàZŸNÇàH€‹›€ŸBàH\ÿ‹ö\[€ÇàH\›[X]Y€‹›àHX›X[€‹›àHYôô\ô[òŸBàHX›X[ô]ô[ùYBãHH\úŸ\à\Ÿ\»HŸX€€ô[€ô^H€€[[à\»X›X[ÇãH›[õ›‹»[ôõ€ãX€‹›X€ŸHõ›‹»\ôHY€õ‹ôYÇãH^\›[ô»‘’ã’’ã’[\‹ù›\‹ùô[XZ[ú»[ùX›ÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãHX⁄ÿYŸKöú€€òãHX⁄ÿYŸK[ÿ⁄Àöú€€òãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãH^òX›YHõ›öYY‹õ»à⁄]ú[Xô\òÇãHÿ[ö]H⁄X⁄»õ›[ôà€‹›X€ŸHõ›‹À[ò€Y[ôŒÇàHMãåHOàÕÀåLòàHMãåLHOàçŒKçÿàHMãçOàÃçàHMãçàOàKçéãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ÿ⁄[XH⁄[ôŸHÿ\»XYH[à\»€XŸKÇãHõ»ì»€XﬁHÿ\»⁄[ôŸY[à\»€XŸKÇãHúH]Y]K[€Z]Y]ò€›[õ›€€\]HôXÿ]\ŸHHôY⁄\›ûH]Y][ô⁄[ùàô]\õôY[à\úõ‹à[à\»[ùö\õ€õY[ùÇãHHùZ[õ›»[Z]»HŸ\\ò]Hãöú»⁄[öÀ›€‹öŸ\ãà\»\»^X›Y[ôŸY\¬àà\ú⁄[ô»›]ŸàHõ‹õX[\][ù[Hà[\‹ù\»\ŸYÇÇà»»»ô^›\¬åKàûX[à\›»[\‹ù[ô»H‹õ»à[ù»Hõÿà⁄]X]⁄[ô»ö[ò[ò⁄X[»€‹›à€Ÿ\ÀÇåãà€€ù[ùYHõÿú»€X[ù\⁄]Hô^ô[XZ[ö[ô»ÿ\ÇÇãKKBÇà»»[ùûHNMà8†%\⁄õÿ\ôù^[›]][ù[€ÇÇääë]NääàåçãLLMBääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^îûX[àô\öYöYYHà€‹›ô\‹ù[\‹ù€‹öŸY[ô\⁄ŸY»õÿŸYYà€ôBúô[XZ[ö[ô»õÿú»X⁄\⁄[€àÿ\»]ù^[›]][\»€õHôYY»[»»H\⁄õÿ\ôù⁄[à^HôYY][ù[€ãÇÇà»»»⁄]ÿ\»€€\]YãHYYHôXY[€õH\⁄õÿ\ô][ù[€àÿY\ãÇãHHÿY\à\Ÿ\»^\›[ô»›\Xò\ŸK‘ì»ôXY»õ‹éÇàHö\⁄XõHX›]ôHõÿúÿàHö\⁄XõHX›]ôHõÿóÿù^[›]€[ô\ÿãHYYù^[›]][ù[€àù[\ŒÇàH‹[à][Nà›]\»\»õ›ôXŸZ]ôY‹àÿ[òŸ[YàHX›X[ò[YH›ô\àùYŸ]àHX›X[XY[YH›ô\à[ö]X[XY[YBãH\]YH\⁄õÿ\ô\õ»ôYY»][ù[€ò[ô[»⁄›»H]ôH][ù[€Çà€›[ùÇãHYYHõÿà][ù[€ò›[[X\ûHÿ\ôÇãHYYH^H€‹öÿ\⁄õÿ\ôXõHõ‹àù^[›]][ù[€àõ›‹»⁄]ÇàHõÿàXô[àHù^[›]][BàH›]\¬àH][ù[€àôX\€€ÇàHôYúô\⁄X›[€ÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\ÀŸ\⁄õÿ\ô—\⁄õÿ\ô€‹ö‹‹XŸKöúﬁãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ÿ⁄[XH⁄[ôŸHÿ\»XYH[à\»€XŸKÇãHõ»ì»€XﬁHÿ\»⁄[ôŸY[à\»€XŸKÇãH\»\»[ù[ù[€ò[HôXY[€õH[ô\Ÿ\»^\›[ô»XõH‹ò[ùÀ‘ìÀÇãH\ú€€ò[^ôY€‹öŸ\ã‹›\\ö[ù[ô[ù‹õ⁄ôX›[X[òYŸ\à\‹⁄Y€õY[ù»ô[XZ[ÇàYô\úôYôXÿ]\ŸHõ»\õ›ôY\‹⁄Y€õY[ù€›\òŸH^\›»Y]ÇÇà»»»ô^›\¬åKàûX[àô\öYöY\»H\⁄õÿ\ô][ù[€à€›[ù[ô^H€‹ö»][ù[€àXõKÇåãà€€ù[ùYH⁄]Hô^[Ÿ[K‹YŸH€X[ù\][KÇÇãKKBÇà»»[ùûHNM»8†%\⁄õÿ\ô€€\[ûH€€ÿ][Ÿ›YBÇääë]NääàåçãLLMÇääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»\⁄õÿ\ô€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€ÇÇà»»»€€ù^ïH]\›€€\]Y\⁄õÿ\ô€XŸHYY\ôX›ôZX€H\‹⁄Y€õY[ùÀàHô^ë\⁄õÿ\ôŸX›[€àÿ\»^H€€Àù]Tê“UP’TëHåãåÃ^X⁄]Hô\Ÿ\ùô\¬ô[\ﬁYYK[[öŸY\‹⁄Y€õY[ù›\›ŸK⁄X⁄€›][ô\‹⁄Y€õY[ù\›‹ûKàHÿYôBòõ›[ôY€XŸHÿ\»\ôYõ‹ôHHôXY[€õHöY]»ŸàH^\›[ô»€€\[ûHÿ][Ÿ›YKÇÇà»»»⁄]ÿ\»€€\]YãHYYH\⁄õÿ\ô€€\[ûK]€€ÿY\à\⁄[ô»H^\›[ô»€€ÿXõKÇãHŸ\ôXY»[ú⁄YH^\›[ô»]ö\⁄[€ã\ÿ€‹Yì»[ô]][ùXÿ]Y€\ö»⁄Ÿ[Çà[ô[ôÀÇãHYYH€€\[ûH€€ÿ›[[X\ûHÿ\ô⁄›⁄[ô»ö\⁄XõHX›]ôHÿ][Ÿ›YHõ›‹ÀÇãHô\XŸYH€€\[ûK]€€XŸZ€\à⁄]H]ôHôXY[€õHXõH⁄›⁄[ôŒÇàH€€ù[Xô\à[ôò[YBàHÿ]Y€‹ûH[ôúò[ôàH€€ô][€ÇàH›\úô[ùÿ][Ÿ›YHÿÿ][€ÇãHYYôYúô\⁄[ô‹[à€€»[Ÿ[HX›[€úÀÇãHŸ\\ú€€ò[€€»^X⁄]HYô\úôYÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\ÀŸ\⁄õÿ\ô—\⁄õÿ\ô€‹ö‹‹XŸKöúﬁãHSë—ëãõYÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHõ»ÿ⁄[XKZY‹ò][€ãîÀìÀ‹ò[ù]]‹à\õZ\‹⁄[€à⁄[ôŸHÿ\»XYKÇãHH\⁄õÿ\ôŸ\»õ›\ŸH\‹⁄Y€ôY›ÿ»[ôô\à›\›ŸHôXÿ]\ŸH]öY[àô[XZ[ú»HZ[ã]^ÿ][Ÿ›YHXŸZ€\à[ô\àTê“UP’TëHåãåÃÇãHùYH[\ﬁYYK[[öŸY€€À\ú€€ò[€€À⁄X⁄€›][ô›\›ŸHô[XZ[Çà\ò⁄]X›\ôK\ô\Ÿ\ùôYÇÇà»»»ô\öYöXÿ][€ÇãHõŸX›[€àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»ô^›\¬åKàûX[àô\öYöY\»H€€\[ûH€€»›[[X\ûH[ô^H€€»ÿ][Ÿ›YHXõKÇåãàX⁄YHHô^\⁄õÿ\ô€X[ù\€XŸN»\ú€€ò[^ôY€€›\›ŸH[ôõÿÇà\‹⁄Y€õY[ù»›[ô\]Z\ôH[à\õ›ôYòX⁄Ÿ[ô€›\òŸKÇÇãKKBÇà»»[ùûHNN8†%ôZX€H\‹⁄Y€õY[ù‹ö]H€€ùõ€¬Çääë]NääàåçãLLMÇääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»ôZX€\»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€Çääîö\⁄»€\‹⁄YöXÿ][€éääàQ“8†%ëUíQU»ëTURTëQÇà»»»Y⁄Tö\⁄»ô]öY]»õY¬ï\»Z[\›€ôHY»]][ùXÿ]Y—P’TíUHQíSëTòõŸX›[€à‹ö]Hî‹»]õ]]]HôZX€KX\‹⁄Y€õY[ù\›‹ûKàX›]ôH\‹⁄Y€õY[ù»[€»YôôX›BúŸ\ùô\ãY\ö]ôYôZX€H€ò\⁄›\ŸY⁄[à‹[ö[ô»[à[ùô[ù‹ûHÿ\ùàô]öY]»\¬ú€XŸHYÿZ[àôYõ‹ôH⁄Y[ö[ô»ôZX€K[\ﬁYYK›\›ŸK‹à[ùô[ù‹ûH€‹öŸõ›‹ÀÇÇëù]\ôHô]öY]»⁄›[‹X⁄YöXÿ[H^[Z[ôNÇãHYôôX›]ôHÿ[ó€X[òYŸW›ôZX€\ÿ[ôõ‹òŸ[Y[ùãH[\ﬁYYH]ö\⁄[€ã‹ôXY\ÿ€‹H[ôõ‹òŸ[Y[ùãH€€ò›\úô[ù\‹⁄Y€õY[ù[ôò[úŸô\àôZ]ö[‹ÇãH€ôKXX›]ôK]ôZX€K\\ã]\Ÿ\à[ö\]Y[ô\‹»ôZ]ö[‹ÇãH⁄]\à][\HX›]ôH\Ÿ\ú»\àôZX€Hô[XZ[ú»H[ù[ôY[Ÿ[ãH\‹⁄Y€õY[ù‹ô[X\ŸH]Y]€€\][ô\‹¬ãHÿ\ù[‹[àôZX€H€ò\⁄›ôZ]ö[‹àYù\à\‹⁄Y€ãò[úŸô\ã[ôô[X\ŸBÇà»»»⁄]ÿ\»€€\]YãHYY\‹⁄Y€ó›ôZX€W›◊›\Ÿ\ä›ôZX€W⁄Y›\Ÿ\ó⁄Y‹ôX\€€äXÇãHYYô[X\ŸW›ôZX€Wÿ\‹⁄Y€õY[ù
ÿ\‹⁄Y€õY[ù⁄Y‹ôX\€€äXÇãHõ›î‹ŒÇàHô\]Z\ôH[à]][ùXÿ]Y€\ö»›XöôX›àHô\]Z\ôH[àX›]ôH\õZ\‹⁄[€àõ›»[ôYôôX›]ôHÿ[ó€X[òYŸW›ôZX€\ÿàHô\]Z\ôHHõ€ãY[\H]Y]ôX\€€ÇàH\ŸH—P’TíUHQíSëTò⁄]ö^YŸX\ò⁄‹]HXõXÀ◊›[\àHô]õ⁄ŸHPìPÿ[ô[õ€ò^X›][€ÇàH‹ò[ù^X›][€à€õH»]][ùXÿ]YàH‹ö]H⁄[ôŸW€Ÿ‹ÿ]Y]ôX€‹ô»õ‹à]]][€ú¬ãH\‹⁄Y€õY[ùò[Y]\»[àX›]ôHôZX€H[ô[àX›]ôH[\ﬁYYH[ú⁄YHBàÿ[\â‹»\õ›ôY]ö\⁄[€ã‹ôXYÿ€‹KÇãH\‹⁄Y€ö[ô»H\Ÿ\à⁄»[ôXYH\»[àX›]ôHôZX€H€‹Ÿ\»Hö[‹àõ›»ôYõ‹ôBà[úŸ\ù[ô»Hô]»\‹⁄Y€õY[ùÇãHô[X\ŸH[ô»HŸ[X›YX›]ôH\‹⁄Y€õY[ù⁄]›][][ô»\›‹ûKÇãHYYôZX€H\‹⁄Y€õY[ù€€ùõ€»õ‹à[\ﬁYYHŸ[X›[€ã\‹⁄Y€ã›ò[úŸô\ãàô[X\ŸKô\]Z\ôYôX\€€úÀ›XÿŸ\‹»›]\À[ô\úõ‹à›]\ÀÇÇà»»»õŸX›[€àZY‹ò][€ÇãHÿÿ[ö[NÇà›\Xò\ŸK€ZY‹ò][€úÀÃåçåMÃÃLåW›ôZX€Wÿ\‹⁄Y€õY[ù›‹ö]\Àú‹[ãHõŸX›[€àZY‹ò][€éÇàåçåMÃÃLåL◊›ôZX€Wÿ\‹⁄Y€õY[ù›‹ö]\ÿãHõ⁄ôX›ÇàŸ[Ÿﬁ\€õ›Zÿô[ôöŸöò€òÇà»»»ô\öYöXÿ][€ÇãHõŸX›[€àZY‹ò][€à\Xÿ][€à›XÿŸYYYÇãHõŸX›[€àZY‹ò][€à\›‹ûH[ò€Y\»åçåMÃÃLåLÿÇãHô\öYöYYù[ò›[€à⁄Y€ò]\ô\ŒÇàH\‹⁄Y€ó›ôZX€W›◊›\Ÿ\ä]ZY^^
XàHô[X\ŸW›ôZX€Wÿ\‹⁄Y€õY[ù
öY⁄[ù^
XãHô\öYöYYõ›ù[ò›[€ú»\ôH—P’TíUHQíSëTò⁄]ö^YŸX\ò⁄]ÀÇãHô\öYöYY[õ€àVP’UHHò[ŸX[ô]][ùXÿ]YVP’UHHùYXÇãHŸX›\ö]H[ô\ôõ‹õX[òŸHYö\€‹ú»Ÿ\ôHô\ù[ãÇãHõ»\›\‹⁄Y€õY[ù‹àô[X\ŸH]]][€àÿ\»^X›]Y[àõŸX›[€ãÇãHõŸX›[€àúõ€ùY[ôùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»Yö\€‹à€€ù^ïHõ⁄ôX›\»ôKY^\›[ô»ŸX›\ö]H[ô\ôõ‹õX[òŸHYö\€‹àö[ô[ô‹Àö[ò€Y[ô»^‹ŸY\ÿ⁄[XK‘ìÀŸX›\ö]KYYö[ô\ã]öY]À]]XõK\ŸX\ò⁄\][ôîì»\ôõ‹õX[òŸHö[ô[ô‹Àà^HŸ\ôHô\Ÿ[ùôYõ‹ôH\»ZY‹ò][€à[ôŸ\ôHõ›ô^[ôY‹àô[YYX]YûH\»€XŸKàHô]»]][ùXÿ]Y‹ö]Hî‹»\ôBö[ù[ù[€ò[ù]]\›ô[XZ[à€àHY⁄\ö\⁄»ô]öY]»\›ôXÿ]\ŸH]][ùXÿ]Yò—P’TíUHQíSëTòù[ò›[€ú»\ôH›\ôòXŸYûH›\Xò\ŸHYö\€‹ú»õ‹àX[ùX[ò\‹Ÿ\‹€Y[ùÇÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À›ôZX€\À’ôZX€\’€‹ö‹‹XŸKöúﬁãH›\Xò\ŸK€ZY‹ò][€úÀÃåçåMÃÃLåW›ôZX€Wÿ\‹⁄Y€õY[ù›‹ö]\Àú‹[ãHSë—ëãõYÇà»»»ô^›\¬åKàûX[à]ôK]\›»\‹⁄Y€ãò[úŸô\ã[ôô[X\ŸH\⁄[ô»€€ùõ€YôX€‹ôÀÇåãà€€ôö\õH\⁄õÿ\ô^HôZX€\»[ô[ùô[ù‹ûHÿ\ù[‹[àôYõX›H^X›YàX›]ôH\‹⁄Y€õY[ùYù\àXX⁄X›[€ãÇåÀàŸY\\»Z[\›€ôHõYŸŸYQ“íT“»[ù[]]ôHô]öY]»\»€€\]KÇÇãKKBÇà»»[ùûHNNHHõÿú»ö[ò[ò⁄X[»€‹›[ô”’àô]ô[ùYH‹]Çääë]NääàåçãLLå¬ääï\]YûNääà€Ÿ^ääî\ŸNääàõ‹ùÿ]HHå»õÿú»ö[ò[ò⁄X[»€X[ù\ääîŸ\‹⁄[€à\Nääà[\[Y[ù][€Çääîö\⁄»€\‹⁄YöXÿ][€éääàQQUSHHÿ⁄[XKXòX⁄ŸYö[ò[ò⁄X[RHôYö[ô[Y[ùÇà»»»€€ù^îûX[àô]öY]ŸYHõÿú»ö[ò[ò⁄X[»Xà[ô€\öYöYY]H€‹›XõH⁄›[ùòX⁄»KYòX⁄[ô»ùYŸ]ÿ€‹›õ‹ôXÿ\›À⁄[Hö[[ô»ô]ô[ùYH⁄›[õ€›»Bîÿ⁄Y[HŸàò[Y\»ò]\à[àô][ô[ô»ô]ö\ŸYùYŸ]\]X[»ö[XõBò€€ùòX›ò[YKÇÇà»»»⁄]ÿ\»€€\]YãHô[ò[YY€‹›X€€ùõ€Xô[»[àHö[ò[ò⁄X[»XéÇàH‹öY⁄[ò[\›[X]BàHX›X[€‹›¬àH€€[Z]Y€‹›¬àH[€ùHõ‹ôXÿ\›àHö[ò[õ‹ôXÿ\›ãHô\XŸYH€õ‹ôXÿ\›Y\ô[XZ[ô\àô\Ÿ[ù][€à⁄]ÇàHô[XZ[ö[ô»ùYŸ]Hô]ö\ŸYùYŸ]Z[ù\»X›X[€‹›¬àHõ‹ôXÿ\›Yô[XZ[ö[ô»ùYŸ]Hô]ö\ŸYùYŸ]Z[ù\»ö[ò[õ‹ôXÿ\›ãHYYHŸ\\ò]Hÿ⁄Y[HŸàò[Y\»ô]ô[ùYHŸX›[€à[ú⁄YHö[ò[ò⁄X[ÀÇãHYY”’àô]ô[ùYH[ôH›\‹ùõ‹éÇàH”’à[ôBàH\ÿ‹ö\[€ÇàHÿ⁄Y[Yò[YBàH\õ›ôY⁄[ôŸ\¬àHô]ö\ŸY€€ùòX›ò[YBàHö[Y»]BàHô[XZ[ö[ô»»ö[àH\òŸ[ùö[YãHYYõ⁄ôX›[]ô[›[[X\ûHÿ\ô»õ‹àô]ö\ŸY€€ùòX›ö[Y»]K[ôàõ⁄ôX›Y‹õ‹‹»õŸö]€X\ô⁄[ãÇãHYYõÿó‹ô]ô[ùYW€[ô\ÿ\»Hô]»\ú⁄\›Y”’ã‹ô]ô[ùYHXõKÇãHô]\ŸY^\›[ô»ö[ò[ò⁄X[ÿ]\ŒÇàHôXYàÿ[ó›öY]◊Ÿö[ò[ò⁄X[ÿàH‹ö]Nàÿ[óÿ\õ›ôWÿùYŸ]ãHŸ\ô]ô[ùYH[ô\»[õö[ôÀÿö[[ô»ö\⁄Xö[]H€õN»õ»[ùõ⁄XŸH‹ôX][€ãàXÿ€›[ù[ô»‹›^[Y[ù€€X›[€ãÀ‹à^\õò[Xÿ€›[ù[ô»ﬁ[òÀÇãHYYHö]Hÿÿ[\ô]öY]»ÿX⁄K⁄‹›€€ôöY›\ò][€à€»õ‹õﬁXòX⁄ŸYà€‹ö‹‹XŸ\»ÿ[à\ŸH[à^\õò[ÿX⁄H[ô⁄[àî»\»^X⁄]H€€ôöY›\ôYàHõŸX›[€à‹›ò[YHÿ[àôH\ŸYõ‹àÿÿ[€\öÀX€€\]XõHô]öY]ÀÇÇà»»»õŸX›[€àZY‹ò][€ÇãHÿÿ[ö[NÇà›\Xò\ŸK€ZY‹ò][€úÀÃåçååÃLML⁄õÿó‹ô]ô[ùYW€[ô\◊Ÿõ›[ô][€ãú‹[ãHõŸX›[€àZY‹ò][€éÇàåçååÃMåéM◊⁄õÿó‹ô]ô[ùYW€[ô\◊Ÿõ›[ô][€òãHõ⁄ôX›ÇàŸ[Ÿﬁ\€õ›Zÿô[ôöŸöò€òÇà»»»€ŸH»ö[H⁄[ôŸ\¬ãH‹òÀ€[Ÿ[\À⁄õÿúÀ“õÿú’€‹ö‹‹XŸKöúﬁãH‹òÀ‹›[\Àÿò\ŸKò‹‹ÿãHö]Kò€€ôöYÀöúÿãH›\Xò\ŸK€ZY‹ò][€úÀÃåçååÃLML⁄õÿó‹ô]ô[ùYW€[ô\◊Ÿõ›[ô][€ãú‹[ãHSë—ëãõYÇà»»»ô\öYöXÿ][€ÇãHõŸX›[€àZY‹ò][€à\Xÿ][€à›XÿŸYYYÇãHõŸX›[€àõÿó‹ô]ô[ùYW€[ô\ÿ€€[[ú»Ÿ\ôHô\öYöYYÇãHõŸX›[€àZY‹ò][€à\›‹ûH[ò€Y\»åçååÃMåéMÿÇãHúHù[àùZ[\‹ŸYÇãH⁄]YôàKX⁄X⁄ÿ\‹ŸYÇÇà»»»⁄]€Ÿ^ôYY»»€õ›¬ãHHô]»”’àŸX›[€à\»[Xô\ò][HŸ\\ò]Húõ€H€‹›X€ŸHùYŸ][ô\ÀÇãHö[Y»]X\»ô]ô[ùYHö[Yõ›ÿ\⁄€€X›YÇãHõ⁄ôX›Y‹õ‹‹»õŸö]\Ÿ\»ô]ö\ŸY€€ùòX›ò[YHZ[ù\»ö[ò[õ‹ôXÿ\›ÇãH\õ›ôY⁄[ôŸ\»€à”’à[ô\»\ôHX[ùX[H[ù\ôYõ‹àõ›Œ»]]€X]X¬àX\[ô»úõ€H⁄[ôŸH‹ô\ú»»”’à[ô\»ô[XZ[ú»Hù]\ôH\⁄Y€à›\ÇãHõŸX›[€à[ôXYHYÿ⁄Y[W€Ÿó›ò[Y\◊ÿ[[›[ù€àõÿóÿùYŸ]€[ô\ÿàúõ€HZY‹ò][€àåçååååMÕÿ»\»€XŸHX]ô\»]€€[[à[€ôH[ôàY»Ÿ\\ò]Hô]ô[ùYH[ô\»õ‹àö[[ô»õŸ‹ô\‹ÀÇÇà»»»ô^›\¬åKàûX[à\›»Y[ôÀŸY][ô»”’à[ô\»[ô€€ôö\õ\»Hô]ô[ùYH›[[X\ûHX]ÇåãàX⁄YH]\à⁄]\à⁄[ôŸH‹ô\ú»⁄›[X\\ôX›H»”’à[ô\ÀÇÇãKKBÇà»»[ùûHåH8†%⁄[ôŸH‹ô\à€‹öŸõ›»[ô[[]]XõHö[ò[ò⁄X[‹›[ô»YŸ\ÇÇî›]\ŒàQ“íT“»»ô]öY]»Yù\à\›[ôÀàôXò\ŸY€ù»›\úô[ùXZ[àôYõ‹ôHô[X\ŸKÇÇãHYYö]ôH[ô\[ô[ù⁄[ôŸH‹ô\à\õZ\‹⁄[€úÀ[ö]X[HZ\úõ‹ö[ô»YôôX›]ôHÿ[óÿ\õ›ôWÿùYŸ]XÿŸ\‹ÀÇãHYYòYù›XõZ]^‹ù⁄Y€ôYYÿ›[Y[ùô\öYöXÿ][€ã]€ZX»\õ›ò[‹‹›[ôÀ[ô€€ùõ€Yô]ö\⁄[€àî‹ÀÇãHYY[[]]XõHY[\›[ùö[ò[ò⁄X[‹›[ô»ôX€‹ôŒ»ö[ò[ò⁄X[»⁄[ôŸ\»õ›»\ö]ô\»úõ€HX[ùX[⁄[ôŸ\»\»\õ›ôY‹›[ô»[\ÀÇãHYYHYXÿ]Y⁄[ôŸH‹ô\à€‹ö‹‹XŸH[ôõÿã[›€ôY⁄Y€ôYYÿ›[Y[ù[öÿYŸKÇãH\õ›ôY⁄[ôŸH‹ô\ú»[ô⁄Y€ôYÿ›[Y[ù»\ôHÿ⁄ŸY»ô]ö\⁄[€ú»‹›€õHZ\à[KÇãH^\›[ô»X›]ôH⁄[ôŸH‹ô\ú»Ÿ\ôH^X⁄]H]]‹ö^ôY\»\›]H[ô\ôH€ŸùX\ò⁄]ôYûHHZY‹ò][€à⁄][à]Y]ôX\€€ãÇãHHZY‹ò][€àô\Ÿ\ùô\»›\úô[ù\›[X]H[ôYÿXﬁH⁄[ôŸH‹ô\àÿ›[Y[ù€XﬁHúò[ò⁄\»⁄[HY[ô»H⁄Y€ôYõÿãYÿ›[Y[ù]Ç