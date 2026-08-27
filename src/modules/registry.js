import {
  BarChart3,
  Activity,
  Boxes,
  BriefcaseBusiness,
  Calculator,
  CircleDollarSign,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Sparkles,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';

/**
 * The module registry. One entry per top-level workspace.
 *
 * This is the single source for routing AND navigation, so a module cannot
 * appear in the nav without a route or vice versa.
 *
 * PERMISSIONS
 * `requires`    — every listed flag must be true
 * `requiresAny` — at least one listed flag must be true
 * neither       — any authenticated user
 *
 * Per 04_PRESENTATION_CONTRACT.md, an unauthorized module is OMITTED from the
 * nav array and its route redirects. It is never rendered disabled.
 *
 * `status: 'stub'` means the screen has not been migrated from v2 yet. Swap to
 * 'live' as each module lands. Nothing else needs to change.
 *
 * NOTE FOR RYAN — these gates are starting positions drawn from ARCHITECTURE
 * Section 17 and Section 17a. Confirm before launch:
 *   - jobs is ungated for read, per HANDOFF Entry 146 Decision 1 (any
 *     authenticated user may open any Job; financial values stay gated)
 *   - accounting gates on canViewFinancials
 *   - inventory gates on either inventory flag, since Section 17a keeps
 *     inventory cost open within authorized inventory scope
 */
export const MODULES = [
  {
    key: 'dashboard',
    path: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    status: 'live',
    description: 'Operational pulse across divisions.',
  },
  {
    key: 'inventory',
    path: '/inventory',
    label: 'Inventory',
    icon: Boxes,
    requiresAny: ['canInventoryTransactions', 'canManageInventory'],
    status: 'live',
    description: 'Catalogue, storage, cart, checkout, counts, and the ledger.',
  },
  {
    key: 'jobs',
    path: '/jobs',
    label: 'Jobs',
    icon: BriefcaseBusiness,
    status: 'live',
    description: 'Job register, budgets, schedule, materials, and buyout.',
  },
  {
    key: 'estimates',
    path: '/estimates',
    label: 'Estimates',
    icon: Calculator,
    requiresAny: ['canEstimate', 'canApproveEstimates'],
    status: 'live',
    description: 'Proposals, revisions, and approval snapshots.',
  },
  {
    key: 'employees',
    path: '/employees',
    label: 'Employees',
    icon: Users,
    requires: ['canManageEmployees'],
    status: 'live',
    description: 'Directory, credentials, and assignments.',
  },
  {
    key: 'vehicles',
    path: '/vehicles',
    label: 'Vehicles',
    icon: Truck,
    requires: ['canManageVehicles'],
    status: 'live',
    description: 'Fleet register, assignments, and vehicle stock.',
  },
  {
    key: 'tools',
    path: '/tools',
    label: 'Tools',
    icon: Wrench,
    requires: ['canManageTools'],
    status: 'live',
    description: 'Tool catalogue and custody.',
  },
  {
    key: 'documents',
    path: '/documents',
    label: 'Documents',
    icon: FolderOpen,
    status: 'live',
    description: 'Job documents, versions, and required-document queues.',
  },
  {
    key: 'reports',
    path: '/reports',
    label: 'Reports',
    icon: BarChart3,
    requires: ['canViewReports'],
    status: 'live',
    description: 'Read-only views over authoritative records.',
  },
  {
    key: 'accounting',
    path: '/accounting',
    label: 'Accounting',
    icon: CircleDollarSign,
    requires: ['canViewFinancials'],
    status: 'live',
    description: 'Review queue, pricing controls, and approved exports.',
  },
  {
    key: 'silas',
    path: '/silas',
    label: 'Silas',
    icon: Sparkles,
    status: 'live',
    description: 'Permission-aware assistant.',
  },
  {
    key: 'service-performance',
    path: '/service-performance',
    label: 'Service Performance',
    icon: Activity,
    requiresAddon: 'service_performance',
    status: 'live',
    description: 'Electrical service-call cost, margin, billing, and collection performance.',
  },
  {
    key: 'developer',
    path: '/developer',
    label: 'Developer',
    icon: Settings,
    requires: ['canAccessDeveloper'],
    status: 'live',
    description: 'Accounts, effective access, audit, and diagnostics.',
  },
];

/** Same fail-closed predicate the DataTable uses: `=== true` only. */
export function isModulePermitted(module, permissions) {
  if (module.requiresAddon && permissions?.canAccessAddon?.(module.requiresAddon) !== true) return false;
  if (module.requires?.length) {
    if (!module.requires.every((flag) => permissions?.[flag] === true)) return false;
  }
  if (module.requiresAny?.length) {
    if (!module.requiresAny.some((flag) => permissions?.[flag] === true)) return false;
  }
  return true;
}

export function permittedModules(permissions) {
  return MODULES.filter((module) => isModulePermitted(module, permissions));
}

export function findModule(key) {
  return MODULES.find((module) => module.key === key) ?? null;
}
