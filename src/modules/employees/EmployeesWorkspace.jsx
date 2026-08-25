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
const EMPTY_ASSIGNMENTS = Object.freeze([]);
const DEFAULT_EMPLOYEE_FORM = Object.freeze({
  displayName: '', email: '', role: 'User', division: '', jobTitle: '', phone: '', notes: '', reason: '', isSaving: false, error: null, success: '',
});

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
  { key: 'current_vehicle', header: 'Current Vehicle', fallback: 'Unassigned' },
  { key: 'email', header: 'Email', fallback: '-' },
];

const ASSIGNMENT_COLUMNS = [
  { key: 'vehicle_label', header: 'Vehicle', render: (row) => <strong>{row.vehicle_label}</strong> },
  { key: 'assigned_at', header: 'Assigned', render: (row) => formatDateTime(row.assigned_at) },
  { key: 'unassigned_at', header: 'Released', render: (row) => row.unassigned_at ? formatDateTime(row.unassigned_at) : 'Active' },
  { key: 'assigned_by_label', header: 'Assigned By', fallback: '-' },
  { key: 'note', header: 'Note', fallback: '-' },
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
    person.current_vehicle,
  ].filter(Boolean).join(' ').toLowerCase();
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function useEmployeeReferences({ enabled }) {
  const { getToken } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({
    isLoading: false,
    error: null,
    people: EMPTY_PEOPLE,
    assignments: EMPTY_ASSIGNMENTS,
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
        const [peopleResult, assignmentsResult] = await Promise.all([
          client
            .from('inventory_destination_users_view')
            .select('clerk_user_id, display_name, email, role, division')
            .order('display_name', { ascending: true, nullsFirst: false }),
          client.rpc('read_employee_vehicle_assignment_directory', {
            p_limit: 1000,
          }),
        ]);

        if (peopleResult.error) throw peopleResult.error;
        if (assignmentsResult.error) throw assignmentsResult.error;

        if (isMounted) {
          setState({
            isLoading: false,
            error: null,
            people: peopleResult.data ?? EMPTY_PEOPLE,
            assignments: assignmentsResult.data ?? EMPTY_ASSIGNMENTS,
          });
        }
      } catch (error) {
        console.error('Employee references failed to load', error);
        if (isMounted) {
          setState({
            isLoading: false,
            error,
            people: EMPTY_PEOPLE,
            assignments: EMPTY_ASSIGNMENTS,
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
  const { getToken } = useAuth();
  const canReadEmployees = permissions.permissionSource === 'server' && permissions.canManageEmployees === true;
  const directory = useEmployeeReferences({ enabled: canReadEmployees });
  const [activeView, setActiveView] = useState('directory');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [search, setSearch] = useState('');
  const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
  const [isPrimaryCollapsed, setIsPrimaryCollapsed] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(DEFAULT_EMPLOYEE_FORM);

  const assignments = directory.assignments;
  const currentAssignmentMap = useMemo(() => {
    const next = new Map();
    assignments
      .filter((assignment) => assignment.is_active)
      .forEach((assignment) => {
        if (!next.has(assignment.user_id)) next.set(assignment.user_id, assignment);
      });
    return next;
  }, [assignments]);

  const people = useMemo(() => directory.people.map((person) => {
    const activeAssignment = currentAssignmentMap.get(person.clerk_user_id);
    return {
      ...person,
      current_vehicle: activeAssignment?.vehicle_label ?? '',
      current_vehicle_assignment: activeAssignment ?? null,
    };
  }), [currentAssignmentMap, directory.people]);
  const divisions = [...new Set(people.map((person) => person.division).filter(Boolean))];
  const currentUserInDirectory = people.some((person) => person.clerk_user_id === permissions.userId);
  const activeAssignmentCount = assignments.filter((assignment) => assignment.is_active).length;

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
  const selectedEmployeeAssignments = selectedEmployee
    ? assignments.filter((assignment) => assignment.user_id === selectedEmployee.clerk_user_id)
    : EMPTY_ASSIGNMENTS;

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

  function setEmployeeField(field, value) {
    setEmployeeForm((current) => ({ ...current, [field]: value, error: null, success: '' }));
  }

  async function createEmployee(event) {
    event.preventDefault();
    if (employeeForm.isSaving) return;
    setEmployeeForm((current) => ({ ...current, isSaving: true, error: null, success: '' }));
    try {
      const token = await getToken({ template: 'supabase' });
      const client = createSupabaseClient(token);
      const { error } = await client.rpc('save_employee_profile', {
        p_email: employeeForm.email,
        p_display_name: employeeForm.displayName,
        p_role: employeeForm.role,
        p_division: employeeForm.division,
        p_job_title: employeeForm.jobTitle,
        p_phone: employeeForm.phone,
        p_notes: employeeForm.notes,
        p_reason: employeeForm.reason,
      });
      if (error) throw error;
      setEmployeeForm({ ...DEFAULT_EMPLOYEE_FORM, success: 'Employee profile saved. It will link automatically when this email first signs in through Clerk.' });
      directory.reload();
    } catch (error) {
      console.error('Employee profile save failed', error);
      setEmployeeForm((current) => ({ ...current, isSaving: false, error }));
    }
  }

  return (
    <>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Employees"
        description="Directory, pre-hire employee setup, and live vehicle assignment reads. A profile entered by email links automatically on the employee's first Clerk sign-in."
        status={<span className="status-pill">{people.length} visible contact{people.length === 1 ? '' : 's'}</span>}
        actions={(
          <>
            <button type="button" className="secondary-button workspace-toggle" onClick={() => setIsPrimaryOpen(true)}>
              Views
            </button>
            <button type="button" className="secondary-button" onClick={directory.reload} disabled={directory.isLoading}>
              Refresh
            </button>
            <button type="button" className="primary-button" onClick={() => setIsCreateOpen(true)} disabled={!canReadEmployees}>
              <Plus aria-hidden="true" /> Create employee
            </button>
          </>
        )}
      />

      {isCreateOpen ? (
        <form className="card workspace-card" onSubmit={createEmployee}>
          <Toolbar eyebrow="Employee Setup" title="Create employee profile" description="Create the internal profile first. It will connect to the Clerk account automatically when the employee signs in with this email address." />
          <div className="module-form-grid">
            <label>Name<input value={employeeForm.displayName} onChange={(event) => setEmployeeField('displayName', event.target.value)} disabled={employeeForm.isSaving} required /></label>
            <label>Email<input type="email" value={employeeForm.email} onChange={(event) => setEmployeeField('email', event.target.value)} disabled={employeeForm.isSaving} required /></label>
            <label>Role<select value={employeeForm.role} onChange={(event) => setEmployeeField('role', event.target.value)} disabled={employeeForm.isSaving}><option>User</option><option>Supervisor</option><option>Manager</option><option>Developer</option></select></label>
            <label>Division<select value={employeeForm.division} onChange={(event) => setEmployeeField('division', event.target.value)} disabled={employeeForm.isSaving}><option value="">Unassigned</option><option>Construction</option><option>Electrical</option><option>Admin</option></select></label>
            <label>Job title<input value={employeeForm.jobTitle} onChange={(event) => setEmployeeField('jobTitle', event.target.value)} disabled={employeeForm.isSaving} /></label>
            <label>Phone<input type="tel" value={employeeForm.phone} onChange={(event) => setEmployeeField('phone', event.target.value)} disabled={employeeForm.isSaving} /></label>
            <label>Reason for this profile<input value={employeeForm.reason} onChange={(event) => setEmployeeField('reason', event.target.value)} disabled={employeeForm.isSaving} required /></label>
            <label>Notes<input value={employeeForm.notes} onChange={(event) => setEmployeeField('notes', event.target.value)} disabled={employeeForm.isSaving} /></label>
          </div>
          <div className="record-actions"><button type="submit" className="primary-button" disabled={employeeForm.isSaving}>{employeeForm.isSaving ? 'Saving…' : 'Save employee profile'}</button><button type="button" className="secondary-button" onClick={() => { setIsCreateOpen(false); setEmployeeForm(DEFAULT_EMPLOYEE_FORM); }} disabled={employeeForm.isSaving}>Cancel</button></div>
          {employeeForm.error ? <StatePanel tone="danger" eyebrow="Create Failed" title="Employee profile was not saved" description={employeeForm.error.message || 'Unexpected employee profile error.'} compact /> : null}
          {employeeForm.success ? <StatePanel tone="success" eyebrow="Profile Saved" title="Ready for Clerk sign-in" description={employeeForm.success} compact /> : null}
        </form>
      ) : null}

      <div className="summary-grid">
        <SummaryCard label="Visible contacts" value={people.length} detail={directory.isLoading ? 'Loading directory' : 'Reference rows'} />
        <SummaryCard label="Active vehicle assignments" value={activeAssignmentCount} detail="Current assignment rows" />
        <SummaryCard label="Divisions" value={divisions.length} detail="Distinct visible divisions" />
        <SummaryCard label="Current user" value={currentUserInDirectory ? 'Visible' : 'Not visible'} detail="In reference view" tone={currentUserInDirectory ? 'good' : 'warn'} />
        <SummaryCard label="Manage employees" value={permissions.canManageEmployees ? 'Granted' : 'Not granted'} detail="Create/edit remains deferred" tone={permissions.canManageEmployees ? 'good' : 'warn'} />
        <SummaryCard label="Read scope" value={permissions.canViewAllDivisions ? 'All divisions' : permissions.division || 'None'} detail="Server level/division rules" tone={canReadEmployees ? 'good' : 'warn'} />
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
              description="Rows come from the limited employee reference view and live vehicle assignment reads, following level/division scope."
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
                    { label: 'Current Vehicle', value: selectedEmployee.current_vehicle || 'Unassigned' },
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
                    <SummaryCard label="Current Vehicle" value={selectedEmployee.current_vehicle || 'Unassigned'} detail="Active vehicle assignment" tone={selectedEmployee.current_vehicle ? 'good' : 'default'} />
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
                  <>
                    {selectedEmployee.current_vehicle_assignment ? (
                      <div className="module-fact-grid employees-fact-grid">
                        <SummaryCard label="Current Vehicle" value={selectedEmployee.current_vehicle_assignment.vehicle_label} detail="Active assignment row" tone="good" />
                        <SummaryCard label="Assigned" value={formatDateTime(selectedEmployee.current_vehicle_assignment.assigned_at)} detail="Assignment start" />
                        <SummaryCard label="Assigned By" value={selectedEmployee.current_vehicle_assignment.assigned_by_label || '-'} detail="Recorded actor" />
                      </div>
                    ) : (
                      <StatePanel
                        eyebrow="Assignments"
                        title="No active vehicle assignment"
                        description="This employee does not currently have an active vehicle assignment row."
                        tone="neutral"
                      />
                    )}
                    <DataTable
                      columns={ASSIGNMENT_COLUMNS}
                      rows={selectedEmployeeAssignments}
                      getRowKey={(row) => row.assignment_id}
                      permissions={permissions}
                      dense
                      minWidth="820px"
                      emptyTitle="No vehicle assignment history"
                      emptyDescription="Vehicle assignment rows will appear here once this employee is assigned or released."
                    />
                  </>
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
              title="Read scope is active"
              description="Directory rows come from Supabase and follow the current user's effective level/division visibility."
              compact
              incomplete={false}
            />
            <StatePanel
              eyebrow="Boundary"
              title="Create/Edit remains deferred"
              description="The Create Employee command is intentionally disabled. This pass does not add HR records, account creation, or profile editing."
              compact
            />
            <StatePanel
              eyebrow="Boundary"
              title="Vehicle assignments are read-only"
              description="Current vehicle and assignment history are live reads. Assignment create, release, and transfer controls stay with the vehicle write pass."
              compact
              incomplete={false}
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
