/**
 * Migrated module screens.
 *
 * THIS FILE IS THE MIGRATION PROGRESS BAR.
 *
 * Empty means every module still renders the "not yet migrated" placeholder
 * and v2.0 remains the working app. Each time a module is ported, add one line
 * here and set its `status` to 'live' in registry.js. Nothing else in the app
 * needs to change, and a half-finished module can never leak into the nav.
 *
 * Port order (see MIGRATION_MAP.md) — cheapest and lowest-risk first:
 *   1. dashboard    5. vehicles     9. estimates
 *   2. developer    6. tools       10. jobs
 *   3. reports      7. employees   11. inventory
 *   4. documents    8. silas       12. accounting
 *
 * Inventory is deliberately late. It carries cart-open controls, checkout
 * finalization, overdraw and concurrency locks, and the count-correction path
 * — the densest invariant load in the system. Port it once the pattern is
 * proven, not while it is being invented.
 *
 * Example once Dashboard lands:
 *
 *   import { DashboardWorkspace } from './dashboard/DashboardWorkspace.jsx';
 *   export const MODULE_SCREENS = { dashboard: DashboardWorkspace };
 */
import { DashboardWorkspace } from './dashboard/DashboardWorkspace.jsx';
import { DeveloperWorkspace } from './developer/DeveloperWorkspace.jsx';
import { DocumentsWorkspace } from './documents/DocumentsWorkspace.jsx';
import { EmployeesWorkspace } from './employees/EmployeesWorkspace.jsx';
import { ReportsWorkspace } from './reports/ReportsWorkspace.jsx';
import { ToolsWorkspace } from './tools/ToolsWorkspace.jsx';
import { VehiclesWorkspace } from './vehicles/VehiclesWorkspace.jsx';

export const MODULE_SCREENS = {
  dashboard: DashboardWorkspace,
  developer: DeveloperWorkspace,
  documents: DocumentsWorkspace,
  employees: EmployeesWorkspace,
  reports: ReportsWorkspace,
  tools: ToolsWorkspace,
  vehicles: VehiclesWorkspace,
};
