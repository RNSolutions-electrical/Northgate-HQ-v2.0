import { useAuth } from '@clerk/clerk-react';
import { Briefcase, MapPin, Plus, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { RecordHeader } from '../../components/ui/RecordHeader.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { WorkspaceTabs } from '../../components/ui/WorkspaceTabs.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';

const EMPTY_VEHICLES = Object.freeze([]);
const EMPTY_ASSIGNMENTS = Object.freeze([]);
const EMPTY_EMPLOYEES = Object.freeze([]);

const DEFAULT_ASSIGNMENT_FORM = Object.freeze({
  userId: '',
  reason: '',
  releaseReason: '',
  isSaving: false,
  error: null,
  success: '',
});
const DEFAULT_VEHICLE_FORM = Object.freeze({
  vehicleNumber: '', name: '', classification: 'Other', description: '', holdsStock: false, reason: '', isSaving: false, error: null, success: '',
});

const VEHICLE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'service', label: 'Service' },
  { key: 'history', label: 'History' },
];

const VEHICLE_COLUMNS = [
  { key: 'vehicle_number', header: 'Unit', render: (row) => <strong>{vehicleLabel(row)}</strong> },
  { key: 'classification', header: 'Classification', fallback: 'Vehicle' },
  { key: 'current_operator', header: 'Current Operator', fallback: 'Unassigned' },
  { key: 'make', header: 'Make', fallback: '-' },
  { key: 'model', header: 'Model', fallback: '-' },
  { key: 'division', header: 'Department Source', fallback: 'Source pending' },
  {
    key: 'holds_stock',
    header: 'Stock',
    render: (row) => (
      <StatusBadge tone={row.holds_stock ? 'good' : 'neutral'}>
        {row.holds_stock ? 'Holds stock' : 'Fleet only'}
      </StatusBadge>
    ),
  },
];

const ASSIGNMENT_COLUMNS = [
  { key: 'user_label', header: 'Employee', render: (row) => <strong>{row.user_label}</strong> },
  { key: 'vehicle_label', header: 'Vehicle' },
  { key: 'assigned_at', header: 'Assigned', render: (row) => formatDateTime(row.assigned_at) },
  { key: 'unassigned_at', header: 'Released', render: (row) => row.unassigned_at ? formatDateTime(row.unassigned_at) : 'Active' },
  { key: 'assigned_by_label', header: 'Assigned By', fallback: '-' },
  { key: 'note', header: 'Note', fallback: '-' },
];

function vehicleLabel(vehicle) {
  return vehicle?.vehicle_number || vehicle?.name || vehicle?.id || 'Vehicle';
}

