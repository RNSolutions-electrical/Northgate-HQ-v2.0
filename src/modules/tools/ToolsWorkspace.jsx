import { useAuth } from '@clerk/clerk-react';
import { Archive, ClipboardList, MapPin, Plus, Wrench } from 'lucide-react';
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

const EMPTY_TOOLS = Object.freeze([]);

const TOOL_SELECT_FIELDS = [
  'id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'tool_number',
  'name',
  'category',
  'brand',
  'model',
  'serial_number',
  'description',
  'condition',
  'status',
  'home_location',
  'current_location',
  'assigned_to',
  'purchase_date',
  'notes',
].join(', ');

const TOOL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'location', label: 'Location' },
  { key: 'assignment', label: 'Assignment' },
  { key: 'history', label: 'History' },
];

const TOOL_COLUMNS = [
  { key: 'tool_number', header: 'Tool #', render: (row) => <strong>{toolLabel(row)}</strong> },
  { key: 'name', header: 'Name' },
  { key: 'category', header: 'Category', fallback: '-' },
  { key: 'brand', header: 'Brand', fallback: '-' },
  { key: 'model', header: 'Model', fallback: '-' },
  {
    key: 'condition',
    header: 'Condition',
    render: (row) => <StatusBadge status={row.condition || 'unknown'}>{row.condition || 'Unknown'}</StatusBadge>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <StatusBadge status={row.archived_at ? 'archived' : row.status}>{row.archived_at ? 'Archived' : row.status}</StatusBadge>,
  },
];

function toolLabel(tool) {
  return tool?.tool_number || tool?.name || tool?.id || 'Tool';
}

function toolSearchText(tool) {
  return [
    tool.tool_number,
    tool.name,
    tool.category,
    tool.brand,
    tool.model,
    tool.serial_number,
    tool.condition,
    tool.status,
    tool.division,
    tool.home_location,
    tool.current_location,
    tool.assigned_to,
  ].filter(Boolean).join(' ').toLowerCase();
}

