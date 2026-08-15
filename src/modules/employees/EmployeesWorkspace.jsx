import { useAuth, useUser } from '@clerk/clerk-react';
import { Plus, ShieldCheck, UserRound, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PrimarySidebar } from '../../components/layout/PrimarySidebar.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { RecordHeader } from '../../components/ui/RecordHeader.jsx';
import { StatePanel } from '../../components/ui/StatePanel.jsx';
import { SummaryCard } from '../../components/ui/SummaryCard.jsx';
import { Toolbar } from '../../components/ui/Toolbar.jsx';
import { WorkspaceHeader } from '../../components/ui/WorkspaceHeader.jsx';
import { WorkspaceTabs } from '../../components/ui/WorkspaceTabs.jsx';
import { createSupabaseClient } from '../../services/supabaseClient.js';

const EMPTY_PEOPLE = Object.freeze([]);

const EMPLOYEE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'contact', label: 'Contact' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'activity', label: 'Activity' },
];

const EMPLOYEE_COLUMNS = [
  { key: 'display_name', header: 'Name', render: (row) => <strong>{employeeLabel(row)}</strong> },
  { key: 'role', header: 'Role', fallback: 'User' },
  { key: 'division', header: 'Division', fallback: 'Unassigned' },
  { key: 'email', header: 'Email', fallback: '-' },
];

function employeeLabel(person) {
  return person?.display_name || person?.email || person?.clerk_user_id || 'Unnamed user';
}

function employeeSearchText(person) {
  return [
    person.display_name,
    person.email,
    person.role,
    person.division,
  ].filter(Boolean).join(' ').toLowerCase();
}

