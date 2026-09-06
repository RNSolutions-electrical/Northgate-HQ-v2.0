import { useAuth, useUser } from '@clerk/clerk-react';
import { ChevronDown, Archive, ClipboardList, History, MapPin, Plus, Wrench } from 'lucide-react';
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
const EMPTY_TOOL_HISTORY = Object.freeze([]);

const TOOL_CONDITION_OPTIONS = ['unknown', 'good', 'fair', 'poor', 'damaged'];
const TOOL_STATUS_OPTIONS = ['active', 'inactive', 'retired', 'missing'];

const DEFAULT_TOOL_FORM = Object.freeze({
  id: '',
  tool_number: '',
  name: '',
  category: '',
  brand: '',
  model: '',
  serial_number: '',
  description: '',
  condition: 'unknown',
  status: 'active',
  home_location: '',
  current_location: '',
  assigned_to: '',
  purchase_date: '',
  notes: '',
  archive_reason: '',
  isSaving: false,
  error: null,
  success: '',
});

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

const TOOL_HISTORY_COLUMNS = [
  { key: 'created_at', header: 'When', render: (row) => formatDateTime(row.created_at) },
  { key: 'action', header: 'Action', render: (row) => formatToolHistoryAction(row.action) },
  { key: 'user_name', header: 'User', fallback: '-' },
  { key: 'changed_fields', header: 'Changed fields', render: (row) => formatChangedFields(row.changed_fields) },
  { key: 'note', header: 'Note', fallback: '-' },
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

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatToolHistoryAction(value) {
  switch (value) {
    case 'create':
      return 'Created';
    case 'update':
      return 'Updated';
    case 'archive':
      return 'Archived';
    case 'restore':
      return 'Restored';
    default:
      return value ? value.replaceAll('_', ' ') : '-';
  }
}

function formatChangedField(value) {
  switch (value) {
    case 'id':
    case 'division':
    case 'updated_at':
      return '';
    case 'tool_number':
      return 'tool number';
    case 'serial_number':
      return 'serial number';
    case 'home_location':
      return 'home location';
    case 'current_location':
      return 'current location';
    case 'assigned_to':
      return 'assigned to';
    case 'purchase_date':
      return 'purchase date';
    case 'archived_at':
      return 'archived date';
    case 'archived_by':
      return 'archived by';
    case 'archive_reason':
      return 'archive reason';
    default:
      return value ? value.replaceAll('_', ' ') : '';
  }
}

function formatChangedFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return '-';
  const formatted = fields.map(formatChangedField).filter(Boolean);
  return formatted.length ? formatted.join(', ') : '-';
}

function canManageToolDivision(permissions, rowDivision) {
  if (permissions?.permissionSource !== 'server' || permissions?.canManageInventory !== true || !rowDivision) return false;
  if (['Developer', 'Director', 'Manager'].includes(permissions?.role)) return true;
  return permissions?.division === rowDivision;
}

function toolToForm(tool) {
  return {
    ...DEFAULT_TOOL_FORM,
    id: tool.id,
    tool_number: tool.tool_number ?? '',
    name: tool.name ?? '',
    category: tool.category ?? '',
    brand: tool.brand ?? '',
    model: tool.model ?? '',
    serial_number: tool.serial_number ?? '',
    description: tool.description ?? '',
    condition: tool.condition ?? 'unknown',
    status: tool.status ?? 'active',
    home_location: tool.home_location ?? '',
    current_location: tool.current_location ?? '',
    assigned_to: tool.assigned_to ?? '',
    purchase_date: tool.purchase_date ?? '',
    notes: tool.notes ?? '',
  };
}

