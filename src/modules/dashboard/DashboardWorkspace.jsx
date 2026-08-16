import { useAuth, useUser } from '@clerk/clerk-react';
import {
  FileText,
  HardHat,
  Sparkles,
  SlidersHorizontal,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';

const EMPTY_ATTENTION_ITEMS = Object.freeze([]);
const EMPTY_DASHBOARD_ESTIMATES = Object.freeze([]);
const EMPTY_DASHBOARD_VEHICLES = Object.freeze([]);

const DASHBOARD_ESTIMATE_SELECT_FIELDS = [
  'id',
  'division',
  'updated_at',
  'estimate_number',
  'title',
  'customer_name',
  'status',
  'bid_due_at',
  'submitted_at',
  'estimator_id',
].join(', ');

const JOB_ATTENTION_COLUMNS = [
  { key: 'job_label', header: 'Job', render: (row) => <strong>{row.job_label}</strong> },
  { key: 'item_description', header: 'Buyout item', render: (row) => row.item_description || 'Untitled item' },
  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status}>{formatBuyoutStatus(row.status)}</StatusBadge> },
  { key: 'reason', header: 'Needs attention', render: (row) => row.reason },
];

const DASHBOARD_ESTIMATE_COLUMNS = [
  { key: 'estimate_number', header: 'Estimate #', render: (row) => <strong>{estimateLabel(row)}</strong> },
  { key: 'title', header: 'Title' },
  { key: 'customer_name', header: 'Customer', fallback: '-' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.status}>{formatLabel(row.status)}</StatusBadge>,
  },
  { key: 'bid_due_at', header: 'Bid Due', render: (row) => formatDate(row.bid_due_at) },
];

const DASHBOARD_VEHICLE_COLUMNS = [
  { key: 'vehicle_label', header: 'Vehicle', render: (row) => <strong>{row.vehicle_label}</strong> },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <StatusBadge tone={row.is_active ? 'good' : 'neutral'}>
        {row.is_active ? 'Active' : 'Released'}
      </StatusBadge>
    ),
  },
  { key: 'assigned_at', header: 'Assigned', render: (row) => formatDateTime(row.assigned_at) },
  { key: 'unassigned_at', header: 'Released', render: (row) => row.unassigned_at ? formatDateTime(row.unassigned_at) : '-' },
  { key: 'assigned_by_label', header: 'Assigned By', fallback: '-' },
  { key: 'note', header: 'Note', fallback: '-' },
];

function missing(value) {
  return value || 'Not provided';
}

function permissionLabel(value) {
  return value === true ? 'Granted' : 'Not granted';
}

function formatBuyoutStatus(value) {
  switch (value) {
    case 'ordered':
      return 'Ordered';
    case 'received':
      return 'Received';
    case 'cancelled':
      return 'Cancelled';
    case 'pending':
      return 'Pending';
    default:
      return value || '-';
  }
}

function jobLabel(job) {
  if (!job) return 'Unknown job';
  return job.job_number ? `${job.job_number} - ${job.name}` : job.name || 'Unnamed job';
}

function estimateLabel(estimate) {
  if (!estimate) return 'Unknown estimate';
  return estimate.estimate_number || estimate.title || estimate.id || 'Estimate';
}

