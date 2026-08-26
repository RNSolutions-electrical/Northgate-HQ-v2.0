# Northgate HQ v3 - Cross-Machine Handoff

Last updated: 2026-08-26

## One-time correction

Audit note: **developer level approval for one-time correction to reinstate lost functionality**

The Billing/SOV work completed on another machine was recovered from unreachable commits
`3f030ce` and `9af0923` and preserved on branch `recovery/billing-sov-workflow`.
Those commits contain the original `job_revenue_lines` foundation and the Financials/SOV
split. The current `main` branch already contains that SOV implementation, rendered as the
Schedule of Values section inside Financials. Do not delete the recovery branch until the
separate Billing restoration is verified in production.

## Current main branch

- Current Jobs work is on `main`.
- Change Order .CO allocation repairs: `919ad9f`, `c1be128`, `6c6bd53`.
- Change Order save permission/status repairs: `cdc899f`, `b2d531b`.
- Recovered SOV allocation workflow: `4daa485`.
- Document category filtering: `e1a0f06`.

## Pending restoration

1. Create a dedicated Billing tab and move SOV/Pay App work out of Financials.
2. Add Change Order Documents actions: download pre-filled form, upload signed form,
   and download/view the uploaded signed copy.
3. Block approval until a signed Change Order document exists; drafts/proposed records
   remain allowed without it.
4. Keep compact Change Order actions: Edit, Archive, Documents, Update SOV when approved.

## Cross-machine rule

Before changing Jobs on any machine: pull `main`, read this file, confirm the current
commit, and preserve uncommitted work with a named branch/commit before switching machines.
Do not use a force push or reset to reconcile work from another machine.
