import { useUser } from '@clerk/clerk-react';
import {
  FileText,
  HardHat,
  SlidersHorizontal,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';

function missing(value) {
  return value || 'Not provided';
}

function permissionLabel(value) {
  return value === true ? 'Granted' : 'Not granted';
}

export function DashboardWorkspace({ permissions }) {
  const { user } = useUser();
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState('my-info');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const canSeeEstimates = permissions.permissionSource === 'server'
    && (permissions.canEstimate || permissions.canApproveEstimates);

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

      <div className="summary-grid">
        <SummaryCard label="Permission source" value={permissions.permissionSource} detail="Server state only" tone={permissions.permissionSource === 'server' ? 'good' : 'warn'} />
        <SummaryCard label="Role" value={permissions.role ?? 'User'} detail={permissions.division ?? 'No division'} />
        <SummaryCard label="Inventory" value={permissionLabel(permissions.canManageInventory || permissions.canInventoryTransactions)} detail="Existing flags" />
        <SummaryCard label="Jobs" value={permissionLabel(permissions.canCreateJobs || permissions.canManageJobs)} detail="Existing flags" />
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
              <StatePanel
                eyebrow="My Vehicles"
                title="Vehicles assigned directly to you"
                description="The current vehicle reference source exposes vehicle identity and division only. It does not expose direct user assignment or reporting relationships, so personalized vehicle groupings remain deferred."
                actions={<button type="button" className="secondary-button" onClick={() => openModule('/vehicles')}>Open Vehicles</button>}
              />
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
              <StatePanel
                eyebrow="My Estimates"
                title="Estimate layout is ready, but the personal estimate read source is still missing"
                description="The repository currently exposes estimate permissions but not an approved estimate read model in this UI layer, so this dashboard keeps the final workspace reserved without fabricating estimate rows or statuses."
                actions={<button type="button" className="secondary-button" onClick={() => openModule('/estimates')}>Open Estimates</button>}
              />
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