function useEmployeeReferences({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    people: EMPTY_PEOPLE,
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
          .from('inventory_destination_users_view')
          .select('clerk_user_id, display_name, email, role, division')
          .order('display_name', { ascending: true, nullsFirst: false });

        if (error) throw error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            people: data ?? EMPTY_PEOPLE,
          });
        }
      } catch (error) {
        console.error('Employee references failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            people: EMPTY_PEOPLE,
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

export function EmployeesWorkspace({ permissions }) {
  const { user } = useUser();
  const directory = useEmployeeReferences({ enabled: permissions.permissionSource === 'server' });
  const [activeView, setActiveView] = useState('directory');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [search, setSearch] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);

  const people = directory.people;
  const divisions = [...new Set(people.map((person) => person.division).filter(Boolean))];
  const currentUserInDirectory = people.some((person) => person.clerk_user_id === permissions.userId);

  const employeeViews = [
    { key: 'directory', label: 'Employee Directory', icon: Users, description: 'Visible contact reference rows.', badge: people.length },
    { key: 'mine', label: 'My Information', icon: ShieldCheck, description: 'Current user row when visible.', badge: currentUserInDirectory ? 1 : 0 },
  ];

  const filteredPeople = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return people.filter((person) => {
      if (activeView === 'mine' && person.clerk_user_id !== permissions.userId) return false;
      if (!normalizedSearch) return true;
      return employeeSearchText(person).includes(normalizedSearch);
    });
  }, [activeView, people, permissions.userId, search]);

  const selectedEmployee = filteredPeople.find((person) => person.clerk_user_id === selectedEmployeeId)
    ?? people.find((person) => person.clerk_user_id === selectedEmployeeId)
    ?? null;

  useEffect(() => {
    if (activeView === 'mine') {
      setSelectedEmployeeId(permissions.userId ?? '');
    }
  }, [activeView, permissions.userId]);

  useEffect(() => {
    if (selectedEmployeeId && !people.some((person) => person.clerk_user_id === selectedEmployeeId)) {
      setSelectedEmployeeId('');
    }
  }, [people, selectedEmployeeId]);

  function selectEmployee(person) {
    setSelectedEmployeeId(person.clerk_user_id);
    setActiveTab('overview');
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Employees"
        description="Directory and profile foundation using the existing destination-user reference path. Role changes, permission editing, Clerk identity controls, and HR source-of-truth writes remain out of scope."
        status={<span className="status-pill">{people.length} visible contact{people.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button" onClick={directory.reload} disabled={directory.isLoading}>
              Refresh
            </button>
            <button type="button" className="primary-button" disabled>
              <Plus aria-hidden="true" /> Create employee
            </button>
          </>
        )}
      />

      <div className="summary-grid">
        <SummaryCard label="Visible contacts" value={people.length} detail={directory.isLoading ? 'Loading directory' : 'Reference rows'} />
        <SummaryCard label="Divisions" value={divisions.length} detail="Distinct visible divisions" />
        <SummaryCard label="Current user" value={currentUserInDirectory ? 'Visible' : 'Not visible'} detail="In reference view" tone={currentUserInDirectory ? 'good' : 'warn'} />
        <SummaryCard label="Manage employees" value={permissions.canManageEmployees ? 'Granted' : 'Not granted'} detail="No writes added here" tone={permissions.canManageEmployees ? 'good' : 'warn'} />
      </div>

      <div className={`workspace-split employees-workspace${isPrimaryCollapsed ? ' is-primary-collapsed' : ''}`}>
        <PrimarySidebar
          eyebrow="Employee Views"
          title="Employees"
          description="Directory browsing and current-user context."
          items={employeeViews}
          activeKey={activeView}
          onSelect={setActiveView}
          collapsed={isPrimaryCollapsed}
          onToggleCollapse={() => setIsPrimaryCollapsed((current) => !current)}
          mobileOpen={isPrimaryOpen}
          onCloseMobile={() => setIsPrimaryOpen(false)}
          footer={(
            <div className="module-sidebar-note">
              <strong>Protected boundary</strong>
              <p>No role, permission, Clerk identity, or HR source record editing is exposed.</p>
            </div>
          )}
        />

        <div className="workspace-surface">
          <article className="card workspace-card">
            <Toolbar
              eyebrow="Directory"
              title={employeeViews.find((item) => item.key === activeView)?.label ?? 'Employees'}
              description="Rows come from the existing authenticated user reference view."
              search={(
                <label>
                  <span className="sr-only">Search employees</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search employees..."
                  />
                </label>
              )}
            />

            <DataTable
              columns={EMPLOYEE_COLUMNS}
              rows={filteredPeople}
              getRowKey={(row) => row.clerk_user_id || row.email}
              permissions={permissions}
              isLoading={directory.isLoading}
              error={directory.error}
              onRowClick={selectEmployee}
              selectedRowKey={selectedEmployee?.clerk_user_id ?? null}
              dense
              minWidth="680px"
              emptyTitle={search ? 'No employees matched this search' : activeView === 'mine' ? 'My information is not available yet' : 'No employee rows are visible'}
              emptyDescription={search
                ? 'Try a different name, role, email, or division search.'
                : activeView === 'mine'
                  ? 'The current user is not present in the existing reference view yet, so this module shows the layout foundation without inventing profile data.'
                  : 'This workspace renders real employee directory rows when the existing read path has visible data.'}
            />
          </article>

          <article className="card workspace-card">
            {selectedEmployee ? (
              <>
                <RecordHeader
                  eyebrow="Selected Employee"
                  title={employeeLabel(selectedEmployee)}
                  description="Employee detail remains read-oriented in this phase. The shell is ready for richer sections later without implying account or permission editing."
                  meta={[
                    { label: 'Role', value: selectedEmployee.role || 'User' },
                    { label: 'Division', value: selectedEmployee.division || 'Unassigned' },
                  ]}
                />
                <WorkspaceTabs
                  tabs={EMPLOYEE_TABS}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  ariaLabel="Employee detail sections"
                />

                {activeTab === 'overview' ? (
                  <div className="module-fact-grid employees-fact-grid">
                    <SummaryCard label="Email" value={selectedEmployee.email || '-'} detail="Reference field" />
                    <SummaryCard label="Profile source" value="Reference view" detail="No source mutation" />
                    <SummaryCard label="Role source" value="Permissions row" detail="Display only" />
                  </div>
                ) : null}

                {activeTab === 'contact' ? (
                  <StatePanel
                    eyebrow="Contact"
                    title="Contact details"
                    description={`Email: ${selectedEmployee.email || 'Unavailable'}. Phone, supervisor, emergency contact, and credential fields remain hidden until an approved live source exists.`}
                    tone="info"
                  />
                ) : null}

                {activeTab === 'assignments' ? (
                  <StatePanel
                    eyebrow="Deferred"
                    title="Assignments are not wired yet"
                    description="Vehicle, tool, crew, direct-report, credential, and job assignment views need approved source paths before they render rows."
                    tone="neutral"
                  />
                ) : null}

                {activeTab === 'activity' ? (
                  <StatePanel
                    eyebrow="Deferred"
                    title="Employee activity is not implemented yet"
                    description="This tab is structurally reserved without inventing assignments, credentials, documents, or activity history."
                    tone="neutral"
                  />
                ) : null}
              </>
            ) : (
              <StatePanel
                eyebrow="No Selection"
                title="Select an employee to open the detail workspace"
                description={activeView === 'mine'
                  ? `Use the current-user row once it is available in the live reference view. Signed in as ${user?.primaryEmailAddress?.emailAddress ?? user?.id ?? 'current user'}.`
                  : 'The selected-employee header and tabs appear here when you choose a row from the directory.'}
                tone="neutral"
              />
            )}
          </article>

          <section className="employees-boundary-grid">
            <StatePanel
              eyebrow="Boundary"
              title="Create/Edit remains deferred"
              description="The Create Employee command is intentionally disabled. This pass does not add HR records, account creation, or profile editing."
              compact
            />
            <StatePanel
              eyebrow="Boundary"
              title="No role or permission editor"
              description="Roles and permission flags remain governed by the existing server-authoritative permission system and controlled Developer workflows."
              compact
            />
            <StatePanel
              eyebrow="Boundary"
              title="PII stays source-bound"
              description="Only fields exposed by the existing reference view are rendered. Additional personal fields require an approved source and visibility contract."
              compact
            />
          </section>
        </div>
      </div>
    </>
  );
}