function toolPayloadFromForm(form) {
  return {
    tool_number: form.tool_number.trim() || null,
    name: form.name.trim(),
    category: form.category.trim() || null,
    brand: form.brand.trim() || null,
    model: form.model.trim() || null,
    serial_number: form.serial_number.trim() || null,
    description: form.description.trim() || null,
    condition: TOOL_CONDITION_OPTIONS.includes(form.condition) ? form.condition : 'unknown',
    status: TOOL_STATUS_OPTIONS.includes(form.status) ? form.status : 'active',
    home_location: form.home_location.trim() || null,
    current_location: form.current_location.trim() || null,
    assigned_to: form.assigned_to.trim() || null,
    purchase_date: form.purchase_date || null,
    notes: form.notes.trim() || null,
  };
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

function useToolHistory({ enabled, toolId }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    rows: EMPTY_TOOL_HISTORY,
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!enabled || !toolId) {
        setState({ isLoading: false, error: null, rows: EMPTY_TOOL_HISTORY });
        return;
      }

      setState((current) => ({ ...current, isLoading: true, error: null }));

      try {
        const token = await getToken({ template: 'supabase' });
        const client = createSupabaseClient(token);
        const { data, error } = await client.rpc('read_tool_change_history', {
          p_tool_id: toolId,
          p_limit: 100,
        });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            rows: data ?? EMPTY_TOOL_HISTORY,
          });
        }
      } catch (error) {
        console.error('Tool history failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            rows: EMPTY_TOOL_HISTORY,
          });
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [enabled, getToken, refreshKey, toolId]);

  return {
    ...state,
    reload: () => setRefreshKey((current) => current + 1),
  };
}

