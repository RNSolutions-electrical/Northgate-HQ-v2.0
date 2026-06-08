import { useAuth, useUser } from '@clerk/clerk-react';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

const DEFAULT_PERMISSIONS = Object.freeze({
  can_access_developer: false,
  can_manage_users: false,
  can_view_reports: false,
  can_edit_catalog: false,
  can_manage_employees: false,
  can_manage_vehicles: false,
  can_manage_tools: false,
  can_manage_inventory: false,
  can_inventory_transactions: false,
  can_estimate: false,
  can_approve_estimates: false,
  can_create_jobs: false,
  can_manage_jobs: false,
  can_approve_budget: false,
  can_view_financials: false,
  can_field_access: false,
  can_archive_records: false,
  can_manage_change_orders: false,
});

const ROLE_DEFAULTS = Object.freeze({
  Developer: {
    can_access_developer: true,
    can_manage_users: true,
    can_view_reports: true,
    can_edit_catalog: true,
    can_manage_employees: true,
    can_manage_vehicles: true,
    can_manage_tools: true,
    can_manage_inventory: true,
    can_inventory_transactions: true,
    can_estimate: true,
    can_approve_estimates: true,
    can_create_jobs: true,
    can_manage_jobs: true,
    can_approve_budget: true,
    can_view_financials: true,
    can_field_access: true,
    can_archive_records: true,
    can_manage_change_orders: true,
  },
  Administrator: {
    can_manage_users: true,
    can_view_reports: true,
    can_edit_catalog: true,
    can_manage_employees: true,
    can_manage_vehicles: true,
    can_manage_tools: true,
    can_manage_inventory: true,
    can_inventory_transactions: true,
    can_estimate: true,
    can_approve_estimates: true,
    can_create_jobs: true,
    can_manage_jobs: true,
    can_approve_budget: true,
    can_view_financials: true,
    can_field_access: true,
    can_archive_records: true,
    can_manage_change_orders: true,
  },
  'Project Manager': {
    can_view_reports: true,
    can_manage_inventory: true,
    can_inventory_transactions: true,
    can_create_jobs: true,
    can_manage_jobs: true,
    can_approve_budget: true,
    can_field_access: true,
    can_manage_change_orders: true,
  },
  Estimator: {
    can_view_reports: true,
    can_estimate: true,
    can_field_access: true,
  },
  'Field Supervisor': {
    can_inventory_transactions: true,
    can_field_access: true,
  },
  'User': {
    can_field_access: true,
  },
});

function toCamelCasePermissions(flags) {
  return {
    canAccessDeveloper: flags.can_access_developer,
    canManageUsers: flags.can_manage_users,
    canViewReports: flags.can_view_reports,
    canEditCatalog: flags.can_edit_catalog,
    canManageEmployees: flags.can_manage_employees,
    canManageVehicles: flags.can_manage_vehicles,
    canManageTools: flags.can_manage_tools,
    canManageInventory: flags.can_manage_inventory,
    canInventoryTransactions: flags.can_inventory_transactions,
    canEstimate: flags.can_estimate,
    canApproveEstimates: flags.can_approve_estimates,
    canCreateJobs: flags.can_create_jobs,
    canManageJobs: flags.can_manage_jobs,
    canApproveBudget: flags.can_approve_budget,
    canViewFinancials: flags.can_view_financials,
    canFieldAccess: flags.can_field_access,
    canArchiveRecords: flags.can_archive_records,
    canManageChangeOrders: flags.can_manage_change_orders,
  };
}

function normalizePermissionRow(row) {
  if (!row) {
    return {
      role: 'User',
      division: null,
      permissions: DEFAULT_PERMISSIONS,
      source: 'default-deny',
    };
  }

  const role = row.role ?? 'User';
  const roleDefaults = ROLE_DEFAULTS[role] ?? DEFAULT_PERMISSIONS;
  const overrides = row.permission_overrides ?? {};

  return {
    role,
    division: row.division ?? null,
    permissions: {
      ...DEFAULT_PERMISSIONS,
      ...roleDefaults,
      ...overrides,
    },
    source: 'supabase',
  };
}

export function usePermissions() {
  const { user, isLoaded: isUserLoaded, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [state, setState] = useState({
    isLoading: true,
    error: null,
    role: 'User',
    division: null,
    permissions: DEFAULT_PERMISSIONS,
    source: 'loading',
  });

  useEffect(() => {
    let isMounted = true;

    async function loadPermissions() {
      if (!isUserLoaded) {
        return;
      }

      if (!isSignedIn || !user?.id) {
        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            role: 'User',
            division: null,
            permissions: DEFAULT_PERMISSIONS,
            source: 'signed-out',
          });
        }
        return;
      }

      try {
        const accessToken = await getToken({ template: 'supabase' });
        const supabase = createSupabaseClient(accessToken);
        const displayName = user.fullName || user.primaryEmailAddress?.emailAddress || user.id;

        const { data, error } = await supabase.rpc('get_or_create_user_permissions', {
          p_clerk_user_id: user.id,
          p_display_name: displayName,
          p_email: user.primaryEmailAddress?.emailAddress ?? null,
        });

        if (error) {
          throw error;
        }

        const normalized = normalizePermissionRow(Array.isArray(data) ? data[0] : data);

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            ...normalized,
          });
        }
      } catch (error) {
        console.error('Failed to load server-backed permissions', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            role: 'User',
            division: null,
            permissions: DEFAULT_PERMISSIONS,
            source: 'error-default-deny',
          });
        }
      }
    }

    loadPermissions();

    return () => {
      isMounted = false;
    };
  }, [getToken, isSignedIn, isUserLoaded, user]);

  const camelCasePermissions = useMemo(
    () => toCamelCasePermissions(state.permissions),
    [state.permissions],
  );

  return {
    isLoaded: isUserLoaded && !state.isLoading,
    isLoading: state.isLoading,
    isSignedIn,
    userId: user?.id ?? null,
    role: state.role,
    division: state.division,
    permissions: state.permissions,
    permissionSource: state.source,
    error: state.error,
    ...camelCasePermissions,
  };
}
