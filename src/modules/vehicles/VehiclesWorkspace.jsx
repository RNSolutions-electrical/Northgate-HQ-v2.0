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

const VEHICLE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'service', label: 'Service' },
  { key: 'history', label: 'History' },
];

const VEHICLE_COLUMNS = [
  { key: 'vehicle_number', header: 'Unit', render: (row) => <strong>{vehicleLabel(row)}</strong> },
  { key: 'classification', header: 'Classification', fallback: 'Vehicle' },
  { key: 'make', header: 'Make', fallback: '-' },
  { key: 'model', header: 'Model', fallback: '-' },
  { key: 'division', header: 'Division Source', fallback: 'Source pending' },
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
    vehicle.division,
  ].filter(Boolean).join(' ').toLowerCase();
}

function useVehicleReferences({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    vehicles: EMPTY_VEHICLES,
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
        const { data, error } = await client
          .from('inventory_destination_vehicles_view')
          .select('id, vehicle_number, name, make, model, classification, holds_stock, division')
          .order('vehicle_number', { ascending: true });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            vehicles: data ?? EMPTY_VEHICLES,
          });
        }
      } catch (error) {
        console.error('Vehicle references failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            vehicles: EMPTY_VEHICLES,
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
  const canReadVehicles = permissions.permissionSource === 'server' && permissions.canManageVehicles === true;
  const vehicleState = useVehicleReferences({ enabled: canReadVehicles });
  const [activeView, setActiveView] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [search, setSearch] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const vehicles = vehicleState.vehicles;
  const stockCount = vehicles.filter((vehicle) => vehicle.holds_stock).length;
  const fleetCount = vehicles.length - stockCount;
  const vehiclesWithDivision = vehicles.filter((vehicle) => vehicle.division).length;

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

  useEffect(() => {
    if (selectedVehicleId && !vehicles.some((vehicle) => vehicle.id === selectedVehicleId)) {
      setSelectedVehicleId('');
    }
  }, [selectedVehicleId, vehicles]);

  function selectVehicle(vehicle) {
    setSelectedVehicleId(vehicle.id);
    setActiveTab('overview');
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Vehicles"
        description="Fleet directory and selected-record shell using the existing vehicle destination-reference path. Assignment, service, and history remain deferred until their approved sources are wired."
        status={<span className="status-pill">{vehicles.length} visible vehicle{vehicles.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button" onClick={vehicleState.reload} disabled={vehicleState.isLoading}>
              Refresh
            </button>
            <button type="button" className="primary-button ng-incomplete-component" disabled>
              <Plus aria-hidden="true" /> Add vehicle
            </button>
          </>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Visible vehicles" value={vehicles.length} detail={vehicleState.isLoading ? 'Loading references' : 'Destination reference rows'} />
        <SummaryCard label="Stock vehicles" value={stockCount} detail="Vehicles marked inventory-capable" />
        <SummaryCard label="General fleet" value={fleetCount} detail="Not marked as stock-holding" />
        <SummaryCard label="Read scope" value={permissions.canViewAllDivisions ? 'All divisions' : 'Limited'} detail="Vehicle division source pending" tone={canReadVehicles ? 'good' : 'warn'} incomplete={!vehiclesWithDivision} />
        <SummaryCard
          label="Division source"
          value={vehiclesWithDivision ? 'Available' : 'Pending'}
          detail={vehiclesWithDivision ? `${vehiclesWithDivision} scoped row${vehiclesWithDivision === 1 ? '' : 's'}` : 'Vehicles do not expose division yet'}
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
              description="Rows come from the limited vehicle reference view. Vehicle division is source-pending, so visibility remains all-division only."
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
                    { label: 'Division', value: selectedVehicle.division || 'Source pending' },
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
                    <SummaryCard label="Stock capable" value={selectedVehicle.holds_stock ? 'Yes' : 'No'} detail="holds_stock flag" tone={selectedVehicle.holds_stock ? 'good' : 'default'} />
                  </div>
                ) : null}

                {activeTab === 'assignment' ? (
                  <StatePanel
                    eyebrow="Deferred"
                    title="Assignment details are not wired yet"
                    description="The vehicle assignment model exists for cart snapshots and historical labels, but this workspace does not add assignment management or current-operator display in this pass."
                    tone="neutral"
                  />
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
                  <StatePanel
                    eyebrow="Deferred"
                    title="Vehicle history is not wired yet"
                    description="Inventory destination history and assignment history need explicit report/read surfaces before this tab renders rows."
                    tone="neutral"
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
              title="No assignment mutations"
              description="This pass does not create, end, or edit vehicle assignments, and does not alter cart-open vehicle snapshot behavior."
              compact
            />
            <StatePanel
              eyebrow="Boundary"
              title="Division source is pending"
              description="Vehicle records do not currently expose a division field, so this directory cannot enforce per-division vehicle visibility until that source exists."
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