export function ToolsWorkspace({ permissions }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const catalogue = useToolCatalogue({ enabled: permissions.permissionSource === 'server' });
  const [activeView, setActiveView] = useState('active');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedToolId, setSelectedToolId] = useState('');
  const [search, setSearch] = useState('');
  const [toolForm, setToolForm] = useState(DEFAULT_TOOL_FORM);
  const [isToolFormOpen, setIsToolFormOpen] = useState(false);
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
  const toolHistory = useToolHistory({
    enabled: permissions.permissionSource === 'server',
    toolId: selectedTool?.id ?? '',
  });
  const canManageToolCatalogue = permissions.permissionSource === 'server'
    && permissions.canManageInventory === true
    && Boolean(permissions.division);

  useEffect(() => {
    if (selectedToolId && !tools.some((tool) => tool.id === selectedToolId)) {
      setSelectedToolId('');
    }
  }, [selectedToolId, tools]);

  function selectTool(tool) {
    setSelectedToolId(current => current === tool.id ? '' : tool.id);
    setActiveTab('overview');
  }

  function resetToolForm() {
    if (toolForm.isSaving) return;
    setToolForm(DEFAULT_TOOL_FORM);
    setIsToolFormOpen(false);
    setSelectedToolId('');
  }

  function startToolCreate() {
    setToolForm(DEFAULT_TOOL_FORM);
    setSelectedToolId('');
    setIsPrimaryOpen(false);
    setIsToolFormOpen(true);
  }

  function setToolFormValue(key, value) {
    setToolForm((current) => ({ ...current, [key]: value, error: null, success: '' }));
  }

  function startToolEdit(tool) {
    setIsToolFormOpen(true);
    setSelectedToolId(tool.id);
    setActiveTab('overview');
    setToolForm(toolToForm(tool));
  }

  async function getToolClient() {
    const token = await getToken({ template: 'supabase' });
    return createSupabaseClient(token);
  }

  async function writeToolChangeLog(client, { action, recordId, beforeData, afterData, note }) {
    const { error } = await client.rpc('record_client_audit_event', {
      p_table_name: 'tools',
      p_record_id: recordId,
      p_action: action,
      p_before_data: beforeData,
      p_after_data: afterData,
      p_note: note,
    });

    if (error) throw error;
  }

  async function handleToolSave(event) {
    event.preventDefault();
    if (!canManageToolCatalogue || toolForm.isSaving) return;

    if (!toolForm.name.trim()) {
      setToolForm((current) => ({ ...current, error: new Error('Enter a tool name before saving.') }));
      return;
    }

    if (!permissions.division) {
      setToolForm((current) => ({ ...current, error: new Error('Your session does not include a division, so tool saves are blocked.') }));
      return;
    }

    const existingTool = toolForm.id ? tools.find((tool) => tool.id === toolForm.id) : null;
    if (existingTool && !canManageToolDivision(permissions, existingTool.division)) {
      setToolForm((current) => ({ ...current, error: new Error('This tool belongs to another division, so your current session cannot edit it.') }));
      return;
    }

    setToolForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const client = await getToolClient();
      const payload = toolPayloadFromForm(toolForm);
      const query = toolForm.id
        ? client
          .from('tools')
          .update(payload)
          .eq('id', toolForm.id)
          .select(TOOL_SELECT_FIELDS)
          .single()
        : client
          .from('tools')
          .insert({ ...payload, division: permissions.division })
          .select(TOOL_SELECT_FIELDS)
          .single();

      const { data, error } = await query;
      if (error) throw error;

      await writeToolChangeLog(client, {
        action: toolForm.id ? 'update' : 'create',
        recordId: data.id,
        beforeData: existingTool,
        afterData: data,
        note: toolForm.id ? 'Tool catalogue update' : 'Tool catalogue create',
      });

      catalogue.reload();
      toolHistory.reload();
      setIsToolFormOpen(false);
      setSelectedToolId('');
      if (!toolForm.id) { setActiveView('active'); setSearch(''); }
      setToolForm({
        ...DEFAULT_TOOL_FORM,
        success: `${payload.name} ${toolForm.id ? 'updated' : 'added'} in Tool Catalogue.`,
      });
    } catch (error) {
      console.error('Tool save failed', error);
      setToolForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  async function handleToolArchive(tool) {
    if (!canManageToolCatalogue || toolForm.isSaving) return;

    if (!canManageToolDivision(permissions, tool.division)) {
      setToolForm((current) => ({ ...current, error: new Error('This tool belongs to another division, so your current session cannot archive it.'), success: '' }));
      return;
    }

    const isArchived = Boolean(tool.archived_at);
    const archiveReason = toolForm.id === tool.id ? toolForm.archive_reason.trim() : '';
    if (!isArchived && !archiveReason) {
      setIsToolFormOpen(true);
      setSelectedToolId(tool.id);
      setToolForm({
        ...toolToForm(tool),
        error: new Error('Enter an archive reason in the form before archiving this tool.'),
      });
      return;
    }

    setToolForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));

    try {
      const client = await getToolClient();
      const { data, error } = await client
        .from('tools')
        .update(isArchived
          ? { archived_at: null, archived_by: null, archive_reason: null }
          : {
            archived_at: new Date().toISOString(),
            archived_by: permissions.userId,
            archive_reason: archiveReason,
          })
        .eq('id', tool.id)
        .select(TOOL_SELECT_FIELDS)
        .single();

      if (error) throw error;

      await writeToolChangeLog(client, {
        action: isArchived ? 'restore' : 'archive',
        recordId: tool.id,
        beforeData: tool,
        afterData: data,
        note: isArchived ? 'Tool catalogue restore' : archiveReason,
      });

      catalogue.reload();
      toolHistory.reload();
      setToolForm({
        ...DEFAULT_TOOL_FORM,
        success: `${toolLabel(tool)} ${isArchived ? 'restored' : 'archived'} in Tool Catalogue.`,
      });
      setIsToolFormOpen(false);
      setSelectedToolId('');
    } catch (error) {
      console.error('Tool archive failed', error);
      setToolForm((current) => ({ ...current, isSaving: false, error, success: '' }));
    }
  }

  const toolColumns = [
    ...TOOL_COLUMNS,
    {
      key: 'actions',
      header: 'Actions',
      width: '180px',
      render: (row) => {
        const canMutateRow = canManageToolDivision(permissions, row.division);
        return (
          <div className="tool-catalogue-actions" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="secondary-button" onClick={() => startToolEdit(row)} hidden={!canMutateRow} disabled={!canMutateRow || toolForm.isSaving}>
              Edit
            </button>
            <button type="button" className="secondary-button secondary-button--danger" onClick={() => handleToolArchive(row)} hidden={!canMutateRow} disabled={!canMutateRow || toolForm.isSaving}>
              {row.archived_at ? 'Restore' : 'Archive'}
            </button>
          </div>
        );
      },
    },
  ];

  function renderToolDetails() { return (<div className="tools-expanded-detail">
            {selectedTool ? (
              <>
                <RecordHeader descriptionIsDiagnostic
                  eyebrow="Selected Tool"
                  title={toolLabel(selectedTool)}
                  description="This selected-record shell shows catalogue fields only; custody and checkout behavior are not active in this pass."
                  meta={[
                    { label: 'Name', value: selectedTool.name || '-' },
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
                    <SummaryCard detailIsDiagnostic label="Category" value={selectedTool.category || '-'} detail="Catalogue field" />
                    <SummaryCard detailIsDiagnostic label="Brand" value={selectedTool.brand || '-'} detail="Catalogue field" />
                    <SummaryCard detailIsDiagnostic label="Model" value={selectedTool.model || '-'} detail="Catalogue field" />
                    <SummaryCard detailIsDiagnostic label="Condition" value={selectedTool.condition || 'Unknown'} detail="Catalogue field" />
                    <SummaryCard label="Serial #" value={selectedTool.serial_number || '-'} />
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
                  <>
                    <div className="summary-grid summary-grid--compact">
                      <SummaryCard label="Audit Entries" value={toolHistory.rows.length} detail="Recent tool changes" />
                      <SummaryCard label="Updates" value={toolHistory.rows.filter((row) => row.action === 'update').length} detail="Recorded edits" />
                      <SummaryCard label="Archives" value={toolHistory.rows.filter((row) => row.action === 'archive').length} detail="Archive events" tone={toolHistory.rows.some((row) => row.action === 'archive') ? 'warn' : 'default'} />
                    </div>
                    <Toolbar descriptionIsDiagnostic
                      eyebrow="Audit"
                      title="Tool History"
                      description="Read-only audit entries for this tool catalogue row."
                      actions={(
                        <button type="button" className="secondary-button" onClick={toolHistory.reload} disabled={toolHistory.isLoading}>
                          <History aria-hidden="true" /> Refresh History
                        </button>
                      )}
                      dense
                    />
                    <DataTable
                      columns={TOOL_HISTORY_COLUMNS}
                      rows={toolHistory.rows}
                      getRowKey={(row) => row.id}
                      permissions={permissions}
                      isLoading={toolHistory.isLoading}
                      error={toolHistory.error}
                      dense
                      minWidth="900px"
                      emptyTitle="No tool history yet"
                      emptyDescription="Tool create, edit, archive, and restore events will appear here after they are recorded."
                    />
                  </>
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
          </div>); }

  function renderToolForm() { return (<form className="tool-catalogue-form" onSubmit={handleToolSave}>
            <Toolbar descriptionIsDiagnostic
              eyebrow={toolForm.id ? 'Edit' : 'Add'}
              title={toolForm.id ? 'Edit Tool' : 'New Tool'}
              description={canManageToolCatalogue
                ? 'Tool writes follow level/division scope. Checkout and custody workflows remain deferred.'
                : 'Tool catalogue writes require inventory management permission and a current division.'}
              actions={(
                <button type="button" className="secondary-button" onClick={resetToolForm} disabled={toolForm.isSaving}>
                  Cancel
                </button>
              )}
              dense
            />
            <div className="tool-catalogue-form__grid">
              <label>
                <span>Name</span>
                <input type="text" value={toolForm.name} onChange={(event) => setToolFormValue('name', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} required />
              </label>
              <label>
                <span>Tool #</span>
                <input type="text" value={toolForm.tool_number} onChange={(event) => setToolFormValue('tool_number', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              <label>
                <span>Category</span>
                <input type="text" value={toolForm.category} onChange={(event) => setToolFormValue('category', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              <label>
                <span>Status</span>
                <select value={toolForm.status} onChange={(event) => setToolFormValue('status', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving}>
                  {TOOL_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label>
                <span>Brand</span>
                <input type="text" value={toolForm.brand} onChange={(event) => setToolFormValue('brand', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              <label>
                <span>Model</span>
                <input type="text" value={toolForm.model} onChange={(event) => setToolFormValue('model', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              <label>
                <span>Serial #</span>
                <input type="text" value={toolForm.serial_number} onChange={(event) => setToolFormValue('serial_number', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              <label>
                <span>Condition</span>
                <select value={toolForm.condition} onChange={(event) => setToolFormValue('condition', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving}>
                  {TOOL_CONDITION_OPTIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                </select>
              </label>
              <label>
                <span>Home Location</span>
                <input type="text" value={toolForm.home_location} onChange={(event) => setToolFormValue('home_location', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              <label>
                <span>Current Location</span>
                <input type="text" value={toolForm.current_location} onChange={(event) => setToolFormValue('current_location', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              <label>
                <span>Assigned To</span>
                <input type="text" value={toolForm.assigned_to} onChange={(event) => setToolFormValue('assigned_to', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              <label>
                <span>Purchase Date</span>
                <input type="date" value={toolForm.purchase_date} onChange={(event) => setToolFormValue('purchase_date', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              <label className="tool-catalogue-form__wide">
                <span>Description</span>
                <textarea rows={3} value={toolForm.description} onChange={(event) => setToolFormValue('description', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              <label className="tool-catalogue-form__wide">
                <span>Notes</span>
                <textarea rows={3} value={toolForm.notes} onChange={(event) => setToolFormValue('notes', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} />
              </label>
              {toolForm.id ? <label className="tool-catalogue-form__wide">
                <span>Archive Reason</span>
                <textarea rows={2} value={toolForm.archive_reason} onChange={(event) => setToolFormValue('archive_reason', event.target.value)} disabled={!canManageToolCatalogue || toolForm.isSaving} placeholder="Required before archiving a tool." />
              </label> : null}
            </div>
            {toolForm.error ? (
              <StatePanel tone="danger" eyebrow="Tool Save Failed" title="Tool action did not complete" description={toolForm.error.message || 'Unexpected tool catalogue error.'} compact />
            ) : null}
            {toolForm.success ? (
              <StatePanel tone="success" eyebrow="Saved" title="Tool catalogue updated" description={toolForm.success} compact />
            ) : null}
            <div className="tool-catalogue-form__actions">
              {toolForm.id && selectedTool ? <button type="button" className="secondary-button" disabled={toolForm.isSaving} onClick={() => handleToolArchive(selectedTool)}>{selectedTool.archived_at ? 'Restore Tool' : 'Archive Tool'}</button> : null}
              <button hidden={!canManageToolCatalogue} type="submit" className="primary-button" disabled={!canManageToolCatalogue || toolForm.isSaving || !toolForm.name.trim()}>
                <Plus aria-hidden="true" /> {toolForm.isSaving ? 'Saving...' : toolForm.id ? 'Save Tool' : 'Add Tool'}
              </button>
            </div>
          </form>); }

  if (isToolFormOpen && canManageToolCatalogue) {
    return <section className="tools-editor" aria-label={toolForm.id ? 'Edit tool module' : 'Add tool module'}>
      <WorkspaceHeader eyebrow="Tools" title={toolForm.id ? 'Edit Tool' : 'Add a Tool'} />
      {renderToolForm()}
    </section>;
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
              Page Menu
            </button>
            <button type="button" className="secondary-button" onClick={catalogue.reload} disabled={catalogue.isLoading}>
              Refresh
            </button>
            <button hidden={!canManageToolCatalogue} type="button" className="primary-button" onClick={startToolCreate} disabled={!canManageToolCatalogue || toolForm.isSaving}>
              <Plus aria-hidden="true" /> Add a tool
            </button>
          </>
        )}
      />

      {toolForm.success ? <StatePanel title="Tool catalogue updated" description={toolForm.success} tone="good" compact /> : null}
      {toolForm.error ? <StatePanel title="Tool action did not complete" description={toolForm.error.message} tone="danger" compact /> : null}
      <div className="summary-grid">
        <SummaryCard detailIsDiagnostic label="Active tools" value={activeTools.length} detail="Visible catalogue rows" />
        <SummaryCard label="Missing" value={missingTools.length} detail="Status marked missing" tone={missingTools.length ? 'warn' : 'default'} />
        <SummaryCard detailIsDiagnostic label="Archived" value={archivedTools.length} detail="Soft-archived rows" />
        <SummaryCard detailIsDiagnostic developmentOnly label="Write access" value={permissions.canManageInventory ? 'Possible' : 'Read only'} detail="Existing RLS uses inventory management" tone={permissions.canManageInventory ? 'good' : 'warn'} />
      </div>

      <div className={`workspace-split tools-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Tool Views"
          title="Catalogue"
          description="Browse company tools without custody workflows."
          items={toolViews}
          activeKey={activeView}
          onSelect={view => { setActiveView(view); setSelectedToolId(''); setIsPrimaryOpen(false); }}
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
            <Toolbar descriptionIsDiagnostic
              eyebrow="Directory"
              title={toolViews.find((item) => item.key === activeView)?.label ?? 'Tool Catalogue'}
              description="Rows come from the existing public.tools catalogue and follow level/division scope."
              search={(
                <label>
                  <span className="sr-only">Search tools</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setSelectedToolId(''); }}
                    placeholder="Search tools..."
                  />
                </label>
              )}
            />

            {catalogue.isLoading ? <StatePanel title="Loading tools..." compact /> : catalogue.error
              ? <StatePanel title="Tools could not be loaded" description={catalogue.error.message} tone="danger" />
              : filteredTools.length === 0 ? <StatePanel title={search ? 'No tools matched this search' : 'No tools to show'} />
              : <div className="tools-compact-list">
                <div className="tools-compact-labels" aria-hidden="true"><span>Tool #</span><span>Category</span><span>Model</span><span /></div>
                {filteredTools.map(tool => <div className="tools-compact-item" key={tool.id}>
                  <button type="button" className="tools-compact-row" aria-expanded={selectedToolId === tool.id}
                    aria-controls={`tool-detail-${tool.id}`} onClick={() => selectTool(tool)}>
                    <strong>{tool.tool_number || '-'}</strong><span>{tool.category || '-'}</span><span>{tool.model || '-'}</span>
                    <ChevronDown aria-hidden="true" />
                  </button>
                  {selectedToolId === tool.id ? <section id={`tool-detail-${tool.id}`} aria-label={`Details for ${toolLabel(tool)}`}>
                    {toolColumns.find(column => column.key === 'actions').render(tool)}
                    {renderToolDetails()}
                  </section> : null}
                </div>)}
              </div>}
          </article>



          <section className="tools-boundary-grid">
            <StatePanel
              eyebrow="Boundary"
              title="Catalogue writes are active"
              description="Add, edit, archive, and restore now use the existing public.tools table and level/division RLS."
              compact
            />
            <StatePanel
              eyebrow="Boundary"
              title="No checkout or custody"
              description="Tool checkout, assignments, QR labels, and vehicle/bin linkage remain reserved architecture items. Catalogue change history is live."
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
