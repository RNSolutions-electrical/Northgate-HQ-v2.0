import { useAuth, useUser } from '@clerk/clerk-react';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseClient } from '../services/supabaseClient.js';

const DENY_ALL = Object.freeze({
  can_access_developer: false,
  can_manage_users: false,
  can_view_reports: false,
  can_edit_catalog: false,
  can_manage_employees: false,
  can_manage_vehicles: false,
  can_manage_tools: false,
  can_manage_inventory: false,
  can_inventory_transactions: false,
  can_view_all_divisions: false,
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

function camel(flags) {
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
    canViewAllDivisions: flags.can_view_all_divisions,
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

function normalize(row) {
  if (!row) {
    return { role: 'User', division: null, permissions: DENY_ALL, source: 'default-deny' };
  }

  return {
    role: row.role ?? 'User',
    division: row.division ?? null,
    permissions: { ...DENY_ALL, ...(row.effective_permissions ?? {}) },
    source: 'server',
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
    permissions: DENY_ALL,
    source: 'loading',
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!isUserLoaded) return;

      if (!isSignedIn || !user?.id) {
        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            role: 'User',
            division: null,
            permissions: DENY_ALL,
            source: 'signed-out',
          });
        }
        return;
      }

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const displayName = user.fullName || user.primaryEmailAddress?.emailAddress || user.id;

        const { data, error } = await client.rpc('get_or_create_user_permissions', {
          p_clerk_user_id: user.id,
          p_display_name: displayName,
          p_email: user.primaryEmailAddress?.emailAddress ?? null,
        });

        if (error) throw error;

        const next = normalize(Array.isArray(data) ? data[0] : data);
        if (isMounted) setState({ isLoading: false, error: null, ...next });
      } catch (error) {
        console.error('Permission lookup failed', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            role: 'User',
            division: null,
            permissions: DENY_ALL,
            source: 'error-default-deny',
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [getToken, isSignedIn, isUserLoaded, user]);

  const flags = useMemo(() => camel(state.permissions), [state.permissions]);

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
    ...flags,
  };
}