function useToolCatalogue({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    tools: EMPTY_TOOLS,
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
          .from('tools')
          .select(TOOL_SELECT_FIELDS)
          .order('tool_number', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            tools: data ?? EMPTY_TOOLS,
          });
        }
      } catch (error) {
        console.error('Tool Catalogue failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            tools: EMPTY_TOOLS,
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

export function ToolsWorkspace({ permissions }) {
  const catalogue = useToolCatalogue({ enabled: permissions.permissionSource === 'server' });
  const [activeView, setActiveView] = useState('active');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedToolId, setSelectedToolId] = useState('');
  const [search, setSearch] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const tools = catalogue.tools;
  const activeTools = tools.filter((tool) => !tool.archived_at);
  const archivedTools = tools.filter((tool) => tool.archived_at);
  const missingTools = activeTools.filter((tool) => tool.status === 'missing');

  const toolViews = [
    { key: 'active', label: 'Active Tools', icon: Wrench, description: 'Current catalogue rows.', badge: activeTools.length },
    { key: 'missing', label: 'Missing', icon: ClipboardList, description: 'Tools marked missing.', badge: missingTools.length },
    { key: 'archived', label: 'Archived', icon: Archive, description: 'Soft-archived catalogue rows.', badge: archivedTools.length },
  ];

  const filteredTools = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return tools.filter((tool) => {
      if (activeView === 'active' && tool.archived_at) return false;
      if (activeView === 'missing' && (tool.archived_at || tool.status !== 'missing')) return false;
      if (activeView === 'archived' && !tool.archived_at) return false;
      if (!normalizedSearch) return true;
      return toolSearchText(tool).includes(normalizedSearch);
    });
  }, [activeView, search, tools]);

  const selectedTool = filteredTools.find((tool) => tool.id === selectedToolId)
    ?? tools.find((tool) => tool.id === selectedToolId)
    ?? null;

  useEffect(() => {
    if (selectedToolId && !tools.some((tool) => tool.id === selectedToolId)) {
      setSelectedToolId('');
    }
  }, [selectedToolId, tools]);

  function selectTool(tool) {
    setSelectedToolId(tool.id);
    setActiveTab('overview');
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Tool Catalogue"
        description="Catalogue-only foundation for company tools. Checkout, assignments, QR labels, vehicle storage, and tracking history remain reserved."
        status={<span className="status-pill">{activeTools.length} active tool{activeTools.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button" onClick={catalogue.reload} disabled={catalogue.isLoading}>
              Refresh
            </button>
            <button type="button" className="primary-button" disabled>
              <Plus aria-hidden="true" /> Add tool
            </button>
          </>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Active tools" value={activeTools.length} detail="Visible catalogue rows" />
        <SummaryCard label="Missing" value={missingTools.length} detail="Status marked missing" tone={missingTools.length ? 'warn' : 'default'} />
        <SummaryCard label="Archived" value={archivedTools.length} detail="Soft-archived rows" />
        <SummaryCard label="Write access" value={permissions.canManageInventory ? 'Possible' : 'Read only'} detail="Existing RLS uses inventory management" tone={permissions.canManageInventory ? 'good' : 'warn'} />
      </div>

      <div className={`workspace-split tools-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Tool Views"
          title="Catalogue"
          description="Browse company tools without custody workflows."
          items={toolViews}
          activeKey={activeView}
          onSelect={setActiveView}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Catalogue only</strong>
              <p>Checkout, assignments, QR labels, vehicle storage, and tracking history stay reserved.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          <article className="card workspace-card">
            <Toolbar
              eyebrow="Directory"
              title={toolViews.find((item) => item.key === activeView)?.label ?? 'Tool Catalogue'}
              description="Rows come from the existing division-scoped public.tools catalogue."
              search={(
                <label>
                  <span className="sr-only">Search tools</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search tools..."
                  />
                </label>
              )}
            />

            <DataTable
              columns={TOOL_COLUMNS}
              rows={filteredTools}
              getRowKey={(row) => row.id}
              permissions={permissions}
              isLoading={catalogue.isLoading}
              error={catalogue.error}
              onRowClick={selectTool}
              selectedRowKey={selectedTool?.id ?? null}
              dense
              minWidth="860px"
              emptyTitle={search ? 'No tools matched this search' : 'No tools to show'}
              emptyDescription={search
                ? 'Try searching by tool number, name, category, brand, model, serial number, status, or location.'
                : 'The catalogue stays honest when the existing read path has no visible tool rows.'}
            />
          </article>

          <article className="card workspace-card">
            {selectedTool ? (
              <>
                <RecordHeader
                  eyebrow="Selected Tool"
                  title={toolLabel(selectedTool)}
                  description="This selected-record shell shows catalogue fields only; custody and checkout behavior are not active in this pass."
                  meta={[
                    { label: 'Status', value: selectedTool.archived_at ? 'Archived' : selectedTool.status || 'active' },
                    { label: 'Division', value: selectedTool.division || 'Unassigned' },
                  ]}
                />
                <WorkspaceTabs
                  tabs={TOOL_TABS}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  ariaLabel="Tool detail sections"
                />

                {activeTab === 'overview' ? (
                  <div className="module-fact-grid tools-fact-grid">
                    <SummaryCard label="Category" value={selectedTool.category || '-'} detail="Catalogue field" />
                    <SummaryCard label="Brand" value={selectedTool.brand || '-'} detail="Catalogue field" />
                    <SummaryCard label="Model" value={selectedTool.model || '-'} detail="Catalogue field" />
                    <SummaryCard label="Condition" value={selectedTool.condition || 'Unknown'} detail="Catalogue field" />
                  </div>
                ) : null}

                {activeTab === 'location' ? (
                  <div className="state-panel-stack">
                    <StatePanel
                      eyebrow="Location"
                      title={selectedTool.current_location || selectedTool.home_location || 'No location recorded'}
                      description="Home and current location are plain-text catalogue placeholders in this phase. They do not create storage linkage or transfer behavior."
                      tone="neutral"
                      actions={<MapPin aria-hidden="true" />}
                    />
                    <StatePanel
                      eyebrow="Home Location"
                      title={selectedTool.home_location || 'Not provided'}
                      description="This is a catalogue text field, not an inventory storage location."
                      compact
                    />
                  </div>
                ) : null}

                {activeTab === 'assignment' ? (
                  <StatePanel
                    eyebrow="Deferred"
                    title={selectedTool.assigned_to || 'Assignment workflow is not wired yet'}
                    description="The assigned_to field is a plain-text catalogue placeholder. This pass does not create employee custody, checkout, or assignment history."
                    tone="neutral"
                  />
                ) : null}

                {activeTab === 'history' ? (
                  <StatePanel
                    eyebrow="Deferred"
                    title="Tool history is not wired yet"
                    description="Tracking history, QR labels, custody changes, vehicle storage, and checkout records remain future Tool Catalogue work."
                    tone="neutral"
                  />
                ) : null}
              </>
            ) : (
              <StatePanel
                eyebrow="No Selection"
                title="Select a tool to open the catalogue detail"
                description="The detail shell appears here when you choose a row from the visible tool catalogue."
                tone="neutral"
              />
            )}
          </article>

          <section className="tools-boundary-grid">
            <StatePanel
              eyebrow="Boundary"
              title="Add/Edit remains deferred"
              description="The existing table supports catalogue writes through RLS, but this v3 pass does not port create/edit/archive controls yet."
              compact
            />
            <StatePanel
              eyebrow="Boundary"
              title="No checkout or custody"
              description="Tool checkout, assignments, QR labels, vehicle/bin linkage, and tracking history remain reserved architecture items."
              compact
            />
            <StatePanel
              eyebrow="Boundary"
              title="No financial fields"
              description="Purchase price, vendor, accounting integration, and protected financial reporting are outside the first Tool Catalogue foundation."
              compact
            />
          </section>
        </div>
      </div>
    </>
  );
}
