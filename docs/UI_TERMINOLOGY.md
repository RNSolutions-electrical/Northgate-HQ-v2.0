# Northgate HQ vocabulary

This is the shared vocabulary for Northgate HQ users and future Codex work.
The source registry for developer labels is `src/config/uiTerminology.js`.

## UI hierarchy

```text
Northgate HQ
└── Page
    └── Module
        └── Function
```

Cards are informational display elements inside Pages and Modules. A Card may
summarize the result of a workflow, but is not itself the name for a substantial
interactive workflow.

- **Page** — a top-level destination, such as Jobs, Material Inventory, or Developer.
- **Module** — a substantial related capability, such as Project Financials or Developer Display Controls.
- **Function** — an individual action, such as Import Cost Report or Add Change Order.
- **Card** — a compact informational display, such as Project Financial Summary.

Developer users can enable **Show UI Terminology Labels** in the Developer
Display Controls Module. Labels use the form `TYPE · Canonical Name`.

## Organization and project accounting

- **Department** is Northgate's organizational scope: Electrical, Construction, or Admin.
- **Division** is a project's cost-code grouping: for example, Division 01 — General Requirements or Division 16 — Electrical.
- **Cost Code** belongs to a project Division: for example, `16.12 — Light Fixtures`.
- **Change Order cost code** is represented as `##.CO — Division ## — Name — Change Order`.

Legacy database columns and permission helper names still use `division` for a
Department. This is intentional compatibility terminology only; new user-facing
copy must say Department. `job_budget_divisions` remains the project Division
source of truth.

## Authority and access

Roles establish defaults, in increasing authority:

```text
User → Supervisor → Manager → Director → Developer
```

Roles do not replace granular permissions. Effective access is:

```text
Department + Role defaults + individual permission overrides
```

Developer is technical access only. Director is the highest normal operational
role and is not a synonym for Developer.

Project financial permissions are explicit:

- **Can View Asset Financials** — operational asset values (material, tools, vehicles).
- **Can View Project Financials** — job budgets, actuals, committed cost, forecasts, and cost-code performance.
- **Can View Protected Project Financials** — protected budget rows and totals, including OH&P/fee or any row explicitly marked protected.

Protected project lines are enforced by Supabase RLS. A user without protected
access does not receive protected rows, their change-order allocations/postings,
or totals calculated from them.

## Navigation

- **Inventory** groups Material Inventory and Tool Inventory.
- **Add-On Tools** groups enabled optional features, currently Service Scorecard.
- Vehicles remains its own Page.

Navigation grouping does not create new routes or new permissions; it presents
the existing protected Pages more clearly.
