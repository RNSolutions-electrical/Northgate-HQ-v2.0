import {
  ArrowLeft,
  Calculator,
  FileText,
  History,
  LockKeyhole,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { RecordHeader } from '../../components/ui/RecordHeader.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { WorkspaceTabs } from '../../components/ui/WorkspaceTabs.jsx';

const ESTIMATE_VIEWS = [
  { key: 'all', label: 'All Estimates', icon: FileText, description: 'Directory foundation for every visible estimate.' },
  { key: 'mine', label: 'My Estimates', icon: UserRound, description: 'Reserved for the current estimator queue.' },
  { key: 'drafts', label: 'Drafts', icon: Pencil, description: 'Draft estimate layout foundation.' },
  { key: 'submitted', label: 'Submitted', icon: Send, description: 'Submitted estimate queue foundation.' },
  { key: 'approved', label: 'Approved', icon: ShieldCheck, description: 'Approved estimate archive foundation.' },
];

const ESTIMATE_TABS = [
  { key: 'overview', label: 'Overview', disabled: true, meta: 'Needs a selected estimate' },
  { key: 'pricing', label: 'Pricing', disabled: true, meta: 'Permission gated' },
  { key: 'documents', label: 'Documents', disabled: true, meta: 'Reserved' },
  { key: 'approval', label: 'Approval', disabled: true, meta: 'Reserved' },
  { key: 'history', label: 'History', disabled: true, meta: 'Reserved' },
];

const STATUS_RULES = [
  ['draft', 'In progress, not submitted.'],
  ['pursuit', 'Saved lead or opportunity, not an active job.'],
  ['submitted', 'Sent to the client.'],
  ['approved', 'Accepted and requires an immutable approval snapshot.'],
  ['rejected', 'Declined by the client.'],
  ['archived', 'Removed from active views.'],
];

export function EstimatesWorkspace({ permissions }) {
  const [activeView, setActiveView] = useState('all');
  const [mode, setMode] = useState('browse');
  const [search, setSearch] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const selectedView = ESTIMATE_VIEWS.find((item) => item.key === activeView) ?? ESTIMATE_VIEWS[0];
  const canEstimate = permissions?.canEstimate === true;
  const canApproveEstimates = permissions?.canApproveEstimates === true;
  const canViewFinancials = permissions?.canViewFinancials === true;

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Estimates"
        description="Browse, create, approval, and selected-record structure for estimates. Real estimate reads and writes remain deferred until an approved estimate read model is wired."
        status={<span className="status-pill">{mode === 'create' ? 'Create mode' : selectedView.label}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="primary-button" onClick={() => setMode('create')}>
              <Plus aria-hidden="true" /> Create Estimate
            </button>
          </>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Estimate access" value={canEstimate ? 'Granted' : 'No'} detail="Existing can_estimate permission" developmentOnly />
        <SummaryCard label="Approval access" value={canApproveEstimates ? 'Granted' : 'No'} detail="Existing approval boundary" developmentOnly />
        <SummaryCard label="Financial visibility" value={canViewFinancials ? 'Granted' : 'Hidden'} detail="Protected fields stay gated" developmentOnly />
        <SummaryCard label="Snapshot rule" value="Locked" detail="Approved snapshots remain immutable" tone="good" developmentOnly />
      </div>

      <div className={`workspace-split estimates-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Estimate Views"
          title="Estimates"
          description="Use the same browse/create/detail pattern established by the other module shells."
          items={ESTIMATE_VIEWS}
          activeKey={activeView}
          onSelect={(key) => {
            setActiveView(key);
            setMode('browse');
          }}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Foundation only</strong>
              <p>No estimate records, pricing, approvals, or create handlers are fabricated in this pass.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          <article className="card workspace-card">
            <Toolbar
              eyebrow="Directory"
              title={selectedView.label}
              description="The list surface is ready, but the repository still does not expose an approved production estimate read path here."
              search={(
                <label>
                  <span className="sr-only">Search estimates</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search estimates..."
                  />
                </label>
              )}
              actions={(
                <button type="button" className="secondary-button" onClick={() => setSearch('')} disabled={!search}>
                  Clear
                </button>
              )}
            />

            <StatePanel
              eyebrow={search ? 'No Results' : 'Read Model Pending'}
              title={search ? 'No estimates match this search yet' : 'Estimate directory is structurally ready'}
              description={search
                ? 'Search is local UI state only for now because a real estimate dataset is not wired into this workspace.'
                : 'The final rows, filters, selected-estimate header, and protected financial columns will live here once an approved estimate read path exists.'}
              tone="neutral"
            />
          </article>

          <article className="card workspace-card">
            {mode === 'create' ? (
              <StatePanel
                eyebrow="Create Mode"
                title="Create Estimate will live here"
                description="The create surface is explicit and separate from browse mode, but no estimate creation workflow or pricing write path is being invented in this pass."
                tone="info"
                actions={(
                  <button type="button" className="secondary-button" onClick={() => setMode('browse')}>
                    <ArrowLeft aria-hidden="true" /> Back to All Estimates
                  </button>
                )}
              />
            ) : (
              <>
                <RecordHeader
                  eyebrow="Selected Estimate"
                  title="No estimate selected"
                  description="Browse mode remains separate from create mode, and this detail shell waits for a real estimate record selection."
                  meta={[
                    { label: 'View', value: selectedView.label },
                    { label: 'Protected pricing', value: canViewFinancials ? 'Visible when live' : 'Hidden when live' },
                  ]}
                />
                <WorkspaceTabs
                  tabs={ESTIMATE_TABS}
                  activeKey="overview"
                  onChange={() => {}}
                  ariaLabel="Estimate detail sections"
                />
                <StatePanel
                  eyebrow="No Selection"
                  title="Select an estimate when a real directory is available"
                  description="This panel is reserved for the persistent estimate header, tabs, snapshots, documents, and approved actions once a supported estimate record can be selected."
                  tone="neutral"
                />
              </>
            )}
          </article>

          <section className="estimates-boundary-grid">
            <StatePanel
              eyebrow="Snapshot Boundary"
              title="Approved snapshots stay immutable"
              description="Architecture requires database-level protection for locked estimate snapshots. This UI pass does not touch snapshot schema, triggers, updates, or deletes."
              tone="good"
              compact
              actions={<LockKeyhole aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Status Model"
              title="Locked statuses are preserved"
              description="Draft, pursuit, submitted, approved, rejected, and archived remain the approved estimate status vocabulary."
              tone="neutral"
              compact
              actions={<History aria-hidden="true" />}
            />
            <StatePanel
              eyebrow="Approval Flow"
              title="Approval remains deferred"
              description="Approving an estimate must create a locked snapshot. This pass adds no approval button, shortcut, or hidden write fallback."
              tone="warning"
              compact
              actions={<Calculator aria-hidden="true" />}
            />
          </section>

          <article className="card workspace-card">
            <Toolbar
              eyebrow="Locked Vocabulary"
              title="Estimate statuses"
              description="These labels are shown as implementation guidance only; there is no estimate table read in this pass."
              dense
            />
            <div className="estimates-status-list">
              {STATUS_RULES.map(([status, description]) => (
                <div className="profile-field" key={status}>
                  <span>{status}</span>
                  <strong>{description}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