function vehicleSearchText(vehicle) {
  return [
    vehicle.vehicle_number,
    vehicle.name,
    vehicle.make,
    vehicle.model,
    vehicle.classification,
    vehicle.current_operator,
    vehicle.division,
  ].filter(Boolean).join(' ').toLowerCase();
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function useVehicleReferences({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    vehicles: EMPTY_VEHICLES,
    assignments: EMPTY_ASSIGNMENTS,
    employees: EMPTY_EMPLOYEES,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled) {
        setState((current) => ({ ...current, isLoading: false }));
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const [vehiclesResult, assignmentsResult, employeesResult] = await Promise.all([
          client
            .from('inventory_destination_vehicles_view')
            .select('id, vehicle_number, name, make, model, classification, holds_stock, division')
            .order('vehicle_number', { ascending: true }),
          client.rpc('read_vehicle_assignment_directory', {
            p_limit: 1000,
          }),
          client
            .from('inventory_destination_users_view')
            .select('clerk_user_id, display_name, email, role, division')
            .order('display_name', { ascending: true, nullsFirst: false }),
        ]);

        if (vehiclesResult.error) throw vehiclesResult.error;
        if (assignmentsResult.error) throw assignmentsResult.error;
        if (employeesResult.error) throw employeesResult.error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            vehicles: vehiclesResult.data ?? EMPTY_VEHICLES,
            assignments: assignmentsResult.data ?? EMPTY_ASSIGNMENTS,
            employees: employeesResult.data ?? EMPTY_EMPLOYEES,
          });
        }
      } catch (error) {
        console.error('Vehicle references failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            vehicles: EMPTY_VEHICLES,
            assignments: EMPTY_ASSIGNMENTS,
            employees: EMPTY_EMPLOYEES,
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

export function VehiclesWorkspace({ permissions }) {
  const { getToken } = useAuth();
  const canReadVehicles = permissions.permissionSource === 'server' && permissions.canManageVehicles === true;
  const vehicleState = useVehicleReferences({ enabled: canReadVehicles });
  const [activeView, setActiveView] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [search, setSearch] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState(DEFAULT_ASSIGNMENT_FORM);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(DEFAULT_VEHICLE_FORM);
  const [vehicleNotice, setVehicleNotice] = useState('');

  const assignments = vehicleState.assignments;
  const currentAssignmentMap = useMemo(() => {
    const next = new Map();
    assignments
      .filter((assignment) => assignment.is_active)
      .forEach((assignment) => {
        if (!next.has(assignment.vehicle_id)) next.set(assignment.vehicle_id, assignment);
      });
    return next;
  }, [assignments]);

  const vehicles = useMemo(() => vehicleState.vehicles.map((vehicle) => {
    const activeAssignment = currentAssignmentMap.get(vehicle.id);
    return {
      ...vehicle,
      current_operator: activeAssignment?.user_label ?? '',
      current_assignment: activeAssignment ?? null,
    };
  }), [currentAssignmentMap, vehicleState.vehicles]);
  const stockCount = vehicles.filter((vehicle) => vehicle.holds_stock).length;
  const fleetCount = vehicles.length - stockCount;
  const vehiclesWithDivision = vehicles.filter((vehicle) => vehicle.division).length;
  const activeAssignmentCount = assignments.filter((assignment) => assignment.is_active).length;

  const vehicleViews = [
    { key: 'all', label: 'All Vehicles', icon: Truck, description: 'Every visible destination vehicle.', badge: vehicles.length },
    { key: 'stock', label: 'Stock Vehicles', icon: Briefcase, description: 'Vehicles flagged to hold inventory.', badge: stockCount },
    { key: 'fleet', label: 'General Fleet', icon: MapPin, description: 'Visible vehicles not flagged as stock-holding.', badge: fleetCount },
  ];

  const filteredVehicles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      if (activeView === 'stock' && !vehicle.holds_stock) return false;
      if (activeView === 'fleet' && vehicle.holds_stock) return false;
      if (!normalizedSearch) return true;
      return vehicleSearchText(vehicle).includes(normalizedSearch);
    });
  }, [activeView, search, vehicles]);

  const selectedVehicle = filteredVehicles.find((vehicle) => vehicle.id === selectedVehicleId)
    ?? vehicles.find((vehicle) => vehicle.id === selectedVehicleId)
    ?? null;
  const selectedVehicleAssignments = selectedVehicle
    ? assignments.filter((assignment) => assignment.vehicle_id === selectedVehicle.id)
    : EMPTY_ASSIGNMENTS;

  useEffect(() => {
    if (selectedVehicleId && !vehicles.some((vehicle) => vehicle.id === selectedVehicleId)) {
      setSelectedVehicleId('');
    }
  }, [selectedVehicleId, vehicles]);

  function selectVehicle(vehicle) {
    setSelectedVehicleId(vehicle.id);
    setActiveTab('overview');
    setAssignmentForm(DEFAULT_ASSIGNMENT_FORM);
  }

  function setAssignmentField(field, value) {
    setAssignmentForm((current) => ({ ...current, [field]: value, error: null, success: '' }));
  }

  function setVehicleField(field, value) {
    setVehicleForm((current) => ({ ...current, [field]: value, error: null, success: '' }));
  }

  async function createVehicle(event) {
    event.preventDefault();
    if (vehicleForm.isSaving) return;
    setVehicleForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));
    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('create_vehicle', {
        p_vehicle_number: vehicleForm.vehicleNumber,
        p_name: vehicleForm.name,
        p_classification: vehicleForm.classification,
        p_description: vehicleForm.description,
        p_holds_stock: vehicleForm.holdsStock,
        p_reason: vehicleForm.reason,
      });
      if (error) throw error;
      setVehicleForm(DEFAULT_VEHICLE_FORM);
      setVehicleNotice('Vehicle saved to the fleet and is ready to be assigned.');
      setIsCreateOpen(false);
      vehicleState.reload();
    } catch (error) {
      console.error('Vehicle create failed', error);
      setVehicleForm((current) => ({ ...current, isSaving: false, error }));
    }
  }

  async function assignVehicle(event) {
    event.preventDefault();
    if (!selectedVehicle || !assignmentForm.userId || !assignmentForm.reason.trim() || assignmentForm.isSaving) return;

    setAssignmentForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('assign_vehicle_to_user', {
        p_vehicle_id: selectedVehicle.id,
        p_user_id: assignmentForm.userId,
        p_reason: assignmentForm.reason.trim(),
      });
      if (error) throw error;

      setAssignmentForm({ ...DEFAULT_ASSIGNMENT_FORM, success: 'Vehicle assignment saved.' });
      vehicleState.reload();
    } catch (error) {
      console.error('Vehicle assignment failed', error);
      setAssignmentForm((current) => ({ ...current, isSaving: false, error }));
    }
  }

  async function releaseVehicle() {
    if (!selectedVehicle?.current_assignment || !assignmentForm.releaseReason.trim() || assignmentForm.isSaving) return;

    setAssignmentForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('release_vehicle_assignment', {
        p_assignment_id: selectedVehicle.current_assignment.assignment_id,
        p_reason: assignmentForm.releaseReason.trim(),
      });
      if (error) throw error;

      setAssignmentForm({ ...DEFAULT_ASSIGNMENT_FORM, success: 'Vehicle assignment released.' });
      vehicleState.reload();
    } catch (error) {
      console.error('Vehicle release failed', error);
      setAssignmentForm((current) => ({ ...current, isSaving: false, error }));
    }
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Vehicles"
        description="Fleet directory with vehicle creation, live current-operator reads, and controlled assignment changes. Maintenance, inspections, and service workflows remain deferred."
        status={<span className="status-pill">{vehicles.length} visible vehicle{vehicles.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button" onClick={vehicleState.reload} disabled={vehicleState.isLoading}>
              Refresh
            </button>
            <button type="button" className="primary-button" onClick={() => { setVehicleNotice(''); setIsCreateOpen(true); }} disabled={!canReadVehicles}>
              <Plus aria-hidden="true" /> Add vehicle
            </button>
          </>
        )}
      />

      {isCreateOpen ? (
        <form className="card workspace-card vehicle-create-form" onSubmit={createVehicle}>
          <Toolbar eyebrow="Fleet Setup" title="Add vehicle" description="Add a vehicle to the internal fleet. A required reason records this change in the audit history." />
          <p className="vehicle-create-form__hint"><strong>Enter a unit number or vehicle name.</strong> The audit reason is required before the vehicle can be added.</p>
          <div className="vehicle-create-form__grid">
            <label><span>Unit number</span><input value={vehicleForm.vehicleNumber} onChange={(event) => setVehicleField('vehicleNumber', event.target.value)} disabled={vehicleForm.isSaving} placeholder="e.g., E-14" autoFocus /></label>
            <label><span>Vehicle name</span><input value={vehicleForm.name} onChange={(event) => setVehicleField('name', event.target.value)} disabled={vehicleForm.isSaving} placeholder="Required if no unit number" /></label>
            <label><span>Classification</span><select value={vehicleForm.classification} onChange={(event) => setVehicleField('classification', event.target.value)} disabled={vehicleForm.isSaving}><option>Residential</option><option>Commercial</option><option>Service</option><option>Other</option></select></label>
            <label className="vehicle-create-form__stock"><input type="checkbox" checked={vehicleForm.holdsStock} onChange={(event) => setVehicleField('holdsStock', event.target.checked)} disabled={vehicleForm.isSaving} /><span><strong>Holds inventory stock</strong><small>Enable only for a vehicle that can receive stock.</small></span></label>
            <label className="vehicle-create-form__wide"><span>Reason for adding this vehicle <b aria-hidden="true">*</b></span><input value={vehicleForm.reason} onChange={(event) => setVehicleField('reason', event.target.value)} disabled={vehicleForm.isSaving} placeholder="e.g., Added to electrical service fleet" required /></label>
            <label className="vehicle-create-form__wide"><span>Description</span><textarea value={vehicleForm.description} onChange={(event) => setVehicleField('description', event.target.value)} disabled={vehicleForm.isSaving} rows="3" placeholder="Optional fleet notes" /></label>
          </div>
          <div className="record-actions"><button type="submit" className="primary-button" disabled={vehicleForm.isSaving}>{vehicleForm.isSaving ? 'Saving…' : 'Save vehicle'}</button><button type="button" className="secondary-button" onClick={() => { setIsCreateOpen(false); setVehicleForm(DEFAULT_VEHICLE_FORM); }} disabled={vehicleForm.isSaving}>Cancel</button></div>
          {vehicleForm.error ? <StatePanel tone="danger" eyebrow="Create Failed" title="Vehicle was not saved" description={vehicleForm.error.message || 'Unexpected vehicle error.'} compact /> : null}
        </form>
      ) : null}

      {vehicleNotice ? <StatePanel tone="success" eyebrow="Vehicle Saved" title="Ready for assignment" description={vehicleNotice} compact /> : null}

      <div className="summary-grid">
        <SummaryCard label="Visible vehicles" value={vehicles.length} detail={vehicleState.isLoading ? 'Loading references' : 'Destination reference rows'} />
        <SummaryCard label="Active assignments" value={activeAssignmentCount} detail="Current operator rows" />
        <SummaryCard label="Stock vehicles" value={stockCount} detail="Vehicles marked inventory-capable" />
        <SummaryCard label="General fleet" value={fleetCount} detail="Not marked as stock-holding" />
        <SummaryCard label="Read scope" value={permissions.canViewAllDivisions ? 'All departments' : 'Limited'} detail="Vehicle department source pending" tone={canReadVehicles ? 'good' : 'warn'} incomplete={!vehiclesWithDivision} />
        <SummaryCard
          label="Department source"
          value={vehiclesWithDivision ? 'Available' : 'Pending'}
          detail={vehiclesWithDivision ? `${vehiclesWithDivision} scoped row${vehiclesWithDivision === 1 ? '' : 's'}` : 'Vehicles do not expose department yet'}
          tone={vehiclesWithDivision ? 'good' : 'warn'}
        />
      </div>

      <div className={`workspace-split vehicles-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Vehicle Views"
          title="Vehicles"
          description="Browse the live visible fleet references."
          items={vehicleViews}
          activeKey={activeView}
          onSelect={setActiveView}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Foundation only</strong>
              <p>No assignment writes, maintenance records, or service workflows are fabricated here.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          <article className="card workspace-card">
            <Toolbar
              eyebrow="Directory"
              title={vehicleViews.find((item) => item.key === activeView)?.label ?? 'Vehicles'}
              description="Rows come from the limited vehicle reference view, enriched with read-only assignment data for current operators."
              search={(
                <label>
                  <span className="sr-only">Search vehicles</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search vehicles..."
                  />
                </label>
              )}
            />

            <DataTable
              columns={VEHICLE_COLUMNS}
              rows={filteredVehicles}
              getRowKey={(row) => row.id}
              permissions={permissions}
              isLoading={vehicleState.isLoading}
              error={vehicleState.error}
              onRowClick={selectVehicle}
              selectedRowKey={selectedVehicle?.id ?? null}
              dense
              minWidth="760px"
              emptyTitle={search ? 'No vehicles matched this search' : 'No vehicles are visible'}
              emptyDescription={search
                ? 'Try searching by unit number, make, model, classification, or division.'
                : 'This directory stays honest when the existing read path has no visible vehicle rows.'}
            />
          </article>

          <article className="card workspace-card">
            {selectedVehicle ? (
              <>
                <RecordHeader
                  eyebrow="Selected Vehicle"
                  title={vehicleLabel(selectedVehicle)}
                  description="This selected-record shell preserves the approved detail pattern without inventing assignment or maintenance workflows."
                  meta={[
                    { label: 'Classification', value: selectedVehicle.classification || 'Vehicle' },
                    { label: 'Current Operator', value: selectedVehicle.current_operator || 'Unassigned' },
                    { label: 'Department', value: selectedVehicle.division || 'Source pending' },
                  ]}
                />
                <WorkspaceTabs
                  tabs={VEHICLE_TABS}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  ariaLabel="Vehicle detail sections"
                />

                {activeTab === 'overview' ? (
                  <div className="module-fact-grid vehicles-fact-grid">
                    <SummaryCard label="Make" value={selectedVehicle.make || '-'} detail="Reference field" />
                    <SummaryCard label="Model" value={selectedVehicle.model || '-'} detail="Reference field" />
                    <SummaryCard label="Current Operator" value={selectedVehicle.current_operator || 'Unassigned'} detail="Active assignment row" tone={selectedVehicle.current_operator ? 'good' : 'default'} />
                    <SummaryCard label="Stock capable" value={selectedVehicle.holds_stock ? 'Yes' : 'No'} detail="holds_stock flag" tone={selectedVehicle.holds_stock ? 'good' : 'default'} />
                  </div>
                ) : null}

                {activeTab === 'assignment' ? (
                  <>
                    {selectedVehicle.current_assignment ? (
                      <div className="module-fact-grid vehicles-fact-grid">
                        <SummaryCard label="Assigned To" value={selectedVehicle.current_assignment.user_label} detail={selectedVehicle.current_assignment.user_email || 'Employee reference'} tone="good" />
                        <SummaryCard label="Assigned" value={formatDateTime(selectedVehicle.current_assignment.assigned_at)} detail="Assignment start" />
                        <SummaryCard label="Assigned By" value={selectedVehicle.current_assignment.assigned_by_label || '-'} detail="Recorded actor" />
                      </div>
                    ) : (
                      <StatePanel
                        eyebrow="Assignment"
                        title="No active assignment"
                        description="This vehicle does not currently have an active user assignment row."
                        tone="neutral"
                      />
                    )}
                    <form className="card workspace-card" onSubmit={assignVehicle}>
                      <Toolbar
                        eyebrow="Assignment Control"
                        title={selectedVehicle.current_assignment ? 'Transfer or reassign vehicle' : 'Assign vehicle'}
                        description="Choose an employee in your approved scope and provide a required audit reason. Assigning an employee who already has a vehicle transfers them from that vehicle."
                      />
                      <div className="module-form-grid">
                        <label>
                          Employee
                          <select value={assignmentForm.userId} onChange={(event) => setAssignmentField('userId', event.target.value)} disabled={assignmentForm.isSaving} required>
                            <option value="">Select employee</option>
                            {vehicleState.employees.map((employee) => (
                              <option key={employee.clerk_user_id} value={employee.clerk_user_id}>
                                {employee.display_name || employee.email || employee.clerk_user_id} — {employee.division || 'Unassigned'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Assignment reason
                          <input type="text" maxLength={500} value={assignmentForm.reason} onChange={(event) => setAssignmentField('reason', event.target.value)} disabled={assignmentForm.isSaving} placeholder="Required audit reason" required />
                        </label>
                      </div>
                      <button type="submit" className="primary-button" disabled={assignmentForm.isSaving || !assignmentForm.userId || !assignmentForm.reason.trim()}>
                        {assignmentForm.isSaving ? 'Saving…' : selectedVehicle.current_assignment ? 'Save assignment / transfer' : 'Assign vehicle'}
                      </button>
                    </form>

                    {selectedVehicle.current_assignment ? (
                      <article className="card workspace-card">
                        <Toolbar eyebrow="Release" title="Release current operator" description="End the active assignment without creating a replacement." />
                        <div className="module-form-grid">
                          <label>
                            Release reason
                            <input type="text" maxLength={500} value={assignmentForm.releaseReason} onChange={(event) => setAssignmentField('releaseReason', event.target.value)} disabled={assignmentForm.isSaving} placeholder="Required audit reason" />
                          </label>
                        </div>
                        <button type="button" className="secondary-button" onClick={releaseVehicle} disabled={assignmentForm.isSaving || !assignmentForm.releaseReason.trim()}>
                          Release assignment
                        </button>
                      </article>
                    ) : null}

                    {assignmentForm.error ? (
                      <StatePanel tone="danger" eyebrow="Assignment Failed" title="Vehicle assignment was not changed" description={assignmentForm.error.message || 'Unexpected assignment error.'} compact />
                    ) : null}
                    {assignmentForm.success ? (
                      <StatePanel tone="success" eyebrow="Saved" title={assignmentForm.success} description="The assignment directory and Dashboard vehicle view will use the updated authoritative history." compact />
                    ) : null}
                  </>
                ) : null}

                {activeTab === 'service' ? (
                  <StatePanel
                    eyebrow="Deferred"
                    title="Service records are not wired yet"
                    description="No maintenance history, mileage, inspections, or service alerts are fabricated in this pass."
                    tone="neutral"
                  />
                ) : null}

                {activeTab === 'history' ? (
                  <DataTable
                    columns={ASSIGNMENT_COLUMNS}
                    rows={selectedVehicleAssignments}
                    getRowKey={(row) => row.assignment_id}
                    permissions={permissions}
                    dense
                    minWidth="900px"
                    emptyTitle="No assignment history"
                    emptyDescription="Assignment rows will appear here once this vehicle has been assigned or released."
                  />
                ) : null}
              </>
            ) : (
              <StatePanel
                eyebrow="No Selection"
                title="Select a vehicle to open the detail workspace"
                description="The persistent vehicle header and horizontal detail tabs appear here when you choose a row from the live vehicle directory."
                tone="neutral"
              />
            )}
          </article>

          <section className="vehicles-boundary-grid">
            <StatePanel
              eyebrow="Boundary"
              title="Read scope is active"
              description="Vehicle references require the vehicle-management permission. Per-division vehicle filtering waits on a real vehicle division source."
              compact
              incomplete={!vehiclesWithDivision}
            />
            <StatePanel
              eyebrow="Boundary"
              title="Add/Edit remains deferred"
              description="The Add Vehicle command is intentionally disabled until vehicle create/edit behavior is ported with an explicit write contract."
              compact
            />
            <StatePanel
              eyebrow="Boundary"
              title="Controlled assignment mutations"
              description="Assignment create, transfer, and release use permission-checked RPCs with required reasons and audit rows. Cart-open continues to resolve the active vehicle from assignment history."
              compact
              incomplete={false}
            />
            <StatePanel
              eyebrow="Boundary"
              title="Department source is pending"
              description="Vehicle records do not currently expose a department field, so this directory cannot enforce per-department vehicle visibility until that source exists."
              compact
            />
            <StatePanel
              eyebrow="Boundary"
              title="No service workflow"
              description="Service records, inspections, mileage, documents, and maintenance alerts remain future vehicle-module work."
              compact
            />
          </section>
        </div>
      </div>
    </>
  );
}
