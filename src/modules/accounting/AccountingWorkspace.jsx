import { useAuth } from '@clerk/clerk-react';
import {
  BarChart3,
  CircleDollarSign,
  FileDown,
  LockKeyhole,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';

const EMPTY_BUDGET_LINES = Object.freeze([]);

const BUDGET_SELECT_FIELDS = [
  'id',
  'job_id',
  'division',
  'created_at',
  'updated_at',
  'archived_at',
  'category',
  'cost_code',
  'description',
  'budget_amount',
  'sort_order',
  'note',
  'created_by',
].join(', ');

const ACCOUNTING_VIEWS = [
  {
    key: 'budget-review',
    label: 'Budget Review',
    icon: CircleDollarSign,
    description: 'Read-only budget foundation rows.',
  },
  {
    key: 'category-totals',
    label: 'Category Totals',
    icon: BarChart3,
    description: 'Budget totals grouped by locked categories.',
  },
  {
    key: 'exports',
    label: 'Export Readiness',
    icon: FileDown,
    description: 'Approved export boundaries.',
  },
  {
    key: 'controls',
    label: 'Reserved Controls',
    icon: SlidersHorizontal,
    description: 'Pricing, invoice, PO, and posting boundaries.',
  },
];

const BUDGET_COLUMNS = [
  { key: 'job_id', header: 'Job', render: (row) => <strong>{shortId(row.job_id)}</strong> },
  { key: 'division', header: 'Division', fallback: '-' },
  {
    key: 'category',
    header: 'Category',
    render: (row) => <StatusBadge status={row.category}>{formatCategory(row.category)}</StatusBadge>,
  },
  { key: 'cost_code', header: 'Cost Code', fallback: '-' },
  { key: 'description', header: 'Description' },
  {
    key: 'budget_amount',
    header: 'Budget',
    numeric: true,
    align: 'right',
    render: (row) => formatMoney(row.budget_amount),
  },
  { key: 'updated_at', header: 'Updated', render: (row) => formatDate(row.updated_at || row.created_at) },
];

function useAccountingBudgetLines({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    rows: EMPTY_BUDGET_LINES,
    lastLoadedAt: null,
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
          .from('job_budget_lines')
          .select(BUDGET_SELECT_FIELDS)
          .is('archived_at', null)
          .order('division', { ascending: true, nullsFirst: false })
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1000);

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            rows: data ?? EMPTY_BUDGET_LINES,
            lastLoadedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to load accounting budget review rows', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            rows: EMPTY_BUDGET_LINES,
            lastLoadedAt: null,
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

function formatMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '$0.00';
  return numeric.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatCategory(value) {
  return String(value || 'other').replaceAll('_', ' ');
}

function shortId(value) {
  if (!value) return '-';
  return String(value).slice(0, 8);
}

function filterBudgetRows(rows, search) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return rows;

  return rows.filter((row) =>
    [
      row.job_id,
      row.division,
      row.category,
      row.cost_code,
      row.description,
      row.note,
      row.created_by,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalized),
  );
}

function summarizeRows(rows) {
  const totalBudget = rows.reduce((total, row) => total + (Number(row.budget_amount) || 0), 0);
  const jobs = new Set(rows.map((row) => row.job_id).filter(Boolean));
  const divisions = new Set(rows.map((row) => row.division).filter(Boolean));
  const categories = new Map();

  rows.forEach((row) => {
    const key = row.category || 'other';
    const current = categories.get(key) ?? { category: key, count: 0, total: 0 };
    current.count += 1;
    current.total += Number(row.budget_amount) || 0;
    categories.set(key, current);
  });

  return {
    totalBudget,
    jobs: jobs.size,
    divisions: divisions.size,
    categories: Array.from(categories.values()).sort((a, b) => b.total - a.total),
  };
}

export function AccountingWorkspace({ permissions }) {
  const canLoadAccounting = permissions?.permissionSource === 'server' && permissions?.canViewFinancials === true;
  const budgetLines = useAccountingBudgetLines({ enabled: canLoadAccounting });
  const [activeView, setActiveView] = useState('budget-review');
  const [search, setSearch] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const visibleRows = useMemo(
    () => filterBudgetRows(budgetLines.rows, search),
    [budgetLines.rows, search],
  );
  const summary = useMemo(() => summarizeRows(visibleRows), [visibleRows]);

  const views = ACCOUNTING_VIEWS.map((view) => ({
    ...view,
    badge: {
      'budget-review': visibleRows.length,
      'category-totals': summary.categories.length,
      exports: null,
      controls: null,
    }[view.key],
  }));

  function renderActiveView() {
    if (!canLoadAccounting) {
      return (
        <StatePanel
          eyebrow="Permission Scope"
          title="Financial access is required"
          description="Accounting remains gated by can_view_financials and server-side RLS. No budget rows are requested without that grant."
          tone="warning"
        />
      );
    }

    if (activeView === 'category-totals') {
      return (
        <article className="card workspace-card">
          <Toolbar
            eyebrow="Review"
            title="Category Totals"
            description="Totals are calculated client-side from the authorized budget rows currently returned by Supabase."
            dense
          />
          {summary.categories.length ? (
            <div className="accounting-category-grid">
              {summary.categories.map((item) => (
                <SummaryCard
                  key={item.category}
                  label={formatCategory(item.category)}
                  value={formatMoney(item.total)}
                  detail={`${item.count} budget line${item.count === 1 ? '' : 's'}`}
                  tone="accent"
                />
              ))}
            </div>
          ) : (
            <StatePanel
              title="No category totals yet"
              description="Authorized budget rows will be grouped here when they exist."
              compact
            />
          )}
        </article>
      );
    }

    if (activeView === 'exports') {
      return (
        <section className="accounting-boundary-grid">
          <StatePanel
            eyebrow="Exports"
            title="No accounting export is generated"
            description="This v3 pass does not create CSV, JSON, workbook, invoice, PO, or accounting-system files. Export behavior still requires a separate approved implementation."
            tone="warning"
            compact
            actions={<FileDown aria-hidden="true" />}
          />
          <StatePanel
            eyebrow="Authorized Fields"
            title="Budget review only"
            description="The only financial values requested here are existing job budget line amounts visible through can_view_financials."
            tone="good"
            compact
            actions={<LockKeyhole aria-hidden="true" />}
          />
        </section>
      );
    }

    if (activeView === 'controls') {
      return (
        <section className="accounting-boundary-grid">
          <StatePanel
            eyebrow="Pricing Controls"
            title="Pricing changes stay reserved"
            description="This workspace does not write estimates, material prices, catalog costs, budget lines, margins, or approval decisions."
            tone="warning"
            compact
            actions={<SlidersHorizontal aria-hidden="true" />}
          />
          <StatePanel
            eyebrow="Accounting Posting"
            title="Actuals, PO, and invoices are not modeled"
            description="There is no posting queue, reconciliation state, committed cost, revenue, profit, invoice, purchase order, or external accounting integration in this slice."
            tone="warning"
            compact
            actions={<CircleDollarSign aria-hidden="true" />}
          />
        </section>
      );
    }

    return (
      <article className="card workspace-card">
        <Toolbar
          eyebrow="Budget Foundation"
          title="Budget Review"
          description="Read-only active rows from job_budget_lines. Archived rows and write controls are excluded."
          dense
        />
        <DataTable
          columns={BUDGET_COLUMNS}
          rows={visibleRows}
          getRowKey={(row) => row.id}
          permissions={permissions}
          isLoading={budgetLines.isLoading}
          error={budgetLines.error}
          dense
          minWidth="920px"
          emptyTitle="No budget lines available"
          emptyDescription="Accounting is live, but the current authorized scope has no active budget foundation rows."
        />
      </article>
    );
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Accounting"
        description="Read-only financial review over the approved Job Financials Budget Foundation. Export files, accounting posts, invoices, purchase orders, and pricing writes remain reserved."
        status={<span className="status-pill">{visibleRows.length} budget line{visibleRows.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button" onClick={budgetLines.reload} disabled={budgetLines.isLoading || !canLoadAccounting}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          </>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Budget Lines" value={visibleRows.length} detail="Active authorized rows" />
        <SummaryCard label="Budget Total" value={formatMoney(summary.totalBudget)} detail="Budget foundation only" tone="good" />
        <SummaryCard label="Jobs" value={summary.jobs} detail="Distinct job IDs in scope" />
        <SummaryCard label="Divisions" value={summary.divisions} detail="Visible divisions in scope" />
      </div>

      <div className={`workspace-split accounting-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Accounting Views"
          title="Accounting"
          description="Review first; exports and posting stay bounded."
          items={views}
          activeKey={activeView}
          onSelect={(key) => {
            setActiveView(key);
            setSearch('');
          }}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Guardrails</strong>
              <p>Only existing budget foundation rows are selected. No export, approval, invoice, PO, or accounting post is performed.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          {activeView === 'budget-review' ? (
            <article className="card workspace-card">
              <Toolbar
                eyebrow="Filter"
                title="Budget Lines"
                description="Client-side filtering over rows already authorized by RLS."
                search={(
                  <label>
                    <span className="sr-only">Search accounting budget rows</span>
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search job, category, code..."
                    />
                  </label>
                )}
                actions={(
                  <button type="button" className="secondary-button" onClick={() => setSearch('')} disabled={!search}>
                    Clear
                  </button>
                )}
                dense
              />
            </article>
          ) : null}

          {renderActiveView()}

          <section className="accounting-boundary-grid">
            <StatePanel
              eyebrow="Permission Scope"
              title="Financial review remains gated"
              description="The route is visible only to can_view_financials users, and Supabase RLS remains the authority for every returned row."
              tone="good"
              compact
              actions={<LockKeyhole aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Data Contract"
              title="No accounting writes"
              description="This surface performs one read-only query against job_budget_lines and does not mutate budget, inventory, estimate, job, invoice, or export records."
              tone="good"
              compact
              actions={<CircleDollarSign aria-hidden="true" />}
            />
          </section>
        </div>
      </div>
    </>
  );
}
