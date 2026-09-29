# Backlog

## Inventory usability — Production-targeted UI slice (September 29, 2026)

Sync marker: `INVENTORY-UI-20260929-001` on `Ryan_Northgate`.
This slice is being prepared on `release/production-demo-candidate-20260923`;
it is **not a Production deployment** and has no schema or permission changes.

- Inventory and Full Catalogue are separate primary views with keyword search,
  four-level location filtering for stocked inventory, and Size / Category /
  Sub Category / Sub Category 2 filters. Inventory Management's existing count
  sheet has the same location selectors; individual count writes are unchanged.
- Stock Reviews shows a pending count when the authorized read returns one.
- Export offers full catalogue, blank count, current inventory, and valuation
  CSV sheets; the latter three can be scoped to unit, shelf, bay, or bin.
  Unknown quantities and unconfirmed prices stay blank in valuation exports.
- New-material entry has an editable suggested catalogue number and a helper.
  Category/size hints currently shape the code only; they are **not persisted**
  as classification fields by the existing catalogue save RPC.

### Next, higher-effort Inventory slice

Define and implement the Inventory Management permission override and server
authorization, draft/bulk edit session, one shared reason and atomic save,
catalogue code and unit changes with safeguards, full quantity adjustment
history (timestamped records, not date-named columns/tables), and safe reversal.
Persist catalogue taxonomy fields only after designing and testing the save
path. Do not mistake the new UI label for a completed bulk-management workflow.
Use the existing audit ledger and transaction boundaries; verify no Production
balance or history is overwritten. Owner will switch to higher effort before
this backend work begins.

## Latest Exploration intake — September 28, 2026

[Reconciled prompts and plans](planning/EXPLORATION_INTAKE_20260928.md) now
preserve the CO revamp, automated material-price monitoring and ARC ED education.
Both complete source prompts are archived under `docs/planning/sources/`.
CO work already exists on Staging with remaining gates; price monitoring and
ARC ED are planned, not implemented. No application changes are authorized by
this intake. Mode: Exploration. Production remains v0.5.2.

The broader cross-machine queue lives on the **staging branch** in
[docs/ROADMAP.md](https://github.com/RNSolutions-electrical/Northgate-HQ-v2.0/blob/staging/docs/ROADMAP.md).
Read it before starting new work; this older main backlog is not the complete
current queue. Do not merge Staging application code merely to synchronize docs.
Sync: `COMPASS-ROADMAP-20260928-002`, 2026-09-28 16:01 EDT, `Ryan_Northgate`.

## Recovery / weekly backups — owner deferred September 16, 2026

Revisit database plus Storage-file recovery, offsite destination, retention,
costs, alerting and a restore drill when Ryan is ready. Do not schedule, export,
purchase or restore anything as part of the pending Inventory/Documents release.
Existing per-object permanent-deletion backup safeguards remain in place.