function formatLabel(value) {
  return String(value || '-').replaceAll('_', ' ');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function buyoutAttentionReason(line) {
  if (line.status !== 'received' && line.status !== 'cancelled') return 'Open buyout item';
  const actualValue = Number(line.actual_value) || 0;
  const budgetAmount = Number(line.budget_amount) || 0;
  if (budgetAmount > 0 && actualValue > budgetAmount) return 'Actual value over budget';
  const actualLead = Number(line.actual_lead_time_days) || 0;
  const initialLead = Number(line.initial_lead_time_days) || 0;
  if (initialLead > 0 && actualLead > initialLead) return 'Actual lead time over initial';
  return '';
}

function sortEstimatesByDueDate(a, b) {
  const aTime = a.bid_due_at ? new Date(a.bid_due_at).getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.bid_due_at ? new Date(b.bid_due_at).getTime() : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  return estimateLabel(a).localeCompare(estimateLabel(b));
}

function useJobAttention({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    items: EMPTY_ATTENTION_ITEMS,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled) {
        setState({ isLoading: false, error: null, items: EMPTY_ATTENTION_ITEMS });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const [jobsResult, buyoutResult] = await Promise.all([
          client
            .from('jobs')
            .select('id, job_number, name')
            .is('archived_at', null),
          client
            .from('job_buyout_lines')
            .select('id, job_id, item_description, status, budget_amount, actual_value, initial_lead_time_days, actual_lead_time_days')
            .is('archived_at', null),
        ]);

        if (jobsResult.error) throw jobsResult.error;
        if (buyoutResult.error) throw buyoutResult.error;

        const jobsById = new Map((jobsResult.data || []).map((job) => [job.id, job]));
        const items = (buyoutResult.data || [])
          .map((line) => ({
            ...line,
            reason: buyoutAttentionReason(line),
            job_label: jobLabel(jobsById.get(line.job_id)),
          }))
          .filter((line) => line.reason)
          .sort((a, b) => a.job_label.localeCompare(b.job_label) || a.item_description.localeCompare(b.item_description));

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            items,
          });
        }
      } catch (error) {
        console.error('Dashboard job attention failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            items: EMPTY_ATTENTION_ITEMS,
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [enabled, getToken, refreshKey]);

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
  };
}

function useDashboardEstimates({ enabled, userId, canApproveEstimates }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    assigned: EMPTY_DASHBOARD_ESTIMATES,
    approvalQueue: EMPTY_DASHBOARD_ESTIMATES,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled) {
        setState({
          isLoading: false,
          error: null,
          assigned: EMPTY_DASHBOARD_ESTIMATES,
          approvalQueue: EMPTY_DASHBOARD_ESTIMATES,
        });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client
          .from('estimates')
          .select(DASHBOARD_ESTIMATE_SELECT_FIELDS)
          .is('archived_at', null)
          .order('bid_due_at', { ascending: true, nullsFirst: false })
          .order('updated_at', { ascending: false });

        if (error) throw error;

        const rows = data ?? EMPTY_DASHBOARD_ESTIMATES;
        const assigned = rows
          .filter((estimate) => estimate.estimator_id && estimate.estimator_id === userId)
          .sort(sortEstimatesByDueDate);
        const approvalQueue = canApproveEstimates
          ? rows
            .filter((estimate) => estimate.status === 'submitted')
            .sort(sortEstimatesByDueDate)
          : EMPTY_DASHBOARD_ESTIMATES;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            assigned,
            approvalQueue,
          });
        }
      } catch (error) {
        console.error('Dashboard estimates failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            assigned: EMPTY_DASHBOARD_ESTIMATES,
            approvalQueue: EMPTY_DASHBOARD_ESTIMATES,
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [canApproveEstimates, enabled, getToken, refreshKey, userId]);

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
  };
}

function useDashboardVehicles({ enabled, userId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    assignments: EMPTY_DASHBOARD_VEHICLES,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !userId) {
        setState({
          isLoading: false,
          error: null,
          assignments: EMPTY_DASHBOARD_VEHICLES,
        });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client.rpc('read_employee_vehicle_assignment_directory', {
          p_user_id: userId,
          p_limit: 25,
        });

        if (error) throw error;

        const assignments = (data ?? EMPTY_DASHBOARD_VEHICLES)
          .slice()
          .sort((a, b) => {
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
            const aTime = a.assigned_at ? new Date(a.assigned_at).getTime() : 0;
            const bTime = b.assigned_at ? new Date(b.assigned_at).getTime() : 0;
            return bTime - aTime;
          });

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            assignments,
          });
        }
      } catch (error) {
        console.error('Dashboard vehicles failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            assignments: EMPTY_DASHBOARD_VEHICLES,
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [enabled, getToken, refreshKey, userId]);

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
  };
}

export function DashboardWorkspace({ permissions }) {
  const { user } = useUser();
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState('my-info');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);
  const jobAttention = useJobAttention({ enabled: permissions.permissionSource === 'server' });

  const canSeeEstimates = permissions.permissionSource === 'server'
    && (permissions.canEstimate || permissions.canApproveEstimates);
  const dashboardEstimates = useDashboardEstimates({
    enabled: canSeeEstimates,
    userId: permissions.userId,
    canApproveEstimates: permissions.canApproveEstimates === true,
  });
  const canSeeVehicleAssignments = permissions.permissionSource === 'server'
    && (permissions.canManageEmployees || permissions.canManageVehicles);
  const dashboardVehicles = useDashboardVehicles({
    enabled: canSeeVehicleAssignments,
    userId: permissions.userId,
  });
  const activeVehicleAssignments = dashboardVehicles.assignments.filter((assignment) => assignment.is_active);

  const sidebarItems = useMemo(() => [
    { key: 'my-info', label: 'My Info', icon: Users, description: 'Profile details from approved sources only.' },
    { key: 'my-work', label: 'My Work', icon: HardHat, description: 'Assigned-job workspace once assignment data exists.' },
    { key: 'my-vehicles', label: 'My Vehicles', icon: Truck, description: 'Direct and team vehicle views.' },
    { key: 'my-tools', label: 'My Tools', icon: Wrench, description: 'Company tools plus deferred personal tools.' },
    ...(canSeeEstimates
      ? [{ key: 'my-estimates', label: 'My Estimates', icon: FileText, description: 'Estimate work assigned to this user when supported.' }]
      : []),
    { key: 'my-preferences', label: 'My Preferences', icon: SlidersHorizontal, description: 'Supported personalization categories.' },
  ], [canSeeEstimates]);

  const phoneNumber = user?.primaryPhoneNumber?.phoneNumber
    || user?.phoneNumbers?.[0]?.phoneNumber
    || '';

  const profileFields = [
    { label: 'Full name', value: missing(user?.fullName) },
    { label: 'Email', value: missing(user?.primaryEmailAddress?.emailAddress) },
    { label: 'Phone number', value: missing(phoneNumber) },
    { label: 'Job title', value: 'Not provided' },
    { label: 'Role', value: missing(permissions.role) },
    { label: 'Department / division', value: missing(permissions.division) },
    { label: 'Notes', value: 'Not provided' },
  ];

  function openModule(path) {
    navigate(path);
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Personal work center for the authenticated user. This dashboard shows real profile and permission context, then reserves sections for approved assignment, tool, vehicle, estimate, and preference sources."
        status={(
          <span className="status-pill">
            {user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Authenticated user'}
          </span>
        )}
        actions={(
          <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
            Sections
          </button>
        )}
      />

      <section className="dashboard-hero">
        <div className="dashboard-hero__copy">
          <p className="eyebrow">Northgate HQ pulse</p>
          <h2>Good afternoon, {user?.firstName || user?.fullName || 'Ryan'}.</h2>
          <p>Jobs, material, people, and field decisions are organized into one operational view.</p>
          <div className="dashboard-hero__actions">
            <button type="button" className="primary-button" onClick={() => openModule('/jobs')}>Open jobs</button>
            <button type="button" className="secondary-button secondary-button--inverse" onClick={() => openModule('/silas')}>
              <Sparkles aria-hidden="true" /> Ask HQ
            </button>
          </div>
        </div>
        <div className="dashboard-hero__panel">
          <span>Needs attention</span>
          <strong>{jobAttention.isLoading ? 'Loading' : jobAttention.items.length}</strong>
          <p>{jobAttention.error ? 'Job attention could not load.' : 'Open buyout items, over-budget buyouts, and lead-time exceptions.'}</p>
        </div>
      </section>

      <div className="summary-grid">
        <SummaryCard label="Permission source" value={permissions.permissionSource} detail="Server state only" tone={permissions.permissionSource === 'server' ? 'good' : 'warn'} developmentOnly />
        <SummaryCard label="Role" value={permissions.role ?? 'User'} detail={permissions.division ?? 'No division'} developmentOnly />
        <SummaryCard label="Inventory" value={permissionLabel(permissions.canManageInventory || permissions.canInventoryTransactions)} detail="Existing flags" developmentOnly />
        <SummaryCard label="Jobs" value={permissionLabel(permissions.canCreateJobs || permissions.canManageJobs)} detail="Existing flags" developmentOnly />
        <SummaryCard label="Job Attention" value={jobAttention.isLoading ? 'Loading' : jobAttention.items.length} detail="Buyout exceptions" tone={jobAttention.items.length ? 'warn' : 'good'} />
        {canSeeVehicleAssignments ? (
          <SummaryCard label="My Vehicles" value={dashboardVehicles.isLoading ? 'Loading' : activeVehicleAssignments.length} detail="Active assignment rows" tone={activeVehicleAssignments.length ? 'good' : 'default'} />
        ) : null}
        {canSeeEstimates ? (
          <SummaryCard label="My Estimates" value={dashboardEstimates.isLoading ? 'Loading' : dashboardEstimates.assigned.length} detail="Assigned estimate rows" tone={dashboardEstimates.assigned.length ? 'accent' : 'default'} />
        ) : null}
      </div>

      <div className={`workspace-split dashboard-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="My Dashboard"
          title="Dashboard"
          description="Move between personal work-center sections without generic module summaries."
          items={sidebarItems}
          activeKey={activePanel}
          onSelect={setActivePanel}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Approved sources only</strong>
              <p>Missing assignment, reporting, estimate, and preference sources stay deferred instead of inferred.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          {activePanel === 'my-info' ? (
            <article className="card workspace-card module-directory-panel">
              <Toolbar
                eyebrow="My Info"
                title="Personal information"
                description="Only real profile and permission data from approved sources is shown here. Missing values stay visibly unfilled."
              />

              <div className="profile-field-grid">
                {profileFields.map((field) => (
                  <div className="profile-field" key={field.label}>
                    <span>{field.label}</span>
                    <strong>{field.value}</strong>
                  </div>
                ))}
              </div>

              <StatePanel
                eyebrow="Boundary"
                title="Profile editing is not part of this pass"
                description="This view does not add profile editing, role editing, permission editing, Clerk administration, or permission-override controls."
                tone="neutral"
              />
            </article>
          ) : null}

          {activePanel === 'my-work' ? (
            <div className="state-panel-stack">
              <article className="card workspace-card module-directory-panel">
                <Toolbar
                  eyebrow="Job Attention"
                  title="Buyout items needing attention"
                  description="Visible open buyouts, over-budget actuals, and lead-time exceptions."
                  actions={<button type="button" className="secondary-button" onClick={jobAttention.reload} disabled={jobAttention.isLoading}>Refresh</button>}
                />
                <DataTable
                  columns={JOB_ATTENTION_COLUMNS}
                  rows={jobAttention.items}
                  getRowKey={(row) => row.id}
                  permissions={permissions}
                  isLoading={jobAttention.isLoading}
                  error={jobAttention.error}
                  dense
                  minWidth="760px"
                  emptyTitle="No buyout items need attention"
                  emptyDescription="Open buyout items, over-budget actuals, and lead-time exceptions will appear here."
                />
              </article>
              <StatePanel
                eyebrow="My Work"
                title="Worker assignments are not available yet"
                description="The current Jobs read model does not expose worker, superintendent, or project-management assignment fields, so this dashboard cannot safely resolve a personalized project list yet."
                actions={<button type="button" className="secondary-button" onClick={() => openModule('/jobs')}>Open Jobs</button>}
              />
              <StatePanel
                eyebrow="My Work"
                title="Superintendent assignments are not available yet"
                description="No approved superintendent-assignment field or read path is present in the current Jobs workspace source."
                compact
              />
              <StatePanel
                eyebrow="My Work"
                title="Project-management assignments are not available yet"
                description="Project-manager assignment records are not exposed to this dashboard yet, so this section stays deferred instead of widening visibility or guessing ownership."
                compact
              />
            </div>
          ) : null}

          {activePanel === 'my-vehicles' ? (
            <div className="state-panel-stack">
              <article className="card workspace-card module-directory-panel">
                <Toolbar
                  eyebrow="My Vehicles"
                  title="Vehicles assigned directly to you"
                  description={canSeeVehicleAssignments
                    ? 'Active and historical vehicle assignments for the current user.'
                    : 'Vehicle assignment visibility requires employee or vehicle management permission.'}
                  actions={(
                    <>
                      <button type="button" className="secondary-button" onClick={dashboardVehicles.reload} disabled={!canSeeVehicleAssignments || dashboardVehicles.isLoading}>Refresh</button>
                      <button type="button" className="secondary-button" onClick={() => openModule('/vehicles')}>Open Vehicles</button>
                    </>
                  )}
                />
                <DataTable
                  columns={DASHBOARD_VEHICLE_COLUMNS}
                  rows={canSeeVehicleAssignments ? dashboardVehicles.assignments : EMPTY_DASHBOARD_VEHICLES}
                  getRowKey={(row) => row.assignment_id}
                  permissions={permissions}
                  isLoading={dashboardVehicles.isLoading}
                  error={dashboardVehicles.error}
                  dense
                  minWidth="760px"
                  emptyTitle={canSeeVehicleAssignments ? 'No vehicles assigned to you' : 'Vehicle assignments unavailable'}
                  emptyDescription={canSeeVehicleAssignments
                    ? 'Vehicle assignments will appear here when an active or historical row references your user profile.'
                    : 'Ask a developer to grant employee or vehicle management access if you should see vehicle assignment rows.'}
                />
              </article>
              <StatePanel
                eyebrow="My Vehicles"
                title="Department vehicles for direct reports"
                description="Direct-report relationships are not available from current approved sources, so this region remains deferred rather than inferring reports from division membership alone."
              />
            </div>
          ) : null}

          {activePanel === 'my-tools' ? (
            <div className="state-panel-stack">
              <StatePanel
                eyebrow="Company Tools"
                title="Company tool catalogue"
                description="The current tool catalogue includes company tool rows and an assigned-to text field, but this dashboard does not have an approved user-linked assignment model yet. Open the full Tools module for the live catalogue instead of inferring ownership here."
                tone="info"
                actions={<button type="button" className="secondary-button" onClick={() => openModule('/tools')}>Open Tools Module</button>}
              />
              <StatePanel
                eyebrow="Personal Tools"
                title="Personal tools are not connected yet"
                description="Personal tool storage is reserved for a later backend phase. This dashboard keeps the final layout ready without inventing tools, browser persistence, or database writes."
                actions={<button type="button" className="secondary-button" disabled>Personal tools unavailable</button>}
              />
            </div>
          ) : null}

          {activePanel === 'my-estimates' && canSeeEstimates ? (
            <div className="state-panel-stack">
              <article className="card workspace-card module-directory-panel">
                <Toolbar
                  eyebrow="My Estimates"
                  title="Assigned estimates"
                  description="Estimate rows assigned to the current user through the estimator field."
                  actions={(
                    <>
                      <button type="button" className="secondary-button" onClick={dashboardEstimates.reload} disabled={dashboardEstimates.isLoading}>Refresh</button>
                      <button type="button" className="secondary-button" onClick={() => openModule('/estimates')}>Open Estimates</button>
                    </>
                  )}
                />
                <DataTable
                  columns={DASHBOARD_ESTIMATE_COLUMNS}
                  rows={dashboardEstimates.assigned}
                  getRowKey={(row) => row.id}
                  permissions={permissions}
                  isLoading={dashboardEstimates.isLoading}
                  error={dashboardEstimates.error}
                  dense
                  minWidth="760px"
                  emptyTitle="No estimates assigned to you"
                  emptyDescription="Assigned estimates will appear here when the estimator field matches your user profile."
                />
              </article>
              {permissions.canApproveEstimates ? (
                <article className="card workspace-card module-directory-panel">
                  <Toolbar
                    eyebrow="Approval Queue"
                    title="Submitted estimates"
                    description="Visible submitted estimates awaiting approval review."
                    actions={<button type="button" className="secondary-button" onClick={() => openModule('/estimates')}>Review in Estimates</button>}
                  />
                  <DataTable
                    columns={DASHBOARD_ESTIMATE_COLUMNS}
                    rows={dashboardEstimates.approvalQueue}
                    getRowKey={(row) => row.id}
                    permissions={permissions}
                    isLoading={dashboardEstimates.isLoading}
                    error={dashboardEstimates.error}
                    dense
                    minWidth="760px"
                    emptyTitle="No submitted estimates"
                    emptyDescription="Submitted estimates in your approval scope will appear here."
                  />
                </article>
              ) : null}
            </div>
          ) : null}

          {activePanel === 'my-preferences' ? (
            <div className="state-panel-stack">
              <StatePanel
                eyebrow="My Preferences"
                title="Personalization foundation only"
                description="Formatting density, section order, and dashboard arrangement categories are reserved here for a later approved persistence phase."
              />
              <StatePanel
                eyebrow="Current State"
                title="No supported saved personal preferences are available yet"
                description="This pass does not create localStorage preferences, a Supabase preferences table, or fake working controls. Developer-only formatting tools remain outside normal user preferences."
                tone="warning"
              />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
